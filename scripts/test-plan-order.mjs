import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlanSteps, planSnapshot, stepKey } from '../server/production-plan.mjs';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const questions = (unitId, count) => Array.from({ length: count }, () => ({ unitId, status: 'approved' }));

test('unit order is retained and next unit starts only after 200 approvals', () => {
 const [first, second] = contexts;
 const steps = buildPlanSteps(contexts, 50, 4);
 assert.deepEqual(steps.filter(step => step.unitId === first.id).map(step => step.pass), [1,2,3,4]);
 assert.equal(steps[0].unitId, first.id);
 assert.equal(steps[4].unitId, second.id);
 for (const count of [0, 50, 100, 150, 199]) {
  assert.equal(planSnapshot({ contexts, items: questions(first.id, count) }).current.unitId, first.id);
 }
 assert.equal(planSnapshot({ contexts, items: questions(first.id, 200) }).current.unitId, second.id);
 assert.equal(stepKey(first.id), `${first.id}|all`);
});
