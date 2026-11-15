import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LessonEngine } from '../server/lesson-engine.mjs';

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

test('ollamaPlugin uç noktaları (/student-state remediation, /lessons/reframe, /kayseri-react)', async () => {
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
   const payload = {
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

  // 9. Ollama Bağlandığında Tüm Projeyi & Tüm Botları 100x Ultra-Singularity Seviyesine Otomatik Yükseltme
  const upgRes = await call('POST', '/bots/upgrade-on-connect', { force: true });
  assert.equal(upgRes.status, 200, JSON.stringify(upgRes.json));
  assert.equal(upgRes.json.ok, true);
  assert.equal(upgRes.json.liveOllamaConnected, true);
  assert.equal(upgRes.json.upgradeFactorFromPrevious, 100);
  assert.equal(upgRes.json.cumulativeUpgradeFactor, 150000);
  assert.equal(upgRes.json.trainingScaleFactor, 3000000);
  assert.equal(upgRes.json.trapDefenseTotal, 96);
  assert.equal(upgRes.json.botsUpgraded, 8);
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
