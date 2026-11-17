// HIZ İYİLEŞTİRMELERİ: tek model + tek hakem hattında boşa giden iş kesilir
// ---------------------------------------------------------------------------
//  1) Soru kökü tek başına "tekrar" kararı için yeterliyse üretici çağrısı yarıda kesilir; karar,
//     tam taslakla verilen kararla aynıdır (findDuplicateReason'ın ilk iki kuralı).
//  2) Kuyruk boştaki modelin işini öne alır; kuyrukta beklerken iptal edilen iş hiç başlamaz.
//  3) Uçtan uca (simülatör): tek hakemli akışta üretim + tek inceleme yapılır, tekrar kökler yarıda kesilir ve
//     sağlıklı akışta sorular arasında bekleme yoktur.
// Uçtan uca test dosyanın SONUNDA kalmalıdır (süreci kapatır).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFakeOllama} from './fake-ollama-sim.mjs';
import {SerialTaskQueue} from '../server/model-inference-queue.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

test('kuyruk: boştaki modelin işi, meşgul modelin daha önce gelen işinin önüne alınır', async () => {
 const queue = new SerialTaskQueue(2);
 const order = [];
 const job = (name, ms) => async () => { order.push(`start:${name}`); await sleep(ms); order.push(`end:${name}`); return name; };
 const gen = queue.run('qwen', job('gen', 60));
 await sleep(5);
 // İki hakem aynı anda kuyruğa girer: önce meşgul modelinki (qwen), sonra boştaki modelinki (gemma).
 const j1 = queue.run('qwen', job('j1', 20));
 const j2 = queue.run('gemma', job('j2', 20));
 await Promise.all([gen, j1, j2]);
 assert.deepEqual(order.slice(0, 2), ['start:gen', 'start:j2'], 'boştaki gemma beklemeden başlar');
 assert.ok(order.indexOf('start:j2') < order.indexOf('start:j1'), 'meşgul modelin (qwen) hakemi sonra başlar');
});

test('kuyruk: beklerken iptal edilen iş hiç başlamaz ve yuva tutmaz', async () => {
 const queue = new SerialTaskQueue(1);
 let started = false;
 const first = queue.run('qwen', async () => { await sleep(40); return 1; });
 const ctrl = new AbortController();
 const cancelled = queue.run('qwen', async () => { started = true; return 2; }, { signal: ctrl.signal });
 const third = queue.run('gemma', async () => 3);
 ctrl.abort();
 await assert.rejects(cancelled);
 assert.equal(await first, 1);
 assert.equal(await third, 3);
 assert.equal(started, false);
 assert.equal(queue.snapshot().queued, 0);
});

test('aynı model için birden çok yuva varken sıra bozulmaz (boşta model yoksa geliş sırası)', async () => {
 const queue = new SerialTaskQueue(3);
 const order = [];
 const job = name => async () => { order.push(name); await sleep(10); };
 await Promise.all([queue.run('qwen', job('a')), queue.run('qwen', job('b')), queue.run('qwen', job('c'))]);
 assert.deepEqual(order, ['a', 'b', 'c']);
});

