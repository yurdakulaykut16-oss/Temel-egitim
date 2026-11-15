// ÜRETİM PLANI
// ---------------------------------------------------------------------------
// Soru üretimi rastgele ünite dolaşmaz; sabit bir sırayı izler. Her konuya üç kez uğranır ve her
// uğrayışta o konuya 50 soru yazılır; zorluklar KARIŞIKTIR (kolay → orta → zor → kolay → …):
//
//   1. tur: 1. kitabın 1. konusu 17 kolay + 17 orta + 16 zor → 2. konu → … → son kitabın son konusu
//   2. tur: aynı sıra, her konuya 16 kolay + 17 orta + 17 zor
//   3. tur: aynı sıra, her konuya 17 kolay + 16 orta + 17 zor
//
// Üç tur sonunda her konuda 50 kolay + 50 orta + 50 zor soru olur. Böylece ilk turdan itibaren
// her konunun kolay, orta ve zor sorusu vardır ("önce bütün konuların kolayı" beklenmez).
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
  stuckLimit: clampInt(env.TEMPO_PLAN_STUCK_LIMIT, DEFAULT_PLAN_STUCK_LIMIT, 2, 1000)
 };
}

/**
 * `pass`. turda (1-3) bir konunun `difficultyIndex` zorluğuna (0 kolay, 1 orta, 2 zor) düşen soru payı.
 * Üç turun toplamı her zorlukta tam `quota` eder; her turun toplamı da `quota`dır (50 → 17+17+16).
 */
export function passShare(quota, pass, difficultyIndex) {
 const base = Math.floor(quota / 3);
 const rest = quota % 3;
 return base + ((((difficultyIndex - (pass - 1)) % 3) + 3) % 3 < rest ? 1 : 0);
}

/** Sıralı hücre listesi: tur → konu (contexts sırası: kitap → konu) → zorluk. Payı 0 olan hücre yoktur. */
export function buildPlanSteps(contexts, quota = DEFAULT_PLAN_QUOTA) {
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
 for (let pass = 1; pass <= PLAN_DIFFICULTIES.length; pass++) {
  contexts.forEach((c, unitIndex) => {
   PLAN_DIFFICULTIES.forEach((difficulty, di) => {
    const share = passShare(quota, pass, di);
    if (share <= 0) return;
    let from = 0;
    for (let p = 1; p < pass; p++) from += passShare(quota, p, di);
    steps.push({
     index: steps.length,
     key: stepKey(c.id, difficulty),
     pass,
     visit: (pass - 1) * contexts.length + unitIndex,
     unitId: c.id,
     difficulty,
     from,
     share,
     quota: from + share,
     book: c.book,
     unit: c.unit,
     bookNo: bookOrder.indexOf(c.book) + 1,
     unitNo: unitNoInBook.get(c.id)
    });
   });
  });
 }
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
export function planSnapshot({ contexts, items, quota = DEFAULT_PLAN_QUOTA, parked = {} }) {
 const steps = buildPlanSteps(contexts, quota);
 const counts = countApproved(items);
 let totalDone = 0;
 for (const c of contexts) for (const d of PLAN_DIFFICULTIES) totalDone += Math.min(quota, counts.get(stepKey(c.id, d)) || 0);
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
 const totalTarget = contexts.length * PLAN_DIFFICULTIES.length * quota;
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
 * Bir konu için sıradaki zorluk: kotası dolmamış kovalardan en az sorusu olan (eşitlikte kolay → orta → zor).
 * Hepsi doluysa null.
 */
export function planDifficultyForUnit(unitId, items, quota = DEFAULT_PLAN_QUOTA) {
 const counts = countApproved(items);
 let best = null;
 for (const d of PLAN_DIFFICULTIES) {
  const n = counts.get(stepKey(unitId, d)) || 0;
  if (n >= quota) continue;
  if (!best || n < best.n) best = { d, n };
 }
 return best ? best.d : null;
}

/** Hakemlerin verdiği zorluk plana göre kaydedilebilir mi? (Hedefle aynıysa ya da o kova henüz dolmadıysa evet.) */
export function planAcceptsDifficulty(unitId, agreedDifficulty, targetDifficulty, items, quota = DEFAULT_PLAN_QUOTA) {
 if (!PLAN_DIFFICULTIES.includes(agreedDifficulty)) return false;
 if (agreedDifficulty === targetDifficulty) return true;
 return (countApproved(items).get(stepKey(unitId, agreedDifficulty)) || 0) < quota;
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
 const valid = new Set(buildPlanSteps(contexts, 1).map(s => s.key));
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
  const exact = sentences.findIndex(s => { const n = normTr(s); return n.includes(anchorNorm) || anchorNorm.includes(n); });
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

/**
 * Bir özet cümlesinin (odak ya da kanıt) kitaptaki sayfası. Özetin kitaptan alınan bölümleri
 * `ctx.pageMarks` ([metin konumu, sayfa]) ile işaretlidir. Cümle elle yazılmış bölümdeyse ya da
 * özette bulunamazsa null döner.
 */
export function summaryPageOf(ctx, sentence) {
 const marks = Array.isArray(ctx?.pageMarks) ? ctx.pageMarks : [];
 const text = String(ctx?.text || '');
 const wanted = String(sentence || '').trim();
 if (!marks.length || wanted.length < 15) return null;
 let pos = text.indexOf(wanted);
 if (pos < 0) {
  // Model kanıtı küçük farklarla kopyalamış olabilir: en çok örtüşen özet cümlesine bakılır.
  const win = summaryWindow(text, wanted, 1);
  if (win.center < 0) return null;
  pos = text.indexOf(splitSummarySentences(text)[win.center]);
  if (pos < 0) return null;
 }
 let page = null;
 for (const [offset, p] of marks) {
  if (offset > pos) break;
  page = p;
 }
 return Number.isInteger(page) ? page : null;
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
  if (best >= 0 && bestRatio >= 0.6) usage[best]++;
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
 return { index, sentence: sentences[index], usage: usage[index], total: sentences.length };
}

/** Arayüz ve terminal için tek satırlık adım açıklaması. */
export function describeStep(step) {
 if (!step) return '';
 return `${step.pass}. tur · ${step.bookNo}. kitap ${step.unitNo}. konu — ${step.unit} · ${step.difficulty}`;
}
