// ÜRETİM PLANI: İKİ KONU AYNI ANDA (uçtan uca, Ollama simülatörüyle)
// ---------------------------------------------------------------------------
// Varsayılan ayarda (aynı anda 2 soru) plan sıradaki İKİ konuyu birlikte doldurur: 1. ve 2. konu
// aynı anda çalışır, biri dolunca 3. konu başlar. Doğrulananlar:
//  1) İki farklı konuda aynı anda soru hazırlanır; aynı konuda aynı anda iki soru hazırlanmaz.
//  2) Sıra korunur: bir soru yazıldığında, kendi adımından önceki adımlardan en çok BİRİ eksiktir.
//  3) Hiçbir konu kotasını aşmaz; ilk turda yalnızca kolay üretilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFakeOllama} from './fake-ollama-sim.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const QUOTA = 3;
const WANT = QUOTA * 6;

test('plan: sıradaki iki konu aynı anda dolar, sıra ve kota korunur', async () => {
 let app, sim, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  const contexts = JSON.parse(await readFile(new URL('../server/contexts.json', import.meta.url), 'utf8'));
  const stepIndex = new Map(contexts.map((c, i) => [c.id, i])); // 1. tur: adım sırası = konu sırası
  sim = createFakeOllama({ loadMs: 30, genMs: 120, judgeMs: 60 });
  const fakePort = await sim.listen();
  dir = await mkdtemp(join(tmpdir(), 'tempo-par-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_VERIFIER_MODEL;
  delete process.env.OLLAMA_JUDGE2_MODEL;
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  process.env.TEMPO_QUIET = '1';
  process.env.TEMPO_PLAN_QUOTA = String(QUOTA);
  process.env.TEMPO_QUESTION_INTERVAL_MS = '20';
  delete process.env.TEMPO_PLAN;
  delete process.env.TEMPO_AUTO_CONCURRENCY; // varsayılan: aynı anda 2 soru
  delete process.env.TEMPO_DISABLE_AUTOLOOP;

  const mod = await import('../server/ollama.mjs');
  stopOllamaLoops = mod.stopOllamaLoops;
  let middleware;
  mod.ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
  app = http.createServer((req, res) => {
   req.url = req.url.replace(/^\/api\/ollama/, '');
   middleware(req, res, () => { res.statusCode = 404; res.end(); });
  });
  base = `http://127.0.0.1:${await listen(app)}`;

  let items = [];
  let sawTwoUnitsAtOnce = false;
  let sameUnitTwice = false;
  let workingSeen = null;
  for (let i = 0; i < 1200 && items.length < WANT; i++) {
   await sleep(50);
   const status = await (await fetch(`${base}/api/ollama/status`)).json();
   const activeUnits = (status.autoPhases || []).map(p => p.unit);
   if (new Set(activeUnits).size >= 2) sawTwoUnitsAtOnce = true;
   if (new Set(activeUnits).size !== activeUnits.length) sameUnitTwice = true;
   if (!workingSeen && (status.plan?.working || []).length === 2) workingSeen = status.plan;
   if (i % 4 === 0) items = (await (await fetch(`${base}/api/ollama/questions`)).json()).items.filter(q => q.status === 'approved');
  }
  const status = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.ok(items.length >= WANT, `en az ${WANT} soru üretilmeliydi; üretilen: ${items.length}, engel: ${JSON.stringify(status.autoBlock)}, son olay: ${JSON.stringify(status.autoEvents?.[0])}`);

  const seq = items.map(q => q.unitId);
  console.log(`\nSıra (konu): ${seq.slice(0, WANT).join(' ')}`);

  assert.equal(status.autoConcurrencyEffective, 2, 'aynı anda 2 soru hazırlanmalı');
  assert.ok(sawTwoUnitsAtOnce, 'iki farklı konuda aynı anda soru hazırlanmalı');
  assert.equal(sameUnitTwice, false, 'aynı konuda aynı anda iki soru hazırlanmamalı');
  assert.ok(workingSeen, '/status plan.working iki adımı göstermeli');
  assert.equal(workingSeen.parallel, 2);
  assert.notEqual(workingSeen.working[0].unitId, workingSeen.working[1].unitId);

  // İki konu gerçekten iç içe ilerledi mi? (A, B, A örüntüsü)
  assert.ok(seq.some((u, i) => i + 2 < seq.length && seq[i + 1] !== u && seq.indexOf(u, i + 2) !== -1), `konular iç içe ilerlemeliydi: ${seq.join(' ')}`);

  // Sıra: her soru yazıldığında kendi adımından önceki adımlardan en çok biri eksik olabilir.
  const counts = new Map();
  for (const q of items) {
   assert.equal(q.difficulty, 'kolay', 'ilk turda yalnızca kolay üretilir');
   const idx = stepIndex.get(q.unitId);
   const incompleteBefore = contexts.slice(0, idx).filter(c => (counts.get(c.id) || 0) < QUOTA).length;
   assert.ok(incompleteBefore <= 1, `${q.unitId} sorusu yazılırken önceki ${incompleteBefore} konu eksikti (en çok 1 olmalı): ${seq.join(' ')}`);
   counts.set(q.unitId, (counts.get(q.unitId) || 0) + 1);
   assert.ok(counts.get(q.unitId) <= QUOTA, `${q.unitId} kotasını (${QUOTA}) aşmamalı`);
  }
  assert.equal(counts.get(contexts[0].id), QUOTA);
  assert.equal(counts.get(contexts[1].id), QUOTA);
 } catch (e) {
  failure = e;
 }
 try { stopOllamaLoops?.(); } catch {}
 if (base) { try { await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } }); } catch {} }
 if (app) try { app.closeAllConnections?.(); await close(app); } catch {}
 if (sim) try { await sim.close(); } catch {}
 if (dir) try { await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); } catch {}
 if (failure) { console.error(failure); process.exit(1); }
 process.exit(0);
});
