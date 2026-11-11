import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LessonEngine } from '../server/lesson-engine.mjs';
import { VideoDirector } from '../server/video-director.mjs';

test('LessonEngine çok yanlışta tekrar okumaya yönlendirir ve reframe ile kodlamaları + stili tamamen değiştirir', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-reframe-'));
 try {
  const engine = new LessonEngine(dir);
  const ctx = {
   id: '0-0',
   book: 'Hareket ve Antrenman Bilimleri',
   unit: 'Antrenman Biliminin Temelleri',
   text: 'Süperkompensasyon dinlenme sonrası performans artışıdır. Progresif yüklenme yükün kademeli artırılmasıdır.'
  };
  const passages = [
   { id: '0-0#01', heading: 'Süperkompensasyon Eğrisi', pages: [12, 13], text: 'Yüklenme sonrası yorgunluk oluşur ve dinlenme döneminde depolar eski seviyesinin üzerine çıkar.' },
   { id: '0-0#02', heading: 'Progresif Artış', pages: [14], text: 'Yük değişmezse organizma adapte olur ve gelişim durur.' }
  ];
  const studentProfile = {
   weakUnits: ['0-0'],
   results: {
    '0-0': { right: 1, wrong: 3, streak: 0, totalSec: 200, lastSec: 50 }
   }
  };

  const perf = engine.formatStudentPerformance('0-0', studentProfile);
  assert.equal(perf.needsReread, true);
  assert.equal(perf.needsReframe, true);
  assert.match(perf.recommendation, /oku|tekrar/i);

  // İlk versiyon: K-D-S kodlaması
  const v1 = await engine.enhanceUnitLesson({
   ctx, passages, studentProfile,
   model: 'mock-model',
   runModelFn: async () => ({
    parsed: {
     overviewHook: 'İlk anlatım',
     deepSections: [
      { title: 'Temel Kavramlar', body: 'Uzun anlatım metni en az yirmi beş karakterden uzun olacak şekilde hazırlanmıştır.', recallAnchor: 'Çıpa 1' },
      { title: 'Süperkompensasyon Mantığı', body: 'Dinlenme evresi artışı ile performans başlangıcın üzerine tırmanır.', recallAnchor: 'Çıpa 2' }
     ],
     proTips: [{ title: 'Püf', tip: 'İpucu', examTrap: 'Tuzak' }],
     memoryMnemonics: [{ code: 'K-D-S', standsFor: 'Kuvvet Dayanıklılık Sürat', story: 'Klasik hikâye' }],
     spacedEchoes: ['Yankı 1'],
     miniCheckpoints: [{ question: 'Soru?', answer: 'Cevap.', hint: 'KDS' }],
     everyCornerDetails: [{ heading: 'Progresif Artış', keyFact: 'Yük artmazsa gelişim durur.', whyItCouldBeAsked: '20 soru içinde sürpriz gelebilir.' }],
     adaptivePersonalCoach: 'İlk koç notu'
    }
   })
  });
  assert.equal(v1.lesson.reframeCount, 1);
  assert.equal(v1.lesson.everyCornerDetails.length, 1);

  // Reframe: eski K-D-S kodlaması yasaklanmalı, anlatım stili değişmeli
  let seenPrompt = '';
  const v2 = await engine.enhanceUnitLesson({
   ctx, passages, studentProfile,
   forceReframe: true,
   model: 'mock-model',
   runModelFn: async (_m, prompt) => {
    seenPrompt = prompt;
    return {
     parsed: {
      overviewHook: 'Tamamen yeni benzetmeyle anlatım!',
      deepSections: [
       { title: 'Saha Hikâyesi', body: 'Merdiven basamağı benzetmesiyle anlatım.', recallAnchor: 'Basamak çıpası' },
       { title: 'İkinci Adım', body: 'Gerçek müsabaka örneğiyle pekiştirme.', recallAnchor: 'Müsabaka çıpası' }
      ],
      proTips: [{ title: 'Yeni Püf', tip: 'Yeni ipucu', examTrap: 'Yeni tuzak' }],
      memoryMnemonics: [{ code: 'M-E-R-D-İ', standsFor: 'Merdiven Etkisiyle Rahat Dinlen İlerle', story: 'Asla K-D-S değil bambaşka merdiven hikâyesi!' }],
      spacedEchoes: ['Yeni yankı'],
      miniCheckpoints: [{ question: 'Yeni soru?', answer: 'Yeni cevap.', hint: 'MERDİ' }],
      everyCornerDetails: [
       { heading: 'Süperkompensasyon Eğrisi', keyFact: 'Dinlenme evresinde artış olur.', whyItCouldBeAsked: 'Ya çıkarsa?' },
       { heading: 'Progresif Artış', keyFact: 'Sabit yük gelişimi durdurur.', whyItCouldBeAsked: 'Ya çıkarsa?' }
      ],
      adaptivePersonalCoach: 'Yeni yaklaşımla yeniden kurgulandı!'
     }
    };
   }
  });

  assert.match(seenPrompt, /K-D-S/);
  assert.match(seenPrompt, /YASAKLA/i);
  assert.equal(v2.lesson.reframeCount, 2);
  assert.notEqual(v2.lesson.activeStyle, v1.lesson.activeStyle);
  assert.equal(v2.lesson.memoryMnemonics[0].code, 'M-E-R-D-İ');
  assert.equal(v2.lesson.everyCornerDetails.length, 2);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('VideoDirector durum moduna göre 3D Morpa Kampüs diyaloglu sahne + Google Flow prompt üretir', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-video-'));
 try {
  const director = new VideoDirector(dir);
  const ctx = {
   id: '1-0',
   book: 'Sporda Öğrenme ve Öğretme',
   unit: 'Motor Öğrenme',
   text: 'Motor öğrenme tekrar ve deneyim sonucu davranışta oluşan nispeten kalıcı değişikliktir.'
  };
  const passages = [
   { id: '1-0#01', heading: 'Kalıcılık Ölçütü', pages: [8], text: 'Geçici yorgunluk veya ilaç etkileri öğrenme sayılmaz.' }
  ];
  const studentProfile = {
   results: { '1-0': { right: 1, wrong: 2, streak: 0, totalSec: 90 } }
  };

  assert.equal(director.selectSituationMode('1-0', studentProfile), 'hata_kurtarma');

  const produced = await director.produceUnitVideo({
   ctx,
   passages,
   studentProfile,
   model: 'mock-model',
   runModelFn: async () => ({
    parsed: {
     title: 'Motor Öğrenme Tuzak Avı',
     summary: 'Koç Yapay Zekâ ve Can arasındaki kalıcılık tartışması.',
     environment: 'gym_3d',
     scenes: [
      {
       id: 'scene-1',
       sceneTitle: 'Yorgunluk Öğrenme Değildir',
       environment: 'gym_3d',
       cameraMove: 'two_shot',
       durationSec: 20,
       boardTitle: 'Motor Öğrenme = Kalıcı İz',
       boardCode: 'K-D-T',
       boardBullets: ['Tekrar + deneyim şart', 'Yorgunluk geçici etkidir'],
       dialogues: [
        { speaker: 'can', emotion: 'confused', action: 'think', text: 'Hocam yorulunca şut isabetim düştü, unutmuş muyum?' },
        { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: 'Hayır Can! Yorgunluk geçicidir; motor öğrenme kalıcı değişikliktir!' }
       ],
       repeatPrompt: 'Şimdi yüksek sesle tekrar et: Motor öğrenme kalıcı değişikliktir!',
       quickQuestion: { question: 'Hangisi motor öğrenme sayılmaz?', options: ['Geçici yorgunluk etkisi', 'Kalıcı beceri artışı'], answer: 'Geçici yorgunluk etkisi' },
       googleFlowPrompt: '3D stylized gym classroom, coach explaining motor learning to student on glowing board, Turkish dialogue, smooth dolly camera'
      }
     ]
    }
   })
  });

  assert.equal(produced.situationMode, 'hata_kurtarma');
  assert.match(produced.source, /^ai-3d/);
  assert.equal(produced.scenes.length, 1);
  assert.equal(produced.scenes[0].dialogues[0].speaker, 'can');
  assert.ok(produced.googleFlowMasterPrompt.includes('3D'));

  const noKeyRes = await director.requestGoogleFlowRender({ unitId: '1-0', sceneId: 'scene-1', prompt: 'test flow prompt' });
  assert.equal(noKeyRes.submitted, true);
  assert.equal(noKeyRes.zeroApiAutonomous, true);
  assert.equal(noKeyRes.mode, 'autonomous-flow-0api');
  assert.equal(noKeyRes.prompt, 'test flow prompt');
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('ollamaPlugin uç noktaları (/student-state remediation, /lessons/reframe, /videos, /videos/generate, /videos/google-flow)', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-v6-srv-'));
 const prevDataDir = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 const prevDisableAuto = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 writeFileSync(join(dir, 'settings.json'), JSON.stringify({ model: 'qwen3:14b', verifierModel: 'qwen3:14b', judge2Model: 'qwen3:14b', evolverModel: 'qwen3:14b', autoRunning: false }));

 const mockOllama = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') {
   return res.end(JSON.stringify({ models: [{ name: 'qwen3:14b' }] }));
  }
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
   let prompt = '';
   try { prompt = JSON.parse(raw).prompt || ''; } catch {}
   const isVideo = /MORPA|googleFlowPrompt|dialogues/i.test(prompt);
   const payload = isVideo
    ? {
       title: '3D Sahne Dersi',
       summary: 'Morpa tarzı 3D diyalog.',
       environment: 'classroom_3d',
       scenes: [{
        id: 'scene-1', sceneTitle: 'Başlangıç', environment: 'classroom_3d', cameraMove: 'orbit_slow',
        durationSec: 18, boardTitle: 'Anahtar Kavram', boardCode: 'A-K', boardBullets: ['Madde 1'],
        dialogues: [
         { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: 'Merhaba Ada ve Can!' },
         { speaker: 'ada', emotion: 'curious', action: 'think', text: 'Hocam bu kavramın sınavdaki en kritik püf noktası nedir?' }
        ],
        repeatPrompt: 'Tekrar et!',
        quickQuestion: { question: 'Test?', options: ['A', 'B'], answer: 'A' },
        googleFlowPrompt: '3D classroom dialogue scene'
       }]
      }
    : {
       overviewHook: 'Reframed hook!',
       deepSections: [
        { title: 'Bölüm 1', body: 'Yeni hikâye ile uzun ve akılda kalıcı biçimde hazırlanmış detaylı anlatım.', recallAnchor: 'Çıpa 1' },
        { title: 'Bölüm 2', body: 'İkinci pekiştirme bölümü de yirmi beş karakterden uzun açıklamalar sunar.', recallAnchor: 'Çıpa 2' }
       ],
       proTips: [{ title: 'Püf', tip: 'İpucu', examTrap: 'Tuzak' }],
       memoryMnemonics: [{ code: 'Y-E-N-İ', standsFor: 'Yeni Etkinlik Net İz', story: 'Yepyeni kodlama.' }],
       spacedEchoes: ['Yankı 1'],
       fiveAngleSpotlight: { concept: 'Kavram', angles: [{ angle: '1. Tanım', sampleQuestion: 'Soru?', keyPoint: 'Püf' }] },
       miniCheckpoints: [{ question: 'Öz kontrol?', answer: 'Doğru.', hint: 'YENİ' }],
       everyCornerDetails: [{ heading: 'Köşe 1', keyFact: 'İnce ayrıntı', whyItCouldBeAsked: '20 soruluk havuz' }],
       adaptivePersonalCoach: 'Kodlamalar yenilendi!'
      };
   res.end(JSON.stringify({ response: JSON.stringify(payload) }));
  });
 });

 await new Promise(r => mockOllama.listen(0, '127.0.0.1', r));
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mockOllama.address().port}`;

 try {
  const { ollamaPlugin } = await import(`../server/ollama.mjs?v6test=${Date.now()}`);
  let middleware;
  ollamaPlugin().configureServer({ middlewares: { use: (_p, fn) => { middleware = fn; } } });

  const call = (method, urlPath, bodyObj, extraHeaders = {}) => new Promise((resolve, reject) => {
   const req = new http.IncomingMessage(null);
   req.method = method;
   req.url = urlPath;
   req.headers = { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', ...extraHeaders };
   const chunks = [];
   const res = new PassThrough();
   res.statusCode = 200;
   res.headers = {};
   res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
   res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
   res.on('finish', () => {
    const buf = Buffer.concat(chunks);
    const ct = res.headers['content-type'] || '';
    const json = ct.includes('application/json') && buf.length ? JSON.parse(buf.toString('utf8')) : null;
    resolve({ status: res.statusCode, headers: res.headers, buffer: buf, json });
   });
   middleware(req, res, err => reject(err || new Error('next called')));
   if (bodyObj !== undefined) req.push(Buffer.isBuffer(bodyObj) ? bodyObj : JSON.stringify(bodyObj));
   req.push(null);
  });

  // 1. Çok yanlış -> remediation tespit edilmeli
  const stRes = await call('POST', '/student-state', {
   readUnits: ['0-0'],
   results: { '0-0': { right: 1, wrong: 3, streak: 0, totalSec: 120, lastSec: 40 } },
   signalUnitId: '0-0',
   signalCorrect: false
  });
  assert.equal(stRes.status, 200);
  assert.ok(stRes.json.remediation.rereadUnits.includes('0-0'));
  assert.ok(stRes.json.remediation.reframeUnits.includes('0-0'));

  // 2. /lessons/reframe -> yeni kodlama üretilmeli
  const refRes = await call('POST', '/lessons/reframe', { unitId: '0-0' });
  assert.equal(refRes.status, 200, JSON.stringify(refRes.json));
  assert.equal(refRes.json.reframed, true);
  assert.equal(refRes.json.lesson.memoryMnemonics[0].code, 'Y-E-N-İ');
  assert.ok(refRes.json.lesson.everyCornerDetails.length >= 1);

  // 3. /videos/generate -> 3D diyaloglu video üretilmeli
  const vidGen = await call('POST', '/videos/generate', { unitId: '0-0' });
  assert.equal(vidGen.status, 200, JSON.stringify(vidGen.json));
  assert.equal(vidGen.json.video.situationMode, 'hata_kurtarma');
  assert.equal(vidGen.json.video.scenes[0].dialogues[0].text, 'Merhaba Ada ve Can!');

  // 4. GET /videos?unitId=0-0 + POST /videos/render-mp4 + GET /videos/mp4 (Range 206 MP4 stream) + Google Flow
  const vidGet = await call('GET', '/videos?unitId=0-0');
  assert.equal(vidGet.status, 200);
  assert.equal(vidGet.json.video.unitId, '0-0');
  assert.match(vidGet.json.mp4Url, /^\/api\/ollama\/videos\/mp4\?unitId=0-0/);

  const renderRes = await call('POST', '/videos/render-mp4', { unitId: '0-0' });
  assert.equal(renderRes.status, 200, JSON.stringify(renderRes.json));
  assert.equal(renderRes.json.hasMp4, true);
  assert.ok(renderRes.json.bytes > 10000);

  const mp4Full = await call('GET', '/videos/mp4?unitId=0-0');
  assert.equal(mp4Full.status, 200);
  assert.equal(mp4Full.headers['content-type'], 'video/mp4');
  assert.ok(mp4Full.buffer.includes(Buffer.from('ftyp')), 'Geçerli MP4 ftyp header olmalı');

  const mp4Range = await call('GET', '/videos/mp4?unitId=0-0', undefined, { range: 'bytes=0-1023' });
  assert.equal(mp4Range.status, 206);
  assert.equal(mp4Range.buffer.length, 1024);
  assert.match(mp4Range.headers['content-range'], /^bytes 0-1023\//);

  const flowRes = await call('POST', '/videos/google-flow', { unitId: '0-0', sceneId: 'scene-1', prompt: '3D classroom scene' });
  assert.equal(flowRes.status, 200);
  assert.equal(flowRes.json.ok, true);
  assert.equal(flowRes.json.zeroApiAutonomous, true);
  assert.equal(flowRes.json.submitted, true);

  const flowAllRes = await call('POST', '/videos/google-flow-all', { count: 2 });
  assert.equal(flowAllRes.status, 200);
  assert.equal(flowAllRes.json.ok, true);
  assert.equal(flowAllRes.json.zeroApiAutonomous, true);

  // 5. Anında Hamam Böceği Böcü videosu + Çoklu Paket Hızlı MP4 Üretimi (/videos/batch-generate)
  const roachTurbo = await call('POST', '/videos/generate', {
   unitId: '0-0',
   themeStyle: 'hamam_bocegi_komedi',
   customIdea: 'Böcü laktik asidi yanlış bilsin',
   instantTurbo: true,
   saveAsVariant: true
  });
  assert.equal(roachTurbo.status, 200, JSON.stringify(roachTurbo.json));
  assert.equal(roachTurbo.json.video.themeStyle, 'hamam_bocegi_komedi');
  assert.ok(roachTurbo.json.video.scenes[0].dialogues.some(d => d.speaker === 'roach'));
  assert.equal(roachTurbo.json.hasMp4, true);

  const batchGen = await call('POST', '/videos/batch-generate', {
   unitId: '0-0',
   themes: ['hamam_bocegi_komedi', 'shorts_hizli', 'stadyum_spikeri'],
   customIdea: 'Süper hız testi'
  });
  assert.equal(batchGen.status, 200, JSON.stringify(batchGen.json));
  assert.equal(batchGen.json.count, 3);
  assert.equal(batchGen.json.renderedCount, 3);
  assert.ok(batchGen.json.variants.length >= 4);

  const roachVarId = batchGen.json.videos[0].variantId;
  const roachMp4 = await call('GET', `/videos/mp4?unitId=0-0&variantId=${encodeURIComponent(roachVarId)}`);
  assert.equal(roachMp4.status, 200);
  assert.equal(roachMp4.headers['content-type'], 'video/mp4');
  assert.ok(roachMp4.buffer.includes(Buffer.from('ftyp')));

  const statusRes = await call('GET', '/status');
  assert.equal(statusRes.status, 200);
  assert.ok(statusRes.json.videos.producedCount >= 1);
  assert.ok(statusRes.json.videos.mp4Count >= 4);
  assert.ok(statusRes.json.videos.roachCount >= 2);
  assert.ok(statusRes.json.videos.totalVariantsCount >= 4);
  assert.equal(statusRes.json.settings.preset, 'turbo');
  assert.equal(statusRes.json.settings.turboQualityLock, true);
  assert.equal(statusRes.json.settings.selfCorrection, true);
  assert.equal(statusRes.json.settings.smartDifficulty, true);
  assert.equal(statusRes.json.upgradeFactorFromPrevious, 100);
  assert.equal(statusRes.json.cumulativeUpgradeFactor, 150000);
  assert.equal(statusRes.json.trainingScaleFactor, 3000000);
  assert.equal(statusRes.json.qwenBoostPercent, 70500000000);
  assert.equal(statusRes.json.addedIntelligenceBoostPercent, 24000000000);
  assert.equal(statusRes.json.trapDefenseTotal, 96);
  assert.equal(statusRes.json.zeroApiRequired, true);
  assert.equal(statusRes.json.localExecutionOnly, true);
  assert.equal(statusRes.json.noApiKeyPrompts, true);

  // 6. Kayserili Sert-Komedi & Klasik Şık Tepkisi (/kayseri-react)
  const reactBad = await call('POST', '/kayseri-react', {
   unitId: '0-0',
   question: 'Antrenman nedir?',
   selectedOption: 'Uyumak',
   correctAnswer: 'Planlı fiziksel yüklenme sürecidir',
   isCorrect: false,
   elapsedSec: 3,
   wrongCount: 2,
   mode: 'kayseri_sert'
  });
  assert.equal(reactBad.status, 200, JSON.stringify(reactBad.json));
  assert.equal(reactBad.json.reaction.mode, 'kayseri_sert');
  assert.equal(reactBad.json.reaction.isCorrect, false);
  assert.ok(reactBad.json.reaction.headline.length > 5);
  assert.ok(reactBad.json.reaction.examFact.includes('Planlı fiziksel yüklenme sürecidir'));

  const reactKibar = await call('POST', '/kayseri-react', {
   unitId: '0-0',
   question: 'Antrenman nedir?',
   selectedOption: 'Planlı fiziksel yüklenme sürecidir',
   correctAnswer: 'Planlı fiziksel yüklenme sürecidir',
   isCorrect: true,
   elapsedSec: 5,
   streak: 3,
   mode: 'temiz_klasik'
  });
  assert.equal(reactKibar.status, 200);
  assert.equal(reactKibar.json.reaction.mode, 'temiz_klasik');
  assert.equal(reactKibar.json.reaction.isCorrect, true);

  // 7. Sorusuz TikTok Karışık Akış (/videos/feed) + Eksik Ünite Doldurma (/videos/fill-all) — aktif 0-API AI video modelleriyle
  const fillRes = await call('POST', '/videos/fill-all', { count: 4 });
  assert.equal(fillRes.status, 200, JSON.stringify(fillRes.json));
  assert.equal(fillRes.json.filled, 4);
  assert.equal(fillRes.json.zeroApiRequired, true);
  assert.equal(fillRes.json.localExecutionOnly, true);
  assert.equal(fillRes.json.noApiKeyPrompts, true);
  assert.equal(fillRes.json.aiVideoModel, 'qwen3:14b');
  assert.ok(fillRes.json.aiScriptedCount >= 1, 'TikTok akışı videoları aktif 0-API AI video modeliyle senaryolanmalı');
  assert.ok(fillRes.json.aiVideoEngine);

  // Harici API'li video modelleri TikTok akışında da reddedilmeli
  const badFill = await call('POST', '/videos/fill-all', { count: 1, model: 'veo-2.0-generate-001' });
  assert.equal(badFill.status, 400);

  const feedRes = await call('GET', '/videos/feed?limit=20');
  assert.equal(feedRes.status, 200, JSON.stringify(feedRes.json));
  assert.equal(feedRes.json.noQuestions, true);
  assert.equal(feedRes.json.zeroApiRequired, true);
  assert.equal(feedRes.json.localExecutionOnly, true);
  assert.equal(feedRes.json.activeVideoModel, 'qwen3:14b');
  assert.ok(feedRes.json.activeVideoEngine);
  assert.ok(feedRes.json.items.length >= 4);
  assert.ok(feedRes.json.items.every(it => it.noQuestions === true && it.zeroApi === true && Boolean(it.aiVideoModel) && Boolean(it.aiVideoEngine) && Boolean(it.directAnswer) && Array.isArray(it.keyTerms) && it.keyTerms.length > 0));
  assert.ok(feedRes.json.coverage.filledUnits >= 4);

  // 8. Eski (Legacy) TikTok Videolarını Yerinde Değiştirme + Stale subsec-* Temizleme + Sürekli Üretim
  const legacyDir = join(dir, 'ai-brain', 'videos');
  writeFileSync(join(legacyDir, '0-2.json'), JSON.stringify({
   unitId: '0-2', variantId: '0-2', unit: 'Eski Ünite', book: 'Kitap',
   themeStyle: 'tiktok_kayseri', version: 1, noQuestions: true,
   scenes: [{ id: 's1', sceneTitle: 'Eski', durationSec: 5, dialogues: [{ speaker: 'coach', text: 'Eski video' }] }]
  }));
  writeFileSync(join(legacyDir, '0-2__subsec-stale123.json'), JSON.stringify({
   unitId: '0-2', variantId: 'subsec-stale123', unit: 'Stale Stub', book: 'Kitap',
   themeStyle: 'tiktok_kayseri', version: 1, noQuestions: true,
   scenes: [{ id: 's1', sceneTitle: 'Stale', durationSec: 5, dialogues: [{ speaker: 'coach', text: 'Eski stub' }] }]
  }));

  const replaceRes = await call('POST', '/videos/replace-legacy', { count: 8 });
  assert.equal(replaceRes.status, 200, JSON.stringify(replaceRes.json));
  assert.equal(replaceRes.json.ok, true);
  assert.ok(replaceRes.json.filled >= 1);

  const feedAfterReplace = await call('GET', '/videos/feed?limit=40');
  assert.equal(feedAfterReplace.status, 200);
  const replaced02 = feedAfterReplace.json.items.find(it => it.unitId === '0-2' && (it.variantId === '' || it.variantId === '0-2') && it.replacedFromLegacy === true);
  assert.ok(replaced02, 'Eski 0-2 TikTok videosu yerinde yenilenmiş olmalı');
  assert.equal(replaced02.videoSpecVersion, 2);
  assert.equal(replaced02.hasMp4, true);
  assert.ok(feedAfterReplace.json.items.every(it => it.variantId !== 'subsec-stale123'));

  // 9. Ollama Bağlandığında Tüm Projeyi & Tüm Botları 100x Ultra-Singularity Seviyesine Otomatik Yükseltme
  const upgRes = await call('POST', '/bots/upgrade-on-connect', { force: true });
  assert.equal(upgRes.status, 200, JSON.stringify(upgRes.json));
  assert.equal(upgRes.json.ok, true);
  assert.equal(upgRes.json.liveOllamaConnected, true);
  assert.equal(upgRes.json.upgradeFactorFromPrevious, 100);
  assert.equal(upgRes.json.cumulativeUpgradeFactor, 150000);
  assert.equal(upgRes.json.trainingScaleFactor, 3000000);
  assert.equal(upgRes.json.trapDefenseTotal, 96);
  assert.equal(upgRes.json.botsUpgraded, 11);
  assert.ok(upgRes.json.coderModelsUpgraded >= 44);
 } finally {
  mockOllama.closeAllConnections?.();
  mockOllama.close();
  if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevBase;
  if (prevDataDir === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevDataDir;
  if (prevDisableAuto === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisableAuto;
  rmSync(dir, { recursive: true, force: true });
 }
});
