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
  process.env.TEMPO_PLAN_QUOTA = '2';
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

  // Beklenen akış: 0-0 kolay (3 ret → atla) → 0-1 kolay ×2 → 0-2: hakemler "orta" der → 2 orta
  // kaydedilir (orta kotası dolar), sonraki "orta" kararları reddedilir → 3 ret → atla → 0-3 kolay…
  let items = [];
  let status = null;
  for (let i = 0; i < 400; i++) {
   await sleep(250);
   items = (await (await fetch(`${base}/api/ollama/questions`)).json()).items.filter(q => q.status === 'approved');
   status = await (await fetch(`${base}/api/ollama/status`)).json();
   if (items.some(q => q.unitId === contexts[3].id) && (status.plan?.parked || []).length >= 2) break;
  }
  const seq = items.map(q => `${q.unitId}:${q.difficulty}`);
  console.log(`\nSıra: ${seq.slice(0, 8).join(', ')} · atlanan: ${(status.plan.parked || []).map(p => p.key).join(', ')}`);

  assert.ok(!items.some(q => q.unitId === first.id), 'hakemlerin reddettiği konudan soru kaydedilmemeli');
  // Varsayılan ayarda iki konu aynı anda çalışır; bu yüzden sıra değil içerik sınanır.
  assert.deepEqual(items.filter(q => q.unitId === second.id).map(q => q.difficulty), ['kolay', 'kolay'], 'takılan adım atlanıp sıradaki konu doldurulmalı');
  assert.deepEqual(items.filter(q => q.unitId === third.id).map(q => q.difficulty), ['orta', 'orta'], 'farklı zorluk kendi kotasına yazılmalı');
  assert.equal(items.filter(q => q.unitId === third.id).length, 2, 'orta kotası (2) dolunca fazlası kaydedilmemeli');
  assert.ok(items.some(q => q.unitId === contexts[3].id), 'üretim 4. konuyla sürmeli');

  const parkedKeys = status.plan.parked.map(p => p.key);
  assert.ok(parkedKeys.includes(`${first.id}|kolay`) && parkedKeys.includes(`${third.id}|kolay`), `atlanan adımlar bildirilmeli: ${parkedKeys.join(', ')}`);
  const saved = JSON.parse(await readFile(join(dir, 'production-plan.json'), 'utf8'));
  assert.ok(saved.parked[`${first.id}|kolay`], 'atlanan adım dosyaya yazılmalı (yeniden başlatınca baştan denenmesin)');
  assert.equal(saved.parked[`${first.id}|kolay`].failures, 3, 'sayaç adım başına tutulur: araya giren diğer konunun soruları onu sıfırlamaz');
  const third1 = items.find(q => q.unitId === third.id);
  assert.equal(third1.verification.targetDifficulty, 'kolay', 'hedef zorluk kayıtta görünmeli');
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
