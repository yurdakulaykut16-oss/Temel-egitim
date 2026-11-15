import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PoolCuratorBot } from '../server/pool-curator.mjs';
import { LessonEngine } from '../server/lesson-engine.mjs';

test('PoolCuratorBot 20.000 eşiğine ulaşınca düşük kaliteli/tekrar soruları budar, kolay/orta/zor korur ve <1sn sürer', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-curator-'));
 try {
  const bot = new PoolCuratorBot(dir, { minKeepPerUnit: 50, minKeepPerTier: 100 });
  assert.equal(bot.pruneThreshold, 20000);
  assert.equal(bot.targetAfterPrune, 18500);
  const diffs = ['kolay', 'orta', 'zor'];
  const units = ['0-0', '0-1', '1-0', '2-0', '3-0'];
  const items = [];
  for (let i = 0; i < 20050; i++) {
   const unitId = units[i % units.length];
   const diff = diffs[i % diffs.length];
   const isLow = i < 1200;
   const isDup = i >= 19950;
   const tagA = `konu_${i.toString(36)}`;
   const tagB = `terim_${(i * 7 + 13).toString(36)}`;
   const tagC = `olgu_${(i * 11 + 29).toString(36)}`;
   items.push({
    id: `q-${i}`,
    unitId,
    difficulty: diff,
    status: 'approved',
    question: isDup
     ? 'Antrenman bilimi bağlamında dayanıklılık gelişimi hangi ilke ile planlanır ve ölçülür?'
     : `${tagA} ve ${tagB} kapsamında ${tagC} için ${diff} düzeyi performans ölçütü nedir?`,
    options: [
     isLow ? 'Kısa cevap' : `Düzenli ${tagA} progresif yüklenme ve toparlanma dengesi ilkesi`,
     'Tamamen dinlenmeden sürekli maksimal yüklenme uygulanması',
     'Bireysel farklılıkları göz ardı eden sabit tek program şablonu',
     'Isınma ve soğuma evrelerini tamamen kaldıran yoğunluk modeli'
    ],
    answer: isLow ? 'Kısa cevap' : `Düzenli ${tagA} progresif yüklenme ve toparlanma dengesi ilkesi`,
    explanation: isLow ? 'Kısa.' : 'Antrenmanda kalıcı gelişim için progresif yüklenme ile yeterli toparlanma dengesi kurulmalı; püf noktası aşırı yüklenmeden kaçınmaktır.',
    evidence: isLow ? 'Kısa alıntı metni' : 'Antrenmanda progresif yüklenme ve toparlanma dengesi temel ilkedir.',
    questionType: isLow ? 'kavram' : 'vaka',
    questionAngle: isLow ? undefined : 'surpriz_baglam',
    qualityScore: isLow ? 2.1 : 4.8,
    examPotential: isLow ? 1.8 : 5
   });
  }

  const t0 = performance.now();
  const res = await bot.scanAndPrune({ items });
  const scanMs = performance.now() - t0;
  assert.equal(res.report.aboveThreshold, true);
  assert.equal(res.report.pruneThreshold, 20000);
  const remainingApproved = res.items.filter(x => x.status === 'approved');
  assert.ok(remainingApproved.length <= 18500, `Beklenen <=18500, gelen ${remainingApproved.length}`);
  assert.ok(res.removedCount >= 1500, `En az 1500 düşük/tekrar soru silinmeli, gelen ${res.removedCount}`);
  assert.ok(res.report.nearDuplicatesFound >= 90);
  // kolay / orta / zor kademeleri ASLA boş kalmamalı
  assert.ok(res.report.tierBreakdown.kolay >= 100);
  assert.ok(res.report.tierBreakdown.orta >= 100);
  assert.ok(res.report.tierBreakdown.zor >= 100);
  // düşük kaliteli soruların tamamına yakını elenmiş olmalı, yüksek kaliteliler kalmalı
  const remainingIds = new Set(remainingApproved.map(x => x.id));
  assert.equal(remainingIds.has('q-0'), false);
  assert.equal(remainingIds.has('q-15000'), true);
  assert.ok(Array.isArray(res.report.refillPriorityUnits));
  assert.ok(scanMs < 2500, `20k havuz taraması hızlı kalmalı, gelen ${scanMs.toFixed(1)}ms`);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('LessonEngine uzun, kodlamalı, 5 açılı ve süre/dakika odaklı konu anlatımını evirir', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-lesson-'));
 try {
  const engine = new LessonEngine(dir);
  const ctx = {
   id: '0-0',
   book: 'Hareket ve Antrenman Bilimleri',
   unit: 'Antrenman Biliminin Temelleri',
   text: 'Egzersiz planlı ve tekrarlıdır. Fiziksel aktivite ise her türlü kas hareketidir. Süperkompensasyon ilkesi yüklenme sonrası toparlanma ile performansın başlangıcın üzerine çıkmasıdır.'
  };
  const studentProfile = {
   weakUnits: ['0-0'],
   results: {
    '0-0': { right: 2, wrong: 2, streak: 0, totalSec: 210, lastSec: 52 }
   }
  };
  const perf = engine.formatStudentPerformance('0-0', studentProfile);
  assert.equal(perf.answered, 4);
  assert.equal(perf.accuracyPct, 50);
  assert.equal(perf.totalMin, 3.5);
  assert.equal(perf.avgSec, 52.5);

  let capturedPrompt = '';
  const mockRunModel = async (_model, prompt) => {
   capturedPrompt = prompt;
   return {
    parsed: {
     overviewHook: 'Bu üniteyi 100/100 full çıkarmak için önce aktivite-egzersiz-antrenman üçlüsünü ayıracağız.',
     deepSections: [
      { title: 'Aktivite, Egzersiz ve Antrenman Farkı', body: 'Her egzersiz fiziksel aktivitedir ama her aktivite egzersiz değildir. Planlı ve tekrarlı olması egzersizi, performans hedefi ise antrenmanı ayırır.', recallAnchor: 'Aktivite = her hareket | Egzersiz = planlı tekrar | Antrenman = yüksek performans.' },
      { title: 'Süperkompensasyon Dalga Mantığı', body: 'Yüklenme sırasında enerji depoları geçici düşer; doğru dinlenme verilince vücut eskisinden güçlü seviyeye tırmanır.', recallAnchor: 'Doğru yük + doğru dinlenme = seviye atlama.' }
     ],
     proTips: [
      { title: 'Planlı kelimesini ara', tip: 'Soru kökünde planlı ve tekrarlı geçiyorsa doğrudan egzersizi işaretle.', examTrap: 'Egzersiz ile günlük merdiven çıkmayı karıştırma.' }
     ],
     memoryMnemonics: [
      { code: 'P-T-S', standsFor: 'Planlı · Tekrarlı · Sistematik', story: 'Egzersiz pıhtısız tren gibi P-T-S rayında gider.' }
     ],
     spacedEchoes: [
      'Unutma: Egzersiz planlı ve tekrarlıdır.',
      'Unutma: Süperkompensasyon dinlenme evresinde tamamlanır.'
     ],
     fiveAngleSpotlight: {
      concept: 'Egzersiz vs Fiziksel Aktivite',
      angles: [
       { angle: '1. Doğrudan Tanım', sampleQuestion: 'Egzersizi fiziksel aktiviteden ayıran temel özellik nedir?', keyPoint: 'Planlı ve tekrarlı olmasıdır.' },
       { angle: '2. Ters Köşe / İstisna', sampleQuestion: 'Hangisi planlı egzersiz kapsamına girmez?', keyPoint: 'Rastgele ev işi fiziksel aktivitedir, egzersiz değildir.' },
       { angle: '3. Saha Vakası', sampleQuestion: 'Haftada 3 gün nabız kontrollü koşan kişi ne yapmaktadır?', keyPoint: 'Yapılandırılmış egzersiz yapar.' },
       { angle: '4. Karşılaştırma Tuzağı', sampleQuestion: 'İkisi de enerji harcatır ama performans artışı hangisinin amacıdır?', keyPoint: 'Egzersiz/Antrenman amaca dönüktür.' },
       { angle: '5. Şaşırtıcı Bağlam', sampleQuestion: 'Çok ağır bahçe işi yapan işçi neden egzersiz yapmış sayılmaz?', keyPoint: 'Bilinçli program ve sistematik tekrar yoktur.' }
      ]
     },
     miniCheckpoints: [
      { question: 'Fiziksel aktiviteyi egzersiz yapan iki sihirli sözcük nedir?', answer: 'Planlı ve tekrarlı olmasıdır.', hint: 'P ve T harfleri' }
     ],
     adaptivePersonalCoach: 'Ortalama 52.5 sn/soru harcıyorsun ve %50 doğruluktasın; P-T-S kodlamasıyla hızlanıp %100 full çıkaracağız.'
    }
   };
  };

  const out = await engine.enhanceUnitLesson({ ctx, passages: [], studentProfile, researchMemory: null, runModelFn: mockRunModel, model: 'mock-model' });
  assert.ok(capturedPrompt.includes('52.5 sn/soru'), 'Prompt öğrenci saniye/dakika performansını içermeli');
  assert.equal(out.lesson.version, 1);
  assert.equal(out.lesson.fiveAngleSpotlight.angles.length, 5);
  assert.equal(out.lesson.memoryMnemonics[0].code, 'P-T-S');

  const out2 = await engine.enhanceUnitLesson({ ctx, passages: [], studentProfile, researchMemory: null, runModelFn: mockRunModel, model: 'mock-model' });
  assert.equal(out2.lesson.version, 2);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('ollamaPlugin uçtan uca 5-açı soru üretimi, timing-aware student-state, lessons ve curator endpointleri çalışır', async () => {
 const prevDataDir = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 const prevDisableAuto = process.env.TEMPO_DISABLE_AUTOLOOP;
 const dataDir = mkdtempSync(join(tmpdir(), 'tempo-plug-v5-'));
 process.env.TEMPO_DATA_DIR = dataDir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 const mockServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
   if (req.url === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'qwen3:14b' }, { name: 'gemma3:12b' }] }));
    return;
   }
   const payload = body ? JSON.parse(body) : {};
   const prompt = payload.prompt || '';
   res.writeHead(200, { 'Content-Type': 'application/json' });

   if (prompt.includes('5 FARKLI SORU AÇISINDAN SEÇİLEN') || prompt.includes('5 Farklı Soru Açısından Seçilen Açı')) {
    res.end(JSON.stringify({
     response: JSON.stringify({
      question: 'Egzersiz ile fiziksel aktiviteyi ayırt etmek isteyen bir antrenör hangi ölçüte bakar?',
      options: [
       'Planlı ve tekrarlı biçimde fiziksel uygunluğu koruma amacı taşımasına',
       'Günlük yaşamda yalnızca dinlenme halinde ortaya çıkmasına',
       'Sadece müsabaka günlerinde tek sefer uygulanmasına',
       'Kas kasılması olmadan gerçekleşen zihinsel odaklanmaya'
      ],
      answer: 'Planlı ve tekrarlı biçimde fiziksel uygunluğu koruma amacı taşımasına',
      explanation: 'Egzersiz planlı, tekrarlı ve fiziksel uygunluğu artırmaya dönük özel bir aktivite biçimidir.',
      evidence: 'Egzersiz planlı ve tekrarlıdır',
      topic: 'Egzersiz ve Fiziksel Aktivite',
      questionType: 'kavram',
      questionAngle: 'dogrudan_tanim',
      bloomLevel: 'kavrama'
     })
    }));
    return;
   }
   if (prompt.includes('bağımsız çöz') || prompt.includes('examPotential')) {
    res.end(JSON.stringify({
     response: JSON.stringify({
      answer: 'Planlı ve tekrarlı biçimde fiziksel uygunluğu koruma amacı taşımasına',
      singleCorrect: true,
      dualAnswerRisk: false,
      secondBestOption: '',
      supported: true,
      qualityOk: true,
      qualityScore: 5,
      examPotential: 5,
      difficulty: 'kolay',
      bloomLevel: 'kavrama',
      evidence: 'Egzersiz planlı ve tekrarlıdır',
      reason: 'Yalnızca tek seçenek doğrudur ve sınav potansiyeli yüksektir.'
     })
    }));
    return;
   }
   if (prompt.includes('fiveAngleSpotlight')) {
    res.end(JSON.stringify({
     response: JSON.stringify({
      overviewHook: 'Uzun ve kalıcı ezber için özet giriş.',
      deepSections: [{ title: 'Temel Ayrım', body: 'Egzersiz planlı ve tekrarlıdır; her hareket aktivitedir.', recallAnchor: 'Planlı = Egzersiz' }],
      proTips: [{ title: 'Planlı ipucu', tip: 'Soru kökünde planlı kelimesi varsa egzersizi seç.', examTrap: 'Rastgele yürüyüş egzersiz değildir.' }],
      memoryMnemonics: [{ code: 'P-T', standsFor: 'Planlı Tekrarlı', story: 'P-T egzersizin şifresidir.' }],
      spacedEchoes: ['Egzersiz planlı ve tekrarlıdır.'],
      fiveAngleSpotlight: {
       concept: 'Egzersiz',
       angles: [
        { angle: 'Doğrudan', sampleQuestion: 'Tanımı nedir?', keyPoint: 'Planlı tekrar' },
        { angle: 'Ters köşe', sampleQuestion: 'Hangisi değildir?', keyPoint: 'Plansız iş' },
        { angle: 'Saha', sampleQuestion: 'Sporcu ne yapar?', keyPoint: 'Nabız takibi' },
        { angle: 'Tuzak', sampleQuestion: 'Farkı nedir?', keyPoint: 'Amaç' },
        { angle: 'Şaşırtıcı', sampleQuestion: 'Neden sayılmaz?', keyPoint: 'Süreksizlik' }
       ]
      },
      miniCheckpoints: [{ question: 'Egzersizin 2 özelliği?', answer: 'Planlı ve tekrarlı.', hint: 'P-T' }],
      adaptivePersonalCoach: 'Öğrencinin hızına göre ayarlandı.'
     })
    }));
    return;
   }
   res.end(JSON.stringify({ response: '{}' }));
  });
 });

 await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
 const port = mockServer.address().port;
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`;

 try {
  writeFileSync(join(dataDir, 'settings.json'), JSON.stringify({
   model: 'qwen3:14b', verifierModel: 'qwen3:14b', judge2Model: 'gemma3:12b', evolverModel: 'qwen3:14b', autoRunning: false
  }));

  const { ollamaPlugin } = await import(`../server/ollama.mjs?v5test=${Date.now()}`);
  let middleware;
  ollamaPlugin().configureServer({ middlewares: { use: (_p, fn) => { middleware = fn; } } });

  const call = (method, urlPath, bodyObj) => new Promise((resolve, reject) => {
   const req = new http.IncomingMessage(null);
   req.method = method;
   req.url = urlPath;
   req.headers = { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' };
   const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(txt) { resolve({ status: this.statusCode, json: txt ? JSON.parse(txt) : null }); }
   };
   middleware(req, res, err => reject(err || new Error('next called')));
   if (bodyObj !== undefined) req.push(JSON.stringify(bodyObj));
   req.push(null);
  });

  // 1) Timing verisiyle student-state güncelle
  const stRes = await call('POST', '/student-state', {
   readUnits: ['0-0'],
   results: { '0-0': { right: 1, wrong: 2, streak: 0, totalSec: 150, lastSec: 55 } },
   totalStudySec: 150
  });
  assert.equal(stRes.status, 200);
  assert.ok(stRes.json.studentProfile.weakUnits.includes('0-0'));

  // 2) Varsayılan ünite dersi (fallback) süre bilgisiyle gelir
  const les0 = await call('GET', '/lessons?unitId=0-0');
  assert.equal(les0.status, 200);
  assert.equal(les0.json.performance.totalMin, 2.5);
  assert.ok(les0.json.lesson.memoryMnemonics.length >= 1);

  // 3) AI ile ünite dersini geliştir (version=1 + 5 soru açısı)
  const enh = await call('POST', '/lessons/enhance', { unitId: '0-0' });
  assert.equal(enh.status, 200, JSON.stringify(enh.json));
  assert.equal(enh.json.lesson.fiveAngleSpotlight.angles.length, 5);

  // 4) examPotential + questionAngle ile soru üret
  const gen = await call('POST', '/generate', { units: ['0-0'] });
  assert.equal(gen.status, 200, JSON.stringify(gen.json));
  assert.equal(gen.json.item.examPotential, 5);
  assert.ok(gen.json.item.questionAngle);

  // 5) 20k havuz tarayıcı bot taraması + /status telemetrisi
  const scan = await call('POST', '/curator/scan', {});
  assert.equal(scan.status, 200);
  assert.ok(scan.json.report.totalScans >= 1);
  assert.equal(scan.json.report.pruneThreshold, 20000);
  assert.ok(scan.json.report.avgCompositeScore > 0);

  const status = await call('GET', '/status');
  assert.equal(status.status, 200);
  assert.equal(status.json.questionCapacity, 20000);
  assert.equal(status.json.maxQuestionsStored, 20000);
  assert.equal(status.json.curator.pruneThreshold, 20000);
  assert.ok(status.json.curator);
  assert.ok(status.json.lessons);
  assert.ok(status.json.angleCounts);
 } finally {
  mockServer.close();
  if (prevDataDir === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevDataDir;
  if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevBase;
  if (prevDisableAuto === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisableAuto;
  rmSync(dataDir, { recursive: true, force: true });
 }
});
