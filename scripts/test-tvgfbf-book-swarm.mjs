import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
 TvgfbfScoutSwarm,
 TVGFBF_EXAM_BLUEPRINT,
 TRUSTED_PDF_AND_WEB_CATALOG,
 SCOUT_AGENTS_REGISTRY,
 verifySourceTrustAndBookAlignment
} from '../server/tvgfbf-scout-swarm.mjs';
import { PrecisionQualityEngine } from '../server/precision-quality-engine.mjs';

test('book-style-questions.json covers all 29 units cleanly without PDF noise', async () => {
 const fp = resolve(process.cwd(), 'server', 'book-style-questions.json');
 assert.ok(existsSync(fp), 'server/book-style-questions.json should exist');
 const data = JSON.parse(await readFile(fp, 'utf8'));
 assert.equal(data.unitsCovered, 29);
 assert.ok(data.totalQuestions >= 250, `Expected >= 250 textbook questions, got ${data.totalQuestions}`);

 const units = new Set(data.questions.map(q => q.unitId));
 assert.equal(units.size, 29);

 for (const q of data.questions) {
  assert.ok(q.question && q.question.length >= 12);
  assert.ok(Array.isArray(q.options) && q.options.length === 4);
  assert.ok(q.options.includes(q.answer), `Answer missing from options in ${q.id}`);
  assert.ok(!/yanıtınız\s+yanlış\s+ise|neler\s+öğrendik\??\s*$/i.test(q.question + ' ' + q.options.join(' ')), `Footer noise leaked into ${q.id}`);
 }
});

test('verifySourceTrustAndBookAlignment rejects unrelated Temel Egitim spam and trusts sports PDFs', () => {
 const bad1 = verifySourceTrustAndBookAlignment('117. Özel Güvenlik Temel Eğitim Silah Bilgisi Deneme Sınavı soruları', 'https://example.com/ozel-guvenlik');
 assert.equal(bad1.accepted, false);

 const bad2 = verifySourceTrustAndBookAlignment('657 Sayılı Devlet Memurları Aday Memur Temel Eğitim çıkmış sorular', 'https://example.com/memur');
 assert.equal(bad2.accepted, false);

 const okOfficial = verifySourceTrustAndBookAlignment('TVGFBF 1. Kademe Antrenörlük Temel Eğitim Hareket ve Antrenman Bilimleri ATP-CP testi', 'https://tvgfbf.gov.tr/storage/test.pdf');
 assert.equal(okOfficial.accepted, true);
 assert.equal(okOfficial.tier, 'tier1_official_pdf');
 assert.ok(okOfficial.trustScore >= 90);
});

test('TvgfbfScoutSwarm runs 5 scout agents, mirrors textbook exemplars, and triggers cross-agent cascade', async () => {
 const tempDir = await mkdtemp(join(tmpdir(), 'tempo-tvgfbf-'));
 try {
  const contexts = JSON.parse(await readFile(resolve('server/contexts.json'), 'utf8'));
  const questionBank = JSON.parse(await readFile(resolve('server/question-bank.json'), 'utf8'));
  const swarm = new TvgfbfScoutSwarm({ dataDir: tempDir, contexts, questionBank });
  let cascaded = false;
  const st = await swarm.runScoutCycle({
   enableLiveProbe: false,
   triggerCascade: async () => {
    cascaded = true;
    return { triggeredAgents: ['researchAgent', 'jarvisCore', 'apexArchitect', 'precisionQualityEngine'] };
   }
  });
  assert.equal(cascaded, true);
  assert.equal(SCOUT_AGENTS_REGISTRY.length, 5);
  assert.equal(TVGFBF_EXAM_BLUEPRINT.totalQuestions, 100);
  assert.equal(TVGFBF_EXAM_BLUEPRINT.passThresholdPerModule, 12);
  assert.ok(TRUSTED_PDF_AND_WEB_CATALOG.length >= 8);
  assert.ok(st.realBookQuestionsCount >= 250);
  assert.equal(Object.keys(st.unitBlueprints).length, 29);

  const promptBlock = swarm.getUnitStylePromptBlock('1-0');
  assert.ok(promptBlock.includes('KİTAP İÇİ ("neler öğrendik?")') || promptBlock.includes('TVGFBF'));
  assert.ok(promptBlock.includes('Eksantrik') || promptBlock.includes('Soru:'));

  const alignedDraft = {
   question: 'Kas kasılma tiplerinde üretilebilecek maksimum kas kuvvetlerinin büyükten küçüğe sıralanışı aşağıdakilerden hangisidir?',
   options: ['Eksantrik > İzometrik > Konsantrik', 'Konsantrik > İzometrik > Eksantrik', 'İzometrik > Eksantrik > Konsantrik', 'Konsantrik > Eksantrik > İzometrik'],
   answer: 'Eksantrik > İzometrik > Konsantrik',
   topic: 'Kas Kasılması'
  };
  const prec = new PrecisionQualityEngine({ contexts });
  prec.setTvgfbfSwarm(swarm);
  const score = swarm.scoreBookAndTvgfbfStyleAlignment(alignedDraft, '1-0');
  assert.ok(score.styleScore >= 75, `Expected high TVGFBF+book styleScore, got ${score.styleScore}`);
  assert.ok(existsSync(join(tempDir, 'tvgfbf-scout-swarm.json')));
  assert.ok(existsSync(join(tempDir, 'tvgfbf-style-corpus.json')));
 } finally {
  await rm(tempDir, { recursive: true, force: true });
 }
});

