// Aynı benzerlik formülü ve eşikler; yalnızca saf metin özellikleri önbelleğe alınır.
// Anahtar metnin kendisidir: soru düzenlendiğinde eski sonuç kullanılamaz.
const LIMIT = 24000;
const MAX_CHARS = 1200;
const cache = new Map();
const norm = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const STOPWORDS = new Set(['bir', 've', 'ile', 'için', 'gibi', 'olan', 'hangisidir', 'hangisi', 'nedir', 'aşağıdakilerden', 'yukarıdakilerden', 'göre', 'daha', 'olarak', 'kadar', 'ancak', 'fakat', 'veya', 'ya', 'da', 'de', 'bu', 'şu', 'o', 'her', 'tüm', 'en']);
function stemTokens(text) {
 return norm(text)
  .split(' ')
  .filter(w => (/\d/.test(w) || w.length >= 2) && !STOPWORDS.has(w))
  .map(w => (/\d/.test(w) ? w : w.length > 6 ? w.slice(0, 6) : w));
}
function features(text) {
 const key = typeof text === 'string' ? text : '';
 if (cache.has(key)) return cache.get(key);
 const tokens = stemTokens(key);
 const result = {
  length: tokens.length,
  words: new Set(tokens),
  pairs: new Set(tokens.slice(0, -1).map((w, i) => `${w}_${tokens[i + 1]}`))
 };
 if (key.length <= MAX_CHARS) {
  if (cache.size >= LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, result);
 }
 return result;
}
export function similarity(a, b) {
 const aa = features(a), bb = features(b);
 if (!aa.words.size || !bb.words.size) return 0;
 let inter = 0;
 for (const w of aa.words) if (bb.words.has(w)) inter++;
 const uniSim = inter / Math.max(aa.words.size, bb.words.size);
 if (aa.length >= 3 && bb.length >= 3) {
  let biInter = 0;
  for (const bg of aa.pairs) if (bb.pairs.has(bg)) biInter++;
  return Math.max(uniSim, biInter / Math.max(aa.pairs.size, bb.pairs.size) * 1.15);
 }
 return uniSim;
}
