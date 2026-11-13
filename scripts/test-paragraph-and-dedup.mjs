import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PoolCuratorBot } from '../server/pool-curator.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

const normq = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const STOP = new Set(['bir', 've', 'ile', 'için', 'gibi', 'olan', 'hangisidir', 'hangisi', 'nedir', 'aşağıdakilerden', 'yukarıdakilerden', 'göre', 'daha', 'olarak', 'kadar', 'ancak', 'fakat', 'veya', 'ya', 'da', 'de', 'bu', 'şu', 'o', 'her', 'tüm', 'en']);
const stemq = s => normq(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w));
const template = s => normq(s).replace(/\d+([.,]\d+)?/g, '#');
const jacq = (a, b) => { const A = new Set(stemq(a)), B = new Set(stemq(b)); if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++; return i / (A.size + B.size - i); };
// Soru kökü benzerliği (sunucudaki similarity() ile aynı mantık: kapsama tabanlı)
const simq = (a, b) => { const A = new Set(stemq(a)), B = new Set(stemq(b)); if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++; return i / Math.max(A.size, B.size); };
const optOverlap = (a, b) => { const A = new Set((a.options || []).map(x => normq(x))); const B = (b.options || []).map(x => normq(x)); if (!A.size || !B.size) return 0; let i = 0; for (const o of B) if (A.has(o)) i++; return i / Math.max(4, B.size); };

test('Soru bankasında birbirinin aynısı / tıpatıp benzeri soru kalmadı', () => {
 const bank = JSON.parse(readFileSync(resolve(process.cwd(), 'server/question-bank.json'), 'utf8'));
 assert.ok(bank.length > 250, `Banka makul boyutta kalmalı, gelen: ${bank.length}`);

 // 1) Birebir aynı soru kökü olmamalı
 const stems = new Set();
 for (const q of bank) {
  const key = normq(q.question);
  assert.equal(stems.has(key), false, `Aynı soru kökü iki kez var: ${q.question}`);
  stems.add(key);
 }

 // 2) Aynı kalıbın (sayılar maskelenmiş) en fazla 2 örneği olmalı
 const tpl = new Map();
 for (const q of bank) {
  const key = template(q.question);
  tpl.set(key, (tpl.get(key) || 0) + 1);
 }
 for (const [key, n] of tpl) {
  assert.ok(n <= 2, `Aynı kalıptan ${n} soru var: ${key.slice(0, 90)}`);
 }

 // 3) Aynı ünitede aynı cevabı paylaşan yüksek örtüşmeli tekrar kalmamalı
 let nearDupPairs = 0;
 const byUnit = new Map();
 for (const q of bank) {
  if (!byUnit.has(q.unitId)) byUnit.set(q.unitId, []);
  byUnit.get(q.unitId).push(q);
 }
 for (const [, list] of byUnit) {
  for (let i = 0; i < list.length; i++) {
   for (let j = i + 1; j < list.length; j++) {
    if (normq(list[i].answer) === normq(list[j].answer) && jacq(`${list[i].question} ${list[i].answer}`, `${list[j].question} ${list[j].answer}`) >= 0.45) nearDupPairs++;
   }
  }
 }
 assert.ok(nearDupPairs <= 2, `Aynı cevabı paylaşan benzer soru çifti sayısı düşük olmalı, gelen: ${nearDupPairs}`);
});

