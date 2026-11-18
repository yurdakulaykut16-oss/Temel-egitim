// ÜRETİM PLANI
// ---------------------------------------------------------------------------
// Soru üretimi rastgele ünite dolaşmaz; sabit bir sırayı izler. Kitabın bölümlerine sırayla, TUR TUR
// uğranır ve her uğrayışta o bölüme 50 soru yazılır; zorluklar KARIŞIKTIR (kolay → orta → zor → …):
//
//   1. tur: her bölüme 17 kolay + 17 orta + 16 zor (dengeli)
//   2. tur: 10 kolay + 20 orta + 20 zor      3. tur: 6 kolay + 22 orta + 22 zor
//   4. tur: 4 kolay + 23 orta + 23 zor       5. tur: 2 kolay + 24 orta + 24 zor
//   6. tur ve sonrası: 25 orta + 25 zor (kolay soru yazılmaz)
//
// Yani ilk turdan itibaren her bölümün kolay, orta ve zor sorusu vardır; 1. turdan sonra kolay payı
// gittikçe azalır, soruların yarısı orta yarısı zor olur. Tur sayısı TEMPO_PLAN_PASSES ile ayarlanır
// (varsayılan 4 → bölüm başına 200 soru; 29 bölümde toplam 5.800).
//
// Plan "hücre"lerden oluşur: (tur, konu, zorluk). Hücrenin `quota` alanı o konu + zorlukta o turun
// SONUNDA ulaşılması gereken toplam soru sayısıdır (ör. 2. tur kolay: 33); `from` turun başındaki
// sayıdır, `share` o tura düşen paydır.
//
// Aynı anda birden çok soru hazırlanıyorsa (varsayılan 2) konular N'li GRUPLAR hâlinde işlenir:
// ör. 1. ve 2. konu birlikte başlar; biri 50'ye ulaşınca boşalan hat 3. konuya GEÇMEZ, eksik kalan
// konuya yardım eder. Gruptaki bütün konular dolunca (ya da atlanınca) sıradaki grup başlar.
//
// Konu özeti bir zorlukta yeni soru için yetmeyebilir: o konu + zorlukta üst üste çok sayıda deneme
// sonuç vermezse hücre "atlanır" (park edilir), konunun diğer zorlukları ve sıradaki konular sürer;
// tüm hücreler bittiğinde atlananlar yeniden denenir.
//
// Bu dosya saf fonksiyonlardan oluşur (dosya/ağ erişimi yok); server/ollama.mjs kullanır.

export const PLAN_DIFFICULTIES = ['kolay', 'orta', 'zor'];
export const DEFAULT_PLAN_QUOTA = 50;
export const DEFAULT_PLAN_PASSES = 4;
// 1. turdan sonra kolay soruların tur içindeki payı (2., 3., 4., 5. tur); 6. turdan itibaren 0.
export const EASY_FRACTIONS = { 2: 0.20, 3: 0.12, 4: 0.08, 5: 0.04 };
export const DEFAULT_PLAN_STUCK_LIMIT = 25;

export const stepKey = (unitId, difficulty) => `${unitId}|${difficulty}`;

