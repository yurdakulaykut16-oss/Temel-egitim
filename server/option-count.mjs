/**
 * Şık sayısı — sınav 5 şıklıdır (A–E).
 *
 * - Yeni yazılan her soru tam OPTION_COUNT şıklı olmalıdır.
 * - Eski sürümlerde üretilmiş 4 şıklı kayıtlar SİLİNMEZ: havuzda "eski kayıt" olarak durur,
 *   üretim planına sayılmaz ve iyileştirme motoru sırası geldikçe 5 şıkka yeniden yazar.
 */
export const OPTION_COUNT = 5;
export const LEGACY_OPTION_COUNT = 4;
export const OPTION_LETTERS = 'ABCDE';
export const DISTRACTOR_COUNT = OPTION_COUNT - 1;

/** Yeni taslak için geçerli şık sayısı mı? */
export const isDraftOptionCount = n => n === OPTION_COUNT;
/** Kayıtlı (havuzdaki / sabit bankadaki) soru için kabul edilen şık sayısı mı? */
export const isStoredOptionCount = n => n === OPTION_COUNT || n === LEGACY_OPTION_COUNT;
/** Eski 4 şıklı kayıt mı? */
export const isLegacyOptions = q => Array.isArray(q?.options) && q.options.length === LEGACY_OPTION_COUNT;
/** Güncel (5 şıklı) kayıt mı? */
export const hasCurrentOptions = q => Array.isArray(q?.options) && q.options.length === OPTION_COUNT;

/**
 * 5 şıklı bir adayı, 4 şık için yazılmış eski kural kodlarının anlayacağı iki 4 şıklı
 * görünüme ayırır (doğru cevap + ilk üç çeldirici, doğru cevap + son üç çeldirici).
 * Birlikte bütün şıkları kapsarlar. 5 şıklı olmayan adayda [aday] döner.
 */
export function legacyProjections(candidate) {
 const options = candidate?.options;
 if (!Array.isArray(options) || options.length !== OPTION_COUNT) return [candidate];
 const answerIndex = options.indexOf(candidate.answer);
 const distractorIndexes = options.map((_, i) => i).filter(i => i !== answerIndex);
 if (distractorIndexes.length < OPTION_COUNT - 1) return [candidate];
 const without = drop => ({ ...candidate, options: options.filter((_, i) => i !== drop) });
 return [without(distractorIndexes.at(-1)), without(distractorIndexes[0])];
}
