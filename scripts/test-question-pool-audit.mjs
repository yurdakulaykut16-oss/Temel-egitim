import test from 'node:test';
import assert from 'node:assert/strict';
import {auditQuestionPool} from '../server/question-pool-audit.mjs';

const norm = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
// Önceki sunucu denetiminin önbelleksiz referansı.
function reference(bank, existing) {
 const seen = new Set(), answers = new Set();
 let invalid = 0, duplicates = 0;
 for (const q of [...bank, ...existing]) {
  if (!q || typeof q.question !== 'string' || typeof q.answer !== 'string' || !Array.isArray(q.options) || ![4,5].includes(q.options.length) || !q.options.includes(q.answer) || q.options.some(x => typeof x !== 'string') || new Set(q.options.map(norm)).size !== q.options.length) { invalid++; continue; }
  const key = norm(q.question);
  if (seen.has(key)) duplicates++;
  seen.add(key);
  answers.add(`${q.unitId}:${norm(q.answer)}`);
 }
 return {checked: bank.length + existing.length, invalid, duplicates, answerGroups: answers.size};
}
const question = (id, n = 4) => ({unitId:'0-0', question:`İlgili kavram ${id} hangi seçenekte verilmiştir?`, answer:`doğru ${id}`, options:[`doğru ${id}`,`yanlış bir ${id}`,`yanlış iki ${id}`,`yanlış üç ${id}`,`yanlış dört ${id}`].slice(0,n)});

test('soğuk/sıcak denetim, geçersiz satır ve bankalar arası tekrarlar referansla aynıdır', () => {
 const bank = Array.from({length:200}, (_, i) => question(i, i % 2 ? 4 : 5));
 const existing = [question(1), question(300), null, {}, {...question(400), answer:'yok'}, {...question(500),options:['a','a','b','c']}];
 for (let i=0;i<3;i++) assert.deepEqual(auditQuestionPool(bank,existing),reference(bank,existing));
});
test('yerinde kök, cevap, ünite ve seçenek düzenlemeleri önbelleği geçersiz kılar', () => {
 const first=question(1), other=question(2);
 const bank=[first], items=[other];
 const check=()=>assert.deepEqual(auditQuestionPool(bank,items),reference(bank,items));
 check();
 other.question=first.question; check();
 assert.equal(auditQuestionPool(bank,items).duplicates,1);
 other.options[1]=other.options[0]; check();
 assert.equal(auditQuestionPool(bank,items).invalid,1);
 other.options=question(2).options; check();
 other.answer=other.options[1]; check();
 other.unitId='1-1'; check();
 items.push(first); check();
 items.splice(0,1); check();
 first.options.pop(); check();
 assert.equal(auditQuestionPool(bank,items).invalid,2);
});

test('seyrek seçenek dizisi sonradan doldurulunca yeniden denetlenir', () => {
 const q=question(1);
 delete q.options[3];
 assert.deepEqual(auditQuestionPool([], [q]), reference([], [q]));
 q.options[3]=undefined;
 assert.deepEqual(auditQuestionPool([], [q]), reference([], [q]));
 assert.equal(auditQuestionPool([], [q]).invalid, 1);
});
