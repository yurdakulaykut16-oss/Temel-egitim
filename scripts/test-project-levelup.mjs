import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { BookKnowledgeSearch } from '../server/book-knowledge-search.mjs';
import { ProjectLevelUpOrchestrator } from '../server/project-levelup-orchestrator.mjs';
import { HundredWayVerifier } from '../server/hundred-way-verifier.mjs';
import { GithubMegaCorpus } from '../server/github-mega-corpus.mjs';
import { BotParameterMatrix } from '../server/bot-parameter-matrix.mjs';
import { LocalAiTeamHub } from '../server/local-ai-team.mjs';
import { QwenCodeLab } from '../server/qwen-code-lab.mjs';
import { CoderCouncilHub } from '../server/coder-council.mjs';
import { NexusTitanFusionModel } from '../server/nexus-fusion-model.mjs';
import { PoolCuratorBot } from '../server/pool-curator.mjs';
import { GithubKnowledgeMiner } from '../server/github-researcher.mjs';
import { SandboxEvolver } from '../server/sandbox-evolver.mjs';
import { JarvisCore } from '../server/jarvis-core.mjs';
import { ApexArchitect } from '../server/apex-architect.mjs';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const passagesRaw = JSON.parse(readFileSync(new URL('../server/book-passages.json', import.meta.url), 'utf8'));
const questionBank = JSON.parse(readFileSync(new URL('../server/question-bank.json', import.meta.url), 'utf8'));

const passagesByUnit = new Map();
for (const ctx of contexts) {
 const entry = passagesRaw?.units?.find(u => u.id === ctx.id);
 passagesByUnit.set(ctx.id, entry?.passages || []);
}

test('BookKnowledgeSearch: indexes 29 units + 1021-page passages & predicts 5-book 12/20 baraj', () => {
 const search = new BookKnowledgeSearch({ contexts, passagesByUnit, questionBank });
 const summary = search.getSummary();
 assert.ok(summary.totalIndexedDocs >= 400, `Expected >=400 indexed docs, got ${summary.totalIndexedDocs}`);
 assert.ok(summary.passageDocs >= 200);
 assert.ok(summary.bankDocs >= 100);

 const resVo2 = search.search('VO2max dayanıklılık', { limit: 8 });
 assert.equal(resVo2.ok, true);
 assert.ok(resVo2.durationMs < 150, `Expected <150ms BM25 search, took ${resVo2.durationMs}ms`);
 assert.ok(resVo2.hits.length >= 1);

 const resDyn = search.search('laktat eşiği', {
  extraApprovedQuestions: [
   { id: 'q-dyn-1', status: 'approved', unitId: '1-0', book: 'Hareket', unit: 'Enerji', question: 'Laktat eşiği hangi antrenmanla yükselir?', answer: 'Aerobik eşik yüklenmeleriyle', pages: [42] }
  ]
 });
 assert.ok(resDyn.hits.some(h => h.id === 'q-dyn-1'));

 const pred = search.predictExamReadiness({
  studentProfile: {
   studiedUnits: ['0-0', '0-1', '1-0', '1-1', '2-0'],
   results: {
    '0-0': { right: 9, wrong: 1, streak: 4, totalSec: 40 },
    '1-0': { right: 1, wrong: 4, streak: 0, totalSec: 95 }
   }
  },
  items: []
 });
 assert.equal(pred.ok, true);
 assert.equal(pred.books.length, 5);
 assert.ok(pred.books[0].estimatedOutOf20 > pred.books[1].estimatedOutOf20);
 assert.equal(pred.books[1].barajMet, false);
 assert.ok(pred.priorityActions.length >= 2);
});

test('ProjectLevelUpOrchestrator: evaluates 8 pillars and completes 100/100 verified evolution under 1s', async () => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tempo-levelup-'));
 try {
  const verifier100 = new HundredWayVerifier(tmp, process.cwd());
  const megaCorpus = new GithubMegaCorpus(tmp, { verifier100 });
  const paramMatrix = new BotParameterMatrix(tmp);
  const localAiTeam = new LocalAiTeamHub(tmp);
  const qwenCodeLab = new QwenCodeLab(tmp, process.cwd(), { verifier100 });
  const coderCouncil = new CoderCouncilHub(tmp, { verifier100 });
  const nexusFusion = new NexusTitanFusionModel(tmp, process.cwd(), { verifier100 });
  const curatorBot = new PoolCuratorBot(tmp);
  const githubMiner = new GithubKnowledgeMiner(tmp, { verifier100 });
  const evolver = new SandboxEvolver(tmp);
  const jarvis = new JarvisCore(tmp, process.cwd());
  const apex = new ApexArchitect(tmp);
  const bookSearch = new BookKnowledgeSearch({ contexts, passagesByUnit, questionBank });

  const orchestrator = new ProjectLevelUpOrchestrator({
   dataDir: tmp,
   verifier100,
   nexusFusion,
   megaCorpus,
   qwenCodeLab,
   coderCouncil,
   paramMatrix,
   localAiTeam,
   curatorBot,
   bookSearch,
   githubMiner,
   evolver,
   jarvis,
   apex,
   contexts,
   loadItemsFn: async () => [],
   getTelemetryFn: () => ({ approvalRate: 92, dualAnswerBlocked: 0 }),
   getModelsFn: () => [],
   getPoolSummaryFn: async () => ({ approvedCount: 180, unitsCount: contexts.length, totalLessons: 5 }),
   getTrainingPrepStatsFn: async () => ({ sftRows: 64, dpoRows: 40, codeRows: 24 })
  });

  const before = await orchestrator.evaluatePillarsAsync();
  assert.equal(before.pillars.length, 8);
  assert.ok(before.overallScore > 60 && before.overallScore <= 100);
  assert.ok(before.bottleneckPillar?.id);

  const res = await orchestrator.runFullProjectLevelUpCycle({ allowUiEvolution: false });
  assert.equal(res.ok, true);
  assert.equal(res.cycle, 1);
  assert.ok(res.durationMs < 1000, `Level-up cycle should finish <1000ms, took ${res.durationMs}ms`);
  assert.equal(res.verification100?.passedCount, 100);
  assert.equal(res.verification100?.approvedForProject, true);
  assert.ok(res.afterScore >= res.beforeScore);
  assert.ok(res.actionsTaken.length >= 4);

  const persisted = JSON.parse(await fs.readFile(path.join(tmp, 'ai-brain', 'project-levelup.json'), 'utf8'));
  assert.equal(persisted.cycles, 1);
 } finally {
  await fs.rm(tmp, { recursive: true, force: true });
 }
});
