import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrecisionQualityEngine } from '../server/precision-quality-engine.mjs';

function buildEngine() {
 const contexts = JSON.parse(readFileSync(resolve(process.cwd(), 'server/contexts.json'), 'utf8'));
 const passages = JSON.parse(readFileSync(resolve(process.cwd(), 'server/book-passages.json'), 'utf8'));
 const norm = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
 const fullUnitTextNorm = new Map();
 for (const ctx of contexts) {
  const entry = passages?.units?.find(u => u.id === ctx.id);
  fullUnitTextNorm.set(ctx.id, norm(`${ctx.text || ''} ${(entry?.passages || []).map(p => p.text).join(' ')}`));
 }
 return { pe: new PrecisionQualityEngine({ contexts, fullUnitTextNorm }), contexts };
}

const UNIT_01_QUESTION = 'Antrenmanı oluşturan ögelerden hangileri birlikte sayılır?';
const UNIT_01_ANSWER = 'Kondisyonel ve teknik hazırlık';

test('Çeldirici kalitesi: alakasız/saçma dolgu şıklar reddedilir, yakın çeldiriciler geçer', () => {
 const { pe, contexts } = buildEngine();
 const ctx = contexts.find(c => c.id === '0-1');
 const base = {
  question: UNIT_01_QUESTION,
  answer: UNIT_01_ANSWER,
  explanation: 'Kondisyonel ve teknik hazırlık antrenmanın birlikte planlanan ögeleridir.',
  evidence: ctx.text.slice(0, 70),
  unitId: '0-1',
  sourceText: ctx.text
 };

 // 1) Konuyla tamamen ilgisiz tek kelimelik dolgu şıklar ("İhmal", "Tahkim", "Bürokrasi")
 const absurd = pe.auditDistractorPsychometrics({
  ...base,
  options: [UNIT_01_ANSWER, 'İhmal', 'Tahkim', 'Bürokrasi']
 });
 assert.equal(absurd.ok, false, 'Alakasız dolgu şıklar kabul edilmemeli');
 assert.match(absurd.firstError || '', /alakasız|saçma/);

 // 2) Aynı kavram ailesinden, birbirine yakın "az kalsın doğru" çeldiriciler geçmeli
 const nearMiss = pe.auditDistractorPsychometrics({
  ...base,
  options: [
   UNIT_01_ANSWER,
   'Kondisyonel ve taktik hazırlık',
   'Teknik ve zihinsel hazırlık',
   'Yalnızca kondisyonel hazırlık'
  ]
 });
 assert.equal(nearMiss.ok, true, `Yakın çeldiriciler geçmeli: ${nearMiss.firstError}`);
 assert.ok(nearMiss.score >= 85, `Yakın çeldirici skoru yüksek olmalı, gelen: ${nearMiss.score}`);

 // 3) Doğru şık uzun, çeldiriciler aşırı kısa ise uzunluk simetrisi hatası verilmeli
 const lengthSkew = pe.auditDistractorPsychometrics({
  ...base,
  answer: 'Kondisyonel ve teknik hazırlığın birlikte planlanmasıdır',
  options: [
   'Kondisyonel ve teknik hazırlığın birlikte planlanmasıdır',
   'Kısa cevap',
   'Yanlış cevap',
   'Başka cevap'
  ]
 });
 assert.equal(lengthSkew.ok, false, 'Şık uzunlukları birbirine çok uzaksa reddedilmeli');
});

