import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { BotParameterMatrix, TENSOR_HEADS, RANK_BASIS_DIM, FACTORED_PARAMS_PER_BOT } from '../server/bot-parameter-matrix.mjs';
import { MultiAiSwarmEvaluator, KNOWLEDGE_LEVEL_PERSONAS, TESTED_SUBSYSTEMS } from '../server/multi-ai-evaluator.mjs';
import { SandboxEvolver } from '../server/sandbox-evolver.mjs';

test('BotParameterMatrix v2 seamlessly upgrades v1 (16-head/12-rank) parameters to 32-head/16-rank (377.96B Kronecker-MoE + knowledgeLevelWeights)', async () => {
 const dir = mkdtempSync(resolve(tmpdir(), 'param-upgrade-'));
 try {
  const brainDir = resolve(dir, 'ai-brain');
  mkdirSync(brainDir, { recursive: true });
  writeFileSync(resolve(brainDir, 'bot-parameters.json'), JSON.stringify({
   version: 1,
   totalEvolutions: 7,
   bots: {
    generator: {
     expertGates: new Array(16).fill(0.91),
     uBasis: Array.from({ length: 16 }, () => new Array(12).fill(0.25)),
     vBasis: Array.from({ length: 16 }, () => new Array(12).fill(-0.15)),
     parameterGeneration: 8
    }
   }
  }));

  const matrix = new BotParameterMatrix(dir);
  const upgraded = await matrix.loadState();
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.totalEvolutions, 7);
  assert.equal(upgraded.bots.generator.kroneckerFactoredParams, FACTORED_PARAMS_PER_BOT);
  assert.equal(upgraded.bots.generator.expertGates.length, TENSOR_HEADS);
  assert.equal(upgraded.bots.generator.expertGates[0], 0.91);
  assert.equal(upgraded.bots.generator.uBasis[0].length, RANK_BASIS_DIM);
  assert.equal(upgraded.bots.generator.uBasis[0][0], 0.25);
  assert.ok(upgraded.bots.generator.knowledgeLevelWeights.adversarialTrapShield > 0.8);
  assert.equal(upgraded.bots.generator.crossAiSwarmWeights.selfConsistencyPasses, 3);
  assert.ok(upgraded.totalFactoredParamsBillions >= 377.9);
  assert.ok(upgraded.totalEcosystemParamsBillions >= 860);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('MultiAiSwarmEvaluator probes all 5 knowledge levels + 5 subsystems, runs Claude-style 3-pass self-critique, and splits across distinct AI models', async () => {
 const dir = mkdtempSync(resolve(tmpdir(), 'multi-ai-swarm-'));
 try {
  const matrix = new BotParameterMatrix(dir);
  const evolver = new SandboxEvolver(dir);
  const swarm = new MultiAiSwarmEvaluator(dir);
  const policy = await evolver.loadPolicy();

  // Intentionally include defective questions + broken drill so swarm MUST detect them
  const badItems = [
   {
    id: 'q1', unitId: '0-0', status: 'approved', difficulty: 'zor',
    question: 'Bu uzun soru kökü kitapta yer alan dayanıklılık kavramını sormaktadır?',
    options: [
     'Kısa A',
     'Kısa B',
     'Bu aşırı derecede uzun olan doğru şık tüm diğer şıklardan iki kat fazla karakter içererek cevabı ele verir',
     'Kısa D'
    ],
    answer: 'Bu aşırı derecede uzun olan doğru şık tüm diğer şıklardan iki kat fazla karakter içererek cevabı ele verir',
    evidence: 'kısa' // <15 chars weak evidence!
   }
  ];
  const badStudy = {
   flashcards: [{ id: 'f1' }],
   matchings: [],
   drills: [{ id: 'd1', type: 'fill_blank', prompt: 'Boşluğu olmayan hatalı alıştırma' }]
  };

  const inspection = swarm.inspectEcosystemAcrossLevels({
   items: badItems,
   study: badStudy,
   contexts: [{ id: '0-0', unit: 'Dayanıklılık', text: 'Aerobik kapasite VO2max ile ölçülür.' }],
   passagesByUnit: new Map([['0-0', [{ id: '0-0#00', text: 'Aerobik kapasite VO2max ile ölçülür.' }]]]),
   lessonsSummary: { enhancedCount: 2 },
   evolver,
   policy,
   paramState: await matrix.loadState(),
   telemetry: { approvalRate: 64, dualAnswerBlocked: 4 }
  });

  assert.equal(Object.keys(inspection.levelScores).length, KNOWLEDGE_LEVEL_PERSONAS.length);
  assert.equal(Object.keys(inspection.subsystemScores).length, TESTED_SUBSYSTEMS.length);
  assert.equal(inspection.diagnostics.lengthLeakCount, 1);
  assert.equal(inspection.diagnostics.weakEvidenceCount, 1);
  assert.ok(inspection.levelScores.speed_skimmer < 88);
  assert.ok(inspection.levelScores.expert_coach < 92);

  // Run multi-LLM shard probe splitting across 3 distinct model families + full evaluateAndEvolve
  const calledModels = [];
  const mockRunModel = async (modelName, prompt) => {
   calledModels.push(modelName);
   if (prompt.includes('novice') || prompt.includes('Acemi')) {
    return { parsed: { novicePass: true, intermediatePass: false, weakSpot: 'Orta çeldirici dengesi sıkılaştırılmalı' }, elapsed: 5 };
   }
   if (prompt.includes('Başhakem')) {
    return { parsed: { expertPass: false, trapRisk: true, prescription: 'Kanıt eşiği artırılmalı' }, elapsed: 6 };
   }
   return {
    parsed: {
     critique: 'Uzunluk sızıntısı ve eksik kanıt için generator sıcaklığı düşürülmeli',
     parameterPatches: {
      generator: {
       temperature: 0.43,
       knowledgeLevelWeights: { expertRigor: 0.99 },
       crossAiSwarmWeights: { selfConsistencyPasses: 4 }
      }
     }
    },
    elapsed: 7
   };
  };

  const fullRes = await swarm.evaluateAndEvolve({
   paramMatrix: matrix,
   items: badItems,
   study: badStudy,
   contexts: [{ id: '0-0', unit: 'Dayanıklılık', text: 'Aerobik kapasite VO2max ile ölçülür.' }],
   passagesByUnit: new Map([['0-0', [{ id: '0-0#00', text: 'Aerobik kapasite VO2max ile ölçülür.' }]]]),
   lessonsSummary: { enhancedCount: 2 },
   evolver,
   policy,
   studentProfile: { weakUnits: ['0-0'] },
   telemetry: { approvalRate: 64, dualAnswerBlocked: 4 },
   runModelFn: mockRunModel,
   installedModels: ['gemma3:27b', 'qwen3:32b', 'qwen2.5-coder:32b'],
   source: 'claude-swarm-unit-test'
  });

  assert.equal(fullRes.ok, true);
  assert.equal(fullRes.gateAccepted, true);
  assert.equal(fullRes.liveShards.shards.length, 3);
  assert.ok(new Set(calledModels).size >= 2, 'Should shard across distinct AI model families');
  assert.ok(fullRes.critiqueChain.length >= 2);
  assert.equal(fullRes.evalState.totalSwarmRuns, 1);
  assert.equal(fullRes.evalState.selfCritiquePassesTotal, 3);
  assert.equal(fullRes.evalState.multiModelSplitsTotal, 3);

  const evolvedState = await matrix.loadState();
  assert.equal(evolvedState.bots.generator.inferenceParams.temperature, 0.43);
  assert.equal(evolvedState.bots.generator.knowledgeLevelWeights.expertRigor, 0.99);
  assert.equal(evolvedState.bots.generator.crossAiSwarmWeights.selfConsistencyPasses, 4);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('Ollama middleware exposes /swarm-evaluate GET & POST and embeds swarmEval in /status', async () => {
 const dir = mkdtempSync(resolve(tmpdir(), 'swarm-http-'));
 const prevDir = process.env.TEMPO_DATA_DIR;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 const { ollamaPlugin } = await import(`../server/ollama.mjs?swarm=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use: (_p, fn) => { middleware = fn; } } });
 const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/api/ollama')) {
   req.url = req.url.slice('/api/ollama'.length) || '/';
   return middleware(req, res, () => { res.statusCode = 404; res.end('Not found'); });
  }
  res.statusCode = 404;
  res.end('Not found');
 });
 await new Promise(r => srv.listen(0, '127.0.0.1', r));
 const baseUrl = `http://127.0.0.1:${srv.address().port}/api/ollama`;

 try {
  // Initial unhardened dir: swarm must detect unhardened adversarial gap and emit Red-Team critique
  const preRes = await fetch(`${baseUrl}/swarm-evaluate`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ withMultiLlm: false, source: 'http-swarm-pre' })
  });
  assert.equal(preRes.status, 200);
  const preJson = await preRes.json();
  assert.equal(preJson.ok, true);
  assert.ok(preJson.report.critiqueChain.some(line => line.includes('Red-Team')));

  // After IntelligenceTrainer tick hardens 48-trap defense, swarm adversarial_exploiter climbs >= 90
  await fetch(`${baseUrl}/intelligence/train-tick`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ batchUnits: 2 })
  });

  const postRes = await fetch(`${baseUrl}/swarm-evaluate`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ withMultiLlm: false, source: 'http-swarm-test' })
  });
  assert.equal(postRes.status, 200);
  const postJson = await postRes.json();
  assert.equal(postJson.ok, true);
  assert.equal(postJson.evolution.botsUpdated, 8);
  assert.ok(postJson.summary.totalFactoredMetaTensorBillions >= 377.9);
  assert.ok(postJson.report.levelScores.adversarial_exploiter >= 90);

  const getRes = await fetch(`${baseUrl}/swarm-evaluate`);
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.totalSwarmRuns, 3);

  const statusJson = await (await fetch(`${baseUrl}/status`)).json();
  assert.ok(statusJson.swarmEval);
  assert.equal(statusJson.swarmEval.totalSwarmRuns, 3);
 } finally {
  srv.close();
  if (prevDir === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevDir;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  rmSync(dir, { recursive: true, force: true });
 }
});
