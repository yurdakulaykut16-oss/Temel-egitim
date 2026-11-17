// MODEL TAKASI (DALGA) DÜZENİ
// ---------------------------------------------------------------------------
// Şikâyet: "qwen3:8b sürekli yeniden yükleniyor (10 çağrının 10 tanesinde, ortalama 8.4 sn).
// Ollama'da OLLAMA_MAX_LOADED_MODELS değerini 2 yap…" — yani üretici ile 2. hakem bellekte birlikte
// kalamıyor ve her çağrıda model baştan yükleniyor; uygulama da kullanıcıdan ayar istiyordu.
//
// Beklenen: kullanıcı HİÇBİR ayar yapmadan uygulama durumu ölçümden anlar ve dalga düzenine geçer:
// sorular gruplar hâlinde hazırlanır, model soru başına değil dalga başına bir kez değişir.
//  1) Gözcü (birim): ilk yükleme takas sayılmaz; iki takasla moda girilir; modeller birlikte
//     kalabildiğinde moddan çıkılır.
//  2) Ön ısıtma, üretim çağrılarıyla aynı çalıştırıcı ayarını kullanır (yoksa ilk çağrıda model
//     yeniden yüklenir).
//  3) Uçtan uca (Ollama simülatörü, aynı anda yalnızca 1 model bellekte kalabiliyor):
//     dalga düzenine kendiliğinden geçilir, yükleme sayısı soru sayısının çok altında kalır,
//     kullanıcıya OLLAMA_MAX_LOADED_MODELS uyarısı gösterilmez; sınır kalkınca moddan çıkılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFakeOllama} from './fake-ollama-sim.mjs';
import {createSwapMonitor} from '../server/model-swap-monitor.mjs';
import {HardwareTeamOptimizer} from '../server/hardware-optimizer.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('gözcü: ilk yükleme takas değildir; art arda yeniden yükleme dalga modunu açar', () => {
 const mon = createSwapMonitor();
 let at = 1_000_000;
 const note = (model, loadMs) => mon.note({ model, loadMs, at: (at += 10_000) });
 assert.equal(note('qwen3:8b', 8000), null, 'ilk yükleme');
 assert.equal(note('qwen3:8b', 12), null);
 assert.equal(note('gemma3:4b', 5000), null, 'ikinci modelin ilk yüklemesi');
 assert.equal(mon.swapping, false);
 assert.equal(mon.snapshot().evictions, 0);
 assert.equal(note('qwen3:8b', 8400), null, '1. takas: az önce kullanılan model yeniden yüklendi');
 assert.equal(note('gemma3:4b', 5100), null, 'gemma için de 1. takas');
 assert.equal(note('qwen3:8b', 8300), 'entered', 'aynı modelin 2. takası modu açar');
 assert.equal(mon.swapping, true);
 const snap = mon.snapshot();
 assert.equal(snap.evictions, 3);
 assert.equal(snap.perModel['qwen3:8b'].evictions, 2);
 assert.ok(snap.avgLoadMs > 5000);
});

test('gözcü: modeller birlikte kalabiliyorsa mod hiç açılmaz', () => {
 const mon = createSwapMonitor();
 let at = 0;
 const note = (model, loadMs) => mon.note({ model, loadMs, at: (at += 5_000) });
 note('qwen3:8b', 8000);
 note('gemma3:4b', 5000);
 for (let i = 0; i < 40; i++) assert.equal(note(i % 3 === 2 ? 'gemma3:4b' : 'qwen3:8b', 15), null);
 assert.equal(mon.swapping, false);
 assert.equal(mon.snapshot().evictions, 0);
});

test('gözcü: uzun aradan sonraki yükleme (bellekte tutma süresi dolmuş) takas sayılmaz', () => {
 const mon = createSwapMonitor();
 let at = 0;
 for (let i = 0; i < 6; i++) {
  at += 40 * 60_000; // 40 dk ara: keep_alive (30 dk) dolmuş, model doğal olarak boşalmış
  assert.equal(mon.note({ model: 'qwen3:8b', loadMs: 8000, at }), null);
 }
 assert.equal(mon.swapping, false);
});

test('gözcü: yüklemesiz model değişimleri görülünce moddan çıkılır; kadro değişince sıfırlanır', () => {
 const mon = createSwapMonitor();
 let at = 0;
 const note = (model, loadMs) => mon.note({ model, loadMs, at: (at += 5_000) });
 note('q', 8000); note('g', 5000); note('q', 8000); note('g', 5000);
 assert.equal(note('q', 8000), 'entered');
 // Dalga düzeninde değişimler seyrek; yükleme sürdükçe modda kalınır.
 for (let i = 0; i < 4; i++) {
  assert.equal(note('q', 10), null);
  assert.equal(note('g', 5000), null);
  assert.equal(note('g', 10), null);
  assert.equal(note('q', 8000), null);
 }
 assert.equal(mon.swapping, true);
 // Artık iki model de bellekte: değişimler yükleme gerektirmiyor.
 assert.equal(note('g', 10), null);
 assert.equal(note('q', 10), null);
 assert.equal(note('g', 10), null);
 assert.equal(note('q', 10), 'exited');
 assert.equal(mon.swapping, false);
 // Tek bir yükleme hemen yeniden moda sokmaz.
 assert.equal(note('g', 5000), null);
 assert.equal(mon.swapping, false);

 mon.reset({ swapping: true });
 assert.equal(mon.swapping, true, 'planlayıcı "birlikte sığmaz" diyorsa dalga düzeniyle başlanır');
 mon.reset();
 assert.equal(mon.swapping, false);
});

