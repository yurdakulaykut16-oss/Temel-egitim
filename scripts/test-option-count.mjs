// Bir soru 4 ya da 5 şıklı olabilir. Bu dosya şunları doğrular:
//  1) Şık sayısı tek yerden yönetilir (server/option-count.mjs): 4 ve 5 geçerli, 3 ve 6 geçersiz.
//  2) Hazır soru verileri (sabit banka, kitap soruları, paraleller, örnek sorular) 5 farklı şık taşır.
//  3) 4 ve 5 şıklı onaylı sorular üretim planına birlikte sayılır.
//  4) Üretim hattı: 3 ya da 6 şıklı taslak reddedilir; 4 şıklı da 5 şıklı da onaylanır.
//  5) 4 şık için yazılmış kum havuzu kural kodları 5 şıklı adayla da çalışır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
 OPTION_COUNT, MIN_OPTION_COUNT, OPTION_LETTERS, DISTRACTOR_COUNT, MIN_DISTRACTOR_COUNT,
 isValidOptionCount, isDraftOptionCount, isStoredOptionCount, legacyProjections
} from '../server/option-count.mjs';
import { countApproved, stepKey } from '../server/production-plan.mjs';
import { SandboxEvolver, GOLDEN_GOOD_CASES } from '../server/sandbox-evolver.mjs';
import { HARDENED_ULTRA_RULE_CODE } from '../server/intelligence-trainer.mjs';

const norm = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const readJson = rel => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const asList = j => (Array.isArray(j) ? j : (j.questions || j.samples || j.items || Object.values(j).find(Array.isArray)));

test('şık sayısı tek kaynaktan gelir: 4 ya da 5 şık geçerli, 3 ve 6 geçersiz', () => {
 assert.equal(MIN_OPTION_COUNT, 4);
 assert.equal(OPTION_COUNT, 5);
 assert.equal(OPTION_LETTERS, 'ABCDE');
 assert.equal(MIN_DISTRACTOR_COUNT, 3);
 assert.equal(DISTRACTOR_COUNT, 4);
 for (const fn of [isValidOptionCount, isDraftOptionCount, isStoredOptionCount]) {
  assert.equal(fn(4), true, '4 şık geçerli');
  assert.equal(fn(5), true, '5 şık geçerli');
  assert.equal(fn(3), false, '3 şık geçersiz');
  assert.equal(fn(6), false, '6 şık geçersiz');
  assert.equal(fn(undefined), false);
 }

 // 5 şıklı aday, 4 şıklı iki görünüme ayrılır: ikisi de doğru cevabı taşır, birlikte tüm şıkları kapsar.
 const cand = { question: 'x', answer: 'c', options: ['a', 'b', 'c', 'd', 'e'] };
 const views = legacyProjections(cand);
 assert.equal(views.length, 2);
 for (const v of views) {
  assert.equal(v.options.length, 4);
  assert.ok(v.options.includes('c'));
 }
 assert.deepEqual([...new Set(views.flatMap(v => v.options))].sort(), ['a', 'b', 'c', 'd', 'e']);
 const legacy = { question: 'x', answer: 'a', options: ['a', 'b', 'c', 'd'] };
 assert.deepEqual(legacyProjections(legacy), [legacy], '4 şıklı aday olduğu gibi kalır');
});

