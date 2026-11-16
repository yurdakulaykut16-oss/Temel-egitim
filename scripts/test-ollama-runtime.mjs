// Soru hattının altyapı katmanı için birim testleri:
//  - ollama-client: sabit num_ctx, keep_alive, akış, zaman aşımı türleri, şema/think geri düşüşü
//  - model-lineup: kurulu modellerden otomatik kadro (VRAM'e birlikte sığma, kod/embedding ayıklama)
//  - draft-repair: model çağrısı yapmadan biçim onarımı (içerik değişmez)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOllamaClient, OllamaError, isTimeoutKind} from '../server/ollama-client.mjs';
import {planLineup, classifyModel} from '../server/model-lineup.mjs';
import {normalizeDraft, normalizeVerdict, resolveOptionAnswer, repairEvidence} from '../server/draft-repair.mjs';
import {createFakeOllama} from './fake-ollama-sim.mjs';

const GB = 1024 ** 3;
const model = (name, gb, parameterSize, family) => ({ name, size: Math.round(gb * GB), details: { parameter_size: parameterSize, family } });

test('ollama-client: model bir kez yüklenir, num_ctx sabit, keep_alive > 0, akışlı çağrı', async () => {
 const sim = createFakeOllama({ loadMs: 1600, genMs: 60, judgeMs: 30 });
 const port = await sim.listen();
 try {
  const client = createOllamaClient({ base: `http://127.0.0.1:${port}`, keepAlive: '30m', numCtx: 4096 });
  const prompts = [
   'Kısa istek. KONU ANLATIMI: Antrenman planlı ve tekrarlı bir süreçtir.',
   `Çok daha uzun bir istek ${'x'.repeat(4000)} KONU ANLATIMI: Antrenman planlı ve tekrarlı bir süreçtir.`
  ];
  for (const prompt of prompts) {
   const r = await client.generate({ model: 'qwen3:8b', prompt, numPredict: 300 });
   assert.equal(typeof r.parsed, 'object');
   assert.ok(Array.isArray(r.parsed.options) && r.parsed.options.length === 5);
   assert.ok(r.metrics.evalTokens > 0);
  }
  assert.equal(sim.stats.loadsByModel['qwen3:8b'], 1, 'prompt uzunluğu değişse de model yeniden yüklenmemeli');
  assert.deepEqual([...new Set(sim.stats.requests.map(r => r.options.num_ctx))], [4096]);
  assert.ok(sim.stats.requests.every(r => r.keep_alive === '30m'));
  assert.ok(sim.stats.requests.every(r => r.stream === true));
  assert.ok(sim.stats.requests.every(r => r.options.num_gpu === undefined && r.options.num_batch === undefined), 'yeniden yükleme tetikleyen çalıştırıcı seçenekleri gönderilmemeli');
  assert.equal(client.snapshot().perModel['qwen3:8b'].loads, 1);
 } finally { await sim.close(); }
});

test('ollama-client: eski Ollama (şema ve think desteklenmiyor) ile de çalışır', async () => {
 const sim = createFakeOllama({ loadMs: 20, genMs: 30, supportsSchema: false, supportsThink: false });
 const port = await sim.listen();
 try {
  const client = createOllamaClient({ base: `http://127.0.0.1:${port}` });
  const schema = { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] };
  const r = await client.generate({ model: 'qwen3:8b', prompt: 'KONU ANLATIMI: Kuvvet antrenmanı kas kütlesini artırır.', schema });
  assert.equal(typeof r.parsed.question, 'string');
  const before = sim.stats.schemaRejected + sim.stats.thinkRejected;
  await client.generate({ model: 'qwen3:8b', prompt: 'KONU ANLATIMI: Kuvvet antrenmanı kas kütlesini artırır.', schema });
  assert.equal(sim.stats.schemaRejected + sim.stats.thinkRejected, before, 'desteklenmeyen parametre ikinci çağrıda yeniden denenmemeli');
 } finally { await sim.close(); }
});

