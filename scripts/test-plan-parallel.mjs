// ÜRETİM PLANI: İKİ KONU AYNI ANDA, YARIM BIRAKMADAN (uçtan uca, Ollama simülatörüyle)
// ---------------------------------------------------------------------------
// Varsayılan ayarda (aynı anda 2 soru) konular ikili gruplar hâlinde işlenir: 1. ve 2. konu birlikte
// başlar. Biri kotasına ulaşınca boşalan hat 3. konuya GEÇMEZ; eksik kalan konuya yardım eder.
// İkisi de dolunca 3. ve 4. konu başlar. Doğrulananlar:
//  1) İki farklı konuda aynı anda soru hazırlanır.
//  2) 1. konu dolduktan sonra iki hat birlikte (geride kalan) 2. konuda çalışır.
//  3) Grup tamamlanmadan sıradaki grubun konularına tek soru yazılmaz.
//  4) Hiçbir hücre (konu + zorluk) payını aşmaz (iki hat aynı konuda çalışırken bile); ilk turda her
//     konunun kolay, orta ve zor sorusu birlikte yazılır (kota 6 → konu başına 2 kolay + 2 orta + 2 zor).
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

test('plan: iki konu aynı anda; biri dolunca boşalan hat eksik kalana yardım eder, kota aşılmaz', async () => {
 let app, sim, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  const contexts = JSON.parse(await readFile(new URL('../server/contexts.json', import.meta.url), 'utf8'));
  const stepIndex = new Map(contexts.map((c, i) => [c.id, i])); // 1. tur: adım sırası = konu sırası
  const [A, B, C, D] = contexts;
  // 2. konu geride kalsın diye hakem o konunun İLK 4 sorusunu reddeder.
  // Hakem istemi özetin yalnızca bir penceresini içerir; pencerenin 2. konudan gelip gelmediğine bakılır.
  const fromLagTopic = prompt => {
   const m = prompt.match(/KONU ANLATIMI: ([\s\S]*?)(?:\nPARÇA:|\nSORU:)/);
   return Boolean(m && m[1].length > 40 && B.text.includes(m[1].slice(0, 80)));
  };
  const rejectedStems = new Set();
  sim = createFakeOllama({
   loadMs: 30, genMs: 120, judgeMs: 60,
   judgeHook(verdict, { prompt }) {
    if (!fromLagTopic(prompt)) return verdict;
    const stem = (prompt.match(/\nSORU: ([\s\S]*?)\nSEÇENEKLER:/) || [])[1] || '';
    if (!rejectedStems.has(stem) && rejectedStems.size < 4) rejectedStems.add(stem);
    return rejectedStems.has(stem) ? { ...verdict, supported: false, qualityOk: false } : verdict;
   }
  });
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

  const count = (list, ctx) => list.filter(q => q.unitId === ctx.id).length;
  let items = [];
  let sawTwoUnitsAtOnce = false;
  let sawBothHelpingLagging = false;
  let workingPair = null;
  let workingSingle = null;
  for (let i = 0; i < 1600; i++) {
   await sleep(40);
   const status = await (await fetch(`${base}/api/ollama/status`)).json();
   const activeUnits = (status.autoPhases || []).map(p => p.unit);
   if (new Set(activeUnits).size >= 2) sawTwoUnitsAtOnce = true;
   if (activeUnits.length === 2 && activeUnits.every(u => u === B.id)) sawBothHelpingLagging = true;
   const working = status.plan?.workingUnits || [];
   if (!workingPair && working.length === 2) workingPair = status.plan;
   if (!workingSingle && working.length === 1 && working[0].unitId === B.id) workingSingle = status.plan;
   if (i % 3 === 0) items = (await (await fetch(`${base}/api/ollama/questions`)).json()).items.filter(q => q.status === 'approved');
   if (count(items, C) >= 2 && count(items, D) >= 2) break;
  }
  const status = await (await fetch(`${base}/api/ollama/status`)).json();
  const seq = items.map(q => q.unitId);
  console.log(`\nSıra (konu): ${seq.join(' ')}`);
  assert.ok(count(items, C) >= 2 && count(items, D) >= 2, `3. ve 4. konuya geçilmeliydi; sıra: ${seq.join(' ')}, engel: ${JSON.stringify(status.autoBlock)}, son olay: ${JSON.stringify(status.autoEvents?.[0])}`);

  assert.equal(status.autoConcurrencyEffective, 2, 'aynı anda 2 soru hazırlanmalı');
  assert.ok(sawTwoUnitsAtOnce, 'iki farklı konuda aynı anda soru hazırlanmalı');
  assert.ok(sawBothHelpingLagging, '1. konu dolunca boşalan hat geride kalan 2. konuya yardım etmeli (iki hat da 2. konuda)');
  assert.ok(workingPair, '/status plan.working iki konuyu birlikte göstermeli');
  assert.equal(workingPair.parallel, 2);
  assert.deepEqual(workingPair.workingUnits.map(w => w.unitId), [A.id, B.id]);
  assert.deepEqual(workingPair.workingUnits[0].cells.map(c => [c.difficulty, c.share]), [['kolay', 2], ['orta', 2], ['zor', 2]]);
  assert.ok(workingSingle, '1. konu dolunca /status yalnızca eksik kalan 2. konuyu göstermeli');

  // Grup tamamlanmadan sıradaki grubun konularına soru yazılmaz; hiçbir hücre payını aşmaz.
  const SHARE = QUOTA / 3; // 1. turda konu başına her zorluktan 2 soru
  const DIFFS = ['kolay', 'orta', 'zor'];
  const counts = new Map();   // konu -> { kolay, orta, zor } (kaydedilen zorluk)
  const onTarget = new Map(); // konu -> { kolay, orta, zor } (hedef zorluğuyla kaydedilenler)
  const zero = () => ({ kolay: 0, orta: 0, zor: 0 });
  for (const q of items) {
   const group = Math.floor(stepIndex.get(q.unitId) / 2);
   const earlier = contexts.slice(0, group * 2);
   const unfinished = earlier.filter(c => DIFFS.some(d => ((counts.get(c.id) || zero())[d]) < SHARE)).map(c => c.id);
   assert.deepEqual(unfinished, [], `${q.unitId} sorusu yazılırken önceki gruptaki ${unfinished.join(', ')} eksikti: ${seq.join(' ')}`);
   if (!counts.has(q.unitId)) { counts.set(q.unitId, zero()); onTarget.set(q.unitId, zero()); }
   counts.get(q.unitId)[q.difficulty]++;
   assert.ok(counts.get(q.unitId)[q.difficulty] <= QUOTA, `${q.unitId} ${q.difficulty} kotasını (${QUOTA}) aşmamalı`);
   if (q.verification?.targetDifficulty === q.difficulty) {
    onTarget.get(q.unitId)[q.difficulty]++;
    assert.ok(onTarget.get(q.unitId)[q.difficulty] <= SHARE, `${q.unitId} ${q.difficulty}: 1. turdaki pay (${SHARE}) aşılmamalı: ${seq.join(' ')}`);
   }
  }
  // 1. ve 2. konunun kolay, orta ve zor sorusu vardır (zorluk konuya göre değil, konu içinde karışık).
  for (const unit of [A, B]) {
   for (const d of DIFFS) assert.ok(counts.get(unit.id)[d] >= SHARE, `${unit.id}: ${d} sorusu eksik (${JSON.stringify(counts.get(unit.id))})`);
  }
  const firstA = items.filter(q => q.unitId === A.id).slice(0, 3).map(q => q.verification?.targetDifficulty);
  assert.deepEqual(firstA, ['kolay', 'orta', 'zor'], 'konu içinde zorluklar sırayla döner');
  // 2. konunun son soruları, 1. konu bittikten sonra yazıldı (yardım gerçekten işe yaradı).
  assert.ok(seq.lastIndexOf(B.id) > seq.lastIndexOf(A.id));
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
