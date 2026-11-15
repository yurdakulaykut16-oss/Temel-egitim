// Üretim planının saf mantığı (server/production-plan.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildPlanSteps, planSnapshot, planDifficultyForUnit, planAcceptsDifficulty, notePlanOutcome,
 sanitizePlanState, evidenceWithinSummary, pickFocusSentence, splitSummarySentences,
 planConfigFromEnv, describeStep, stepKey
} from '../server/production-plan.mjs';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const q = (unitId, difficulty, extra = {}) => ({ unitId, difficulty, status: 'approved', ...extra });
const many = (n, unitId, difficulty) => Array.from({ length: n }, () => q(unitId, difficulty));

test('adım sırası: 1. tur tüm konular kolay, 2. tur orta, 3. tur zor; konu sırası kitap sırasıdır', () => {
 const steps = buildPlanSteps(contexts, 50);
 assert.equal(steps.length, contexts.length * 3);
 assert.deepEqual(steps.slice(0, contexts.length).map(s => s.unitId), contexts.map(c => c.id));
 assert.ok(steps.slice(0, contexts.length).every(s => s.difficulty === 'kolay' && s.pass === 1));
 assert.ok(steps.slice(contexts.length, 2 * contexts.length).every(s => s.difficulty === 'orta' && s.pass === 2));
 assert.ok(steps.slice(2 * contexts.length).every(s => s.difficulty === 'zor' && s.pass === 3));
 assert.equal(steps[0].bookNo, 1); assert.equal(steps[0].unitNo, 1);
 const firstOfBook2 = steps.find(s => s.book !== steps[0].book);
 assert.equal(firstOfBook2.bookNo, 2); assert.equal(firstOfBook2.unitNo, 1);
 assert.match(describeStep(steps[0]), /^1\. tur \(kolay\) · 1\. kitap 1\. konu — /);
});

test('sıradaki adım: kota dolmadan konu değişmez; tur bitmeden zorluk değişmez', () => {
 const [a, b] = contexts;
 let snap = planSnapshot({ contexts, items: [], quota: 50 });
 assert.equal(snap.current.key, stepKey(a.id, 'kolay'));
 assert.equal(snap.totalTarget, contexts.length * 150);

 snap = planSnapshot({ contexts, items: many(49, a.id, 'kolay'), quota: 50 });
 assert.equal(snap.current.key, stepKey(a.id, 'kolay'));
 assert.equal(snap.current.done, 49);

 snap = planSnapshot({ contexts, items: many(50, a.id, 'kolay'), quota: 50 });
 assert.equal(snap.current.key, stepKey(b.id, 'kolay'), '50 kolay dolunca aynı konunun ortasına değil, sıradaki konunun kolayına geçilir');

 // Onaylanmamış ya da zorluğu olmayan kayıtlar sayılmaz; fazlası kotayı aşmaz.
 snap = planSnapshot({ contexts, items: [...many(60, a.id, 'kolay'), { unitId: b.id, difficulty: 'kolay', status: 'rejected' }, { unitId: b.id, status: 'approved' }], quota: 50 });
 assert.equal(snap.totalDone, 50);
 assert.equal(snap.current.key, stepKey(b.id, 'kolay'));

 // 1. tur bitti → 2. tur ilk konu orta. Önceden yazılmış orta sorular sayılır.
 const pass1 = contexts.flatMap(c => many(50, c.id, 'kolay'));
 snap = planSnapshot({ contexts, items: [...pass1, ...many(7, a.id, 'orta')], quota: 50 });
 assert.equal(snap.current.key, stepKey(a.id, 'orta'));
 assert.equal(snap.current.pass, 2);
 assert.equal(snap.current.done, 7);

 const all = contexts.flatMap(c => ['kolay', 'orta', 'zor'].flatMap(d => many(50, c.id, d)));
 snap = planSnapshot({ contexts, items: all, quota: 50 });
 assert.equal(snap.complete, true);
 assert.equal(snap.current, null);
});

