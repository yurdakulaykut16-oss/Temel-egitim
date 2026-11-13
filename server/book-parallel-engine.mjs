/**
 * Kitap paraleli (parallel) soru motoru.
 *
 * NE YAPAR: Kitabın kendi "Neler Öğrendik?" sorularından, AYNI kavramı aynı kitap
 * bilgisiyle ölçen ama FARKLI yazılmış bir soru üretir. Böylece öğrenci kitap
 * sorusunun lafzını ezberlese bile kavramı gerçekten öğrenip öğrenmediği sınanır.
 *
 * NEDEN ÖNEMLİ: Kullanıcı istediği gibi "kitabın içindeki sorulara çok benzer
 * sorular" üretilir; ama önceki turlarda kurulan tekrar yasağı korunur — paralel
 * soru, kaynak sorunun KOPYASI değildir. Kural:
 *   - doğru cevap ve çeldiriciler aynı kavram ailesinden kalır (kitabın kendi şıkları),
 *   - soru kökü yeniden yazılır (kalıp değişimi + eş anlamlı sözcük + şık sırası karışık),
 *   - normalleştirilmiş metinler birebir aynı olamaz, benzerlik %92'nin altında kalır.
 *
 * Motor deterministiktir: aynı kitap sorusu her zaman aynı paralel soruyu üretir,
 * böylece havuz yeniden derlendiğinde sorular kaybolmaz/çiftleşmez.
 */

const norm = s => (typeof s === 'string' ? s : '')
  .toLocaleLowerCase('tr-TR')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

/** Soru kökü kalıpları ve yeniden yazım stratejileri. */
const SYNONYM_PAIRS = [
  ['aşağıdakilerden hangisi', 'aşağıdaki seçeneklerden hangisi'],
  ['aşağıdaki seçeneklerden hangisi', 'aşağıda verilenlerden hangisi'],
  ['aşağıda verilenlerden hangisi', 'aşağıdakilerden hangisi'],
  ['ifade eder', 'açıklar'],
  ['ifade edilir', 'açıklanır'],
  ['denir', 'adlandırılır'],
  ['verilir', 'ifade edilir'],
  ['söylenir', 'belirtilir'],
  ['yer alır', 'bulunur'],
  ['doğrudur', 'geçerlidir'],
  ['sayılır', 'kabul edilir'],
  ['kullanılır', 'uygulanır'],
  ['gereklidir', 'zorunludur'],
  ['önemlidir', 'belirleyicidir'],
  ['etkiler', 'belirler'],
  ['artırır', 'yükseltir'],
  ['azaltır', 'düşürür'],
  ['oluşturur', 'meydana getirir'],
  ['sağlar', 'olanak verir'],
  ['gerektirir', 'zorunlu kılar'],
  ['ayrılır', 'farklılaşır'],
  ['kapsar', 'içerir'],
  ['tanımlar', 'betimler']
];

const LEAD_INS = [
  'Kitaba göre,',
  'Bu ünitenin kapsamında,',
  'Antrenörlük temel eğitimde,',
  'Bu konuda,'
];