test('ollamaPlugin exposes /book-questions and /tvgfbf-swarm endpoints and cascades to all agents', async () => {
 const tempDir = await mkdtemp(join(tmpdir(), 'tempo-tvgfbf-http-'));
 const prevData = process.env.TEMPO_DATA_DIR;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 try {
  process.env.TEMPO_DATA_DIR = tempDir;
  process.env.TEMPO_DISABLE_AUTOLOOP = '1';
  process.env.TEMPO_OFFLINE_ONLY = '1';

  const { ollamaPlugin } = await import(`../server/ollama.mjs?v=${Date.now()}`);
  const plugin = ollamaPlugin();
  let handler = null;
  plugin.configureServer({
   middlewares: {
    use(route, fn) {
     if (route === '/api/ollama') handler = fn;
    }
   }
  });
  assert.ok(typeof handler === 'function');

  async function callApi(method, url, body = null) {
   return new Promise((resolveRes, reject) => {
    const req = {
     method,
     url,
     headers: { host: 'localhost:5173', origin: 'http://localhost:5173' },
     async *[Symbol.asyncIterator]() {
      if (body !== null) yield Buffer.from(JSON.stringify(body));
     }
    };
    let statusCode = 200;
    const chunks = [];
    const res = {
     writeHead(code) { statusCode = code; },
     setHeader() {},
     end(data) {
      if (data) chunks.push(Buffer.from(data));
      const text = Buffer.concat(chunks).toString('utf8');
      resolveRes({ status: statusCode, json: text ? JSON.parse(text) : {} });
     }
    };
    Promise.resolve(handler(req, res, () => resolveRes({ status: 404, json: {} }))).catch(reject);
   });
  }

  const bookRes = await callApi('GET', '/book-questions?unitId=1-0');
  assert.equal(bookRes.status, 200);
  assert.equal(bookRes.json.ok, true);
  assert.ok(bookRes.json.total >= 5);

  const runRes = await callApi('POST', '/tvgfbf-swarm/run', { enableLiveProbe: false });
  assert.equal(runRes.status, 200);
  assert.equal(runRes.json.ok, true);
  assert.equal(runRes.json.activeAgentsCount, 5);
  assert.ok(runRes.json.cascadeTriggersTotal >= 1);
  assert.ok((runRes.json.recentCascadeLog?.[0]?.agentsCount || 0) >= 12, `Expected >=12 cascaded agents, got ${runRes.json.recentCascadeLog?.[0]?.agentsCount}`);

  const statusRes = await callApi('GET', '/status');
  assert.equal(statusRes.status, 200);
  assert.ok(statusRes.json.tvgfbfSwarm?.realBookQuestionsCount >= 250);
  assert.ok(statusRes.json.precisionQuality?.atlasUnits === 29);

  const unitIntelRes = await callApi('GET', '/tvgfbf-swarm/unit?unitId=1-0');
  assert.equal(unitIntelRes.status, 200);
  assert.equal(unitIntelRes.json.ok, true);
  assert.ok(unitIntelRes.json.bookQuestionsCount >= 5);
  assert.ok(unitIntelRes.json.highFrequencyTopics.length >= 3);
  assert.ok(unitIntelRes.json.forumTraps.length >= 2);

  const auditRes = await callApi('POST', '/precision-audit', { scope: 'all' });
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.json.evaluatedCount >= 700, `Expected >=700 evaluated items across bank+book, got ${auditRes.json.evaluatedCount}`);
  assert.ok(auditRes.json.averageStyleScore >= 70, `Expected averageStyleScore >=70, got ${auditRes.json.averageStyleScore}`);
  assert.equal(Object.keys(auditRes.json.perBook || {}).length, 5);
 } finally {
  if (prevData === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevData;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY; else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  await rm(tempDir, { recursive: true, force: true });
 }
});

test('PrecisionQualityEngine handles Roman numeral combo options cleanly and rejects set-identical permutations', async () => {
 const contexts = JSON.parse(await readFile(resolve('server/contexts.json'), 'utf8'));
 const eng = new PrecisionQualityEngine({ contexts });
 const validRoman = eng.auditDistractorPsychometrics({
  question: 'I. Difüzyon II. Ozmoz III. Fagositoz IV. Ekzositoz. Yukarıdakilerden hangileri aktif taşıma biçimidir?',
  options: ['I ve II', 'III ve IV', 'I, II ve III', 'II, III ve IV'],
  answer: 'III ve IV',
  explanation: 'Fagositoz ve ekzositoz aktif taşıma biçimleridir.',
  evidence: '',
  unitId: '1-1'
 });
 assert.equal(validRoman.ok, true, `Valid Roman numeral combinations should pass: ${validRoman.firstError}`);

 const dupRoman = eng.auditDistractorPsychometrics({
  question: 'Yukarıdakilerden hangileri doğrudur?',
  options: ['I ve II', 'II ve I', 'I, II ve III', 'Yalnız IV'],
  answer: 'I ve II',
  explanation: 'Açıklama',
  evidence: '',
  unitId: '1-1'
 });
 assert.equal(dupRoman.ok, false);
});