test('atlanan adım geçilir; geriye yalnızca atlananlar kalınca allParked bildirilir', () => {
 const [a, b] = contexts;
 let snap = planSnapshot({ contexts, items: many(31, a.id, 'kolay'), quota: 50, parked: { [stepKey(a.id, 'kolay')]: {} } });
 assert.equal(snap.current.key, stepKey(b.id, 'kolay'));
 assert.deepEqual(snap.parkedSteps.map(s => [s.key, s.done]), [[stepKey(a.id, 'kolay'), 31]]);

 const allButOne = contexts.flatMap(c => ['kolay', 'orta', 'zor'].flatMap(d => (c.id === a.id && d === 'kolay' ? many(31, c.id, d) : many(50, c.id, d))));
 snap = planSnapshot({ contexts, items: allButOne, quota: 50, parked: { [stepKey(a.id, 'kolay')]: {} } });
 assert.equal(snap.current, null);
 assert.equal(snap.complete, false);
 assert.equal(snap.allParked, true);
});

test('takılma sayacı: yalnızca üst üste retler sayılır; sınırda adım park edilir', () => {
 const step = buildPlanSteps(contexts, 50)[0];
 let state = { parked: {}, streakKey: '', streak: 0 };
 let res;
 for (let i = 0; i < 4; i++) { res = notePlanOutcome(state, step, 'rejected', { stuckLimit: 5 }); state = res.state; }
 assert.equal(state.streak, 4); assert.equal(res.parkedNow, false);
 res = notePlanOutcome(state, step, 'other', { stuckLimit: 5 }); state = res.state;
 assert.equal(state.streak, 4, 'başka zorlukla kaydedilen soru sayacı değiştirmez');
 res = notePlanOutcome(state, step, 'approved', { stuckLimit: 5 }); state = res.state;
 assert.equal(state.streak, 0, 'hedef kovaya giren soru sayacı sıfırlar');
 for (let i = 0; i < 5; i++) { res = notePlanOutcome(state, step, 'rejected', { stuckLimit: 5, done: 12, now: 0 }); state = res.state; }
 assert.equal(res.parkedNow, true);
 assert.deepEqual(state.parked[step.key], { at: '1970-01-01T00:00:00.000Z', failures: 5, done: 12 });
 assert.equal(state.streak, 0);

 // Adım değişince sayaç yeni adım için sıfırdan başlar.
 const other = buildPlanSteps(contexts, 50)[1];
 state = notePlanOutcome({ parked: {}, streakKey: step.key, streak: 9 }, other, 'rejected', { stuckLimit: 50 }).state;
 assert.equal(state.streakKey, other.key); assert.equal(state.streak, 1);

 // Bozuk dosya içeriği güvenli biçime gelir; planda olmayan adımlar atılır.
 assert.deepEqual(sanitizePlanState('bozuk', contexts), { parked: {}, streakKey: '', streak: 0 });
 const clean = sanitizePlanState({ parked: { [step.key]: { failures: 3 }, 'yok|kolay': {} }, streakKey: 'yok|zor', streak: -4 }, contexts);
 assert.deepEqual(Object.keys(clean.parked), [step.key]); assert.equal(clean.streakKey, ''); assert.equal(clean.streak, 0);
});

test('konu içi zorluk ve kabul kuralı: kova doluysa o zorluk kabul edilmez', () => {
 const a = contexts[0].id;
 assert.equal(planDifficultyForUnit(a, [], 50), 'kolay');
 assert.equal(planDifficultyForUnit(a, many(50, a, 'kolay'), 50), 'orta');
 assert.equal(planDifficultyForUnit(a, [...many(50, a, 'kolay'), ...many(50, a, 'orta')], 50), 'zor');
 assert.equal(planDifficultyForUnit(a, ['kolay', 'orta', 'zor'].flatMap(d => many(50, a, d)), 50), null);

 assert.equal(planAcceptsDifficulty(a, 'kolay', 'kolay', many(50, a, 'kolay'), 50), true, 'hedefle aynı zorluk kabul edilir');
 assert.equal(planAcceptsDifficulty(a, 'orta', 'kolay', many(49, a, 'orta'), 50), true, 'kotası dolmamış başka zorluk kendi kovasına yazılır');
 assert.equal(planAcceptsDifficulty(a, 'kolay', 'orta', many(50, a, 'kolay'), 50), false, 'kolay kotası doluyken "kolay" çıkan soru alınmaz');
 assert.equal(planAcceptsDifficulty(a, 'bilinmiyor', 'kolay', [], 50), false);
});

