// 25 saniye mutlak sınırı uçtan uca doğrular: sahte model her çağrıda 9 saniye
// sürerse (soru hattı ~27 sn) soru 25. saniyede terk edilmeli, HAVUZA EKLENMEMELİ.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('25 sn mutlak sınır: yavaş modelde soru 25. saniyede terk edilir, havuza girmez', async () => {
 let app, fake, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  fake = http.createServer(async (req, res) => {
   res.setHeader('Content-Type', 'application/json');
   if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
   let raw = ''; for await (const chunk of req) raw += chunk;
   await sleep(9_000); // tam bir hat (gen + 2 hakem ≈ 27 sn) bütçeyi aşar
   const data = JSON.parse(raw || '{}');
   if (req.url === '/api/create') return res.end(JSON.stringify({ status: 'success' }));
   res.end(JSON.stringify({ response: JSON.stringify({ question: 'Yavaş model sorusu: temel ilke hangisi?', options: ['Doğru 1', 'Yanlış 2', 'Yanlış 3', 'Yanlış 4'], answer: 'Doğru 1', explanation: 'Yavaş ama düzenli bir açıklamadır.', evidence: 'kaynak metinden birebir alınan yeterince uzun bir kanıt', topic: 'Test' }), eval_count: 100, eval_duration: 1_000_000_000 }));
  });
  const fakePort = await listen(fake);
  dir = await mkdtemp(join(tmpdir(), 'tempo-deadline-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  process.env.OLLAMA_MODEL = 'fake:1';
  process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
  process.env.OLLAMA_JUDGE2_MODEL = 'fake:1';
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  process.env.TEMPO_AUTO_CONCURRENCY = '1'; // seri mod: tek hattın 25 sn tavanına çarpmasını gözle
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
  assert.equal(status.autoTimeoutMs, 25000, 'varsayılan soru başına sınır 25.000 ms olmalı');

  // 32 saniye bekle: ilk hat 25. saniyede iptal edilmiş olmalı, havuz hâlâ boş kalmalı
  for (let i = 0; i < 32; i++) {
   await sleep(1000);
   status = await (await fetch(`${base}/api/ollama/status`)).json();
   if ((status.approved || 0) > 0) break;
  }
  const elapsed = Date.now() - t0;
  assert.equal(status.approved || 0, 0, `25 sn'yi aşan soru havuza girmemeliydi (süre: ${(elapsed / 1000).toFixed(1)}sn, err: ${status.autoLastError})`);

  // Zaman aşımı kapasitesi gerçekten 25 sn (eski 180 sn değil) ve satır `/timeout` ile de tavana kelepçeli
  const rej = await fetch(`${base}/api/ollama/timeout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ value: 180000 }) });
  assert.equal(rej.status, 400, 'eski 180 sn değeri kabul edilmemeli');
  const ok = await fetch(`${base}/api/ollama/timeout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ value: 25000 }) });
  assert.equal(ok.status, 200, '25000 tam sınırda kabul edilmeli');
  console.log(`\n25 sn sınırı doğrulandı (${(elapsed / 1000).toFixed(1)}sn içinde havuza soru eklenmedi)`);
 } catch (e) {
  failure = e;
 }
 try { stopOllamaLoops?.(); } catch {}
 if (base) { try { await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } }); } catch {} }
 if (app) try { app.closeAllConnections?.(); await close(app); } catch {}
 if (fake) try { fake.closeAllConnections?.(); await close(fake); } catch {}
 if (dir) try { await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); } catch {}
 if (failure) { console.error(failure); process.exit(1); }
 process.exit(0);
});
