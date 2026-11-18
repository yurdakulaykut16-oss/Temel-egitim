// ÜRETİM PLANI: TAKILAN ADIM TESTİ (uçtan uca, Ollama simülatörüyle)
// ---------------------------------------------------------------------------
// Konu özeti kısa olduğu için bir adımın (konu + zorluk) kotası dolmayabilir. Plan o adımda
// sonsuza dek beklerse "saatlerce soru gelmiyor" durumu geri döner. Bu test şunu doğrular:
//  1) Üst üste sonuçsuz kalan adım atlanır ve sıradaki konuya geçilir.
//  2) Atlanan adım kalıcı olarak kaydedilir (.tempo-data/production-plan.json) ve arayüze bildirilir.
//  3) Hakem hedeften farklı zorluk verirse soru o zorlukla kaydedilir (ileriki tura sayılır).
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

test('plan: sonuç vermeyen adım atlanır, üretim sıradaki konuyla sürer', async () => {
 let app, sim, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  const contexts = JSON.parse(await readFile(new URL('../server/contexts.json', import.meta.url), 'utf8'));
  const first = contexts[0], second = contexts[1], third = contexts[2];
  // Hakem istemi özetin yalnızca bir penceresini içerir; pencerenin hangi konudan geldiğine bakılır.
  const fromTopic = (prompt, ctx) => {
   const m = prompt.match(/KONU ANLATIMI: ([\s\S]*?)(?:\nPARÇA:|\nSORU:)/);
   return Boolean(m && m[1].length > 40 && ctx.text.includes(m[1].slice(0, 80)));
  };
  sim = createFakeOllama({
   loadMs: 20, genMs: 15, judgeMs: 10,
   judgeHook(verdict, { prompt }) {
    // 1. konu: hakemler hiçbir soruyu desteklemiyor (özet yeni soru için "tükenmiş" gibi).
    if (fromTopic(prompt, first)) return { ...verdict, supported: false, qualityOk: false };
    // 3. konu: hakemler soruyu hep "orta" buluyor (hedef kolay).
    if (fromTopic(prompt, third)) return { ...verdict, difficulty: 'orta' };
    return verdict;
   }
  });
  const fakePort = await sim.listen();
  dir = await mkdtemp(join(tmpdir(), 'tempo-stuck-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_VERIFIER_MODEL;
  delete process.env.OLLAMA_JUDGE2_MODEL;
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  process.env.TEMPO_QUIET = '1';
  process.env.TEMPO_PLAN_QUOTA = '4'; // Yarılama sonrası etkin kota 2
  process.env.TEMPO_PLAN_PASSES = '2';
  process.env.TEMPO_PLAN_STUCK_LIMIT = '3';
  process.env.TEMPO_QUESTION_INTERVAL_MS = '20';
  delete process.env.TEMPO_PLAN;
  delete process.env.TEMPO_AUTO_CONCURRENCY;
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

  // Kota 2, 2 tur: 1. turda her bölüme 1 kolay + 1 orta, 2. turda 1 orta + 1 zor düşer (kova: kolay 1, orta 2, zor 1).
  // Beklenen akış: 0-0 kolay ve orta (3'er ret → ikisi de atlanır) · 0-1 kolay + orta ·
  // 0-2: hakemler hep "orta" der → kolay hedefli soru da orta kaydedilir, orta kotası (2) dolar;
  // sonraki "orta" kararları reddedilir → kolay 3 ret → atlanır · 0-3 kolay + orta …
  let items = [];
  let status = null;
  for (let i = 0; i < 400; i++) {
   await sleep(250);
   items = (await (await fetch(`${base}/api/ollama/questions`)).json()).items.filter(q => q.status === 'approved');
   status = await (await fetch(`${base}/api/ollama/status`)).json();
   const parkedNow = (status.plan?.parked || []).map(p => p.key);
   if (items.filter(q => q.unitId === contexts[3].id).length >= 2 && items.filter(q => q.unitId === second.id).length >= 2
    && parkedNow.includes(`${first.id}|orta`) && parkedNow.includes(`${third.id}|kolay`)) break;
  }
  const seq = items.map(q => `${q.unitId}:${q.difficulty}`);
  console.log(`\nSıra: ${seq.slice(0, 8).join(', ')} · atlanan: ${(status.plan.parked || []).map(p => p.key).join(', ')}`);

  assert.ok(!items.some(q => q.unitId === first.id), 'hakemlerin reddettiği konudan soru kaydedilmemeli');
  // Varsayılan ayarda iki konu aynı anda çalışır; bu yüzden sıra değil içerik sınanır.
  assert.deepEqual(items.filter(q => q.unitId === second.id).map(q => q.difficulty).sort(), ['kolay', 'orta'], 'takılan konu atlanıp sıradaki konunun kolayı ve ortası yazılmalı');
  assert.deepEqual(items.filter(q => q.unitId === third.id).map(q => q.difficulty), ['orta', 'orta'], 'farklı zorluk kendi kotasına yazılmalı');
  assert.equal(items.filter(q => q.unitId === third.id).length, 2, 'orta kotası (2) dolunca fazlası kaydedilmemeli');
  assert.ok(items.some(q => q.unitId === contexts[3].id), 'üretim 4. konuyla sürmeli');

  const parkedKeys = status.plan.parked.map(p => p.key);
  assert.ok(parkedKeys.includes(`${first.id}|kolay`) && parkedKeys.includes(`${first.id}|orta`) && parkedKeys.includes(`${third.id}|kolay`), `atlanan adımlar bildirilmeli: ${parkedKeys.join(', ')}`);
  assert.ok(!parkedKeys.includes(`${third.id}|orta`), 'konunun dolan zorluğu atlanmış sayılmaz');
  const saved = JSON.parse(await readFile(join(dir, 'production-plan.json'), 'utf8'));
  assert.ok(saved.parked[`${first.id}|kolay`], 'atlanan adım dosyaya yazılmalı (yeniden başlatınca baştan denenmesin)');
  assert.equal(saved.parked[`${first.id}|kolay`].failures, 3, 'sayaç adım başına tutulur: araya giren diğer konunun soruları onu sıfırlamaz');
  assert.ok(items.some(q => q.unitId === third.id && q.verification.targetDifficulty === 'kolay' && q.difficulty === 'orta'), 'hedef zorluk kayıtta görünmeli (kolay hedefli soru orta kaydedildi)');
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