test('yalnızca özet: kanıt cümlesi konu özetinde geçmeli', () => {
 const summary = contexts[0].text;
 const sentences = splitSummarySentences(summary);
 assert.ok(sentences.length >= 10);
 assert.equal(evidenceWithinSummary(sentences[3], summary).ok, true);
 assert.equal(evidenceWithinSummary(sentences[3].toLocaleUpperCase('tr-TR').replace(/[.,;:]/g, ' '), summary).ok, true, 'büyük/küçük harf ve noktalama farkı sorun değil');
 assert.equal(evidenceWithinSummary(sentences[5].split(' ').slice(1).join(' '), summary).ok, true, 'cümlenin büyük bölümü yeterli');
 // Başka konunun özetinden cümle bu konunun özetinde yoktur.
 const foreign = splitSummarySentences(contexts[12].text)[2];
 assert.equal(evidenceWithinSummary(foreign, summary).ok, false);
 assert.equal(evidenceWithinSummary('Kısa', summary).ok, false);
 // Özetin farklı cümlelerinden derlenmiş (tek cümlede geçmeyen) kanıt kabul edilmez.
 const stitched = [sentences[0], sentences[9]].map(s => s.split(' ').slice(0, 5).join(' ')).join(' ');
 assert.equal(evidenceWithinSummary(stitched, summary).ok, false);
});

test('odak cümlesi: en az soru sorulmuş özet cümlesi seçilir, denemeler arasında döner', () => {
 const summary = contexts[0].text;
 const sentences = splitSummarySentences(summary);
 const first = pickFocusSentence(summary, [], 0);
 assert.equal(first.index, 0); assert.equal(first.total, sentences.length);
 assert.equal(pickFocusSentence(summary, [], 1).index, 1);
 assert.equal(pickFocusSentence(summary, [], sentences.length).index, 0, 'sayaç cümle sayısını aşınca başa döner');
 // İlk iki cümleden soru yazılmışsa sıradaki kullanılmamış cümle seçilir.
 const used = [{ evidence: sentences[0] }, { evidence: sentences[1] }, { evidence: sentences[1] }];
 assert.equal(pickFocusSentence(summary, used, 0).index, 2);
 // Bütün cümleler birer kez kullanıldıysa yine en az kullanılanlar arasından seçer.
 const allOnce = sentences.map(s => ({ evidence: s }));
 const pick = pickFocusSentence(summary, [...allOnce, { evidence: sentences[0] }], 0);
 assert.equal(pick.index, 1); assert.equal(pick.usage, 1);
 assert.equal(pickFocusSentence('', [], 0), null);
});

test('ayarlar: varsayılan 50 soru; TEMPO_PLAN=0 kapatır; geçersiz değerler güvenli aralığa çekilir', () => {
 assert.deepEqual(planConfigFromEnv({}), { enabled: true, quota: 50, stuckLimit: 25 });
 assert.equal(planConfigFromEnv({ TEMPO_PLAN: '0' }).enabled, false);
 assert.deepEqual(planConfigFromEnv({ TEMPO_PLAN_QUOTA: '20', TEMPO_PLAN_STUCK_LIMIT: '40' }), { enabled: true, quota: 20, stuckLimit: 40 });
 assert.deepEqual(planConfigFromEnv({ TEMPO_PLAN_QUOTA: 'abc', TEMPO_PLAN_STUCK_LIMIT: '0' }), { enabled: true, quota: 50, stuckLimit: 2 });
});