const clampInt = (value, fallback, min, max) => {
 const n = Number.parseInt(String(value ?? ''), 10);
 return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** Ortam değişkenlerinden plan ayarları. TEMPO_PLAN=0 planı kapatır. */
export function planConfigFromEnv(env = process.env) {
 return {
  enabled: env.TEMPO_PLAN !== '0',
  quota: clampInt(env.TEMPO_PLAN_QUOTA, DEFAULT_PLAN_QUOTA, 1, 1000),
  passes: clampInt(env.TEMPO_PLAN_PASSES, DEFAULT_PLAN_PASSES, 1, 200),
  stuckLimit: clampInt(env.TEMPO_PLAN_STUCK_LIMIT, DEFAULT_PLAN_STUCK_LIMIT, 2, 1000)
 };
}

/**
 * `pass`. turda bir bölümün `difficultyIndex` zorluğuna (0 kolay, 1 orta, 2 zor) düşen soru payı.
 * Her turun toplamı `quota`dır. 1. tur dengelidir (50 → 17+17+16); sonraki turlarda kolay payı
 * azalır (EASY_FRACTIONS), kalan sorular yarı yarıya orta ve zor olur (tek kalan soru çift turlarda
 * ortaya, tek turlarda zora yazılır).
 */
export function passShare(quota, pass, difficultyIndex) {
 if (pass <= 1) {
  const base = Math.floor(quota / 3);
  return base + (difficultyIndex < quota % 3 ? 1 : 0);
 }
 const easy = Math.min(quota, Math.round(quota * (EASY_FRACTIONS[pass] || 0)));
 const rest = quota - easy;
 const orta = Math.floor(rest / 2) + (rest % 2 && pass % 2 === 0 ? 1 : 0);
 return [easy, orta, rest - orta][difficultyIndex];
}

/** Bütün turların sonunda bir bölümün `difficultyIndex` zorluğunda olması gereken toplam soru sayısı. */
export function bucketQuota(quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES, difficultyIndex = 0) {
 let total = 0;
 for (let pass = 1; pass <= passes; pass++) total += passShare(quota, pass, difficultyIndex);
 return total;
}

const stepCache = new WeakMap();

/** Sıralı hücre listesi: tur → bölüm (contexts sırası: kitap → bölüm) → zorluk. Payı 0 olan hücre yoktur. */
export function buildPlanSteps(contexts, quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES) {
 const cacheKey = `${quota}|${passes}`;
 const cached = stepCache.get(contexts);
 if (cached?.key === cacheKey) return cached.steps;
 const bookOrder = [];
 for (const c of contexts) if (!bookOrder.includes(c.book)) bookOrder.push(c.book);
 const unitNoInBook = new Map();
 const seenPerBook = new Map();
 for (const c of contexts) {
  const n = (seenPerBook.get(c.book) || 0) + 1;
  seenPerBook.set(c.book, n);
  unitNoInBook.set(c.id, n);
 }
 const steps = [];
 const sofar = PLAN_DIFFICULTIES.map(() => 0);
 for (let pass = 1; pass <= passes; pass++) {
  const shares = PLAN_DIFFICULTIES.map((_, di) => passShare(quota, pass, di));
  contexts.forEach((c, unitIndex) => {
   PLAN_DIFFICULTIES.forEach((difficulty, di) => {
    const share = shares[di];
    if (share <= 0) return;
    steps.push({
     index: steps.length,
     key: stepKey(c.id, difficulty),
     pass,
     visit: (pass - 1) * contexts.length + unitIndex,
     unitId: c.id,
     difficulty,
     from: sofar[di],
     share,
     quota: sofar[di] + share,
     book: c.book,
     unit: c.unit,
     bookNo: bookOrder.indexOf(c.book) + 1,
     unitNo: unitNoInBook.get(c.id)
    });
   });
  });
  shares.forEach((share, di) => { sofar[di] += share; });
 }
 if (contexts && typeof contexts === 'object') stepCache.set(contexts, { key: cacheKey, steps });
 return steps;
}

/** Onaylı soruları (konu, zorluk) kovalarına sayar. */
export function countApproved(items) {
 const counts = new Map();
 for (const it of items || []) {
  if (!it || it.status !== 'approved' || !PLAN_DIFFICULTIES.includes(it.difficulty)) continue;
  const key = stepKey(it.unitId, it.difficulty);
  counts.set(key, (counts.get(key) || 0) + 1);
 }
 return counts;
}

/**
 * Planın anlık durumu.
 * @param parked  { [stepKey]: {...} } — atlanan (konu, zorluk) çiftleri
 * @returns { current, queue, all, complete, allParked, totalDone, totalTarget, parkedSteps, steps, counts }
 *   current: sıradaki (hedefine ulaşmamış ve atlanmamış) ilk hücre; yoksa null.
 *   queue: hedefine ulaşmamış ve atlanmamış bütün hücreler, plan sırasıyla.
 *   all: bütün hücreler, plan sırasıyla; her biri { ...hücre, done, parked }. `done` o konu + zorluktaki
 *        onaylı soru sayısıdır (hücrenin `quota` değerini aşmaz).
 *   allParked: geriye yalnızca atlananlar kaldıysa true (çağıran taraf park listesini temizleyip yeniden dener).
 */
export function planSnapshot({ contexts, items, quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES, parked = {} }) {
 const steps = buildPlanSteps(contexts, quota, passes);
 const counts = countApproved(items);
 const caps = PLAN_DIFFICULTIES.map((_, di) => bucketQuota(quota, passes, di));
 let totalDone = 0;
 for (const c of contexts) PLAN_DIFFICULTIES.forEach((d, di) => { totalDone += Math.min(caps[di], counts.get(stepKey(c.id, d)) || 0); });
 const parkedSteps = [];
 const parkedSeen = new Set();
 const queue = [];
 const all = [];
 for (const step of steps) {
  const done = Math.min(step.quota, counts.get(step.key) || 0);
  const isParked = Boolean(parked[step.key]) && done < step.quota;
  all.push({ ...step, done, parked: isParked });
  if (done >= step.quota) continue;
  if (isParked) {
   // Aynı (konu, zorluk) sonraki turlarda da atlanmış sayılır; listede bir kez gösterilir.
   if (!parkedSeen.has(step.key)) { parkedSeen.add(step.key); parkedSteps.push({ ...step, done }); }
   continue;
  }
  queue.push({ ...step, done });
 }
 const current = queue[0] || null;
 const totalTarget = contexts.length * quota * passes;
 const complete = totalDone >= totalTarget;
 return {
  current,
  queue,
  all,
  complete,
  allParked: !complete && !current && parkedSteps.length > 0,
  totalDone,
  totalTarget,
  parkedSteps,
  steps,
  counts
 };
}

/**
 * Şu an üzerinde çalışılan grup: konu uğrayışları `size`'lı gruplara bölünür (1.-2. konu, 3.-4. konu, …);
 * içinde açık (hedefine ulaşmamış ve atlanmamış) hücre bulunan İLK grubun açık hücreleri döner.
 * Grup bitmeden sıradaki gruba geçilmez.
 * @param all  planSnapshot().all
 */
export function planBatch(all, size = 1) {
 const n = Math.max(1, Math.floor(size) || 1);
 let group = null;
 let open = [];
 for (const step of all || []) {
  const g = Math.floor((step.visit ?? step.index ?? 0) / n);
  if (g !== group) {
   if (open.length) return open;
   group = g;
  }
  if (step.done < step.quota && !step.parked) open.push(step);
 }
 return open;
}

/**
 * Boşalan hat için iş seçer.
 *  1) Gruptaki konulardan, üzerinde en az hat çalışanı (iki konu aynı anda ilerler; biri bitince
 *     bütün hatlar eksik kalan konuya yardım eder).
 *  2) O konunun zorluklarından, bu turdaki payında en geride olanı (kolay → orta → zor → kolay … sırası).
 * Bir hücrede "tamamlanan + hazırlanmakta olan" soru sayısı hedefe ulaştıysa o hücreye yeni hat
 * verilmez (kota aşılmasın). Uygun hücre yoksa null (hat kısa süre bekler).
 * @param inflight  { [stepKey]: o konu + zorlukta şu an hazırlanan soru sayısı }
 */
export function pickPlanWork(all, size = 1, inflight = {}) {
 const batch = planBatch(all, size);
 const unitBusy = new Map();
 for (const step of batch) unitBusy.set(step.unitId, (unitBusy.get(step.unitId) || 0) + (inflight[step.key] || 0));
 let best = null;
 for (const step of batch) {
  const busy = inflight[step.key] || 0;
  if (step.done + busy >= step.quota) continue;
  const rank = [unitBusy.get(step.unitId) || 0, step.done - (step.from || 0) + busy, step.index ?? 0];
  if (!best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && (rank[1] < best.rank[1] || (rank[1] === best.rank[1] && rank[2] < best.rank[2])))) best = { step, rank };
 }
 return best ? best.step : null;
}

