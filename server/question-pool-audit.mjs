import {isStoredOptionCount} from './option-count.mjs';

const norm = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
// Sorunun kendisi tutulmaz: havuzdan çıkan nesnenin kaydı GC ile temizlenebilir.
const rows = new WeakMap();
function sameOptions(a, b) {
 if (!Array.isArray(b) || a.length !== b.length) return false;
 for (let i = 0; i < a.length; i++) if (a[i] !== b[i] || (i in a) !== (i in b)) return false;
 return true;
}
function auditRow(q) {
 if (!q || typeof q !== 'object') return null;
 const cached = rows.get(q);
 const options = q.options;
 if (cached && cached.question === q.question && cached.answer === q.answer && cached.unitId === q.unitId && sameOptions(cached.options, options)) return cached;
 if (typeof q.question !== 'string' || typeof q.answer !== 'string' || !Array.isArray(options) || !isStoredOptionCount(options.length) || !options.includes(q.answer) || options.some(x => typeof x !== 'string') || new Set(options.map(norm)).size !== options.length) {
  rows.delete(q);
  return null;
 }
 const row = { question: q.question, answer: q.answer, unitId: q.unitId, options: options.slice(), key: norm(q.question), answerGroup: `${q.unitId}:${norm(q.answer)}` };
 rows.set(q, row);
 return row;
}

// Yalnızca satırın saf biçim özellikleri saklanır. Havuz geneli tekrar kontrolü
// HER çağrıda yeniden yapılır; ekleme/silme/yerinde düzenleme sonucu eskitemez.
export function auditQuestionPool(bank, existing) {
 const seen = new Set(), answers = new Set();
 let duplicates = 0, invalid = 0;
 for (const list of [bank, existing]) for (const q of list) {
  const row = auditRow(q);
  if (!row) { invalid++; continue; }
  if (seen.has(row.key)) duplicates++;
  seen.add(row.key);
  answers.add(row.answerGroup);
 }
 return {checked: bank.length + existing.length, invalid, duplicates, answerGroups: answers.size};
}
