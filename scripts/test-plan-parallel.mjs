// ÜRETİM PLANI: İKİ SORU AYNI ÜNİTEDEN EŞZAMANLI, ÜNİTE TAMAMLANMADAN SONRAKİNE GEÇİLMEZ
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
const QUOTA = 6;

test('iki hat aynı üniteden soru üretir; ünitenin hedefi tamamlanınca sıradakine geçer', async () => {
 let app, sim, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  const contexts = JSON.parse(await readFile(new URL('../server/contexts.json', import.meta.url), 'utf8'));
  const [A, B, C] = contexts;
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
  process.env.TEMPO_PLAN_PASSES = '1';
  process.env.TEMPO_QUESTION_INTERVAL_MS = '20';
  delete process.env.TEMPO_PLAN;
  delete process.env.TEMPO_AUTO_CONCURRENCY; // varsayılan iki üretim hattı
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

  const questions = async () => (await (await fetch(`${base}/api/ollama/questions`)).json()).items.filter(q => q.status === 'approved');
  let items = [];
  let sawSameUnitConcurrent = false;
  let sawDifferentUnitsConcurrent = false;
  let sawFirstUnitWorking = false;
  for (let i = 0; i < 1600; i++) {
   await sleep(40);
   const status = await (await fetch(`${base}/api/ollama/status`)).json();
   const activeUnits = (status.autoPhases || []).map(p => p.unit).filter(Boolean);
   if (activeUnits.length >= 2) {
    if (new Set(activeUnits).size === 1) sawSameUnitConcurrent = true;
    else sawDifferentUnitsConcurrent = true;
   }
   const workingUnits = status.plan?.workingUnits || [];
   if (workingUnits.length && workingUnits.every(u => u.unitId === A.id)) sawFirstUnitWorking = true;
   if (i % 3 === 0) items = await questions();
   if (items.filter(q => q.unitId === B.id).length >= 6 && items.filter(q => q.unitId === C.id).length >= 2) break;
  }
  items = await questions();
  const status = await (await fetch(`${base}/api/ollama/status`)).json();
  const sequence = items.map(q => q.unitId);
  const count = unitId => items.filter(q => q.unitId === unitId).length;
  console.log(`\nÜnite sırası: ${sequence.join(' ')}`);

  assert.ok(count(A.id) >= QUOTA, `2. üniteye geçmeden 1. ünitenin ${QUOTA} sorusu tamamlanmalı; sıra: ${sequence.join(' ')}`);
  assert.ok(count(B.id) >= QUOTA && count(C.id) >= 2, `sonraki üniteler sırayla başlamalı; sıra: ${sequence.join(' ')}`);
  assert.equal(status.autoConcurrencyEffective, 2, 'iki üretim hattı etkin olmalı');
  assert.ok(sawSameUnitConcurrent, 'iki hat aynı ünite üzerinde eşzamanlı çalışmalı');
  assert.equal(sawDifferentUnitsConcurrent, false, 'eşzamanlı hatlar farklı ünitelere dağılmamalı');
  assert.ok(sawFirstUnitWorking, '/status ilk ünitenin çalışıldığını göstermeli');
  assert.equal(status.plan.parallel, 2);

  const firstB = sequence.indexOf(B.id);
  const lastA = sequence.lastIndexOf(A.id);
  const firstC = sequence.indexOf(C.id);
  const lastB = sequence.lastIndexOf(B.id);
  assert.ok(firstB > lastA, '1. ünitenin bütün soruları 2. üniteden önce gelmeli');
  assert.ok(firstC > lastB, '2. ünitenin hedefi tamamlanmadan 3. üniteye geçilmemeli');

  // 1 turda her zorluktan ikişer soru: paralel hatlar hiçbir zorluk kotasını aşmamalı.
  for (const unit of [A, B]) {
   const byDifficulty = Object.fromEntries(['kolay', 'orta', 'zor'].map(d => [d, items.filter(q => q.unitId === unit.id && q.difficulty === d).length]));
   assert.deepEqual(byDifficulty, { kolay: 3, orta: 3, zor: 0 }, `${unit.id}: birim tur hedefi yalnızca kolay ve orta`);
  }
 } catch (e) {
  failure = e;
 }
 try { stopOllamaLoops?.(); } catch {}
 if (base) { try { await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } }); } catch {} }
 if (app) try { app.closeAllConnections?.(); await close(app); } catch {}
 if (sim) try { await sim.close(); } catch {}
 if (dir) try { await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); } catch {}
 if (failure) { console.error(failure); process.exit(1); }
});
