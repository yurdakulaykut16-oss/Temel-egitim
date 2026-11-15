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

/**
 * Ollama'ya giden model çağrılarının çalıştırılma yuvalarını yönetir.
 * maxConcurrent=1 (varsayılan) seri çalışır; 1-8 arası yuva ile paralel
 * üretim yapılır. Her yuvadaki istek yine de Ollama tarafında sıraya girebilir;
 * uygulama hangi modelin ne zaman başladığını her durumda bilir.
 */
export class SerialTaskQueue {
 #maxConcurrent;
 #running = 0;
 #waiters = [];
 #active = new Set();
 #pending = 0;

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

 #drain() {
  while (this.#running < this.#maxConcurrent && this.#waiters.length > 0) {
   const waiter = this.#waiters.shift();
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
  this.#drain();
 }

 run(label, task, { signal } = {}) {
  if (typeof task !== 'function') throw new TypeError('A queue task must be a function.');
  this.#pending += 1;
  return new Promise((resolve, reject) => {
   this.#waiters.push({ label, task, signal, resolve, reject });
   // Hemen bir yuva varsa bekletme, anında başlat.
   if (this.#running < this.#maxConcurrent) this.#drain();
  });
 }

 snapshot() {
  const activeList = [...this.#active].map(a => ({ ...a }));
  activeList.sort((a, b) => a.startedAt - b.startedAt);
  return {
   maxConcurrent: this.#maxConcurrent,
   active: activeList[0] || null,
   activeCount: this.#running,
   queued: this.#pending
  };
 }
}
