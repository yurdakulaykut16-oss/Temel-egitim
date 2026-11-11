import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrecisionQualityEngine, UNIT_AXIOM_ATLAS } from '../server/precision-quality-engine.mjs';

function buildContextsEnv() {
 const root = process.cwd();
 const contexts = JSON.parse(readFileSync(resolve(root, 'server/contexts.json'), 'utf8'));
 const passages = JSON.parse(readFileSync(resolve(root, 'server/book-passages.json'), 'utf8'));
 const norm = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
 const fullUnitTextNorm = new Map();
 for (const ctx of contexts) {
  const entry = passages?.units?.find(u => u.id === ctx.id);
  fullUnitTextNorm.set(ctx.id, norm(`${ctx.text || ''} ${(entry?.passages || []).map(p => p.text).join(' ')}`));
 }
 return { contexts, fullUnitTextNorm };
}

test('PrecisionQualityEngine: 29/29 ünite bilimsel aksiyom atlası ve çok katmanlı psikometri kuralları', () => {
 const { contexts, fullUnitTextNorm } = buildContextsEnv();
 const pe = new PrecisionQualityEngine({ contexts, fullUnitTextNorm });
 assert.equal(pe.atlasCount, 29, 'Tüm 29 ünitenin aksiyom atlası tam olmalı');

 for (const ctx of contexts) {
  assert.ok(UNIT_AXIOM_ATLAS[ctx.id], `Ünite atlası eksik: ${ctx.id}`);
  assert.ok(UNIT_AXIOM_ATLAS[ctx.id].axioms.length >= 2, `Aksiyom yetersiz: ${ctx.id}`);
  assert.ok(UNIT_AXIOM_ATLAS[ctx.id].confusionPairs.length >= 1, `Kavram çifti eksik: ${ctx.id}`);
  const block = pe.getUnitAxiomPromptBlock(ctx.id);
  assert.ok(block.includes('ÜNİTE BİLİMSEL AKSİYOMLARI'));
 }

 // 1) Bilimsel aksiyom çelişkisini yakalama (Ünite 1-1: ATP-PC laktik asit üretir iddiası)
 const badScience = pe.auditDistractorPsychometrics({
  question: 'Kısa süreli patlayıcı eforlarda enerji üretimi nasıl gerçekleşir?',
  options: [
   'ATP-PC sistemi laktik asit üreterek çalışır',
   'Aerobik sistem oksijen kullanır',
   'Glikojen kas içinde depo edilir',
   'Dinlenmede fosfojen yenilenir'
  ],
  answer: 'ATP-PC sistemi laktik asit üreterek çalışır',
  explanation: 'ATP-PC sisteminde laktik asit birikir.',
  unitId: '1-1'
 });
 assert.equal(badScience.ok, false);
 assert.match(badScience.firstError || '', /Bilimsel doğruluk hatası/);

 // 2) Kök sızıntısını yakalama
 const leak = pe.auditDistractorPsychometrics({
  question: 'Sporcuların ihtiyaçlarını merkeze koyarak hizmet eden liderlik yaklaşımı hangisidir?',
  options: ['Hizmetkâr liderlik', 'Otoriter yaklaşım', 'Bürokratik model', 'Dönüşümsel yapı'],
  answer: 'Hizmetkâr liderlik',
  explanation: 'Hizmetkâr liderlik sporculara hizmet etmeyi hedefler.',
  unitId: '2-2'
 });
 assert.equal(leak.ok, false);
 assert.match(leak.firstError || '', /sızdırıyor/);

 // 3) Aşırı kesinlik ipucu asimetrisi
 const quant = pe.auditDistractorPsychometrics({
  question: 'Sporcu ve ebeveyn iletişimi hangi ilkeye göre yönetilir?',
  options: [
   'Ebeveyn sürece yapıcı biçimde katılır',
   'Ebeveyn tesise asla alınmaz',
   'Antrenör ebeveynle tamamen bağını koparır',
   'Çocuk her zaman tek başına bırakılır'
  ],
  answer: 'Ebeveyn sürece yapıcı biçimde katılır',
  explanation: 'Yapıcı iletişim desteklenir.',
  unitId: '3-0'
 });
 assert.equal(quant.ok, false);
 assert.match(quant.firstError || '', /aşırı genelleme ipucu/);

 // 4) "Sırasıyla" sıralama seçeneklerinde yanlış pozitif olmamalı
 const orderedOk = pe.auditDistractorPsychometrics({
  question: 'Tek seanslık tepki ve uzun dönemli değişim sırasıyla nasıl adlandırılır?',
  options: [
   'Akut tepki - Kronik uyum',
   'Kronik uyum - Akut tepki',
   'Aerobik eşik - Anaerobik eşik',
   'İzometrik kasılma - İzotonik kasılma'
  ],
  answer: 'Akut tepki - Kronik uyum',
  explanation: 'Akut tepki anlık, kronik uyum uzun dönemlidir.',
  evidence: 'Antrenmana verilen anlık yanıt akut tepki uzun süreli değişim kronik uyumdur.',
  unitId: '1-1'
 });
 assert.equal(orderedOk.ok, true);

 // 5) Sayısal halüsinasyon engellemesi
 const ctx11 = contexts.find(c => c.id === '1-1');
 const numMismatch = pe.verifyEvidenceGrounding('Egzersiz sırasında ATP-PC sistemi 987 saniye boyunca kesintisiz laktik asitsiz enerji sağlar.', ctx11);
 assert.equal(numMismatch.ok, false);
 assert.equal(numMismatch.tier, 'number_mismatch');
});