/** Deterministik, hafif bir 32-bit karma (aynı girdi -> aynı varyant). */
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministik Fisher-Yates; aynı tohum aynı sırayı verir. */
function seededShuffle(list, seed) {
  const arr = list.slice();
  let s = seed >>> 0 || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function lowerFirst(s) {
  if (!s) return s;
  const tr = { İ: 'i', I: 'ı', Ş: 'ş', Ğ: 'ğ', Ü: 'ü', Ö: 'ö', Ç: 'ç' };
  const first = s[0];
  // Kısaltmaları (DMSP, VKİ, TOTAPS) ve tırnak/özel adla başlayan kökleri bozmayalım.
  const firstWord = (s.split(/[\s\u00a0]/)[0] || '');
  const isAcronym = firstWord.length >= 2 && firstWord === firstWord.toUpperCase() && /[A-ZÇĞİÖŞÜ]/.test(firstWord);
  if (isAcronym || /[“”"'‘(]/.test(first)) return s;
  return (tr[first] || first.toLocaleLowerCase('tr-TR')) + s.slice(1);
}

function applySynonyms(stem, seed) {
  // Kökte karşılığı olan TÜM eş anlamlı çiftleri bul, tohumla birini seç: böylece
  // aynı soru farklı tohumlarda (ör. her yeni yanlışta) FARKLI yazım alır.
  const order = seededShuffle([...SYNONYM_PAIRS.keys()], seed);
  const matches = [];
  for (const idx of order) {
    const [from, to] = SYNONYM_PAIRS[idx];
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(stem)) matches.push([re, to]);
  }
  if (!matches.length) return { text: stem, changed: false };
  const [re, to] = matches[Math.abs(seed) % matches.length];
  const out = stem.replace(re, match => (/^[A-ZÇĞİÖŞÜ]/.test(match) ? to.charAt(0).toUpperCase() + to.slice(1) : to));
  return { text: out, changed: true };
}

/**
 * "Aşağıdakilerden hangisi <X>?" kalıbını "<X> aşağıdakilerden hangisidir?" biçimine çevirir.
 * Yalnızca kalıp tek ve güvenli olduğunda uygulanır.
 */
// Ad soylu olup olmadığını ayırt etmek için: bu eklerle biten sözcükler çekimli eylemdir.
const VERB_SUFFIX_RE = /(?:ir|ır|er|ar|ur|ür|or|ör|maz|mez|yor|acak|ecek|mal[ıi]|meli|d[ıi]|di|du|d[üu]|t[ıi]|ti|tu|t[üu]|m[ıi][sş]|mi[sş]|mu[sş]|m[üu][sş])$/i;

const NEGATION_TAIL = /\s+(de[ğg]ildir|yer\s+almaz|say[ıi]lamaz|bulunmaz|g[öo]sterilemez|s[öo]ylenemez|de[ğg]ildir\s*)\s*[?.]?\s*$/i;

/**
 * "Aşağıdakilerden hangisi <X> de[ğg]ildir?" gibi olumsuz kökleri, anlamı koruyarak
 * yeniden yazar: "... <X> kapsamında yer almaz?" Kalıbı bozmadan olumsuzluğu taşır.
 */
function rephraseNegation(stem, seed = 1) {
  const raw = stem.trim();
  const m = raw.match(/^(A[şs]a[ğg][ıi]dakilerden|A[şs]a[ğg][ıi]daki se[çc]eneklerden|A[şs]a[ğg][ıi]da verilenlerden)\s+hangisi\s+([\s\S]*?)\s+de[ğg]ildir\s*[?.]?$/i);
  if (!m) return null;
  const body = m[2].trim();
  if (body.length < 8 || body.length > 200) return null;
  if (/[?:;,]$/.test(body)) return null;
  const openers = ['Aşağıdaki seçeneklerden hangisi', 'Aşağıda verilenlerden hangisi', 'Aşağıdaki şıklardan hangisi', 'Aşağıdakilerden hangisi'];
  const tails = ['kapsamında yer almaz?', 'arasında gösterilemez?', 'içinde değerlendirilemez?'];
  const opener = openers[Math.abs(seed) % openers.length];
  // DİKKAT: `>>` imzali 32-bite cevirir; 2^31'i asan tohumlarda negatif indeks (undefined) uretirdi.
  const tail = tails[Math.abs(Math.floor(Number(seed) / 8)) % tails.length];
  return `${opener} ${body} ${tail}`;
}

function moveTail(stem) {
  const raw = stem.trim();
  const m = raw.match(/^(Aşağıdakilerden|Aşağıdaki seçeneklerden|Aşağıda verilenlerden)\s+hangisi\s+([\s\S]+)$/i);
  if (!m) return null;
  const body = m[2].trim().replace(/\s*[?]+\s*$/, '').trim();
  if (body.length < 12 || body.length > 220) return null;
  if (/[?:;,]$/.test(body)) return null;
  // Olumsuz köklerde taşıma bozuk Türkçe üretir ("... de[ğg]ildir aşağıdakilerden hangisidir?").
  if (NEGATION_TAIL.test(body)) return null;
  // Soru sözcüğü kökün ortasındaysa (ör. "hangi ilke ...?") taşıma bozuk olur.
  if (/\bhangi\b|\bhangisi\b/i.test(body)) return null;
  // Öncüllü (I-II-III) köklerde taşıma anlamı bozar.
  if (/\b(I{1,3}|IV|V|VI{0,3})\./.test(body)) return null;
  // Kökün son sözcüğü çekimli bir eylemse ("... oluşturur", "... ifade eder") taşıma
  // bozuk Türkçe üretir; yalnızca ad soylu kökler ("... enerji harcaması") taşınır.
  const lastWord = (body.split(/\s+/).pop() || '').toLocaleLowerCase('tr-TR');
  if (VERB_SUFFIX_RE.test(lastWord)) return null;
  // "... hareketlerden biridir aşağıdakilerden hangisidir?" gibi bozuk yapı olmasın:
  // kökün sonundaki "-dir/-dır" ek-fiili taşımadan önce atılır.
  const stripped = body.replace(/\s+(biridir|birlerdir|[a-zçğıöşü]{3,}(?:dir|d[ıi]r|dur|d[üu]r|tir|t[ıi]r|tur|t[üu]r))\s*$/i, (mm, word) => {
    if (/^(biridir|birlerdir)$/i.test(word)) return ' biri';
    const base = word.replace(/(dir|d[ıi]r|dur|d[üu]r|tir|t[ıi]r|tur|t[üu]r)$/i, '');
    return base.length >= 3 ? ` ${base}` : ` ${word}`;
  });
  const finalBody = (stripped.trim() || body).trim();
  const capped = finalBody.charAt(0).toUpperCase() + finalBody.slice(1);
  return `${capped} aşağıdakilerden hangisidir?`;
}

/** Birebir aynı kalmasın diye kökü yeniden yazar. */
export function rephraseStem(stem, seed = 1) {
  const original = String(stem || '').trim();
  if (!original) return { text: original, strategy: 'none' };

  // 1) Olumsuz kökleri anlamı koruyarak yeniden yaz
  const negated = rephraseNegation(original, seed);
  if (negated && norm(negated) !== norm(original)) {
    return { text: negated, strategy: 'negation' };
  }

  // 2) Kökü sona taşı (en belirgin yeniden yazım)
  const moved = moveTail(original);
  if (moved && moved !== original) {
    return { text: moved, strategy: 'tail_move' };
  }

  // 2) Eş anlamlı sözcük değişimi
  const syn = applySynonyms(original, seed);
  if (syn.changed && norm(syn.text) !== norm(original)) {
    return { text: syn.text, strategy: 'synonym' };
  }

  // 3) Güvenli bir giriş cümlesi ekle (anlamı bozmadan yüzeyi değiştirir)
  const lead = LEAD_INS[seed % LEAD_INS.length];
  const tail = lowerFirst(original);
  const withLead = `${lead} ${tail}`;
  if (norm(withLead) !== norm(original)) {
    return { text: withLead, strategy: 'lead_in' };
  }

  // 4) Son çare: soru sözcüğünü zenginleştir
  return { text: original.replace(/^Aşağıdakilerden hangisi/i, 'Aşağıdaki şıklardan hangisi'), strategy: 'fallback' };
}

/** İki metnin kapsama benzerliği (0..1) — kopya olup olmadığını ölçer. */
function similarity(a, b) {
  const ta = new Set(norm(a).split(' ').filter(w => w.length >= 3));
  const tb = new Set(norm(b).split(' ').filter(w => w.length >= 3));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/**
 * Bir kitap sorusundan paralel soru üretir.
 * @param {{id:string, unitId:string, book:string, unit:string, topic?:string, question:string, options:string[], answer:string, testPage?:number, source?:string}} bookQ
 */
export function buildParallel(bookQ, { maxSimilarity = 0.92 } = {}) {
  if (!bookQ || typeof bookQ.question !== 'string' || !Array.isArray(bookQ.options) || !bookQ.answer) return null;
  const seed = hash32(`${bookQ.id}|${bookQ.question}`);
  const { text: newStem, strategy } = rephraseStem(bookQ.question, seed);

  // Şıklar korunur (kitabın kendi çeldiricileri en kaliteli çeldiricilerdir), sıra karıştırılır.
  const correct = bookQ.answer;
  const distractors = bookQ.options.filter(o => o && o !== correct);
  if (!distractors.length) return null;
  const originalOrder = [correct, ...distractors];
  let shuffled = seededShuffle(originalOrder, seed ^ 0x9e3779b9);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // Şans eseri kaynakla aynı sıra çıkarsa (konum ezberi bozulmasın diye) bir kaydır.
  if (same(shuffled, originalOrder)) shuffled = [...originalOrder.slice(1), originalOrder[0]];
  if (shuffled.length < 4) return null;

  const sim = similarity(newStem, bookQ.question);
  if (norm(newStem) === norm(bookQ.question) || sim > maxSimilarity) {
    // Yeniden yazım yetersiz kaldıysa bu soruyu paralel üretimden düş: kopya eklemek yok.
    return null;
  }

  return {
    id: `par-${bookQ.id}`,
    unitId: bookQ.unitId,
    book: bookQ.book,
    unit: bookQ.unit,
    topic: bookQ.topic || bookQ.unit,
    question: newStem,
    options: shuffled,
    answer: correct,
    explanation: `${bookQ.unit} ünitesinin resmî kitap sorusundan üretilmiş paralel soru. Kitaptaki kaynak soru: "${bookQ.question}"`,
    sourceQuestionId: bookQ.id,
    sourceQuestion: bookQ.question,
    testPage: bookQ.testPage,
    rephraseStrategy: strategy,
    seedSimilarity: Number(sim.toFixed(3)),
    source: 'kitap_paralel'
  };
}

/** Tüm kitap soruları için paralel havuzu üretir (kopya düşenler atılır). */
export function buildParallelPool(bookQuestions, opts = {}) {
  const out = [];
  const seen = new Set();
  for (const q of bookQuestions) {
    const par = buildParallel(q, opts);
    if (!par) continue;
    const key = norm(par.question);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(par);
  }
  return out;
}

export const __testing = { norm, seededShuffle, similarity, moveTail, rephraseNegation, hash32 };
