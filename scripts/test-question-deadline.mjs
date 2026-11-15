// YAVAŞ MODEL REGRESYON TESTİ
// ---------------------------------------------------------------------------
// Eski sürümde soru başına 25 sn'lik MUTLAK tavan vardı; her çağrıda keep_alive=0 ile
// model boşaltılıyor ve num_ctx prompt uzunluğuna göre değiştiği için model her çağrıda
// yeniden yükleniyordu. Gerçek bir ekran kartında (yükleme + üretim + 2 hakem) bu tavan
// hiç tutmuyor, saatlerce "0 soru" üretiliyordu.
//
// Bu test gerçekçi bir Ollama simülatörü (yükleme süresi, seçenek değişince yeniden
// yükleme, keep_alive boşaltması, model başına tek istek, NDJSON akışı) ile şunu doğrular:
//  1) Tek bir sorunun toplam süresi 25 sn'yi AŞSA BİLE soru onaylanır ve havuza girer.
//  2) Her model yalnızca BİR kez yüklenir (sabit num_ctx + keep_alive > 0).
//  3) Hiçbir prompt bağlam penceresini taşırmaz (sessiz kesilme yok).
//  4) Küçük modellerin biçim hataları (harfle cevap, etiketli şık, eksik kanıt) onarılır.
//  5) Model kadrosu kurulu modellerden OTOMATİK seçilir (ortam değişkeni/ayar gerekmez).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFakeOllama} from './fake-ollama-sim.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('yavaş model: 25 sn\'den uzun süren soru terk edilmez, onaylanıp havuza girer', async () => {
 let app, sim, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  // Yükleme 5 sn, üretim 9 sn, her hakem 5 sn  =>  ilk soru ≈ 5+9+5+5+5 = 29 sn (> 25 sn).
  sim = createFakeOllama({ loadMs: 5_000, genMs: 9_000, judgeMs: 5_000, sloppy: 0.5 });
  const fakePort = await sim.listen();
  dir = await mkdtemp(join(tmpdir(), 'tempo-slow-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_VERIFIER_MODEL;
  delete process.env.OLLAMA_JUDGE2_MODEL;
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  process.env.TEMPO_AUTO_CONCURRENCY = '1';
  process.env.TEMPO_QUIET = '1';
  delete process.env.TEMPO_DISABLE_AUTOLOOP;

  const mod = await import('../server/ollama.mjs');
  const ollamaPlugin = mod.ollamaPlugin; stopOllamaLoops = mod.stopOllamaLoops;
  let middleware;
  ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
  app = http.createServer((req, res) => {
   req.url = req.url.replace(/^\/api\/ollama/, '');
   middleware(req, res, () => { res.statusCode = 404; res.end(); });
  });
  const port = await listen(app);
  base = `http://127.0.0.1:${port}`;

  const t0 = Date.now();
  let status = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoTimeoutMs, 120000, 'süre tavanı model çağrısı başına ve varsayılan 120 sn olmalı');
  assert.equal(status.lineup.ok, true, 'kadro kurulu modellerden otomatik kurulmalı');
  assert.equal(status.model, 'qwen3:8b', 'üretici: kurulu en yetenekli model');
  assert.equal(status.verifierModel, 'qwen3:8b', '1. hakem üreticiyle aynı model (VRAM takası yok)');
  assert.equal(status.judge2Model, 'gemma3:4b', '2. hakem farklı model ailesinden');

  let firstApprovedAt = 0;
  for (let i = 0; i < 100; i++) {
   await sleep(1000);
   status = await (await fetch(`${base}/api/ollama/status`)).json();
   if (!firstApprovedAt && (status.approved || 0) >= 1) firstApprovedAt = Date.now() - t0;
   if ((status.approved || 0) >= 2) break;
  }
  const elapsed = Date.now() - t0;
  assert.ok((status.approved || 0) >= 2, `yavaş modelde de soru üretilmeliydi; onaylanan: ${status.approved}, süre: ${(elapsed / 1000).toFixed(1)}sn, engel: ${JSON.stringify(status.autoBlock)}, hata: ${status.autoLastError}, tel: ${JSON.stringify(status.telemetry.rejectionReasons)}`);
  assert.ok(firstApprovedAt > 25_000, `ilk soru eski 25 sn tavanından uzun sürmeliydi (test kurgusu); süre: ${firstApprovedAt}ms`);

  // Her model yalnızca bir kez yüklenir.
  assert.deepEqual(sim.stats.loadsByModel, { 'qwen3:8b': 1, 'gemma3:4b': 1 }, `modeller yeniden yüklenmemeli: ${JSON.stringify(sim.stats.loadsByModel)}`);
  // num_ctx sabit, keep_alive > 0, akış açık.
  const ctxValues = [...new Set(sim.stats.requests.map(r => r.options.num_ctx))];
  assert.equal(ctxValues.length, 1, `num_ctx her çağrıda aynı olmalı, görülen: ${ctxValues.join(', ')}`);
  assert.ok(sim.stats.requests.every(r => r.keep_alive && r.keep_alive !== 0 && r.keep_alive !== '0'), 'keep_alive 0 olmamalı (model bellekte kalmalı)');
  assert.ok(sim.stats.requests.every(r => r.stream === true), 'çağrılar akışlı (stream) yapılmalı');
  assert.equal(sim.stats.truncations, 0, 'hiçbir prompt bağlam penceresini taşırmamalı');
  assert.ok(sim.stats.peakConcurrent <= 2, `Ollama'ya aynı anda en çok 2 istek gitmeli, görülen: ${sim.stats.peakConcurrent}`);

  // Dağınık biçimli (ama içerikçe doğru) çıktılar onarılıp kabul edilmiş olmalı.
  assert.ok(status.telemetry.formatRepairs >= 1, `biçim onarımı sayacı ilerlemeli: ${status.telemetry.formatRepairs}`);
  assert.equal(status.telemetry.infraErrors, 0, 'altyapı hatası olmamalı');
  assert.equal(status.telemetry.timeouts, 0, 'zaman aşımı olmamalı');

  const qs = await (await fetch(`${base}/api/ollama/questions`)).json();
  for (const q of qs.items) {
   assert.equal(q.status, 'approved');
   assert.equal(q.options.length, 4);
   assert.ok(q.options.includes(q.answer), 'cevap şıklardan biri olmalı');
   assert.ok(q.options.every(o => !/^[A-D]\)/.test(o)), 'şık etiketleri temizlenmiş olmalı');
   assert.equal(q.verification.judges.length, 2, 'her soru iki hakemden geçmeli');
   assert.deepEqual(q.verification.judges.map(j => j.model), ['qwen3:8b', 'gemma3:4b']);
  }
  console.log(`\nYavaş model: ${status.approved} soru onaylandı (${(elapsed / 1000).toFixed(1)}sn; ilk soru ${(firstApprovedAt / 1000).toFixed(1)}sn), yükleme=${sim.stats.loads}, istek=${sim.stats.requests.length}`);
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
