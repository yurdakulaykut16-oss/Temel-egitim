/**
 * Model takası gözcüsü.
 *
 * Ollama iki modeli ekran kartı belleğinde aynı anda tutamıyorsa (VRAM yetmiyor ya da
 * OLLAMA_MAX_LOADED_MODELS=1) her model değişiminde birini atıp diğerini yeniden yükler. Bunu
 * önceden kesin bilmek mümkün değildir: masaüstü, tarayıcı ve oyunlar da VRAM kullanır; kadro
 * planlayıcısının tahmini "sığar" dese bile gerçekte sığmayabilir.
 *
 * Gözcü tahmine değil ÖLÇÜME bakar: Ollama her yanıtta modelin yüklenmesi için harcadığı süreyi
 * (load_duration) bildirir. Az önce kullanılmış bir model yeniden yükleniyorsa bellekten atılmış
 * demektir ("takas").
 *
 *  - Takas moduna GİRİŞ: bir modelin son `window` çağrısının `enterReloads` tanesi takassa.
 *  - Takas modundan ÇIKIŞ: arka arkaya `exitCleanSwitches` model değişimi yükleme gerektirmediyse
 *    (ör. oyun kapatıldı, artık iki model birlikte sığıyor).
 *
 * Dosya/ağ erişimi yoktur; server/ollama.mjs kullanır.
 */

const DEFAULTS = {
 reloadMs: 1500,          // bundan uzun load_duration = model bellekte değildi
 window: 8,
 enterReloads: 2,
 exitCleanSwitches: 4,
 idleForgetMs: 5 * 60_000 // bu kadar süredir çağrılmayan modelin yüklenmesi takas sayılmaz
};

export function createSwapMonitor(options = {}) {
 const cfg = { ...DEFAULTS, ...options };
 let swapping = false;
 let models = new Map();        // model -> { lastAt, history: boolean[], calls, evictions, loadMs }
 let lastModel = null;
 let cleanSwitches = 0;         // takas modundayken arka arkaya yüklemesiz model değişimi
 let switches = 0;
 let evictions = 0;
 let evictionLoadMs = 0;
 let enteredAt = null;
 let exitedAt = null;
 let lastEvictionAt = null;
 let enterCount = 0;

 const stateFor = model => {
  let s = models.get(model);
  if (!s) { s = { lastAt: 0, history: [], calls: 0, evictions: 0, loadMs: 0 }; models.set(model, s); }
  return s;
 };

 /**
  * Tamamlanan her model çağrısı için çağrılır.
  * @returns {'entered'|'exited'|null} takas modu bu çağrıyla değiştiyse
  */
 function note({ model, loadMs = 0, at = Date.now() } = {}) {
  if (typeof model !== 'string' || !model) return null;
  const s = stateFor(model);
  const loaded = Number(loadMs) >= cfg.reloadMs;
  const recentlyUsed = s.lastAt > 0 && at - s.lastAt < cfg.idleForgetMs;
  // Az önce kullanılan model yeniden yüklendiyse bellekten atılmıştır. İlk yükleme ve uzun
  // aradan sonraki yükleme (keep_alive süresi dolmuş olabilir) takas sayılmaz.
  const evicted = loaded && recentlyUsed;
  const switched = lastModel !== null && lastModel !== model;
  s.calls += 1;
  s.lastAt = at;
  s.history.push(evicted);
  if (s.history.length > cfg.window) s.history.shift();
  if (evicted) {
   s.evictions += 1;
   s.loadMs += Number(loadMs);
   evictions += 1;
   evictionLoadMs += Number(loadMs);
   lastEvictionAt = at;
  }
  if (switched) switches += 1;
  lastModel = model;

  if (!swapping) {
   if (s.history.filter(Boolean).length >= cfg.enterReloads) {
    swapping = true;
    cleanSwitches = 0;
    enteredAt = at;
    enterCount += 1;
    return 'entered';
   }
   return null;
  }
  if (switched) {
   // Yüklemesiz geçiş: iki model de bellekteydi. (Uzun aradan sonraki yükleme nötrdür.)
   if (!loaded) cleanSwitches += 1;
   else if (evicted) cleanSwitches = 0;
   if (cleanSwitches >= cfg.exitCleanSwitches) {
    swapping = false;
    cleanSwitches = 0;
    exitedAt = at;
    for (const st of models.values()) st.history = [];
    return 'exited';
   }
  }
  return null;
 }

 /** Kadro değiştiğinde çağrılır: ölçümler sıfırlanır, başlangıç durumu tahminden alınır. */
 function reset({ swapping: initial = false } = {}) {
  models = new Map();
  lastModel = null;
  cleanSwitches = 0;
  swapping = Boolean(initial);
  enteredAt = swapping ? Date.now() : null;
  exitedAt = null;
 }

 function snapshot() {
  const perModel = {};
  for (const [name, s] of models) {
   perModel[name] = {
    calls: s.calls,
    evictions: s.evictions,
    avgLoadMs: s.evictions ? Math.round(s.loadMs / s.evictions) : 0,
    recentEvictions: s.history.filter(Boolean).length
   };
  }
  return {
   swapping,
   switches,
   evictions,
   avgLoadMs: evictions ? Math.round(evictionLoadMs / evictions) : 0,
   cleanSwitches,
   enteredAt: enteredAt ? new Date(enteredAt).toISOString() : null,
   exitedAt: exitedAt ? new Date(exitedAt).toISOString() : null,
   lastEvictionAt: lastEvictionAt ? new Date(lastEvictionAt).toISOString() : null,
   enterCount,
   perModel
  };
 }

 return {
  note,
  reset,
  snapshot,
  get swapping() { return swapping; }
 };
}