test('uçtan uca: tek hakem kuralı sürer; reddedilen taslakta üretici tekrar kökte boşa çalışmaz', async () => {
 let app, sim, dir, base, mod;
 let failure = null;
 try {
  const hash = text => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; };
  const stems = [];
  let drafts = 0, repeated = 0, rejectedByJudge = 0;
  const rejectedStems = new Set();
  sim = createFakeOllama({
   loadMs: 30, genMs: 240, judgeMs: 120,
   // Her 4 taslaktan biri, daha önce yazılmış bir sorunun kökünü yineler.
   generatorHook(draft) {
    drafts++;
    if (stems.length >= 3 && drafts % 4 === 0) { repeated++; return { ...draft, question: stems[drafts % stems.length] }; }
    stems.push(draft.question);
    return draft;
   },
   // Tek hakem soruların yaklaşık üçte birini kaynak desteği yoksa reddeder.
   judgeHook(verdict, { prompt, model }) {
    const stem = (prompt.match(/\nSORU: ([\s\S]*?)\nSEÇENEKLER:/) || [])[1] || '';
    if (hash(stem) >= 34) return verdict;
    if (!rejectedStems.has(stem)) { rejectedStems.add(stem); rejectedByJudge++; }
    return { ...verdict, supported: false, qualityOk: false };
   }
  });
  const fakePort = await sim.listen();
  dir = await mkdtemp(join(tmpdir(), 'tempo-speed-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  for (const k of ['OLLAMA_MODEL', 'OLLAMA_VERIFIER_MODEL', 'OLLAMA_JUDGE2_MODEL', 'TEMPO_PLAN', 'TEMPO_DISABLE_AUTOLOOP', 'TEMPO_QUESTION_INTERVAL_MS', 'TEMPO_AUTO_CONCURRENCY', 'TEMPO_EARLY_STOP']) delete process.env[k];
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  process.env.TEMPO_QUIET = '1';

  mod = await import('../server/ollama.mjs');

  // --- kök tekrar kararı, tam taslak kararıyla aynıdır ---
  const ctx = { id: '0-0' };
  const pool = [
   { unitId: '0-0', question: 'Antrenmanda aşırı yüklenme ilkesi neyi ifade eder?', options: ['a', 'b', 'c', 'd'], answer: 'a' },
   { unitId: '1-1', question: 'Dopingle mücadelede WADA hangi görevi üstlenir?', options: ['e', 'f', 'g', 'h'], answer: 'e' }
  ];
  assert.equal(mod.findStemDuplicateReason('Antrenmanda aşırı yüklenme ilkesi neyi ifade eder?', ctx, pool), 'Aynı soru zaten kayıtlı.');
  assert.equal(mod.findStemDuplicateReason('Dopingle mücadelede WADA hangi görevi üstlenir?', ctx, pool), 'Aynı soru zaten kayıtlı.', 'birebir aynı kök başka ünitede de tekrardır');
  assert.equal(mod.findStemDuplicateReason('Kuvvet antrenmanında dinlenme aralığı nasıl belirlenir?', ctx, pool), null);
  for (const q of ['Antrenmanda aşırı yüklenme ilkesi neyi ifade eder?', 'Antrenmanda aşırı yüklenme ilkesi neyi ifade etmektedir?', 'Kuvvet antrenmanında dinlenme aralığı nasıl belirlenir?', 'Dopingle mücadelede WADA hangi görevi üstlenir?']) {
   const stemOnly = mod.findStemDuplicateReason(q, ctx, pool);
   const full = mod.findDuplicateReason({ question: q, options: ['w', 'x', 'y', 'z'], answer: 'w' }, ctx, pool);
   if (stemOnly) assert.equal(full, stemOnly, `kökten verilen karar tam taslak kararıyla aynı olmalı: ${q}`);
  }
  // --- akıştaki yarım JSON'dan tamamlanmış alan okunur ---
  assert.equal(mod.completedJsonField('{"evidence":"Kaynak \\"alıntı\\" cümlesi.","question":"Hangisi doğ', 'question'), null, 'yazımı bitmemiş alan okunmaz');
  assert.equal(mod.completedJsonField('{"evidence":"Kaynak \\"question\\": cümlesi.","question":"Hangisi doğrudur?","opt', 'question'), 'Hangisi doğrudur?');
  assert.equal(mod.completedJsonField('{"evidence":"E","question":"Satır\\nsonu ve \\"tırnak\\"?" ,', 'question'), 'Satır\nsonu ve "tırnak"?');

  let middleware;
  mod.ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
  app = http.createServer((req, res) => {
   req.url = req.url.replace(/^\/api\/ollama/, '');
   middleware(req, res, () => { res.statusCode = 404; res.end(); });
  });
  base = `http://127.0.0.1:${await listen(app)}`;
  const get = async path => (await fetch(`${base}/api/ollama${path}`)).json();

  const TARGET = 14;
  let items = [];
  const started = Date.now();
  let firstAt = 0;
  for (let i = 0; i < 900; i++) {
   await sleep(60);
   items = (await get('/questions')).items.filter(q => q.status === 'approved');
   if (items.length && !firstAt) firstAt = Date.now();
   if (items.length >= TARGET) break;
  }
  const elapsed = Date.now() - (firstAt || started);
  const status = await get('/status');
  assert.ok(items.length >= TARGET, `yeterli soru üretilmeliydi (${items.length}); engel: ${JSON.stringify(status.autoBlock)}`);

  // Her onaylı soruda yalnızca bir hakem kararı bulunur; aynı model üretici ve denetçidir.
  for (const q of items) {
   const judges = q.verification?.judges || [];
   assert.equal(judges.length, 1, `${q.id}: tek hakem kararı olmalı`);
   for (const j of judges) assert.equal(j.answer, q.answer, 'her hakem aynı doğru cevabı bulmuş olmalı');
   assert.ok(q.evidence && q.evidence.length >= 15, 'kaynak alıntısı kayıtlı');
  }
  // Havuzda tekrar kök yok ve hakemin reddettiği hiçbir kök havuza girmedi.
  assert.equal(new Set(items.map(q => q.question)).size, items.length);
  for (const q of items) assert.ok(!rejectedStems.has(q.question), 'reddedilen taslak olduğu gibi havuza giremez');

  // BOŞA GİDEN İŞ KESİLDİ
  assert.ok(repeated >= 2 && rejectedByJudge >= 2, `senaryo hem tekrar hem ret içermeli (${repeated}, ${rejectedByJudge})`);
  assert.ok(status.telemetry.earlyStops >= 2, `tekrar kökler yarıda kesilmeli (kesilen: ${status.telemetry.earlyStops}, tekrar taslak: ${repeated})`);
  assert.equal(status.telemetry.judgeCallsCancelled || 0, 0, 'tek hakem hattında iptal edilecek ikinci çağrı olmamalı');
  assert.ok(sim.stats.requests.filter(r => r.role === 'judge').every(r => r.model === status.model), 'tek model üretici ve hakem olarak kullanılmalı');

  // SORULAR ARASINDA BEKLEME YOK: üretici model ilk sorudan sonra neredeyse hiç boş kalmaz.
  const lane = sim.stats.requests.filter(r => /qwen/.test(r.model) && r.startedAt && r.endedAt).sort((a, b) => a.startedAt - b.startedAt);
  let idle = 0;
  for (let i = 1; i < lane.length; i++) idle += Math.max(0, lane[i].startedAt - lane[i - 1].endedAt);
  const span = lane.at(-1).endedAt - lane[0].startedAt;
  assert.ok(idle / span < 0.25, `üretici model boş beklememeli (boş kalma oranı ${(idle / span).toFixed(2)})`);
  console.log(`\n${items.length} soru · ${(elapsed / 1000 / Math.max(1, items.length - 1)).toFixed(2)} sn/soru · yarıda kesilen üretim ${status.telemetry.earlyStops} · hakem iptali ${status.telemetry.judgeCallsCancelled} · üretici boş kalma ${(idle / span * 100).toFixed(0)}%`);
 } catch (e) {
  failure = e;
 }
 try { mod?.stopOllamaLoops?.(); } catch {}
 if (base) { try { await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } }); } catch {} }
 if (app) try { app.closeAllConnections?.(); await new Promise(r => app.close(r)); } catch {}
 if (sim) try { await sim.close(); } catch {}
 if (dir) try { await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); } catch {}
 if (failure) { console.error(failure); process.exit(1); }
 process.exit(0);
});
