// Projenin tamamı 5 şıklıdır (A–E). Bu dosya şunları doğrular:
//  1) Şık sayısı tek yerden yönetilir (server/option-count.mjs) ve yardımcılar tutarlıdır.
//  2) Hazır soru verileri (sabit banka, kitap soruları, paraleller, örnek sorular) 5 farklı şık taşır.
//  3) Eski 4 şıklı havuz kayıtları üretim planına SAYILMAZ, ama silinmez.
//  4) Üretim hattı: 4 ya da 6 şıklı taslak reddedilir; 5 şıklı taslak onaylanır ve aynı sorunun
//     eski 4 şıklı sürümünün yerini alır.
//  5) 4 şık için yazılmış kum havuzu kural kodları 5 şıklı adayla çalışmaya devam eder.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
 OPTION_COUNT, LEGACY_OPTION_COUNT, OPTION_LETTERS, DISTRACTOR_COUNT,
 isDraftOptionCount, isStoredOptionCount, isLegacyOptions, hasCurrentOptions, legacyProjections
} from '../server/option-count.mjs';
import { countApproved, stepKey } from '../server/production-plan.mjs';
import { SandboxEvolver, GOLDEN_GOOD_CASES } from '../server/sandbox-evolver.mjs';
import { HARDENED_ULTRA_RULE_CODE } from '../server/intelligence-trainer.mjs';

const norm = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const readJson = rel => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const asList = j => (Array.isArray(j) ? j : (j.questions || j.samples || j.items || Object.values(j).find(Array.isArray)));

