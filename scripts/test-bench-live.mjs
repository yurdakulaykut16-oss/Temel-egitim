import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

async function runFixture(handler) {
 const methods = [];
 const server = http.createServer((req, res) => {
  methods.push(req.method);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(handler(req)));
 });
 await new Promise(r => server.listen(0, '127.0.0.1', r));
 const url = `http://127.0.0.1:${server.address().port}`;
 try {
  const child = spawn(process.execPath, ['scripts/bench-live.mjs', url, '10', '0']);
  let out = '', err = '';
  child.stdout.on('data', b => out += b);
  child.stderr.on('data', b => err += b);
  const timer = setTimeout(() => child.kill(), 20000);
  const code = await new Promise(r => child.on('exit', r));
  clearTimeout(timer);
  return { code, out, err, methods };
 } finally {
  server.closeAllConnections();
  await new Promise(r => server.close(r));
 }
}
const state = approvedTotal => ({ connected: true, autoRunning: true, model: 'test:1', verifierModel: 'test:1', judge2Model: 'test:1', telemetry: { approvedTotal } });
test('canlı ölçüm yalnız GET kullanır, az örnekte hedefe ulaşıldı demez', async () => {
 const result = await runFixture(() => state(3));
 assert.equal(result.code, 0, result.err);
 const report = JSON.parse(result.out);
 assert.equal(report.targetSecondsPerApproved, 6);
 assert.equal(report.approved, 0);
 assert.equal(report.secondsPerApproved, null);
 assert.equal(report.targetMet, null);
 assert.ok(result.methods.every(m => m === 'GET'));
});
test('kapalı üretimde yanıltıcı hız raporu vermez', async () => {
 const result = await runFixture(() => ({ ...state(0), autoRunning: false }));
 assert.equal(result.code, 1);
 assert.equal(result.out, '');
 assert.match(result.err, /otomatik üretim açık/);
});
