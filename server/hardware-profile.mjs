/** Kullanıcının bildirdiği masaüstü: RTX 3080 Ti, i5-10400F, 16 GB sistem RAM'i.
 * Bu bir donanım ölçümü değildir. GPU katman dağılımı gerçek VRAM'e göre Ollama'ya bırakılır.
 * Açık ortam değişkenleri profil varsayılanlarından önceliklidir.
 */
export const USER_HARDWARE_PROFILE = Object.freeze({
 name: 'RTX 3080 Ti / i5-10400F',
 numThread: 6,
 numBatch: 512
});
export function hardwareRunnerOptions(env = process.env) {
 const value = (key, fallback) => env[key] == null || String(env[key]).trim() === '' ? fallback : env[key];
 return {
  numThread: value('TEMPO_OLLAMA_NUM_THREADS', USER_HARDWARE_PROFILE.numThread),
  numBatch: value('TEMPO_OLLAMA_NUM_BATCH', USER_HARDWARE_PROFILE.numBatch),
  // -1 zorlanmaz: model ve KV cache gerçek VRAM'e sığmıyorsa Ollama karar versin.
  numGpu: value('TEMPO_OLLAMA_NUM_GPU', null)
 };
}