test('Ollama HTTP API: /api/ollama/precision-audit, /status ve aksiyom/psikometri destekli /generate', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'precision-api-'));
 let capturedGenPrompt = '';
 let capturedJudgePrompt = '';
 let draftMode = 'clean';

 const fakeOllama = http.createServer(async (req, res) => {
  if (req.url === '/api/tags') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'gemma3:4b' }] }));
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ ok: true }));
  }
  const data = JSON.parse(rawBody);
  const ctx = JSON.parse(readFileSync(resolve(process.cwd(), 'server/contexts.json'), 'utf8')).find(c => c.id === '1-1');
  const validEv = ctx.text.slice(0, 90);

  let out;
  if (data.prompt.includes('soru denetçisisin')) {
   capturedJudgePrompt = data.prompt;
   out = {
    answer: 'Adenozin trifosfat molekülünün parçalanmasıdır',
    singleCorrect: true,
    dualAnswerRisk: false,
    secondBestOption: '',
    supported: true,
    qualityOk: true,
    qualityScore: 5,
    examPotential: 5,
    difficulty: 'kolay',
    evidence: validEv,
    reason: 'Anlatımla tamamen uyumlu ve tek doğru şıklı.'
   };
  } else {
   capturedGenPrompt = data.prompt;
   if (draftMode === 'bad_science') {
    out = {
     question: 'Yüksek şiddetli kısa yüklenmelerde kas enerji kaynağı nasıl çalışır?',
     options: [
      'ATP-PC sistemi laktik asit üretir',
      'Glikolitik yol oksijen kullanır',
      'Kreatin kinaz sentezi durdurur',
      'Mitokondri sayısı anında azalır'
     ],
     answer: 'ATP-PC sistemi laktik asit üretir',
     explanation: 'ATP-PC sistemi laktik asit üreterek enerji sağlar.',
     evidence: validEv,
     topic: 'Enerji sistemleri'
    };
   } else {
    out = {
     question: 'Kas kasılması için hücrenin doğrudan kullanabildiği temel kimyasal enerji yakıtı nedir?',
     options: [
      'Adenozin trifosfat molekülünün parçalanmasıdır',
      'Serbest yağ asitlerinin oksidasyon hızıdır',
      'Karaciğer glikojeninin kana salınım hızıdır',
      'Kan plazmasındaki laktat birikim düzeyidir'
     ],
     answer: 'Adenozin trifosfat molekülünün parçalanmasıdır',
     explanation: 'Hücrede mekanik kasılma doğrudan ATP hidroliziyle gerçekleşir.',
     evidence: validEv,
     topic: 'Enerji metabolizması'
    };
   }
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ response: JSON.stringify(out), eval_count: 90, eval_duration: 150_000_000, load_duration: 20_000_000 }));
 });

 await new Promise(r => fakeOllama.listen(0, '127.0.0.1', r));
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakeOllama.address().port}`;
 process.env.OLLAMA_MODEL = 'qwen3:8b';
 process.env.OLLAMA_VERIFIER_MODEL = 'qwen3:8b';
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 const { ollamaPlugin } = await import(`../server/ollama.mjs?t=${Date.now()}`);
 let appServer;
 try {
  let middleware;
  ollamaPlugin().configureServer({
   middlewares: { use: (_prefix, fn) => { middleware = fn; } }
  });

  appServer = http.createServer((req, res) => {
   req.url = req.url.replace(/^\/api\/ollama/, '') || '/';
   middleware(req, res, () => { res.statusCode = 404; res.end('not found'); });
  });
  await new Promise(r => appServer.listen(0, '127.0.0.1', r));
  const originBase = `http://127.0.0.1:${appServer.address().port}`;
  const base = `${originBase}/api/ollama`;
  const headers = { 'Content-Type': 'application/json', Origin: originBase };

  // 1) Status içinde precisionAudit & 29 ünite kapsaması
  const st = await (await fetch(`${base}/status`)).json();
  assert.equal(st.precisionAudit.atlasUnits, 29);

  // 2) GET /precision-audit (<1sn içinde tüm soru bankasını denetler)
  const t0 = performance.now();
  const auditRes = await (await fetch(`${base}/precision-audit`)).json();
  const elapsed = performance.now() - t0;
  assert.equal(auditRes.ok, true);
  assert.equal(auditRes.atlasUnits, 29);
  assert.ok(auditRes.evaluatedCount >= 400);
  assert.ok(auditRes.dpoEliteCount >= 300);
  assert.ok(elapsed < 1000, `Precision audit <1sn olmalı, gerçekleşen=${Math.round(elapsed)}ms`);

  // 3) POST /precision-audit ile anlık taslak eleştirisi (1-0 sagittal/abduksiyon aksiyom hatası)
  const ctx10 = JSON.parse(readFileSync(resolve(process.cwd(), 'server/contexts.json'), 'utf8')).find(c => c.id === '1-0');
  const badDraftAudit = await (await fetch(`${base}/precision-audit`, {
   method: 'POST',
   headers,
   body: JSON.stringify({
    unitId: '1-0',
    draft: {
     question: 'Kolların yana doğru açılması hareketi hangi düzlemde incelenir?',
     options: [
      'Sagittal düzlemde abduksiyon gerçekleşir',
      'Transvers düzlemde fleksiyon oluşur',
      'Medial eksende kalp atımı hızlanır',
      'Proksimal uçta kas gerimi düşer'
     ],
     answer: 'Sagittal düzlemde abduksiyon gerçekleşir',
     explanation: 'Sagittal düzlem abduksiyon hareketi ile ilişkilidir.',
     evidence: ctx10.text.slice(0, 90)
    }
   })
  })).json();
  assert.equal(badDraftAudit.ok, false);
  assert.match(badDraftAudit.firstError || '', /Bilimsel doğruluk hatası/);

  // 4) /generate: Bilimsel aksiyom hatası olan taslak reddedilmeli
  draftMode = 'bad_science';
  const badGenRes = await fetch(`${base}/generate`, {
   method: 'POST',
   headers,
   body: JSON.stringify({ units: ['1-1'], difficulty: 'kolay', model: 'qwen3:8b' })
  });
  assert.equal(badGenRes.status, 502);
  const badGenJson = await badGenRes.json();
  assert.match(badGenJson.error || '', /Bilimsel doğruluk|laktik/i);

  // 5) /generate: Yüksek kaliteli taslak onaylanmalı, aksiyomlar prompta girmeli ve precisionScore kaydedilmeli
  draftMode = 'clean';
  const goodGenRes = await fetch(`${base}/generate`, {
   method: 'POST',
   headers,
   body: JSON.stringify({ units: ['1-1'], difficulty: 'kolay', model: 'qwen3:8b' })
  });
  assert.equal(goodGenRes.status, 200);
  const goodJson = await goodGenRes.json();
  assert.equal(goodJson.item.status, 'approved');
  assert.ok(goodJson.item.precisionScore >= 85);
  assert.ok(['elite_osym', 'strong'].includes(goodJson.item.precisionTier));
  assert.ok(capturedGenPrompt.includes('ÜNİTE BİLİMSEL AKSİYOMLARI (1-1)'));
  assert.ok(capturedJudgePrompt.includes('ÜNİTE BİLİMSEL AKSİYOMLARI (1-1)'));
 } finally {
  appServer?.close();
  fakeOllama.close();
  rmSync(dir, { recursive: true, force: true });
 }
});