test('Üretim hattı: alakasız şıklı taslak öz-düzeltme ile düzeltilir, hakem alakasız çeldiriciyi eler', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-distractor-'));
 const prevData = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 let rejectDistractor = false;
 let selfCorrectCalls = 0;
 let generatorCalls = 0;
 let lastOptions = [];

 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const data = JSON.parse(raw || '{}');
  const prompt = data.prompt || '';
  const textMatch = prompt.match(/KONU ANLATIMI:\s*([\s\S]*?)\nSORU:/);
  const evidence = (textMatch ? textMatch[1] : 'Kondisyonel hazırlık kuvvet, dayanıklılık ve sürat gibi özellikleri').trim().slice(0, 80);

  if (prompt.includes('soru denetçisisin')) {
   const qMatch = prompt.match(/SORU: ([\s\S]*?)\nSEÇENEKLER:/);
   const optionsMatch = prompt.match(/SEÇENEKLER: ([\s\S]*)$/);
   const options = optionsMatch ? JSON.parse(optionsMatch[1]) : [];
   const answer = options[0];
   return res.end(JSON.stringify({
    response: JSON.stringify({
     answer,
     singleCorrect: true,
     dualAnswerRisk: false,
     secondBestOption: '',
     supported: true,
     qualityOk: true,
     qualityScore: 4.8,
     examPotential: 4.8,
     // Hakem çeldiricileri alakasız bulduğunda soru elenir.
     distractorPlausible: !rejectDistractor,
     difficulty: 'kolay',
     bloomLevel: 'Kavrama',
     evidence,
     reason: rejectDistractor ? 'Çeldiriciler konuyla ilgisiz.' : 'Şıklar aynı kavram ailesinden.'
    })
   }));
  }

  // ESKİ TASLAK => öz-düzeltme çağrısı: şıkları aynı kavram ailesinden yeniden kur.
  if (prompt.includes('ESKİ TASLAK')) selfCorrectCalls++;
  const isFix = prompt.includes('ESKİ TASLAK');
  if (!isFix) generatorCalls++;
  const options = isFix
   ? ['Kondisyonel ve teknik hazırlık', 'Kondisyonel ve taktik hazırlık', 'Teknik ve zihinsel hazırlık', 'Yalnızca kondisyonel hazırlık']
   : ['Kondisyonel ve teknik hazırlık', 'İhmal', 'Tahkim', 'Bürokrasi'];
  lastOptions = options;
  return res.end(JSON.stringify({
   response: JSON.stringify({
    question: UNIT_01_QUESTION,
    options,
    answer: options[0],
    explanation: 'Kondisyonel ve teknik hazırlık antrenmanın birlikte planlanan ögeleridir.',
    evidence,
    topic: 'Antrenmanın ögeleri',
    questionType: 'kavram',
    questionAngle: 'dogrudan_tanim',
    bloomLevel: 'Kavrama'
   })
  }));
 });

 await new Promise(r => fake.listen(0, '127.0.0.1', r));
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
 process.env.OLLAMA_MODEL = 'fake:1';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?distractor=${Date.now()}`);
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

 try {
  // 1) Model önce alakasız şıklar üretir; öz-düzeltme devreye girip şıkları yeniden yazar.
  const good = await fetch(`${base}/generate`, { method: 'POST', headers, body: JSON.stringify({ units: ['0-1'] }) });
  const goodJson = await good.json();
  assert.equal(good.status, 200, JSON.stringify(goodJson));
  assert.equal(goodJson.item.status, 'approved');
  assert.equal(selfCorrectCalls, 1, 'Alakasız şık taslağı için öz-düzeltme bir kez çağrılmalı');
  assert.ok(generatorCalls >= 1);
  assert.deepEqual(goodJson.item.options, [
   'Kondisyonel ve teknik hazırlık',
   'Kondisyonel ve taktik hazırlık',
   'Teknik ve zihinsel hazırlık',
   'Yalnızca kondisyonel hazırlık'
  ], 'Kaydedilen soru düzeltilmiş, birbirine yakın şıkları içermeli');
  assert.equal(goodJson.item.answer, 'Kondisyonel ve teknik hazırlık');
  assert.equal(goodJson.item.verification.judges.length, 2, 'İki hakem denetimi korunmalı');

  // 2) Hakem çeldiricileri alakasız bulursa soru kaydedilmez.
  rejectDistractor = true;
  const bad = await fetch(`${base}/generate`, { method: 'POST', headers, body: JSON.stringify({ units: ['0-2'] }) });
  const badJson = await bad.json();
  assert.equal(bad.status, 502);
  assert.match(badJson.error || '', /distractorPlausible|çeldirici/);
  assert.equal(lastOptions.length, 4);
 } finally {
  stopOllamaLoops?.();
  app.closeAllConnections?.();
  fake.closeAllConnections?.();
  await new Promise(r => app.close(r));
  await new Promise(r => fake.close(r));
  if (prevData === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevData;
  if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevBase;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  rmSync(dir, { recursive: true, force: true });
 }
});
