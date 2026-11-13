function abortError(signal) {
 if (signal?.reason instanceof Error) {
  const error = signal.reason;
  if (error.name === 'AbortError') return error;
 }
 const error = new Error('Inference request was aborted before it started.');
 error.name = 'AbortError';
 return error;
}

/**
 * Serializes model inference requests so only one model can use the inference
 * backend at a time. Failed or cancelled work never leaves the queue blocked.
 */
export class SerialTaskQueue {
 #tail = Promise.resolve();
 #pending = 0;
 #active = null;

 run(label, task, { signal } = {}) {
  if (typeof task !== 'function') throw new TypeError('A queue task must be a function.');
  this.#pending += 1;

  const execute = async () => {
   this.#pending = Math.max(0, this.#pending - 1);
   if (signal?.aborted) throw abortError(signal);

   const active = {
    label: String(label || 'inference').slice(0, 160),
    startedAt: Date.now()
   };
   this.#active = active;
   try {
    return await task();
   } finally {
    if (this.#active === active) this.#active = null;
   }
  };

  const result = this.#tail.then(execute, execute);
  this.#tail = result.then(() => undefined, () => undefined);
  return result;
 }

 snapshot() {
  return {
   maxConcurrent: 1,
   active: this.#active ? { ...this.#active } : null,
   queued: this.#pending
  };
 }
}
