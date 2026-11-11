import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
 HundredAiCouncil,
 HUNDRED_AI_ROSTER,
 DIFFICULTY_TIERS_4,
 GITHUB_BUGFIX_AND_IDIOMATIC_CORPUS,
 DOMAIN_MISCONCEPTION_PAIRS
} from '../server/hundred-ai-council.mjs';
import {
 BUGFIX_ROOTCAUSE_AND_IDIOMATIC,
 ACADEMIC_REASONING_CURRICULUM
} from '../server/github-mega-corpus.mjs';

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = server => new Promise(r => server.close(r));

test('100 farklı AI ajanı (5×20 kadro), 4-katmanlı RAG/Yazar/Çözen/Çeldirici/Editör direktifi ve GitHub bug-fix/Pythonic külliyatı', async () => {
 assert.equal(HUNDRED_AI_ROSTER.length, 100);
 const ids = new Set(HUNDRED_AI_ROSTER.map(a => a.id));
 assert.equal(ids.size, 100);
 const cohorts = {};
 for (const ag of HUNDRED_AI_ROSTER) {
  cohorts[ag.cohort] = (cohorts[ag.cohort] || 0) + 1;
 }
 assert.equal(cohorts.yazar, 20);
 assert.equal(cohorts.cozen, 20);
 assert.equal(cohorts.celdirici, 20);
 assert.equal(cohorts.editor, 20);
 assert.equal(cohorts.qwencode, 20);

 assert.deepEqual(DIFFICULTY_TIERS_4, ['kolay', 'orta', 'zor', 'imkansiz']);
 assert.ok(GITHUB_BUGFIX_AND_IDIOMATIC_CORPUS.length >= 5);
 assert.ok(DOMAIN_MISCONCEPTION_PAIRS.length >= 5);
 assert.ok(BUGFIX_ROOTCAUSE_AND_IDIOMATIC.length >= 4);
 assert.ok(ACADEMIC_REASONING_CURRICULUM.length >= 2);

 const dir = mkdtempSync(join(tmpdir(), 'tempo-100ai-'));
 try {
  const contexts = JSON.parse(await readFile(resolve('server/contexts.json'), 'utf8'));
  const council = new HundredAiCouncil({ dataDir: dir, contexts });

  const directive = council.buildLayeredWorkflowDirective('0-0');
  assert.match(directive, /KATMANLI 4-AŞAMALI/);
  assert.match(directive, /0\) RAG GEN HARİTASI/);
  assert.match(directive, /1\) YAZAR AJAN/);
  assert.match(directive, /2\) ÇÖZEN AJAN/);
  assert.match(directive, /3\) ÇELDİRİCİ MÜHENDİSİ/);
  assert.match(directive, /4\) EDİTÖR ÖZ-ELEŞTİRİ/);

  const hardQ = {
   id: 'test-hard',
   unitId: '0-0',
   question: 'I. Aerobik eşik şiddetinde laktat birikimi dengededir.\nII. Anaerobik eşik üzerinde glikolitik hız artar.\nIII. ATP-CP sistemi 2 saatlik maraton boyunca ana enerji kaynağıdır.\nYukarıdakilerden hangileri yanlıştır veya söylenemez?',
   options: ['Yalnız I', 'Yalnız III', 'I ve II', 'II ve III'],
   answer: 'Yalnız III',
   explanation: 'ATP-CP sistemi yalnız ilk 8-12 saniyelik patlayıcı yüklenmelerde baskındır; 2 saatlik maratonda aerobik sistem baskındır.'
  };
  const solvedHard = council.solveQuestionWith100AIs(hardQ);
  assert.ok(['zor', 'imkansiz'].includes(solvedHard.difficultyTier), `Beklenen zor/imkansiz, gelen: ${solvedHard.difficultyTier}`);
  assert.ok(solvedHard.predictedEliminationPct >= 50);
  assert.ok(solvedHard.aiReactions.length >= 2);
  assert.ok(solvedHard.misconceptionTraps.length >= 1);

  const easyQ = {
   id: 'test-easy',
   unitId: '0-0',
   question: 'Kalbin dakikalık atım hacmini ölçen temel birim aşağıdakilerden hangisidir?',
   options: ['Litre/dakika', 'Santimetre', 'Kilogram', 'Volt'],
   answer: 'Litre/dakika',
   explanation: 'Kardiyak debi (kalp debisi) dakika başına pompalanan kan hacmi olup litre/dakika ile ifade edilir.'
  };
  const solvedEasy = council.solveQuestionWith100AIs(easyQ);
  assert.ok(solvedEasy.predictedEliminationPct < solvedHard.predictedEliminationPct);

  const summary = await council.calibratePoolWith100AIs([hardQ, easyQ]);
  assert.equal(summary.poolCalibratedCount, 2);

  const evo = await council.evolveWithQwenCode(summary);
  assert.equal(evo.ok, true);
  assert.equal(evo.qwenEvolutionLevel, 2);
  assert.equal(evo.agentsUpgraded, 100);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('server/ollama.mjs 100-AI uç noktaları (/100-ai, /100-ai/solve-pool, /100-ai/evolve, /calibrated-bank) ve Test kısayollarının kaldırılması', async () => {
 const mainTsx = await readFile(resolve('src/main.tsx'), 'utf8');
 assert.doesNotMatch(mainTsx, /quiz-kbd-hint/, 'Test ekranı klavye kısayol ipucu kaldırılmış olmalı');
 assert.doesNotMatch(mainTsx, /window\.addEventListener\(['"]keydown['"]/, 'Test ekranı klavye kısayol dinleyicisi kaldırılmış olmalı');
 assert.match(mainTsx, /İmkânsız/, '4. seviye İmkânsız zorluk katmanı UI içinde yer almalı');
 assert.match(mainTsx, /%50 İki Şık Ele/, 'Oyunlaştırılmış joker UI içinde yer almalı');
 assert.match(mainTsx, /100 Yapay Zekâ Konseyi/, '100-AI çözüm analizi Test ekranında yer almalı');

 const dir = mkdtempSync(join(tmpdir(), 'tempo-100ai-http-'));
 const mockOllama = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }));
 });
 const ollamaPort = await listen(mockOllama);

 const prevEnv = {
  TEMPO_DATA_DIR: process.env.TEMPO_DATA_DIR,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  TEMPO_DISABLE_AUTOLOOP: process.env.TEMPO_DISABLE_AUTOLOOP,
  TEMPO_OFFLINE_ONLY: process.env.TEMPO_OFFLINE_ONLY
 };
 process.env.TEMPO_DATA_DIR = dir;
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${ollamaPort}`;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_OFFLINE_ONLY = '1';

 let appServer;
 try {
  const mod = await import(`../server/ollama.mjs?t=${Date.now()}`);
  const plugin = mod.ollamaPlugin();
  const middlewares = [];
  plugin.configureServer({
   middlewares: {
    use: (pathPrefix, fn) => {
     if (typeof pathPrefix === 'string' && typeof fn === 'function') middlewares.push({ pathPrefix, fn });
    }
   }
  });
  const mw = middlewares.find(m => m.pathPrefix === '/api/ollama');
  assert.ok(mw, '/api/ollama middleware kayıtlı olmalı');

  appServer = http.createServer((req, res) => {
   if (req.url.startsWith('/api/ollama')) {
    req.url = req.url.slice('/api/ollama'.length) || '/';
    mw.fn(req, res, () => {
     res.writeHead(404);
     res.end('Not found');
    });
   } else {
    res.writeHead(404);
    res.end();
   }
  });
  const port = await listen(appServer);

  const r100 = await fetch(`http://127.0.0.1:${port}/api/ollama/100-ai`);
  assert.equal(r100.status, 200);
  const d100 = await r100.json();
  assert.equal(d100.ok, true);
  assert.equal(d100.totalAgents, 100);
  assert.deepEqual(d100.difficultyTiers4, ['kolay', 'orta', 'zor', 'imkansiz']);
  assert.ok(d100.poolCalibratedCount >= 268);

  const rBank = await fetch(`http://127.0.0.1:${port}/api/ollama/calibrated-bank?tier=imkansiz`);
  assert.equal(rBank.status, 200);
  const dBank = await rBank.json();
  assert.equal(dBank.ok, true);
  assert.ok(dBank.tierCounts && typeof dBank.tierCounts.kolay === 'number');

  const rEvolve = await fetch(`http://127.0.0.1:${port}/api/ollama/100-ai/evolve`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}` },
   body: '{}'
  });
  assert.equal(rEvolve.status, 200);
  const dEvolve = await rEvolve.json();
  assert.equal(dEvolve.ok, true);
  assert.equal(dEvolve.agentsUpgraded, 100);
  assert.ok(dEvolve.qwenEvolutionLevel >= 2);
 } finally {
  if (appServer) await close(appServer);
  await close(mockOllama);
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(prevEnv)) {
   if (v === undefined) delete process.env[k];
   else process.env[k] = v;
  }
 }
});
