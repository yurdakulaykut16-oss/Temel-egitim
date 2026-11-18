// Büyük havuz görünümleri: arayüz havuzun tamamını 5 saniyede bir indirmez.
//  - /status.poolRevision havuz değiştikçe değişir, değişmedikçe aynı kalır
//  - /questions?status=…&limit=N yalnızca o listedeki en yeni N kaydı verir
//  - /questions?fields=quiz yalnızca onaylı soruların Test merkezi alanlarını verir;
//    revision aynıysa liste yeniden gönderilmez
//  - varsayılan plan 4 tur × 50 = bölüm başına 200, toplam 5.800 sorudur ve havuz sınırına sığar
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = server => new Promise(r => server.close(r));
const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));

function seed(count) {
 const items = [];
 for (let i = 0; i < count; i++) {
  const answer = `${i} numaralı ölçüt doğru tanımdır`;
  const fourOption = i % 2 === 0;
  const options = [answer, `${i} numaralı durumda pasif dinlenme`, `${i} numaralı durumda tahkim kararı`, `${i} numaralı durumda sponsorluk`];
  if (!fourOption) options.push(`${i} numaralı durumda bürokrasi`);
  items.push({
   id: `seed-${i}`, unitId: contexts[i % contexts.length].id, book: 'Kitap', unit: 'Ünite',
   status: i % 10 === 9 ? 'rejected' : 'approved', difficulty: ['kolay', 'orta', 'zor'][i % 3],
   question: `Kayıt ${i} için hangi seçenek ${i} numaralı ölçütü doğru verir?`, options, answer,
   explanation: 'Açıklama metni yeterince uzundur ve doğru cevabı gerekçelendirir.',
   evidence: 'Egzersiz planlı ve tekrarlıdır', topic: `Konu ${i}`, model: 'fake:1',
   verification: { judges: [{ model: 'fake:1', reason: 'Uzun hakem gerekçesi '.repeat(20) }, { model: 'fake:1', reason: 'İkinci hakem gerekçesi '.repeat(20) }] },
   createdAt: new Date(Date.now() - (count - i) * 1000).toISOString()
  });
 }
 return items;
}

