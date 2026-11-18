import test from 'node:test';
import assert from 'node:assert/strict';
import { similarity } from '../server/stem-similarity.mjs';

// PR #13'teki önbelleksiz algoritma: kararları birebir koruduğumuzu doğrular.
const stop = new Set(['bir', 've', 'ile', 'için', 'gibi', 'olan', 'hangisidir', 'hangisi', 'nedir', 'aşağıdakilerden', 'yukarıdakilerden', 'göre', 'daha', 'olarak', 'kadar', 'ancak', 'fakat', 'veya', 'ya', 'da', 'de', 'bu', 'şu', 'o', 'her', 'tüm', 'en']);
const tokens = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ').split(' ').filter(w => (/\d/.test(w) || w.length >= 2) && !stop.has(w)).map(w => /\d/.test(w) ? w : w.length > 6 ? w.slice(0, 6) : w);
function reference(a, b) {
 const ta = tokens(a), tb = tokens(b), aa = new Set(ta), bb = new Set(tb);
 if (!aa.size || !bb.size) return 0;
 let inter = 0;
 for (const w of aa) if (bb.has(w)) inter++;
 const uni = inter / Math.max(aa.size, bb.size);
 if (ta.length < 3 || tb.length < 3) return uni;
 const ba = new Set(ta.slice(0, -1).map((w, i) => `${w}_${ta[i + 1]}`));
 const bc = new Set(tb.slice(0, -1).map((w, i) => `${w}_${tb[i + 1]}`));
 let n = 0;
 for (const w of ba) if (bc.has(w)) n++;
 return Math.max(uni, n / Math.max(ba.size, bc.size) * 1.15);
}
test('önbellek benzerlik skorunu ve tekrar eşiklerini değiştirmez', () => {
 const words = ['İlke', 'yüklenme', '30', '20', 'saniye', 'antrenmanın', 've', 'ile', 'için', 'şiddet', 'süreklilik', 'ÖZGÜL', 'aynı', 'aynı', 'kuvvet'];
 const cases = ['', null, undefined, 'İ İ ı I', '20 dakika / 30 dakika', 'a b c', 've ile bir', 'uzun '.repeat(300)];
 let seed = 123;
 const rand = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
 for (let i = 0; i < 120; i++) cases.push(Array.from({length: rand(14)}, () => words[rand(words.length)]).join(' '));
 for (const a of cases) for (const b of cases) {
  assert.equal(similarity(a, b), reference(a, b));
  assert.equal(similarity(a, b), reference(a, b), 'önbellek isabetinde aynı skor');
 }
});
test('metin değişikliği eski önbellek sonucunu kullanmaz', () => {
 const old = 'Antrenmanda yüklenme şiddeti nasıl belirlenir?';
 const edited = 'Yaralanmada ilk yardım adımları hangi sıradadır?';
 assert.equal(similarity(old, old), 1.15);
 assert.equal(similarity(old, edited), reference(old, edited));
});