test('şık sayısı tek kaynaktan gelir: 5 şık (A–E), eski kayıt 4 şık', () => {
 assert.equal(OPTION_COUNT, 5);
 assert.equal(LEGACY_OPTION_COUNT, 4);
 assert.equal(OPTION_LETTERS, 'ABCDE');
 assert.equal(DISTRACTOR_COUNT, 4);
 assert.equal(isDraftOptionCount(5), true);
 assert.equal(isDraftOptionCount(4), false, 'Yeni taslakta 4 şık kabul edilmez');
 assert.equal(isDraftOptionCount(6), false);
 assert.equal(isStoredOptionCount(4), true, 'Kayıtlı eski soru 4 şıkla okunabilir');
 assert.equal(isStoredOptionCount(5), true);
 assert.equal(isStoredOptionCount(3), false);
 assert.equal(isStoredOptionCount(6), false);
 assert.equal(isLegacyOptions({ options: ['a', 'b', 'c', 'd'] }), true);
 assert.equal(isLegacyOptions({ options: ['a', 'b', 'c', 'd', 'e'] }), false);
 assert.equal(hasCurrentOptions({ options: ['a', 'b', 'c', 'd', 'e'] }), true);
 assert.equal(hasCurrentOptions({}), false);

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

test('eski 4 şıklı onaylı kayıtlar üretim planına sayılmaz', () => {
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
 const get = key => (counts instanceof Map ? counts.get(key) : counts[key]) || 0;
 assert.equal(get(stepKey('0-0', 'kolay')), 2, 'Yalnızca 5 şıklı onaylı sorular sayılmalı');
 assert.equal(get(stepKey('0-0', 'orta')), 0, 'Eski 4 şıklı soru plan hücresini doldurmamalı');
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

test('üretim hattı: 4 ve 6 şıklı taslak reddedilir; 5 şıklı soru eski 4 şıklı sürümün yerini alır', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-five-options-'));
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_OFFLINE_ONLY = '1';
 process.env.TEMPO_QUIET = '1';

 const answer = 'Planlı ve tekrarlı olması';
 const four = [answer, 'Tekrarlı fakat programsız olması', 'Yalnızca yüksek şiddette yapılması', 'Günlük yaşam akışında kendiliğinden oluşması'];
 const fifth = 'Kısa süreli ve tek seferlik olması';
 const stem = 'Fiziksel egzersizi günlük hareketten ayıran en temel iki nitelik nedir?';
 // Havuzda, önceki sürümle üretilmiş 4 şıklı onaylı bir soru ve başka bir üniteden ikinci bir eski kayıt var.
 const seed = (id, unitId, question) => ({
  id, unitId, status: 'approved', difficulty: 'kolay', question, options: four, answer,
  explanation: 'Egzersiz düzenli, planlı ve tekrarlı bir etkinliktir.', evidence: 'Egzersiz planlı ve tekrarlıdır',
  topic: 'Egzersizin özellikleri', createdAt: new Date().toISOString()
 });
 writeFileSync(join(dir, 'questions.json'), JSON.stringify([
  seed('legacy-same', '0-0', stem),
  seed('legacy-other', '1-0', 'Düzenli egzersizin sağlık açısından ayırt edici iki niteliği hangi seçenekte verilmiştir?')
 ]));

 let mode = 'four';
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
  const options = mode === 'four' ? four : mode === 'six' ? [...four, fifth, 'Uzun süreli ve düzensiz olması'] : [...four, fifth];
  return res.end(JSON.stringify({ response: JSON.stringify({
   question: stem, options, answer,
   explanation: 'Konu anlatımında bu bilgi doğrudan geçer ve kalıcı öğrenme için püf noktasıdır.',
   evidence, topic: 'Egzersizin özellikleri', questionType: 'kavram', questionAngle: 'dogrudan_tanim', bloomLevel: 'Kavrama'
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
  // Başlangıç: iki eski kayıt da havuzda duruyor ve durum raporunda "eski biçim" olarak görünüyor.
  let status = await (await fetch(`${base}/status`)).json();
  assert.deepEqual(
   { optionCount: status.optionFormat.optionCount, currentFormat: status.optionFormat.currentFormat, legacyFormat: status.optionFormat.legacyFormat },
   { optionCount: 5, currentFormat: 0, legacyFormat: 2 }
  );

  // 1) 4 şıklı taslak: biçim hatası
  mode = 'four';
  const r4 = await generate();
  const j4 = await r4.json();
  assert.equal(r4.status, 502, JSON.stringify(j4));
  assert.match(j4.error || '', /5 şıklı olmalı \(4 şık geldi\)/);

  // 2) 6 şıklı taslak: biçim hatası
  mode = 'six';
  const r6 = await generate();
  const j6 = await r6.json();
  assert.equal(r6.status, 502, JSON.stringify(j6));
  assert.match(j6.error || '', /5 şıklı olmalı \(6 şık geldi\)/);
  assert.equal((await approved()).length, 2, 'Reddedilen taslaklar havuzu değiştirmemeli');

  // 3) Aynı sorunun 5 şıklı sürümü: eski kayıt "tekrar" sayılıp engellemez, yerini yenisine bırakır.
  mode = 'five';
  const r5 = await generate();
  const j5 = await r5.json();
  assert.equal(r5.status, 200, JSON.stringify(j5));
  assert.equal(j5.item.status, 'approved');
  assert.equal(j5.item.options.length, 5);
  assert.equal(new Set(j5.item.options).size, 5);
  assert.ok(j5.item.options.includes(fifth));
  assert.equal(j5.item.answer, answer);

  const pool = await approved();
  assert.equal(pool.some(x => x.id === 'legacy-same'), false, 'Aynı sorunun eski 4 şıklı sürümü havuzdan çıkmalı');
  assert.equal(pool.some(x => x.id === 'legacy-other'), true, 'Başka ünitedeki eski kayıt silinmemeli');
  assert.equal(pool.filter(x => x.unitId === '0-0').length, 1);

  status = await (await fetch(`${base}/status`)).json();
  assert.equal(status.optionFormat.currentFormat, 1);
  assert.equal(status.optionFormat.legacyFormat, 1);
  assert.equal(status.optionFormat.legacySuperseded, 1);

  // 4) Aynı 5 şıklı soru ikinci kez gelirse artık tekrar sayılır.
  const again = await generate();
  const againJson = await again.json();
  assert.equal(again.status, 502, JSON.stringify(againJson));
  assert.match(againJson.error || '', /kayıtlı|benzer/);
 } finally {
  stopOllamaLoops?.();
  app.closeAllConnections?.();
  fake.closeAllConnections?.();
  await new Promise(r => app.close(r));
  await new Promise(r => fake.close(r));
  rmSync(dir, { recursive: true, force: true });
 }
});
