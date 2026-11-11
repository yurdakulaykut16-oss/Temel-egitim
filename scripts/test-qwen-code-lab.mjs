import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QwenCodeLab } from '../server/qwen-code-lab.mjs';
import { SandboxEvolver } from '../server/sandbox-evolver.mjs';
import { BotParameterMatrix } from '../server/bot-parameter-matrix.mjs';
import { JarvisCore } from '../server/jarvis-core.mjs';
import { ApexArchitect } from '../server/apex-architect.mjs';
import { GithubKnowledgeMiner } from '../server/github-researcher.mjs';
import { ResearchAgent } from '../server/research-agent.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));

test('QwenCodeLab: 100-yöntem izole node:vm yarışı, en hızlı+en iyi seçimi, DPO kod verisi ve GitHub prototip doğrulaması', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-qwen-lab-'));
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 process.env.TEMPO_OFFLINE_ONLY = '1';
 try {
  const lab = new QwenCodeLab(dir, process.cwd());
  const evolver = new SandboxEvolver(dir);
  const paramMatrix = new BotParameterMatrix(dir);
  const jarvis = new JarvisCore(dir, process.cwd());
  const apex = new ApexArchitect(dir);
  const githubMiner = new GithubKnowledgeMiner(dir);
  const researchAgent = new ResearchAgent(dir);

  const sampleApproved = [
   {
    id: 'q-ok-1',
    unitId: '0-0',
    question: 'Planlı ve tekrarlı biçimde yapılan bedensel hareket aşağıdakilerden hangisidir?',
    options: ['Fiziksel egzersiz', 'Rastgele yürüyüş', 'Pasif dinlenme', 'Ev temizliği'],
    answer: 'Fiziksel egzersiz',
    explanation: 'Egzersiz planlı, yapılandırılmış ve tekrarlı fiziksel aktivitedir.',
    evidence: 'Egzersiz planlı ve tekrarlıdır.',
    status: 'approved'
   }
  ];

  // 1) Güvensiz/kötü LLM adayı + 99 güvenli algoritma aynı anda 100-yöntem yarışına girer
  const tour = await lab.runHundredMethodTournament({
   taskTitle: '96-Tuzak Hız & Doğruluk Turnuvası',
   llmCandidates: [
    { name: 'Tehlikeli Aday', code: 'function evaluateCandidate(){ process.exit(1); }' }
   ],
   evolver,
   paramMatrix,
   jarvis,
   items: sampleApproved,
   applyToProject: true
  });

  assert.equal(tour.ok, true);
  assert.equal(tour.methodsEvaluated, 100);
  assert.ok(tour.validCount >= 20);
  assert.equal(tour.leaderboard.length, 5);
  assert.ok(tour.winner.avgMicros > 0 && tour.winner.avgMicros < 5000);
  assert.ok(tour.winner.f1Score >= 90);
  assert.equal(tour.winner.totalTraps, 96);
  assert.ok(tour.appliedPolicyVersion >= 1);
  assert.equal(tour.pairsWritten, 1);
  const labStateAfter = await lab.loadState();
  assert.ok(labStateAfter.qwenIqMultiplier >= 705000000);
  assert.equal(labStateAfter.localExecutionOnly, true);

  // Kazanan kodun evolver politikasına gerçekten yazıldığını doğrula
  const policy = await evolver.loadPolicy();
  assert.equal(policy.customRuleCode, tour.winner.code);

  // BotParameterMatrix içindeki qwenCodeSandbox parametrelerinin güncellendiğini doğrula
  const pState = await paramMatrix.loadState();
  assert.equal(pState.bots.qwenCodeSandbox.inferenceParams.temperature, 0.14);
  assert.equal(pState.bots.qwenCodeSandbox.inferenceParams.num_ctx, 12288);
  assert.equal(pState.bots.qwenCodeSandbox.behavioralWeights.astSafetyStrictness, 0.999);

  // 2) Web + GitHub tarzı izole prototip proje üret, node --test çalıştır, doğrulanırsa projeye geçir!
  const proto = await lab.runInternetAndGithubPrototypeLab({
   githubMiner,
   researchAgent,
   jarvis,
   apex,
   paramMatrix,
   forceWebMine: true
  });
  assert.equal(proto.ok, true);
  assert.equal(proto.testsPassed, true);
  assert.equal(proto.promoted, true);
  assert.ok(existsSync(join(proto.protoDir, 'README.md')));
  assert.ok(existsSync(join(proto.protoDir, 'index.mjs')));
  assert.ok(existsSync(join(proto.protoDir, 'test.mjs')));

  const jMem = await jarvis.loadMemory();
  assert.ok(jMem.codeProposals.some(p => p.status === 'accepted' && p.id === `proto-${proto.slug}`));

  const pairsRaw = await readFile(lab.pairsFile, 'utf8');
  const pairLines = pairsRaw.trim().split('\n').map(l => JSON.parse(l));
  assert.equal(pairLines.length, 2);
  assert.equal(pairLines[0].task, 'qwen_code_100_method_optimization');
  assert.equal(pairLines[1].task, 'github_prototype_synthesis');
 } finally {
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY;
  else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  await rm(dir, { recursive: true, force: true });
 }
});