test('hazır soru verilerinin tamamı 5 farklı şık taşır ve doğru cevap şıkların içindedir', () => {
 const files = {
  'server/question-bank.json': 300,
  'server/book-style-questions.json': 290,
  'server/book-parallel-questions.json': 200,
  'server/exam-samples.json': 6
 };
 for (const [file, min] of Object.entries(files)) {
  const list = asList(readJson(file));
  assert.ok(list.length >= min, `${file}: en az ${min} soru olmalı, gelen ${list.length}`);
  for (const q of list) {
   const label = `${file} :: ${String(q.question).slice(0, 60)}`;
   assert.ok(Array.isArray(q.options) && q.options.length === 5, `${label}: 5 şık olmalı (${q.options?.length})`);
   assert.equal(new Set(q.options.map(norm)).size, 5, `${label}: şıklar birbirinden farklı olmalı`);
   assert.ok(q.options.includes(q.answer), `${label}: doğru cevap şıkların içinde olmalı`);
   assert.ok(q.options.every(o => typeof o === 'string' && o.trim().length >= 1), `${label}: boş şık olmamalı`);
  }
 }
 // Kitap sorularında uygulamadaki şıklar, kitabın kendi 5 şıkkıyla aynı kümedir (uydurma şık yok).
 for (const q of asList(readJson('server/book-style-questions.json'))) {
  assert.deepEqual([...q.options].map(norm).sort(), [...q.options5].map(norm).sort(), `${q.id}: şıklar kitabın 5 şıkkı olmalı`);
 }
 // Gönderilen örnek / çıkmış sorularda da sınavdaki 5 şık kullanılır.
 for (const s of readJson('src/examSamples.json').samples) {
  assert.deepEqual(s.options, s.options5, `${s.id}: options, sınavdaki 5 şıkla aynı olmalı`);
 }
});

test('sabit soru kaynakları: her satır soru|doğru|4 yanlış|açıklama biçimindedir', () => {
 const files = ['extra', 'scenarios', 'practice', 'reinforcement', 'unique', 'advanced', 'newQuestions', 'bookNotes', 'challenge'];
 let lines = 0;
 for (const f of files) {
  const src = readFileSync(new URL(`../src/${f}.ts`, import.meta.url), 'utf8');
  // Tek ya da çift tırnaklı, içinde en az 5 '|' bulunan metinler soru satırıdır.
  for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*\|(?:\\.|(?!\1)[^\\\n])*)\1/g)) {
   const parts = m[2].split('|');
   if (parts.length < 6) continue;
   lines += 1;
   assert.equal(parts.length, 7, `src/${f}.ts: 7 alan olmalı (soru|doğru|4 yanlış|açıklama): ${m[2].slice(0, 70)}`);
   const opts = parts.slice(1, 6).map(norm);
   assert.equal(new Set(opts).size, 5, `src/${f}.ts: 5 farklı şık olmalı: ${m[2].slice(0, 70)}`);
  }
 }
 assert.ok(lines >= 300, `En az 300 sabit soru satırı denetlenmeli, gelen ${lines}`);
});

test('4 ve 5 şıklı onaylı sorular üretim planına birlikte sayılır', () => {
 const five = ['a', 'b', 'c', 'd', 'e'];
 const four = ['a', 'b', 'c', 'd'];
 const items = [
  { status: 'approved', unitId: '0-0', difficulty: 'kolay', options: five, answer: 'a' },
  { status: 'approved', unitId: '0-0', difficulty: 'kolay', options: five, answer: 'a' },
  { status: 'approved', unitId: '0-0', difficulty: 'kolay', options: four, answer: 'a' },
  { status: 'approved', unitId: '0-0', difficulty: 'orta', options: four, answer: 'a' },
  { status: 'rejected', unitId: '0-0', difficulty: 'kolay', options: five, answer: 'a' }
 ];
 const counts = countApproved(items);
 assert.equal(counts.get(stepKey('0-0', 'kolay')), 3, '4 ve 5 şıklı onaylı sorular birlikte sayılmalı');
 assert.equal(counts.get(stepKey('0-0', 'orta')), 1, '4 şıklı soru plan hücresini doldurmalı');
});

