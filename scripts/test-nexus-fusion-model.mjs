import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NexusTitanFusionModel, NEXUS_MODEL_TAG } from '../server/nexus-fusion-model.mjs';

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = server => new Promise(r => server.close(r));

test('NexusTitanFusionModel: Ollama + yerel disk + GitHub modellerini birleştirir, Modelfile/API create üretir, SFT/DPO damıtır ve UI dahil projeyi güvenli doğrulamayla geliştirir', async () => {
 const sandboxRoot = await mkdtemp(join(tmpdir(), 'tempo-nexus-proj-'));
 const dataDir = join(sandboxRoot, '.tempo-data');
 await mkdir(join(sandboxRoot, 'src'), { recursive: true });
 await mkdir(join(sandboxRoot, 'server'), { recursive: true });
 await mkdir(join(sandboxRoot, 'training'), { recursive: true });
 await mkdir(join(sandboxRoot, 'scripts'), { recursive: true });
 await mkdir(join(dataDir, 'models'), { recursive: true });

 // İzole sahte yerel proje dosyaları + disk üzerinde yerel harici .gguf ağırlık dosyası
 const initialCss = ':root { --nexus-accent: #2e6b3f; }\n';
 await writeFile(join(sandboxRoot, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>', 'utf8');
 await writeFile(join(sandboxRoot, 'src/main.tsx'), 'export function App() { return "Tempo"; }\n', 'utf8');
 await writeFile(join(sandboxRoot, 'src/OllamaStudio.tsx'), 'export const Studio = () => "Studio";\n', 'utf8');
 await writeFile(join(sandboxRoot, 'src/style.css'), 'body { margin: 0; }\n', 'utf8');
 await writeFile(join(sandboxRoot, 'src/nexus-live-theme.css'), initialCss, 'utf8');
 await writeFile(join(sandboxRoot, 'server/ollama.mjs'), 'export const ok = true;\n', 'utf8');
 await writeFile(join(sandboxRoot, 'training/prepare.py'), 'x = 1\n', 'utf8');
 await writeFile(join(sandboxRoot, 'scripts/test-nexus-fusion-model.mjs'), 'export const t = 1;\n', 'utf8');
 await writeFile(join(dataDir, 'models/custom-qwen3-local.gguf'), 'GGUF-LOCAL-DUMMY', 'utf8');

 // Sahte canlı Ollama sunucusu (/api/tags, /api/create, /api/pull, /api/generate)
 const ollamaCalls = { create: [], pull: [] };
 const fakeOllama = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const bodyStr = Buffer.concat(chunks).toString('utf8');
  let bodyJson = {};
  try { bodyJson = JSON.parse(bodyStr || '{}'); } catch {}
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/tags') {
   return res.end(JSON.stringify({
    models: [{ name: 'qwen3:8b' }, { name: 'qwen2.5-coder:7b' }, ...ollamaCalls.create.map(c => ({ name: c.model }))]
   }));
  }
  if (req.url === '/api/create') {
   ollamaCalls.create.push(bodyJson);
   return res.end(JSON.stringify({ status: 'success' }));
  }
  if (req.url === '/api/pull') {
   ollamaCalls.pull.push(bodyJson);
   return res.end(JSON.stringify({ status: 'success' }));
  }
  res.statusCode = 404;
  res.end('{}');
 });

 const ollamaPort = await listen(fakeOllama);
 const ollamaUrl = `http://127.0.0.1:${ollamaPort}`;
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 delete process.env.TEMPO_OFFLINE_ONLY;

 try {
  const nexus = new NexusTitanFusionModel(dataDir, sandboxRoot);

  // 1) Yerel harici ağırlık (.gguf) ve Ollama modellerini otomatik keşfet + özel harici model kaydet
  const reg = await nexus.registerExternalModel({
   name: 'DeepSeek-R1-Distill-Local',
   pathOrUrl: join(dataDir, 'models/custom-qwen3-local.gguf'),
   githubRepo: 'deepseek-ai/DeepSeek-R1',
   paramsBillions: 8.0
  });
  assert.equal(reg.ok, true);
  assert.equal(reg.entry.diskVerified, true);

  const discovered = await nexus.discoverAllModelSources({ installedModels: ['qwen3:8b', 'qwen2.5-coder:7b'], forceScan: true });
  assert.ok(discovered.localDiskModels.some(m => m.name === 'custom-qwen3-local.gguf'));
  assert.ok(discovered.catalog.some(c => c.ollamaTag === 'qwen3:8b' && c.installed === true));
  assert.ok(discovered.catalog.some(c => c.sourceType === 'github' && c.installed === false));

  // 2) Ollama üzerinde yeni birleşik model 'tempo-nexus-titan:latest' oluştur + Modelfile yaz
  const build = await nexus.buildOrUpdateOllamaModel({
   ollamaBaseUrl: ollamaUrl,
   installedModels: ['qwen3:8b', 'qwen2.5-coder:7b']
  });
  assert.equal(build.created, true);
  assert.equal(build.modelName, NEXUS_MODEL_TAG);
  assert.equal(ollamaCalls.create.length, 1);
  assert.equal(ollamaCalls.create[0].model, NEXUS_MODEL_TAG);
  const mfText = await readFile(build.modelfilePath, 'utf8');
  assert.ok(mfText.includes('Tempo-Nexus-Titan-100x'));

  // 3) İndirilebilir Ollama modelini çek (/api/pull)
  const pulledOllama = await nexus.pullOrDownloadExternalModel({
   idOrTag: 'ollama-deepseek-r1-8b',
   ollamaBaseUrl: ollamaUrl
  });
  assert.equal(pulledOllama.status, 'downloaded');
  assert.equal(ollamaCalls.pull[0].model, 'deepseek-r1:8b');

  // 4) Hiç durmayan füzyon & UI-dahil tam proje geliştirme turu çalıştır
  const cycle1 = await nexus.runContinuousFusionCycle({
   installedModels: ['qwen3:8b', 'qwen2.5-coder:7b', NEXUS_MODEL_TAG],
   includeUi: true,
   applyLiveUiTheme: true
  });
  assert.equal(cycle1.ok, true);
  assert.equal(cycle1.withinOneSecond, true);
  assert.equal(cycle1.uiEvolutionEnabled, true);
  assert.equal(cycle1.fullProjectEvolution, true);
  assert.equal(cycle1.uiImmutable, false);
  assert.equal(cycle1.uiThemeResult.ok, true);
  assert.ok(cycle1.state.uiEvolutionsApplied >= 1);
  assert.ok(cycle1.state.sftPairsTotal >= 1);
  assert.ok(cycle1.state.dpoPairsTotal >= 1);

  const sftLines = (await readFile(nexus.sftFile, 'utf8')).trim().split('\n');
  const dpoLines = (await readFile(nexus.dpoFile, 'utf8')).trim().split('\n');
  assert.ok(sftLines.length >= 1);
  assert.ok(dpoLines.length >= 1);

  const updatedCss = await readFile(join(sandboxRoot, 'src/nexus-live-theme.css'), 'utf8');
  assert.ok(updatedCss.includes('Tur #1'));

  // 5) Kırık CSS yaması verilince doğrulama reddetmeli ve atomik geri alma (rollback) çalışmalı!
  const brokenPatch = await nexus.applyCodePatchSafely({
   targetFile: 'src/nexus-live-theme.css',
   newContent: ':root { --broken: 1; ' // eksik kapanış süslü parantez
  });
  assert.equal(brokenPatch.ok, false);
  assert.equal(brokenPatch.rolledBack, true);
  const cssAfterRollback = await readFile(join(sandboxRoot, 'src/nexus-live-theme.css'), 'utf8');
  assert.equal(cssAfterRollback, updatedCss);
 } finally {
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY;
  else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  fakeOllama.closeAllConnections?.();
  await close(fakeOllama);
  await rm(sandboxRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }).catch(() => {});
 }
});

