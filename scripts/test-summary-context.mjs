import test from 'node:test';
import assert from 'node:assert/strict';
import {getSummaryIndex} from '../server/summary-index.mjs';
import {splitSummarySentences, summaryWindow, evidenceWithinSummary, pickFocusSentence} from '../server/production-plan.mjs';
import {buildQuestionContext} from '../server/question-context.mjs';

const summary = 'Antrenmanda yüklenme ve dinlenme birlikte planlanmalıdır. ' +
 'Süre, şiddet ve sıklık farklı yüklenme bileşenlerini anlatır. ' +
 'Teknik hazırlık hareketin uygulanışını, taktik hazırlık karar seçimini kapsar. ' +
 'Kronik uyum, düzenli çalışmalar sonucunda oluşan kalıcı değişimdir.';
const norm = s => s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const tokens = s => norm(s).split(' ').filter(t => t.length >= 3);

test('kaynak indeksi eski parçalama/normalleştirme kurallarını birebir korur', () => {
 for (const text of [summary, '', 'vb. gibi kısa örnek. 19. yüzyılda açıklanan yöntem. İkinci açıklama yeterince uzundur.', summary + '\n\n' + summary]) {
  const expected = String(text).split(/(?<=[.!?])\s+(?![a-zçğıöşüâîû])/).map(s => s.trim()).filter(s => s.length >= 25);
  const indexed = getSummaryIndex(text);
  assert.deepEqual(indexed.sentences, expected);
  assert.equal(indexed.normalized, norm(text));
  assert.deepEqual(indexed.norms, expected.map(norm));
  assert.deepEqual(indexed.tokenSets, expected.map(s => new Set(tokens(s))));
  assert.deepEqual(indexed.neighborTokenSets, expected.map((s,i) => new Set(tokens(`${s} ${expected[i+1] || ''}`))));
 }
});
test('indeks özete bağlıdır; güncellemede eskimez, dış dizideki değişiklik indeksi bozmaz', () => {
 assert.equal(getSummaryIndex(summary), getSummaryIndex(summary));
 const sentences = splitSummarySentences(summary);
 sentences[0] = 'değiştirildi';
 assert.notEqual(splitSummarySentences(summary)[0], 'değiştirildi');
 const changed = summary.replace('Kronik uyum', 'Uzun süreli uyum');
 assert.notEqual(getSummaryIndex(changed), getSummaryIndex(summary));
 assert.ok(getSummaryIndex(changed).sentences.at(-1).startsWith('Uzun süreli uyum'));
 const cold = summaryWindow(summary, 'Teknik hazırlık hareketin uygulanışını', 140);
 assert.deepEqual(summaryWindow(summary, 'Teknik hazırlık hareketin uygulanışını', 140), cold);
 assert.deepEqual(pickFocusSentence(summary, [], 2), pickFocusSentence(summary, [], 2));
 assert.equal(evidenceWithinSummary('Antrenmanda yüklenme ve dinlenme birlikte planlanmalıdır.', summary).ok, true);
 assert.equal(evidenceWithinSummary('Hukuki düzenlemeler kulüp gelirlerini otomatik olarak ikiye katlar.', summary).ok, false);
});
test('bağlam kısa, çeşitli ve kaynakla sınırlıdır; tanım ve paragraf tipini bozmaz', () => {
 const contexts = Array.from({length: 4}, (_, i) => buildQuestionContext('vaka', i));
 assert.equal(new Set(contexts).size, 4);
 for (const context of contexts) {
  assert.ok(context.length < 400);
  assert.match(context, /yalnız KONU ANLATIMI/);
  assert.match(context, /uydurma/);
  assert.match(context, /cevabı bağlamda açıklama/);
 }
 assert.equal(buildQuestionContext('paragraf', 1), '');
 assert.equal(buildQuestionContext('tanimdan_terim', 1), '');
 assert.equal(buildQuestionContext('vaka', 4), contexts[0]);
});
