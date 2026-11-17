import assert from 'node:assert/strict';
import test from 'node:test';
import { SerialTaskQueue } from '../server/model-inference-queue.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('runs requests one at a time and preserves queue order', async () => {
 const queue = new SerialTaskQueue();
 const order = [];
 let active = 0;
 let peakActive = 0;

 const run = (label, wait) => queue.run(label, async () => {
  active += 1;
  peakActive = Math.max(peakActive, active);
  order.push(`${label}:start`);
  await delay(wait);
  order.push(`${label}:end`);
  active -= 1;
  return label;
 });

 const results = await Promise.all([run('teacher', 15), run('judge-a', 5), run('judge-b', 1)]);
 assert.deepEqual(results, ['teacher', 'judge-a', 'judge-b']);
 assert.equal(peakActive, 1);
 assert.deepEqual(order, [
  'teacher:start', 'teacher:end',
  'judge-a:start', 'judge-a:end',
  'judge-b:start', 'judge-b:end'
 ]);
 assert.deepEqual(queue.snapshot(), { maxConcurrent: 1, active: null, activeCount: 0, queued: 0 });
});

test('a failed request does not block the next request', async () => {
 const queue = new SerialTaskQueue();
 const first = queue.run('broken-model', async () => { throw new Error('failed'); });
 const second = queue.run('next-model', async () => 'ok');

 await assert.rejects(first, /failed/);
 assert.equal(await second, 'ok');
 assert.equal(queue.snapshot().queued, 0);
});

test('skips a request cancelled while waiting in the queue', async () => {
 const queue = new SerialTaskQueue();
 let releaseFirst;
 const first = queue.run('first', () => new Promise(resolve => { releaseFirst = resolve; }));
 await delay(5); // let the first request become active
 const controller = new AbortController();
 let secondRan = false;
 const second = queue.run('cancelled', async () => { secondRan = true; }, { signal: controller.signal });
 controller.abort();
 releaseFirst('done');

 assert.equal(await first, 'done');
 await assert.rejects(second, error => error.name === 'AbortError');
 assert.equal(secondRan, false);
 assert.equal(queue.snapshot().queued, 0);
});

test('parallel slots run multiple requests concurrently and setMaxConcurrent resizes at runtime', async () => {
 const queue = new SerialTaskQueue(4);
 let active = 0;
 let peakActive = 0;
 const run = (label, wait) => queue.run(label, async () => {
  active += 1;
  peakActive = Math.max(peakActive, active);
  await delay(wait);
  active -= 1;
  return label;
 });
 const results = await Promise.all([run('a', 40), run('b', 40), run('c', 40), run('d', 40), run('e', 5), run('f', 5)]);
 assert.equal(results.length, 6);
 assert.ok(peakActive >= 4, `4 yuva aynı anda çalışmalıydı; görülen tepe: ${peakActive}`);
 assert.equal(queue.snapshot().maxConcurrent, 4);
 assert.equal(queue.setMaxConcurrent(2), 2);
 assert.equal(queue.snapshot().maxConcurrent, 2);
 const g = queue.run('g', async () => 'g');
 const h = queue.run('h', async () => 'h');
 const i = queue.run('i', async () => 'i');
 const more = await Promise.all([g, h, i]);
 assert.deepEqual(more, ['g', 'h', 'i']);
});

// --- MODEL SIRASI (affinity) MODU ---------------------------------------------------
// İki model bellekte birlikte kalamıyorsa çağrılar modele göre gruplanır: model soru başına
// değil, dalga başına bir kez değişir.

/** Çalışma sırasını ve aynı anda farklı model çalışıp çalışmadığını kaydeden yardımcı. */
function recorder(queue) {
 const order = [];
 const running = new Map();
 let overlap = false;
 const call = (model, wait = 5, opts) => queue.run(model, async () => {
  if ([...running.keys()].some(m => m !== model && running.get(m) > 0)) overlap = true;
  running.set(model, (running.get(model) || 0) + 1);
  order.push(model);
  await delay(wait);
  running.set(model, running.get(model) - 1);
  return model;
 }, opts);
 return { order, call, get overlap() { return overlap; } };
}
const switchesOf = order => order.reduce((n, m, i) => n + (i > 0 && order[i - 1] !== m ? 1 : 0), 0);

test('affinity: karışık sırayla gelen çağrılar modele göre gruplanır', async () => {
 const queue = new SerialTaskQueue(1);
 queue.setAffinity(true, { graceMs: 0 });
 const rec = recorder(queue);
 // Geliş sırası: q g q g q g → affinity olmadan 5 model değişimi olurdu.
 await Promise.all(['q', 'g', 'q', 'g', 'q', 'g'].map(m => rec.call(m)));
 assert.deepEqual(rec.order, ['q', 'q', 'q', 'g', 'g', 'g']);
 assert.equal(switchesOf(rec.order), 1);
 const snap = queue.snapshot();
 assert.equal(snap.affinity, true);
 assert.equal(snap.currentModel, 'g');
 assert.equal(snap.switches, 1);
 assert.equal(snap.queued, 0);
});

