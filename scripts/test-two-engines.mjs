// The retired quality-rewrite loop must not start alongside question production.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));

test('single production engine: no autonomous quality-rewrite loop or dead endpoint', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-single-engine-'));
 const fakeOllama = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:gen' }] }));
  res.statusCode = 404;
  res.end();
 });
 await writeFile(join(dir, 'questions.json'), JSON.stringify([{
  id: 'seed-1', unitId: '0-0', status: 'approved',
  question: 'Source-backed seed question?', options: ['A', 'B', 'C', 'D'], answer: 'A'
 }]), 'utf8');
 const fakePort = await listen(fakeOllama);
 const previous = Object.fromEntries(['OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OLLAMA_VERIFIER_MODEL', 'OLLAMA_JUDGE2_MODEL', 'TEMPO_DATA_DIR', 'TEMPO_DISABLE_AUTOLOOP'].map(k => [k, process.env[k]]));
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
 process.env.OLLAMA_MODEL = 'fake:gen';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:gen';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:gen';
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 let app;
 let stopOllamaLoops;
 try {
  const mod = await import(`../server/ollama.mjs?single-engine=${Date.now()}`);
  stopOllamaLoops = mod.stopOllamaLoops;
  let middleware;
  mod.ollamaPlugin().configureServer({ middlewares: { use(_path, handler) { middleware = handler; } } });
  app = http.createServer((req, res) => {
   req.url = req.url.replace(/^\/api\/ollama/, '');
   middleware(req, res, () => { res.statusCode = 404; res.end(); });
  });
  const port = await listen(app);
  const base = `http://127.0.0.1:${port}/api/ollama`;

  const status = await (await fetch(`${base}/status`)).json();
  assert.equal(status.autoRunning, true, 'question-generation mode remains enabled by default');
  assert.equal(status.qualityLoop, undefined, 'retired loop state must not be advertised');
  assert.equal((await fetch(`${base}/quality-loop`)).status, 404, 'retired endpoint must not call missing loop state');

  const questions = await (await fetch(`${base}/questions`)).json();
  assert.equal(questions.items.length, 1);
  assert.equal(questions.items[0].question, 'Source-backed seed question?');
  assert.equal(Object.hasOwn(questions.items[0], 'difficulty'), false);
 } finally {
  stopOllamaLoops?.();
  app?.closeAllConnections?.();
  fakeOllama.closeAllConnections?.();
  if (app) await close(app);
  await close(fakeOllama);
  await rm(dir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previous)) {
   if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
 }
});
