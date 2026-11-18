// Salt metinden türetilen kaynak özellikleri. Anahtar özettir, konu kimliği değil:
// kitap/özet güncellendiğinde eski indeks kullanılamaz. Model cevabı veya kararı saklanmaz.
const MAX_ENTRIES = 64;
const MAX_SOURCE_CHARS = 2_000_000;
const MAX_SINGLE_SOURCE_CHARS = 200_000;
const cache = new Map();
let sourceChars = 0;
const norm = s => s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const tokens = s => norm(s).split(' ').filter(t => t.length >= 3);

export function getSummaryIndex(summary) {
 const full = String(summary || '');
 const cached = cache.get(full);
 if (cached) return cached;
 const sentences = full.split(/(?<=[.!?])\s+(?![a-zçğıöşüâîû])/).map(s => s.trim()).filter(s => s.length >= 25);
 const result = {
  sentences,
  normalized: norm(full),
  norms: sentences.map(norm),
  tokenSets: sentences.map(s => new Set(tokens(s))),
  // Aynı eski birleştirme/tokenleştirme kuralı korunur; kanıt eşiği değişmez.
  neighborTokenSets: sentences.map((s, i) => new Set(tokens(`${s} ${sentences[i + 1] || ''}`)))
 };
 if (full.length <= MAX_SINGLE_SOURCE_CHARS) {
  while (cache.size >= MAX_ENTRIES || sourceChars + full.length > MAX_SOURCE_CHARS) {
   const oldest = cache.keys().next().value;
   cache.delete(oldest);
   sourceChars -= oldest.length;
  }
  cache.set(full, result);
  sourceChars += full.length;
 }
 return result;
}
