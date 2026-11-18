import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeneratedQuestion, generationDifficultyOf } from '../server/question-difficulty.mjs';
import { planConfigFromEnv, countApproved, planSnapshot, buildPlanSteps, DEFAULT_PLAN_QUOTA } from '../server/production-plan.mjs';

test('zor sorunun içeriği değişmez, kayıt ve hakem etiketleri orta olur', () => {
 const old = { id: 'hard', unitId: '0-0', status: 'approved', difficulty: 'zor', question: 'Vaka sorusu', options: ['a', 'b', 'c', 'd'], answer: 'a', verification: { difficulty: 'zor', targetDifficulty: 'zor', judges: [{ difficulty: 'zor', qualityScore: 5 }] } };
 const mapped = normalizeGeneratedQuestion(old);
 assert.equal(mapped.difficulty, 'orta');
 assert.equal(mapped.verification.difficulty, 'orta');
 assert.equal(mapped.verification.targetDifficulty, 'orta');
 assert.equal(mapped.verification.judges[0].difficulty, 'orta');
 assert.equal(generationDifficultyOf(mapped), 'zor');
 assert.equal(mapped.question, old.question);
 assert.deepEqual(mapped.options, old.options);
 assert.equal(mapped.answer, old.answer);
 assert.equal(old.difficulty, 'zor', 'eski nesne mutasyona uğramaz');
 assert.deepEqual(normalizeGeneratedQuestion(mapped), mapped, 'tekrar yükleme/yeniden kaydetme idempotent');
 for (const difficulty of ['kolay', 'orta']) assert.equal(normalizeGeneratedQuestion({difficulty}).difficulty, difficulty);
});
test('orta görünen zor sorular planın zor hücresini doldurur; iki kez sayılmaz', () => {
 const contexts = [{id: '0-0', book: 'Kitap', unit: 'Konu'}];
 const raw = Array.from({length: 25}, (_, i) => ({id: `${i}`, unitId: '0-0', status: 'approved', difficulty: i < 5 ? 'kolay' : i < 15 ? 'orta' : 'zor'}));
 const mapped = raw.map(normalizeGeneratedQuestion);
 const counts = countApproved(mapped);
 assert.equal(counts.get('0-0|zor'), 10);
 assert.equal(counts.get('0-0|orta'), 10);
 assert.equal(mapped.filter(q => q.difficulty === 'orta').length, 20);
 const snapshot = planSnapshot({contexts, items: mapped, quota: 25, passes: 1});
 assert.equal(snapshot.totalDone, 25);
 assert.equal(snapshot.complete, true);
 assert.equal(mapped.length, raw.length, 'mevcut soru silinmez');
});
test('her konunun toplam hedefi yarılanır; özel kotalar ve tek sayılar güvenlidir', () => {
 assert.equal(DEFAULT_PLAN_QUOTA, 25);
 assert.equal(planConfigFromEnv({}).quota, 25);
 assert.equal(planConfigFromEnv({TEMPO_PLAN_QUOTA: '80'}).quota, 40);
 assert.equal(planConfigFromEnv({TEMPO_PLAN_QUOTA: '51'}).quota, 26);
 assert.equal(planConfigFromEnv({TEMPO_PLAN_QUOTA: '1'}).quota, 1);
 const contexts = [{id:'a',book:'Kitap',unit:'A'}, {id:'b',book:'Kitap',unit:'B'}];
 const cfg = planConfigFromEnv({});
 const steps = buildPlanSteps(contexts, cfg.quota, cfg.passes);
 for (const ctx of contexts) assert.equal(steps.filter(s => s.unitId === ctx.id).reduce((n, s) => n + s.share, 0), 1000);
 assert.ok(steps.some(s => s.difficulty === 'zor'), 'zor içerik üretimi devam eder');
});

test('kolay payı azalır, orta çoğunluk olur; toplam kota değişmez', () => {
 const contexts = [{id:'a', book:'Kitap', unit:'A'}];
 const steps = buildPlanSteps(contexts, 25, 40);
 const first = steps.filter(s => s.pass === 1);
 assert.equal(first.find(s => s.difficulty === 'kolay').share, 5);
 assert.equal(first.filter(s => s.difficulty !== 'kolay').reduce((n,s) => n + s.share, 0), 20);
 assert.equal(steps.filter(s => s.difficulty === 'kolay').reduce((n,s) => n + s.share, 0), 12);
 assert.equal(steps.filter(s => s.difficulty !== 'kolay').reduce((n,s) => n + s.share, 0), 988);
});
