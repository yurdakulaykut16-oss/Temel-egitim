function abortError(signal) {
 if (signal?.reason instanceof Error) {
  const error = signal.reason;
  if (error.name === 'AbortError') return error;
 }
 const error = new Error('Inference request was aborted before it started.');
 error.name = 'AbortError';
 return error;
}

function clampSlots(value, fallback = 1) {
 const n = Number(value);
 if (!Number.isFinite(n)) return fallback;
 return Math.max(1, Math.min(8, Math.floor(n)));
}

const DEFAULT_SWITCH_GRACE_MS = 3_000;
const DEFAULT_MAX_HOLD_MS = 5 * 60_000;

/**
 * Ollama'ya giden model çağrılarının çalıştırılma yuvalarını yönetir.
 * maxConcurrent=1 (varsayılan) seri çalışır; 1-8 arası yuva ile paralel
 * üretim yapılır. Her yuvadaki istek yine de Ollama tarafında sıraya girebilir;
 * uygulama hangi modelin ne zaman başladığını her durumda bilir.
 *
 * MODEL SIRASI (affinity) MODU
 * ----------------------------
 * İki model ekran kartı belleğinde aynı anda kalamıyorsa Ollama her model değişiminde birini
 * bellekten atıp diğerini yeniden yükler (model başına 5-10 sn). İstekler geliş sırasıyla
 * çalıştırılırsa (üretici → hakem → üretici → hakem …) her soruda iki yükleme yapılır.
 *
 * Bu modda kuyruk işleri MODELE GÖRE gruplar: bellekteki modelin bekleyen bütün çağrıları
 * bitmeden başka modele geçilmez. Aynı anda birkaç soru hazırlanıyorsa önce hepsi yazılır ve
 * 1. hakemden geçer, sonra 2. hakem hepsine birlikte bakar; model soru başına değil, dalga
 * başına bir kez değişir. İşin etiketi (`label`) model adıdır.
 *
 *  - Başka modele geçiş, o an çalışan çağrı kalmadığında yapılır (iki model asla üst üste binmez).
 *  - `expectMore(model)` true dönüyorsa (bir soru hattı birazdan aynı modele iş verecek) geçiş
 *    `graceMs` kadar bekletilir; böylece "üretici bitti, hakem çağrısı 50 ms sonra gelecek"
 *    aralığında boşuna model değiştirilmez.
 *  - Açlık koruması: başka modelin en eski işi `maxHoldMs`'den uzun beklediyse, çalışan çağrı
 *    biter bitmez o modele geçilir.
 */
export class SerialTaskQueue {
 #maxConcurrent;
 #running = 0;
 #waiters = [];
 #active = new Set();
 #pending = 0;

 #affinity = false;
 #currentModel = null;
 #idleSince = 0;
 #graceTimer = null;
 #graceMs = DEFAULT_SWITCH_GRACE_MS;
 #maxHoldMs = DEFAULT_MAX_HOLD_MS;
 #expectMore = null;
 #switches = 0;
 #lastSwitchAt = 0;
 #onSwitch = null;

 constructor(maxConcurrent = 1) {
  this.#maxConcurrent = clampSlots(maxConcurrent, 1);
 }

 setMaxConcurrent(value) {
  this.#maxConcurrent = clampSlots(value, this.#maxConcurrent);
  this.#drain();
  return this.#maxConcurrent;
 }

 get maxConcurrent() {
  return this.#maxConcurrent;
 }

 get affinity() {
  return this.#affinity;
 }

