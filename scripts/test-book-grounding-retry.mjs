import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildParallel, buildParallelPool } from '../server/book-parallel-engine.mjs';
import { loadSummaryGrounding } from '../server/summary-grounding.mjs';

const listen = server => new Promise(res => server.listen(0, '127.0.0.1', () => res(server.address().port)));
const norm = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const read = p => JSON.parse(readFileSync(resolve(process.cwd(), p), 'utf8'));

const bookD = read('server/book-style-questions.json');
const bookQuestions = bookD.questions;
const parallelD = read('server/book-parallel-questions.json');
const parallelQuestions = parallelD.questions;
const bank = read('server/question-bank.json');

test('Kitabın kendi "Neler Öğrendik?" sorularının tamamı çıkarıldı', () => {
 assert.equal(bookD.unitsCovered, 29, `29 ünitenin tamamı kapsanmalı, gelen: ${bookD.unitsCovered}`);
 assert.equal(bookQuestions.length, 290, `Her üniteden 10 soru -> 290 beklenir, gelen: ${bookQuestions.length}`);
 const perUnit = new Map();
 for (const q of bookQuestions) perUnit.set(q.unitId, (perUnit.get(q.unitId) || 0) + 1);
 assert.equal(perUnit.size, 29);
 for (const [uid, n] of perUnit) assert.equal(n, 10, `${uid} ünitesinden 10 soru beklenir, gelen: ${n}`);
 for (const q of bookQuestions) {
  assert.ok(Array.isArray(q.options) && q.options.length === 4, `${q.id}: 4 seçenek olmalı`);
  assert.equal(new Set(q.options.map(norm)).size, 4, `${q.id}: seçenekler tekrarlı`);
  assert.ok(q.options.includes(q.answer), `${q.id}: doğru cevap seçeneklerde yok`);
  assert.ok(q.question.length >= 12, `${q.id}: soru kökü çok kısa`);
  assert.ok(/^[A-E]$/.test(q.answerLetter), `${q.id}: cevap harfi A-E olmalı`);
 }
});

