// ÜRETİM PLANI
// ---------------------------------------------------------------------------
// Soru üretimi rastgele ünite dolaşmaz; sabit bir sırayı izler:
//
//   1. tur (KOLAY): 1. kitabın 1. konusuna 50 soru → 2. konusuna 50 → … → son kitabın son konusu
//   2. tur (ORTA) : aynı sıra, her konuya 50 soru
//   3. tur (ZOR)  : aynı sıra, her konuya 50 soru
//
// Aynı anda birden çok soru hazırlanıyorsa (varsayılan 2) adımlar N'li GRUPLAR hâlinde işlenir:
// ör. 1. ve 2. konu birlikte başlar; biri 50'ye ulaşınca boşalan hat 3. konuya GEÇMEZ, eksik kalan
// konuya yardım eder. Gruptaki bütün konular 50'ye ulaşınca (ya da atlanınca) sıradaki grup başlar.
// Böylece hiçbir konu yarım bırakılıp ilerlenmez.
//
// Bir adım (konu + zorluk) kotası dolmadan o yuva sıradaki adıma geçmez. Konu özeti kısa olduğu
// için kota dolmayabilir: üst üste çok sayıda deneme sonuç vermezse adım "atlanır" (park
// edilir) ve sıradakine geçilir; tüm adımlar bittiğinde atlananlar yeniden denenir.
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

/** Sıralı adım listesi: önce zorluk turu, tur içinde contexts sırası (kitap → konu). */
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
 PLAN_DIFFICULTIES.forEach((difficulty, passIndex) => {
  for (const c of contexts) {
   steps.push({
    index: steps.length,
    key: stepKey(c.id, difficulty),
    pass: passIndex + 1,
    unitId: c.id,
    difficulty,
    quota,
    book: c.book,
    unit: c.unit,
    bookNo: bookOrder.indexOf(c.book) + 1,
    unitNo: unitNoInBook.get(c.id)
   });
  }
 });
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
 * @param parked  { [stepKey]: {...} } — atlanan adımlar
 * @returns { current, queue, all, complete, allParked, totalDone, totalTarget, parkedSteps, steps, counts }
 *   current: sıradaki (kotası dolmamış ve atlanmamış) ilk adım; yoksa null.
 *   queue: kotası dolmamış ve atlanmamış bütün adımlar, plan sırasıyla.
 *   all: bütün adımlar, plan sırasıyla; her biri { ...adım, done, parked }.
 *   allParked: geriye yalnızca atlanan adımlar kaldıysa true (çağıran taraf park listesini temizleyip yeniden dener).
 */
export function planSnapshot({ contexts, items, quota = DEFAULT_PLAN_QUOTA, parked = {} }) {
 const steps = buildPlanSteps(contexts, quota);
 const counts = countApproved(items);
 let totalDone = 0;
 const parkedSteps = [];
 const queue = [];
 const all = [];
 for (const step of steps) {
  const done = Math.min(quota, counts.get(step.key) || 0);
  totalDone += done;
  all.push({ ...step, done, parked: Boolean(parked[step.key]) && done < quota });
  if (done >= quota) continue;
  if (parked[step.key]) { parkedSteps.push({ ...step, done }); continue; }
  queue.push({ ...step, done });
 }
 const current = queue[0] || null;
 const totalTarget = steps.length * quota;
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
 * Şu an üzerinde çalışılan grup: plan sırası `size`'lı gruplara bölünür (1-2, 3-4, …); içinde
 * kotası dolmamış ve atlanmamış adım bulunan İLK grubun açık adımları döner. Grup bitmeden
 * sıradaki gruba geçilmez.
 * @param all  planSnapshot().all
 */
export function planBatch(all, size = 1) {
 const n = Math.max(1, Math.floor(size) || 1);
 for (let i = 0; i < (all || []).length; i += n) {
  const open = all.slice(i, i + n).filter(step => step.done < step.quota && !step.parked);
  if (open.length) return open;
 }
 return [];
}

/**
 * Boşalan hat için iş seçer: gruptaki açık adımlardan, üzerinde en az hat çalışanı (eşitlikte
 * plan sırasıyla ilki). Bir adımda "tamamlanan + hazırlanmakta olan" soru sayısı kotaya ulaştıysa
 * o adıma yeni hat verilmez (kota aşılmasın). Uygun adım yoksa null (hat kısa süre bekler).
 * @param inflight  { [stepKey]: o adımda şu an hazırlanan soru sayısı }
 */
export function pickPlanWork(all, size = 1, inflight = {}) {
 let best = null;
 for (const step of planBatch(all, size)) {
  const busy = inflight[step.key] || 0;
  if (step.done + busy >= step.quota) continue;
  if (!best || busy < best.busy) best = { step, busy };
 }
 return best ? best.step : null;
}

/** Bir konu için plan sırasına göre sıradaki zorluk: kotası dolmamış ilk kova (hepsi doluysa null). */
export function planDifficultyForUnit(unitId, items, quota = DEFAULT_PLAN_QUOTA) {
 const counts = countApproved(items);
 for (const d of PLAN_DIFFICULTIES) if ((counts.get(stepKey(unitId, d)) || 0) < quota) return d;
 return null;
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
  .split(/(?<=[.!?])\s+/)
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
 const index = candidates[((rotation % candidates.length) + candidates.length) % candidates.length];
 return { index, sentence: sentences[index], usage: usage[index], total: sentences.length };
}

/** Arayüz ve terminal için tek satırlık adım açıklaması. */
export function describeStep(step) {
 if (!step) return '';
 return `${step.pass}. tur (${step.difficulty}) · ${step.bookNo}. kitap ${step.unitNo}. konu — ${step.unit}`;
}
