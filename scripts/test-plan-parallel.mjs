import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSnapshot, planBatch, pickPlanWork } from '../server/production-plan.mjs';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const questions = (unitId, count) => Array.from({ length: count }, () => ({ unitId, status: 'approved' }));

test('parallel slots stay on the current unit and its 50-question pass', () => {
 const [first, second] = contexts;
 const snap = planSnapshot({ contexts, items: [], quota: 50, passes: 4 });
 assert.deepEqual([...new Set(planBatch(snap.all, 8).map(step => step.unitId))], [first.id]);
 assert.deepEqual([...new Set(planBatch(snap.all, 8).map(step => step.pass))], [1]);
 assert.equal(pickPlanWork(snap.all, 8, {}).unitId, first.id);
 const secondPass = planSnapshot({ contexts, items: questions(first.id, 50), quota: 50, passes: 4 });
 assert.equal(secondPass.current.unitId, first.id);
 assert.equal(secondPass.current.pass, 2);
 const nextUnit = planSnapshot({ contexts, items: questions(first.id, 200), quota: 50, passes: 4 });
 assert.equal(nextUnit.current.unitId, second.id);
});