/**
 * Bir bölüm için sıradaki zorluk: toplam kotası dolmamış kovalardan doluluk oranı en düşük olan
 * (eşitlikte kolay → orta → zor). Hepsi doluysa null.
 */
export function planDifficultyForUnit(unitId, items, quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES) {
 const counts = countApproved(items);
 let best = null;
 PLAN_DIFFICULTIES.forEach((d, di) => {
  const cap = bucketQuota(quota, passes, di);
  const n = counts.get(stepKey(unitId, d)) || 0;
  if (cap <= 0 || n >= cap) return;
  const ratio = n / cap;
  if (!best || ratio < best.ratio) best = { d, ratio };
 });
 return best ? best.d : null;
}

/** Bir bölümün `difficulty` kovasında yer var mı? (Bütün turların toplam kotasına göre.) */
export function planBucketHasRoom(unitId, difficulty, items, quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES) {
 const di = PLAN_DIFFICULTIES.indexOf(difficulty);
 if (di < 0) return false;
 return (countApproved(items).get(stepKey(unitId, difficulty)) || 0) < bucketQuota(quota, passes, di);
}

/** Hakemlerin verdiği zorluk plana göre kaydedilebilir mi? (Hedefle aynıysa ya da o kova henüz dolmadıysa evet.) */
export function planAcceptsDifficulty(unitId, agreedDifficulty, targetDifficulty, items, quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES) {
 if (!PLAN_DIFFICULTIES.includes(agreedDifficulty)) return false;
 if (agreedDifficulty === targetDifficulty) return true;
 return planBucketHasRoom(unitId, agreedDifficulty, items, quota, passes);
}

