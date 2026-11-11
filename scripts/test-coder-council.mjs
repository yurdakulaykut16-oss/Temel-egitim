import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
 CoderCouncilHub,
 OPEN_SOURCE_CODER_CATALOG,
 PROJECT_DEV_SQUADS,
 isUiProtectedTarget
} from '../server/coder-council.mjs';
import { BotParameterMatrix, FACTORED_PARAMS_PER_BOT, TENSOR_HEADS, TENSOR_MODE3_DIM } from '../server/bot-parameter-matrix.mjs';
import { JarvisCore } from '../server/jarvis-core.mjs';
import { SandboxEvolver } from '../server/sandbox-evolver.mjs';

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = server => new Promise(r => server.close(r));

test('CoderCouncilHub & BotParameterMatrix: 40 aşırı eğitilmiş açık kaynak model, 4 takım, 114+ Katrilyon parametre ve UI koruma zırhı', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-coder-council-'));
 try {
  assert.ok(OPEN_SOURCE_CODER_CATALOG.length >= 44, `En az 44 model bekleniyordu, gelen: ${OPEN_SOURCE_CODER_CATALOG.length}`);
  assert.equal(PROJECT_DEV_SQUADS.length, 4);
  assert.equal(TENSOR_HEADS, 64);
  assert.equal(TENSOR_MODE3_DIM, 8192);
  assert.ok(FACTORED_PARAMS_PER_BOT > 2e15);

  // UI değişmezlik kuralı kontrolleri
  assert.equal(isUiProtectedTarget('src/OllamaStudio.tsx', 'ai'), true);
  assert.equal(isUiProtectedTarget('src/style.css', 'server'), true);
  assert.equal(isUiProtectedTarget('index.html', 'server'), true);
  assert.equal(isUiProtectedTarget('server/pool-curator.mjs', 'ui'), true);
  assert.equal(isUiProtectedTarget('server/pool-curator.mjs', 'server'), false);
  assert.equal(isUiProtectedTarget('training/train_lora.py', 'training'), false);

  const matrix = new BotParameterMatrix(dir);
  const council = new CoderCouncilHub(dir);

  const initMatrix = await matrix.loadState();
  const mSum = matrix.getSummary(initMatrix);
  assert.ok(mSum.totalFactoredParamsQuadrillions >= 24.7);

  const initCouncil = await council.loadState();
  assert.ok(initCouncil.totalOvertrainEpochs >= 40 * 28);
  const iqBefore = initCouncil.councilIqAvg;

  const sprint = await council.runOvertrainSprint({
   installedModels: ['qwen2.5-coder:7b', 'deepseek-r1:8b', 'qwen3:8b', 'phi4:14b'],
   hardwareProfile: { coderModel: 'qwen2.5-coder:7b' },
   paramMatrix: matrix,
   epochsPerModel: 3,
   distillDpo: true,
   candidateChanges: [
    { title: 'UI Düzenlemesi', area: 'ui', targetFile: 'src/OllamaStudio.tsx' },
    { title: 'CSS Değişikliği', area: 'frontend', targetFile: 'src/style.css' },
    { title: 'Küratör Skoru İyileştir', area: 'server', targetFile: 'server/pool-curator.mjs' },
    { title: 'Omega DoRA Eğitimi', area: 'training', targetFile: 'training/train_lora.py' }
   ]
  });

  assert.equal(sprint.ok, true);
  assert.equal(sprint.withinOneSecond, true);
  assert.equal(sprint.uiImmutable, true);
  assert.equal(sprint.squadsActive, 4);
  assert.equal(sprint.modelsOvertrained, OPEN_SOURCE_CODER_CATALOG.length);
  assert.equal(sprint.blockedUiTargets.length, 2, 'Arayüze dokunan her 2 öneri kesin bloke edilmeliydi');
  assert.equal(sprint.acceptedNonUiTargets.length, 2, 'Arka uç ve eğitim önerileri kabul edilmeliydi');
  assert.ok(sprint.durationMs < 500, `Overtrain sprint <500ms olmalı, ${sprint.durationMs}ms sürdü`);
  assert.ok(sprint.summary.totalPhysicalParamsBillions > 1500);
  assert.ok(sprint.summary.councilFactoredParamsQuadrillions >= 99);
  assert.ok(sprint.summary.combinedEcosystemFactoredQuadrillions >= 123);
  assert.ok(sprint.summary.councilIqAvg > iqBefore, 'Aşırı eğitim ortalama zekâyı artırmalı');

  const paramReport = council.getFullParameterMatrixReport(await council.loadState(), matrix.getSummary(await matrix.loadState()));
  assert.equal(paramReport.totalCoderModels, OPEN_SOURCE_CODER_CATALOG.length);
  assert.equal(paramReport.perModelParameters.length, OPEN_SOURCE_CODER_CATALOG.length);
  assert.ok(paramReport.perModelParameters.every(p => p.loraRank === 128 && p.epochsCompleted >= 31 && p.factoredParamsQuadrillions >= 2.25));

  const dpoTxt = await readFile(resolve(dir, 'ai-brain', 'qwen-code-training-pairs.jsonl'), 'utf8');
  assert.match(dpoTxt, /coder_council_overtrain_dpo/);

  // JarvisCore da arayüz önerilerini engeller
  const jarvis = new JarvisCore(dir, process.cwd());
  const evolver = new SandboxEvolver(dir);
  const jInn = await jarvis.runQwenCodeInnovation({
   runModelFn: async () => ({
    parsed: {
     innovationTitle: 'Arka Uç Optimizasyon + UI Blok Testi',
     difficultyDirectives: { kolay: 'Net', orta: 'Orta', zor: 'Zor' },
     codeProposal: { title: 'UI Bozma Denemesi', area: 'ui', targetFile: 'src/App.tsx', code: 'console.log(1)' }
    },
    elapsed: 5
   }),
   fallbackModel: 'qwen2.5-coder:7b',
   installedModels: ['qwen2.5-coder:7b'],
   evolver,
   telemetry: { approvalRate: 92, dualAnswerBlocked: 0, rejectionReasons: {} },
   studentProfile: { weakUnits: [] },
   items: [],
   paramMatrix: matrix
  });
  assert.equal(jInn.proposal.status, 'blocked_ui_immutable');
  await assert.rejects(() => jarvis.setProposalStatus(jInn.proposal.id, 'accepted'), /Arayüz/);
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
});

