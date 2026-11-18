import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const read = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const books = read('server/book-style-questions.json').questions;
const parallels = read('server/book-parallel-questions.json').questions;
const bank = read('server/question-bank.json');
const grounding = read('src/groundingIndex.json');
const { outputFiles: [bundle] } = await build({
 stdin: { contents: "export * from './scripts/authored-bank'; export * from './src/quizSelection';", resolveDir: process.cwd() },
 bundle: true, write: false, platform: 'node', format: 'esm'
});
const { authoredBank, questionKey, selectQuizItems, mixRetryItems, MISTAKE_QUIZ_SIZE } = await import(`data:text/javascript;base64,${Buffer.from(bundle.contents).toString('base64')}`);
const study = [...books, ...parallels, ...bank];

test('hazır havuz tüm kaynakları içerir; istemci bankası ve kaynak dizini eksiksizdir', () => {
 assert.deepEqual(bank.map(({grounding, ...q}) => q), authoredBank, 'tekrarları ayıklanmış sabit soruların tümü bankaya yazılmalı');
 assert.equal(new Set(study.map(q => q.unitId)).size, 29);
 assert.ok(study.length >= 890, 'mevcut 890 hazır soru korunmalı, yeni sorular eklenebilmeli');
 assert.deepEqual(Object.keys(grounding).sort(), study.map(q => questionKey(q.unitId, q.question)).sort());
});

const asCandidate = q => ({id: q.unitId, bi: Number(q.unitId.split('-')[0]), u: q, parallelOf: q.sourceQuestion});
const candidates = study.filter(q => grounding[questionKey(q.unitId, q.question)] >= 0.55).map(asCandidate);

test('konu ve karma testleri en fazla 10 soru; hata tekrarı testi uzatmaz', () => {
 const unit = candidates.filter(q => q.id === '0-0');
 assert.equal(selectQuizItems(unit, {singleUnit: true}).length, 10);
 const mixed = selectQuizItems(candidates, {isWeak: id => id === '0-0'});
 assert.equal(mixed.length, 10);
 assert.equal(mixed.filter(x => x.id === '0-0').length, 3);
 assert.ok(mixed.filter(x => x.id === '0-1').length <= 2);
 assert.deepEqual(selectQuizItems([]), []);
 assert.deepEqual(selectQuizItems(unit.slice(0, 1)), unit.slice(0, 1));
 const retries = unit.slice(0, 5).map((q, i) => ({...q, u: { question: `Telafi sorusu ${i}` }, retryOf: i}));
 const withRetries = mixRetryItems(mixed, retries);
 assert.equal(withRetries.length, 10);
 assert.equal(withRetries.filter(q => 'retryOf' in q).length, 2);
 assert.ok(mixed.every(q => !('retryOf' in q)));
 assert.deepEqual(mixRetryItems([], retries), []);
 assert.equal(MISTAKE_QUIZ_SIZE, 13);
});

test('tam deneme 5 × 20 kalır; asıl ve paralel aynı yeri paylaşsa da eksik soru çıkmaz', () => {
 // Kitap API'leri henüz gelmediyse de yerel bankadan 100 soru seçilebilmeli.
 for (const pool of [candidates, candidates.filter(x => bank.includes(x.u))]) {
  const exam = selectQuizItems(pool, {full: true});
  assert.deepEqual([0, 1, 2, 3, 4].map(bi => exam.filter(q => q.bi === bi).length), [20, 20, 20, 20, 20]);
  assert.equal(new Set(exam.map(x => questionKey(x.id, x.parallelOf || x.u.question))).size, 100);
 }
});