/**
 * Üst üste sonuçsuz denemeleri ADIM BAŞINA sayar; sınır aşılınca adımı park eder.
 * (Aynı anda iki adım çalışırken birinin sonucu diğerinin sayacını etkilemez.)
 * state: { parked: {key: {at, failures, done}}, streaks: {key: sayı} } — JSON'a yazılabilir.
 * outcome: 'approved' (hedef kovaya soru girdi) | 'rejected' (soru elendi) | 'other' (sayılmaz)
 */
export function notePlanOutcome(state, step, outcome, { stuckLimit = DEFAULT_PLAN_STUCK_LIMIT, now = Date.now(), done = 0 } = {}) {
 const next = { parked: { ...(state?.parked || {}) }, streaks: { ...(state?.streaks || {}) } };
 if (!step?.key) return { state: next, parkedNow: false };
 if (outcome === 'approved') {
  delete next.streaks[step.key];
  return { state: next, parkedNow: false };
 }
 if (outcome !== 'rejected') return { state: next, parkedNow: false };
 const streak = (next.streaks[step.key] || 0) + 1;
 if (streak >= stuckLimit) {
  next.parked[step.key] = { at: new Date(now).toISOString(), failures: streak, done };
  delete next.streaks[step.key];
  return { state: next, parkedNow: true };
 }
 next.streaks[step.key] = streak;
 return { state: next, parkedNow: false };
}

/** Bozuk/eksik dosyadan okunan durumu güvenli biçime getirir; planda olmayan adımları atar. */
export function sanitizePlanState(raw, contexts) {
 const valid = new Set((contexts || []).flatMap(c => PLAN_DIFFICULTIES.map(d => stepKey(c.id, d))));
 const parked = {};
 if (raw && typeof raw.parked === 'object' && raw.parked) {
  for (const [key, value] of Object.entries(raw.parked)) if (valid.has(key)) parked[key] = value && typeof value === 'object' ? value : {};
 }
 const streaks = {};
 if (raw && typeof raw.streaks === 'object' && raw.streaks) {
  for (const [key, value] of Object.entries(raw.streaks)) if (valid.has(key) && Number.isFinite(value) && value > 0) streaks[key] = Math.floor(value);
 }
 return { parked, streaks };
}

// --- YALNIZCA ÖZETTEN SORU ---------------------------------------------------------

const normTr = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const tokens = s => normTr(s).split(' ').filter(t => t.length >= 3);