test('Ollama middleware: /coder-council, /coder-council/parameters, /coder-council/team-develop (<1sn) uç noktalarını sunar', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-coder-api-'));
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_OFFLINE_ONLY = '1';
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_DATA_DIR = dir;
 process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?codercouncil=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;

 try {
  const getCouncil = await (await fetch(`${base}/api/ollama/coder-council`)).json();
  assert.equal(getCouncil.ok, true);
  assert.equal(getCouncil.summary.totalModels, OPEN_SOURCE_CODER_CATALOG.length);
  assert.equal(getCouncil.summary.uiImmutable, true);
  assert.ok(getCouncil.summary.combinedEcosystemFactoredQuadrillions >= 123);

  const paramRes = await (await fetch(`${base}/api/ollama/coder-council/parameters`)).json();
  assert.equal(paramRes.ok, true);
  assert.equal(paramRes.totalCoderModels, OPEN_SOURCE_CODER_CATALOG.length);
  assert.equal(paramRes.squads.length, 4);
  assert.ok(paramRes.combinedEcosystemFactoredQuadrillions >= 123);

  const devRes = await fetch(`${base}/api/ollama/coder-council/team-develop`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({
    epochsPerModel: 3,
    candidateChanges: [
     { title: 'UI Dokunma', area: 'ui', targetFile: 'src/OllamaStudio.tsx' },
     { title: 'Video Motoru Geliştirme', area: 'video', targetFile: 'server/video-director.mjs' }
    ]
   })
  });
  const devJson = await devRes.json();
  assert.equal(devRes.status, 200);
  assert.equal(devJson.ok, true);
  assert.equal(devJson.uiImmutable, true);
  assert.equal(devJson.withinOneSecond, true, `44-model team-develop <1sn kalmalıydı (${devJson.totalDurationMs}ms)`);
  assert.equal(devJson.squadsActive, 4);
  assert.equal(devJson.modelsOvertrained, OPEN_SOURCE_CODER_CATALOG.length);
  assert.equal(devJson.blockedUiTargets.length, 1);
  assert.equal(devJson.acceptedNonUiTargets.length, 1);

  const statusJson = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(statusJson.coderCouncil.totalModels, OPEN_SOURCE_CODER_CATALOG.length);
  assert.equal(statusJson.coderCouncil.uiImmutable, true);
  assert.ok(statusJson.parameterMatrix.totalFactoredParamsQuadrillions >= 24.7);
 } finally {
  stopOllamaLoops();
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY;
  else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP;
  else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  await new Promise(r => setTimeout(r, 150));
  app.closeAllConnections?.();
  await close(app);
  await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }).catch(() => {});
 }
});
