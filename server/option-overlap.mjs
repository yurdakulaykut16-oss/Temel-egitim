import {MIN_OPTION_COUNT} from './option-count.mjs';
const norm = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const cache = new WeakMap();
function features(options) {
 const cached = cache.get(options);
 let unchanged = cached && cached.original.length === options.length;
 if (unchanged) for (let i = 0; i < options.length; i++) {
  if (cached.original[i] !== options[i] || (i in cached.original) !== (i in options)) { unchanged = false; break; }
 }
 if (unchanged) return cached;
 const result = {
  original: options.slice(),
  // Sol kümenin map, sağ listenin for-of davranışı aynen korunur.
  set: new Set(options.map(norm)),
  list: Array.from(options, norm)
 };
 cache.set(options, result);
 return result;
}

/** Önceki örtüşme formülü/eşikleri değişmez; değişmeyen seçenekler tekrar işlenmez. */
export function optionOverlapRatio(a, b) {
 const listA = Array.isArray(a?.options) ? a.options : [];
 const listB = Array.isArray(b?.options) ? b.options : [];
 if (!listA.length || !listB.length) return 0;
 const setA = features(listA).set;
 let inter = 0;
 for (const o of features(listB).list) if (setA.has(o)) inter++;
 return inter / Math.max(MIN_OPTION_COUNT, listA.length, listB.length);
}