/** Konu özetini cümlelere böler (çok kısa parçalar atılır). */
export function splitSummarySentences(summary) {
 return String(summary || '')
  // Küçük harfle devam eden yerde cümle bitmez ("vb. gibi", "19. yüzyılda").
  .split(/(?<=[.!?])\s+(?![a-zçğıöşüâîû])/)
  .map(s => s.trim())
  .filter(s => s.length >= 25);
}

/**
 * Kanıt cümlesi konu ÖZETİNDE geçiyor mu? (Kitabın tam metni kabul edilmez.)
 * Birebir alt dize ya da kanıtın anlamlı kelimelerinin en az %85'i TEK bir özet cümlesi
 * (ve komşusu) içinde bulunmalı.
 */
export function evidenceWithinSummary(evidence, summary) {
 const ev = normTr(evidence);
 if (ev.length < 15) return { ok: false, reason: 'Kanıt cümlesi çok kısa.' };
 const full = normTr(summary);
 if (full.includes(ev)) return { ok: true, tier: 'exact' };
 const evTokens = tokens(evidence);
 if (evTokens.length < 3) return { ok: false, reason: 'Kanıt cümlesi konu özetinde bulunamadı.' };
 const sentences = splitSummarySentences(summary);
 for (let i = 0; i < sentences.length; i++) {
  const windowTokens = new Set(tokens(`${sentences[i]} ${sentences[i + 1] || ''}`));
  let hit = 0;
  for (const t of evTokens) if (windowTokens.has(t)) hit++;
  if (hit / evTokens.length >= 0.85) return { ok: true, tier: 'tokens' };
 }
 return { ok: false, reason: 'Kanıt cümlesi konu özetinde bulunamadı; soru yalnızca konu özetindeki bilgiden kurulabilir.' };
}

/**
 * İsteme konacak özet penceresi. Özet kitaptan genişletildiği için (konu başına ~100 cümle) modelin
 * bağlam penceresine tamamı sığmaz; soru yazarına ve hakemlere ilgili cümlenin (odak ya da kanıt
 * cümlesi) ÇEVRESİ verilir. Cümleler özetteki sırasıyla ve bölünmeden alınır.
 * Özet zaten `maxChars`'tan kısaysa olduğu gibi döner.
 * @param anchor  pencerenin ortalanacağı cümle (odak cümlesi ya da kanıt); boşsa özetin başı
 * @returns { text, windowed, start, end, center }  (start/end/center: cümle sırası)
 */
export function summaryWindow(summary, anchor = '', maxChars = 2400) {
 const full = String(summary || '');
 if (full.length <= maxChars) return { text: full, windowed: false, start: 0, end: -1, center: -1 };
 const sentences = splitSummarySentences(full);
 if (!sentences.length) return { text: full.slice(0, maxChars), windowed: true, start: 0, end: -1, center: -1 };
 let center = 0;
 let matched = false;
 const anchorNorm = normTr(anchor);
 const anchorTokens = tokens(anchor);
 if (anchorNorm.length >= 15) {
  // 1) birebir geçen cümle  2) kelimelerinin çoğu aynı olan cümle
  // Önce cümlenin kendisi; yoksa onu içeren (ya da onun içerdiği) cümle. (Kısa bir cümle, daha önce
  // geçen uzun bir cümlenin parçası olabilir; pencere yine de aranan cümlenin çevresine kurulmalı.)
  const norms = sentences.map(normTr);
  let exact = norms.indexOf(anchorNorm);
  if (exact < 0) exact = norms.findIndex(n => n.includes(anchorNorm) || anchorNorm.includes(n));
  if (exact >= 0) { center = exact; matched = true; }
  else if (anchorTokens.length >= 3) {
   let best = -1, bestRatio = 0;
   for (let i = 0; i < sentences.length; i++) {
    const set = new Set(tokens(sentences[i]));
    let hit = 0;
    for (const t of anchorTokens) if (set.has(t)) hit++;
    const ratio = hit / anchorTokens.length;
    if (ratio > bestRatio) { bestRatio = ratio; best = i; }
   }
   if (best >= 0 && bestRatio >= 0.5) { center = best; matched = true; }
  }
 }
 let lo = center, hi = center;
 let used = sentences[center].length;
 for (;;) {
  const canLo = lo > 0 && used + sentences[lo - 1].length + 1 <= maxChars;
  const canHi = hi < sentences.length - 1 && used + sentences[hi + 1].length + 1 <= maxChars;
  if (!canLo && !canHi) break;
  // İki yana dengeli genişle (önce sonraki cümle: kitap sırasında açıklama çoğu kez ardından gelir).
  if (canHi && (!canLo || hi - center <= center - lo)) { hi++; used += sentences[hi].length + 1; }
  else { lo--; used += sentences[lo].length + 1; }
 }
 return { text: sentences.slice(lo, hi + 1).join(' '), windowed: true, start: lo, end: hi, center: matched ? center : -1 };
}

