import assert from 'node:assert/strict';
import test from 'node:test';
import { SerialTaskQueue } from '../server/model-inference-queue.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('runs requests one at a time and preserves queue order', async () => {
 const queue = new SerialTaskQueue();
 const order = [];
 let active = 0;
 let peakActive = 0;

 const run = (label, wait) => queue.run(label, async () => {
  active += 1;
  peakActive = Math.max(peakActive, active);
  order.push(`${label}:start`);
  await delay(wait);
  order.push(`${label}:end`);
  active -= 1;
  return label;
 });

 const results = await Promise.all([run('teacher', 15), run('judge-a', 5), run('judge-b', 1)]);
 assert.deepEqual(results, ['teacher', 'judge-a', 'judge-b']);
 assert.equal(peakActive, 1);
 assert.deepEqual(order, [
  'teacher:start', 'teacher:end',
  'judge-a:start', 'judge-a:end',
  'judge-b:start', 'judge-b:end'
 ]);
 assert.deepEqual(queue.snapshot(), { maxConcurrent: 1, active: null, queued: 0 });
});

test('a failed request does not block the next request', async () => {
 const queue = new SerialTaskQueue();
 const first = queue.run('broken-model', async () => { throw new Error('failed'); });
 const second = queue.run('next-model', async () => 'ok');

 await assert.rejects(first, /failed/);
 assert.equal(await second, 'ok');
 assert.equal(queue.snapshot().queued, 0);
});

test('skips a request cancelled while waiting in the queue', async () => {
 const queue = new SerialTaskQueue();
 let releaseFirst;
 const first = queue.run('first', () => new Promise(resolve => { releaseFirst = resolve; }));
 await delay(5); // let the first request become active
 const controller = new AbortController();
 let secondRan = false;
 const second = queue.run('cancelled', async () => { secondRan = true; }, { signal: controller.signal });
 controller.abort();
 releaseFirst('done');

 assert.equal(await first, 'done');
 await assert.rejects(second, error => error.name === 'AbortError');
 assert.equal(secondRan, false);
 assert.equal(queue.snapshot().queued, 0);
});