test('API Uç Noktaları (/api/ollama/nexus-model/*) ve UI-dahil tam proje geliştirme <1sn hızda çalışır', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-nexus-api-'));
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_OFFLINE_ONLY = '1';
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_DATA_DIR = dir;
 process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?nexus=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;

 try {
  const statusRes = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.ok(statusRes.nexusModel);
  assert.equal(statusRes.nexusModel.modelName, NEXUS_MODEL_TAG);
  assert.equal(statusRes.nexusModel.neverStopTraining, true);
  assert.equal(statusRes.nexusModel.uiEvolutionEnabled, true);
  assert.equal(statusRes.nexusModel.uiImmutable, false);

  const cycleRes = await (await fetch(`${base}/api/ollama/nexus-model/cycle`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ applyLiveUiTheme: false })
  })).json();
  assert.equal(cycleRes.ok, true);
  assert.equal(cycleRes.withinOneSecond, true);
  assert.ok(cycleRes.summary.fusionCycles >= 1);

  const regRes = await (await fetch(`${base}/api/ollama/nexus-model/register-external`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ name: 'Yerel-Qwen-Coder-GGUF', pathOrUrl: 'C:/models/qwen3-coder.gguf', paramsBillions: 14 })
  })).json();
  assert.equal(regRes.ok, true);
  assert.ok(regRes.summary.counts.registeredExternal >= 1);

  const pullRes = await (await fetch(`${base}/api/ollama/nexus-model/pull-external`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ idOrTag: 'github-piper-tts' })
  })).json();
  assert.equal(pullRes.ok, true);
  assert.equal(pullRes.status, 'prepared_local_manifest');

  const devRes = await (await fetch(`${base}/api/ollama/nexus-model/develop-project`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ includeUi: true, applyLiveUiTheme: false })
  })).json();
  assert.equal(devRes.ok, true);
  assert.equal(devRes.uiEvolutionEnabled, true);
  assert.equal(devRes.fullProjectEvolution, true);
  assert.equal(devRes.uiImmutable, false);
  assert.equal(devRes.coderCouncilUiUnlocked, true);
  assert.equal(devRes.withinOneSecond, true);

  const studioUi = await readFile(new URL('../src/OllamaStudio.tsx', import.meta.url), 'utf8');
  assert.ok(studioUi.includes('nexusModel'), 'OllamaStudio UI Nexus-Titan model panelini içermeli');
  const mainUi = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.ok(mainUi.includes('nexus-live-theme.css'), 'main.tsx canlı evrim temasını içe aktarmalı');
  assert.ok(mainUi.includes('nexusPill'), 'main.tsx üst çubukta canlı Nexus-Titan durumunu göstermeli');
 } finally {
  stopOllamaLoops();
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY;
  else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP;
  else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  await new Promise(r => setTimeout(r, 120));
  app.closeAllConnections?.();
  await close(app);
  await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }).catch(() => {});
 }
});