/** Bir özet cümlesinin (odak ya da kanıt) `ctx.text` içindeki konumu; bulunamazsa -1. */
export function summaryPositionOf(ctx, sentence) {
 const text = String(ctx?.text || '');
 const wanted = String(sentence || '').trim();
 if (wanted.length < 15) return -1;
 let pos = text.indexOf(wanted);
 if (pos < 0) {
  // Model kanıtı küçük farklarla kopyalamış olabilir: en çok örtüşen özet cümlesine bakılır.
  const win = summaryWindow(text, wanted, 1);
  if (win.center < 0) return -1;
  pos = text.indexOf(splitSummarySentences(text)[win.center]);
 }
 return pos;
}

const markAt = (marks, pos) => {
 let value = null;
 for (const [offset, v] of Array.isArray(marks) ? marks : []) {
  if (offset > pos) break;
  value = v;
 }
 return value;
};
const inWebPart = (ctx, pos) => Number.isInteger(ctx?.webStart) && pos >= ctx.webStart;

/**
 * Bir özet cümlesinin (odak ya da kanıt) kitaptaki sayfası. Özetin kitaptan alınan bölümleri
 * `ctx.pageMarks` ([metin konumu, sayfa]) ile işaretlidir. Cümle elle yazılmış bölümdeyse, internetten
 * derlenen ek anlatımdaysa ya da özette bulunamazsa null döner.
 */
export function summaryPageOf(ctx, sentence) {
 if (!Array.isArray(ctx?.pageMarks) || !ctx.pageMarks.length) return null;
 const pos = summaryPositionOf(ctx, sentence);
 if (pos < 0 || inWebPart(ctx, pos)) return null;
 const page = markAt(ctx.pageMarks, pos);
 return Number.isInteger(page) ? page : null;
}

/**
 * Cümlenin kitabın "İçindekiler"ine göre konu başlığı: { index, title, level, parent } — parent, alt
 * konunun ana konu başlığıdır (yoksa ''). Kitaptan alınmayan cümlelerde null.
 */
export function summarySectionOf(ctx, sentence) {
 if (!Array.isArray(ctx?.sectionMarks) || !ctx.sectionMarks.length || !Array.isArray(ctx?.sections)) return null;
 const pos = summaryPositionOf(ctx, sentence);
 if (pos < 0 || inWebPart(ctx, pos)) return null;
 const index = markAt(ctx.sectionMarks, pos);
 const section = Number.isInteger(index) ? ctx.sections[index] : null;
 if (!section) return null;
 // Ana konu: düzey 2'ye kadar yukarı çıkılır.
 let top = section;
 for (let guard = 0; guard < 4 && top && top.level > 2 && Number.isInteger(top.parent); guard++) top = ctx.sections[top.parent];
 return { index, title: section.title, level: section.level, parent: top && top !== section ? top.title : '' };
}

/** Cümle internetten derlenen ek anlatımdaysa kaynağı: { topic, title, url }; değilse null. */
export function summaryWebSourceOf(ctx, sentence) {
 if (!Number.isInteger(ctx?.webStart) || !Array.isArray(ctx?.webMarks)) return null;
 const pos = summaryPositionOf(ctx, sentence);
 if (pos < 0 || !inWebPart(ctx, pos)) return null;
 const index = markAt(ctx.webMarks, pos);
 const source = Number.isInteger(index) ? ctx.webSources?.[index] : null;
 return source ? { topic: source.topic || '', title: source.title || '', url: source.url || '', ...(source.kind ? { kind: source.kind } : {}) } : null;
}