test('Üretim hattı: havuzdaki soruya çok benzeyen taslak reddedilir, özgün taslak geçer', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-dedup-'));
 const prevData = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 // Havuza 0-0 ünitesinden bir soru yerleştir.
 writeFileSync(join(dir, 'questions.json'), JSON.stringify([
  {
   id: 'seed-dup',
   unitId: '0-0',
   status: 'approved',
   difficulty: 'kolay',
   question: 'Fiziksel egzersizi günlük hareketten ayıran en temel iki nitelik nedir?',
   options: ['Planlı ve tekrarlı olması', 'Tekrarlı fakat programsız olması', 'Yalnızca yüksek şiddette yapılması', 'Günlük yaşam akışında kendiliğinden oluşması'],
   answer: 'Planlı ve tekrarlı olması',
   explanation: 'Egzersiz düzenli, planlı ve tekrarlı bir etkinliktir.',
   evidence: 'Egzersiz planlı ve tekrarlıdır',
   topic: 'Egzersizin özellikleri',
   createdAt: new Date().toISOString()
  }
 ]));

 let mode = 'near-dup';
 let generatorCalls = 0;

 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const data = JSON.parse(raw || '{}');
  const prompt = data.prompt || '';
  const evidence = 'Egzersiz planlı ve tekrarlıdır';

  if (prompt.includes('soru denetçisisin')) {
   const optionsMatch = prompt.match(/SEÇENEKLER: ([\s\S]*)$/);
   const options = optionsMatch ? JSON.parse(optionsMatch[1]) : [];
   return res.end(JSON.stringify({
    response: JSON.stringify({
     answer: options[0],
     singleCorrect: true,
     dualAnswerRisk: false,
     secondBestOption: '',
     supported: true,
     qualityOk: true,
     qualityScore: 4.8,
     examPotential: 4.8,
     distractorPlausible: true,
     difficulty: 'kolay',
     bloomLevel: 'Kavrama',
     evidence,
     reason: 'Anlatım bu bilgiyi doğrudan destekliyor.'
    })
   }));
  }

  const drafts = {
   // Havuzdaki sorunun yalnızca birkaç sözcüğü değiştirilmiş hâli
   'near-dup': {
    question: 'Fiziksel egzersizi günlük aktivitelerden ayıran en temel iki nitelik nedir?',
    options: ['Planlı ve tekrarlı olması', 'Programlı fakat tekrarsız olması', 'Yalnızca yüksek şiddette uygulanması', 'Günlük yaşam akışında kendiliğinden oluşması'],
    answer: 'Planlı ve tekrarlı olması'
   },
   // Aynı şıklarla kurulmuş ama kökü farklı bir soru
   'same-options': {
    question: 'Antrenman programının sürdürülebilir olması için hangi iki ölçüt birlikte sağlanmalıdır?',
    options: ['Planlı ve tekrarlı olması', 'Tekrarlı fakat programsız olması', 'Yalnızca yüksek şiddette yapılması', 'Günlük yaşam akışında kendiliğinden oluşması'],
    answer: 'Planlı ve tekrarlı olması'
   },
   // Özgün: farklı kavram, farklı şıklar, farklı cevap
   original: {
    question: 'Sürantrenman riskini artıran temel yüklenme hatası aşağıdakilerden hangisidir?',
    options: ['Yetersiz toparlanmayla yükü sürekli artırmak', 'Haftalık hacmi kademeli ve düzenli artırmak', 'Sezon içi dinlenme günlerini planlamak', 'Bireysel yanıta göre şiddeti ayarlamak'],
    answer: 'Yetersiz toparlanmayla yükü sürekli artırmak'
   }
  };
  const draft = drafts[mode] || drafts.original;
  generatorCalls++;
  return res.end(JSON.stringify({
   response: JSON.stringify({
    question: draft.question,
    options: draft.options,
    answer: draft.answer,
    explanation: 'Konu anlatımında bu bilgi doğrudan geçer ve kalıcı öğrenme için püf noktasıdır.',
    evidence,
    topic: 'Egzersiz ve yüklenme',
    questionType: 'kavram',
    questionAngle: 'dogrudan_tanim',
    bloomLevel: 'Kavrama'
   })
  }));
 });

 await listen(fake);
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
 process.env.OLLAMA_MODEL = 'fake:1';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?dedup=${Date.now()}`);
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
  // 1) Kökü neredeyse aynı + aynı cevap => tekrar sayılır
  mode = 'near-dup';
  const dupRes = await generate();
  const dupJson = await dupRes.json();
  assert.equal(dupRes.status, 502, JSON.stringify(dupJson));
  assert.match(dupJson.error || '', /benzer|kayıtlı/);

  // 2) Aynı şık takımıyla kurulmuş soru da tekrar sayılır
  mode = 'same-options';
  const sameRes = await generate();
  const sameJson = await sameRes.json();
  assert.equal(sameRes.status, 502, JSON.stringify(sameJson));
  assert.match(sameJson.error || '', /şık|benzer|kayıtlı/);

  // 3) Farklı kavram + farklı şıklar + farklı cevap => kabul
  mode = 'original';
  const okRes = await generate();
  const okJson = await okRes.json();
  assert.equal(okRes.status, 200, JSON.stringify(okJson));
  assert.equal(okJson.item.status, 'approved');
  assert.equal(okJson.item.answer, 'Yetersiz toparlanmayla yükü sürekli artırmak');
  assert.ok(generatorCalls >= 3);
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

test('Paragraf (parçaya dayalı) sorular: kitaptan birebir parça kabul edilir, uydurma parça reddedilir', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-paragraph-'));
 const contexts = JSON.parse(readFileSync(resolve(process.cwd(), 'server/contexts.json'), 'utf8'));
 const ctx = contexts.find(c => c.id === '0-0');
 const sentences = ctx.text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 40);
 const paragraph = sentences.slice(0, 3).join(' ');
 const evidence = sentences[0];
 assert.ok(paragraph.length >= 180, 'Test verisi için yeterli uzunlukta parça olmalı');

 const prevData = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 let useVerbatim = true;

 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const data = JSON.parse(raw || '{}');
  const prompt = data.prompt || '';

  if (prompt.includes('soru denetçisisin')) {
   const optionsMatch = prompt.match(/SEÇENEKLER: ([\s\S]*)$/);
   const options = optionsMatch ? JSON.parse(optionsMatch[1]) : [];
   return res.end(JSON.stringify({
    response: JSON.stringify({
     answer: options[0],
     singleCorrect: true,
     dualAnswerRisk: false,
     secondBestOption: '',
     supported: true,
     qualityOk: true,
     qualityScore: 4.8,
     examPotential: 4.9,
     distractorPlausible: true,
     difficulty: 'orta',
     bloomLevel: 'Analiz',
     evidence,
     reason: 'Parça ve doğru şık kaynakla uyumlu.'
    })
   }));
  }

  const options = [
   'Egzersizin planlı, yapılandırılmış ve tekrarlı bir etkinlik olması',
   'Egzersizin tek seferlik yüksek şiddetli bir deneme olması',
   'Egzersizin programsız ama günlük tekrarlanan bir akış olması',
   'Egzersizin müsabaka günüyle sınırlı bir hazırlık olması'
  ];
  return res.end(JSON.stringify({
   response: JSON.stringify({
    question: 'Bu parçadan aşağıdaki yargılardan hangisine ulaşılabilir?',
    options,
    answer: options[0],
    explanation: 'Parçada egzersizin planlı ve tekrarlı bir etkinlik olduğu doğrudan belirtilir.',
    evidence: useVerbatim ? evidence : evidence,
    topic: 'Egzersiz tanımı',
    questionType: 'paragraf',
    questionAngle: 'surpriz_baglam',
    bloomLevel: 'Analiz',
    // Kaynaktan birebir alınmış parça ya da uydurma parça
    paragraph: useVerbatim
     ? paragraph
     : 'Bu cümlelerin tamamı test için uydurulmuştur. Kaynak kitabın hiçbir yerinde böyle bir anlatım geçmez. Bu yüzden paragraf sorusunun parçası olamaz.'
   })
  }));
 });

 await listen(fake);
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
 process.env.OLLAMA_MODEL = 'fake:1';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?paragraph=${Date.now()}`);
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
  // 1) Kaynaktan birebir alınmış parça kabul edilir ve soruya "paragraf" tipi işlenir
  useVerbatim = true;
  const okRes = await generate();
  const okJson = await okRes.json();
  assert.equal(okRes.status, 200, JSON.stringify(okJson));
  assert.equal(okJson.item.status, 'approved');
  assert.equal(okJson.item.questionType, 'paragraf');
  assert.equal(okJson.item.paragraph, paragraph, 'Parça birebir kaydedilmeli');
  assert.equal(okJson.item.question, 'Bu parçadan aşağıdaki yargılardan hangisine ulaşılabilir?');
  assert.equal(okJson.item.options.length, 4);

  // Kaydedilen soru listede paragrafıyla birlikte döner
  const list = await (await fetch(`${base}/questions`)).json();
  const saved = list.items.find(x => x.id === okJson.item.id);
  assert.ok(saved && saved.paragraph === paragraph, 'Paragraf havuzda kalıcı olmalı');

  // 2) Uydurma parça: kaynakta geçmediği için reddedilir
  useVerbatim = false;
  const badRes = await generate();
  const badJson = await badRes.json();
  assert.equal(badRes.status, 502, JSON.stringify(badJson));
  assert.match(badJson.error || '', /[Pp]aragraf|birebir/);
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

