import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BookKnowledgeSearch } from '../server/book-knowledge-search.mjs';
import { HybridRagEngine } from '../server/rag-engine.mjs';
import { TrainingFrameworksHub } from '../server/training-hub.mjs';
import { MultiFrameworkAgentOrchestrator } from '../server/agent-frameworks.mjs';
import { HundredWayVerifier } from '../server/hundred-way-verifier.mjs';
import { ollamaPlugin } from '../server/ollama.mjs';

test('Continue & Aider RAG konfigürasyonları, kod+kitap indeksleme ve sıfır target="_blank" doğrulaması', async () => {
 const root = process.cwd();
 assert.equal(existsSync(resolve(root, '.continue/config.yaml')), true);
 assert.equal(existsSync(resolve(root, '.continuerules')), true);
 assert.equal(existsSync(resolve(root, '.aider.conf.yml')), true);
 assert.equal(existsSync(resolve(root, '.aider.model.settings.yml')), true);

 const mainTsx = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
 assert.equal(mainTsx.includes('target="_blank"'), false, 'Ayrı sekme (target="_blank") açılmamalı');
 assert.ok(mainTsx.includes('inlinePdfUrl'), 'PDF kitaplar sayfa içi iframe okuyucusunda açılmalı');
 assert.equal(mainTsx.includes('UnifiedAiStackStudio'), false, 'AI mühendislik kartları ön yüzde yer almamalı (arka planda çalışmalı)');

 const ollamaMjs = readFileSync(resolve(root, 'server/ollama.mjs'), 'utf8');
 assert.ok(ollamaMjs.includes('runUnifiedBackgroundAiStack'), 'RAG + Orkestratör + Axolotl/LLaMA-Factory arka planda otomatik çalışmalı');

 const contexts = JSON.parse(readFileSync(resolve(root, 'server/contexts.json'), 'utf8'));
 const passages = JSON.parse(readFileSync(resolve(root, 'server/book-passages.json'), 'utf8'));
 const qBank = JSON.parse(readFileSync(resolve(root, 'server/question-bank.json'), 'utf8'));
 const passagesByUnit = new Map();
 for (const ctx of contexts) {
  const entry = passages?.units?.find(u => u.id === ctx.id);
  passagesByUnit.set(ctx.id, entry?.passages || []);
 }
 const bookSearch = new BookKnowledgeSearch({ contexts, passagesByUnit, questionBank: qBank });

 const tmp = mkdtempSync(join(tmpdir(), 'tempo-rag-'));
 try {
  const rag = new HybridRagEngine({ projectRoot: root, dataDir: tmp, bookSearch });
  const cfg = await rag.getConfigsAndStatus();
  assert.equal(cfg.continueConfigured, true);
  assert.equal(cfg.aiderConfigured, true);
 assert.ok(cfg.totalCodeChunks > 20);
 assert.ok(cfg.totalBookDocs >= 400, `Expected >=400 book docs, got ${cfg.totalBookDocs}`);

  const qRes = rag.query('VO2max antrenman', { topK: 6, scope: 'all' });
  assert.equal(qRes.ok, true);
  assert.ok(qRes.hits.length >= 2);

  const cont = rag.formatForContinue('VO2max', 4);
  assert.ok(Array.isArray(cont) && cont.length > 0);
  assert.ok(cont[0].name && cont[0].content);

  const aider = rag.writeAiderContextFile('aerobik', 4);
  assert.ok(aider.cliCommand.includes('aider --config .aider.conf.yml'));
  assert.equal(existsSync(join(tmp, 'rag-context.md')), true);
 } finally {
  rmSync(tmp, { recursive: true, force: true });
 }
});

