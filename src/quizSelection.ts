export const PRACTICE_QUIZ_SIZE = 10;
export const MISTAKE_QUIZ_SIZE = 13; // Eski 25 soruluk sınırın yukarı yuvarlanmış yarısı.
export const EXAM_QUESTIONS_PER_BOOK = 20;

export const questionKey = (unitId: string, question: string) =>
 `${unitId}:${question.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;

type Candidate = { id: string; bi: number; u: {question: string}; parallelOf?: string };

/** Ağırlığa göre sıralanmış havuzdan seç. Kaynak soruyla paralelini tek yer say;
 * sınır dolduktan sonra elemek tam denemeyi 100 sorunun altına düşürürdü. */
export function selectQuizItems<T extends Candidate>(ranked: T[], {
 full = false, singleUnit = false, isWeak = () => false
}: {full?: boolean; singleUnit?: boolean; isWeak?: (id: string) => boolean} = {}): T[] {
 const families = new Set<string>();
 const perUnit = new Map<string, number>();
 const take = (item: T, output: T[], unitLimit: number) => {
  const n = perUnit.get(item.id) || 0;
  const key = questionKey(item.id, item.parallelOf || item.u.question);
  if (n >= unitLimit || families.has(key)) return;
  families.add(key);
  perUnit.set(item.id, n + 1);
  output.push(item);
 };
 const result: T[] = [];
 if (full) {
  for (let bi = 0; bi < 5; bi++) {
   const rows = ranked.filter(item => item.bi === bi);
   const picked: T[] = [];
   for (const cap of [5, Infinity]) {
    for (const item of rows) {
     if (picked.length === EXAM_QUESTIONS_PER_BOOK) break;
     take(item, picked, cap);
    }
   }
   result.push(...picked);
  }
 } else {
  for (const item of ranked) {
   if (result.length === PRACTICE_QUIZ_SIZE) break;
   take(item, result, singleUnit ? Infinity : isWeak(item.id) ? 3 : 2);
  }
 }
 return result;
}

/** Adaylar önceden karıştırılmıştır. Yanlışları ayrı konumlara yerleştir; testi uzatma. */
export function mixRetryItems<T extends Candidate>(pool: T[], retries: T[]): T[] {
 const result = pool.slice();
 const slots = pool.map((_, i) => i);
 const limit = Math.min(2, Math.max(1, Math.round(pool.length * 0.2)));
 let used = 0;
 for (const retry of retries) {
  if (!slots.length || used === limit) break;
  const key = questionKey(retry.id, retry.u.question);
  if (result.some(q => questionKey(q.id, q.u.question) === key)) continue;
  const [slot] = slots.splice(Math.floor(Math.random() * slots.length), 1);
  result[slot] = retry;
  used++;
 }
 return result;
}
