import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApexArchitect, ADVERSARIAL_TRAP_CASES } from '../server/apex-architect.mjs';
import { JarvisCore } from '../server/jarvis-core.mjs';
import { SandboxEvolver } from '../server/sandbox-evolver.mjs';
import { IntelligenceTrainer, HARDENED_ULTRA_RULE_CODE } from '../server/intelligence-trainer.mjs';
import { GithubKnowledgeMiner } from '../server/github-researcher.mjs';
import { VideoDirector } from '../server/video-director.mjs';

test('ApexArchitect Ultra-Singularity-705Mx+ v8 (100x Yükseltme · 150,000x Kümülatif · 3,000,000x Eğitim: +70,500,000,000% · %100 Yerel): 96 tuzak, turnuva, self-repair, 11 alt-sistem ve zero-API doğrulama', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-apex-'));
 try {
  assert.equal(ADVERSARIAL_TRAP_CASES.length, 96);
  const apex = new ApexArchitect(dir);
  const jarvis = new JarvisCore(dir, process.cwd());
  const evolver = new SandboxEvolver(dir);

  const contexts = [
   { id: '0-0', book: 'Kitap 1', unit: 'Ünite 1' },
   { id: '0-1', book: 'Kitap 1', unit: 'Ünite 2' }
  ];
  const passagesByUnit = new Map([
   ['0-0', [{ id: '0-0#01' }, { id: '0-0#02' }, { id: '0-0#03' }, { id: '0-0#04' }]],
   ['0-1', [{ id: '0-1#01' }, { id: '0-1#02' }]]
  ]);
  const items = [
   {
    id: 'q1', unitId: '0-0', difficulty: 'kolay', status: 'approved', passageId: '0-0#01',
    questionAngle: 'dogrudan_tanim',
    question: 'Egzersizin temel tanımı aşağıdakilerden hangisidir?',
    options: ['Planlı, programlı ve tekrarlı fiziksel aktivitedir', 'Sadece yarışma sporudur', 'Enerji harcatmayan dinlenmedir', 'Rastgele yapılan yürüyüştür'],
    answer: 'Planlı, programlı ve tekrarlı fiziksel aktivitedir',
    explanation: 'Egzersiz planlı, programlı ve tekrarlı fiziksel aktivite olmasıyla diğer hareketlerden ayrılır.',
    evidence: 'Egzersiz planlı, programlı ve tekrarlı bir fiziksel aktivitedir.'
   }
  ];
  const studentProfile = {
   weakUnits: ['0-1'],
   results: { '0-1': { right: 1, wrong: 4, streak: 0, totalSec: 220 } }
  };

  let calls = 0;
  let repairedOnce = false;
  const runModelFn = async (_model, prompt) => {
   calls++;
   if (/BOZUK KOD:/i.test(prompt)) {
    repairedOnce = true;
    return {
     parsed: {
      customRuleCode: HARDENED_ULTRA_RULE_CODE
     }
    };
   }
   if (/Adli Sistem Eleştirmenisin/i.test(prompt)) {
    return {
     parsed: {
      criticalDiagnosis: '0-1 ünitesinde hata yoğunluğu yüksek ve pasaj kapsamı düşük.',
      crossBotHypotheses: [
       { targetBot: 'generator', hypothesis: 'Pasaj kör noktalarına odaklanılırsa kapsam artar', action: '0-0#02..04 ve 0-1 pasajlarından vaka soruları üret', expectedGain: '+35% pasaj kapsamı' },
       { targetBot: 'lessonEngine', hypothesis: '0-1 kodlaması değiştirilirse kalıcılık artar', action: '0-1 için görsel saha hikâyesi kur', expectedGain: '+40% hatırlama' },
       { targetBot: 'videoDirector', hypothesis: '0-1 için hata_kurtarma 3D/MP4 sahnesi oluşturulmalı', action: 'Can ile tuzak karşılaştırma diyalogu üret', expectedGain: 'Hata tekrarı azalır' }
      ]
     }
    };
   }
   return {
    parsed: {
     candidates: [
      {
       strategyName: 'Bozuk Kuraldan Onarılan Aday',
       hyperParams: { temperatureOffset: -0.05, batchSizeHint: 6, curatorMinScoreHint: 62 },
       botDirectives: {
        generator: 'Kör pasajlardan ve yakın kavram çiftlerinden kesin tek doğru cevaplı soru kur.',
        judge: 'Tüm 4 seçeneğin uzunluk dengesini kontrol et ve belirsiz şıkları ele.',
        curator: 'Kör nokta pasajları taşıyan onaylı soruları koru.',
        lessonEngine: '0-1 gibi yüksek hatalı ünitelerde tamamen yeni kodlama üret.',
        videoDirector: 'Öğrencinin düştüğü tuzakları Koç-Can diyaloguyla görselleştir ve MP4 göm.',
        researchAgent: 'Sınav tahminlerinin yanında nadir pasaj detaylarını da listele.'
       },
       difficultyDirectives: {
        kolay: 'KOLAY (150x): Net ilke sor, tüm çeldiriciler aynı terim alanından ve eşit uzunlukta olsun.',
        orta: 'ORTA (150x): İki kavramın ayrım sınırını saha örneği içinde ölç.',
        zor: 'ZOR (150x): Çok adımlı antrenörlük vakasında ince fizyolojik/pedagojik istisnayı yakalat.'
       },
       newAvoidLessons: [{ unitId: 'all', category: 'distractor', lesson: 'Doğru şıkkı diğer üç şıktan belirgin biçimde uzun yazma.' }],
       newGoldenPatterns: [{ unitId: 'all', pattern: 'Tüm seçenekleri 5-9 kelime aralığında dengeli tut.' }],
       // İlk turda kasıtlı syntax/runtime hatası veren kural -> _tryRepairRule tetiklenmeli!
       customRuleCode: !repairedOnce
        ? 'function evaluateCandidate(candidate) { throw new Error("kasıtlı bozuk kural"); }'
        : 'function evaluateCandidate(candidate) { if (!Array.isArray(candidate.options) || candidate.options.length !== 4) return { ok: false, reason: "4 seçenek şart" }; if (/hepsi|hiçbiri/i.test(candidate.answer || "")) return { ok: false, reason: "Hepsi/hiçbiri yasak" }; if ((candidate.evidence || "").trim().length < 15) return { ok: false, reason: "Kanıt çok kısa" }; if (new Set(candidate.options).size < 4) return { ok: false, reason: "Tekrarlı şık" }; return { ok: true }; }',
       difficultyEngineCode: 'function evaluateDifficultyFit(candidate, diff) { return { ok: true, tier: diff }; }'
      },
      {
       strategyName: 'Zayıf Yedek Aday',
       botDirectives: { generator: 'Kısa direktif' },
       difficultyDirectives: {
        kolay: 'KOLAY (150x): Net ilke sor.',
        orta: 'ORTA (150x): Karşılaştırma sor.',
        zor: 'ZOR (150x): Vaka sor.'
       },
       customRuleCode: 'function evaluateCandidate() { return { ok: false, reason: "her seyi reddeder" }; }'
      }
     ]
    }
   };
  };

  const res = await apex.evolveEcosystem({
   runModelFn,
   model: 'qwen3:14b',
   coderModel: 'qwen2.5-coder:14b',
   evolver,
   jarvis,
   items,
   contexts,
   passagesByUnit,
   telemetry: { approvalRate: 78, dualAnswerBlocked: 2, attemptsTotal: 18, rejectionReasons: { dual_answer: 2 } },
   studentProfile
  });

  assert.ok(calls >= 3); // Eleştirmen + Turnuva Mimarı + Self-Repair
  assert.equal(repairedOnce, true);
  assert.equal(res.state.evolutionCycles, 1);
  assert.ok(res.state.selfRepairs >= 1);
  assert.equal(res.state.repairCount, res.state.selfRepairs);
  assert.ok(res.state.tournamentWins >= 1);
  assert.equal(res.tournamentLog.length, 2);
  assert.ok(res.state.intelligenceMultiplier >= 705000000, `Ultra-Singularity-705Mx+ >=705000000x bekleniyordu, gelen: ${res.state.intelligenceMultiplier}`);
  assert.equal(res.state.upgradeFactorFromPrevious, 100);
  assert.equal(res.state.cumulativeUpgradeFactor, 150000);
  assert.equal(res.state.trainingScaleFactor, 3000000);
  assert.equal(res.state.boostPercentage, 70500000000);
  assert.equal(res.state.addedIntelligenceBoostPercent, 24000000000);
  assert.equal(res.state.localExecutionOnly, true);
  assert.equal(res.state.noApiKeyPrompts, true);
  assert.match(res.state.codename, /Ultra-Singularity-705Mx\+/);
  assert.equal(res.state.turboQualityLock, true);
  assert.ok(res.diagnostics.botHealth.kayseriCoach);
  assert.ok(res.diagnostics.botHealth.tiktokFeed);
  assert.ok(res.diagnostics.botHealth.qwenCodeSandbox);
  assert.ok(res.diagnostics.botHealth.turboQualityGuard);
  assert.ok(res.diagnostics.botHealth.localVideoStudio);
  assert.equal(res.stressResult.valid, true);
  assert.ok(res.stressResult.f1Score >= 90);
  assert.equal(res.appliedPolicy.preserveDifficultyTiers, true);
  assert.match(res.appliedPolicy.difficultyDirectives.kolay, /150x/);
  assert.equal(res.state.hyperParams.batchSizeHint, 6);
  assert.equal(res.state.hyperParams.curatorMinScoreHint, 62);
  assert.ok(res.state.hyperParams.reframePriorityUnits.includes('0-1'));
  assert.equal(res.newHypotheses.length, 3);

  // Üst üste döngüler playbook doğrulaması yapmalı ve zekâ çarpanını yükseltmeli
  let latest = res;
  for (let i = 0; i < 6; i++) {
   latest = await apex.evolveEcosystem({
    runModelFn,
    model: 'qwen3:14b',
    coderModel: 'qwen2.5-coder:14b',
    evolver,
    jarvis,
    items,
    contexts,
    passagesByUnit,
    telemetry: { approvalRate: 92, dualAnswerBlocked: 4, attemptsTotal: 40 + i * 10 },
    studentProfile: { weakUnits: [], results: {} },
    lessonsSummary: { enhancedCount: 2 },
    videosSummary: { producedCount: 2, rescueCount: 1 },
    researchMemory: { researchCycles: 4, webHitsTotal: 12, byUnit: { '0-0': {}, '0-1': {} } }
   });
  }
  assert.ok(latest.state.winningPlaybook.length >= 1, 'Önceki tur etkisi winningPlaybook içine kaydedilmeli');
  assert.ok(latest.state.lastCycleImpact?.verdict === 'kazandi');
  assert.ok(latest.state.intelligenceMultiplier >= 900000000, `Ultra-Singularity-705Mx+ tırmanmalı (>=900,000,000x), gelen ${latest.state.intelligenceMultiplier}x`);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('IntelligenceTrainer (100x · +70,500,000,000% Ultra-Singularity-705Mx+), 0-API GithubKnowledgeMiner (MIT/Apache-2.0) ve %100 Yerel Video Motoru', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-ultra-trainer-'));
 try {
  const evolver = new SandboxEvolver(dir);
  const jarvis = new JarvisCore(dir, process.cwd());
  const apex = new ApexArchitect(dir);
  const trainer = new IntelligenceTrainer(dir);
  const vd = new VideoDirector(dir);

  const contexts = [
   { id: '0-0', book: 'Hareket ve Antrenman', unit: 'Antrenman İlkeleri', text: 'Progresif yüklenme organizmaya verilen şiddetin 10% oranında kademeli artırılmasıdır.' },
   { id: '0-1', book: 'Spor Fizyolojisi', unit: 'Enerji Sistemleri', text: 'ATP-CP sistemi ilk 10 saniyede oksijensiz en hızlı enerji üretir.' }
  ];
  const passagesByUnit = new Map([
   ['0-0', [{ id: '0-0#01', heading: 'Progresif Artış', keywords: ['Yüklenme', 'Adaptasyon'], text: 'Progresif yüklenme kas ve kalp adaptasyonu için %5-10 aralığında kademeli artıştır.' }]],
   ['0-1', [{ id: '0-1#01', heading: 'ATP-CP', keywords: ['Fosfajen', 'Anaerobik'], text: 'Kreatin fosfat depoları ilk 8-10 saniyelik patlayıcı yükte devreye girer.' }]]
  ]);
  const items = [
   {
    id: 'ok-1', unitId: '0-0', status: 'approved', difficulty: 'orta',
    question: 'Progresif yüklenme ilkesine göre yük şiddeti nasıl artırılmalıdır?',
    options: ['Kademeli ve kontrollü biçimde', 'Bir anda maksimuma çıkarılarak', 'Sadece sezon sonunda azaltılarak', 'Her gün aynı kiloda tutularak'],
    answer: 'Kademeli ve kontrollü biçimde',
    explanation: 'Kademeli artış adaptasyonu sürdürür.',
    evidence: 'Progresif yüklenme organizmaya verilen şiddetin kademeli artırılmasıdır.'
   }
  ];

  const tick = await trainer.runContinuousTrainingTick({
   contexts, passagesByUnit, items, evolver, jarvis, apex, batchUnits: 2
  });
  assert.equal(tick.ok, true);
  assert.equal(tick.upgradeFactorFromPrevious, 100);
  assert.equal(tick.cumulativeUpgradeFactor, 150000);
  assert.equal(tick.trainingScaleFactor, 3000000);
  assert.equal(tick.curriculumStagesCompleted, 40);
  assert.equal(tick.localExecutionOnly, true);
  assert.equal(tick.noApiKeyPrompts, true);
  assert.equal(tick.trapReport.passed, 96);
  assert.equal(tick.trapReport.total, 96);
  assert.equal(tick.addedBoostPercent, 24000000000);
  assert.equal(tick.totalBoostPercent, 70500000000);
  assert.match(trainer.getUnitDistilledPrompt(tick.state, '0-0'), /ULTRA-SINGULARITY-705Mx\+.*100x.*DAMITILMIŞ/);

  const qLevel = jarvis.computeAdaptiveQuality(
   { generation: 6, innovationCount: 4, avoidLessons: [{}, {}, {}, {}] },
   { researchCycles: 5 },
   { approvalRate: 92 },
   { intelligenceMultiplier: 705000000 }
  );
  assert.equal(qLevel.level, 9);
  assert.equal(qLevel.trainingScaleFactor, 3000000);
  assert.equal(qLevel.upgradeFactorFromPrevious, 100);
  assert.equal(qLevel.cumulativeUpgradeFactor, 150000);
  assert.equal(qLevel.localExecutionOnly, true);
  assert.match(qLevel.title, /Ultra-Singularity-705Mx\+/);

  // 0-API Yasal Açık Kaynak GitHub Madenciliği (GPL repo filtrelenir, yalnızca MIT/Apache-2.0 alınır!)
  const miner = new GithubKnowledgeMiner(dir, {
   fetchJsonFn: async url => {
    if (url.includes('/search/repositories')) {
     return {
      items: [
       { full_name: 'edu-oss/mit-tutor', html_url: 'https://github.com/edu-oss/mit-tutor', stargazers_count: 850, description: 'Feynman spaced repetition tutoring engine', license: { spdx_id: 'MIT' }, topics: ['spaced-repetition', 'feynman'] },
       { full_name: 'closed/gpl-repo', html_url: 'https://github.com/closed/gpl-repo', stargazers_count: 9999, description: 'Copyleft demo', license: { spdx_id: 'GPL-3.0' }, topics: [] }
      ]
     };
    }
    return {
     content: Buffer.from('# MIT Tutor\nUses SM-2 spaced repetition, Feynman loop and 4-choice distractor verifier.').toString('base64')
    };
   }
  });
  const oss = await miner.mineLegalOpenSource({ jarvis, apex, force: true });
  assert.equal(oss.zeroApiRequired, true);
  assert.equal(oss.legalOnly, true);
  assert.equal(oss.discoveredThisCycle, 1);
  assert.ok(oss.synthesizedBlueprints.every(b => b.license === 'MIT' || b.license === 'Apache-2.0'));

  // 0-API Google Flow Otonom Stüdyo testi (API anahtarı gerekmeden submitted=true & flow_ready_0api!)
  const fallbackVid = vd.buildFallbackVideo(contexts[0], passagesByUnit.get('0-0'), {}, null, null, 'tiktok_kayseri');
  await vd.saveVideo(fallbackVid);
  const flowAll = await vd.submitAllVideosToGoogleFlow({ limit: 5 });
  assert.equal(flowAll.zeroApiAutonomous, true);
  assert.equal(flowAll.submittedCount, 1);
  assert.equal(flowAll.results[0].mode, 'autonomous-flow-0api');
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('ollamaPlugin 150x ApexArchitect uç noktası ve tüm botlara canlı direktif enjeksiyonu', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-apex-srv-'));
 const prevDataDir = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 const prevDisableAuto = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 writeFileSync(join(dir, 'settings.json'), JSON.stringify({ model: 'qwen3:14b', verifierModel: 'qwen3:14b', judge2Model: 'qwen3:14b', evolverModel: 'qwen3:14b', autoRunning: false }));

 const seenPrompts = [];
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
   seenPrompts.push(prompt);
   if (/Adli Sistem Eleştirmenisin/i.test(prompt)) {
    return res.end(JSON.stringify({
     response: JSON.stringify({
      criticalDiagnosis: 'Test teşhisi',
      crossBotHypotheses: [{ targetBot: 'generator', hypothesis: 'Hipotez', action: 'Eylem', expectedGain: '+20%' }]
     })
    }));
   }
   if (/TURNUVA BAŞ MİMARI AJANSIN|BAŞ MİMAR AJANSIN/i.test(prompt)) {
    return res.end(JSON.stringify({
     response: JSON.stringify({
      candidates: [{
       strategyName: 'Canlı 150x Enjeksiyon Testi',
       hyperParams: { temperatureOffset: 0.02, batchSizeHint: 5, curatorMinScoreHint: 60 },
       botDirectives: {
        generator: 'UNIQUE_APEX_GENERATOR_DIRECTIVE_150X',
        judge: 'UNIQUE_APEX_JUDGE_DIRECTIVE_150X',
        curator: 'UNIQUE_APEX_CURATOR_DIRECTIVE_150X',
        lessonEngine: 'UNIQUE_APEX_LESSON_DIRECTIVE_150X',
        videoDirector: 'UNIQUE_APEX_VIDEO_DIRECTIVE_150X',
        researchAgent: 'UNIQUE_APEX_RESEARCH_DIRECTIVE_150X'
       },
       difficultyDirectives: {
        kolay: 'KOLAY: Temel net soru üret.',
        orta: 'ORTA: Karşılaştırma sorusu üret.',
        zor: 'ZOR: Saha vakası sorusu üret.'
       },
       newAvoidLessons: [],
       newGoldenPatterns: []
      }]
     })
    }));
   }
   if (/MORPA|googleFlowPrompt/i.test(prompt)) {
    return res.end(JSON.stringify({
     response: JSON.stringify({
      title: '3D Video',
      summary: 'Özet',
      environment: 'classroom_3d',
      scenes: [{
       id: 'scene-1', sceneTitle: 'Sahne', environment: 'classroom_3d', cameraMove: 'orbit_slow',
       durationSec: 18, boardTitle: 'Başlık', boardCode: 'A-B', boardBullets: ['M1'],
       dialogues: [
        { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: 'Merhaba!' },
        { speaker: 'ada', emotion: 'curious', action: 'think', text: 'Nedir bu?' }
       ],
       repeatPrompt: 'Tekrar et!',
       quickQuestion: { question: 'Q?', options: ['A', 'B'], answer: 'A' },
       googleFlowPrompt: '3D classroom'
      }]
     })
    }));
   }
   res.end(JSON.stringify({ response: '{}' }));
  });
 });

 await new Promise(r => mockOllama.listen(0, '127.0.0.1', r));
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mockOllama.address().port}`;

 try {
  const { ollamaPlugin } = await import(`../server/ollama.mjs?apex150=${Date.now()}`);
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

  const evo = await call('POST', '/jarvis/apex-evolve', {});
  assert.equal(evo.status, 200, JSON.stringify(evo.json));
  assert.equal(evo.json.ok, true);
  assert.equal(evo.json.state.evolutionCycles, 1);

  // Artık video üretildiğinde ApexArchitect direktifi video promptuna enjekte edilmeli!
  const vid = await call('POST', '/videos/generate', { unitId: '0-0' });
  assert.equal(vid.status, 200);
  const videoPrompt = seenPrompts.find(p => /Morpa Kampüs tarzında 3D etkileşimli eğitim videosu/i.test(p)) || '';
  assert.match(videoPrompt, /UNIQUE_APEX_VIDEO_DIRECTIVE_150X/);

  const status = await call('GET', '/status');
  assert.equal(status.status, 200);
  assert.equal(status.json.upgradeFactorFromPrevious, 100);
  assert.equal(status.json.cumulativeUpgradeFactor, 150000);
  assert.equal(status.json.trainingScaleFactor, 3000000);
  assert.equal(status.json.qwenBoostPercent, 70500000000);
  assert.equal(status.json.addedIntelligenceBoostPercent, 24000000000);
  assert.equal(status.json.trapDefenseTotal, 96);
  assert.equal(status.json.zeroApiRequired, true);
  assert.equal(status.json.localExecutionOnly, true);
  assert.equal(status.json.noApiKeyPrompts, true);
  assert.ok(status.json.jarvis.apex.state.evolutionCycles >= 1);
  assert.ok(status.json.jarvis.apex.diagnostics.botHealth.generator);
  assert.ok(status.json.jarvis.apex.diagnostics.botHealth.localVideoStudio);

  const tickRes = await call('POST', '/intelligence/train-tick', { batchUnits: 4 });
  assert.equal(tickRes.status, 200);
  assert.equal(tickRes.json.ok, true);
  assert.equal(tickRes.json.tick.trapReport.passed, 96);
  assert.equal(tickRes.json.tick.trapReport.total, 96);

  const intel = await call('GET', '/intelligence');
  assert.equal(intel.status, 200);
  assert.equal(intel.json.upgradeFactorFromPrevious, 100);
  assert.equal(intel.json.cumulativeUpgradeFactor, 150000);
  assert.equal(intel.json.trainingScaleFactor, 3000000);
  assert.equal(intel.json.totalBoostPercent, 70500000000);
  assert.equal(intel.json.addedIntelligenceBoostPercent, 24000000000);
  assert.equal(intel.json.trapDefenseTotal, 96);
  assert.equal(intel.json.zeroApiRequired, true);
  assert.equal(intel.json.localExecutionOnly, true);
  assert.equal(intel.json.noApiKeyPrompts, true);
 } finally {
  mockOllama.closeAllConnections?.();
  mockOllama.close();
  if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevBase;
  if (prevDataDir === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevDataDir;
  if (prevDisableAuto === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisableAuto;
  rmSync(dir, { recursive: true, force: true });
 }
});