test('Axolotl & LLaMA-Factory QLoRA+DPO üretici ve AutoGen/LangGraph/CrewAI orkestratör', async () => {
 const root = process.cwd();
 const tmp = mkdtempSync(join(tmpdir(), 'tempo-aistack-'));
 try {
  const hub = new TrainingFrameworksHub({ projectRoot: root, dataDir: tmp });
  const res = await hub.generateConfigsAndDatasets({ baseModel: 'Qwen/Qwen3-8B', loraR: 32, loraAlpha: 64, beta: 0.1 });
  assert.equal(res.ok, true);
  assert.ok(res.sftCount >= 100);
  assert.ok(res.dpoPairCount >= 12);
  assert.ok(res.previews.axolotlQloraYaml.includes('adapter: qlora'));
  assert.ok(res.previews.axolotlDpoYaml.includes('rl: dpo'));
  assert.ok(res.previews.llamafactoryQloraYaml.includes('stage: sft'));
  assert.ok(res.previews.llamafactoryDpoYaml.includes('stage: dpo'));
  assert.ok(existsSync(res.files.llamafactoryDatasetInfo));

  const contexts = JSON.parse(readFileSync(resolve(root, 'server/contexts.json'), 'utf8'));
  const passages = JSON.parse(readFileSync(resolve(root, 'server/book-passages.json'), 'utf8'));
  const qBank = JSON.parse(readFileSync(resolve(root, 'server/question-bank.json'), 'utf8'));
  const passagesByUnit = new Map();
  for (const ctx of contexts) {
   const entry = passages?.units?.find(u => u.id === ctx.id);
   passagesByUnit.set(ctx.id, entry?.passages || []);
  }
  const bookSearch = new BookKnowledgeSearch({ contexts, passagesByUnit, questionBank: qBank });
  const rag = new HybridRagEngine({ projectRoot: root, dataDir: tmp, bookSearch });
  const verifier100 = new HundredWayVerifier(tmp, root);

  const orch = new MultiFrameworkAgentOrchestrator({ dataDir: tmp, projectRoot: root, ragEngine: rag, verifier100, bookSearch });
  const runRes = await orch.runMission({ framework: 'fusion', goal: 'Laktat eşiği DPO tercih çifti sentezle', unitId: '0-0' });
  assert.equal(runRes.ok, true);
  assert.ok(runRes.langgraph.nodesVisited.length >= 5);
  assert.ok(runRes.autogen.messages.length >= 4);
  assert.ok(runRes.crewai.crew.length >= 3);
  assert.ok(runRes.dpoPair.chosen && runRes.dpoPair.rejected);
  assert.equal(runRes.verifier100.passedCount, 100);
  assert.ok(runRes.durationMs < 1500);
 } finally {
  rmSync(tmp, { recursive: true, force: true });
 }
});

test('Tek Localhost HTTP API: /rag/*, /training-hub/* ve /orchestrator/* uçtan uca çalışır', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-unified-http-'));
 const prevDataDir = process.env.TEMPO_DATA_DIR;
 const prevDisableAuto = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 try {
  let middleware;
  ollamaPlugin().configureServer({ middlewares: { use: (_p, fn) => { middleware = fn; } } });
  const call = (method, urlPath, bodyObj, extraHeaders = {}) => new Promise((resolveFn, rejectFn) => {
   const req = new http.IncomingMessage(null);
   req.method = method;
   req.url = urlPath;
   req.headers = { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', ...extraHeaders };
   const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(txt) { resolveFn({ status: this.statusCode, json: txt ? JSON.parse(txt) : null }); }
   };
   middleware(req, res, err => rejectFn(err || new Error('next called')));
   if (bodyObj !== undefined) req.push(JSON.stringify(bodyObj));
   req.push(null);
  });

  const e2bRes = await call('POST', '/select-model', { model: 'fake:1' }, { origin: 'https://5173-demo.e2b.app', 'x-forwarded-host': '5173-demo.e2b.app' });
  assert.notEqual(e2bRes.status, 403, 'Canlı .e2b.app önizleme origin engellenmemeli');

  const evilRes = await call('POST', '/select-model', { model: 'fake:1' }, { origin: 'https://evil.invalid' });
  assert.equal(evilRes.status, 403, 'Dış kötü niyetli origin hâlâ 403 dönmeli');

  const ragRes = await call('POST', '/rag/query', { query: 'ATP-CP enerji sistemi', topK: 5 });
  assert.equal(ragRes.status, 200);
  assert.ok(ragRes.json.hits.length >= 1);

  const contRes = await call('POST', '/rag/continue-provider', { query: 'ATP-CP' });
  assert.equal(contRes.status, 200);
  assert.ok(Array.isArray(contRes.json) && contRes.json.length >= 1);

  const hubRes = await call('POST', '/training-hub/generate', { baseModel: 'Qwen/Qwen3-8B', loraR: 32, beta: 0.1 });
  assert.equal(hubRes.status, 200);
  assert.equal(hubRes.json.ok, true);
  assert.ok(hubRes.json.dpoPairCount >= 12);

  const orchRes = await call('POST', '/orchestrator/run', { framework: 'fusion', goal: 'Sürat antrenmanı DPO', unitId: '0-0' });
  assert.equal(orchRes.status, 200);
  assert.equal(orchRes.json.ok, true);
  assert.equal(orchRes.json.verifier100.passedCount, 100);
 } finally {
  if (prevDataDir === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevDataDir;
  if (prevDisableAuto === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisableAuto;
  rmSync(dir, { recursive: true, force: true });
 }
});