 /**
  * Model sırası modunu açar / kapatır.
  * @param {boolean} enabled
  * @param {object} [opts]
  * @param {number} [opts.graceMs]     aynı modele iş beklenirken geçişin en çok bekletileceği süre
  * @param {number} [opts.maxHoldMs]   başka modelin işinin en çok bekletileceği süre (açlık koruması)
  * @param {(model: string) => boolean} [opts.expectMore]  bu modele birazdan iş gelecek mi?
  * @param {(info: {from: string|null, to: string, waiting: number}) => void} [opts.onSwitch]
  */
 setAffinity(enabled, { graceMs, maxHoldMs, expectMore, onSwitch } = {}) {
  if (Number.isFinite(graceMs) && graceMs >= 0) this.#graceMs = graceMs;
  if (Number.isFinite(maxHoldMs) && maxHoldMs >= 0) this.#maxHoldMs = maxHoldMs;
  if (expectMore !== undefined) this.#expectMore = typeof expectMore === 'function' ? expectMore : null;
  if (onSwitch !== undefined) this.#onSwitch = typeof onSwitch === 'function' ? onSwitch : null;
  const next = Boolean(enabled);
  if (next === this.#affinity) return next;
  this.#affinity = next;
  this.#clearGrace();
  if (!next) this.#currentModel = null;
  this.#drain();
  return next;
 }

 /** Bekleyen işleri yeniden değerlendirir (ör. bir soru hattı bitti, artık beklenecek iş kalmadı). */
 poke() {
  if (this.#affinity && this.#waiters.length) this.#drain();
 }

 #clearGrace() {
  if (this.#graceTimer) clearTimeout(this.#graceTimer);
  this.#graceTimer = null;
 }

 /** Kuyrukta beklerken iptal edilen işleri hemen düşürür (başka modele boşuna geçilmesin). */
 #purgeAborted() {
  for (let i = this.#waiters.length - 1; i >= 0; i--) {
   const waiter = this.#waiters[i];
   if (!waiter.signal?.aborted) continue;
   this.#waiters.splice(i, 1);
   this.#pending = Math.max(0, this.#pending - 1);
   waiter.reject(abortError(waiter.signal));
  }
 }

 /** Sıradaki işin dizini; şimdilik hiçbir iş başlatılmayacaksa -1. */
 #pickIndex() {
  if (!this.#affinity) return 0;
  const cur = this.#currentModel;
  if (cur === null) return 0;
  let same = -1;
  let other = -1;
  for (let i = 0; i < this.#waiters.length && (same < 0 || other < 0); i++) {
   if (this.#waiters[i].key === cur) { if (same < 0) same = i; }
   else if (other < 0) other = i;
  }
  const now = Date.now();
  // Açlık koruması: başka modelin en eski işi çok beklediyse bu modele yeni iş verilmez.
  const starving = other >= 0 && now - this.#waiters[other].enqueuedAt >= this.#maxHoldMs;
  if (same >= 0 && !starving) return same;
  if (other < 0) return same; // yalnızca bu modelin işleri var (ya da hiç iş yok)
  // Başka modele geçiş ancak çalışan çağrı kalmayınca yapılır.
  if (this.#running > 0) return -1;
  if (!starving) {
   let expecting = false;
   try { expecting = Boolean(this.#expectMore?.(cur)); } catch { expecting = false; }
   if (expecting) {
    if (!this.#idleSince) this.#idleSince = now;
    const remaining = this.#idleSince + this.#graceMs - now;
    if (remaining > 0) {
     this.#clearGrace();
     this.#graceTimer = setTimeout(() => { this.#graceTimer = null; this.#drain(); }, Math.min(remaining, 250));
     if (typeof this.#graceTimer.unref === 'function') this.#graceTimer.unref();
     return -1;
    }
   }
  }
  return other;
 }

 #drain() {
  if (this.#affinity) this.#purgeAborted();
  while (this.#running < this.#maxConcurrent && this.#waiters.length > 0) {
   const index = this.#pickIndex();
   if (index < 0) break;
   const [waiter] = this.#waiters.splice(index, 1);
   if (this.#affinity && waiter.key !== this.#currentModel) {
    const from = this.#currentModel;
    this.#currentModel = waiter.key;
    if (from !== null) {
     this.#switches += 1;
     this.#lastSwitchAt = Date.now();
     const waiting = 1 + this.#waiters.filter(w => w.key === waiter.key).length;
     try { this.#onSwitch?.({ from, to: waiter.key, waiting }); } catch {}
    }
   }
   this.#idleSince = 0;
   this.#clearGrace();
   this.#begin(waiter);
  }
 }

 #begin(waiter) {
  this.#running += 1;
  this.#pending = Math.max(0, this.#pending - 1);
  const { label, task, signal, resolve, reject } = waiter;

  const execute = async () => {
   if (signal?.aborted) {
    this.#finish();
    reject(abortError(signal));
    return;
   }
   const active = {
    label: String(label || 'inference').slice(0, 160),
    startedAt: Date.now()
   };
   this.#active.add(active);
   try {
    resolve(await task());
   } catch (err) {
    reject(err);
   } finally {
    this.#active.delete(active);
    this.#finish();
   }
  };
  void execute();
 }

 #finish() {
  this.#running = Math.max(0, this.#running - 1);
  if (this.#running === 0) this.#idleSince = Date.now();
  // Çağrıyı yapan hat sonucu işleyip (çoğu kez aynı modele) sıradaki işini kuyruğa koyabilsin diye
  // model sırası modunda değerlendirme bir mikro görev sonraya bırakılır.
  if (this.#affinity) queueMicrotask(() => this.#drain());
  else this.#drain();
 }

 run(label, task, { signal } = {}) {
  if (typeof task !== 'function') throw new TypeError('A queue task must be a function.');
  this.#pending += 1;
  return new Promise((resolve, reject) => {
   const waiter = { label, key: String(label ?? ''), task, signal, resolve, reject, enqueuedAt: Date.now() };
   this.#waiters.push(waiter);
   if (this.#affinity && signal && typeof signal.addEventListener === 'function') {
    signal.addEventListener('abort', () => { if (this.#waiters.includes(waiter)) this.#drain(); }, { once: true });
   }
   // Hemen bir yuva varsa bekletme, anında başlat.
   if (this.#running < this.#maxConcurrent) this.#drain();
  });
 }

 snapshot() {
  const activeList = [...this.#active].map(a => ({ ...a }));
  activeList.sort((a, b) => a.startedAt - b.startedAt);
  const snap = {
   maxConcurrent: this.#maxConcurrent,
   active: activeList[0] || null,
   activeCount: this.#running,
   queued: this.#pending
  };
  if (this.#affinity) {
   const waitingByModel = {};
   for (const w of this.#waiters) waitingByModel[w.key] = (waitingByModel[w.key] || 0) + 1;
   snap.affinity = true;
   snap.currentModel = this.#currentModel;
   snap.switches = this.#switches;
   snap.lastSwitchAt = this.#lastSwitchAt || null;
   snap.waitingByModel = waitingByModel;
  }
  return snap;
 }
}
