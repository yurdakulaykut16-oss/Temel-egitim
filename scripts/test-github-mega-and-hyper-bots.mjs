import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GithubMegaCorpus, BASE_INDEXED_PROJECTS_TARGET, GITHUB_OSS_DOMAINS } from '../server/github-mega-corpus.mjs';
import { BotParameterMatrix, BOT_TRANSFORMER_LAYERS, DEEP_FACTORED_PARAMS_PER_BOT, ALL_AI_BOT_IDS } from '../server/bot-parameter-matrix.mjs';
import { CoderCouncilHub, OPEN_SOURCE_CODER_CATALOG, PROJECT_DEV_SQUADS } from '../server/coder-council.mjs';
import { JarvisCore } from '../server/jarvis-core.mjs';

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = server => new Promise(r => server.close(r));

test('GithubMegaCorpus (260,000+ OSS Projesi), 64-Katman MoE BotParameterMatrix ve 64-Model CoderCouncil ölçekleme doğrulaması', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-gh-mega-'));
 try {
  assert.equal(BASE_INDEXED_PROJECTS_TARGET, 260_000);
  assert.equal(GITHUB_OSS_DOMAINS.length, 20);
  assert.equal(BOT_TRANSFORMER_LAYERS, 64);
  assert.ok(DEEP_FACTORED_PARAMS_PER_BOT > 1.4e17);
  assert.equal(OPEN_SOURCE_CODER_CATALOG.length, 64);
  assert.equal(PROJECT_DEV_SQUADS.length, 4);

  let mockFetchCalls = 0;
  const corpus = new GithubMegaCorpus(dir, {
   fetchJsonFn: async () => {
    mockFetchCalls++;
    return {
     total_count: 350000,
     items: [
      {
       full_name: 'deepseek-ai/DeepSeek-R1',
       html_url: 'https://github.com/deepseek-ai/DeepSeek-R1',
       stargazers_count: 89000,
       description: 'Open reasoning RLVR models with MIT license',
       language: 'Python',
       license: { spdx_id: 'MIT' },
       topics: ['reasoning', 'rl', 'moe']
      }
     ]
    };
   }
  });

  const matrix = new BotParameterMatrix(dir);
  const jarvis = new JarvisCore(dir, process.cwd());
  const council = new CoderCouncilHub(dir);

  const batch1 = await corpus.absorbAndEvolveBatch({
   batchSize: 2000,
   paramMatrix: matrix,
   jarvis,
   coderCouncil: council,
   liveGithub: true
  });

  assert.equal(batch1.ok, true);
  assert.ok(batch1.durationMs < 1000);
  assert.equal(batch1.summary.indexedProjectsCount, 260_001);
  assert.equal(batch1.summary.absorbedProjectsCount, 2000);
  assert.equal(batch1.summary.liveGithubReposCached, 1);
  assert.equal(mockFetchCalls, 1);
  assert.ok(batch1.summary.sftDistilledCount >= 1);

  const sftRaw = await readFile(resolve(dir, 'ai-brain', 'nexus-titan-sft.jsonl'), 'utf8');
  assert.ok(sftRaw.includes('github_mega_corpus_distill'));
  const dpoRaw = await readFile(resolve(dir, 'ai-brain', 'nexus-titan-dpo.jsonl'), 'utf8');
  assert.ok(dpoRaw.includes('github_mega_corpus_dpo'));

  const councilAfterAbsorb = await council.loadState();
  assert.ok(councilAfterAbsorb.totalSftSamplesAbsorbed > 64 * 8400);
  assert.ok(councilAfterAbsorb.totalDpoPairsDistilled > 6400);

  const searchRes = await corpus.searchProjects('deepseek', { limit: 10 });
  assert.ok(searchRes.totalIndexed >= 260_000);
  assert.ok(searchRes.projects.length >= 1);
  assert.ok(searchRes.projects.some(p => /deepseek/i.test(p.fullName)));

  const hyperEvo = await matrix.hyperEvolveAllBots({
   telemetry: { approvalRate: 99.1 },
   trapF1: 100,
   githubMegaSummary: batch1.summary
  });
  assert.equal(hyperEvo.ok, true);
  const matSummary = matrix.getSummary(hyperEvo.state);
  assert.equal(matSummary.totalBots, ALL_AI_BOT_IDS.length);
  assert.equal(matSummary.transformerLayersPerBot, 64);
  assert.equal(matSummary.totalDeepTransformerLayers, ALL_AI_BOT_IDS.length * 64);
  assert.ok(matSummary.totalFactoredParamsQuadrillions >= 24.7);
  assert.ok(matSummary.totalDeepMoEFactoredQuadrillions >= 1585);
  assert.ok(matSummary.avgBotIq >= 97.4);
  assert.ok(matSummary.avgSkillLevel >= 120);
  assert.ok(matSummary.totalGithubProjectsAbsorbedByBots >= 198_000);
  const metaPrompt = matrix.getMetaArchitectPromptBlock(hyperEvo.state);
  assert.match(metaPrompt, /64-KATMAN PARAMETRE MATRİSİ/);
  assert.match(metaPrompt, /deepMoEQ/);

  const iqBeforeRb = hyperEvo.state.bots.generator.botIq;
  const rb = await matrix.rollbackLastEvolution();
  assert.ok(rb.state.bots.generator.botIq < iqBeforeRb);

  const sprint = await council.runOvertrainSprint({ epochsPerModel: 2 });
  assert.equal(sprint.modelsOvertrained, 64);
  assert.equal(sprint.withinOneSecond, true);
  assert.ok(sprint.summary.totalPhysicalParamsBillions > 3500);
  assert.ok(sprint.summary.councilDeepMoEFactoredQuadrillions > 9000);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('ollamaPlugin 260k+ GitHub Mega Corpus, /bots/hyper-evolve ve /bots/run-all (<1sn) uçtan uca sunucu doğrulaması', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-gh-srv-'));
 const prevDataDir = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 const prevDisableAuto = process.env.TEMPO_DISABLE_AUTOLOOP;
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_OFFLINE_ONLY = '1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?ghmega=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;

 try {
  // CSRF koruma testi: Origin olmadan 403 dönmeli
  const noOriginRes = await fetch(`${base}/api/ollama/github-mega/absorb`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: '{}'
  });
  assert.equal(noOriginRes.status, 403);

  // GitHub Mega Absorb (Origin ile 200 & hızlı)
  const absorbRes = await fetch(`${base}/api/ollama/github-mega/absorb`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ batchSize: 3000 })
  });
  assert.equal(absorbRes.status, 200);
  const absorbJson = await absorbRes.json();
  assert.equal(absorbJson.ok, true);
  assert.ok(absorbJson.summary.indexedProjectsCount >= 260_000);
  assert.equal(absorbJson.summary.absorbedProjectsCount, 3000);
  assert.ok(absorbJson.parameterMatrix.totalDeepMoEFactoredQuadrillions >= 1585);

  // Hyper-Evolve All Bots (<1sn)
  const hyperRes = await fetch(`${base}/api/ollama/bots/hyper-evolve`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ batchSize: 2500 })
  });
  assert.equal(hyperRes.status, 200);
  const hyperJson = await hyperRes.json();
  assert.equal(hyperJson.ok, true);
  assert.equal(hyperJson.withinOneSecond, true, `hyper-evolve took ${hyperJson.durationMs}ms`);
  assert.equal(hyperJson.coderCouncil.totalModels, 64);
  assert.ok(hyperJson.githubMega.absorbedProjectsCount >= 5500);

  // GET /github-mega arama + GET /status doğrulama
  const searchRes = await (await fetch(`${base}/api/ollama/github-mega?q=moe&limit=6`)).json();
  assert.equal(searchRes.ok, true);
  assert.ok(searchRes.searchResults.projects.length >= 1);

  const statusRes = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.ok(statusRes.githubMega.indexedProjectsCount >= 260_000);
  assert.equal(statusRes.coderCouncil.totalModels, 64);
  assert.equal(statusRes.parameterMatrix.transformerLayersPerBot, 64);

  // /bots/run-all (<1sn) içinde githubMegaCorpus260k dahil tüm botlar çalışır
  const runAllRes = await fetch(`${base}/api/ollama/bots/run-all`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ units: ['0-0'] })
  });
  assert.equal(runAllRes.status, 200);
  const runAllJson = await runAllRes.json();
  assert.equal(runAllJson.withinOneSecond, true, `run-all took ${runAllJson.totalDurationMs}ms`);
  assert.ok(runAllJson.botLatenciesMs.githubMegaCorpus260k !== undefined);
 } finally {
  stopOllamaLoops();
  if (prevDataDir === undefined) delete process.env.TEMPO_DATA_DIR;
  else process.env.TEMPO_DATA_DIR = prevDataDir;
  if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = prevBase;
  if (prevDisableAuto === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP;
  else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisableAuto;
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY;
  else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  await new Promise(r => setTimeout(r, 150));
  app.closeAllConnections?.();
  await close(app);
  rmSync(dir, { recursive: true, force: true });
 }
});