test('Arka plan üretimi: art arda üretilen sorular birbirinin aynısı/çok benzeri olmaz', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-autodedup-'));
 const prevData = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 // Model her çağrıda FARKLI bir kavram + farklı cevap + farklı şıklar döner.
 const drafts = [
  {
   question: 'Sürantrenman riskini artıran temel yüklenme hatası aşağıdakilerden hangisidir?',
   options: ['Yetersiz toparlanmayla yükü sürekli artırmak', 'Haftalık hacmi kademeli artırmak', 'Dinlenme günlerini planlamak', 'Şiddeti bireysel yanıta göre ayarlamak'],
   answer: 'Yetersiz toparlanmayla yükü sürekli artırmak'
  },
  {
   question: 'Akut yanıt ile kronik uyum arasındaki temel ayrım nedir?',
   options: ['Akut yanıt tek seansa, kronik uyum tekrarlanan çalışmalara bağlıdır', 'İkisi de yalnızca tek seansta oluşur', 'Kronik uyum bir haftada tamamlanır', 'Akut yanıt kalıcıdır, kronik uyum geçicidir'],
   answer: 'Akut yanıt tek seansa, kronik uyum tekrarlanan çalışmalara bağlıdır'
  },
  {
   question: 'Fazla tamamlama (süperkompansasyon) hangi koşulda ortaya çıkar?',
   options: ['Yeterli toparlanmayla kapasitenin başlangıç düzeyini aşmasıyla', 'Yüklenmenin tamamen kesilmesiyle', 'Toparlanma olmadan yükün artmasıyla', 'Antrenman sıklığının azaltılmasıyla'],
   answer: 'Yeterli toparlanmayla kapasitenin başlangıç düzeyini aşmasıyla'
  }
 ];
 let cursor = 0;
 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const data = JSON.parse(raw || '{}');
  const prompt = data.prompt || '';
  const evidence = 'Egzersiz planlı ve tekrarlıdır';
  if (prompt.includes('soru denetçisisin')) {
   const optsMatch = prompt.match(/SEÇENEKLER: ([\[\s\S]*?\])/);
   let answer = '';
   try { if (optsMatch) answer = JSON.parse(optsMatch[1])[0]; } catch {}
   return res.end(JSON.stringify({
    response: JSON.stringify({
     answer, singleCorrect: true, dualAnswerRisk: false, secondBestOption: '', supported: true,
     qualityOk: true, qualityScore: 4.8, examPotential: 4.8, distractorPlausible: true,
     difficulty: 'kolay', bloomLevel: 'Kavrama', evidence, reason: 'Anlatım bu bilgiyi destekliyor.'
    })
   }));
  }
  const draft = drafts[cursor % drafts.length];
  cursor++;
  return res.end(JSON.stringify({
   response: JSON.stringify({
    question: draft.question, options: draft.options, answer: draft.answer,
    explanation: 'Konu anlatımında bu bilgi doğrudan geçer ve kalıcı ezber için püf noktası içerir.',
    evidence, topic: 'Antrenman yüklenmesi', questionType: 'kavram',
    questionAngle: 'dogrudan_tanim', bloomLevel: 'Kavrama'
   })
  }));
 });

 await listen(fake);
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
 process.env.OLLAMA_MODEL = 'fake:1';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?autodedup=${Date.now()}`);
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

 try {
  // Aynı üniteden art arda 3 + 1 üretim: son tur model tekrar ilk soruya dönse bile kabul edilmemeli.
  for (let i = 0; i < 3; i++) {
   const res = await fetch(`${base}/generate`, { method: 'POST', headers, body: JSON.stringify({ units: ['0-0'] }) });
   assert.equal(res.status, 200, JSON.stringify(await res.json()));
  }
  const repeat = await fetch(`${base}/generate`, { method: 'POST', headers, body: JSON.stringify({ units: ['0-0'] }) });
  assert.equal(repeat.status, 502, 'Model aynı soruya dönünce tekrar koruması reddetmeli');
  assert.match((await repeat.json()).error || '', /benzer|kayıtlı/);

  const list = await (await fetch(`${base}/questions`)).json();
  const saved = list.items.filter(x => x.status === 'approved');
  assert.equal(saved.length, 3, `3 özgün soru kaydedilmeli, gelen: ${saved.length}`);

  // Kaydedilen sorular birbirinin aynısı/çok benzeri değil
  for (let i = 0; i < saved.length; i++) {
   for (let j = i + 1; j < saved.length; j++) {
    assert.ok(simq(saved[i].question, saved[j].question) < 0.78, `Soru kökleri çok benzer: "${saved[i].question}" / "${saved[j].question}"`);
    assert.ok(optOverlap(saved[i], saved[j]) < 0.75, `Şık takımları çok benzer: "${saved[i].question}" / "${saved[j].question}"`);
    assert.notEqual(normq(saved[i].answer), normq(saved[j].answer), 'Doğru cevaplar farklı olmalı');
   }
  }
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

test('Havuz botu: yapay zekânın ürettiği tıpatıp benzeri soruları havuzdan ayıklar', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-curator-dedup-'));
 try {
  const bot = new PoolCuratorBot(dir, { minKeepPerUnit: 2, minKeepPerTier: 3 });
  const items = [];
  // 20 gerçekten farklı soru: farklı kavram, farklı kalıp, farklı doğru cevap
  const uniq = [
   ['Antrenman yüklenmesinde şiddet hangi ölçütü ifade eder?', 'Çalışmanın yoğunluğu'],
   ['Haftalık toplam tekrar sayısı hangi yüklenme ögesidir?', 'Hacim'],
   ['Aynı programın her sporcuya uygulanmaması hangi ilkeyi anlatır?', 'Bireyselleştirme'],
   ['Antrenmanın yıl boyu düzenli sürdürülmesi hangi ilkedir?', 'Süreklilik'],
   ['Farklı egzersizlerle zenginleştirilen program hangi ilkeye örnektir?', 'Çeşitlilik'],
   ['Branşın gerektirdiği özelliklere odaklanma hangi ilkedir?', 'Branşa özgülük'],
   ['Yüklenme sonrası kısa süreli kapasite düşüşü hangi kavramdır?', 'Akut yorgunluk'],
   ['Tekrarlanan çalışmalarla oluşan kalıcı uyum hangi kavramdır?', 'Kronik uyum'],
   ['Toparlanmayla kapasitenin başlangıç düzeyini aşması hangi kavramdır?', 'Süperkompansasyon'],
   ['Antrenman bırakıldığında uyumun kaybı hangi kavramdır?', 'Detraining'],
   ['Uzun süreli performans düşüşü ve birikmiş yorgunluk hangi durumu düşündürür?', 'Sürantrenman'],
   ['Tek bir antrenman seansının hedefi hangi döngüde planlanır?', 'Birim antrenman'],
   ['Haftalık antrenman planı hangi döngü olarak adlandırılır?', 'Mikro döngü'],
   ['Sezon ölçeğindeki antrenman planı hangi düzeydedir?', 'Makro plan'],
   ['Sporcu gelişim modelinde erken yaşta çok yönlü spor hangi evrededir?', 'Çeşitlilik evresi'],
   ['Uzmanlaşma dönemine geçiş hangi modelin evresidir?', 'Sporcu gelişim modeli'],
   ['Isınma bölümünün temel amacı aşağıdakilerden hangisidir?', 'Vücudu yüklenmeye hazırlamak'],
   ['Bitiriş (soğuma) bölümü hangi işlevi görür?', 'Toparlanmayı hızlandırmak'],
   ['Kuvvet ölçümünde dikey sıçrama hangi özelliğe örnektir?', 'Patlayıcı kuvvet'],
   ['Mekik koşusu testi hangi kapasitenin tahmininde kullanılır?', 'Aerobik kapasite']
  ];
  const distractorSets = [
   ['Yalnızca tek seferlik maksimum yük uygulamak', 'Ölçütü tamamen antrenör sezgisine bırakmak', 'Hedef özelliği dikkate almadan sabit program'],
   ['Haftalık düzene bakmadan günlük karar vermek', 'Yüklenmeyi yalnızca yarışma gününe bırakmak', 'Blok sıralamasını rastgele değiştirmek'],
   ['Ölçümü hiç kaydetmemek', 'Sonucu yalnızca gözle değerlendirmek', 'Testi her antrenmanda tekrarlamak'],
   ['Kademeli artış yerine ani sıçrama yapmak', 'Toparlanmayı planın dışında tutmak', 'Bireysel yanıtı yok saymak'],
   ['Dönem hedefini göz ardı etmek', 'Bloğu sezon sonuna bırakmak', 'Aynı bloğu tüm sezon tekrarlamak']
  ];
  uniq.forEach(([question, answer], i) => {
   items.push({
    id: `uniq-${i}`,
    unitId: '0-0',
    difficulty: ['kolay', 'orta', 'zor'][i % 3],
    status: 'approved',
    question,
    options: [answer, ...distractorSets[i % distractorSets.length]],
    answer,
    explanation: 'Antrenmanda kalıcı gelişim için ölçüt hedef özelliğe uygun seçilmelidir.',
    evidence: 'Antrenmanda ölçüt hedefe göre seçilir.',
    qualityScore: 4.6,
    examPotential: 4.6
   });
  });
  // 20 adet neredeyse aynı soru (modelin aynı kavramı tekrar tekrar sorması)
  for (let i = 0; i < 20; i++) {
   const filler = ['A', 'B', 'C', 'D', 'E'][i % 5];
   items.push({
    id: `dup-${i}`,
    unitId: '0-0',
    difficulty: ['kolay', 'orta', 'zor'][i % 3],
    status: 'approved',
    question: `Antrenman yüklenmesinde ${filler} değişkeni için toparlanma dengesi nasıl kurulmalıdır?`,
    options: ['Progresif yüklenme ve yeterli toparlanma dengesi kurularak', 'Tamamen dinlenmeden sürekli maksimal yüklenme', 'Bireysel farklılıkları göz ardı eden sabit şablon', 'Isınma ve soğumayı kaldıran yoğunluk modeli'],
    answer: 'Progresif yüklenme ve yeterli toparlanma dengesi kurularak',
    explanation: 'Antrenmanda kalıcı gelişim için yüklenme ile toparlanma dengesi kurulmalıdır.',
    evidence: 'Antrenmanda progresif yüklenme ve toparlanma dengesi temel ilkedir.',
    qualityScore: 4.6,
    examPotential: 4.6
   });
  }

  const res = await bot.scanAndPrune({ items });
  const remaining = res.items.filter(x => x.status === 'approved');
  assert.ok(res.report.nearDuplicatesFound >= 12, `Yakın tekrarların çoğu yakalanmalı, gelen: ${res.report.nearDuplicatesFound}`);
  assert.ok(remaining.length <= 30, `Tekrarlar ayıklandıktan sonra havuz küçülmeli, gelen: ${remaining.length}`);
  const dupLeft = remaining.filter(x => String(x.id).startsWith('dup-')).length;
  assert.ok(dupLeft <= 8, `Aynı kalıptan en fazla birkaç soru kalmalı, gelen: ${dupLeft}`);
  const uniqLeft = remaining.filter(x => String(x.id).startsWith('uniq-')).length;
  assert.ok(uniqLeft >= 14, `Özgün sorular korunmalı, gelen: ${uniqLeft}`);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});
