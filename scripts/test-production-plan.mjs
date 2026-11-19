// Difficulty-free sequential production plan tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
 buildPlanSteps, planSnapshot, cyclicPlanSnapshot, advanceCyclicPlanState, initializeCyclicPlanState,
 planBatch, pickPlanWork, planConfigFromEnv, countApproved, stepKey, notePlanOutcome, sanitizePlanState,
 evidenceWithinSummary, splitSummarySentences
} from '../server/production-plan.mjs';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const approved = (unitId, n) => Array.from({ length: n }, () => ({ unitId, status: 'approved' }));

test('all 29 loaded units can be expanded into sequential capped passes', () => {
 assert.equal(contexts.length, 29);
 const steps = buildPlanSteps(contexts, 50, 4);
 assert.equal(steps.length, 29 * 4);
 assert.equal(steps.reduce((sum, step) => sum + step.share, 0), 29 * 200);
 for (const [index, context] of contexts.entries()) {
  const unitSteps = steps.filter(step => step.unitId === context.id);
  assert.deepEqual(unitSteps.map(step => step.pass), [1, 2, 3, 4]);
  assert.deepEqual(unitSteps.map(step => [step.from, step.share, step.quota]), [[0,50,50],[50,50,100],[100,50,150],[150,50,200]]);
  assert.ok(unitSteps.every((step, passIndex) => step.index === index * 4 + passIndex));
 }
 assert.deepEqual(planConfigFromEnv({}).passes, 100);
 assert.deepEqual(planConfigFromEnv({}).quota, 50);
 assert.deepEqual(planConfigFromEnv({ TEMPO_PLAN_PASSES: '150', TEMPO_PLAN_QUOTA: '80' }), { enabled: true, quota: 50, passes: 100, stuckLimit: 25 });
 assert.deepEqual(planConfigFromEnv({ TEMPO_PLAN: '0' }).enabled, false);
});

test('the active unit cannot advance until its total approved count reaches 200', () => {
 const [first, second] = contexts;
 for (const n of [0, 1, 49, 50, 51, 99, 100, 149, 150, 199]) {
  const items = approved(first.id, n);
  const snap = planSnapshot({ contexts, items, quota: 50, passes: 4 });
  assert.equal(snap.current.unitId, first.id, `${n} approved questions still belongs to the first unit`);
  assert.equal(snap.current.pass, Math.floor(n / 50) + 1);
 }
 const completeFirst = planSnapshot({ contexts, items: approved(first.id, 200), quota: 50, passes: 4 });
 assert.equal(completeFirst.current.unitId, second.id);
 assert.equal(completeFirst.current.pass, 1);
 assert.equal(completeFirst.totalDone, 200);
 const mixed = planSnapshot({ contexts, items: [...approved(first.id, 260), ...approved(second.id, 40)], quota: 50, passes: 4 });
 assert.equal(mixed.current.unitId, second.id);
 assert.equal(mixed.totalDone, 240, 'counts saturate at each unit target');
 assert.equal(countApproved([...approved(first.id, 3), { unitId: second.id, status: 'rejected' }]).get(stepKey(first.id)), 3);
});

test('parallel work stays on the active unit and cannot overflow its current pass quota', () => {
 const [first, second] = contexts;
 let snap = planSnapshot({ contexts, items: [], quota: 50, passes: 4 });
 const batch = planBatch(snap.all, 8);
 assert.deepEqual([...new Set(batch.map(step => step.unitId))], [first.id]);
 assert.deepEqual([...new Set(batch.map(step => step.pass))], [1]);
 assert.equal(pickPlanWork(snap.all, 8, {}).unitId, first.id);
 assert.equal(pickPlanWork(snap.all, 8, { [snap.all[0].key]: 50 }), null);
 snap = planSnapshot({ contexts, items: approved(first.id, 199), quota: 50, passes: 4 });
 assert.equal(pickPlanWork(snap.all, 8, {}).unitId, first.id);
 snap = planSnapshot({ contexts, items: approved(first.id, 200), quota: 50, passes: 4 });
 assert.deepEqual([...new Set(planBatch(snap.all, 8).map(step => step.unitId))], [second.id]);
});

test('per-unit stuck counters park the current unit step without difficulty buckets', () => {
 const [step] = buildPlanSteps(contexts, 50, 4);
 let state = { parked: {}, streaks: {} };
 for (let n = 0; n < 24; n++) {
  const result = notePlanOutcome(state, step, 'rejected', { stuckLimit: 25 });
  state = result.state;
  assert.equal(result.parkedNow, false);
 }
 const result = notePlanOutcome(state, step, 'rejected', { stuckLimit: 25, done: 0, now: 0 });
 assert.equal(result.parkedNow, true);
 state = result.state;
 assert.equal(state.parked[step.key].failures, 25);
 const [first] = contexts;
 const resumed = planSnapshot({ contexts, items: approved(first.id, 150), quota: 50, passes: 4, parked: state.parked });
 assert.equal(resumed.current.unitId, first.id, 'parked pass is retried before moving to another unit');
 assert.equal(resumed.current.pass, 4, 'remaining approved questions are filled before advancing');
 assert.equal(resumed.all.find(s => s.key === step.key).parked, false);
 assert.deepEqual(sanitizePlanState(state, contexts), state);
});

test('continuous plan keeps each pass capped at 50, finishes units in order, and cycles forever', () => {
 const small = contexts.slice(0, 2);
 const quota = 2, passes = 2, target = quota * passes;
 let state = initializeCyclicPlanState({ contexts: small, items: [], quota, passes });
 assert.equal(state.cycle, 0);
 assert.equal(state.unitIndex, 0);
 assert.equal(cyclicPlanSnapshot({ contexts: small, quota, passes, ...state }).current.pass, 1);
 assert.equal(cyclicPlanSnapshot({ contexts: small, quota, passes, ...state }).targetPerUnit, 4);

 for (let n = 0; n < target; n++) state = advanceCyclicPlanState(state, small[0].id, small, quota, passes);
 assert.equal(state.unitIndex, 1, 'the next unit starts only after this unit reaches its cycle target');
 assert.equal(state.cycle, 0);
 for (let n = 0; n < target; n++) state = advanceCyclicPlanState(state, small[1].id, small, quota, passes);
 assert.equal(state.unitIndex, 0, 'after the last unit, production restarts at the first unit');
 assert.equal(state.cycle, 1);
 assert.deepEqual(state.cycleProgress, { [small[0].id]: 0, [small[1].id]: 0 });
 const restarted = cyclicPlanSnapshot({ contexts: small, quota, passes, ...state });
 assert.equal(restarted.continuous, true);
 assert.equal(restarted.complete, false);
 assert.equal(restarted.current.unitId, small[0].id);

 const existing = initializeCyclicPlanState({ contexts: small, items: approved(small[0].id, 3), quota, passes });
 assert.equal(existing.unitIndex, 0);
 assert.equal(existing.cycleProgress[small[0].id], 3, 'legacy approved questions seed the first cycle');
 assert.equal(cyclicPlanSnapshot({ contexts: small, quota, passes, ...existing }).current.pass, 2);
});

test('source-evidence helper accepts source wording and rejects unsupported evidence', () => {
 const summary = contexts[0].text;
 const sentence = splitSummarySentences(summary).find(line => line.length >= 15);
 assert.ok(sentence);
 assert.equal(evidenceWithinSummary(sentence, summary).ok, true);
 assert.equal(evidenceWithinSummary('Bu kaynakta bulunmayan uydurma bir kanıt cümlesidir.', summary).ok, false);
});