test('ollama-client: takılan model, kurulu olmayan model ve kapalı sunucu ayrı hata türleriyle bildirilir', async () => {
 const sim = createFakeOllama({ loadMs: 10, stall: new Set(['gemma3:4b']) });
 const port = await sim.listen();
 try {
  const client = createOllamaClient({ base: `http://127.0.0.1:${port}` });
  await assert.rejects(
   client.generate({ model: 'gemma3:4b', prompt: 'x', firstTokenTimeoutMs: 400, totalTimeoutMs: 5000 }),
   e => e instanceof OllamaError && e.kind === 'timeout_first_token' && isTimeoutKind(e.kind) && e.model === 'gemma3:4b'
  );
  await assert.rejects(
   client.generate({ model: 'yok:1b', prompt: 'x' }),
   e => e instanceof OllamaError && e.kind === 'model_missing'
  );
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 150);
  await assert.rejects(
   client.generate({ model: 'gemma3:4b', prompt: 'x', signal: ac.signal, firstTokenTimeoutMs: 5000 }),
   e => e instanceof OllamaError && e.kind === 'aborted'
  );
 } finally { await sim.close(); }
 const dead = createOllamaClient({ base: 'http://127.0.0.1:9' });
 await assert.rejects(dead.generate({ model: 'qwen3:8b', prompt: 'x' }), e => e instanceof OllamaError && e.kind === 'connection');
});

test('model-lineup: 12 GB kartta üretici + farklı aileden hakem birlikte VRAM\'e sığacak şekilde seçilir', () => {
 const installed = [
  model('qwen3:8b', 5.2, '8.2B', 'qwen3'), model('gemma3:4b', 3.3, '4.3B', 'gemma3'),
  model('qwen2.5-coder:3b', 1.9, '3.1B', 'qwen2'), model('tempo-hakem:latest', 5.2, '8.2B', 'qwen3'),
  model('nomic-embed-text:latest', 0.27, '137M', 'nomic-bert'), model('deepseek-r1:14b', 9, '14.8B', 'qwen2'),
  model('gemma3:12b', 8.1, '12.2B', 'gemma3'), model('phi4:14b', 9.1, '14.7B', 'phi3')
 ];
 for (const profile of ['hizli', 'dengeli']) {
  const plan = planLineup(installed, { vramGb: 12, numCtx: 4096, profile });
  assert.equal(plan.ok, true);
  assert.equal(plan.model, 'qwen3:8b', profile);
  assert.equal(plan.verifierModel, 'qwen3:8b', '1. hakem üreticiyle aynı model: takas yok');
  assert.equal(plan.judge2Model, 'gemma3:4b', profile);
  assert.equal(plan.coResident, true);
  assert.equal(plan.crossFamilyJudge, true);
  assert.ok(plan.estimatedVramGb <= 11);
 }
 // Kalite profili daha büyük üreticiye çıkabilir ama asla iki dev modeli takas ettirmez.
 const kalite = planLineup(installed, { vramGb: 12, numCtx: 4096, profile: 'kalite' });
 assert.equal(kalite.model, 'gemma3:12b');
 assert.equal(kalite.judge2Model, 'qwen3:8b');
 // Kod / embedding / yalnız-muhakeme modelleri soru yazımında kullanılmaz.
 for (const name of ['qwen2.5-coder:3b', 'nomic-embed-text:latest', 'deepseek-r1:14b']) {
  assert.equal(classifyModel(installed.find(m => m.name === name)).suitable, false, name);
 }
});