test('4 şık için yazılmış kum havuzu kural kodu 5 şıklı adayla da çalışır', () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-five-sandbox-'));
 try {
  const evolver = new SandboxEvolver(dir);
  const good = GOLDEN_GOOD_CASES[0];
  assert.equal(good.options.length, 4, 'Altın örnekler eski kural kodlarıyla aynı (4 şıklı) biçimdedir');
  const legacyRes = evolver.runSandboxedRule(HARDENED_ULTRA_RULE_CODE, good, {});
  assert.equal(legacyRes.ok, true, `Altın örnek geçmeli: ${legacyRes.reason}`);

  // Aynı soruya, diğer çeldiricilerle aynı uzunlukta bir beşinci şık eklenir.
  const template = good.options.find(o => o !== good.answer);
  const fifth = `${template} (ek)`;
  const five = { ...good, options: [...good.options, fifth] };
  const fiveRes = evolver.runSandboxedRule(HARDENED_ULTRA_RULE_CODE, five, {});
  assert.equal(fiveRes.ok, true, `5 şıklı aday da geçmeli: ${fiveRes.reason}`);

  // Beşinci şık yasaklı bir ifade taşıyorsa (yalnızca ikinci görünümde görünür) aday yine reddedilir.
  const bad = { ...good, options: [...good.options, 'Yukarıdakilerin hepsi'] };
  const badRes = evolver.runSandboxedRule(HARDENED_ULTRA_RULE_CODE, bad, {});
  assert.equal(badRes.ok, false, 'Beşinci şıktaki "hepsi" ifadesi de yakalanmalı');

  // Toplu yürütme, aday başına tek sonuç döndürür.
  const batch = evolver.runSandboxedRuleBatch(HARDENED_ULTRA_RULE_CODE, [[good, {}], [five, {}], [bad, {}]]);
  assert.equal(batch.length, 3);
  assert.deepEqual(batch.map(r => r.ok), [true, true, false]);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('üretim hattı: 3 ve 6 şıklı taslak reddedilir; 4 şıklı da 5 şıklı da onaylanır ve plana sayılır', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-option-count-'));
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_OFFLINE_ONLY = '1';
 process.env.TEMPO_QUIET = '1';

 const drafts = {
  // 4 şıklı soru
  four: {
   question: 'Fiziksel egzersizi günlük hareketten ayıran en temel iki nitelik nedir?',
   options: ['Planlı ve tekrarlı olması', 'Tekrarlı fakat programsız olması', 'Yalnızca yüksek şiddette yapılması', 'Günlük yaşam akışında kendiliğinden oluşması'],
   answer: 'Planlı ve tekrarlı olması'
  },
  // 5 şıklı, başka bir kavramı soran soru
  five: {
   question: 'Sürantrenman riskini artıran temel yüklenme hatası aşağıdakilerden hangisidir?',
   options: ['Yetersiz toparlanmayla yükü sürekli artırmak', 'Haftalık hacmi kademeli ve düzenli artırmak', 'Sezon içi dinlenme günlerini planlamak', 'Bireysel yanıta göre şiddeti ayarlamak', 'Yüklenme sonrası uykuyu düzenli tutmak'],
   answer: 'Yetersiz toparlanmayla yükü sürekli artırmak'
  }
 };
 // 4 şıklı sorunun bir çeldirici eklenmiş hâli: yeni soru değil, aynı sorunun tekrarıdır.
 drafts.fourPlusOne = { ...drafts.four, options: [...drafts.four.options, 'Kısa süreli ve tek seferlik olması'] };
 drafts.three = { ...drafts.four, options: drafts.four.options.slice(0, 3) };
 drafts.six = { ...drafts.five, options: [...drafts.five.options, 'Isınma süresini her hafta uzatmak'] };
 writeFileSync(join(dir, 'questions.json'), '[]');

 let mode = 'three';
 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const prompt = JSON.parse(raw || '{}').prompt || '';
  const evidence = 'Egzersiz planlı ve tekrarlıdır';
  if (prompt.includes('soru denetçisisin')) {
   const m = prompt.match(/SEÇENEKLER: ([\s\S]*)$/);
   const options = m ? JSON.parse(m[1]) : [];
   return res.end(JSON.stringify({ response: JSON.stringify({
    answer: options[0], singleCorrect: true, dualAnswerRisk: false, secondBestOption: '', supported: true,
    qualityOk: true, qualityScore: 4.8, examPotential: 4.8, distractorPlausible: true, difficulty: 'kolay',
    bloomLevel: 'Kavrama', evidence, reason: 'Anlatım bu bilgiyi doğrudan destekliyor.'
   }) }));
  }
  const draft = drafts[mode];
  return res.end(JSON.stringify({ response: JSON.stringify({
   ...draft,
   explanation: 'Konu anlatımında bu bilgi doğrudan geçer ve kalıcı öğrenme için püf noktasıdır.',
   evidence, topic: 'Egzersiz ve yüklenme', questionType: 'kavram', questionAngle: 'dogrudan_tanim', bloomLevel: 'Kavrama'
  }) }));
 });

 await new Promise(r => fake.listen(0, '127.0.0.1', r));
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
 process.env.OLLAMA_MODEL = 'fake:1';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?five=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 await new Promise(r => app.listen(0, '127.0.0.1', r));
 const origin = `http://127.0.0.1:${app.address().port}`;
 const base = `${origin}/api/ollama`;
 const headers = { 'Content-Type': 'application/json', Origin: origin };
 const generate = () => fetch(`${base}/generate`, { method: 'POST', headers, body: JSON.stringify({ units: ['0-0'] }) });
 const approved = async () => (await (await fetch(`${base}/questions`)).json()).items.filter(x => x.status === 'approved');

 try {
  // 1) 3 şıklı taslak: biçim hatası
  mode = 'three';
  const r3 = await generate();
  const j3 = await r3.json();
  assert.equal(r3.status, 502, JSON.stringify(j3));
  assert.match(j3.error || '', /4 ya da 5 şıklı olmalı \(3 şık geldi\)/);

  // 2) 6 şıklı taslak: biçim hatası
  mode = 'six';
  const r6 = await generate();
  const j6 = await r6.json();
  assert.equal(r6.status, 502, JSON.stringify(j6));
  assert.match(j6.error || '', /4 ya da 5 şıklı olmalı \(6 şık geldi\)/);
  assert.equal((await approved()).length, 0, 'Reddedilen taslaklar havuza girmemeli');

  // 3) 4 şıklı soru onaylanır
  mode = 'four';
  const r4 = await generate();
  const j4 = await r4.json();
  assert.equal(r4.status, 200, JSON.stringify(j4));
  assert.equal(j4.item.status, 'approved');
  assert.equal(j4.item.options.length, 4);

  // 4) 5 şıklı soru da onaylanır
  mode = 'five';
  const r5 = await generate();
  const j5 = await r5.json();
  assert.equal(r5.status, 200, JSON.stringify(j5));
  assert.equal(j5.item.status, 'approved');
  assert.equal(j5.item.options.length, 5);
  assert.equal(new Set(j5.item.options).size, 5);

  // İkisi de havuzda ve ikisi de üretim planına sayılıyor.
  const pool = await approved();
  assert.deepEqual(pool.map(x => x.options.length).sort(), [4, 5]);
  const status = await (await fetch(`${base}/status`)).json();
  assert.deepEqual(status.optionFormat, { allowed: [4, 5], fourOption: 1, fiveOption: 1 });
  assert.equal(status.plan.totalDone, 2, '4 ve 5 şıklı sorular plana birlikte sayılmalı');

  // 5) 4 şıklı sorunun yalnızca bir şık eklenmiş hâli yeni soru sayılmaz (tekrar).
  mode = 'fourPlusOne';
  const again = await generate();
  const againJson = await again.json();
  assert.equal(again.status, 502, JSON.stringify(againJson));
  assert.match(againJson.error || '', /kayıtlı|benzer/);
  assert.equal((await approved()).length, 2);
 } finally {
  stopOllamaLoops?.();
  app.closeAllConnections?.();
  fake.closeAllConnections?.();
  await new Promise(r => app.close(r));
  await new Promise(r => fake.close(r));
  rmSync(dir, { recursive: true, force: true });
 }
});
