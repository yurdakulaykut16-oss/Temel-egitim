// Paralel turbo doğrulaması: varsayılan yuva sayısı 4, model çağrıları üst üste biner,
// her soru YİNE iki bağımsız hakemle tam onaydan geçer; /concurrency ayarı 1-8 aralığında çalışır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = str => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; };

test('paralel yuvalar: 4 eşzamanlı üretim, tam çift-hakem doğrulaması, /concurrency 1-8 sınırı', async () => {
 let app, fake, dir, base, stopOllamaLoops;
 let failure = null;
 const difficultyByQuestion = new Map();
 try {
  let inFlight = 0, peak = 0, calls = 0;
  fake = http.createServer(async (req, res) => {
   res.setHeader('Content-Type', 'application/json');
   if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:gen' }, { name: 'fake:ver' }, { name: 'fake:j2' }] }));
   inFlight++; peak = Math.max(peak, inFlight);
   let raw = ''; for await (const chunk of req) raw += chunk;
   calls++;
   await sleep(220); // her model çağrısı ~220ms
   const data = JSON.parse(raw || '{}');
   if (req.url === '/api/create') { inFlight--; return res.end(JSON.stringify({ status: 'success' })); }
   const prompt = data.prompt || '';
   const optsMatch = prompt.match(/SEÇENEKLER: (\[[\s\S]*?\])/);
   let opts0 = null;
   try { if (optsMatch) opts0 = JSON.parse(optsMatch[1])[0]; } catch {}
   const srcMatch = prompt.match(/KONU ANLATIMI:\s*([\s\S]*?)$/);
   const text = srcMatch ? srcMatch[1] : '';
   const evidence = text.trim().split(/\s+/).slice(0, 9).join(' ') || 'kaynak metinden birebir alınan yeterince uzun bir kanit parçası';
   const mkQ = tag => {
    const words = text.trim().split(/\s+/).filter(w => w.length >= 3);
    const start = words.length > 14 ? Math.abs(hash(tag)) % (words.length - 12) : 0;
    const phrase = words.slice(start, start + 10).join(' ');
    return `${phrase} — bu anlatımdaki temel ilke hangisidir? (#${tag})`;
   };
   const mkOpts = tag => [
    `Doğru yaklaşım ${tag}: kademeli planlı yüklenme ilkesidir`,
    `Yanlış yaklaşım ${tag}: yükün hiç artırılmadığı durağan plandır`,
    `Eksik yaklaşım ${tag}: yalnız toparlanma günlerinden oluşur`,
    `Rastgele yaklaşım ${tag}: bireysel eşik ölçülmez`
   ];
   let result;
   if (prompt.includes('soru denetçisisin')) {
    const qMatch = prompt.match(/SORU: ([\s\S]*?)\nSEÇENEKLER:/);
    const question = qMatch ? qMatch[1] : '';
    const difficulty = difficultyByQuestion.get(question) || 'orta';
    result = {
     answer: opts0, singleCorrect: true, dualAnswerRisk: false, secondBestOption: '', supported: true,
     qualityOk: true, qualityScore: 5, examPotential: 4, difficulty, bloomLevel: 'kavrama',
     distractorPlausible: true, evidence, reason: 'Pasajda bilgi doğrudan ve tek doğru olarak geçer.'
    };
   } else {
    const tag = `p-${calls}`;
    const diffM = prompt.match(/tam olarak şöyle olmalı: (KOLAY|ORTA|ZOR):/);
    const difficulty = diffM ? diffM[1].toLocaleLowerCase('tr-TR') : 'kolay';
    const q = mkQ(tag);
    difficultyByQuestion.set(q, difficulty);
    const opts = mkOpts(tag);
    result = {
     question: q, options: opts, answer: opts[0],
     explanation: 'Doğru cevap pasajdaki kademeli yüklenme tanımıyla örtüşür; diğer şıklar ilkenin zıttını, durağanlığı ya da alakasız bir alanı tarif eder.',
     evidence, topic: 'Test konu', questionType: 'kavram', questionAngle: 'dogrudan_tanim'
    };
   }
   res.end(JSON.stringify({ response: JSON.stringify(result), eval_count: 160, eval_duration: 200_000_000 }));
   inFlight--;
  });
  const fakePort = await listen(fake);
  dir = await mkdtemp(join(tmpdir(), 'tempo-parallel-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  process.env.OLLAMA_MODEL = 'fake:gen';
  process.env.OLLAMA_VERIFIER_MODEL = 'fake:ver';
  process.env.OLLAMA_JUDGE2_MODEL = 'fake:j2';
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  delete process.env.TEMPO_AUTO_CONCURRENCY;   // varsayılan 4 yuva ile açılmalı
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
  let status = null;
  for (let i = 0; i < 300; i++) {
   await sleep(400);
   status = await (await fetch(`${base}/api/ollama/status`)).json();
   if ((status.approved || 0) >= 4) break;
  }
  const elapsed = Date.now() - t0;

  assert.equal(status.autoConcurrency, 4, 'varsayılan yuva sayısı 4 olmalı');
  assert.equal(status.modelInferenceConcurrency, 4, 'model kuyruğu 4 yuva ile açılmalı');
  assert.ok((status.approved || 0) >= 4, `en az 4 soru onaylanmalıydı; görülen: ${status?.approved}, err: ${status?.autoLastError}`);
  assert.ok(peak >= 2, `model çağrıları üst üste binebilmeli; görülen eşzamanlı tepe: ${peak}`);
  assert.ok(calls >= (status.approved || 0) * 3, `her soru için üretici + 2 hakem çağrısı yapılmalı; çağrı: ${calls}`);

  const qs = await (await fetch(`${base}/api/ollama/questions`)).json();
  const approved = qs.items.filter(x => x.status === 'approved');
  assert.ok(approved.length >= 4 && approved.every(x => Array.isArray(x.verification?.judges) && x.verification.judges.length === 2),
   'paralel modda da her soru iki hakemle tam onaydan geçmeli');

  // /concurrency ayarı: 1-8 aralığı kabul edilir, sınır dışı reddedilir
  let r = await fetch(`${base}/api/ollama/concurrency`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ value: 2 }) });
  assert.equal(r.status, 200);
  const c2 = await r.json();
  assert.equal(c2.autoConcurrency, 2);
  assert.equal(c2.modelInferenceConcurrency, 2);
  for (const bad of [0, 9, 1000, 1.5, -1]) {
   r = await fetch(`${base}/api/ollama/concurrency`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ value: bad }) });
   assert.equal(r.status, 400, `${bad} reddedilmeliydi`);
  }
  r = await fetch(`${base}/api/ollama/concurrency`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ value: 4 }) });
  assert.equal(r.status, 200);
  status = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoConcurrency, 4);
  assert.equal(status.modelInferenceConcurrency, 4);

  console.log(`\nParalel turbo: ${status.approved} soru onaylandı (~${(elapsed / 1000).toFixed(1)}sn), eşzamanlı istek tepesi=${peak}`);
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
