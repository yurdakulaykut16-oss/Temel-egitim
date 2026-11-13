import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = server => new Promise(r => server.close(r));
const MAX_QUESTIONS = 20000;
const CAPACITY = 20000;

// Havuzu dolduran kayıtlar birbirine benzer görünmemeli (küratör yakın tekrarları ayıklar),
// bu yüzden her kayıt farklı kelime birleşimi + benzersiz numara içerir.
const SUBJECTS = ['kondisyon', 'teknik', 'taktik', 'beslenme', 'toparlanma', 'sürat', 'dayanıklılık', 'kuvvet', 'esneklik', 'denge', 'koordinasyon', 'solunum'];
const ASPECTS = ['hacmi', 'şiddeti', 'sıklığı', 'süresi', 'yoğunluğu', 'aralığı', 'dağılımı', 'ölçümü', 'planı', 'takvimi'];
const ACTIONS = ['nasıl planlanır', 'nasıl ölçülür', 'nasıl izlenir', 'nasıl artırılır', 'nasıl korunur', 'nasıl dengelenir', 'nasıl kaydedilir', 'nasıl sınıflanır'];

function seedItems(count) {
 const units = ['0-1', '0-2', '1-0', '2-0', '3-0'];
 const diffs = ['kolay', 'orta', 'zor'];
 const items = [];
 for (let i = 0; i < count; i++) {
  const unitId = units[i % units.length];
  const difficulty = diffs[i % diffs.length];
  const subject = SUBJECTS[i % SUBJECTS.length];
  const aspect = ASPECTS[(i / SUBJECTS.length | 0) % ASPECTS.length];
  const action = ACTIONS[(i / (SUBJECTS.length * ASPECTS.length) | 0) % ACTIONS.length];
  const answer = `${i} numaralı doğru seçenek`;
  items.push({
   id: `seed-${i}`,
   unitId,
   status: 'approved',
   difficulty,
   question: `${subject} çalışmasının ${aspect} ${action} ve ${i} hangi seçenekte verilmiştir?`,
   options: [answer, 'Pasif dinlenme uygulanarak', 'Tahkim kurulu kararıyla', 'Bürokrasi yaklaşımıyla'],
   answer,
   explanation: `${subject} çalışmasında ${aspect} düzenli izlenmeli ve kademeli artırılmalıdır.`,
   evidence: 'Egzersiz planlı ve tekrarlıdır',
   topic: `${subject} ${aspect}`,
   qualityScore: i % 5 === 0 ? 2.2 : 4.6,
   examPotential: i % 5 === 0 ? 2 : 4.7,
   createdAt: new Date(Date.now() - (count - i) * 1000).toISOString()
  });
 }
 return items;
}

test('soru havuzu 20.000 sınırını aşmaz: yeni soru eklenirken en zayıf kayıtlar ayıklanır', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-poolcap-'));
 const prevData = process.env.TEMPO_DATA_DIR;
 const prevBase = process.env.OLLAMA_BASE_URL;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake:1' }] }));
  let raw = '';
  for await (const ch of req) raw += ch;
  const data = JSON.parse(raw || '{}');
  const prompt = data.prompt || '';
  const textMatch = prompt.match(/KONU ANLATIMI:\s*([\s\S]*)$/);
  const text = textMatch ? textMatch[1] : '';
  const evidence = text.trim().split(/\s+/).slice(0, 8).join(' ') || 'Egzersiz planlı ve tekrarlıdır';
  let result;
  if (prompt.includes('soru denetçisisin')) {
   result = {
    answer: 'Egzersiz planlıdır', singleCorrect: true, dualAnswerRisk: false, secondBestOption: '',
    supported: true, qualityOk: true, qualityScore: 4.8, examPotential: 4.8, difficulty: 'kolay',
    bloomLevel: 'Kavrama', evidence, reason: 'Kanıt pasajda doğrudan geçiyor.'
   };
  } else {
   result = {
    question: 'Egzersiz ile fiziksel aktivite ayrımında hangi tanım doğrudur?',
    options: ['Egzersiz planlıdır', 'Aktivite yalnızca uykudur', 'Egzersiz plansızdır', 'İkisi aynıdır'],
    answer: 'Egzersiz planlıdır',
    explanation: 'Egzersiz planlı, programlı ve tekrarlı bir hareket biçimidir; fiziksel aktivite ise daha geniştir.',
    evidence,
    topic: 'Temel kavramlar'
   };
  }
  res.end(JSON.stringify({ response: JSON.stringify(result), eval_count: 120, eval_duration: 200_000_000 }));
 });

 const fakePort = await listen(fake);
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
 process.env.OLLAMA_MODEL = 'fake:1';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:1';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:1';

 const seedCount = 20050;
 writeFileSync(join(dir, 'questions.json'), JSON.stringify(seedItems(seedCount)));

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?poolcap=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;

 try {
  const beforeStatus = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(beforeStatus.approved, seedCount);
  assert.equal(beforeStatus.questionCapacity, CAPACITY);
  assert.equal(beforeStatus.maxQuestionsStored, MAX_QUESTIONS);

  const gen = await fetch(`${base}/api/ollama/generate`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ units: ['0-0'] })
  });
  const genBody = await gen.json();
  assert.equal(gen.status, 200, JSON.stringify(genBody));
  assert.equal(genBody.item.status, 'approved');
  assert.equal(genBody.item.verification.judges.length, 2);

  const after = await (await fetch(`${base}/api/ollama/questions`)).json();
  assert.ok(after.items.length <= MAX_QUESTIONS, `Havuz ${MAX_QUESTIONS} kaydı geçmemeli, gelen: ${after.items.length}`);
  const approvedNow = after.items.filter(x => x.status === 'approved').length;
  assert.ok(approvedNow <= CAPACITY, `Onaylı havuz ${CAPACITY} sınırında kalmalı, gelen: ${approvedNow}`);
  assert.ok(after.items.length < seedCount, 'Yeni soru eklenirken zayıf kayıtlar ayıklanmalı');
  assert.ok(approvedNow >= 18000, `Ayıklama sonrası havuz makul boyutta kalmalı, gelen: ${approvedNow}`);
  assert.ok(after.items.some(x => x.id === genBody.item.id), 'Yeni üretilen soru havuzda kalmalı');

  const status = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.questionCapacity, CAPACITY);
  assert.ok(status.curator.approvedCount <= CAPACITY, `Küratör raporu havuz sınırını yansıtmalı: ${status.curator.approvedCount}`);
  assert.equal(status.curator.pruneThreshold, CAPACITY);
 } finally {
  stopOllamaLoops?.();
  app.closeAllConnections?.();
  fake.closeAllConnections?.();
  await close(app);
  await close(fake);
  if (prevData === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevData;
  if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevBase;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }).catch(() => {});
 }
});
