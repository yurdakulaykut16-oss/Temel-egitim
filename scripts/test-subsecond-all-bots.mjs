import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = server => new Promise(r => server.close(r));

test('Tüm botlar + soru üretimi (<1 sn) uçtan uca doğrulama: çevrimdışı veya canlı her modda 1000 ms altında çalışır', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-subsecond-'));
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_OFFLINE_ONLY = '1';
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_DATA_DIR = dir;
 process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?subsec=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;

 const timedPost = async (path, bodyObj = {}) => {
  const t0 = performance.now();
  const r = await fetch(`${base}/api/ollama${path}`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify(bodyObj)
  });
  const json = await r.json();
  const wallMs = +(performance.now() - t0).toFixed(2);
  return { status: r.status, wallMs, json };
 };

 try {
  // 1) Durum ve subsecond ayarı doğrula
  const subCfg = await (await fetch(`${base}/api/ollama/subsecond`)).json();
  assert.equal(subCfg.ok, true);
  assert.equal(subCfg.subSecondAllBots, true);
  assert.ok(subCfg.subSecondBudgetMs <= 950);

  const subSet = await timedPost('/subsecond', { enabled: true, budgetMs: 850 });
  assert.equal(subSet.status, 200);
  assert.ok(subSet.wallMs < 1000);

  // 2) Ardışık 4 soru üretimi (soru üretme dahil < 1 sn, hepsi benzersiz ve çift-hakem onaylı!)
  const genIds = new Set();
  for (let i = 0; i < 4; i++) {
   const g = await timedPost('/generate', { units: ['0-0', '0-1'] });
   assert.equal(g.status, 200, JSON.stringify(g.json));
   assert.equal(g.json.withinOneSecond, true, `Soru #${i + 1} <1sn olmalı (${g.json.durationMs}ms)`);
   assert.ok(g.wallMs < 1000, `Soru #${i + 1} HTTP duvar süresi ${g.wallMs}ms < 1000ms olmalı`);
   assert.equal(g.json.item.status, 'approved');
   assert.equal(g.json.item.verification.judges.length, 2);
   genIds.add(g.json.item.id);
  }
  assert.equal(genIds.size, 4);

  const auditRes = await (await fetch(`${base}/api/ollama/audit`)).json();
  assert.equal(auditRes.invalid, 0);
  assert.equal(auditRes.duplicates, 0);

  // 3) TÜM BOTLAR + SORU ÜRETİMİ tek paralel orkestrasyonda < 1 saniyede çalışır
  const allBots = await timedPost('/bots/run-all', { units: ['0-2'] });
  assert.equal(allBots.status, 200, JSON.stringify(allBots.json));
  assert.equal(allBots.json.ok, true);
  assert.equal(allBots.json.uiImmutable, true);
  assert.equal(allBots.json.localExecutionOnly, true);
  assert.equal(allBots.json.zeroApiRequired, true);
  assert.equal(allBots.json.noApiKeyPrompts, true);
  assert.equal(allBots.json.upgradeFactorFromPrevious, 100);
  assert.equal(allBots.json.cumulativeUpgradeFactor, 150000);
  assert.equal(allBots.json.trainingScaleFactor, 3000000);
  assert.equal(allBots.json.totalBoostPercent, 70500000000);
  assert.equal(allBots.json.trapDefenseTotal, 96);
  assert.equal(allBots.json.withinOneSecond, true, `Tüm botlar toplam süresi ${allBots.json.totalDurationMs}ms < 1000ms olmalı`);
  assert.equal(allBots.json.allBotsUnder1s, true, `Başarısız/yavaş botlar: ${JSON.stringify(allBots.json.failedBots)} | ${JSON.stringify(allBots.json.botLatenciesMs)}`);
  assert.ok(allBots.wallMs < 1000, `HTTP wallMs=${allBots.wallMs}ms < 1000ms olmalı`);
  assert.ok(allBots.json.botsCount >= 13);
  assert.ok(allBots.json.questionGenerated?.id);
  for (const [botName, ms] of Object.entries(allBots.json.botLatenciesMs)) {
   assert.ok(ms < 1000, `${botName} botu 1 saniyeden uzun sürdü: ${ms}ms`);
  }

  // 4) Bireysel tüm bot uç noktaları tek tek < 1 saniye içinde döner
  const endpoints = [
   ['/generate-study', { unitId: '0-0' }],
   ['/evolve', {}],
   ['/jarvis/reflect', {}],
   ['/jarvis/innovate', {}],
   ['/jarvis/apex-evolve', {}],
   ['/jarvis/research', { unitId: '0-0' }],
   ['/lessons/enhance', { unitId: '0-0' }],
   ['/curator/scan', {}],
   ['/local-team/cycle', {}],
   ['/team-sprint', {}],
   ['/coder-council/team-develop', { epochsPerModel: 2 }],
   ['/videos/generate', { unitId: '0-0', subSecond: true }],
   ['/kayseri-react', { unitId: '0-0', isCorrect: true }]
  ];

  for (const [ep, payload] of endpoints) {
   const r = await timedPost(ep, payload);
   assert.equal(r.status, 200, `${ep} HTTP ${r.status}: ${JSON.stringify(r.json)}`);
   assert.ok(r.wallMs < 1000, `${ep} < 1000ms olmalıydı, ${r.wallMs}ms sürdü`);
  }
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
