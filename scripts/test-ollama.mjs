import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));

test('generated questions use source/answer/plausibility checks without difficulty scoring', async () => {
 let calls = 0;
 let judgeMode = 'pass';
 let generation = 0;
 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let body = '';
  for await (const chunk of req) body += chunk;
  const data = JSON.parse(body);
  if (data.think === false) {
   res.statusCode = 400;
   return res.end(JSON.stringify({ error: 'think unsupported' }));
  }
  calls += 1;
  const source = 'Egzersiz düzenli ve planlı etkinliktir.';
  let result;
  if (data.prompt.includes('bağımsız bir soru denetçisisin')) {
   result = {
    answer: 'Planlı ve düzenli yapılması', singleCorrect: judgeMode !== 'multiple',
    supported: judgeMode !== 'unsupported', choicesPlausible: judgeMode !== 'absurd',
    evidence: source, reason: 'Kaynak ve seçenekler kontrol edildi.'
   };
  } else {
   generation += 1;
   result = {
    question: ['Egzersizi tanımlayan temel nitelik hangisidir?', 'Planlı egzersiz nasıl yürütülmelidir?', 'Kaynakta egzersizin hangi özelliği vurgulanır?', 'Düzenli egzersizi diğer etkinliklerden ayıran ölçüt nedir?'][(generation - 1) % 4],
    options: ['Planlı ve düzenli yapılması', ...[
     ['Yalnızca yarışma günü yapılması', 'Rastgele zamanlarda uygulanması', 'Sadece sonuç alınamadığında sürdürülmesi'],
     ['Yalnızca müsabaka döneminde yapılması', 'Antrenmanların plansız seçilmesi', 'Bir defaya mahsus uygulanması'],
     ['Yalnızca kısa süreli yürütülmesi', 'Günlük kararlarla değiştirilmesi', 'Sezon sonunda başlatılması'],
     ['Yalnızca yüksek şiddetle yapılması', 'Dinlenme günlerinde uygulanması', 'Sadece spor salonunda sürdürülmesi']
    ][(generation - 1) % 4]],
    answer: 'Planlı ve düzenli yapılması', explanation: 'Kaynak egzersizin planlı ve düzenli olduğunu belirtir.',
    evidence: source, topic: 'Egzersizin özellikleri'
   };
  }
  res.end(JSON.stringify({ response: JSON.stringify(result), eval_count: 100, eval_duration: 300_000_000, load_duration: 20_000_000 }));
 });
 const fakePort = await listen(fake);
 const dir = await mkdtemp(join(tmpdir(), 'tempo-test-'));
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
 process.env.OLLAMA_MODEL = 'fake:1';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_PLAN = '0';
 const { ollamaPlugin } = await import('../server/ollama.mjs');
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_path, handler) { middleware = handler; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;
 const post = () => fetch(`${base}/api/ollama/generate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ units: ['0-0'] })
 });
 try {
  const status = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.model, 'fake:1');
  assert.equal(status.autoBlock, null);
  const config = await fetch(`${base}/api/ollama/config`, {
   method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ passageMode: 'summary-only' })
  });
  assert.equal(config.status, 200);

  const accepted = await post();
  assert.equal(accepted.status, 200);
  const { item } = await accepted.json();
  assert.equal(item.status, 'approved');
  assert.equal(item.verification.answer, item.answer);
  assert.equal(item.verification.judges.length, 1);
  assert.equal(Object.hasOwn(item, 'difficulty'), false);
  assert.equal(Object.hasOwn(item.verification, 'qualityScore'), false);
  assert.equal(Object.hasOwn(item.verification.judges[0], 'difficulty'), false);

  for (const [mode, expected] of [['multiple', /cevap\/kanıt/i], ['unsupported', /cevap\/kanıt/i], ['absurd', /ilgisiz, anlamsız/i]]) {
   judgeMode = mode;
   const rejected = await post();
   assert.equal(rejected.status, 502);
   assert.match((await rejected.json()).error, expected);
  }
  assert.ok(calls >= 4);
 } finally {
  await close(app);
  await close(fake);
  await rm(dir, { recursive: true, force: true });
 }
});