test('Kitap paraleli sorular: aynı bilgi, farklı lafız — asla kopya değil', () => {
 assert.ok(parallelQuestions.length >= 240, `En az 240 paralel üretilmeli, gelen: ${parallelQuestions.length}`);
 const bookById = new Map(bookQuestions.map(q => [q.id, q]));
 const bookStems = new Set(bookQuestions.map(q => norm(q.question)));
 const seen = new Set();
 for (const p of parallelQuestions) {
  const seed = bookById.get(p.sourceQuestionId);
  assert.ok(seed, `${p.id}: kaynak kitap sorusu bulunamadı`);
  // 1) Aynı bilgiyi ölçer: doğru cevap ve çeldiriciler korunur
  assert.equal(norm(p.answer), norm(seed.answer), `${p.id}: doğru cevap kaynak sorudan farklı`);
  for (const o of p.options) {
   assert.ok(seed.options.some(x => norm(x) === norm(o)), `${p.id}: kaynakta olmayan seçenek uydurulmuş`);
  }
  assert.equal(new Set(p.options.map(norm)).size, 4, `${p.id}: seçenekler tekrarlı`);
  assert.equal(/undefined|NaN|\[object/.test(p.question + p.answer + p.options.join(' ')), false, `${p.id}: bozuk metin`);
  // Soru işaretiyle biter; boşluk doldurma kalıbıysa ("... denir.") nokta kabul edilir.
  assert.ok(/[?.]$/.test(p.question.trim()), `${p.id}: soru kökü soru işaretiyle bitmeli`);
  // 2) Kopya değil: kök birebir aynı olamaz, kitap köküyle de çakışamaz
  assert.notEqual(norm(p.question), norm(seed.question), `${p.id}: kök değişmemiş (kopya!)`);
  assert.equal(bookStems.has(norm(p.question)), false, `${p.id}: bir kitap sorusuyla birebir aynı`);
  assert.equal(seen.has(norm(p.question)), false, `${p.id}: paralel havuzunda tekrar`);
  seen.add(norm(p.question));
  assert.ok(p.seedSimilarity <= 0.92, `${p.id}: kaynak soruya benzerlik çok yüksek (${p.seedSimilarity})`);
  assert.ok(p.seedSimilarity >= 0.30, `${p.id}: kaynak sorudan fazla uzaklaşılmış (${p.seedSimilarity})`);
  // 3) Şık sırası kaynak sorudan farklı olmalı (konum ezberi bozulsun)
  assert.notEqual(
   p.options.map(norm).join('|'),
   seed.options.map(norm).join('|'),
   `${p.id}: seçenek sırası kaynakla aynı`
  );
 }
});

test('Paralel motor deterministiktir ve geçersiz girdide null döner', () => {
 const seed = bookQuestions[0];
 const a = buildParallel(seed);
 const b = buildParallel(seed);
 assert.deepEqual(a, b, 'Aynı kitap sorusu her zaman aynı paralel soruyu üretmeli');
 assert.equal(buildParallel(null), null);
 assert.equal(buildParallel({ ...seed, options: [seed.answer] }), null);
});

test('Kaynak temellendirme: özet/kitap dışındaki soru elenir, kaynaklı soru geçer', async () => {
 const g = await loadSummaryGrounding();
 // 1) Alakasız / uydurma sorular elenir
 const controls = [
  { unitId: '0-0', question: 'Kuantum dolanıklık kuramına göre süperpozisyon hâli hangi kavramla açıklanır?', answer: 'Durum vektörünün çakışması' },
  { unitId: '1-0', question: 'Osmanlı Devleti hangi antlaşmayla Balkanlardaki hâkimiyetini kaybetmiştir?', answer: 'Bükreş Antlaşması' },
  { unitId: '2-0', question: 'Python programlama dilinde sözlük veri yapısı hangi anahtarla tanımlanır?', answer: 'Dict nesnesi' },
  { unitId: '3-0', question: 'Fotosentez olayı hücrenin hangi organelinde glikoz üretimiyle sonuçlanır?', answer: 'Kloroplast' },
  { unitId: '4-0', question: 'Mars gezegenindeki yer çekimi ivmesi hangi değere yaklaşık olarak eşittir?', answer: 'Saniye karede metre' }
 ];
 for (const c of controls) {
  const res = g.evaluate({ ...c, options: [c.answer, 'Birinci seçenek', 'İkinci seçenek', 'Üçüncü seçenek'] });
  assert.equal(res.ok, false, `Uydurma soru elenmeli: ${c.question}`);
  assert.match(res.reason, /konu anlatım|kitap pasaj/i);
 }
 // 2) Havuzdaki gerçek soruların ezici çoğunluğu kaynakta karşılığı olan sorular
 for (const [name, list] of [['banka', bank], ['kitap', bookQuestions], ['paralel', parallelQuestions]]) {
  const scores = list.map(q => g.scoreItem(q)).filter(Boolean).map(x => x.score);
  const inSource = scores.filter(v => v >= g.minScore).length;
  const ratio = inSource / scores.length;
  assert.ok(ratio >= 0.97, `${name} havuzunun en az %97'si kaynakta olmalı, gelen: %${Math.round(ratio * 100)}`);
 }
 // 3) annotate() alanı doğru yazıyor
 const annotated = g.annotate([{ unitId: '0-0', question: 'Antrenman planlı ve tekrarlı bir süreçtir; hangi kavram tanımlanmıştır?', answer: 'Antrenman' }]);
 assert.equal(annotated[0].grounding.inSource, true);
 assert.ok(annotated[0].grounding.score >= g.minScore);
});

test('Üretim hattı: kaynak dışı (uydurma) taslak reddedilir, kaynaklı taslak onaylanır', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-grounding-'));
 const prevData = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 writeFileSync(join(dir, 'questions.json'), '[]');

 let mode = 'hallucinated';
 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const data = JSON.parse(raw || '{}');
  const prompt = data.prompt || '';
  const evidence = 'Antrenman planlı ve tekrarlı bir süreçtir';
  if (prompt.includes('soru denetçisisin')) {
   const m = prompt.match(/SEÇENEKLER: ([\s\S]*)$/);
   const options = m ? JSON.parse(m[1]) : [];
   return res.end(JSON.stringify({ response: JSON.stringify({ answer: options[0], singleCorrect: true, dualAnswerRisk: false, secondBestOption: '', supported: true, qualityOk: true, qualityScore: 4.8, examPotential: 4.8, distractorPlausible: true, difficulty: 'kolay', bloomLevel: 'Kavrama', evidence, reason: 'Anlatım bu bilgiyi doğrudan destekliyor.' }) }));
  }
  const drafts = {
   hallucinated: {
    question: 'Kuantum dolanıklık kuramında süperpozisyon hâli hangi kavramla açıklanır?',
    options: ['Durum vektörünün çakışması', 'Gözlemcinin kesin ölçümü', 'Klasik kesin yörünge', 'Belirlenmiş tekil sonuç'],
    answer: 'Durum vektörünün çakışması'
   },
   grounded: {
    question: 'Sürantrenman riskini artıran temel yüklenme hatası aşağıdakilerden hangisidir?',
    options: ['Yetersiz toparlanmayla yükü sürekli artırmak', 'Haftalık hacmi kademeli ve düzenli artırmak', 'Sezon içi dinlenme günlerini planlamak', 'Bireysel yanıta göre şiddeti ayarlamak'],
    answer: 'Yetersiz toparlanmayla yükü sürekli artırmak'
   }
  };
  const draft = drafts[mode] || drafts.grounded;
  return res.end(JSON.stringify({ response: JSON.stringify({ ...draft, explanation: 'Konu anlatımında bu bilgi doğrudan geçer.', evidence, topic: 'Egzersiz ve yüklenme', questionType: 'kavram', questionAngle: 'dogrudan_tanim', bloomLevel: 'Kavrama' }) }));
 });
 await listen(fake);
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
 process.env.OLLAMA_MODEL = 'fake:1';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?grounding=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 await listen(app);
 const origin = `http://127.0.0.1:${app.address().port}`;
 const base = `${origin}/api/ollama`;
 const headers = { 'Content-Type': 'application/json', Origin: origin };
 const generate = () => fetch(`${base}/generate`, { method: 'POST', headers, body: JSON.stringify({ units: ['0-0'] }) });

 try {
  mode = 'hallucinated';
  const badRes = await generate();
  const badJson = await badRes.json();
  assert.equal(badRes.status, 502, JSON.stringify(badJson));
  assert.match(badJson.error || '', /konu anlatım|kitap pasaj|kaynak/i, `Beklenen gerekçe gelmedi: ${badJson.error}`);

  mode = 'grounded';
  const okRes = await generate();
  const okJson = await okRes.json();
  assert.equal(okRes.status, 200, JSON.stringify(okJson));
  assert.equal(okJson.item.status, 'approved');
  assert.ok(okJson.item.grounding, 'Onaylanan soruda grounding alanı olmalı');
  assert.equal(okJson.item.grounding.inSource, true);

  // Paralel havuzu API'den servis ediliyor
  const parRes = await fetch(`${base}/book-parallels?unitId=0-0`);
  const parJson = await parRes.json();
  assert.equal(parRes.status, 200);
  assert.ok(parJson.questions.length >= 7, `0-0 için en az 7 paralel beklenir, gelen: ${parJson.questions.length}`);
  assert.ok(parJson.questions.every(q => q.unitId === '0-0'));
 } finally {
  stopOllamaLoops?.();
  app.closeAllConnections?.();
  fake.closeAllConnections?.();
  await new Promise(r => app.close(r));
  await new Promise(r => fake.close(r));
  if (prevData === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevData;
  if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevBase;
  delete process.env.TEMPO_DISABLE_AUTOLOOP;
  rmSync(dir, { recursive: true, force: true });
 }
});

