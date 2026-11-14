import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { BotParameterMatrix, ALL_AI_BOT_IDS, FACTORED_PARAMS_PER_BOT, parseBackboneParamsBillions } from '../server/bot-parameter-matrix.mjs';
import { IntelligenceTrainer } from '../server/intelligence-trainer.mjs';
import { ApexArchitect } from '../server/apex-architect.mjs';
import { SandboxEvolver } from '../server/sandbox-evolver.mjs';
import { JarvisCore } from '../server/jarvis-core.mjs';

test('parseBackboneParamsBillions resolves small, multi-billion, MoE, and cloud models accurately', () => {
 assert.equal(parseBackboneParamsBillions('qwen3:8b'), 8);
 assert.equal(parseBackboneParamsBillions('qwen3:32b'), 32);
 assert.equal(parseBackboneParamsBillions('qwen2.5:72b-instruct'), 72);
 assert.equal(parseBackboneParamsBillions('kimi-k3.1-pro:cloud'), 120);
 assert.equal(parseBackboneParamsBillions('deepseek-v4.1-flash:cloud'), 671);
 assert.equal(parseBackboneParamsBillions('wan2.2-14b-i2v'), 14);
});

test('BotParameterMatrix initializes 17.18B+ Kronecker-MoE + neural backbone across all 8 AIs and supports Meta-AI evolution + rollback', async () => {
 const dir = mkdtempSync(resolve(tmpdir(), 'param-matrix-'));
 try {
  const matrix = new BotParameterMatrix(dir);
  const initial = await matrix.loadState();
  const summary0 = matrix.getSummary(initial);

  assert.equal(summary0.totalBots, 8);
  assert.equal(summary0.bots.length, 8);
  for (const botId of ALL_AI_BOT_IDS) {
   const bot = initial.bots[botId];
   assert.ok(bot, `Missing bot ${botId}`);
   assert.equal(bot.kroneckerFactoredParams, FACTORED_PARAMS_PER_BOT);
   assert.ok(bot.kroneckerParamsBillions >= 17.1, `Expected >=17.1B Kronecker tensor for ${botId}`);
   assert.ok(bot.totalEffectiveParamsBillions > 20, `Expected >20B combined capacity for ${botId}`);
   const score = matrix.forwardExpertScore(bot, [0.4, 0.7, 0.2, 0.9]);
   assert.ok(Number.isFinite(score) && score >= 0 && score <= 1);
  }
  assert.ok(summary0.totalFactoredMetaTensorBillions >= 188.9);
  assert.ok(summary0.totalEcosystemParamsBillions >= 500);

  // Sync larger backbones (e.g. 72B generator, 32B judge)
  const synced = await matrix.syncBackbones({
   generatorModel: 'qwen2.5:72b-instruct',
   verifierModel: 'qwen3:32b',
   judge2Model: 'gemma3:27b',
   evolverModel: 'qwen3:32b',
   coderModel: 'qwen2.5-coder:32b'
  });
  assert.equal(synced.bots.generator.backboneParamsBillions, 72);
  assert.equal(synced.bots.judge.backboneParamsBillions, 59);

  // Meta-AI evolves all 8 bots with telemetry + diagnostics + customPatches
  const genBefore = synced.bots.generator.parameterGeneration;
  const tensorBefore = [...synced.bots.generator.expertGates];
  const evo1 = await matrix.evolveAllBotParameters({
   diagnostics: {
    botHealth: {
     generator: { score: 62, bottleneck: 'çeldirici zayıf' },
     judge: { score: 88, bottleneck: 'stabil' }
    }
   },
   telemetry: { approvalRate: 58, dualAnswerBlocked: 7 },
   studentProfile: { weakUnits: ['2-1', '4-3'] },
   trapF1: 96,
   source: 'apex-meta-architect-test',
   customPatches: {
    generator: {
     temperature: 0.49,
     repeat_penalty: 1.13,
     behavioralWeights: { distractorSophistication: 0.99 }
    },
    unknownBotShouldBeIgnored: { temperature: 99 }
   }
  });
  assert.equal(evo1.evolution.botsUpdated, 8);
  assert.equal(evo1.state.bots.generator.parameterGeneration, genBefore + 1);
  assert.equal(evo1.state.bots.generator.inferenceParams.temperature, 0.49);
  assert.equal(evo1.state.bots.generator.inferenceParams.repeat_penalty, 1.13);
  assert.equal(evo1.state.bots.generator.behavioralWeights.distractorSophistication, 0.99);
  assert.notDeepEqual(evo1.state.bots.generator.expertGates, tensorBefore);

  // Runtime inference options map cleanly per role
  const genOpts = matrix.getRuntimeInferenceOptions(evo1.state, 'generator');
  assert.equal(genOpts.temperature, 0.49);
  assert.ok(genOpts.top_k >= 16);

  // Rollback restores generation and tensor gates
  const rb = await matrix.rollbackLastEvolution();
  assert.equal(rb.state.bots.generator.parameterGeneration, genBefore);
  assert.deepEqual(rb.state.bots.generator.expertGates, tensorBefore);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('IntelligenceTrainer, ApexArchitect, and JarvisCore all develop BotParameterMatrix during evolution runs', async () => {
 const dir = mkdtempSync(resolve(tmpdir(), 'meta-param-evolve-'));
 try {
  const matrix = new BotParameterMatrix(dir);
  const trainer = new IntelligenceTrainer(dir);
  const evolver = new SandboxEvolver(dir);
  const jarvis = new JarvisCore(dir, process.cwd());
  const apex = new ApexArchitect(dir);

  const sampleContexts = [
   { id: '0-0', book: 'Kitap 1', unit: 'Antrenman Bilimi', text: 'Dayanıklılık aerobik kapasiteyi artırır. Maksimal oksijen tüketimi temel ölçüttür.' },
   { id: '1-0', book: 'Kitap 2', unit: 'Anatomi', text: 'İskelet kası istemli çalışır ve aktin miyozin filamentlerinden oluşur.' }
  ];
  const passages = new Map([
   ['0-0', [{ id: '0-0#00', heading: 'Giriş', pages: [1], keywords: ['aerobik', 'oksijen'], text: sampleContexts[0].text }]],
   ['1-0', [{ id: '1-0#00', heading: 'Kas', pages: [2], keywords: ['aktin', 'miyozin'], text: sampleContexts[1].text }]]
  ]);

  // 1) Continuous IntelligenceTrainer tick evolves all 8 AIs
  const tickRes = await trainer.runContinuousTrainingTick({
   contexts: sampleContexts,
   passagesByUnit: passages,
   items: [],
   staticBank: [],
   studentProfile: { weakUnits: ['0-0'] },
   evolver,
   jarvis,
   apex,
   paramMatrix: matrix,
   batchUnits: 2
  });
  assert.ok(tickRes.ok);
  assert.equal(tickRes.parameterMatrix.totalEvolutions, 1);

  // 2) ApexArchitect tournament evolution injects parameterPatches & advances parameter matrix
  const fakeRunModel = async (model, prompt) => {
   if (prompt.includes('Adli Sistem Eleştirmenisin')) {
    return { parsed: { criticalDiagnosis: 'Test darboğazı', crossBotHypotheses: [] }, elapsed: 10 };
   }
   return {
    parsed: {
     candidates: [{
      strategyName: 'Param-Matris Omega Turnuvası',
      hyperParams: { temperatureOffset: -0.02, batchSizeHint: 4, curatorMinScoreHint: 65, turboQualityLock: true },
      parameterPatches: {
       judge: { temperature: 0.16, top_p: 0.84, behavioralWeights: { dualAnswerVigilance: 0.99 } }
      },
      botDirectives: {
       generator: 'Kitap kanıtıyla üret',
       judge: 'Çift cevabı sıfır toleransla reddet',
       curator: 'Kaliteyi koru',
       lessonEngine: 'Püf noktalarını vurgula',
       researchAgent: 'Kavram tuzaklarını çıkar',
       kayseriCoach: 'Keskin yerel yorum yap',
       qwenCodeSandbox: 'Güvenli JS kuralları yaz',
       turboQualityGuard: 'Turbo kalitesini kilitle'
      },
      difficultyDirectives: { kolay: 'Net tanım', orta: 'İlişki', zor: 'Vaka analizi' }
     }]
    },
    elapsed: 12
   };
  };

  const apexRes = await apex.evolveEcosystem({
   runModelFn: fakeRunModel,
   model: 'qwen3:14b',
   coderModel: 'qwen2.5-coder:14b',
   evolver,
   jarvis,
   items: [],
   contexts: sampleContexts,
   passagesByUnit: passages,
   telemetry: { approvalRate: 86, dualAnswerBlocked: 2 },
   studentProfile: { weakUnits: ['0-0'] },
   paramMatrix: matrix
  });
  assert.equal(apexRes.parameterEvolution.totalEvolutions, 2);
  const afterApex = await matrix.loadState();
  assert.equal(afterApex.bots.judge.inferenceParams.temperature, 0.16);
  assert.equal(afterApex.bots.judge.behavioralWeights.dualAnswerVigilance, 0.99);

  // 3) JarvisCore Qwen-Code innovation further evolves parameters
  const jRes = await jarvis.runQwenCodeInnovation({
   runModelFn: async () => ({
    parsed: {
     innovationTitle: 'Param-Tensor Hız & Keskinlik',
     difficultyDirectives: { kolay: 'Net', orta: 'Orta', zor: 'Zor' },
     parameterPatches: {
      researchAgent: { top_p: 0.91, behavioralWeights: { confusionPairMiningDepth: 0.99 } }
     }
    },
    elapsed: 10
   }),
   fallbackModel: 'qwen2.5-coder:14b',
   installedModels: ['qwen2.5-coder:14b'],
   evolver,
   telemetry: { approvalRate: 88, dualAnswerBlocked: 1, rejectionReasons: {} },
   studentProfile: { weakUnits: ['0-0'] },
   items: [],
   paramMatrix: matrix
  });
  assert.equal(jRes.parameterEvolution.totalEvolutions, 3);
  const afterJarvis = await matrix.loadState();
  assert.equal(afterJarvis.bots.researchAgent.inferenceParams.top_p, 0.91);
  assert.equal(afterJarvis.bots.researchAgent.behavioralWeights.confusionPairMiningDepth, 0.99);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('Ollama middleware exposes /parameters, /parameters/evolve, /parameters/rollback and embeds parameterMatrix in /status', async () => {
 const dir = mkdtempSync(resolve(tmpdir(), 'param-http-'));
 const prevDir = process.env.TEMPO_DATA_DIR;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 const { ollamaPlugin } = await import(`../server/ollama.mjs?v=${Date.now()}`);
 const plugin = ollamaPlugin();
 const middlewares = [];
 plugin.configureServer({
  middlewares: { use: (prefix, handler) => middlewares.push({ prefix, handler }) }
 });
 const middleware = middlewares[0].handler;
 const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/api/ollama')) {
   req.url = req.url.slice('/api/ollama'.length) || '/';
   return middleware(req, res, () => {
    res.statusCode = 404;
    res.end('Not found');
   });
  }
  res.statusCode = 404;
  res.end('Not found');
 });
 await new Promise(resolveSrv => srv.listen(0, '127.0.0.1', resolveSrv));
 const port = srv.address().port;
 const baseUrl = `http://127.0.0.1:${port}/api/ollama`;

 try {
  const statusRes = await fetch(`${baseUrl}/status`);
  assert.equal(statusRes.status, 200);
  const statusJson = await statusRes.json();
  assert.ok(statusJson.parameterMatrix);
  assert.equal(statusJson.parameterMatrix.totalBots, 8);
  assert.ok(statusJson.parameterMatrix.totalEcosystemParamsBillions >= 500);

  const getRes = await fetch(`${baseUrl}/parameters`);
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.bots.length, 8);

  const evoRes = await fetch(`${baseUrl}/parameters/evolve`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
    source: 'http-meta-test',
    customPatches: {
     kayseriCoach: { temperature: 0.78, behavioralWeights: { comedyTiming: 0.99 } }
    }
   })
  });
  assert.equal(evoRes.status, 200);
  const evoJson = await evoRes.json();
  assert.equal(evoJson.ok, true);
  assert.equal(evoJson.summary.lastEvolutionSource, 'http-meta-test');
  const coach = evoJson.summary.bots.find(b => b.botId === 'kayseriCoach');
  assert.equal(coach.inferenceParams.temperature, 0.78);
  assert.equal(coach.behavioralWeights.comedyTiming, 0.99);

  const rbRes = await fetch(`${baseUrl}/parameters/rollback`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: '{}'
  });
  assert.equal(rbRes.status, 200);
  const rbJson = await rbRes.json();
  assert.equal(rbJson.ok, true);
  assert.equal(rbJson.summary.totalEvolutions, evoJson.summary.totalEvolutions - 1);
 } finally {
  srv.close();
  if (prevDir === undefined) delete process.env.TEMPO_DATA_DIR;
  else process.env.TEMPO_DATA_DIR = prevDir;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP;
  else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  rmSync(dir, { recursive: true, force: true });
 }
});