test('Ollama HTTP API: /qwen-lab/tournament, /qwen-lab/prototype, mega adapter & /status qwenCodeLab entegrasyonu', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-qwen-http-'));
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_OFFLINE_ONLY = '1';
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_DATA_DIR = dir;

 const fakeOllama = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:14b' }] }));
 });
 const fakePort = await listen(fakeOllama);
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;

 const { ollamaPlugin } = await import(`../server/ollama.mjs?qwenlab=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;
 const postJson = (path, bodyObj = {}) => fetch(`${base}/api/ollama${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify(bodyObj)
 });

 try {
  // 1) Mega adaptör ve Qwen2.5-Coder-32B eğitim konfigürasyonu kabul edilmeli
  const cfgRes = await postJson('/jarvis/config', {
   baseHfModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
   adapterSize: 'mega'
  });
  assert.equal(cfgRes.status, 200);
  const cfgJson = await cfgRes.json();
  assert.equal(cfgJson.config.adapterSize, 'mega');
  assert.equal(cfgJson.config.baseHfModel, 'Qwen/Qwen2.5-Coder-32B-Instruct');

  // 2) HTTP POST /qwen-lab/tournament
  const tRes = await postJson('/qwen-lab/tournament', { useLiveLlm: false });
  assert.equal(tRes.status, 200);
  const tJson = await tRes.json();
  assert.equal(tJson.methodsEvaluated, 100);
  assert.ok(tJson.winner.f1Score >= 90);

  // 3) HTTP POST /qwen-lab/prototype
  const pRes = await postJson('/qwen-lab/prototype', { forceWebMine: true });
  assert.equal(pRes.status, 200);
  const pJson = await pRes.json();
  assert.equal(pJson.testsPassed, true);
  assert.equal(pJson.promoted, true);

  // 4) GET /status & GET /qwen-lab özet doğrulaması
  const statusJson = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(statusJson.qwenCodeLab.tournamentsRun, 1);
  assert.equal(statusJson.qwenCodeLab.totalMethodsBenchmarked, 100);
  assert.equal(statusJson.qwenCodeLab.prototypesPromotedToProject, 1);
  assert.ok(statusJson.qwenCodeLab.selfTrainingPairsGenerated >= 2);
  assert.ok(statusJson.qwenCodeLab.qwenSkillLevel >= 4);

  const labJson = await (await fetch(`${base}/api/ollama/qwen-lab`)).json();
  assert.equal(labJson.ok, true);
  assert.equal(labJson.summary.lastLeaderboard.length, 5);
 } finally {
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY;
  else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP;
  else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  await close(app);
  await close(fakeOllama);
  await rm(dir, { recursive: true, force: true });
 }
});