/**
 * `options` içinden, `used` listesinde en az geçen seçeneği döndürür; eşitlikte `rotation` ile döner.
 * (Aynı cümleden yazılan sorularda soru tipi ve açısı tekrar etmesin diye kullanılır.)
 */
export function leastUsedOption(options, used = [], rotation = 0) {
 if (!Array.isArray(options) || !options.length) return null;
 const counts = new Map(options.map(o => [o, 0]));
 for (const u of used) if (counts.has(u)) counts.set(u, counts.get(u) + 1);
 const min = Math.min(...counts.values());
 const pool = options.filter(o => counts.get(o) === min);
 return pool[((rotation % pool.length) + pool.length) % pool.length];
}

/**
 * Özetin en az soru sorulmuş cümlesini seçer (aynı cümleye yığılmayı önler; kısa özetten
 * çok sayıda farklı soru çıkarmanın tek yolu cümleleri sırayla dolaşmaktır).
 * @param rotation  aynı kullanım sayısındaki cümleler arasında dönmek için sayaç (ör. deneme sayısı)
 */
export function pickFocusSentence(summary, unitItems = [], rotation = 0) {
 const sentences = splitSummarySentences(summary);
 if (!sentences.length) return null;
 const sentenceTokens = sentences.map(s => new Set(tokens(s)));
 const usage = sentences.map(() => 0);
 const askedBy = new Map();
 for (const it of unitItems) {
  const evTokens = tokens(it?.evidence || '');
  if (evTokens.length < 3) continue;
  let best = -1, bestRatio = 0;
  for (let i = 0; i < sentences.length; i++) {
   let hit = 0;
   for (const t of evTokens) if (sentenceTokens[i].has(t)) hit++;
   const ratio = hit / evTokens.length;
   if (ratio > bestRatio) { bestRatio = ratio; best = i; }
  }
  if (best >= 0 && bestRatio >= 0.6) {
   usage[best]++;
   if (!askedBy.has(best)) askedBy.set(best, []);
   askedBy.get(best).push(it);
  }
 }
 const min = Math.min(...usage);
 let candidates = usage.map((u, i) => ({ u, i })).filter(x => x.u === min).map(x => x.i);
 // Tek aday kaldıysa bir sonraki en az kullanılan cümle de havuza katılır: aynı konuda aynı anda
 // hazırlanan iki soru (ve art arda denemeler) aynı cümleye yığılmasın.
 if (candidates.length < 2 && sentences.length >= 2) {
  const rest = usage.map((u, i) => ({ u, i })).filter(x => x.i !== candidates[0]).sort((a, b) => a.u - b.u || a.i - b.i);
  candidates = [candidates[0], rest[0].i];
 }
 // Uzun özetlerde eşit kullanılan cümleler baştan sona sırayla değil, özete YAYILARAK seçilir;
 // yoksa 1. tur (kolay) hep özetin başından, 2. tur (orta) hep sonundan soru çıkarırdı.
 if (sentences.length > 30 && candidates.length > 2) {
  const n = sentences.length;
  let stride = Math.max(1, Math.round(n * 0.618));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  while (gcd(stride, n) !== 1) stride++;
  const rank = new Map();
  for (let k = 0; k < n; k++) rank.set((k * stride) % n, k);
  candidates.sort((a, b) => rank.get(a) - rank.get(b));
 }
 const index = candidates[((rotation % candidates.length) + candidates.length) % candidates.length];
 // asked: bu cümleden daha önce yazılmış sorular (aynı bilgi bu kez FARKLI bir soru biçimiyle sorulsun diye).
 return { index, sentence: sentences[index], usage: usage[index], total: sentences.length, asked: askedBy.get(index) || [] };
}

/** Arayüz ve terminal için tek satırlık adım açıklaması. */
export function describeStep(step) {
 if (!step) return '';
 return `${step.pass}. tur · ${step.bookNo}. kitap ${step.unitNo}. bölüm — ${step.unit} · ${step.difficulty}`;
}