test('model-lineup: tek model, sığmayan ikili, sabitleme ve boş liste', () => {
 const one = planLineup([model('qwen3:8b', 5.2, '8.2B', 'qwen3')], { vramGb: 12, numCtx: 4096 });
 assert.deepEqual([one.model, one.verifierModel, one.judge2Model], ['qwen3:8b', 'qwen3:8b', 'qwen3:8b']);
 assert.ok(one.warnings.some(w => /tek bir uygun model/.test(w)));

 // 12 GB'ta 14B + 4B birlikte sığmaz: küçük modeli üretici yapıp dev modeli hakem yapmak yerine
 // tek güçlü modelle devam edilir (takas yok) ve kullanıcı uyarılır.
 const big = planLineup([model('qwen3:14b', 9.3, '14.8B', 'qwen3'), model('gemma3:4b', 3.3, '4.3B', 'gemma3')], { vramGb: 12, numCtx: 4096 });
 assert.equal(big.model, 'qwen3:14b');
 assert.equal(big.judge2Model, 'qwen3:14b');
 assert.equal(big.coResident, true);
 assert.ok(big.warnings.length >= 1);

 // 8 GB'ta 14B hiç sığmaz: kullanılmaz.
 const small = planLineup([model('qwen3:14b', 9.3, '14.8B', 'qwen3'), model('gemma3:4b', 3.3, '4.3B', 'gemma3')], { vramGb: 8, numCtx: 4096 });
 assert.equal(small.model, 'gemma3:4b');

 // Elle sabitlenen roller korunur.
 const pinned = planLineup([model('qwen3:8b', 5.2, '8.2B', 'qwen3'), model('gemma3:4b', 3.3, '4.3B', 'gemma3')], { vramGb: 12, numCtx: 4096, pinned: { model: 'gemma3:4b', judge2Model: 'qwen3:8b' } });
 assert.equal(pinned.model, 'gemma3:4b');
 assert.equal(pinned.judge2Model, 'qwen3:8b');
 assert.equal(pinned.pinned.model, true);

 const none = planLineup([], { vramGb: 12 });
 assert.equal(none.ok, false);
});

test('draft-repair: biçim hataları onarılır, içerik değişmez', () => {
 const source = 'Antrenman, sportif verimi geliştirmek amacıyla planlı ve tekrarlı olarak uygulanan yüklenmeler bütünüdür. Dinlenme, uyumun gerçekleştiği evredir.';
 const raw = {
  question: 'Antrenmanın temel özelliği aşağıdakilerden hangisidir?',
  options: ['A) Planlı ve tekrarlı olması', 'B) Rastgele uygulanması', 'C) Tek seferlik olması', 'D) Yalnızca yarışmada yapılması'],
  answer: 'A',
  explanation: 'Tanımda planlı ve tekrarlı olduğu belirtilir.',
  evidence: '"Antrenman, sportif verimi geliştirmek amacıyla planlı ve tekrarlı olarak uygulanan yüklenmeler"',
  topic: 'Antrenmanın tanımı'
 };
 const { draft, fixes } = normalizeDraft(raw, source);
 assert.deepEqual(draft.options, ['Planlı ve tekrarlı olması', 'Rastgele uygulanması', 'Tek seferlik olması', 'Yalnızca yarışmada yapılması']);
 assert.equal(draft.answer, 'Planlı ve tekrarlı olması');
 assert.ok(source.includes(draft.evidence), 'kanıt kaynaktaki birebir cümleye sabitlenmeli');
 assert.ok(fixes.length >= 2);
 assert.equal(draft.question, raw.question, 'soru kökü değiştirilmemeli');

 // Temiz taslak hiç değişmez.
 const clean = { ...draft };
 const again = normalizeDraft(clean, source);
 assert.deepEqual(again.draft, clean);
 assert.equal(again.fixes.length, 0);

 // Kaynakta karşılığı olmayan kanıt UYDURULMAZ (içerik kapısı reddetmeye devam eder).
 assert.equal(repairEvidence('Kreatin fosfat sistemi on saniyede tükenir ve laktat birikir', source), null);

 assert.equal(resolveOptionAnswer('C)', draft.options), 'Tek seferlik olması');
 assert.equal(resolveOptionAnswer(2, draft.options), 'Rastgele uygulanması');
 assert.equal(resolveOptionAnswer('E', draft.options), null);

 const verdict = normalizeVerdict({
  answer: 'A', singleCorrect: 'true', dualAnswerRisk: 'false', supported: 'evet', qualityOk: true,
  distractorPlausible: 'true', qualityScore: '4', difficulty: 'Kolay', reason: 'Tanım açık.', evidence: source.slice(0, 60)
 }, draft.options, source);
 assert.equal(verdict.answer, 'Planlı ve tekrarlı olması');
 assert.equal(verdict.singleCorrect, true);
 assert.equal(verdict.dualAnswerRisk, false);
 assert.equal(verdict.difficulty, 'kolay');
 assert.equal(verdict.qualityScore, 4);
});
