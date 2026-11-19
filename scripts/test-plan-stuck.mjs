import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlanSteps, planSnapshot, notePlanOutcome } from '../server/production-plan.mjs';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const questions = (unitId, count) => Array.from({ length: count }, () => ({ unitId, status: 'approved' }));

test('a parked pass cannot advance production to a later unit before 200 approvals', () => {
 const [first, second] = contexts;
 const [step] = buildPlanSteps(contexts, 50, 4);
 let state = { parked: {}, streaks: {} };
 for (let n = 0; n < 25; n++) state = notePlanOutcome(state, step, 'rejected', { stuckLimit: 25, now: 0 }).state;
 assert.ok(state.parked[step.key]);
 const active = planSnapshot({ contexts, items: questions(first.id, 150), parked: state.parked });
 assert.equal(active.current.unitId, first.id);
 assert.equal(active.current.quota, 200);
 const completed = planSnapshot({ contexts, items: questions(first.id, 200), parked: state.parked });
 assert.equal(completed.current.unitId, second.id);
});