test('affinity: bir soru hattının ardışık çağrıları dalga hâlinde ilerler (üretici → 1. hakem → 2. hakem)', async () => {
 const queue = new SerialTaskQueue(2);
 let inFlight = 0;
 // Hat iki çağrı arasındayken (kuyrukta da çalışırken de değil) aynı modele iş gelebilir.
 queue.setAffinity(true, { graceMs: 500, expectMore: () => inFlight - queue.snapshot().queued - queue.snapshot().activeCount > 0 });
 const rec = recorder(queue);
 const line = async () => {
  inFlight += 1;
  try {
   await rec.call('q', 8);  // üretici
   await delay(2);          // sonucu işleme
   await rec.call('q', 4);  // 1. hakem (aynı model)
   await delay(2);
   await rec.call('g', 4);  // 2. hakem (başka model)
  } finally {
   inFlight -= 1;
   queue.poke();
  }
 };
 const t0 = Date.now();
 await Promise.all([line(), line(), line(), line()]);
 assert.deepEqual(rec.order, ['q', 'q', 'q', 'q', 'q', 'q', 'q', 'q', 'g', 'g', 'g', 'g'], `sıra: ${rec.order.join(' ')}`);
 assert.equal(rec.overlap, false, 'iki farklı model aynı anda çalışmamalı');
 assert.ok(Date.now() - t0 < 400, 'bekleme süresi (grace) dolmadan, iş kalmadığı anlaşılınca geçilmeli');
});

test('affinity: başka modele geçiş, çalışan çağrı bitmeden yapılmaz', async () => {
 const queue = new SerialTaskQueue(2);
 queue.setAffinity(true, { graceMs: 0 });
 const rec = recorder(queue);
 const a = rec.call('q', 40);
 const b = rec.call('g', 5);  // boş yuva var ama model farklı → beklemeli
 await delay(15);
 assert.deepEqual(rec.order, ['q']);
 assert.deepEqual(queue.snapshot().waitingByModel, { g: 1 });
 await Promise.all([a, b]);
 assert.deepEqual(rec.order, ['q', 'g']);
 assert.equal(rec.overlap, false);
});

test('affinity: aynı modele iş bekleniyorsa geçiş en çok graceMs kadar bekletilir', async t => {
 const queue = new SerialTaskQueue(1);
 queue.setAffinity(true, { graceMs: 120, expectMore: () => true });
 const rec = recorder(queue);
 // Kuyruğun bekleme zamanlayıcısı süreci ayakta tutmaz (unref); test süresince döngüyü canlı tut.
 const keepAlive = setInterval(() => {}, 20);
 t.after(() => clearInterval(keepAlive));
 await rec.call('q', 5);
 const t0 = Date.now();
 const g = rec.call('g', 5);
 await delay(40);
 assert.deepEqual(rec.order, ['q'], 'bekleme süresi dolmadan başka modele geçilmemeli');
 // Bekleme sırasında gelen aynı model çağrısı hemen çalışır.
 await rec.call('q', 5);
 await g;
 const waited = Date.now() - t0;
 assert.deepEqual(rec.order, ['q', 'q', 'g']);
 assert.ok(waited >= 100 && waited < 1500, `geçiş ~120 ms sonra yapılmalıydı: ${waited} ms`);
});

test('affinity: açlık koruması — başka modelin işi maxHoldMs sonra mutlaka çalışır', async () => {
 const queue = new SerialTaskQueue(1);
 queue.setAffinity(true, { graceMs: 0, maxHoldMs: 60 });
 const rec = recorder(queue);
 let stop = false;
 // q modeline hiç bitmeyen bir iş akışı: her çağrı bitmeden yenisi kuyruğa girer.
 const feeder = (async () => {
  let pending = rec.call('q', 10);
  while (!stop) {
   const next = rec.call('q', 10);
   await pending;
   pending = next;
  }
  await pending;
 })();
 await delay(15);
 const t0 = Date.now();
 await rec.call('g', 5);
 const waited = Date.now() - t0;
 stop = true;
 await feeder;
 assert.ok(waited >= 50 && waited < 600, `g çağrısı ~60 ms sonra çalışmalıydı: ${waited} ms`);
 assert.equal(rec.overlap, false);
});

test('affinity: kuyrukta iptal edilen iş başka modele boşuna geçiş yaptırmaz', async () => {
 const queue = new SerialTaskQueue(1);
 queue.setAffinity(true, { graceMs: 0 });
 const rec = recorder(queue);
 const first = rec.call('q', 30);
 const ctrl = new AbortController();
 const cancelled = rec.call('g', 5, { signal: ctrl.signal });
 const later = rec.call('q', 5);
 ctrl.abort();
 await assert.rejects(cancelled, error => error.name === 'AbortError');
 await Promise.all([first, later]);
 assert.deepEqual(rec.order, ['q', 'q']);
 assert.equal(queue.snapshot().switches, 0);
 assert.equal(queue.snapshot().queued, 0);
});

test('affinity kapatılınca kuyruk yeniden geliş sırasıyla çalışır', async () => {
 const queue = new SerialTaskQueue(1);
 queue.setAffinity(true, { graceMs: 0 });
 assert.equal(queue.affinity, true);
 queue.setAffinity(false);
 assert.equal(queue.affinity, false);
 const rec = recorder(queue);
 await Promise.all(['q', 'g', 'q', 'g'].map(m => rec.call(m)));
 assert.deepEqual(rec.order, ['q', 'g', 'q', 'g']);
 assert.deepEqual(queue.snapshot(), { maxConcurrent: 1, active: null, activeCount: 0, queued: 0 });
});