test('büyük havuz görünümleri: sürüm numarası, son N kayıt, sade test listesi ve 5.800 soruluk varsayılan plan', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-poolviews-'));
 const saved = {};
 const env = { TEMPO_DATA_DIR: dir, TEMPO_DISABLE_AUTOLOOP: '1', TEMPO_QUIET: '1', TEMPO_OFFLINE_ONLY: '1', OLLAMA_MODEL: 'fake:1', OLLAMA_VERIFIER_MODEL: 'fake:1', OLLAMA_JUDGE2_MODEL: 'fake:1' };
 for (const key of ['TEMPO_POOL_CAPACITY', 'TEMPO_PLAN_PASSES', 'TEMPO_PLAN_QUOTA', 'TEMPO_PLAN']) { saved[key] = process.env[key]; delete process.env[key]; }

 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let raw = '';
  for await (const ch of req) raw += ch;
  const prompt = JSON.parse(raw || '{}').prompt || '';
  const textMatch = prompt.match(/KONU ANLATIMI:\s*([\s\S]*)$/);
  const evidence = (textMatch ? textMatch[1] : '').trim().split(/\s+/).slice(0, 8).join(' ') || 'Egzersiz planlı ve tekrarlıdır';
  const result = prompt.includes('soru denetçisisin')
   ? { answer: 'Egzersiz planlıdır', singleCorrect: true, dualAnswerRisk: false, secondBestOption: '', supported: true, qualityOk: true, qualityScore: 4.8, examPotential: 4.8, difficulty: 'kolay', bloomLevel: 'Kavrama', evidence, reason: 'Kanıt pasajda doğrudan geçiyor.' }
   : { question: 'Egzersiz ile fiziksel aktivite ayrımında hangi tanım doğrudur?', options: ['Egzersiz planlıdır', 'Aktivite yalnızca uykudur', 'Egzersiz plansızdır', 'İkisi aynıdır'], answer: 'Egzersiz planlıdır', explanation: 'Egzersiz planlı, programlı ve tekrarlı bir hareket biçimidir; fiziksel aktivite ise daha geniştir.', evidence, topic: 'Temel kavramlar' };
  res.end(JSON.stringify({ response: JSON.stringify(result), eval_count: 120, eval_duration: 200_000_000 }));
 });
 env.OLLAMA_BASE_URL = `http://127.0.0.1:${await listen(fake)}`;
 for (const [key, value] of Object.entries(env)) { saved[key] = process.env[key]; process.env[key] = value; }

 const SEED = 400;
 writeFileSync(join(dir, 'questions.json'), JSON.stringify(seed(SEED)));
 const approvedSeed = seed(SEED).filter(x => x.status === 'approved').length;

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?poolviews=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const base = `http://127.0.0.1:${await listen(app)}`;
 const get = async path => { const r = await fetch(`${base}/api/ollama${path}`); return { status: r.status, text: await r.text() }; };
 const json = async path => JSON.parse((await get(path)).text);

 try {
  // Varsayılan plan: 4 tur × 50 soru = bölüm başına 200; havuz sınırı planı kısmıyor.
  const status = await json('/status');
  assert.equal(status.questionCapacity, 65000);
  assert.equal(status.plan.quota, 50);
  assert.equal(status.plan.passCount, 4);
  assert.equal(status.plan.perUnitTarget, 200);
  assert.equal(status.plan.totalTarget, contexts.length * 200);
  assert.equal(status.plan.totalTarget, 5800);
  assert.ok(status.plan.totalTarget <= status.questionCapacity * 0.95, 'plan toplamı havuz sınırının %95\'ine sığmalı');
  // 4 ve 5 şıklı kayıtlar birlikte sayılır.
  assert.equal(status.approved, approvedSeed);
  assert.deepEqual(status.optionFormat.allowed, [4, 5]);
  assert.ok(status.optionFormat.fourOption > 0 && status.optionFormat.fiveOption > 0);
  assert.equal(status.plan.totalDone, approvedSeed, '4 şıklı sorular da plana sayılır');

  // Sürüm numarası: havuz değişmedikçe aynı.
  assert.equal(typeof status.poolRevision, 'string');
  assert.equal((await json('/status')).poolRevision, status.poolRevision);

  // Tam liste eskisi gibi çalışır ve sürümü de taşır.
  const full = await get('/questions');
  const fullBody = JSON.parse(full.text);
  assert.equal(fullBody.items.length, SEED);
  assert.equal(fullBody.revision, status.poolRevision);

  // Son N kayıt: o sekmenin EN YENİ kayıtları, toplam sayı ayrıca verilir.
  const latest = await get('/questions?status=approved&limit=60');
  const latestBody = JSON.parse(latest.text);
  assert.equal(latestBody.items.length, 60);
  assert.equal(latestBody.total, approvedSeed);
  assert.ok(latestBody.items.every(x => x.status === 'approved'));
  assert.equal(latestBody.items.at(-1).id, fullBody.items.filter(x => x.status === 'approved').at(-1).id);
  assert.ok(latest.text.length < full.text.length / 4, 'kart listesi tam havuzdan çok daha küçük olmalı');
  const rejected = await json('/questions?status=rejected&limit=5');
  assert.equal(rejected.items.length, 5);
  assert.equal(rejected.total, SEED - approvedSeed);
  assert.ok(rejected.items.every(x => x.status === 'rejected'));

  // Sade test listesi: yalnızca onaylılar, hakem raporu yok, şıklar ve cevap duruyor.
  const quiz = await get('/questions?fields=quiz');
  const quizBody = JSON.parse(quiz.text);
  assert.equal(quizBody.items.length, approvedSeed);
  assert.equal(quizBody.revision, status.poolRevision);
  assert.ok(quizBody.items.every(x => x.status === 'approved' && !('verification' in x) && !('evidence' in x)));
  assert.ok(quizBody.items.every(x => x.question && x.answer && x.unitId && x.options.includes(x.answer) && [4, 5].includes(x.options.length)));
  assert.ok(quiz.text.length < full.text.length * 0.6, 'sade liste tam havuzdan belirgin biçimde küçük olmalı');

  // Sürüm aynıysa liste yeniden gönderilmez.
  const same = await json(`/questions?fields=quiz&revision=${encodeURIComponent(status.poolRevision)}`);
  assert.deepEqual(same, { revision: status.poolRevision, unchanged: true });
  assert.ok(Array.isArray((await json('/questions?fields=quiz&revision=eski')).items), 'eski sürüm numarası listeyi getirir');

  // Denetim özeti havuz değişmeden iki kez aynı döner.
  const audit1 = await json('/audit');
  assert.deepEqual(await json('/audit'), audit1);

  // Yeni soru (4 şıklı) onaylanır → sürüm değişir, liste ve denetim yenilenir.
  const gen = await fetch(`${base}/api/ollama/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ units: ['0-0'] }) });
  const genBody = await gen.json();
  assert.equal(gen.status, 200, JSON.stringify(genBody));
  assert.equal(genBody.item.status, 'approved');
  assert.equal(genBody.item.options.length, 4, '4 şıklı taslak olduğu gibi kabul edilir');
  const after = await json('/status');
  assert.notEqual(after.poolRevision, status.poolRevision, 'havuz değişince sürüm değişmeli');
  assert.equal(after.approved, approvedSeed + 1);
  const changed = await json(`/questions?fields=quiz&revision=${encodeURIComponent(status.poolRevision)}`);
  assert.equal(changed.revision, after.poolRevision);
  assert.equal(changed.items.length, approvedSeed + 1);
  assert.ok(changed.items.some(x => x.id === genBody.item.id));
  assert.equal((await json('/questions?status=approved&limit=1')).items[0].id, genBody.item.id, 'en yeni kayıt listenin sonundadır');
  assert.equal((await json('/audit')).checked, audit1.checked + 1);
 } finally {
  stopOllamaLoops?.();
  app.closeAllConnections?.();
  fake.closeAllConnections?.();
  await close(app);
  await close(fake);
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await rm(dir, { recursive: true, force: true });
 }
});
