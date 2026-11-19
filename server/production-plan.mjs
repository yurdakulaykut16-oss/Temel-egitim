// ÜRETİM PLANI
// ---------------------------------------------------------------------------
// Üniteler sırayla tamamlanır. Her ünite için 4 turda 50 soru üretilerek 200'e ulaşılır;
// bir sonraki üniteye ancak mevcut ünite kotası dolunca geçilir.
// Eşzamanlı soru görevleri aynı ünite üzerinde çalışır. Zorluk sınıflandırması yapılmaz.
//
// Bu dosya saf planlama / metin yardımcılarından oluşur (dosya/ağ erişimi yok).

export const DEFAULT_PLAN_QUOTA = 50;
export const DEFAULT_PLAN_PASSES = 4;
export const DEFAULT_PLAN_STUCK_LIMIT = 25;
export const stepKey = (unitId, pass = null) => `${unitId}|${pass === null ? 'all' : `pass:${pass}`}`;

const clampInt = (value, fallback, min, max) => {
 const n = Number.parseInt(String(value ?? ''), 10);
 return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function planConfigFromEnv(env = process.env) {
 return {
  enabled: env.TEMPO_PLAN !== '0',
  quota: clampInt(env.TEMPO_PLAN_QUOTA, DEFAULT_PLAN_QUOTA, 1, 1000),
  passes: clampInt(env.TEMPO_PLAN_PASSES, DEFAULT_PLAN_PASSES, 1, 200),
  stuckLimit: clampInt(env.TEMPO_PLAN_STUCK_LIMIT, DEFAULT_PLAN_STUCK_LIMIT, 2, 1000)
 };
}

const stepCache = new WeakMap();
export function buildPlanSteps(contexts, quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES) {
 const cacheKey = `${quota}|${passes}`;
 const cached = stepCache.get(contexts);
 if (cached?.key === cacheKey) return cached.steps;
 const books = [];
 for (const c of contexts) if (!books.includes(c.book)) books.push(c.book);
 const unitNo = new Map();
 const seen = new Map();
 for (const c of contexts) {
  const n = (seen.get(c.book) || 0) + 1;
  seen.set(c.book, n);
  unitNo.set(c.id, n);
 }
 const steps = [];
 contexts.forEach((c, visit) => {
  for (let pass = 1; pass <= passes; pass++) {
   const from = (pass - 1) * quota;
   steps.push({
    index: steps.length, key: stepKey(c.id, pass), pass, visit, unitId: c.id,
    from, share: quota, quota: from + quota,
    book: c.book, unit: c.unit, bookNo: books.indexOf(c.book) + 1, unitNo: unitNo.get(c.id)
   });
  }
 });
 if (contexts && typeof contexts === 'object') stepCache.set(contexts, { key: cacheKey, steps });
 return steps;
}

export function countApproved(items) {
 const counts = new Map();
 for (const it of items || []) {
  if (!it || it.status !== 'approved' || !it.unitId) continue;
  const key = stepKey(it.unitId);
  counts.set(key, (counts.get(key) || 0) + 1);
 }
 return counts;
}

export function planSnapshot({ contexts, items, quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES, parked = {} }) {
 const steps = buildPlanSteps(contexts, quota, passes);
 const counts = countApproved(items);
 let totalDone = 0;
 for (const c of contexts) totalDone += Math.min(quota * passes, counts.get(stepKey(c.id)) || 0);
 const parkedSteps = [];
 const all = steps.map(step => {
  const done = Math.min(step.quota, counts.get(stepKey(step.unitId)) || 0);
  const isParked = Boolean(parked[step.key]) && done < step.quota;
  if (isParked) parkedSteps.push({ ...step, done });
  return { ...step, done, parked: isParked };
 });
 // Strict unit-first rule: parking a stalled pass may not let production enter a later unit.
 // Work through the active unit's other passes, then retry its first parked pass before advancing.
 const activeUnit = contexts.find(context => (counts.get(stepKey(context.id)) || 0) < quota * passes)?.id;
 let queue = activeUnit ? all.filter(step => step.unitId === activeUnit && step.done < step.quota && !step.parked) : [];
 if (activeUnit && queue.length === 0) {
  const retry = all.find(step => step.unitId === activeUnit && step.done < step.quota && step.parked);
  if (retry) {
   retry.parked = false;
   queue = [retry];
  }
 }
 const current = queue[0] || null;
 const totalTarget = contexts.length * quota * passes;
 const complete = totalDone >= totalTarget;
 return { current, queue, all, complete, allParked: !complete && !current && parkedSteps.length > 0, totalDone, totalTarget, parkedSteps, steps, counts };
}

export function planBatch(all, _size = 1) {
 const open = (all || []).filter(step => step.done < step.quota && !step.parked);
 if (!open.length) return [];
 const first = open[0];
 return open.filter(step => step.unitId === first.unitId && step.pass === first.pass);
}

export function pickPlanWork(all, _size = 1, inflight = {}) {
 const batch = planBatch(all);
 const step = batch.find(s => s.done + (inflight[s.key] || 0) < s.quota);
 return step || null;
}

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

export function sanitizePlanState(state, contexts, quota = DEFAULT_PLAN_QUOTA, passes = DEFAULT_PLAN_PASSES) {
 const valid = new Set(buildPlanSteps(contexts || [], quota, passes).map(step => step.key));
 const parked = {};
 const streaks = {};
 for (const [key, value] of Object.entries(state?.parked || {})) if (valid.has(key)) parked[key] = value;
 for (const [key, value] of Object.entries(state?.streaks || {})) if (valid.has(key) && Number.isFinite(value)) streaks[key] = Math.max(0, Math.floor(value));
 return { parked, streaks };
}

const normTr = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = value => normTr(value).split(/\s+/).filter(Boolean);
export function splitSummarySentences(summary) {
 return String(summary || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || [];
}
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

export function summaryWindow(summary, anchor = '', maxChars = 2400) {
 const full = String(summary || '');
 if (full.length <= maxChars) return { text: full, windowed: false, start: 0, end: -1, center: -1 };
 const sentences = splitSummarySentences(full);
 if (!sentences.length) return { text: full.slice(0, maxChars), windowed: true, start: 0, end: -1, center: -1 };
 let center = 0, matched = false;
 const anchorNorm = normTr(anchor), anchorTokens = tokens(anchor);
 if (anchorNorm.length >= 15) {
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
 let lo = center, hi = center, used = sentences[center].length;
 for (;;) {
  const canLo = lo > 0 && used + sentences[lo - 1].length + 1 <= maxChars;
  const canHi = hi < sentences.length - 1 && used + sentences[hi + 1].length + 1 <= maxChars;
  if (!canLo && !canHi) break;
  if (canHi && (!canLo || hi - center <= center - lo)) { hi++; used += sentences[hi].length + 1; }
  else { lo--; used += sentences[lo].length + 1; }
 }
 return { text: sentences.slice(lo, hi + 1).join(' '), windowed: true, start: lo, end: hi, center: matched ? center : -1 };
}
export function summaryPositionOf(ctx, sentence) {
 const text = String(ctx?.text || ''), wanted = String(sentence || '').trim();
 if (wanted.length < 15) return -1;
 let pos = text.indexOf(wanted);
 if (pos < 0) {
  const win = summaryWindow(text, wanted, 1);
  if (win.center < 0) return -1;
  pos = text.indexOf(splitSummarySentences(text)[win.center]);
 }
 return pos;
}
const markAt = (marks, pos) => {
 let value = null;
 for (const [offset, v] of Array.isArray(marks) ? marks : []) { if (offset > pos) break; value = v; }
 return value;
};
const inWebPart = (ctx, pos) => Number.isInteger(ctx?.webStart) && pos >= ctx.webStart;
export function summaryPageOf(ctx, sentence) {
 if (!Array.isArray(ctx?.pageMarks) || !ctx.pageMarks.length) return null;
 const pos = summaryPositionOf(ctx, sentence);
 if (pos < 0 || inWebPart(ctx, pos)) return null;
 const page = markAt(ctx.pageMarks, pos);
 return Number.isInteger(page) ? page : null;
}
export function summarySectionOf(ctx, sentence) {
 if (!Array.isArray(ctx?.sectionMarks) || !ctx.sectionMarks.length || !Array.isArray(ctx?.sections)) return null;
 const pos = summaryPositionOf(ctx, sentence);
 if (pos < 0 || inWebPart(ctx, pos)) return null;
 const index = markAt(ctx.sectionMarks, pos);
 const section = Number.isInteger(index) ? ctx.sections[index] : null;
 if (!section) return null;
 let top = section;
 for (let guard = 0; guard < 4 && top && top.level > 2 && Number.isInteger(top.parent); guard++) top = ctx.sections[top.parent];
 return { index, title: section.title, level: section.level, parent: top && top !== section ? top.title : '' };
}
export function summaryWebSourceOf(ctx, sentence) {
 if (!Number.isInteger(ctx?.webStart) || !Array.isArray(ctx?.webMarks)) return null;
 const pos = summaryPositionOf(ctx, sentence);
 if (pos < 0 || !inWebPart(ctx, pos)) return null;
 const index = markAt(ctx.webMarks, pos);
 const source = Number.isInteger(index) ? ctx.webSources?.[index] : null;
 return source ? { topic: source.topic || '', title: source.title || '', url: source.url || '', ...(source.kind ? { kind: source.kind } : {}) } : null;
}
export function leastUsedOption(options, used = [], rotation = 0) {
 if (!Array.isArray(options) || !options.length) return null;
 const counts = new Map(options.map(o => [o, 0]));
 for (const u of used) if (counts.has(u)) counts.set(u, counts.get(u) + 1);
 const min = Math.min(...counts.values());
 const pool = options.filter(o => counts.get(o) === min);
 return pool[((rotation % pool.length) + pool.length) % pool.length];
}
export function pickFocusSentence(summary, unitItems = [], rotation = 0) {
 const sentences = splitSummarySentences(summary);
 if (!sentences.length) return null;
 const sentenceTokens = sentences.map(s => new Set(tokens(s))), usage = sentences.map(() => 0), askedBy = new Map();
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
  if (best >= 0 && bestRatio >= 0.6) { usage[best]++; if (!askedBy.has(best)) askedBy.set(best, []); askedBy.get(best).push(it); }
 }
 const min = Math.min(...usage);
 let candidates = usage.map((u, i) => ({ u, i })).filter(x => x.u === min).map(x => x.i);
 if (candidates.length < 2 && sentences.length >= 2) {
  const rest = usage.map((u, i) => ({ u, i })).filter(x => x.i !== candidates[0]).sort((a, b) => a.u - b.u || a.i - b.i);
  candidates = [candidates[0], rest[0].i];
 }
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
 return { index, sentence: sentences[index], usage: usage[index], total: sentences.length, asked: askedBy.get(index) || [] };
}
export function describeStep(step) {
 if (!step) return '';
 return `${step.pass}. tur · ${step.bookNo}. kitap ${step.unitNo}. bölüm — ${step.unit} · ${step.quota} soru`;
}
