/**
 * Hata defteri için soru varyantı (yeniden yazım) motoru.
 *
 * KULLANIM AMACI: Öğrenci bir soruyu yanlış yaptığında, aynı soru birebir tekrar
 * gösterilirse cevabın YERİNİ ezberler. Bunun yerine sorunun kökü yeniden yazılır,
 * doğru cevap ve kitabın/ünitenin kendi çeldiricileri korunur, şık sırası karıştırılır.
 * Böylece aynı bilgi farklı lafızla, rastgele anlarda tekrar karşısına çıkar.
 *
 * Yeniden yazım kuralları server/book-parallel-engine.mjs içindeki deterministik
 * motorla AYNIDIR (tek kaynak); böylece istemci ve sunucu aynı sonucu üretir.
 */
// @ts-expect-error Sunucu tarafındaki sade JS modülü için tip bildirimi yok; çalışma zamanında Vite paketler.
import { rephraseStem } from '../server/book-parallel-engine.mjs';

export type VariantInput = {
  question: string;
  answer: string;
  /** Doğru cevabı da içeren tam seçenek listesi. */
  options: string[];
};

export type VariantOutput = {
  question: string;
  answer: string;
  /** Doğru cevap dışındaki seçenekler (karıştırılmış). */
  wrong: string[];
  strategy: string;
  source: string;
};

const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

/** Deterministik 32-bit karma (aynı anahtar -> aynı varyant). */
function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(list: T[], seed: number): T[] {
  const arr = list.slice();
  let s = seed >>> 0 || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Yanlış yapılmış bir sorudan yeniden yazılmış varyant üretir.
 * @param seedText Aynı soru için farklı turlarda FARKLI varyant üretmek isteniyorsa
 *                 bu metin değiştirilir (ör. hata sayısı eklendiğinde her yanlışta
 *                 yeni bir yazım çıkar).
 */
export function buildRetryVariant(input: VariantInput, seedText: string, wrongCount = 1): VariantOutput | null {
  const question = String(input?.question || '').trim();
  const answer = String(input?.answer || '').trim();
  const options = (Array.isArray(input?.options) ? input.options : []).filter(o => typeof o === 'string' && o.trim());
  if (question.length < 10 || !answer || options.length < 4) return null;

  const seed = hash32(`${seedText}|${wrongCount}|${question}`);
  const { text, strategy } = rephraseStem(question, seed);
  if (!text || norm(text) === norm(question)) return null;

  const wrong = seededShuffle(options.filter(o => o !== answer), seed ^ 0x9e3779b9);
  if (wrong.length < 3) return null;

  return {
    question: text,
    answer,
    wrong,
    strategy,
    source: `Hata Defteri · Değiştirilerek Tekrar (${wrongCount}× yanlış)`
  };
}

/** Hata listesinden, her yanlış için o anki hata sayısına göre varyant üretir. */
export function buildRetryVariants(
  mistakes: { key: string; question: string; answer: string; wrongOptions: string[]; wrongCount: number }[],
  limit = 8
): { key: string; variant: VariantOutput }[] {
  const out: { key: string; variant: VariantOutput }[] = [];
  const sorted = mistakes.slice().sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
  for (const m of sorted) {
    if (out.length >= limit) break;
    const variant = buildRetryVariant({ question: m.question, answer: m.answer, options: [m.answer, ...m.wrongOptions] }, m.key, m.wrongCount || 1);
    if (!variant) continue;
    out.push({ key: m.key, variant });
  }
  return out;
}

export const __variantTesting = { norm, hash32, seededShuffle };