test('ön ısıtma: üretim çağrılarıyla aynı çalıştırıcı ayarı ve yalnızca kadro modelleri', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-warm-'));
 try {
  const sent = [];
  const hw = new HardwareTeamOptimizer(dir, {
   execFn: async () => ({ stdout: 'NVIDIA GeForce RTX 3080 Ti, 12288, 11800\n' }),
   fetchFn: async (_url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, json: async () => ({}) }; }
  });
  const res = await hw.warmupTeamModelsInVram({
   ollamaBaseUrl: 'http://127.0.0.1:1', installedModels: ['qwen3:8b', 'gemma3:4b', 'qwen2.5-coder:3b'],
   numCtx: 4096, keepAlive: '30m', models: ['qwen3:8b', 'qwen3:8b', 'gemma3:4b']
  });
  assert.deepEqual(res.warmed.map(w => w.model).sort(), ['gemma3:4b', 'qwen3:8b']);
  assert.equal(sent.length, 2, 'kadroda olmayan model (kodlayıcı) ısıtılmaz; aynı model iki kez ısıtılmaz');
  for (const body of sent) {
   // Farklı num_ctx / num_gpu ile ısıtılan modeli Ollama ilk gerçek çağrıda baştan yükler.
   assert.deepEqual(body.options, { num_ctx: 4096 });
   assert.equal(body.keep_alive, '30m');
  }
 } finally {
  await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
 }
});

test('uçtan uca: bellekte tek model kalabiliyorken ayar istenmeden dalga düzenine geçilir', async () => {
 let app, sim, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  // 12 GB kart: uygulamanın tahminine göre kadro birlikte sığar. Ama Ollama aynı anda yalnızca
  // bir modeli bellekte tutuyor (OLLAMA_MAX_LOADED_MODELS=1 ya da VRAM'i başka programlar kullanıyor).
  sim = createFakeOllama({ vramGb: 12, maxLoaded: 1, loadMs: 1600, genMs: 200, judgeMs: 80 });
  const fakePort = await sim.listen();
  dir = await mkdtemp(join(tmpdir(), 'tempo-swap-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_VERIFIER_MODEL;
  delete process.env.OLLAMA_JUDGE2_MODEL;
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  process.env.TEMPO_QUIET = '1';
  process.env.TEMPO_PLAN_QUOTA = '12';
  process.env.TEMPO_QUESTION_INTERVAL_MS = '20';
  delete process.env.TEMPO_PLAN;
  delete process.env.TEMPO_AUTO_CONCURRENCY; // varsayılan: aynı anda 2 soru
  delete process.env.TEMPO_SWAP_MODE;
  delete process.env.TEMPO_SWAP_WAVE;
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
  const getStatus = async () => (await fetch(`${base}/api/ollama/status`)).json();
  const waitFor = async (pred, label, maxMs = 90_000) => {
   const t0 = Date.now();
   let status;
   while (Date.now() - t0 < maxMs) {
    status = await getStatus();
    if (pred(status)) return status;
    await sleep(150);
   }
   throw new Error(`${label} beklenirken süre doldu: onaylanan ${status?.approved}, takas ${JSON.stringify(status?.modelSwap)?.slice(0, 300)}, engel ${JSON.stringify(status?.autoBlock)}, hata ${status?.autoLastError}`);
  };
  const order = () => sim.stats.requests.map(r => r.model);
  const switchCount = list => list.reduce((n, m, i) => n + (i > 0 && list[i - 1] !== m ? 1 : 0), 0);

  // Tek-model üretim hattında üretici ve hakem aynı modeli kullandığından takas gerekmez.
  let status = await waitFor(s => (s.approved || 0) >= 8, '8 soru (tek model)', 45_000);
  assert.equal(status.model, 'qwen3:8b');
  assert.equal(status.verifierModel, status.model);
  assert.equal(status.judge2Model, status.model);
  assert.equal(status.lineup.coResident, true);
  assert.equal(status.lineup.swapMode, false);
  assert.equal(status.lineup.swapNote, null);
  assert.equal(status.modelSwap.active, false);
  assert.deepEqual(Object.keys(sim.stats.loadsByModel), ['qwen3:8b']);
  assert.equal(sim.stats.loadsByModel['qwen3:8b'], 1, 'tek model bellekte bir kez yüklenmeli');
  assert.ok(status.autoConcurrency >= 1);

  const qs = await (await fetch(`${base}/api/ollama/questions`)).json();
  for (const q of qs.items.filter(x => x.status === 'approved')) {
   assert.equal(q.verification.judges.length, 1, 'her soru tek hakemden geçer');
   assert.equal(q.verification.judges[0].model, 'qwen3:8b');
  }
  assert.equal(status.telemetry.infraErrors, 0, 'altyapı hatası olmamalı');
  assert.equal(status.telemetry.timeouts, 0, 'zaman aşımı olmamalı');
  const info = `tek model: ${status.model}, yükleme: ${JSON.stringify(sim.stats.loadsByModel)}, onay: ${status.approved}`;

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
