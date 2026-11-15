// ÜRETİM PLANI SIRA TESTİ (uçtan uca, Ollama simülatörüyle)
// ---------------------------------------------------------------------------
// İstenen düzen: 1. tur her konuya sırayla N kolay soru (1. kitabın 1. konusundan başlayarak),
// tüm konular bitince 2. tur N orta, sonra 3. tur N zor. Sorular yalnızca konu özetinden kurulur.
// Test kotayı 1'e indirir; böylece 29 konu + 2. turun ilk adımları kısa sürede görülür.
// Sıra birebir sınansın diye tek soru hattı kullanılır; iki konunun birlikte üretimi
// scripts/test-plan-parallel.mjs içinde sınanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFakeOllama} from './fake-ollama-sim.mjs';
import {evidenceWithinSummary} from '../server/production-plan.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('plan: önce her konuya sırayla kolay, tur bitince orta; sorular yalnızca özetten', async () => {
 let app, sim, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  const contexts = JSON.parse(await readFile(new URL('../server/contexts.json', import.meta.url), 'utf8'));
  const WANT = contexts.length + 3; // 1. tur (29 konu) + 2. turun ilk 3 konusu
  sim = createFakeOllama({ loadMs: 20, genMs: 15, judgeMs: 10 });
  const fakePort = await sim.listen();
  dir = await mkdtemp(join(tmpdir(), 'tempo-plan-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_VERIFIER_MODEL;
  delete process.env.OLLAMA_JUDGE2_MODEL;
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  process.env.TEMPO_QUIET = '1';
  process.env.TEMPO_PLAN_QUOTA = '1';
  process.env.TEMPO_QUESTION_INTERVAL_MS = '20';
  delete process.env.TEMPO_PLAN;
  process.env.TEMPO_AUTO_CONCURRENCY = '1';
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
  let midStatus = null;
  for (let i = 0; i < 400 && items.length < WANT; i++) {
   await sleep(250);
   items = (await (await fetch(`${base}/api/ollama/questions`)).json()).items.filter(q => q.status === 'approved');
   if (!midStatus && items.length >= 2 && items.length < contexts.length) midStatus = await (await fetch(`${base}/api/ollama/status`)).json();
  }
  const status = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.ok(items.length >= WANT, `en az ${WANT} soru üretilmeliydi; üretilen: ${items.length}, engel: ${JSON.stringify(status.autoBlock)}, plan: ${JSON.stringify(status.plan?.current)}, son olay: ${JSON.stringify(status.autoEvents?.[0])}`);

  const seq = items.slice(0, WANT).map(q => `${q.unitId}:${q.difficulty}`);
  const expected = [...contexts.map(c => `${c.id}:kolay`), ...contexts.slice(0, 3).map(c => `${c.id}:orta`)];
  console.log(`\nİlk 5: ${seq.slice(0, 5).join(', ')} … tur geçişi: ${seq.slice(contexts.length - 2, contexts.length + 3).join(', ')}`);
  assert.deepEqual(seq, expected, 'sıra: 1. tur tüm konular kolay (kitap/konu sırasıyla), ardından 2. tur orta');

  // Yalnızca özet: kitap pasajı kullanılmaz, kanıt cümlesi konu özetinde geçer.
  for (const q of items.slice(0, WANT)) {
   const ctx = contexts.find(c => c.id === q.unitId);
   assert.ok(!q.passageId, `kitap pasajı kullanılmamalı (${q.unitId}: ${q.passageId})`);
   assert.ok(evidenceWithinSummary(q.evidence, ctx.text).ok, `kanıt konu özetinde olmalı: ${q.evidence}`);
   assert.equal(q.verification.targetDifficulty, q.difficulty);
  }
  const genRequests = sim.stats.requests.filter(r => r.role === 'generator');
  assert.ok(genRequests.length >= WANT && genRequests.every(r => r.focus), 'üretici istemi her soruda özetten bir odak cümlesi vermeli');
  assert.ok(genRequests.every(r => !r.bookSeed), 'yalnızca-özet modunda kitap sorusu örneği isteme eklenmemeli');

  // /status plan özeti.
  assert.equal(midStatus.plan.enabled, true);
  assert.equal(midStatus.plan.quota, 1);
  assert.equal(midStatus.plan.current.pass, 1);
  assert.equal(midStatus.plan.current.difficulty, 'kolay');
  assert.equal(midStatus.plan.totalTarget, contexts.length * 3);
  assert.equal(status.plan.passes[0].done, contexts.length, '1. tur tamamlanmış görünmeli');
  assert.equal(status.plan.current.pass, 2);
  assert.equal(status.autoConcurrencyEffective, 1);
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