test('Yanlış yapılan soru değiştirilerek yeniden sorulur (hata defteri varyantı)', async () => {
 const outDir = mkdtempSync(join(tmpdir(), 'tempo-variant-'));
 const outFile = join(outDir, 'qv.mjs');
 execFileSync('node_modules/.bin/esbuild', [
  'src/questionVariants.ts', '--bundle', '--platform=node', '--format=esm', '--log-level=error', `--outfile=${outFile}`
 ], { stdio: 'pipe' });
 const { buildRetryVariant, buildRetryVariants } = await import(`file://${outFile}`);

 const base = {
  question: 'Aşağıdakilerden hangisi antrenmanın temel ilkelerinden biri değildir?',
  answer: 'Rastgele yüklenme',
  options: ['Rastgele yüklenme', 'Bireyselleştirme', 'Süreklilik', 'Kademeli artış']
 };
 const v1 = buildRetryVariant(base, '0-0::soru-1', 1);
 assert.ok(v1, 'Varyant üretilmeli');
 assert.equal(v1.answer, base.answer, 'Doğru cevap korunmalı');
 assert.notEqual(norm(v1.question), norm(base.question), 'Soru kökü değişmeli');
 assert.equal(v1.wrong.length, 3, '3 çeldirici kalmalı');
 assert.ok(!v1.wrong.includes(base.answer), 'Doğru cevap çeldiriciler arasında olmamalı');
 for (const w of v1.wrong) assert.ok(base.options.includes(w), 'Çeldirici kaynak sorudan gelmeli');
 assert.ok(v1.source.includes('Hata Defteri'));

 // Aynı anahtar -> aynı varyant (deterministik)
 const v1b = buildRetryVariant(base, '0-0::soru-1', 1);
 assert.deepEqual(v1, v1b);

 // Hata sayısı arttıkça (yani öğrenci tekrar yanlış yaptıkça) FARKLI bir yazım gelir
 let different = 0;
 for (let n = 2; n <= 6; n++) {
  const vn = buildRetryVariant(base, '0-0::soru-1', n);
  if (vn && norm(vn.question) !== norm(v1.question)) different++;
 }
 assert.ok(different >= 2, `Tekrar tekrar yanlış yapıldığında farklı yazımlar gelmeli, gelen: ${different}`);

 // Geçersiz girdide null
 assert.equal(buildRetryVariant({ question: 'kısa', answer: 'x', options: [] }, 'k', 1), null);

 // Liste hâlinde üretim + yanlış sayısına göre sıralama
 const list = buildRetryVariants([
  { key: 'a', question: base.question, answer: base.answer, wrongOptions: v1.wrong, wrongCount: 1 },
  { key: 'b', question: 'Sporcunun en yüksek verime ulaşması için yapılan sistematik hazırlığa ne ad verilir?', answer: 'Antrenman', wrongOptions: ['Egzersiz', 'Fiziksel aktivite', 'Performans'], wrongCount: 5 }
 ], 5);
 assert.equal(list.length, 2);
 assert.equal(list[0].key, 'b', 'En çok yanlış yapılan önce gelmeli');
 assert.ok(list.every(x => x.variant.question.length >= 10));
 rmSync(outDir, { recursive: true, force: true });
});
