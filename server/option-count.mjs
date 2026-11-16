/**
 * Şık sayısı — bir soru 4 ya da 5 şıklı olabilir.
 *
 * - Sınav 5 şıklıdır (A–E); hazır sorular (sabit banka, kitap soruları) 5 şıklıdır.
 * - Modelin yazdığı soru 4 ya da 5 şıklı olabilir: ikisi de geçerlidir, ikisi de üretim planına sayılır.
 *   Sağlam bir dördüncü çeldirici bulunamayan konuda 4 şıklı soru, zorlama bir beşinci şıktan iyidir.
 * - 3 ve daha az ya da 6 ve daha çok şıklı soru kabul edilmez.
 */
export const MIN_OPTION_COUNT = 4;
export const OPTION_COUNT = 5; // en çok (ve sınavdaki) şık sayısı
export const OPTION_LETTERS = 'ABCDE';
export const MIN_DISTRACTOR_COUNT = MIN_OPTION_COUNT - 1;
export const DISTRACTOR_COUNT = OPTION_COUNT - 1; // en çok çeldirici sayısı

/** Geçerli şık sayısı mı? (4 ya da 5) */
export const isValidOptionCount = n => Number.isInteger(n) && n >= MIN_OPTION_COUNT && n <= OPTION_COUNT;
/** Yeni taslak için geçerli şık sayısı mı? */
export const isDraftOptionCount = isValidOptionCount;
/** Kayıtlı (havuzdaki / sabit bankadaki) soru için geçerli şık sayısı mı? */
export const isStoredOptionCount = isValidOptionCount;

/**
 * 5 şıklı bir adayı, 4 şık için yazılmış kural kodlarının anlayacağı iki 4 şıklı görünüme ayırır
 * (doğru cevap + ilk üç çeldirici, doğru cevap + son üç çeldirici). Birlikte bütün şıkları kapsarlar.
 * 5 şıklı olmayan adayda [aday] döner (4 şıklı aday olduğu gibi denetlenir).
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
