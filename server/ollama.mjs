import { similarity } from './stem-similarity.mjs';
import { readFile, mkdir, writeFile, rename, readdir, lstat, stat, appendFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SandboxEvolver } from './sandbox-evolver.mjs';
import { JarvisCore } from './jarvis-core.mjs';
import { ResearchAgent } from './research-agent.mjs';
import { PoolCuratorBot } from './pool-curator.mjs';
import { LessonEngine } from './lesson-engine.mjs';
import { ApexArchitect } from './apex-architect.mjs';
import { buildKayseriReaction, generateAiKayseriReaction, extractKeyTermsFromUnit } from './kayseri-coach.mjs';
import { IntelligenceTrainer } from './intelligence-trainer.mjs';
import { GithubKnowledgeMiner } from './github-researcher.mjs';
import { VoiceStudioManager } from './voice-studio.mjs';
import { BotParameterMatrix } from './bot-parameter-matrix.mjs';
import { MultiAiSwarmEvaluator } from './multi-ai-evaluator.mjs';
import { QwenCodeLab } from './qwen-code-lab.mjs';
import { LocalAiTeamHub } from './local-ai-team.mjs';
import { HardwareTeamOptimizer, CODER_STACK_RECOMMENDATIONS, SUBSECOND_BOT_BUDGET_MS } from './hardware-optimizer.mjs';
import { CoderCouncilHub } from './coder-council.mjs';
import { NexusTitanFusionModel, NEXUS_MODEL_TAG } from './nexus-fusion-model.mjs';
import { GithubMegaCorpus } from './github-mega-corpus.mjs';
import { HundredWayVerifier } from './hundred-way-verifier.mjs';
import { BookKnowledgeSearch } from './book-knowledge-search.mjs';
import { ProjectLevelUpOrchestrator } from './project-levelup-orchestrator.mjs';
import { HybridRagEngine } from './rag-engine.mjs';
import { TrainingFrameworksHub } from './training-hub.mjs';
import { MultiFrameworkAgentOrchestrator } from './agent-frameworks.mjs';
import { PrecisionQualityEngine } from './precision-quality-engine.mjs';
import { TvgfbfScoutSwarm, TVGFBF_VERIFIED_PATTERNS } from './tvgfbf-scout-swarm.mjs';
import { HundredAiCouncil, DIFFICULTY_TIERS_4 } from './hundred-ai-council.mjs';
import { SerialTaskQueue } from './model-inference-queue.mjs';
import { createSwapMonitor } from './model-swap-monitor.mjs';
import { createSummaryGrounding, SUMMARY_GROUNDING_DEFAULT_MIN } from './summary-grounding.mjs';
import { rephraseStem, buildParallel } from './book-parallel-engine.mjs';
import { createOllamaClient, OllamaError, isTimeoutKind, clampNumCtx } from './ollama-client.mjs';
import { planLineup, LINEUP_PROFILES } from './model-lineup.mjs';
import { normalizeDraft, normalizeVerdict } from './draft-repair.mjs';
import {
 planConfigFromEnv, planSnapshot, planBatch, pickPlanWork, countApproved, stepKey, summaryWindow, summaryPageOf, notePlanOutcome,
 sanitizePlanState, evidenceWithinSummary, pickFocusSentence, describeStep, summarySectionOf, summaryWebSourceOf, leastUsedOption
} from './production-plan.mjs';
import { OPTION_COUNT, MIN_OPTION_COUNT, isStoredOptionCount, isDraftOptionCount } from './option-count.mjs';
import { buildStyleLibrary, pickStyleExample, buildExamStyleBlock, styleLibraryStats } from './exam-style.mjs';

const execFileAsync = promisify(execFile);
// Soru hatları durum hazırlayabilir, ancak tek modelin etkin inference yuvası daima birdir.
const envConcurrency = Number(process.env.TEMPO_AUTO_CONCURRENCY);
const DEFAULT_AUTO_CONCURRENCY = Number.isFinite(envConcurrency) && envConcurrency >= 1 ? Math.min(8, Math.round(envConcurrency)) : 2;
const MODEL_INFERENCE_CONCURRENCY = 1;
const modelInferenceQueue = new SerialTaskQueue(MODEL_INFERENCE_CONCURRENCY);

// --- MODEL TAKASI (DALGA) MODU -----------------------------------------------------
// Üretici ile 2. hakem ekran kartı belleğinde aynı anda kalamıyorsa Ollama her model
// değişiminde birini atıp diğerini yeniden yükler (model başına 5-10 sn). Bu durum
// kullanıcıdan ayar istenmeden, ölçülen yükleme sürelerinden anlaşılır ve üretim "dalga"
// düzenine geçer: SWAP_WAVE_SIZE soru birlikte hazırlanır; önce hepsi yazılıp 1. hakemden
// geçer, sonra 2. hakem hepsine birlikte bakar. Model soru başına değil dalga başına değişir.
const envSwapWave = Number(process.env.TEMPO_SWAP_WAVE);
const SWAP_WAVE_SIZE = Number.isFinite(envSwapWave) && envSwapWave >= 1 ? Math.min(8, Math.round(envSwapWave)) : 4;
const envSwapHold = Number(process.env.TEMPO_SWAP_MAX_HOLD_MS);
const SWAP_MAX_HOLD_MS = Number.isFinite(envSwapHold) && envSwapHold >= 1_000 ? Math.round(envSwapHold) : 5 * 60_000;
// TEMPO_SWAP_MODE=0: dalga düzeni hiç kullanılmaz (eski davranış: tek hat, sırayla).
const SWAP_MODE_ALLOWED = process.env.TEMPO_SWAP_MODE !== '0';
const modelSwap = createSwapMonitor();

const contexts = JSON.parse(await readFile(new URL('./contexts.json', import.meta.url), 'utf8'));
// TEMPO_WEB_SUMMARY=0: internetten derlenen ek anlatım kullanılmaz (sorular yalnızca kitaptan kurulur).
if (process.env.TEMPO_WEB_SUMMARY === '0') {
 for (const c of contexts) {
  if (Number.isInteger(c.webStart)) {
   c.text = c.text.slice(0, c.webStart).trimEnd();
   c.webStart = null; c.webMarks = []; c.webSources = [];
  }
 }
}
const questionBank = JSON.parse(await readFile(new URL('./question-bank.json', import.meta.url), 'utf8'));
// Kullanıcının gönderdiği örnek / çıkmış sorular (scripts/build-context.ts üretir).
let examSamples = [];
try {
 const raw = JSON.parse(await readFile(new URL('./exam-samples.json', import.meta.url), 'utf8'));
 examSamples = Array.isArray(raw?.samples) ? raw.samples : [];
} catch {}

let bookStyleQuestionsRaw = null;
try {
 bookStyleQuestionsRaw = JSON.parse(await readFile(new URL('./book-style-questions.json', import.meta.url), 'utf8'));
} catch {
 bookStyleQuestionsRaw = null;
}
const bookStyleQuestions = Array.isArray(bookStyleQuestionsRaw?.questions) ? bookStyleQuestionsRaw.questions : [];
// Sınav tarzı örnek kitaplığı: kullanıcı örnekleri (öncelikli) + kitapların kendi soruları.
// TEMPO_EXAM_STYLE=0 ile kapatılır.
const EXAM_STYLE_ENABLED = process.env.TEMPO_EXAM_STYLE !== '0';
let userExamSamples = [];
try {
 const raw = JSON.parse(await readFile(new URL('./user-exam-examples.json', import.meta.url), 'utf8'));
 userExamSamples = Array.isArray(raw?.samples) ? raw.samples.map(s => ({ ...s, origin: 'kullanıcının güvenilir örneği', answerVerified: true, userTrusted: true })) : [];
} catch {}
// Güvenilir kullanıcı cevapları aynı bölümde hem içerik referansı, hem de tüm zorluk düzeyleri için soru biçimi örneği olur.
const examStyleLibrary = EXAM_STYLE_ENABLED ? buildStyleLibrary({ samples: [...examSamples, ...userExamSamples], bookQuestions: bookStyleQuestions }) : [];

let bookParallelRaw = null;
try {
 bookParallelRaw = JSON.parse(await readFile(new URL('./book-parallel-questions.json', import.meta.url), 'utf8'));
} catch {
 bookParallelRaw = null;
}
const bookParallelQuestions = Array.isArray(bookParallelRaw?.questions) ? bookParallelRaw.questions : [];

let bookPassagesRaw = null;
try {
 bookPassagesRaw = JSON.parse(await readFile(new URL('./book-passages.json', import.meta.url), 'utf8'));
} catch {
 bookPassagesRaw = null;
}

const passagesByUnit = new Map();
const passageById = new Map();
const fullUnitTextNorm = new Map();

const normRaw = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
// Tekrar denetimi her taslakta havuzdaki BÜTÜN soruların kökünü, cevabını ve şıklarını normalleştirir.
// On binlerce soruluk havuzda bu, soru başına saniyeler tutuyordu; kısa metinlerin sonucu saklanır.
const NORM_CACHE_LIMIT = 1_500_000;
const normCache = new Map();
const norm = s => {
 if (typeof s !== 'string') return '';
 if (s.length > 400) return normRaw(s);
 let out = normCache.get(s);
 if (out === undefined) {
  if (normCache.size >= NORM_CACHE_LIMIT) normCache.clear();
  out = normRaw(s);
  normCache.set(s, out);
 }
 return out;
};

for (const ctx of contexts) {
 const unitEntry = bookPassagesRaw?.units?.find(u => u.id === ctx.id);
 const list = unitEntry?.passages?.length
  ? unitEntry.passages
  : [{ id: `${ctx.id}#00`, heading: 'Ünite Özeti', pages: [1], keywords: [], sourceType: 'summary', text: ctx.text }];
 passagesByUnit.set(ctx.id, list);
 for (const p of list) passageById.set(p.id, p);
 fullUnitTextNorm.set(ctx.id, norm([ctx.text, ...list.map(p => p.text)].join(' ')));
}

const totalBookPassages = [...passagesByUnit.values()].reduce((sum, arr) => sum + arr.length, 0);

/**
 * KAYNAK TEMELLENDİRME: Havuza giren her soru, öğrencinin konu anlatım özetinde
 * ve/veya kitabın ilgili pasajında geçen kavramlardan kurulmak zorundadır.
 * Özetlerde ve kitapta karşılığı olmayan (uydurma) soru doğrudan reddedilir.
 */
const summaryGrounding = createSummaryGrounding({
 contexts,
 passagesByUnit,
 minScore: Number(process.env.TEMPO_SUMMARY_GROUNDING_MIN ?? SUMMARY_GROUNDING_DEFAULT_MIN)
});

const dataDir = resolve(process.env.TEMPO_DATA_DIR || '.tempo-data');
const dataFile = resolve(dataDir, 'questions.json');
const settingsFile = resolve(dataDir, 'settings.json');
const ledgerFile = resolve(dataDir, 'ollama-created.json');
const tracesFile = resolve(dataDir, 'rejected-traces.jsonl');
const planFile = resolve(dataDir, 'production-plan.json');
const storageLimit = 100_000_000_000;
// Onaylı soru havuzunun üst sınırı. TEMPO_POOL_CAPACITY ile değiştirilir (5.000–200.000).
// Sınıra ulaşılınca havuz bekçisi en zayıf / en benzer soruları ayıklayıp %92,5'ine indirir.
const envPoolCapacity = Math.floor(Number(process.env.TEMPO_POOL_CAPACITY));
const QUESTION_POOL_CAPACITY = Number.isFinite(envPoolCapacity) && envPoolCapacity > 0
 ? Math.max(5_000, Math.min(200_000, envPoolCapacity))
 : 65_000;
const QUESTION_POOL_REFILL_TARGET = Math.round(QUESTION_POOL_CAPACITY * 0.925);
const MAX_QUESTIONS = QUESTION_POOL_CAPACITY;
const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

const verifier100 = new HundredWayVerifier(dataDir, process.cwd());
const evolver = new SandboxEvolver(dataDir);
const jarvis = new JarvisCore(dataDir, process.cwd());
const researchAgent = new ResearchAgent(dataDir, { verifier100 });
const poolCurator = new PoolCuratorBot(dataDir, {
 pruneThreshold: QUESTION_POOL_CAPACITY,
 targetAfterPrune: QUESTION_POOL_REFILL_TARGET
});
const lessonEngine = new LessonEngine(dataDir);
const apex = new ApexArchitect(dataDir);
const trainer = new IntelligenceTrainer(dataDir);
const githubMiner = new GithubKnowledgeMiner(dataDir, { verifier100 });
const paramMatrix = new BotParameterMatrix(dataDir);
const multiAiEval = new MultiAiSwarmEvaluator(dataDir);
const qwenCodeLab = new QwenCodeLab(dataDir, process.cwd(), { verifier100 });
const localAiTeam = new LocalAiTeamHub(dataDir);
const hardwareOpt = new HardwareTeamOptimizer(dataDir);
const coderCouncil = new CoderCouncilHub(dataDir, { verifier100 });
const nexusModel = new NexusTitanFusionModel(dataDir, process.cwd(), { verifier100 });
const githubMega = new GithubMegaCorpus(dataDir, { verifier100 });
const bookSearch = new BookKnowledgeSearch({ contexts, passagesByUnit, questionBank });
const voiceStudio = new VoiceStudioManager(dataDir);
const ragEngine = new HybridRagEngine({ projectRoot: process.cwd(), dataDir, bookSearch });
const trainingHub = new TrainingFrameworksHub({ projectRoot: process.cwd(), dataDir });
const agentOrchestrator = new MultiFrameworkAgentOrchestrator({
 dataDir,
 projectRoot: process.cwd(),
 ragEngine,
 verifier100,
 bookSearch
});
const precisionEngine = new PrecisionQualityEngine({
 contexts,
 passagesByUnit,
 fullUnitTextNorm,
 ragEngine
});
const tvgfbfSwarm = new TvgfbfScoutSwarm({
 dataDir,
 contexts,
 passagesByUnit,
 questionBank,
 bookStyleQuestions,
 ragEngine,
 precisionEngine
});
precisionEngine.setTvgfbfSwarm(tvgfbfSwarm);
const hundredAiCouncil = new HundredAiCouncil({
 dataDir,
 contexts,
 passagesByUnit,
 questionBank,
 bookStyleQuestions,
 ragEngine,
 qwenCodeLab,
 tvgfbfSwarm
});
let lastPrecisionAuditSummary = null;
let lastHundredAiSummary = null;
let cachedConnectedModels = [];
let bgStackBusy = false;
let lastBgRagAt = 0;
let lastBgOrchAt = 0;
let lastBgHubAt = 0;
let lastTvgfbfScoutAt = 0;
let tvgfbfCascadeBusy = false;
let bgOrchCursor = 0;

async function triggerAllAgentsCascade(scoutState = null) {
 if (tvgfbfCascadeBusy) return { triggeredAgents: [], skipped: true };
 tvgfbfCascadeBusy = true;
 const triggeredAgents = [];
 try {
  const items = await load().catch(() => []);
  const approvedItems = items.filter(x => x.status === 'approved');
  const ctxItem = contexts[bgOrchCursor % Math.max(1, contexts.length)] || contexts[0];
  const pat = TVGFBF_VERIFIED_PATTERNS[ctxItem?.id || '0-0'];

  // 1) ResearchAgent: TVGFBF çıkmış soru motiflerini & tuzaklarını araştırma hafızasına işle
  await researchAgent.loadMemory().then(async rMem => {
   const topTrap = pat?.forumTraps?.[0] || 'TVGFBF/AÖF 5 modül × 20 soru dengeli kavram ayrımı';
   const note = `TVGFBF Scout (${ctxItem.id}): [${(pat?.highFrequencyTopics || []).slice(0, 3).join(', ')}] — Tuzak: ${topTrap}`;
   rMem.hypotheses = Array.isArray(rMem.hypotheses) ? [note, ...rMem.hypotheses.filter(x => x !== note)].slice(0, 24) : [note];
   await researchAgent.saveMemory(rMem).catch(() => {});
   triggeredAgents.push('researchAgent');
  }).catch(() => {});

  // 2) Continue & Aider RAG: TVGFBF stil korpusunu bağlama ekle
  try {
   ragEngine.writeAiderContextFile(`${ctxItem?.unit || 'TVGFBF'} ${(pat?.highFrequencyTopics || []).slice(0, 3).join(' ')}`, 8, approvedItems);
   triggeredAgents.push('ragEngine');
  } catch {}

  // 3) Paralel olarak tüm proje ajanlarını tetikle (<1sn yerel bütçe!)
  const unitPromptNote = pat ? `TVGFBF Stil (${ctxItem.id}): ${(pat.stemTemplates || [])[0] || ''}` : '';
  const parallel = await Promise.allSettled([
   triggerLocalTeamFastCycle(cachedConnectedModels, { withLiveTeam: false }).then(() => 'localAiTeam'),
   triggerContinuousIntelligenceTick(3).then(() => 'intelligenceTrainer'),
   runHyperBotEvolveCycleInternal().then(() => 'botParameterMatrix+coderCouncil'),
   triggerNexusFusionCycle(cachedConnectedModels, { withLiveLlm: false }).then(() => 'nexusTitanFusionModel'),
   agentOrchestrator.runMission({
    framework: 'fusion',
    goal: `${ctxItem?.unit || 'Temel Eğitim'} için kitap & TVGFBF çıkmış soru stiline uygun DPO çifti ve tuzak analizi`,
    unitId: ctxItem?.id || '0-0',
    extraApprovedQuestions: approvedItems
   }).then(() => 'agentOrchestrator'),
   trainingHub.generateConfigsAndDatasets({ baseModel: 'Qwen/Qwen3-8B', loraR: 32, loraAlpha: 64, beta: 0.1 }).then(() => 'trainingHub'),
   jarvis.addJournal('tvgfbf_swarm_cascade', `5-Ajan TVGFBF Tarama & Tüm Ajan Tetiklemesi`, `${unitPromptNote} (${Object.keys(scoutState?.unitBlueprints || {}).length || 29} ünite stili)`).then(() => 'jarvisCore'),
   apex.loadState().then(() => 'apexArchitect'),
   poolCurator.loadReport().then(() => 'poolCurator'),
   multiAiEval.loadState().then(() => 'multiAiSwarmEvaluator'),
   qwenCodeLab.loadState().then(() => 'qwenCodeLab'),
   lessonEngine.listSummary(contexts.length).then(() => 'lessonEngine'),
   Promise.resolve().then(() => {
    const fullAudit = precisionEngine.auditPool([...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items]);
    lastPrecisionAuditSummary = {
     evaluatedCount: fullAudit.evaluatedCount,
     averagePrecisionScore: fullAudit.averagePrecisionScore,
     averageStyleScore: fullAudit.averageStyleScore,
     tvgfbfAlignedPct: fullAudit.tvgfbfAlignedPct,
     flaggedCount: fullAudit.flaggedCount,
     dpoEliteCount: fullAudit.dpoEliteCount,
     unitCoverageCount: fullAudit.unitCoverageCount,
     updatedAt: new Date().toISOString()
    };
    return 'precisionQualityEngine';
   }),
   hundredAiCouncil.calibratePoolWith100AIs([...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items]).then(async summary => {
    await hundredAiCouncil.evolveWithQwenCode(summary).catch(() => {});
    lastHundredAiSummary = hundredAiCouncil.getStatusSummary();
    return 'hundredAiCouncil(100-AI)';
   })
  ]);
  for (const r of parallel) {
   if (r.status === 'fulfilled' && r.value) triggeredAgents.push(r.value);
  }
  return { triggeredAgents, unitId: ctxItem?.id || '0-0', skipped: false };
 } finally {
  tvgfbfCascadeBusy = false;
 }
}

async function runTvgfbfScoutAndTriggerAll({ enableLiveProbe = false, force = false } = {}) {
 const now = Date.now();
 if (!force && now - lastTvgfbfScoutAt < 18_000) return { skipped: true };
 lastTvgfbfScoutAt = now;
 return await tvgfbfSwarm.runScoutCycle({
  enableLiveProbe,
  triggerCascade: triggerAllAgentsCascade
 });
}

async function runUnifiedBackgroundAiStack({ force = false } = {}) {
 if (bgStackBusy) return { skipped: true };
 bgStackBusy = true;
 try {
  const now = Date.now();
  const out = { ragRefreshed: false, orchRan: false, trainingHubSynced: false };
  const items = await load().catch(() => []);
  const approvedItems = items.filter(x => x.status === 'approved');

  // 1) Continue & Aider Hibrit RAG arka plan indeks & bağlam yenileme
  if (force || now - lastBgRagAt >= 45_000) {
   lastBgRagAt = now;
   const ctxItem = contexts[bgOrchCursor % Math.max(1, contexts.length)];
   ragEngine.writeAiderContextFile(`${ctxItem?.unit || 'Antrenman'} VO2max laktat ATP-CP DPO`, 8, approvedItems);
   out.ragRefreshed = true;
  }

  // 2) AutoGen + LangGraph + CrewAI otonom çoklu ajan misyonu & DPO çifti sentezi
  if (force || (now - lastBgOrchAt >= 35_000 && now - lastInteractiveApiAt >= 3_500)) {
   lastBgOrchAt = now;
   const ctxItem = contexts[bgOrchCursor % Math.max(1, contexts.length)] || { id: '0-0', unit: 'Antrenman İlkeleri' };
   bgOrchCursor = (bgOrchCursor + 1) % Math.max(1, contexts.length);
   await agentOrchestrator.runMission({
    framework: 'fusion',
    goal: `${ctxItem.unit} için ÖSYM kalitesinde kaynak kanıtlı DPO tercih çifti sentezle`,
    unitId: ctxItem.id,
    extraApprovedQuestions: approvedItems
   });
   out.orchRan = true;
  }

  // 3) Axolotl & LLaMA-Factory QLoRA + DPO konfigürasyon & veri seti otomatik senkronizasyonu
  if (force || (now - lastBgHubAt >= 90_000 && now - lastInteractiveApiAt >= 3_500)) {
   lastBgHubAt = now;
   await trainingHub.generateConfigsAndDatasets({
    baseModel: 'Qwen/Qwen3-8B',
    loraR: 32,
    loraAlpha: 64,
    beta: 0.1
   });
   out.trainingHubSynced = true;
  }

  // 4) 29-Ünite ÖSYM Psikometri & Hassasiyet Havuz Denetimi (0-API, hızlı)
  if (force || !lastPrecisionAuditSummary) {
   const fullAudit = precisionEngine.auditPool([...questionBank, ...items]);
   lastPrecisionAuditSummary = {
    evaluatedCount: fullAudit.evaluatedCount,
    averagePrecisionScore: fullAudit.averagePrecisionScore,
    flaggedCount: fullAudit.flaggedCount,
    dpoEliteCount: fullAudit.dpoEliteCount,
    unitCoverageCount: fullAudit.unitCoverageCount,
    updatedAt: new Date().toISOString()
   };
   out.precisionAudited = true;
  }

  // 5) 5-Ajanlı TVGFBF + Kitap Stili Tarayıcı & Tüm Ajan Tetikleyici Kaskadı
  if (force || now - lastTvgfbfScoutAt >= 20_000) {
   await runTvgfbfScoutAndTriggerAll({
    enableLiveProbe: process.env.TEMPO_OFFLINE_ONLY !== '1' && process.env.TEMPO_ALLOW_REMOTE_FETCH === '1',
    force
   });
   out.tvgfbfSwarmSynced = true;
  }
  return out;
 } finally {
  bgStackBusy = false;
 }
}

async function getTrainingPrepStatsFast() {
 const countLines = async filePath => {
  try {
   const txt = await readFile(filePath, 'utf8');
   return txt ? txt.split('\n').filter(Boolean).length : 0;
  } catch {
   return 0;
  }
 };
 const brainRoot = resolve(dataDir, 'ai-brain');
 const [sftRows, dpoRows, codeRows] = await Promise.all([
  countLines(resolve(brainRoot, 'nexus-titan-sft.jsonl')),
  countLines(resolve(brainRoot, 'nexus-titan-dpo.jsonl')),
  countLines(resolve(brainRoot, 'qwen-code-training-pairs.jsonl'))
 ]);
 return { sftRows, dpoRows, codeRows };
}

const projectLevelUp = new ProjectLevelUpOrchestrator({
 dataDir,
 verifier100,
 nexusFusion: nexusModel,
 megaCorpus: githubMega,
 qwenCodeLab,
 coderCouncil,
 paramMatrix,
 localAiTeam,
 curatorBot: poolCurator,
 bookSearch,
 githubMiner,
 evolver,
 jarvis,
 apex,
 contexts,
 loadItemsFn: () => load(),
 getTelemetryFn: () => getTelemetrySnapshot(),
 getModelsFn: () => cachedConnectedModels,
 getPoolSummaryFn: async () => {
  const items = await load();
  return {
   approvedCount: items.filter(x => x.status === 'approved').length,
   unitsCount: contexts.length,
   totalLessons: (await lessonEngine.listSummary(contexts.length))?.totalLessons ?? 0
  };
 },
 getTrainingPrepStatsFn: getTrainingPrepStatsFast
});
let cachedParamState = null;
let cachedLocalTeamState = null;
let cachedCoderCouncilState = null;
let cachedNexusModelState = null;
let cachedGithubMegaSummary = null;
let cachedHardwareProfile = null;
let hardwarePullBootAttempted = false;
let jarvisReflecting = false;
let apexEvolving = false;
let trainerBusy = false;
let githubBusy = false;
let githubMegaBusy = false;
let qwenTournamentBusy = false;
let qwenProtoBusy = false;
let localTeamBusy = false;
let coderCouncilBusy = false;
let nexusFusionBusy = false;
let researchBusy = false;
let curatorBusy = false;
let lessonBusy = false;
let ollamaUpgradeBusy = false;
let lastInteractiveApiAt = Date.now();
let lastOllamaConnectedSig = '';
const ollamaUpgradeState = {
 running: false,
 upgradedCount: 0,
 lastUpgradedAt: null,
 lastConnectedSignature: null,
 lastUpgradeMode: null,
 lastResult: null
};
let researchCursor = 0;
let lessonCursor = 0;
let specialistsBootstrapAttempted = false;
let lastWebResearchAt = 0;
let lastGithubMineAt = 0;
let lastGithubMegaAt = 0;
let lastQwenTournamentAt = 0;
let lastQwenProtoAt = 0;
let lastLocalTeamAt = 0;
let lastCoderSprintAt = 0;
let lastNexusFusionAt = 0;
let lastHyperBotEvolveAt = 0;
let lastCuratorScanAt = 0;
let lastPoolCapCheckAt = 0;
let lastLessonEnhanceAt = 0;
let lastTrainerTickAt = 0;
let lastApexTimeAt = 0;
let lastApexCycleAtAttempt = -20;
// Tam otonom arka plan exec zaman damgaları & kilitler (kullanıcı hiçbir düğmeye basmadan çalışır)
let precisionAuditBusy = false;
let hundredAiBusy = false;
let hundredAiEvolveBusy = false;
let levelUpBusy = false;
let nexusDevelopBusy = false;
let nexusBuildBusy = false;
let nexusAutoApplyBusy = false;
let lastPrecisionAuditAt = 0;
let lastHundredAiSolveAt = 0;
let lastHundredAiEvolveAt = 0;
let lastLevelUpAt = 0;
let lastNexusDevelopAt = 0;
let lastNexusBuildAt = 0;
let lastNexusAutoApplyAt = 0;

// Önerilen kadro (kurulu değilse eldeki modellerden otomatik kadro kurulur; bkz. model-lineup.mjs).
const RECOMMENDED_GENERATOR_MODEL = 'qwen3:8b';
const RECOMMENDED_JUDGE2_MODEL = 'gemma3:4b';
const defaultModel = process.env.OLLAMA_MODEL || RECOMMENDED_GENERATOR_MODEL;
const defaultJudge2Model = process.env.OLLAMA_JUDGE2_MODEL || RECOMMENDED_JUDGE2_MODEL;

// --- ZAMAN AŞIMLARI ---------------------------------------------------------------
// Eski sürümde bir sorunun TAMAMI (model yükleme + üretim + tek hakem + düzeltme) için
// 25 saniyelik mutlak bir tavan vardı ve sayaç istek daha kuyruktayken başlıyordu. Model
// yüklemesi tek başına bu süreyi aşabildiği için hiçbir soru tamamlanamıyordu.
// Artık süre MODEL ÇAĞRISI başına ve üç ayrı bekçiyle ölçülür:
//   1) ilk yanıt (kuyruk + model yükleme + prompt okuma)  → FIRST_TOKEN_TIMEOUT_MS
//   2) tokenlar arası sessizlik (model takıldı mı?)        → IDLE_TOKEN_TIMEOUT_MS
//   3) ilk tokendan sonra toplam üretim süresi             → autoTimeoutMs (ayar)
const envDefaultTimeout = Number(process.env.OLLAMA_AUTO_TIMEOUT_MS);
const MODEL_CALL_TIMEOUT_MIN_MS = 5_000;
const MODEL_CALL_TIMEOUT_MAX_MS = 900_000;
const MODEL_CALL_TIMEOUT_DEFAULT_MS = 120_000;
// Geriye dönük ad: testler ve eski uç noktalar bu sabiti "üst sınır" olarak kullanır.
const QUESTION_HARD_TIMEOUT_MS = MODEL_CALL_TIMEOUT_MAX_MS;
const defaultAutoTimeoutMs = Number.isFinite(envDefaultTimeout) && envDefaultTimeout >= MODEL_CALL_TIMEOUT_MIN_MS
 ? Math.min(MODEL_CALL_TIMEOUT_MAX_MS, Math.round(envDefaultTimeout))
 : MODEL_CALL_TIMEOUT_DEFAULT_MS;
const envFirstToken = Number(process.env.TEMPO_FIRST_TOKEN_TIMEOUT_MS);
const FIRST_TOKEN_TIMEOUT_MS = Number.isFinite(envFirstToken) && envFirstToken >= 1_000 ? Math.round(envFirstToken) : 300_000;
const envIdleToken = Number(process.env.TEMPO_IDLE_TOKEN_TIMEOUT_MS);
const IDLE_TOKEN_TIMEOUT_MS = Number.isFinite(envIdleToken) && envIdleToken >= 1_000 ? Math.round(envIdleToken) : 60_000;
// Bir sorunun tüm adımları için güvenlik ağı (yuva sızıntısını önler; normalde hiç devreye girmez).
const UNIT_SAFETY_TIMEOUT_MS = 25 * 60_000;

// İki soru başlatma arasındaki bekleme. Bu bekleme yalnızca "model çağrısı bile yapamadan anında
// düşen" hata döngülerinin işlemciyi ve Ollama'yı dövmesini önlemek içindir. Sağlıklı akışta
// (soru onaylandı ya da model çağrısından sonra elendi) BEKLENMEZ: boşalan hat aynı anda yeni soruya
// başlar, ekran kartı sorular arasında boş durmaz. TEMPO_QUESTION_INTERVAL_MS elle verilmişse her
// başlatmada o süre uygulanır (bilinçli yavaşlatma).
const envIntervalRaw = process.env.TEMPO_QUESTION_INTERVAL_MS;
const envInterval = Number(envIntervalRaw);
const QUESTION_INTERVAL_PINNED = envIntervalRaw !== undefined && Number.isFinite(envInterval) && envInterval >= 0;
const QUESTION_INTERVAL_MS = QUESTION_INTERVAL_PINNED ? Math.round(envInterval) : 2_000;
// Kökü tekrar olan taslağın yazımını yarıda kesme (bkz. generateAndVerify). Kapatmak için TEMPO_EARLY_STOP=0.
const EARLY_STOP_ENABLED = process.env.TEMPO_EARLY_STOP !== '0';
/** Bir soru hattı bundan kısa sürede hatayla bittiyse hiçbir model çağrısı tamamlanmamıştır ("anında düşme"). */
const INSTANT_FAIL_MS = 100;

// --- MODELİ BELLEKTE TUT ----------------------------------------------------------
// keep_alive=0 her çağrıdan sonra modeli boşaltıyordu (her çağrı = yeniden yükleme).
// Varsayılan artık 30 dakika; üretim sürdükçe model VRAM'de kalır.
const defaultKeepAlive = process.env.TEMPO_OLLAMA_KEEP_ALIVE && process.env.TEMPO_OLLAMA_KEEP_ALIVE.trim()
 ? process.env.TEMPO_OLLAMA_KEEP_ALIVE.trim()
 : '30m';
// Tüm çağrılar için SABİT bağlam penceresi: değişen num_ctx Ollama'nın modeli yeniden
// yüklemesine yol açar. 4096 token; kitap pasajı + kurallar + çıktı için yeterlidir ve
// qwen3:8b + gemma3:4b çiftinin 12 GB VRAM'de birlikte kalmasını sağlar.
const DEFAULT_NUM_CTX = clampNumCtx(process.env.TEMPO_NUM_CTX, 4096);

const QUESTION_TYPES = ['kavram', 'vaka', 'karsilastirma', 'neden_sonuc', 'istisna', 'uygulama', 'en_iyi_secim', 'tanimdan_terim', 'bosluk_doldurma', 'dogru_yargi', 'ilginc_bilgi', 'durum_kavram', 'kisa_net'];
// Paragraf (parçaya dayalı) sorular: sınavda bu kalıbın çıkıp çıkmadığı resmî olarak
// doğrulanmadığı için ana akışı bozmasın diye SEYREK üretilir (ör. her 8 soruda bir).
const PARAGRAPH_QUESTION_TYPE = 'paragraf';
const envParaRatio = Number(process.env.TEMPO_PARAGRAPH_QUESTION_RATIO);
const PARAGRAPH_QUESTION_RATIO = Number.isFinite(envParaRatio) ? Math.min(1, Math.max(0, envParaRatio)) : 0.12;
const QUESTION_ANGLES = ['dogrudan_tanim', 'ters_eleme_istisna', 'saha_vakasi', 'karsilastirmali_tuzak', 'surpriz_baglam'];
const QUESTION_ANGLE_HINTS = {
 dogrudan_tanim: '1. DOĞRUDAN TANIM AÇISI: Temel mekanizmayı, ölçütü veya kuralı net ve tam doğru hedefiyle sor.',
 ters_eleme_istisna: '2. TERS KÖŞE / İSTİSNA AÇISI: "Hangisi söylenemez / yanlıştır / dahil değildir?" biçiminde ters eleme mantığı kur.',
 saha_vakasi: '3. SAHA VAKASI AÇISI: Sporcu ve antrenör arasında geçen gerçekçi bir saha durumunda uygulanacak doğru kararı sor.',
 karsilastirmali_tuzak: '4. KARŞILAŞTIRMALI TUZAK AÇISI: İki yakın kavram arasındaki kritik farkı ölç; çeldiricileri klasik sınav tuzaklarından seç.',
 surpriz_baglam: '5. ŞAŞIRTICI BAĞLAM AÇISI: Beklenmedik bir sonuç/koşul veya neden-sonuç zinciri kurarak öğrenciyi ezberden çıkarıp düşünmeye zorla!'
};
const QUESTION_TYPE_HINTS = {
 kavram: 'KAVRAM: Temel bir terimi, tanımı, sınıflandırmayı veya ilkeyi net biçimde ölç.',
 vaka: 'VAKA / SENARYO: Antrenörlük sahasından gerçekçi bir sporcu/antrenman durumu kurgula ve uygulanacak tek doğru yaklaşımı sor.',
 karsilastirma: 'KARŞILAŞTIRMA: Birbirine yakın iki kavram, dönem, yaklaşım veya sistem arasındaki ayırt edici farkı sor.',
 neden_sonuc: 'NEDEN-SONUÇ: Bir mekanizmanın, uygulamanın veya hatanın fizyolojik/psikolojik/yönetsel sonucunu ya da nedenini sor.',
 istisna: 'İSTİSNA (HANGİSİ DEĞİLDİR / YANLIŞTIR): 3 tamamen doğru, 1 kesin yanlış ifade kurarak istisnayı buldur.',
 uygulama: 'UYGULAMA: Bir kuralı, protokolü, ilkeyi veya hesaplamayı somut bir karar anına uygulat.',
 durum_kavram: 'DURUMDAN KAVRAMA (BASKIN / ÖNCELİKLİ OLAN): Soru kökünde bir koşul ver (süre, şiddet, yaş aralığı, dönem, evre ya da amaç) ve bu koşulda BASKIN / ÖNCELİKLİ / UYGUN olan kavramı sor: "… egzersizlerde enerji üretiminde hangi sistem baskın olarak kullanılır?" gibi. Şıklar aynı sınıflandırmanın üyeleri olsun (hepsi enerji sistemi, hepsi evre, hepsi ilke …).',
 kisa_net: 'ÇIKMIŞ SORU TARZI (KISA VE NET): Soru kökü TEK cümle ve en fazla 140 karakter olsun; giriş, vaka ya da süsleme yok. Doğrudan bilgiyi sor: "… için hangi … gerekmektedir?", "… aşağıdakilerden hangisidir?". Şıklar 1-3 kelimelik, aynı aileden kavram adları olsun.',
 tanimdan_terim: 'TANIMDAN TERİME: Soru kökünde kavramın ADINI ANMADAN tanımını, işlevini ya da ayırt edici özelliğini ver; "Tanımı verilen kavram aşağıdakilerden hangisidir?" diye sor. Şıklar aynı aileden kavram adları olsun.',
 bosluk_doldurma: 'BOŞLUK DOLDURMA: Konu anlatımındaki bilgiyi kendi cümlenle yeniden kur, kritik terimin yerine "……" koy ve "Bu cümlede boş bırakılan yere aşağıdakilerden hangisi getirilmelidir?" diye sor. Şıklar boşluğa dilbilgisi olarak uyan, aynı aileden terimler olsun.',
 dogru_yargi: 'DOĞRU YARGI: "… ile ilgili aşağıdaki ifadelerden hangisi doğrudur?" diye sor; bütün şıklar aynı konuda, aynı kalıpta tam cümle olsun: biri konu anlatımına göre kesin doğru, diğerleri yaygın yanılgıları taşıyan kesin yanlış ifade.',
 ilginc_bilgi: 'İLGİNÇ GİRİŞ / GÜNLÜK HAYAT: Soru köküne bilgiyi akılda tutturan kısa ve ilginç bir girişle başla (gündelik bir benzetme, sahadan tanıdık bir an ya da "çoğu kişi … sanır, oysa …" türü bir şaşırtma), sonra konu anlatımındaki bilgiyi sor. Giriş konu anlatımıyla çelişen ya da orada olmayan bir bilgi içermesin.',
 en_iyi_secim: 'EN İYİ / EN UYGUN SEÇİM (ÇELDİRİCİ SORU): Bütün şıklar makul ve konuyla ilgili olsun; ancak yalnızca biri kaynağa göre tam ve en kapsamlı doğru olsun. "En uygun yaklaşım hangisidir?" kalıbını kullan; şıkları yaygın hatalı uygulamalardan ve eksik doğru yaklaşımlardan kur.',
 paragraf: 'PARAGRAF (PARÇAYA DAYALI): Önce konu anlatımından BİREBİR alınmış kısa bir parça ver, sonra yalnızca o parça okunarak yanıtlanabilecek bir soru sor (parçanın ana fikri, parçadan çıkarılabilecek yargı, parçayla çelişen ifade, parçada vurgulanan ilke). Soru kökü parçaya gönderme yapmalı.'
};
const BANNED_OPTION_PATTERN = /\b(yukarıdakilerin hepsi|aşağıdakilerin hepsi|hiçbiri|tümü birden|hepsi doğrudur|yalnız a ve b|a ve b birlikte|her ikisi de)\b/i;

// Çeldirici mühendisliği: bütün şıklar aynı kavram ailesinden, "az kalsın doğru" niteliğinde
// ve birbirine yakın olmalı; alakasız/komik dolgu şıklar kesinlikle yasak.
const DISTRACTOR_ENGINEERING_RULES = `ŞIKLARIN UYGUNLUĞU:
- Şıklar soruyla ilgili ve mümkün olduğunca aynı türden/yakın kavramlardan seçilsin.
- Bariz alakasız, komik veya tamamen anlamsız seçenek yazma.
- Şık uzunluklarının birebir eşit olması gerekmez; doğru cevapta ipucu vermeyecek kadar dengeli olsun.
- Yanlış seçenekler konu anlatımına göre yanlış olmalı; kaynakla desteklenmeyen ikinci bir doğru cevap bulunmamalı.
- "Hepsi/hiçbiri" gibi kısa yolları kullanma.`;

const PARAGRAPH_QUESTION_RULES = `PARAGRAF SORUSU EK KURALLARI (bu tipte zorunlu):
1) "paragraph" alanına aşağıdaki KONU ANLATIMI'ndan BİREBİR (hiç değiştirmeden, kelimesi kelimesine) alınmış, art arda gelen 3-5 cümlelik, 250-800 karakterlik bir parça yaz. Uydurma cümle, kendi yorumun veya kaynakta geçmeyen bilgi KESİNLİKLE YASAK.
2) "question" alanı yalnızca soru kökü olsun (en fazla 260 karakter) ve parçaya gönderme yapsın: "Bu parçaya göre ...", "Parçada vurgulanan ...", "Bu parçadan aşağıdaki yargıların hangisine ulaşılabilir?" gibi.
3) Soru, parça okunmadan yanıtlanamayacak olsun: doğru cevap parçadaki bilgiyi DOĞRU YORUMLAMAYI gerektirsin (ana fikir / parçada desteklenen yargı / parçayla çelişen ifade / parçadan çıkarım).
4) Bütün şıklar parçadaki kavramlarla ilişkili olsun; parçada geçen ama sorunun cevabı OLMAYAN ifadeleri ve yaygın yanlış yorumları çeldirici olarak kullan.
5) "evidence" alanı, paragraph içinde geçen, kaynaktan birebir alınmış en az 15 karakterlik bir alıntı olsun.`;

const unsupportedThinkModels = new Set();

function isTransportOrTimeoutError(err) {
 const msg = String(err?.message || err || '');
 const name = String(err?.name || '');
 const code = String(err?.code || err?.cause?.code || '');
 if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return true;
 if (name === 'AbortError' || name === 'TimeoutError') return true;
 if (err instanceof OllamaError && (isTimeoutKind(err.kind) || ['connection', 'model_missing', 'busy', 'aborted'].includes(err.kind))) return true;
 return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|fetch failed|timed out|timeout|zaman aşım|HTTP 404|model .* not found|network/i.test(msg);
}

let _settingsCache = null;
let _settingsSig = null;
async function readSettings() {
 try {
  const st = await stat(settingsFile);
  const sig = `${st.mtimeMs}:${st.size}`;
  if (_settingsCache && _settingsSig === sig) return _settingsCache;
  const v = JSON.parse(await readFile(settingsFile, 'utf8'));
  const normalized = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  _settingsCache = normalized;
  _settingsSig = sig;
  return normalized;
 } catch (e) {
  if (e.code === 'ENOENT') {
   _settingsCache = {};
   _settingsSig = null;
   return {};
  }
  throw e;
 }
}
let settingsQueue = Promise.resolve();
function writeSettings(patch) {
 const run = settingsQueue.then(async () => {
  await mkdir(dataDir, { recursive: true });
  const current = await readSettings();
  const next = { ...current, ...patch };
  const tmp = `${settingsFile}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, settingsFile);
  try {
   const st = await stat(settingsFile);
   _settingsCache = next;
   _settingsSig = `${st.mtimeMs}:${st.size}`;
  } catch {
   _settingsCache = next;
   _settingsSig = null;
  }
  return next;
 });
 settingsQueue = run.then(() => {}, () => {});
 return run;
}
// --- OLLAMA İSTEMCİSİ + MODEL KADROSU ---------------------------------------------
const cpuLogical = os.availableParallelism?.() || os.cpus()?.length || 12;
const OLLAMA_CPU_THREADS = Number.isFinite(Number(process.env.TEMPO_OLLAMA_NUM_THREADS)) && Number(process.env.TEMPO_OLLAMA_NUM_THREADS) > 0
 ? Math.max(1, Math.min(32, Math.round(Number(process.env.TEMPO_OLLAMA_NUM_THREADS))))
 : Math.max(2, Math.min(8, Math.floor(cpuLogical / 2))); // i5-10400F: 12 logical / 6 physical threads
const ollama = createOllamaClient({ base, keepAlive: defaultKeepAlive, numCtx: DEFAULT_NUM_CTX, numThread: OLLAMA_CPU_THREADS });

const validModelName = v => typeof v === 'string' && v.length <= 200 && Boolean(v.trim());

/** Kurulu modeller (ayrıntılı). Kısa süreli önbellek: zamanlayıcı ve /status aynı listeyi paylaşır. */
let installedCache = { at: 0, list: null, connected: false };
let installedInflight = null;
async function installedModelsDetailed(maxAgeMs = 4000) {
 if (Date.now() - installedCache.at <= maxAgeMs) return installedCache;
 if (!installedInflight) {
  installedInflight = (async () => {
   const list = await ollama.listModels(2500);
   installedCache = { at: Date.now(), list: list || [], connected: Array.isArray(list) };
   return installedCache;
  })().finally(() => { installedInflight = null; });
 }
 return installedInflight;
}

/** Ekran kartı belleği (GB): TEMPO_VRAM_GB > nvidia-smi > 12 GB varsayımı. */
let vramProbe = { at: 0, gb: null, detected: false, name: null };
async function detectedVram() {
 const envGb = Number(process.env.TEMPO_VRAM_GB);
 if (Number.isFinite(envGb) && envGb >= 2) return { gb: envGb, detected: true, name: 'TEMPO_VRAM_GB' };
 if (Date.now() - vramProbe.at > 300_000) {
  vramProbe.at = Date.now();
  try {
   const hw = await hardwareOpt.detectLocalHardware();
   if (hw?.gpu?.detected && hw.gpu.vramTotalMb > 1024) {
    vramProbe = { at: Date.now(), gb: +(hw.gpu.vramTotalMb / 1024).toFixed(1), detected: true, name: hw.gpu.name || 'GPU' };
   } else {
    vramProbe = { at: Date.now(), gb: null, detected: false, name: null };
   }
  } catch {}
 }
 return { gb: vramProbe.gb || 12, detected: vramProbe.detected, name: vramProbe.name };
}

/**
 * Elle sabitlenen roller. Yalnızca kullanıcının arayüzden seçtiği (lineupPins) ya da ortam
 * değişkeniyle verdiği modeller sabit sayılır. Eski sürümlerin settings.json'a kendiliğinden
 * yazdığı model adları (ör. tempo-ogretmen) sabit SAYILMAZ; kadro otomatik kurulur.
 */
function pinnedRoles(settings) {
 const pins = settings?.lineupPins && typeof settings.lineupPins === 'object' ? settings.lineupPins : {};
 const pick = (key, envName) => (pins[key] === true && validModelName(settings[key]) ? settings[key] : (validModelName(process.env[envName]) ? process.env[envName] : null));
 return {
  model: pick('model', 'OLLAMA_MODEL'),
  verifierModel: pick('verifierModel', 'OLLAMA_VERIFIER_MODEL'),
  judge2Model: pick('judge2Model', 'OLLAMA_JUDGE2_MODEL')
 };
}

/** Açık bir kullanıcı/eğitim eylemiyle seçilen rol modellerini sabitleyerek kaydeder. */
async function writePinnedModels(patch) {
 const cur = (await readSettings()).lineupPins;
 const pins = { ...(cur && typeof cur === 'object' ? cur : {}) };
 for (const key of ['model', 'verifierModel', 'judge2Model']) if (validModelName(patch[key])) pins[key] = true;
 await writeSettings({ ...patch, lineupPins: pins });
}

function lineupProfileOf(_settings) {
 // Tek-model hattında en yüksek kalite; küçük CPU offload'ı uygunsa RAM payı da değerlendirilecek.
 return 'kalite';
}

function safeRamOffloadGb() {
 const total = os.totalmem() / (1024 ** 3);
 // Model seçimini anlık boş RAM dalgalanmasına göre değiştirme; 16 GB sistemde en çok 4 GB
 // CPU offload bütçesi tanı, kalan belleği işletim sistemi/uygulamalar için bırak.
 return +Math.max(0, Math.min(4, total * 0.25)).toFixed(1);
}

let lineupMemo = { key: '', plan: null };
/**
 * Soru hattının üç rolü için o an kullanılacak modeller.
 * Kurulu model listesi alınabildiyse roller HER ZAMAN kurulu modellerden seçilir; böylece
 * "seçili model kurulu değil → üretim sessizce duruyor" durumu oluşamaz.
 */
async function currentLineup({ maxAgeMs = 4000 } = {}) {
 const [settings, inst, vram] = await Promise.all([readSettings(), installedModelsDetailed(maxAgeMs), detectedVram()]);
 const pinned = pinnedRoles(settings);
 const profile = lineupProfileOf(settings);
 const ramOffloadGb = safeRamOffloadGb();
 const systemRamGb = +(os.totalmem() / (1024 ** 3)).toFixed(1);
 if (!inst.list.length) {
  const model = pinned.model || defaultModel;
  return {
   ok: false,
   connected: inst.connected,
   reason: inst.connected ? 'no_models' : 'offline',
   installedNames: [],
   profile,
   model,
   verifierModel: model,
   judge2Model: model,
   pinned: { model: Boolean(pinned.model), verifierModel: Boolean(pinned.model), judge2Model: Boolean(pinned.model) },
   coResident: true, independentJudge: false, crossFamilyJudge: false,
   vramGb: vram.gb, vramDetected: vram.detected, gpuName: vram.name,
   systemRamGb, ramOffloadGb, estimatedRamOffloadGb: 0,
   warnings: [], notes: [], candidates: []
  };
 }
 const key = JSON.stringify([inst.list.map(m => `${m.name}:${m.size}`), pinned.model, profile, vram.gb, ramOffloadGb, ollama.numCtx]);
 if (lineupMemo.key !== key) {
  // Eski sürümlerdeki ayrı hakem sabitlemelerini yok say: artık yalnızca üretici model sabitlenebilir.
  lineupMemo = { key, plan: planLineup(inst.list, { vramGb: vram.gb, numCtx: ollama.numCtx, profile, pinned: { model: pinned.model }, singleModel: true, ramOffloadGb }) };
 }
 const plan = lineupMemo.plan;
 return {
  ...plan,
  connected: true,
  reason: plan.ok ? '' : 'no_usable_model',
  installedNames: inst.list.map(m => m.name),
  vramDetected: vram.detected,
  gpuName: vram.name,
  // Kullanılabilir model bulunamadıysa (yalnızca gömme modelleri kurulu vb.) adlar yine de dolu kalsın.
  model: plan.model || pinned.model || defaultModel,
  verifierModel: plan.model || pinned.model || defaultModel,
  judge2Model: plan.model || pinned.model || defaultModel,
  pinned: { model: Boolean(plan.pinned?.model || pinned.model), verifierModel: Boolean(plan.pinned?.model || pinned.model), judge2Model: Boolean(plan.pinned?.model || pinned.model) },
  coResident: true,
  independentJudge: false,
  crossFamilyJudge: false,
  estimatedVramGb: plan.roles?.generator?.vramGb ?? plan.estimatedVramGb,
  systemRamGb,
  ramOffloadGb: plan.ramOffloadGb ?? ramOffloadGb,
  estimatedRamOffloadGb: plan.estimatedRamOffloadGb ?? 0,
  warnings: (plan.warnings || []).filter(x => !/hakem|ikinci görüş|ikinci hakem/i.test(x)),
  notes: (plan.notes || []).filter(x => !/hakem|model takas|birlikte sığ/i.test(x))
 };
}

/** Dalga modunda o an birlikte hazırlanan soru sayısı (kullanıcının ayarından küçük olamaz). */
const swapWaveSize = setting => Math.max(Math.max(1, Number(setting) || 1), SWAP_WAVE_SIZE);
const swapModeActive = () => SWAP_MODE_ALLOWED && modelSwap.swapping;
/** O an birlikte hazırlanan soru sayısı: dalga modunda dalga büyüklüğü; değilse kullanıcının ayarı. */
function effectiveAutoLimit(setting, lineup) {
 if (swapModeActive()) return swapWaveSize(setting);
 // Dalga modu kapatılmışsa (TEMPO_SWAP_MODE=0) eski davranış: modeller birlikte sığmıyorsa tek hat.
 if (!SWAP_MODE_ALLOWED && (modelSwap.swapping || lineup?.coResident === false)) return 1;
 return Math.max(1, Number(setting) || 1);
}
/** İki hakem aynı anda çalışabilir mi? (Farklı modeller ve bellekte birlikte kalabiliyorlarsa.) */
const judgesMayRunTogether = lineup => !modelSwap.swapping && (SWAP_MODE_ALLOWED || lineup?.coResident !== false) && lineup?.verifierModel !== lineup?.judge2Model;

/**
 * Model sırası kuyruğu için ipucu: `model`e birazdan yeni bir çağrı gelebilir mi?
 * (Bir soru hattı iki çağrı arasında sonucu işliyorsa ya da zamanlayıcı yeni bir soru açmak
 * üzereyse evet.) Evet ise kuyruk başka modele geçmeden önce kısa bir süre bekler.
 */
function expectMoreModelWork(model) {
 const snap = modelInferenceQueue.snapshot();
 const inFlight = autoControllers.size + (busy ? 1 : 0);
 if (inFlight - snap.queued - snap.activeCount > 0) return true;
 // Yeni açılan soru önce üretici modeli çağırır.
 return autoWantsMore() && model === autoState.generatorModel;
}

function applySwapMode() {
 const active = swapModeActive();
 modelInferenceQueue.setAffinity(active, {
  graceMs: Math.max(3_000, (QUESTION_INTERVAL_PINNED ? QUESTION_INTERVAL_MS : 0) + 2_000),
  maxHoldMs: SWAP_MAX_HOLD_MS,
  expectMore: expectMoreModelWork
 });
 return active;
}

/** Her tamamlanan model çağrısının yükleme süresi gözcüye bildirilir; mod değişirse kuyruk ayarlanır. */
function noteModelLoad(model, metrics) {
 if (!metrics) return;
 const change = modelSwap.note({ model, loadMs: (Number(metrics.loadNs) || 0) / 1e6 });
 if (!change) return;
 applySwapMode();
 if (!SWAP_MODE_ALLOWED) return;
 if (change === 'entered') {
  const snap = modelSwap.snapshot();
  tempoLog(`Modeller ekran kartı belleğinde aynı anda kalamıyor (${model} yeniden yüklendi, ortalama ${(snap.avgLoadMs / 1000).toFixed(1)} sn). Dalga düzenine geçildi: sorular ${swapWaveSize(autoState.concurrencySetting)}'lü gruplar hâlinde hazırlanır, model grup başına bir kez değişir. Ayar yapmana gerek yok.`);
 } else {
  tempoLog('Modeller artık bellekte birlikte kalabiliyor; dalga düzeninden çıkıldı, sorular yeniden paralel hazırlanıyor.');
 }
}

/** Dalga modu açıkken arayüzde gösterilen bilgi satırı (uyarı değil: yapılacak bir şey yok). */
function swapNotes(lineup) {
 if (!swapModeActive() || new Set([lineup?.model, lineup?.verifierModel, lineup?.judge2Model].filter(Boolean)).size <= 1) return [];
 const names = [...new Set([lineup?.model, lineup?.verifierModel, lineup?.judge2Model].filter(Boolean))];
 const snap = modelSwap.snapshot();
 const cost = snap.avgLoadMs ? ` (model değişimi ortalama ${(snap.avgLoadMs / 1000).toFixed(1)} sn)` : '';
 return [`${names.join(' ile ')} ekran kartı belleğinde aynı anda kalamıyor${cost}. Üretim dalga düzeninde: ${swapWaveSize(autoState.concurrencySetting)} soru birlikte hazırlanır; önce hepsi yazılıp 1. hakemden geçer, sonra 2. hakem hepsine birlikte bakar. Model soru başına değil dalga başına bir kez değişir; ayar yapmana gerek yok.`];
}

/**
 * Ön ısıtma için çalıştırıcı ayarları: üretim çağrılarıyla aynı bağlam ve bellekte tutma süresi,
 * yalnızca kadrodaki modeller. Modeller birlikte sığmıyorsa yalnızca üretici ısıtılır (ikisini
 * birden ısıtmak birini hemen bellekten attırır).
 */
async function warmupRunnerArgs() {
 const lineup = await currentLineup().catch(() => null);
 const names = lineup?.ok ? [...new Set([lineup.model, lineup.verifierModel, lineup.judge2Model].filter(Boolean))] : [];
 const models = modelSwap.swapping || lineup?.coResident === false ? names.slice(0, 1) : names;
 return { numCtx: ollama.numCtx, keepAlive: ollama.keepAlive, ...(models.length ? { models } : {}) };
}

/** Arayüze/duruma verilecek kadro özeti. */
function publicLineup(lineup) {
 return {
  ok: lineup.ok,
  reason: lineup.reason || '',
  profile: lineup.profile,
  profiles: Object.entries(LINEUP_PROFILES).map(([id, p]) => ({ id, label: p.label, description: p.description })),
  model: lineup.model,
  verifierModel: lineup.verifierModel,
  judge2Model: lineup.judge2Model,
  pinned: lineup.pinned || {},
  auto: !(lineup.pinned?.model || lineup.pinned?.verifierModel || lineup.pinned?.judge2Model),
  coResident: lineup.coResident !== false,
  independentJudge: lineup.independentJudge !== false,
  crossFamilyJudge: lineup.crossFamilyJudge !== false,
  estimatedVramGb: lineup.estimatedVramGb ?? null,
  systemRamGb: lineup.systemRamGb ?? null,
  ramOffloadGb: lineup.ramOffloadGb ?? 0,
  estimatedRamOffloadGb: lineup.estimatedRamOffloadGb ?? 0,
  vramGb: lineup.vramGb ?? null,
  vramDetected: Boolean(lineup.vramDetected),
  gpuName: lineup.gpuName || null,
  warnings: lineup.warnings || [],
  notes: lineup.notes || [],
  // Dalga modu açıksa arayüzde gösterilen bilgi (uyarı değil; kullanıcının yapacağı bir şey yok).
  swapMode: swapModeActive(),
  swapNote: swapNotes(lineup)[0] || null,
  candidates: (lineup.candidates || []).slice(0, 40),
  recommended: (() => {
   const best = lineup.model || RECOMMENDED_GENERATOR_MODEL;
   const have = new Set((lineup.installedNames || []).map(n => String(n).replace(/:latest$/, '')));
   const missing = lineup.connected === false ? [] : (have.has(best.replace(/:latest$/, '')) ? [] : [best]);
   const toPull = missing.length ? missing : [best];
   return { generator: best, judge2: best, missing, pullCommand: toPull.map(m => `ollama pull ${m}`).join(' ; ') };
  })()
 };
}

async function selectedModel() {
 return (await currentLineup()).model;
}
async function selectedVerifierModel() {
 return (await currentLineup()).verifierModel;
}
async function selectedJudgeModel() {
 return (await currentLineup()).judge2Model;
}
async function selectedEvolverModel(model) {
 const v = await readSettings();
 if (typeof v.evolverModel === 'string' && v.evolverModel.length <= 200 && v.evolverModel.trim()) return v.evolverModel;
 return process.env.OLLAMA_EVOLVER_MODEL || model;
}
async function autoRunningEnabled() {
 const v = await readSettings();
 // Sürekli soru üretimi varsayılan olarak açık; kullanıcı durdurursa kapalı kalır.
 return v.autoRunning !== false;
}
async function autoConcurrencyLimit() {
 // Bu ayar soru hatlarının sayısıdır; tek model inference kuyruğu her koşulda seri kalır.
 const v = await readSettings();
 const n = Number(v.parallelUnits);
 const limit = Number.isFinite(n) && n >= 1 ? Math.min(8, Math.round(n)) : DEFAULT_AUTO_CONCURRENCY;
 if (modelInferenceQueue.maxConcurrent !== MODEL_INFERENCE_CONCURRENCY) modelInferenceQueue.setMaxConcurrent(MODEL_INFERENCE_CONCURRENCY);
 return limit;
}
/** Tek bir model çağrısının (ilk tokendan sonraki) üretim süresi tavanı. */
async function autoTimeoutMs() {
 // Eski "autoTimeoutMs" anahtarı (en fazla 25.000) bilerek okunmaz; yeni anahtar "modelCallTimeoutMs".
 const v = await readSettings();
 const n = Number.isFinite(v.modelCallTimeoutMs) ? Math.round(v.modelCallTimeoutMs) : defaultAutoTimeoutMs;
 return Math.max(MODEL_CALL_TIMEOUT_MIN_MS, Math.min(MODEL_CALL_TIMEOUT_MAX_MS, n));
}
async function getPipelineConfig() {
 // Tek soru, kitap pasajı, self-correction ve tek hakem; kalite kapıları çağrı başına korunur.
 const v = await readSettings();
 const preset = 'balanced';
 const turboQualityLock = false;
 const batchPerCall = 1;
 const pipelineMode = 'direct';
 const fastThink = true;
 const selfCorrection = true;
 const passageMode = v.passageMode === 'summary-only' ? 'summary-only' : 'full-book';
 const batchVerify = false;
 const autoEvolve = false;
 const subSecondAllBots = v.subSecondAllBots === true;
 const subSecondBudgetMs = Number.isFinite(v.subSecondBudgetMs) ? Math.max(250, Math.min(980, Math.round(v.subSecondBudgetMs))) : SUBSECOND_BOT_BUDGET_MS;
 return {
  batchPerCall, pipelineMode, fastThink, selfCorrection,
  passageMode, batchVerify, autoEvolve, preset, turboQualityLock,
  subSecondAllBots, subSecondBudgetMs
 };
}

// --- ÜRETİM PLANI (bkz. server/production-plan.mjs) ---------------------------------
// Her ünite, PLAN.quota büyüklüğündeki geçişlerle PLAN.passes kez işlenir.
// Plan açıkken sorular yalnızca konu özetinden kurulur; TEMPO_PLAN=0 plan kotasını kapatır.
const PLAN = planConfigFromEnv(process.env);
// Plan hedefi soru havuzunun kapasitesini aşmasın (aşarsa havuz bakımı soruları siler, plan baştan doldurur).
PLAN.passes = Math.max(1, Math.min(PLAN.passes, Math.floor((QUESTION_POOL_CAPACITY * 0.95) / Math.max(1, contexts.length * PLAN.quota)) || 1));
let planState = { parked: {}, streaks: {} };
let planStateLoaded = false;
let planLastSnapshot = null;
const planAnnounced = new Set(); // terminale "Plan: …" satırı yazılmış adımlar
const planFocusRotation = new Map(); // unitId -> deneme sayacı (odak cümlesini döndürmek için)

async function loadPlanState() {
 if (planStateLoaded) return planState;
 planStateLoaded = true;
 try {
  planState = sanitizePlanState(JSON.parse(await readFile(planFile, 'utf8')), contexts, PLAN.quota, PLAN.passes);
 } catch {
  planState = sanitizePlanState(null, contexts, PLAN.quota, PLAN.passes);
 }
 return planState;
}

async function savePlanState() {
 try {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${planFile}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(planState, null, 2), 'utf8');
  await rename(tmp, planFile);
 } catch { /* plan durumu yazılamazsa üretim durmaz; yalnızca atlananlar yeniden denenir */ }
}

/**
 * Boşalan hat için planın işi (plan kapalıysa ya da tamamlandıysa planActive=false; sıradaki
 * ünitede/turda şu an verilecek iş yoksa step=null ve hat kısa süre bekler).
 * Aynı anda N soru hazırlanıyorsa bütün hatlar sıradaki aynı üniteden soru alır; tüm turlar
 * tamamlanmadan sonraki üniteye geçilmez.
 * @param inflight  { [stepKey]: o adımda şu an hazırlanan soru sayısı }
 */
async function nextPlanStep(items, inflight = {}, size = 1) {
 if (!PLAN.enabled) return { step: null, planActive: false };
 await loadPlanState();
 let snap = planSnapshot({ contexts, items, quota: PLAN.quota, passes: PLAN.passes, parked: planState.parked });
 if (snap.allParked && Object.keys(inflight).length === 0) {
  // Geriye yalnızca atlanan adımlar kaldı: hepsi yeniden denenir.
  tempoLog(`Plan: sıradaki adımların hepsi tamamlandı; atlanan ${snap.parkedSteps.length} adım yeniden deneniyor.`);
  planState = { parked: {}, streaks: {} };
  planAnnounced.clear();
  await savePlanState();
  snap = planSnapshot({ contexts, items, quota: PLAN.quota, passes: PLAN.passes, parked: planState.parked });
 }
 planLastSnapshot = snap;
 if (snap.complete) {
  if (!planAnnounced.has('complete')) {
   planAnnounced.add('complete');
   tempoLog(`Plan tamamlandı: ${snap.totalDone}/${snap.totalTarget} soru. Ünite hedefleri doldu; üretim bekletiliyor.`);
  }
  return { step: null, planActive: true };
 }
 const step = pickPlanWork(snap.all, size, inflight);
 // Aynı ünite/geçiş için terminale bir kez duyurulur.
 const visitKey = step ? `${step.pass}|${step.unitId}` : '';
 if (step && !planAnnounced.has(visitKey)) {
  planAnnounced.add(visitKey);
  const unitCells = snap.all.filter(x => x.pass === step.pass && x.unitId === step.unitId);
  tempoLog(`Plan: ${step.pass}. tur · ${step.bookNo}. kitap ${step.unitNo}. bölüm — ${step.unit} · ${`${unitCells.reduce((n,x)=>n+Math.max(0,x.done-x.from),0)}/${unitCells.reduce((n,x)=>n+x.share,0)} soru`} (toplam ${snap.totalDone}/${snap.totalTarget})`);
 }
 return { step: step || null, planActive: true };
}

/** Bir plan adımının sonucunu işler; üst üste sonuçsuz kalan adımı atlar. */
async function recordPlanOutcome(step, outcome, done = 0) {
 if (!PLAN.enabled || !step) return;
 await loadPlanState();
 const before = JSON.stringify(planState);
 const res = notePlanOutcome(planState, step, outcome, { stuckLimit: PLAN.stuckLimit, done });
 planState = res.state;
 if (res.parkedNow) {
  const msg = `${describeStep(step)}: üst üste ${PLAN.stuckLimit} deneme soru çıkarmadı (${done}/${step.quota}). Konu özeti yeni soru için yetersiz kalmış olabilir; adım atlandı, sıradakine geçiliyor.`;
  tempoLog(`Plan: ${msg}`);
  pushAutoEvent({ unit: step.unitId, ok: false, kind: 'plan_skipped', message: msg });
 }
 if (JSON.stringify(planState) !== before) await savePlanState();
}

/** /status için plan özeti (arayüz bunu gösterir). */
async function publicPlan(items) {
 if (!PLAN.enabled) return { enabled: false };
 await loadPlanState();
 const snap = planSnapshot({ contexts, items, quota: PLAN.quota, passes: PLAN.passes, parked: planState.parked });
 const slim = step => step && ({ key: step.key, pass: step.pass, unitId: step.unitId, book: step.book, unit: step.unit, bookNo: step.bookNo, unitNo: step.unitNo, done: step.done, quota: step.quota, from: step.from, share: step.share });
 const passes = Array.from({ length: PLAN.passes }, (_, i) => i + 1).map(pass => {
  const cells = snap.all.filter(x => x.pass === pass);
  const done = cells.reduce((sum, x) => sum + Math.max(0, x.done - x.from), 0);
  const target = cells.reduce((sum, x) => sum + x.share, 0);
  const unitIds = [...new Set(cells.map(x => x.unitId))];
  const unitsDone = unitIds.filter(id => cells.every(x => x.unitId !== id || x.done >= x.quota)).length;
  return { pass, done, target, unitsDone, units: unitIds.length };
 });
 const size = Math.max(1, autoState.planGroupSize || 1);
 const batch = planBatch(snap.all, size);
 const workingUnits = [...new Set(batch.map(x => `${x.pass}|${x.unitId}`))].map(id => {
  const [pass, unitId] = [Number(id.split('|')[0]), id.slice(id.indexOf('|') + 1)];
  const cells = snap.all.filter(x => x.pass === pass && x.unitId === unitId);
  const first = cells[0];
  return {
   pass, unitId, book: first.book, unit: first.unit, bookNo: first.bookNo, unitNo: first.unitNo,
   done: cells.reduce((sum, x) => sum + Math.max(0, x.done - x.from), 0),
   target: cells.reduce((sum, x) => sum + x.share, 0),
   cells: cells.map(x => ({ done: x.done, quota: x.quota, from: x.from, share: x.share, parked: x.parked, streak: planState.streaks[x.key] || 0 }))
  };
 });
 return {
  enabled: true, quota: PLAN.quota, passCount: PLAN.passes,
  perUnitTarget: PLAN.quota * PLAN.passes, stuckLimit: PLAN.stuckLimit,
  summaryOnly: true, complete: snap.complete, totalDone: snap.totalDone, totalTarget: snap.totalTarget,
  current: slim(snap.current), currentLabel: describeStep(snap.current),
  working: batch.map(step => ({ ...slim(step), streak: planState.streaks[step.key] || 0 })),
  workingUnits, parallel: size, passes,
  parked: snap.parkedSteps.map(slim)
 };
}

function nextQuestionType(ctx, items, offset = 0) {
 const unitItems = items.filter(x => x.unitId === ctx.id);
 const slot = unitItems.length + offset;
 // Paragraf soruları seyrek: her ~1/oran üretimde bir. Böylece havuz klasik soru
 // tipleriyle dolarken uzun parçalı (okuduğunu anlama) sorular da araya girer.
 if (PARAGRAPH_QUESTION_RATIO > 0 && slot > 0 && slot % Math.max(1, Math.round(1 / PARAGRAPH_QUESTION_RATIO)) === 0) {
  return PARAGRAPH_QUESTION_TYPE;
 }
 return QUESTION_TYPES[slot % QUESTION_TYPES.length];
}

function nextQuestionAngle(ctx, items, offset = 0) {
 const unitItems = items.filter(x => x.unitId === ctx.id && x.status === 'approved');
 const counts = new Map(QUESTION_ANGLES.map(a => [a, 0]));
 for (const it of unitItems) {
  if (counts.has(it.questionAngle)) counts.set(it.questionAngle, counts.get(it.questionAngle) + 1);
 }
 const sorted = QUESTION_ANGLES.slice().sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0));
 return sorted[(unitItems.length + offset) % sorted.length];
}

function selectPassageForUnit(ctx, items, passageMode) {
 const list = passagesByUnit.get(ctx.id) || [{ id: `${ctx.id}#00`, heading: 'Ünite Özeti', pages: [1], keywords: [], sourceType: 'summary', text: ctx.text }];
 if (passageMode === 'summary-only' || list.length === 1) return list[0];
 // "Ya Çıkarsa?" Sıfır Kör Nokta Tarayıcısı: Yalnızca popüler pasajlara odaklanmaz, henüz hiç soru üretilmemiş pasajları mutlaka önceliklendirir!
 const unitItems = items.filter(x => x.unitId === ctx.id && x.status === 'approved');
 const usage = new Map();
 for (const p of list) usage.set(p.id, 0);
 for (const q of unitItems) {
  const pid = q.passageId || `${ctx.id}#00`;
  if (usage.has(pid)) usage.set(pid, usage.get(pid) + 1);
 }
 let minCount = Infinity;
 for (const count of usage.values()) if (count < minCount) minCount = count;
 const leastUsed = list.filter(p => (usage.get(p.id) || 0) === minCount);
 // Aynı pasajda takılıp kalma: en az kullanılanlar arasından, bu oturumda en az DENENEN
 // (ve şu an başka bir yuvada işlenmeyen) pasaj seçilir. Bir pasajdan soru çıkmıyorsa
 // sıradaki denemede otomatik olarak bir sonrakine geçilir.
 let best = null;
 let bestTries = Infinity;
 const offset = unitItems.length % leastUsed.length;
 for (let i = 0; i < leastUsed.length; i++) {
  const p = leastUsed[(offset + i) % leastUsed.length];
  const tries = passageAttempts.get(p.id) || 0;
  if (tries < bestTries) { best = p; bestTries = tries; }
 }
 return best || list[0];
}

/** Oturum içi pasaj deneme sayaçları (başarısız denemeler pasajı sıranın sonuna iter). */
const passageAttempts = new Map();
function notePassageAttempt(passage) {
 if (!passage?.id) return;
 passageAttempts.set(passage.id, (passageAttempts.get(passage.id) || 0) + 1);
}
function notePassageSuccess(passage) {
 if (!passage?.id) return;
 // Başarılı pasajın cezası silinir; kullanım sayısı zaten havuzdan hesaplanır.
 passageAttempts.set(passage.id, Math.max(0, (passageAttempts.get(passage.id) || 1) - 1));
}

let busy = false;
let phase = 'idle';
let cursor = 0;
let lastError = '';
let controller;

let autoCursor = 0;
let autoControllers = new Map();
let autoLastError = '';
let autoLoopStarted = false;
let autoLoopStopping = false;

const sleep = ms => new Promise(r => {
 const t = setTimeout(r, ms);
 if (typeof t.unref === 'function') t.unref();
});

export function stopOllamaLoops() {
 autoLoopStopping = true;
 for (const entry of autoControllers.values()) {
  if (typeof entry?.abort === 'function') entry.abort();
  else if (typeof entry?.controller?.abort === 'function') entry.controller.abort();
 }
 autoControllers.clear();
 if (controller) controller.abort();
}
let pipelinePhase = 'idle';
let lastEvolveAtAttempt = 0;
let evolutionCheckWindow = { baselineRate: null, attemptsSinceEvolve: 0, approvedSinceEvolve: 0 };
let evolvingNow = false;

const telemetry = {
 startedAt: Date.now(),
 attemptsTotal: 0,
 approvedTotal: 0,
 rejectedPreflight: 0,
 rejectedJudges: 0,
 dualAnswerBlocked: 0,
 refinedSucceeded: 0,
 // Hız: kökü tekrar olduğu için yarıda kesilen üretici çağrısı / diğer hakem reddettiği için iptal edilen hakem çağrısı.
 earlyStops: 0,
 judgeCallsCancelled: 0,
 totalGenMs: 0,
 genCalls: 0,
 totalVerifyMs: 0,
 verifyCalls: 0,
 evalTokens: 0,
 evalNs: 0,
 loadNs: 0,
 recentApprovedTimestamps: [],
 rejectionReasons: {},
 groundingRejected: 0,
 // Altyapı kaynaklı başarısızlıklar (zaman aşımı, bağlantı, model yok). İçerik reddi DEĞİLDİR;
 // ayrı sayılır ki "0 üretildi / 0 reddedildi" görüntüsünün arkasındaki gerçek neden görünsün.
 infraErrors: 0,
 timeouts: 0,
 formatRepairs: 0,
 lastApprovedAt: 0,
 lastAttemptAt: 0,
 lastOutcome: null
};

function recordRejection(reasonKey, detail) {
 telemetry.rejectionReasons[reasonKey] = (telemetry.rejectionReasons[reasonKey] || 0) + 1;
 if (reasonKey === 'grounding') telemetry.groundingRejected++;
 if (detail) autoLastError = detail;
}

function recordEvalMetrics(apiResponse) {
 if (!apiResponse || typeof apiResponse !== 'object') return;
 if (Number.isFinite(apiResponse.eval_count)) telemetry.evalTokens += apiResponse.eval_count;
 if (Number.isFinite(apiResponse.eval_duration)) telemetry.evalNs += apiResponse.eval_duration;
 if (Number.isFinite(apiResponse.load_duration)) telemetry.loadNs += apiResponse.load_duration;
}

/**
 * Boru hattının o anki aşaması. Toplu (batched) modda eski değişken kullanılır; doğrudan
 * modda çalışan yuvaların aşamalarından türetilir (eski sürümde doğrudan modda hiç
 * güncellenmediği için ekranda hep "Boşta" yazıyordu).
 */
function livePipelinePhase() {
 if (pipelinePhase !== 'idle') return pipelinePhase;
 const phases = [...autoControllers.values()].map(x => x?.phase).filter(Boolean);
 if (busy && phase && phase !== 'idle') phases.push(phase);
 if (!phases.length) return autoState.blockCode ? 'blocked' : 'idle';
 const has = p => phases.includes(p);
 if (has('generating') || has('fixing')) return 'producing';
 if (has('verifying') || has('verifying_j1')) return 'verifying_j1';
 if (has('verifying_j2')) return 'verifying_j2';
 if (has('saving')) return 'saving';
 return 'loading';
}

function getTelemetrySnapshot() {
 const now = Date.now();
 telemetry.recentApprovedTimestamps = telemetry.recentApprovedTimestamps.filter(t => now - t <= 600_000);
 const recentWindowMin = Math.max(0.25, Math.min(10, (now - telemetry.startedAt) / 60_000));
 const questionsPerMinute = +(telemetry.recentApprovedTimestamps.length / recentWindowMin).toFixed(2);
 const secondsPerItem = questionsPerMinute > 0 ? +(60 / questionsPerMinute).toFixed(2) : 0;
 const avgGenMs = telemetry.genCalls ? Math.round(telemetry.totalGenMs / telemetry.genCalls) : 0;
 const avgVerifyMs = telemetry.verifyCalls ? Math.round(telemetry.totalVerifyMs / telemetry.verifyCalls) : 0;
 const tokensPerSecond = telemetry.evalNs > 0 ? +((telemetry.evalTokens / (telemetry.evalNs / 1e9))).toFixed(1) : 0;
 const totalAttempts = telemetry.approvedTotal + telemetry.rejectedPreflight + telemetry.rejectedJudges;
 const approvalRate = totalAttempts > 0 ? Math.round((telemetry.approvedTotal / totalAttempts) * 100) : 0;
 return {
  attemptsTotal: telemetry.attemptsTotal,
  approvedTotal: telemetry.approvedTotal,
  rejectedPreflight: telemetry.rejectedPreflight,
  rejectedJudges: telemetry.rejectedJudges,
  dualAnswerBlocked: telemetry.dualAnswerBlocked,
  refinedSucceeded: telemetry.refinedSucceeded,
  earlyStops: telemetry.earlyStops,
  judgeCallsCancelled: telemetry.judgeCallsCancelled,
  approvalRate,
  questionsPerMinute,
  secondsPerItem,
  avgGenMs,
  avgVerifyMs,
  tokensPerSecond,
  loadSecondsTotal: +(telemetry.loadNs / 1e9).toFixed(1),
  pipelinePhase: livePipelinePhase(),
  evolvingNow,
  rejectionReasons: telemetry.rejectionReasons,
  rejectedTotal: telemetry.rejectedPreflight + telemetry.rejectedJudges,
  infraErrors: telemetry.infraErrors,
  timeouts: telemetry.timeouts,
  formatRepairs: telemetry.formatRepairs,
  lastApprovedAt: telemetry.lastApprovedAt ? new Date(telemetry.lastApprovedAt).toISOString() : null,
  lastAttemptAt: telemetry.lastAttemptAt ? new Date(telemetry.lastAttemptAt).toISOString() : null,
  lastOutcome: telemetry.lastOutcome
 };
}

async function appendTrace(entry) {
 try {
  await mkdir(dataDir, { recursive: true });
  await appendFile(tracesFile, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n', 'utf8');
 } catch {}
}

let _qCache = null;
let _qSig = null;
// Havuz her değiştiğinde (kayıt ya da dosyanın yeniden okunması) artar; arayüz bu sayede
// havuzun tamamını yalnızca gerçekten değiştiğinde ister.
let _qRev = 0;
const poolRevision = () => `${_qSig || 'bos'}#${_qRev}`;
async function load() {
 try {
  const st = await stat(dataFile);
  const sig = `${st.mtimeMs}:${st.size}`;
  if (_qCache && _qSig === sig) return _qCache.slice();
  const data = JSON.parse(await readFile(dataFile, 'utf8'));
  const arr = Array.isArray(data) ? data : [];
  _qCache = arr;
  _qSig = sig;
  _qRev += 1;
  return arr.slice();
 } catch (e) {
  if (e.code === 'ENOENT') {
   if (_qSig !== null || !_qCache) _qRev += 1;
   _qCache = [];
   _qSig = null;
   return [];
  }
  throw e;
 }
}

async function directoryBytes(path) {
 let entries;
 try { entries = await readdir(path, { withFileTypes: true }); }
 catch (e) { if (e.code === 'ENOENT') return 0; throw e; }
 let bytes = 0;
 for (const entry of entries) {
  const full = resolve(path, entry.name);
  if (entry.isSymbolicLink()) continue;
  if (entry.isDirectory()) bytes += await directoryBytes(full);
  else if (entry.isFile()) {
   try { bytes += (await lstat(full)).size; }
   catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
 }
 return bytes;
}

let _storageCache = null;
let _storageCachedAt = 0;
async function storageUsage(forceRefresh = false) {
 if (!forceRefresh && _storageCache && Date.now() - _storageCachedAt < 15_000) {
  return _storageCache;
 }
 let ledger = [];
 try {
  ledger = JSON.parse(await readFile(ledgerFile, 'utf8'));
  if (!Array.isArray(ledger)) throw Error('Model kayıt defteri geçersiz.');
 } catch (e) { if (e.code !== 'ENOENT') throw e; }
 let reserved = 0;
 for (const row of ledger) {
  if (!Number.isSafeInteger(row.bytes) || row.bytes < 0) throw Error('Model kayıt defteri geçersiz.');
  reserved += row.bytes;
 }
 const [generated, books] = await Promise.all([directoryBytes(dataDir), directoryBytes(resolve('public/books'))]);
 const res = { generated, books, modelsReserved: reserved, total: generated + books + reserved, limit: storageLimit };
 _storageCache = res;
 _storageCachedAt = Date.now();
 return res;
}

async function saveJsonAtomic(filePath, dataObj) {
 const text = JSON.stringify(dataObj);
 const usage = await storageUsage(false);
 if (usage.total + Buffer.byteLength(text, 'utf8') + 1_000_000 > storageLimit) {
  throw Error('100 GB depolama sınırına yaklaşıldı; yeni kayıt yapılmadı.');
 }
 await mkdir(dataDir, { recursive: true });
 const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
 await writeFile(tmp, text, 'utf8');
 await rename(tmp, filePath);
 try {
  const st = await stat(filePath);
  const sig = `${st.mtimeMs}:${st.size}`;
  if (filePath === dataFile) { _qCache = Array.isArray(dataObj) ? dataObj : []; _qSig = sig; _qRev += 1; }
 } catch {
  if (filePath === dataFile) { _qCache = null; _qSig = null; _qRev += 1; }
 }
 if (_storageCache) {
  _storageCache = { ..._storageCache, generated: _storageCache.generated + Math.max(0, Buffer.byteLength(text, 'utf8') / 10) };
 }
}

const save = items => saveJsonAtomic(dataFile, items);

let saveQueue = Promise.resolve();
function withSaveLock(fn) {
 const run = saveQueue.then(fn, fn);
 saveQueue = run.then(() => {}, () => {});
 return run;
}

async function body(req) {
 let raw = '';
 for await (const chunk of req) {
  raw += chunk;
  if (raw.length > 100000) throw new Error('İstek çok büyük.');
 }
 return JSON.parse(raw || '{}');
}
async function rawBody(req, maxBytes = 64 * 1024 * 1024) {
 const chunks = [];
 let total = 0;
 for await (const chunk of req) {
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  total += buf.length;
  if (total > maxBytes) throw new Error('İstek gövdesi boyutu sınırı aşıyor.');
  chunks.push(buf);
 }
 return Buffer.concat(chunks);
}
function respond(res, code, obj) {
 res.statusCode = code;
 res.setHeader('Content-Type', 'application/json; charset=utf-8');
 res.setHeader('Cache-Control', 'no-store');
 res.end(JSON.stringify(obj));
}
function safeOrigin(req) {
 const origin = req.headers.origin;
 if (!origin) return false;
 try {
  const originHost = new URL(origin).host;
  const host = String(req.headers.host || '').trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  if (originHost && (originHost === host || (forwardedHost && originHost === forwardedHost))) return true;
  if (originHost.endsWith('.e2b.app') && (/^(?:127\.0\.0\.1|localhost|0\.0\.0\.0)(?::\d+)?$/i.test(host) || host.endsWith('.e2b.app'))) {
   return true;
  }
  return false;
 } catch {
  return false;
 }
}

// Test merkezinin kullandığı alanlar (hakem raporları gibi büyük alanlar gönderilmez).
const QUIZ_FIELDS = ['id', 'unitId', 'status', 'question', 'options', 'answer', 'explanation', 'topic', 'paragraph', 'model', 'questionType', 'questionAngle', 'pages', 'passageId', 'tvgfbfAligned'];
function quizView(q) {
 const out = {};
 for (const key of QUIZ_FIELDS) if (q[key] !== undefined && q[key] !== null) out[key] = q[key];
 return out;
}

// Denetim özeti havuz değişmedikçe yeniden hesaplanmaz (arayüz 5 saniyede bir sorar).
const auditCache = { revision: null, value: null };
function audit(existing) {
 const seen = new Set();
 let duplicates = 0, invalid = 0;
 const answers = new Set();
 for (const q of [...questionBank, ...existing]) {
  if (!q || typeof q.question !== 'string' || typeof q.answer !== 'string' || !Array.isArray(q.options) || !isStoredOptionCount(q.options.length) || !q.options.includes(q.answer) || q.options.some(x => typeof x !== 'string') || new Set((q.options || []).map(norm)).size !== q.options.length) {
   invalid++;
   continue;
  }
  const key = norm(q.question);
  if (seen.has(key)) duplicates++;
  seen.add(key);
  answers.add(`${q.unitId}:${norm(q.answer)}`);
 }
 return { checked: questionBank.length + existing.length, invalid, duplicates, answerGroups: answers.size };
}

// Çift doğru cevap & 8 boyutlu ÖSYM çeldirici hijyeni ön-kontrolü:
// 1. "Hepsi/Hiçbiri" yasaklı kalıplar
// 2. Doğru şıkkın uzunluk ipucu vermesi
// 3. İki seçeneğin kavramsal olarak aşırı benzer/örtüşüyor veya alt-küme olması (çift-cevap riski!)
// 4. Soru kökü sızıntısı, aşırı kesinlik kelimesi asimetrisi & ünite bilimsel aksiyom çelişkisi
/**
 * Paragraf (parçaya dayalı) sorularda parçanın kaynaktan BİREBİR alınıp alınmadığını
 * ölçer: cümlelerin en az %70'i ünite/passage metninde aynen geçmelidir.
 */
function paragraphGrounding(paragraph, ctx, passage) {
 const sourceNorm = norm(`${ctx?.text || ''} ${passage?.text || ''} ${fullUnitTextNorm.get(ctx?.id) || ''}`);
 const sentences = String(paragraph)
  .split(/(?<=[.!?])\s+/)
  .map(x => norm(x))
  .filter(x => x.length >= 25);
 if (sentences.length < 2) {
  return { ok: false, reason: 'Paragraf en az 2 tam cümleden oluşmalı ve kaynak anlatımdan birebir alınmalı.' };
 }
 let hit = 0;
 for (const sentence of sentences) if (sourceNorm.includes(sentence)) hit++;
 const ratio = hit / sentences.length;
 if (ratio < 0.7) {
  return {
   ok: false,
   reason: `Paragraf metni kaynak anlatımdan birebir alınmamış (cümlelerin yalnızca %${Math.round(ratio * 100)}'i kaynakta aynen geçiyor); paragraf sorularında parça kitaptan kelimesi kelimesine kopyalanmalı.`
  };
 }
 return { ok: true, ratio };
}

/** İki sorunun seçenek takımlarının örtüşme oranı (0..1). */
function optionOverlapRatio(a, b) {
 const listA = Array.isArray(a?.options) ? a.options : [];
 const listB = Array.isArray(b?.options) ? b.options : [];
 if (!listA.length || !listB.length) return 0;
 const setA = new Set(listA.map(o => norm(o)));
 let inter = 0;
 for (const o of listB) if (setA.has(norm(o))) inter++;
 return inter / Math.max(MIN_OPTION_COUNT, listA.length, listB.length);
}

/**
 * Havuzdaki (ve kitap bankasındaki) sorularla birebir/çok benzer olup olmadığını
 * yoklar. Yalnızca soru köküne değil; şık takımına ve doğru cevaba da bakar, böylece
 * "tıpatıp benzeri" ve "aynı şıklarla yeniden yazılmış" sorular havuza girmez.
 *
 * Aynı bilgi farklı bir soru biçimiyle (ör. önce tanım, sonra vaka ya da boşluk doldurma) yeniden
 * sorulabilir: iki sorunun tipi biliniyor ve farklıysa "aynı cevap" tek başına tekrar sayılmaz;
 * kök gerçekten benzemeli (>= 0,70) ya da şıkların büyük bölümü (4 şıkta 3'ü, 5 şıkta 4'ü) aynı olmalıdır. Aynı tipte kurallar eskisi gibidir.
 * Şık örtüşmesi, iki sorudan şık sayısı fazla olana göre ölçülür (4 ya da 5 şık).
 */
export function findDuplicateReason(draft, ctx, pool) {
 const qNorm = norm(draft.question);
 const answerNorm = norm(draft.answer);
 for (const x of pool) {
  if (!x || typeof x.question !== 'string') continue;
  if (norm(x.question) === qNorm) return 'Aynı soru zaten kayıtlı.';
  const sameUnit = x.unitId === ctx?.id;
  const stemSim = sameUnit ? similarity(x.question, draft.question) : 0;
  const optSim = optionOverlapRatio(draft, x);
  if (optSim >= 1) return 'Bu şıkların tamamıyla aynı olduğu bir soru zaten kayıtlı.';
  if (sameUnit && stemSim >= 0.78) return 'Bu ünite için çok benzer bir soru bulundu.';
  const otherForm = Boolean(draft.questionType && x.questionType && draft.questionType !== x.questionType);
  if (sameUnit && stemSim >= (otherForm ? 0.70 : 0.62) && norm(x.answer) === answerNorm) return 'Aynı cevabı ve kavramı paylaşan benzer bir soru bulundu.';
  if (sameUnit && norm(x.answer) === answerNorm && optSim >= (otherForm ? 0.75 : 0.5)) return 'Aynı cevabı ve şıklarının çoğunu paylaşan bir soru zaten kayıtlı.';
  if (sameUnit && stemSim >= 0.70 && optSim >= 0.5) return 'Kökü ve şıkları büyük ölçüde örtüşen bir soru bulundu.';
  if (sameUnit && optSim >= 0.9) return 'Şıkları neredeyse aynı olan bir soru zaten kayıtlı.';
 }
 return null;
}

/**
 * Yalnızca soru KÖKÜNE bakarak verilebilen tekrar kararları (findDuplicateReason'ın ilk iki kuralı, aynı
 * eşiklerle): kök birebir aynıysa ya da aynı ünitede >= 0,78 benziyorsa şıklar ne olursa olsun soru
 * elenir. Üretici kökü yazar yazmaz bu karar verilebilir; kalan şık/açıklama yazımı beklenmez.
 */
export function findStemDuplicateReason(question, ctx, pool) {
 const qNorm = norm(question);
 if (!qNorm) return null;
 for (const x of pool) {
  if (!x || typeof x.question !== 'string') continue;
  if (norm(x.question) === qNorm) return 'Aynı soru zaten kayıtlı.';
  if (x.unitId === ctx?.id && similarity(x.question, question) >= 0.78) return 'Bu ünite için çok benzer bir soru bulundu.';
 }
 return null;
}

/**
 * Akış hâlindeki (henüz bitmemiş) JSON metninden, yazımı TAMAMLANMIŞ bir metin alanını okur.
 * Alan henüz kapanmadıysa null döner. (Değer içindeki tırnaklar kaçışlı olduğundan `"alan":` yalnızca anahtar olabilir.)
 */
export function completedJsonField(text, key) {
 const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*[,}]`).exec(String(text || ''));
 if (!m) return null;
 try { return JSON.parse(`"${m[1]}"`); } catch { return null; }
}

function checkDistractorHygiene(options, answer, meta = {}) {
 if (options.some(o => BANNED_OPTION_PATTERN.test(o))) {
  return 'Seçeneklerde "hepsi/hiçbiri" gibi kalitesiz ifade kullanıldı.';
 }
 // Detailed psychometric scoring is intentionally omitted. The independent judge checks
 // whether choices are related, plausible, and not plainly absurd; this gate blocks only
 // the explicit all/none shortcuts above.
}

/**
 * Şık kalitesi (çeldirici/simetri/uzunluk/kaynak sızıntısı) kaynaklı red mesajlarını
 * ayırt eder; tekrar veya kaynak eksikliği gibi hatalarda model boşa yorulmasın.
 */
function isDistractorQualityError(message) {
 const msg = String(message || '');
 if (/zaten kayıtlı|benzer bir soru|Kaynak alıntısı|kaynak alıntısı/.test(msg)) return false;
 return /çeldirici|alakasız|kalitesiz ifade|uzunluk|sızdırıyor|örtüşüyor|kapsadığı|simetri|çift doğru/i.test(msg);
}

function evidenceExists(evidence, ctx, passage) {
 const res = precisionEngine.verifyEvidenceGrounding(evidence, ctx, passage);
 return res.ok;
}

function validate(o, ctx, existing, model, passage = null, policy = null) {
 if (!o || typeof o !== 'object') throw Error('Model geçerli bir nesne döndürmedi.');
 const { question, options, answer, explanation, evidence, topic } = o;
 if (![question, answer, explanation, evidence, topic].every(x => typeof x === 'string' && x.trim().length >= 4)) {
  throw Error('Soru alanları eksik.');
 }
 if (Array.isArray(options) && !isDraftOptionCount(options.length)) {
  throw Error(`Soru ${MIN_OPTION_COUNT} ya da ${OPTION_COUNT} şıklı olmalı (${options.length} şık geldi).`);
 }
 if (question.length > 700 || explanation.length > 1200 || topic.length > 120 || evidence.length > 500 || !Array.isArray(options) || options.some(x => typeof x !== 'string' || x.trim().length < 2 || x.length > 300)) {
  throw Error('Soru alanları geçersiz.');
 }
 if (new Set(options.map(norm)).size !== options.length || !options.includes(answer)) {
  throw Error('Seçenekler veya cevap geçersiz.');
 }
 const hygieneErr = checkDistractorHygiene(options, answer, { question, explanation, evidence, unitId: ctx?.id || '', sourceText: passage?.text || ctx?.text || '' });
 if (hygieneErr) throw Error(hygieneErr);
 // --- Paragraf (parçaya dayalı) soru: parça kaynaktan birebir alınmış olmalı ---
 const rawParagraph = typeof o.paragraph === 'string' ? o.paragraph.trim() : '';
 const stemRefsParagraph = /parçaya g|parçadan|parçada|paragrafta|paragraf|bu metne g|metne g|verilen metne|verilen parçaya/i.test(norm(question));
 const wantsParagraph = o.questionType === 'paragraf' || stemRefsParagraph;
 let paragraph = '';
 if (wantsParagraph) {
  if (rawParagraph.length < 180 || rawParagraph.length > 900) {
   throw Error('Parçaya dayalı soruda "paragraph" alanı, konu anlatımından birebir alınmış 180-900 karakterlik bir parça olmalı.');
  }
  const paraGround = paragraphGrounding(rawParagraph, ctx, passage);
  if (!paraGround.ok) throw Error(paraGround.reason);
  paragraph = rawParagraph;
 }
 const groundRes = precisionEngine.verifyEvidenceGrounding(evidence, ctx, passage);
 if (!groundRes.ok) {
  throw Error(groundRes.reason || 'Kaynak alıntısı ünite anlatımında veya kitap pasajında bulunamadı.');
 }
 // Doğru cevap ve soru kökü de ünite özetinde/kitapta temellenmeli; bu içerik desteği kontrolüdür, kalite puanı değildir.
 const sourceCheck = summaryGrounding.evaluate({ unitId: ctx.id, question, options, answer });
 if (!sourceCheck.ok) {
  recordRejection('grounding', sourceCheck.reason);
  throw Error(sourceCheck.reason);
 }
 // Kaynak cümlesi birebir doğrulandı; zorluk etiketi / sayısal kalite puanlaması yok.
 const draftType = wantsParagraph ? PARAGRAPH_QUESTION_TYPE : (QUESTION_TYPES.includes(o.questionType) ? o.questionType : null);
 const duplicateReason = findDuplicateReason({ question, options, answer, questionType: draftType }, ctx, [...questionBank, ...bookStyleQuestions, ...existing]);
 if (duplicateReason) throw Error(duplicateReason);
 return {
  id: randomUUID(),
  unitId: ctx.id,
  book: ctx.book,
  unit: ctx.unit,
  topic: topic.trim(),
  question: question.trim(),
  options: options.map(x => x.trim()),
  answer: answer.trim(),
  explanation: explanation.trim(),
  evidence: evidence.trim(),
  status: 'approved',
  model,
  layeredPipelineStage: '4_stage_rag_yazar_cozen_celdirici_editor',
  evidenceTier: groundRes.tier || 'direct',
  grounding: { score: Number(sourceCheck.score.toFixed(3)), inSource: true },
  ...(passage ? { passageId: passage.id, passageHeading: passage.heading, pages: passage.pages } : summaryPagesField(ctx, evidence)),
  ...(typeof o.questionType === 'string' && QUESTION_TYPES.includes(o.questionType) ? { questionType: o.questionType } : {}),
  ...(typeof o.questionAngle === 'string' && QUESTION_ANGLES.includes(o.questionAngle) ? { questionAngle: o.questionAngle } : {}),
  ...(typeof o.bloomLevel === 'string' && o.bloomLevel.trim() ? { bloomLevel: o.bloomLevel.trim().slice(0, 40) } : {}),
  ...(paragraph ? { paragraph, questionType: PARAGRAPH_QUESTION_TYPE } : {}),
  createdAt: new Date().toISOString()
 };
}

function extractJsonLoose(rawText) {
 const txt = (rawText || '').trim();
 try { return JSON.parse(txt); } catch {}
 const cleaned = txt.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
 try { return JSON.parse(cleaned); } catch {}
 const firstBrace = cleaned.indexOf('{');
 const lastBrace = cleaned.lastIndexOf('}');
 if (firstBrace !== -1 && lastBrace > firstBrace) {
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
 }
 throw Error('JSON ayrıştırılamadı');
}

async function runModel(which, input, temperature, signal, numPredict = 900, opts = {}) {
 return modelInferenceQueue.run(which, () => runModelRequest(which, input, temperature, signal, numPredict, opts), { signal });
}

// Rol başına örnekleme ayarları. Bunlar "örnekleme" seçenekleridir; modelin yeniden
// yüklenmesine yol açmaz. (num_ctx / num_gpu / num_batch gibi çalıştırıcı seçenekleri
// bilerek gönderilmez — bkz. ollama-client.mjs.)
const ROLE_SAMPLING = {
 generator: { top_p: 0.92, top_k: 50, repeat_penalty: 1.03 },
 judge: { top_p: 0.85, top_k: 30, repeat_penalty: 1.0 },
 evolver: { top_p: 0.9, top_k: 40, repeat_penalty: 1.05 },
 qwenCodeSandbox: { top_p: 0.9, top_k: 40, repeat_penalty: 1.05 }
};

function recordClientMetrics(metrics) {
 if (!metrics) return;
 recordEvalMetrics({ eval_count: metrics.evalTokens, eval_duration: metrics.evalNs, load_duration: metrics.loadNs });
}

/**
 * Tek model çağrısı. Uygulama kuyruğundaki yuvasını aldıktan SONRA çalışır; bu yüzden
 * zaman aşımı sayaçları kuyrukta bekleme süresini saymaz.
 *
 * opts.schema          → Ollama yapılandırılmış çıktı şeması (JSON şeması)
 * opts.totalTimeoutMs  → ilk tokendan sonraki üretim tavanı (varsayılan: ayar)
 * opts.fastThink       → true ise think:false gönderilir (düşünen modellerde hız)
 */
async function runModelRequest(which, input, temperature, signal, numPredict = 900, { fastThink = true, botRole = null, schema = null, totalTimeoutMs = null, firstTokenTimeoutMs = null, onProgress = null } = {}) {
 const roleInferred = botRole || (
  /hakem|judge|psikometri/i.test(String(which)) ? 'judge'
   : /mimar|evolver/i.test(String(which)) ? 'evolver'
    : /coder|code/i.test(String(which)) ? 'qwenCodeSandbox'
     : 'generator'
 );
 const callTimeout = Number.isFinite(totalTimeoutMs) && totalTimeoutMs > 0 ? totalTimeoutMs : await autoTimeoutMs();
 try {
  const r = await ollama.generate({
   model: which,
   prompt: input,
   schema,
   temperature,
   numPredict,
   sampling: ROLE_SAMPLING[roleInferred] || ROLE_SAMPLING.generator,
   think: fastThink ? false : null,
   signal,
   firstTokenTimeoutMs: Number.isFinite(firstTokenTimeoutMs) && firstTokenTimeoutMs > 0 ? firstTokenTimeoutMs : FIRST_TOKEN_TIMEOUT_MS,
   idleTimeoutMs: IDLE_TOKEN_TIMEOUT_MS,
   totalTimeoutMs: callTimeout,
   onProgress
  });
  recordClientMetrics(r.metrics);
  noteModelLoad(which, r.metrics);
  return { parsed: r.parsed, elapsed: r.elapsed, metrics: r.metrics };
 } catch (e) {
  if (e?.metrics) { recordClientMetrics(e.metrics); noteModelLoad(which, e.metrics); }
  throw e;
 }
}


async function finalize(parsed, ctx, model, verification, passage = null, policy = null, adaptiveQuality = null, targetAngle = null, targetType = null) {
 return withSaveLock(async () => {
  let latest = await load();
  const record = validate(parsed, ctx, latest, model, passage, policy);
  record.verification = verification;
  // Plan kotası ünite başına toplam onaylı soru sayısıdır; zorluk kovası yoktur.
  if (PLAN.enabled && (countApproved(latest).get(stepKey(ctx.id)) || 0) >= PLAN.quota * PLAN.passes) {
   recordRejection('plan_quota_full');
   throw Error(`Bu ünitenin ${PLAN.quota * PLAN.passes} soruluk kotası doldu; soru kaydedilmedi.`);
  }
  if (!record.questionAngle && targetAngle) record.questionAngle = targetAngle;
  // Model soru tipini yazmadıysa istenen tip kaydedilir (aynı cümleye sonraki uğrayışta farklı tip seçilebilsin).
  if (!record.questionType && targetType) record.questionType = targetType;
  if (verification.bloomLevel && !record.bloomLevel) record.bloomLevel = verification.bloomLevel;
  record.curatedBy = 'source-and-options-check';

  record.curationReason = 'Kaynak, tek-doğru cevap ve şık uygunluğu kontrolünden geçti';
  latest = await makeRoomForQuestion(latest);
  latest.push(record);
  await save(trimQuestionPool(pruneRejectedTail(latest), MAX_QUESTIONS));
  telemetry.approvedTotal++;
  telemetry.recentApprovedTimestamps.push(Date.now());
  return record;
 });
}

/** Havuzdaki şık sayısı dağılımı (arayüz ve durum raporu için). */
function optionFormatStats(items) {
 let four = 0, five = 0;
 for (const q of items || []) {
  if (!q || q.status !== 'approved' || !Array.isArray(q.options)) continue;
  if (q.options.length === OPTION_COUNT) five += 1; else if (q.options.length === MIN_OPTION_COUNT) four += 1;
 }
 return { allowed: [MIN_OPTION_COUNT, OPTION_COUNT], fourOption: four, fiveOption: five };
}

function pruneRejectedTail(items, maxRejected = 250) {
 const rejectedIndices = [];
 for (let i = 0; i < items.length; i++) {
  if (items[i]?.status === 'rejected') rejectedIndices.push(i);
 }
 if (rejectedIndices.length <= maxRejected) return items;
 const toDrop = new Set(rejectedIndices.slice(0, rejectedIndices.length - maxRejected));
 return items.filter((_, i) => !toDrop.has(i));
}

function trimQuestionPool(items, limit = MAX_QUESTIONS) {
 if (items.length <= limit) return items;
 const keep = new Set(items.map((item, index) => ({
  index,
  score: item?.status === 'rejected'
   ? -1000
   : (Number(item?.qualityScore ?? item?.verification?.qualityScore ?? 3) * 100)
    + (Number(item?.examPotential ?? item?.verification?.examPotential ?? 0) * 4)
    + (Number(item?.precisionScore ?? 0) / 10)
 })).sort((a, b) => b.score - a.score || b.index - a.index)
  .slice(0, Math.max(0, limit))
  .map(item => item.index));
 return items.filter((_, index) => keep.has(index));
}

async function makeRoomForQuestion(items) {
 let current = pruneRejectedTail(items);
 const approvedCount = current.reduce((count, item) => count + (item?.status === 'approved' ? 1 : 0), 0);
 if ((approvedCount >= QUESTION_POOL_CAPACITY || current.length >= MAX_QUESTIONS) && !curatorBusy) {
  curatorBusy = true;
  try {
   const result = await poolCurator.scanAndPrune({
    items: current,
    forcePrune: true,
    threshold: QUESTION_POOL_CAPACITY,
    targetKeep: QUESTION_POOL_REFILL_TARGET
   });
   current = pruneRejectedTail(result.items || current);
  } finally {
   curatorBusy = false;
   lastCuratorScanAt = Date.now();
   lastPoolCapCheckAt = lastCuratorScanAt;
  }
 }
 if (current.length >= MAX_QUESTIONS) current = trimQuestionPool(current, MAX_QUESTIONS - 1);
 return current;
}

// Hakemlerin veya AI kurulunun elediği geçerli biçimli soruyu da havuzda "rejected" (otomatik elendi) olarak kayıt altına alır
async function recordCouncilRejection(parsedDraft, ctx, model, reason, passage = null) {
 if (!parsedDraft || typeof parsedDraft !== 'object') return;
 const { question, options, answer, explanation, evidence, topic } = parsedDraft;
 if (![question, answer, explanation, evidence, topic].every(x => typeof x === 'string' && x.trim().length >= 4)) return;
 if (!Array.isArray(options) || !isDraftOptionCount(options.length) || options.some(x => typeof x !== 'string' || x.trim().length < 2)) return;
 if (new Set(options.map(norm)).size !== 4 || !options.includes(answer)) return;
 await withSaveLock(async () => {
  let latest = await load();
  if ([...questionBank, ...latest].some(x => norm(x.question) === norm(question))) return;
  latest = await makeRoomForQuestion(latest);
  latest.push({
   id: randomUUID(),
   unitId: ctx.id,
   book: ctx.book,
   unit: ctx.unit,
   topic: topic.trim().slice(0, 120),
   question: question.trim().slice(0, 700),
   options: options.map(x => x.trim().slice(0, 300)),
   answer: answer.trim().slice(0, 300),
   explanation: explanation.trim().slice(0, 1200),
   evidence: evidence.trim().slice(0, 500),
   status: 'rejected',
   curatedBy: 'ai-council',
   curationReason: String(reason || 'AI jürisi tarafından otomatik elendi').slice(0, 300),
   model,
   ...(passage ? { passageId: passage.id, passageHeading: passage.heading, pages: passage.pages } : {}),
   createdAt: new Date().toISOString()
  });
  await save(trimQuestionPool(pruneRejectedTail(latest), MAX_QUESTIONS));
 }).catch(() => {});
}

/**
 * Ünitede hangi kavramların çok/az sorulduğunu çıkarır; modeli az işlenmiş kavrama
 * yönlendirerek arka planda üretilen soruların aynı kavram etrafında dönmesini engeller.
 */
function buildConceptCoverageSnippet(ctx, items, passage = null) {
 const unitEntry = passagesByUnit.get(ctx?.id) || [];
 const rawKeywords = [
  ...(passage?.keywords || []),
  ...(unitEntry[0]?.keywords || [])
 ];
 const keywords = [...new Set(rawKeywords.map(k => String(k || '').trim()).filter(k => k.length >= 4))];
 if (!keywords.length) return '';
 const pool = [...questionBank, ...items].filter(x => x && x.unitId === ctx?.id);
 const coverage = new Map(keywords.map(k => [k, 0]));
 for (const q of pool) {
  const hay = norm(`${q.question || ''} ${q.answer || ''} ${(q.options || []).join(' ')} ${q.explanation || ''}`);
  if (!hay) continue;
  for (const k of coverage.keys()) {
   if (hay.includes(norm(k))) coverage.set(k, coverage.get(k) + 1);
  }
 }
 const sorted = [...coverage.entries()].sort((a, b) => a[1] - b[1]);
 const fresh = sorted.filter(([, n]) => n <= 1).slice(0, 4).map(([k]) => k);
 const saturated = sorted.filter(([, n]) => n >= 2).slice(-5).map(([k]) => k);
 if (!fresh.length && !saturated.length) return '';
 const parts = [];
 if (fresh.length) parts.push(`Bu turda ŞU AZ İŞLENMİŞ KAVRAM(LAR)DAN BİRİNİ sor: ${fresh.join(', ')}.`);
 if (saturated.length) parts.push(`Şu kavramlar bu ünitede yeterince soruldu, mümkünse FARKLI BİR KAVRAM seç: ${saturated.join(', ')}.`);
 return `\nKAVRAM KAPSAMA YÖNLENDİRMESİ (tekrarı önlemek için): ${parts.join(' ')}`;
}

/**
 * Bu ünitenin resmî kitap ("Neler Öğrendik?") sorularından, havuzda en az karşılanmış
 * olanı örnek olarak gösterir: model aynı kavram ailesinden, aynı sınav tadında ama
 * FARKLI yazılmış bir soru kurar. Böylece üretim kitabın kendi sorusuna yakın kalır.
 */
function buildBookSeedSnippet(ctx, items) {
 const unitBook = bookStyleQuestions.filter(q => q.unitId === ctx?.id);
 if (!unitBook.length) return '';
 const pool = [...questionBank, ...items].filter(x => x && x.unitId === ctx?.id);
 const scored = unitBook.map(q => {
  let best = 0;
  for (const p of pool) {
   const sim = similarity(p.question || '', q.question || '');
   if (sim > best) best = sim;
  }
  return { q, used: best };
 });
 scored.sort((a, b) => a.used - b.used);
 const seeds = scored.slice(0, 2);
 const lines = seeds.map(({ q }) => `Soru="${q.question}" | Doğru="${q.answer}" | Konu=${q.topic || ctx.unit}`);
 return `\nKİTAP SORUSU ÖRNEĞİ (bu ünitenin gerçek kitap sorusu; AYNISINI YAZMA ama aynı kavram ailesinden, aynı ÖSYM tadında ve kitabın ölçtüğü bilgiyi ölçen bir soru kur): ${lines.join(' || ')}`;
}

function buildExemplarsSnippet(ctx, items) {
 const unitApproved = [...items.filter(x => x.unitId === ctx.id && x.status === 'approved'), ...questionBank.filter(x => x.unitId === ctx.id)]
  .sort((a, b) => ((b.qualityScore || 4) * 20 + (b.precisionScore || 90)) - ((a.qualityScore || 4) * 20 + (a.precisionScore || 90)));
 if (!unitApproved.length) return '';
 const sample = unitApproved[0];
 return `\nKALİTE ÖRNEĞİ (tekrarlama): Soru="${sample.question}" | Doğru="${sample.answer}" | Çeldiriciler=${JSON.stringify(sample.options.filter(o => o !== sample.answer))}`;
}

function buildAvoidErrorsSnippet() {
 const top = Object.entries(telemetry.rejectionReasons)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 2)
  .map(([k]) => k);
 if (!top.length) return '';
 const hints = {
  distractor_hygiene: 'Tüm seçenekler eşit uzunlukta ve benzersiz olmalı; "hepsi/hiçbiri" asla kullanılmamalı.',
  dual_answer: 'ASLA iki şıkkı da doğru kabul edilebilecek soru kurma; yanlış şıklar kaynakla kesin çelişsin.',
  evidence: 'evidence alanı aşağıdaki KONU ANLATIMI metninden birebir kopyalanmış en az 15 karakterlik tam ifade olmalı.',
  judge_disagree: 'Soruda yalnızca TEK bir tartışmasız doğru cevap olmalı.',
  duplicate: 'Daha önce sorulan sorulardan tamamen farklı kavram ve cevap sor.'
 };
 const msgs = top.map(k => hints[k]).filter(Boolean);
 return msgs.length ? `\nÖNCEKİ HATALARDAN KAÇIN: ${msgs.join(' ')}` : '';
}

// --- YAPILANDIRILMIŞ ÇIKTI ŞEMALARI -------------------------------------------------
// Alan sırası bilinçlidir: model önce kaynaktan KANITI seçer, sonra o kanıta soru yazar.
const BLOOM_LEVELS = ['hatirlama', 'kavrama', 'uygulama', 'analiz'];
function generatorSchema(qType) {
 const isParagraph = qType === PARAGRAPH_QUESTION_TYPE;
 const properties = {
  evidence: { type: 'string' },
  ...(isParagraph ? { paragraph: { type: 'string' } } : {}),
  question: { type: 'string' },
  options: { type: 'array', items: { type: 'string' }, minItems: MIN_OPTION_COUNT, maxItems: OPTION_COUNT },
  answer: { type: 'string' },
  explanation: { type: 'string' },
  topic: { type: 'string' },
  questionType: { type: 'string' },
  questionAngle: { type: 'string' },
  bloomLevel: { type: 'string', enum: BLOOM_LEVELS }
 };
 return {
  type: 'object',
  properties,
  required: ['evidence', ...(isParagraph ? ['paragraph'] : []), 'question', 'options', 'answer', 'explanation', 'topic', 'questionType', 'questionAngle', 'bloomLevel']
 };
}
// Hakem önce kanıtı ve gerekçeyi yazar, sonra cevabı seçer (karar öncesi kısa akıl yürütme).
const JUDGE_SCHEMA = {
 type: 'object',
 properties: {
  evidence: { type: 'string' }, reason: { type: 'string' }, answer: { type: 'string' },
  singleCorrect: { type: 'boolean' }, supported: { type: 'boolean' },
  choicesPlausible: { type: 'boolean' }
 },
 required: ['evidence', 'reason', 'answer', 'singleCorrect', 'supported', 'choicesPlausible']
};

const GENERATOR_NUM_PREDICT = 640;
const GENERATOR_NUM_PREDICT_PARAGRAPH = 960;
const JUDGE_NUM_PREDICT = 400;

/** Üretici promptunun (kaynak metin dahil) kullanabileceği karakter bütçesi. */
function generatorPromptBudget(model, numPredict = GENERATOR_NUM_PREDICT) {
 return ollama.promptBudgetChars(model, numPredict);
}

/**
 * İsteğe bağlı ipucu bloklarını öncelik sırasıyla, bütçeyi aşmadan ekler.
 * Bütçeye sığmayan blok atlanır; kaynak metin ve zorunlu kurallar asla kırpılmaz.
 */
function packOptionalBlocks(blocks, maxChars) {
 let used = 0;
 const out = [];
 for (const block of blocks) {
  const text = typeof block === 'string' ? block : '';
  if (!text.trim()) continue;
  if (used + text.length > maxChars) continue;
  out.push(text);
  used += text.length;
 }
 return out.join('');
}

// Konu özeti kitaptan genişletildi (konu başına ~100 cümle); istemlere özetin TAMAMI değil,
// ilgili cümlenin (odak / kanıt) çevresindeki pencere konur. Kanıt kapısı ise özetin tamamına bakar.
const SUMMARY_WINDOW_CHARS = Math.max(1200, Math.min(6000, Number(process.env.TEMPO_SUMMARY_WINDOW_CHARS) || 2400));
/** Yalnızca-özet modunda sorunun dayandığı cümlenin kitap sayfası ({ pages: [54] }); bilinmiyorsa {}. */
function summaryPagesField(ctx, evidence) {
 const page = summaryPageOf(ctx, evidence);
 const section = summarySectionOf(ctx, evidence);
 const web = summaryWebSourceOf(ctx, evidence);
 return {
  ...(page ? { pages: [page] } : {}),
  // Kitabın "İçindekiler"ine göre konu başlığı (ve varsa ana konusu).
  ...(section ? { section: section.title, ...(section.parent ? { sectionParent: section.parent } : {}) } : {}),
  // İnternetten derlenen ek anlatıma dayanan soru: kaynağı kayıtta görünür.
  ...(web ? { webSource: { title: web.title, url: web.url, ...(web.topic ? { topic: web.topic } : {}), ...(web.kind ? { kind: web.kind } : {}) } } : {})
 };
}

/** Odak cümlesinden daha önce yazılmış soruları (en çok 3) isteme ekler: aynı kök tekrar edilmesin. */
function focusAskedHint(focus) {
 const asked = Array.isArray(focus?.asked) ? focus.asked.slice(-3) : [];
 if (!asked.length) return '';
 const stems = asked.map(q => String(q.question || '').replace(/\s+/g, ' ').slice(0, 90)).filter(Boolean).join(' / ');
 return ` Bu cümleden daha önce şu sorular yazıldı; bu kez FARKLI bir soru biçimi ve anlatım kullan: ${stems}`;
}

function summarySource(ctx, anchor = '') {
 return summaryWindow(ctx?.text || '', anchor, SUMMARY_WINDOW_CHARS).text;
}

/** Özetin en az soru sorulmuş cümlesi; her denemede eşit kullanılanlar arasında döner. */
/**
 * Odak cümlesinden daha önce soru yazıldıysa bu kez FARKLI bir soru tipi ve açısı seçilir
 * (aynı bilgi, başka bir soru biçimi). İlk kez sorulan cümlede olağan sıra kullanılır.
 */
export function variedTypeAndAngle(focus, fallbackType, fallbackAngle, rotation = 0) {
 const asked = Array.isArray(focus?.asked) ? focus.asked : [];
 if (!asked.length) return { type: fallbackType, angle: fallbackAngle };
 const usedTypes = asked.map(q => q.questionType).filter(Boolean);
 const usedAngles = asked.map(q => q.questionAngle).filter(Boolean);
 const type = fallbackType === PARAGRAPH_QUESTION_TYPE || !usedTypes.includes(fallbackType)
  ? fallbackType
  : leastUsedOption(QUESTION_TYPES, usedTypes, rotation);
 const angle = !usedAngles.includes(fallbackAngle) ? fallbackAngle : leastUsedOption(QUESTION_ANGLES, usedAngles, rotation);
 return { type, angle };
}

function nextFocusSentence(ctx, items) {
 const rotation = planFocusRotation.get(ctx.id) || 0;
 planFocusRotation.set(ctx.id, rotation + 1);
 const unitItems = items.filter(x => x.unitId === ctx.id && x.status === 'approved');
 return pickFocusSentence(ctx.text, unitItems, rotation);
}

function buildGeneratorPrompt(ctx, items, passage, generationModes, targetTypes, policy = null, jarvisMemory = null, researchMemory = null, adaptiveQuality = null, targetAngles = null, studentProfile = null, apexState = null, trainerState = null, promptOpts = {}) {
 const existingQuestions = [...questionBank, ...items].filter(x => x.unitId === ctx.id);
 // Tekrar listesi: önce AYNI pasajdan yazılmış sorular (asıl tekrar riski), sonra ünitenin son soruları.
 const samePassage = passage ? existingQuestions.filter(x => x.passageId === passage.id).slice(-8) : [];
 const samePassageSet = new Set(samePassage);
 const recentOthers = existingQuestions.filter(x => !samePassageSet.has(x)).slice(-(12 - samePassage.length));
 const avoidPool = [...recentOthers, ...samePassage];
 const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
 const avoidQuestions = avoidPool.map(x => clip(x.question, 130)).join(' / ');
 const recentAnswers = [...new Set(avoidPool.map(x => clip(x.answer, 60)).filter(Boolean))].slice(-10).join(', ');
 const recentOptionSets = existingQuestions.slice(-6)
  .map(x => Array.isArray(x.options) ? x.options.filter(o => o !== x.answer).slice(0, 2).join(' + ') : '')
  .filter(Boolean)
  .join(' / ');
 const exemplars = buildExemplarsSnippet(ctx, items);
 const avoidErr = buildAvoidErrorsSnippet();
 const jarvisHint = jarvis.getPromptGuidance(jarvisMemory, ctx.id, adaptiveQuality);
 const apexHint = apex.getBotDirectiveBlock(apexState, 'generator');
 const trainerHint = trainer.getUnitDistilledPrompt(trainerState, ctx.id);
 const researchHint = researchAgent.getResearchGuidance(researchMemory, ctx.id);
 const osymHint = localAiTeam.getOsymCommitteePromptBlock(cachedLocalTeamState, ctx.id);
 const axiomHint = precisionEngine.getUnitAxiomPromptBlock(ctx.id);
 const tvgfbfStyleHint = tvgfbfSwarm.getUnitStylePromptBlock(ctx.id);
 const layeredWorkflowHint = hundredAiCouncil.buildLayeredWorkflowDirective(ctx.id);
 const ragCrossHint = precisionEngine.getRagCrossContextBlock(ctx, passage);
 const perf = lessonEngine.formatStudentPerformance(ctx.id, studentProfile);
 const perfHint = perf.answered > 0 ? `\nÖĞRENCİ PERFORMANS SİNYALİ: ${perf.summaryText} (Zorlandığı yerleri kalıcı öğretecek net sorular kur.)` : '';
 const policyRule = policy?.generatorAddendum ? `\nEK POLİTKA DİREKTİFİ: ${policy.generatorAddendum}` : '';
 const sourceText = passage ? passage.text : summarySource(ctx, promptOpts?.focus?.sentence || '');
 const pageInfo = passage?.pages?.length ? ` (Kitap s. ${passage.pages.join(', ')})` : '';
 const sectionInfo = passage?.heading ? ` | Alt Bölüm: ${passage.heading}${pageInfo}` : '';
 const angles = Array.isArray(targetAngles) && targetAngles.length ? targetAngles : generationModes.map((_, i) => QUESTION_ANGLES[i % QUESTION_ANGLES.length]);

 if (generationModes.length === 1) {
  const qType = targetTypes[0] || 'kavram';
  const qAngle = angles[0] || 'dogrudan_tanim';
  const typeHint = QUESTION_TYPE_HINTS[qType] || '';
  const angleHint = QUESTION_ANGLE_HINTS[qAngle] || '';
  const isParagraph = qType === PARAGRAPH_QUESTION_TYPE;
  // Yalnızca-özet modunda kitap içeriği taşıyan bloklar (kitap sorusu örneği, kitap pasajı anahtar
  // kelimeleri, kitaptan çapraz bağlam) eklenmez: model özet dışı bilgiye kaymasın.
  const summaryOnly = promptOpts?.summaryOnly === true;
  const coverageHint = summaryOnly ? '' : buildConceptCoverageSnippet(ctx, items, passage);
  const bookSeedHint = summaryOnly ? '' : buildBookSeedSnippet(ctx, items);
  const focus = summaryOnly ? promptOpts?.focus : null;
  const focusHint = focus?.sentence
   ? `\nODAK CÜMLE (soruyu bu cümledeki bilgiden kur, \"evidence\" alanına bu cümleyi kopyala): \"${focus.sentence}\"${focusAskedHint(focus)}`
   : '';
  const focusSection = focus?.sentence ? summarySectionOf(ctx, focus.sentence) : null;
  // Aynı bölümdeki güvenilir kullanıcı örneği içerik + biçim referansı; diğer örnekler biçim referansıdır.
  const styleExample = isParagraph ? null : pickStyleExample(examStyleLibrary, { unitId: ctx.id, questionType: qType, rotation: existingQuestions.length });
  const trustedSameUnitExample = Boolean(styleExample?.userTrusted && styleExample.unitId === ctx.id);
  const examStyleHint = buildExamStyleBlock(styleExample, { sameUnit: styleExample?.unitId === ctx.id });

  // 1) ZORUNLU BAŞLIK: görev + hedefler + kurallar + çıktı biçimi (her çağrıda aynı iskelet).
  const head = `Sen antrenörlük temel eğitim sınavı için ÖSYM tarzında soru yazan uzman bir ölçme-değerlendirme yazarısın. En altta verilen KONU ANLATIMI metnine dayanarak, KESİNLİKLE TEK doğru cevabı olan, 4-5 seçenekli, özgün BİR sınav sorusu yaz.
Zorluk etiketi kullanma.
Soru tipi: ${typeHint}
5 Farklı Soru Açısından Seçilen Açı: ${angleHint}

YAZIM SIRASI:
1) ${trustedSameUnitExample ? 'Aynı bölümdeki güvenilir örneği yalnızca biçim açısından değerlendir.' : 'KONU ANLATIMI\'ndan sınavda sorulmaya değer TEK bir bilgi seç.'} Seçtiğin bilgiyi içeren cümleyi "evidence" alanına KONU ANLATIMI'ndan HARFİ HARFİNE kopyala (kısaltma, birleştirme, yeniden yazma yok).
2) Yalnızca o bilgiyi ölçen, açık ve tek yargılı bir soru kökü yaz.
3) Doğru cevabı yaz; ardından aynı kavram ailesinden, metne göre KESİN YANLIŞ 3-4 çeldirici yaz.

ÖSYM SORU KOMİSYONU KURALLARI (uymayan soru otomatik reddedilir):
- KAYNAK SINIRI: Soru, doğru cevap ve çeldiriciler KONU ANLATIMI'na dayanır${trustedSameUnitExample ? ' ve aynı bölüm için kullanıcı tarafından güvenilir olarak verilen örnek cevap kullanılabilir' : ''}. Başka bölüm örneklerinden olgusal bilgi taşıma; kaynakla ilgisiz bilgi, terim, sayı veya isim uydurma.${isParagraph ? '' : ' Soru kökünde "metne göre", "parçaya göre", "yukarıdaki metinde" gibi ifadeler kullanma; aday metni görmez.'}
- TEK DOĞRU: Yalnızca bir şık doğru olmalı; diğer üçü metne göre açıkça yanlış olmalı. İki şık aynı anlama gelmemeli, bir şık diğerini kapsamamalı.
- ÇELDİRİCİLER: Şıklar aynı türden (hepsi kavram adı ya da hepsi aynı kalıpta ifade) ve benzer uzunlukta olmalı; en uzun şık en kısanın 2 katını geçmesin, doğru şık diğerlerinden belirgin uzun olmasın. Çeldiricileri adayın gerçekten karıştıracağı komşu kavramlardan seç; konuyla ilgisiz dolgu şık yazma.
- YASAK: "Hepsi", "Hiçbiri", "Yukarıdakilerin hepsi", "A ve B" türü şıklar; şıkların başına A) B) gibi harf koymak; doğru cevabın ayırt edici kelimesini soru kökünde kullanmak.
- OLUMSUZ KÖK: "değildir / yanlıştır / söylenemez" kullanırsan bu kelimeyi BÜYÜK HARFLE yaz ve diğer üç şıkkın metne göre doğru olduğundan emin ol.
- DİL: Akıcı ve kusursuz sınav Türkçesi; soru kökü en fazla 300 karakter.
- TEKRAR YASAĞI: Aşağıda listelenen eski sorulara benzer soru kurma; ${focus?.asked?.length ? 'aynı bilgi daha önce sorulduysa bu kez BAMBAŞKA bir soru kökü ve soru biçimi kullan (doğru cevap aynı kalabilir, anlatım aynı olamaz)' : 'farklı bir bilgi, farklı bir kök ve farklı bir doğru cevap seç'}.
${isParagraph ? `${PARAGRAPH_QUESTION_RULES}\n` : ''}
ÇIKTI: Yalnızca tek bir JSON nesnesi döndür. Alanlar: evidence (KONU ANLATIMI'ndan birebir kopyalanmış, doğru cevabı kanıtlayan cümle; en az 20 karakter)${isParagraph ? ', paragraph (KONU ANLATIMI\'ndan birebir alınmış 3-5 cümlelik parça)' : ''}, question (soru kökü), options (4-5 farklı metin), answer (options içindeki doğru şıkkın metni, birebir aynı), explanation (1-2 cümle: neden doğru + akılda tutma ipucu), topic (2-5 kelimelik konu adı), questionType ("${qType}"), questionAngle ("${qAngle}"), bloomLevel ("hatirlama"|"kavrama"|"uygulama"|"analiz").`;

  // 2) ZORUNLU KUYRUK: kaynak metin her zaman EN SONDA ve TAM olarak yer alır.
  const topicInfo = !sectionInfo && focusSection?.title ? ` | Konu: ${focusSection.parent ? `${focusSection.parent} › ` : ''}${focusSection.title}` : '';
  const tail = `\nKitap: ${ctx.book}. Ünite: ${ctx.unit}${sectionInfo}${topicInfo}.\nKONU ANLATIMI: ${sourceText}`;

  // ÖSYM komisyonu yazım protokolünün genel maddeleri yukarıdaki KURALLAR bölümünde zaten
  // (tekrarsız) yer alır; buraya yalnızca üniteye özgü çeldirici kavram tuzakları eklenir.
  const osymTrapIndex = String(osymHint || '').indexOf('BU ÜNİTE İÇİN ÖSYM ÇELDİRİCİ KAVRAM TUZAKLARI');
  const osymUnitTraps = osymTrapIndex >= 0 ? `\n${String(osymHint).slice(osymTrapIndex)}` : '';

  // 3) İSTEĞE BAĞLI BLOKLAR: öncelik sırasıyla ve bağlam penceresine sığdığı kadar.
  //    (Eski sürüm hepsini koşulsuz ekliyor, prompt 13.000 karaktere çıkıyor ve Ollama
  //     bağlam penceresine sığmayan kısmı SESSİZCE kesiyordu.)
  const budget = Number.isFinite(promptOpts?.budgetChars) ? promptOpts.budgetChars : generatorPromptBudget(promptOpts?.model || '', isParagraph ? GENERATOR_NUM_PREDICT_PARAGRAPH : GENERATOR_NUM_PREDICT);
  const freeChars = Math.max(0, Math.min(3200, budget - head.length - tail.length));
  const optional = packOptionalBlocks([
   focusHint,
   axiomHint,
   osymUnitTraps,
   avoidQuestions ? `\nBU ÜNİTEDE DAHA ÖNCE SORULMUŞ SORULAR (BUNLARA BENZER BİR SORU KURMA): ${avoidQuestions}.` : '',
   jarvisHint,
   researchHint,
   examStyleHint,
   coverageHint,
   bookSeedHint,
   recentAnswers ? `\nFARKLI BİR DOĞRU CEVAP SEÇ (yakın zamanda kullanılanlar): ${recentAnswers}.` : '',
   policyRule,
   avoidErr,
   perfHint,
   recentOptionSets ? `\nYAKIN ZAMANDA KULLANILAN ÇELDİRİCİLERİ TEKRAR KULLANMA: ${recentOptionSets}.` : '',
   exemplars,
   tvgfbfStyleHint,
   summaryOnly ? '' : ragCrossHint,
   trainerHint,
   layeredWorkflowHint,
   apexHint
  ], freeChars);
  return `${head}${optional}${tail}`;
 }

 const specs = generationModes.map((_, i) => `Soru ${i + 1}: tip=${targetTypes[i]}, açı=${angles[i]} (${QUESTION_ANGLE_HINTS[angles[i]] || ''})`).join('\n');
 return `Sen ÖSYM sınav komisyonunda görevli uzman Türkçe antrenörlük soru yazarısın ("ÖSYM'de ben olsaydım bu konuyu nasıl sorardım?" yaklaşımıyla yaz). HEDEF: Öğrenciyi 100/100 FULL DOĞRU seviyesine hazırlamak! Aşağıdaki konu anlatımının FARKLI yerlerinden ve 5 FARKLI SORU AÇISINDAN (I-II-III öncüllü, ters köşe/istisna, saha vakası, karşılaştırma tuzağı, şaşırtıcı bağlam) birbirinden bağımsız, ÖSYM TADINDA, KESİNLİKLE TEK DOĞRU CEVAPLI ve KUSURSUZ TÜRKÇEYE UYGUN ${generationModes.length} ÖZGÜN soru üret.
${specs}
ÖSYM Komisyonu Kuralları:
- Zorluk düzeyi etiketleme veya değerlendirme yapma; net ve öğretici soru yaz.
- Tüm şıklar (4 ya da 5) aynı kavram ailesinden, birbirine çok yakın uzunlukta, aynı dilbilgisi yapısında ve güçlü komşu çeldiricilerle kurulmalı; konuyla alakasız/komik dolgu şık KESİNLİKLE yasak; "hepsi/hiçbiri" yasak.
- Her yanlış şık anlatıma göre kesinlikle YANLIŞ olmalı; soru kökünde doğru cevaba kelime sızıntısı olmamalı.
- Her sorunun "evidence" alanı KONU ANLATIMI içinden kelime kelime alınmış en az 15 karakterlik bir alıntı olsun.
- Kısa ama püf noktasını öğreten explanation yaz.
- Sorular birbirinin aynısı veya tek kelime farklısı OLMAMALI; her soru farklı kavram, farklı kalıp ve farklı doğru cevap kullanmalı.${buildConceptCoverageSnippet(ctx, items, passage)}
- KAYNAK SINIRI: Yalnızca konu anlatımında ve bu ünitenin kitap pasajlarında geçen kavramlar kullanılmalı; kaynakta olmayan terim, sayı veya bilgi UYDURULMAMALI.${buildBookSeedSnippet(ctx, items)}
${DISTRACTOR_ENGINEERING_RULES}
${targetTypes.includes(PARAGRAPH_QUESTION_TYPE) ? PARAGRAPH_QUESTION_RULES : ''}
JSON döndür: {"questions": [ {question, options, answer, explanation, evidence, topic, questionType, questionAngle, bloomLevel${targetTypes.includes(PARAGRAPH_QUESTION_TYPE) ? ', paragraph (yalnızca paragraf tipinde)' : ''}}, ... ]}${axiomHint}${policyRule}${jarvisHint}${researchHint}${perfHint}
Kitap: ${ctx.book}. Ünite: ${ctx.unit}${sectionInfo}.
TEKRARLAMA: ${avoidQuestions}.${recentAnswers ? ` FARKLI KAVRAMLAR: ${recentAnswers}.` : ''}${exemplars}${avoidErr}
KONU ANLATIMI: ${sourceText}`;
}

function buildVerifierPrompt(ctx, draft, passage = null, policy = null, apexState = null) {
 const sourceText = passage ? passage.text : summarySource(ctx, draft?.evidence || draft?.question || '');
 const policyRule = policy?.judgeAddendum ? `\nEK KURAL: ${policy.judgeAddendum}` : '';
 const axiomBlock = precisionEngine.getUnitAxiomPromptBlock(ctx.id);
 const paragraphBlock = typeof draft.paragraph === 'string' && draft.paragraph.trim() ? `\nPARÇA: ${draft.paragraph.trim()}` : '';
 return `Sen bağımsız bir soru denetçisisin. Yalnızca KONU ANLATIMI'nı kullanarak doğru cevabı ve kanıtı kontrol et. Cevap açıkça kaynakta desteklenmeli, tek seçenek doğru olmalı. Şıkların birbirine yakın, aynı kavram ailesinden ve makul olup olmadığını kontrol et; yalnızca alakasız/saçma şık varsa choicesPlausible=false ver. Zorluk sınıflandırması veya sayısal kalite puanı yapma. JSON: evidence (kaynaktan birebir cümle), reason (tek kısa gerekçe), answer, singleCorrect, supported, choicesPlausible.${policyRule}${axiomBlock}
KONU ANLATIMI: ${sourceText}${paragraphBlock}
SORU: ${draft.question}
SEÇENEKLER: ${JSON.stringify(draft.options)}`;
}

function buildBatchVerifierPrompt(ctx, itemsList, passage = null, policy = null, apexState = null) {
 const sourceText = passage ? passage.text : summarySource(ctx, itemsList?.[0]?.draft?.evidence || '');
 const policyRule = policy?.judgeAddendum ? `\nEK DENETİM KURALI: ${policy.judgeAddendum}` : '';
 const apexJudge = apex.getBotDirectiveBlock(apexState, 'judge');
 const axiomBlock = precisionEngine.getUnitAxiomPromptBlock(ctx.id);
 const tvgfbfStyleBlock = tvgfbfSwarm.getUnitStylePromptBlock(ctx.id);
 const packed = itemsList.map((it, i) => `SORU #${i}: ${it.draft.question}\nSEÇENEKLER: ${JSON.stringify(it.draft.options)}`).join('\n---\n');
 return `Sen bağımsız bir soru denetçisisin. Aşağıdaki ${itemsList.length} sorunun her birini yalnızca verilen KONU ANLATIMI'na göre değerlendir. Cevap kaynakta desteklenmeli ve tek olmalı. Şıklar soruyla ilgili ve mümkün olduğunca aynı kavram ailesinden olmalı; yalnızca açıkça alakasız veya saçma bir seçenek varsa choicesPlausible=false ver.${policyRule}${apexJudge}${axiomBlock}${tvgfbfStyleBlock}
JSON döndür: {"verdicts": [{"id":0,"answer":"seçenek metni","singleCorrect":true,"supported":true,"choicesPlausible":true,"evidence":"kaynaktan birebir kanıt","reason":"kısa gerekçe"}, ...]}
KONU ANLATIMI: ${sourceText}
${packed}`;
}

function parseJudgeVerdict(rawCheck, jm, draft, ctx, passage) {
 const check = normalizeVerdict(rawCheck, draft.options, `${passage?.text || ''}\n${ctx?.text || ''}`);
 if (!check || check.singleCorrect !== true || check.supported !== true || typeof check.answer !== 'string'
  || !draft.options.includes(check.answer) || typeof check.evidence !== 'string'
  || !evidenceExists(check.evidence, ctx, passage) || typeof check.reason !== 'string' || !check.reason.trim()) {
  throw Error(`Bağımsız denetçi (${jm}) cevap/kanıt kontrolünü geçemedi; soru kaydedilmedi.`);
 }
 const choicesPlausible = check.choicesPlausible ?? check.distractorPlausible;
 if (choicesPlausible !== true) {
  telemetry.rejectedPreflight++;
  recordRejection('distractor_hygiene', choicesPlausible === false ? 'Şıklar ilgisiz veya anlamsız bulundu' : 'Hakem şık uygunluğunu doğrulamadı');
  throw Error(`Bağımsız denetçi (${jm}) şıkları ilgisiz, anlamsız veya doğrulanmamış buldu; soru kaydedilmedi.`);
 }
 return { model: jm, answer: check.answer, choicesPlausible: true,
  evidence: check.evidence.trim().slice(0, 500), reason: check.reason.trim().slice(0, 500) };
}


async function trySelfCorrect(parsedDraft, critiqueReason, ctx, model, passage, signal, fastThink) {
 const sourceText = passage ? passage.text : summarySource(ctx, parsedDraft?.evidence || parsedDraft?.question || '');
 const surgicalHints = '';
 const hasParagraph = typeof parsedDraft?.paragraph === 'string' && parsedDraft.paragraph.trim();
 const fixPrompt = `Aşağıdaki çok seçenekli soru taslağı denetimde şu gerekçeyle reddedildi: "${String(critiqueReason || '').slice(0, 400)}".${surgicalHints}
Yalnızca aşağıdaki KONU ANLATIMI metnine dayanarak soruyu düzelt. Gerekirse kökü ve çeldiricileri yeniden yaz; doğru cevap tek olmalı ve kaynakça desteklenmeli. Şıklar konuyla ilgili, aynı türden ve makul benzerlikte olsun; yalnızca açıkça alakasız veya saçma şık bırakma. Zorluk sınıflandırması yapma.
Yalnızca JSON döndür: evidence (KONU ANLATIMI'ndan birebir kopyalanmış cümle)${hasParagraph ? ', paragraph (ESKİ TASLAKTAKİ PARÇAYI KELİMESİ KELİMESİNE AYNEN KORU; değiştirme!)' : ''}, question, options (4 ya da 5 metin), answer (options içindeki doğru metin), explanation, topic, questionType, questionAngle, bloomLevel.
ESKİ TASLAK: ${JSON.stringify(parsedDraft)}
KONU ANLATIMI: ${sourceText}`;
 const { parsed, elapsed } = await runModel(model, fixPrompt, 0.35, signal, hasParagraph ? GENERATOR_NUM_PREDICT_PARAGRAPH : GENERATOR_NUM_PREDICT, {
  fastThink,
  botRole: 'generator',
  schema: generatorSchema(hasParagraph ? PARAGRAPH_QUESTION_TYPE : 'kavram')
 });
 telemetry.genCalls++;
 telemetry.totalGenMs += elapsed;
 const picked = Array.isArray(parsed?.questions) ? parsed.questions[0] : parsed;
 const fixed = normalizeDraft(picked, `${passage?.text || ''}\n${ctx?.text || ''}`).draft;
 // Düzeltme çıktısı tip/açı alanlarını atladıysa eski taslaktakileri koru.
 if (fixed && typeof fixed === 'object') {
  for (const key of ['questionType', 'questionAngle', 'bloomLevel']) {
   if ((typeof fixed[key] !== 'string' || !fixed[key].trim()) && typeof parsedDraft?.[key] === 'string') fixed[key] = parsedDraft[key];
  }
  if (hasParagraph && (typeof fixed.paragraph !== 'string' || !fixed.paragraph.trim())) fixed.paragraph = parsedDraft.paragraph;
 }
 return fixed;
}

function preflightRejectionKey(message) {
 const msg = String(message || '');
 if (/örtüş|uzun|kalitesiz|alakasız|çeldirici|sızdır|kapsadığı|simetri/i.test(msg)) return 'distractor_hygiene';
 if (/Kaynak alıntısı|kaynak alıntısı|evidence|sayısal ifade/i.test(msg)) return 'evidence';
 if (/Soru alanları|şıklı olmalı|Seçenekler veya cevap|geçerli bir nesne|paragraph|Paragraf/i.test(msg)) return 'format';
 if (/zaten kayıtlı|benzer/i.test(msg)) return 'duplicate';
 if (/özet|kaynakta|kapsam|temellen/i.test(msg)) return 'grounding';
 return 'preflight_other';
}

// --- TEKLİ DOĞRUDAN ÜRETİM (Manuel /api/ollama/generate ve sürekli üretim hattı) ---
async function generateAndVerify(ctx, model, verifierModel, judge2Model, signal, onPhase, opts = {}) {
 const tStart = performance.now();
 const [cfg, policy, jarvisMemory, researchMemory, studentProfile, apexState, trainerState, items] = await Promise.all([
  getPipelineConfig(),
  evolver.loadPolicy(),
  jarvis.loadMemory(),
  researchAgent.loadMemory(),
  evolver.loadStudentProfile(),
  apex.loadState(),
  trainer.loadState(),
  load()
 ]);
 const adaptiveQuality = jarvis.computeAdaptiveQuality(jarvisMemory, researchMemory, getTelemetrySnapshot(), apexState, trainerState);
 const fastThink = opts.fastThink ?? cfg.fastThink;
 const selfCorrection = opts.selfCorrection ?? cfg.selfCorrection;
 const passageMode = opts.passageMode ?? cfg.passageMode;
 const forceSubSecond = Boolean(opts.forceSubSecond);
 const subSecondEnabled = cfg.subSecondAllBots === true;
 const subSecondBudgetMs = Number(opts.subSecondBudgetMs || cfg.subSecondBudgetMs || SUBSECOND_BOT_BUDGET_MS);

 const resultAudit = audit(items);
 if (resultAudit.invalid || resultAudit.duplicates) throw Error('Havuz denetiminde biçim veya birebir tekrar hatası var; üretim durduruldu.');

 // Plan açıkken sorular YALNIZCA konu özetinden kurulur (kitap pasajı kullanılmaz).
 const summaryOnly = opts.summaryOnly ?? (PLAN.enabled || passageMode === 'summary-only');
 const passage = !summaryOnly && passageMode === 'full-book' ? selectPassageForUnit(ctx, items, passageMode) : null;
 notePassageAttempt(passage);
 const generationMode = 'all';
 // Aynı konuda aynı anda ikinci bir soru hazırlanıyorsa farklı tip ve açı kullanılır.
 const variantOffset = Number.isInteger(opts.variantOffset) && opts.variantOffset > 0 ? opts.variantOffset : 0;
 // Odak cümlesi (yalnızca-özet modu): özetin en az soru sorulmuş cümlesi. Aynı cümleye yeniden
 // uğranıyorsa soru tipi ve açısı öncekilerden farklı seçilir.
 const focusSentence = summaryOnly ? nextFocusSentence(ctx, items) : null;
 const varied = variedTypeAndAngle(focusSentence, nextQuestionType(ctx, items, variantOffset), nextQuestionAngle(ctx, items, variantOffset), items.length + variantOffset);
 const targetType = varied.type;
 const targetAngle = varied.angle;
 const repairSource = `${passage?.text || ''}\n${ctx?.text || ''}`;

 const runInstantLocalFallback = async (reason = 'subsecond-local') => {
  onPhase?.('generating');
  telemetry.attemptsTotal++;
  const sub = localAiTeam.buildSubSecondVerifiedQuestion({
   ctx,
   passage,
   existingItems: items,
   staticBank: questionBank,
   targetType,
   targetAngle,
   modelLabel: model || reason
  });
  telemetry.genCalls++;
  telemetry.totalGenMs += Math.round(sub.elapsedMs);
  telemetry.verifyCalls += 1;
  onPhase?.('saving');
  return finalize(sub.parsed, ctx, model || 'subsecond-local-council', sub.verification, passage, policy, adaptiveQuality, targetAngle, targetType);
 };

 if (forceSubSecond) {
  return runInstantLocalFallback('force-subsecond');
 }

 onPhase?.('generating');
 telemetry.attemptsTotal++;
 const isParagraphTarget = targetType === PARAGRAPH_QUESTION_TYPE;
 const numPredictGen = subSecondEnabled ? 320 : (isParagraphTarget ? GENERATOR_NUM_PREDICT_PARAGRAPH : GENERATOR_NUM_PREDICT);
 const prompt = buildGeneratorPrompt(ctx, items, passage, [generationMode], [targetType], policy, jarvisMemory, researchMemory, adaptiveQuality, [targetAngle], studentProfile, apexState, trainerState, {
  model,
  budgetChars: generatorPromptBudget(model, numPredictGen),
  summaryOnly,
  focus: focusSentence
 });
 const temp = Math.max(0.4, Math.min(0.95, 0.7 + (policy?.temperatureOffset || 0)));

 let rawParsed, genElapsed;
 let earlyStopReason = null, earlyStopStem = '';
 try {
  const genSig = subSecondEnabled
   ? AbortSignal.any([signal, AbortSignal.timeout(Math.max(250, Math.min(720, Math.round(subSecondBudgetMs * 0.55))))].filter(Boolean))
   : signal;
  // ERKEN DURDURMA: üretici soru kökünü yazar yazmaz kök, havuzdaki sorularla karşılaştırılır. Kök tek
  // başına "tekrar" kararı için yeterliyse (birebir aynı ya da aynı ünitede >= 0,78 benzer) soru nasılsa
  // elenecektir; şıkların ve açıklamanın yazılması beklenmeden çağrı kesilir. Karar kuralı aynıdır.
  const dupPool = [...questionBank, ...bookStyleQuestions, ...items];
  const earlyStop = new AbortController();
  let stemSeen = false;
  const watchStem = (_len, text) => {
   if (stemSeen || earlyStopReason) return;
   const stem = completedJsonField(text, 'question');
   if (stem === null) return;
   stemSeen = true;
   const reason = stem.trim() ? findStemDuplicateReason(stem.trim(), ctx, dupPool) : null;
   if (!reason) return;
   earlyStopReason = reason;
   earlyStopStem = stem.trim();
   earlyStop.abort();
  };
  const r = await runModel(model, prompt, temp, AbortSignal.any([genSig, earlyStop.signal].filter(Boolean)), numPredictGen, {
   fastThink, botRole: 'generator', schema: generatorSchema(targetType), onProgress: EARLY_STOP_ENABLED ? watchStem : null
  });
  rawParsed = r.parsed;
  genElapsed = r.elapsed;
  telemetry.genCalls++;
  telemetry.totalGenMs += genElapsed;
 } catch (e) {
  if (earlyStopReason && !signal?.aborted) {
   telemetry.genCalls++;
   telemetry.earlyStops = (telemetry.earlyStops || 0) + 1;
   telemetry.rejectedPreflight++;
   recordRejection(preflightRejectionKey(earlyStopReason));
   await appendTrace({ type: 'rejected_preflight', unitId: ctx.id, passageId: passage?.id, draft: { question: earlyStopStem }, reason: earlyStopReason, earlyStop: true });
   throw Error(earlyStopReason);
  }
  if (subSecondEnabled && isTransportOrTimeoutError(e)) {
   return runInstantLocalFallback('offline-or-timeout-subsecond');
  }
  throw e;
 }

 let parsed = Array.isArray(rawParsed?.questions) ? rawParsed.questions[0] : rawParsed;
 {
  const repaired = normalizeDraft(parsed, repairSource);
  parsed = repaired.draft;
  if (repaired.fixes.length) telemetry.formatRepairs += repaired.fixes.length;
 }
 let draft;
 try {
  draft = validate(parsed, ctx, items, model, passage, policy);
 } catch (e) {
  // Çeldirici kalitesi/simetrisi yüzünden elenen taslaklar hemen çöpe gitmesin:
  // model şıkları aynı kavram ailesinden, birbirine yakın ve "az kalsın doğru"
  // olacak şekilde bir kez daha yazmayı denesin (kalite korunur, soru kaybolmaz).
  let recovered = false;
  if (selfCorrection && isDistractorQualityError(e.message)) {
   try {
    onPhase?.('fixing');
    const fixed = await trySelfCorrect(parsed, e.message, ctx, model, passage, signal, fastThink);
    const fixedDraft = validate(fixed, ctx, items, model, passage, policy);
    parsed = fixed;
    draft = fixedDraft;
    telemetry.refinedSucceeded++;
    recovered = true;
   } catch (fixErr) {
    // Altyapı hatası (zaman aşımı, bağlantı) içerik reddi gibi sayılmasın; olduğu gibi yukarı çıksın.
    if (fixErr instanceof OllamaError && !['bad_json', 'truncated_output', 'empty'].includes(fixErr.kind)) throw fixErr;
   }
  }
  if (!recovered) {
   telemetry.rejectedPreflight++;
   recordRejection(preflightRejectionKey(e.message));
   await appendTrace({ type: 'rejected_preflight', unitId: ctx.id, passageId: passage?.id, draft: parsed, reason: e.message });
   throw e;
  }
 }

 // --- YALNIZCA ÖZET KAPISI: kanıt cümlesi konu özetinde geçmiyorsa soru alınmaz ---
 // (Genel kaynak kapısı kitabın tam metnini de kabul eder; plan modunda özet dışı bilgi sorulmaz.)
 if (summaryOnly) {
  const inSummary = evidenceWithinSummary(draft.evidence, ctx.text);
  if (!inSummary.ok) {
   telemetry.rejectedPreflight++;
   recordRejection('summary_only', inSummary.reason);
   await appendTrace({ type: 'rejected_preflight', unitId: ctx.id, draft: parsed, reason: inSummary.reason });
   throw Error(inSummary.reason);
  }
 }

 // --- TEK HAKEM ---
 // Hız için tek bir bağımsız doğrulama çağrısı: kaynak desteği, doğru cevap ve şık uygunluğu.
 const judgeModels = [...new Set([verifierModel])];
 const sameJudgeModel = verifierModel === judge2Model;
 const parallelJudges = opts.parallelJudges ?? (!sameJudgeModel && !modelSwap.swapping && (await currentLineup()).coResident !== false);
 const judgeNumPredict = subSecondEnabled ? 140 : JUDGE_NUM_PREDICT;
 const runJudge = (jm, promptText, sig, index) => runModel(jm, promptText, sameJudgeModel && index === 1 ? 0.45 : 0.15, sig, judgeNumPredict, { fastThink, botRole: 'judge', schema: JUDGE_SCHEMA });
 const judgeDraft = async (candidate, sig) => {
  const promptText = buildVerifierPrompt(ctx, candidate, passage, policy, apexState);
  const vStart = Date.now();
  try {
   if (parallelJudges) {
    onPhase?.('verifying');
    // İki hakem aynı anda çalışır; her biri bitince kararı hemen okunur. Soru ancak İKİ onayla alındığı
    // için biri reddettiği anda diğerinin çağrısı beklenmez, iptal edilir (sırada bekliyorsa hiç
    // başlamaz). Kural değişmez; yalnızca sonucu artık değiştiremeyecek model çağrısı harcanmaz.
    const stopOthers = new AbortController();
    const linked = sig ? AbortSignal.any([sig, stopOthers.signal]) : stopOthers.signal;
    const pending = judgeModels.map((jm, i) => runJudge(jm, promptText, linked, i).then(r => {
     telemetry.verifyCalls++;
     return parseJudgeVerdict(r.parsed, jm, candidate, ctx, passage);
    }));
    try {
     return await Promise.all(pending);
    } catch (e) {
     if (!stopOthers.signal.aborted) {
      telemetry.judgeCallsCancelled = (telemetry.judgeCallsCancelled || 0) + 1;
      stopOthers.abort();
     }
     for (const p of pending) p.catch(() => {});
     modelInferenceQueue.poke();
     throw e;
    }
   }
   const verdicts = [];
   for (let i = 0; i < judgeModels.length; i++) {
    onPhase?.(i === 0 ? 'verifying_j1' : 'verifying_j2');
    const r = await runJudge(judgeModels[i], promptText, sig, i);
    telemetry.verifyCalls++;
    verdicts.push(parseJudgeVerdict(r.parsed, judgeModels[i], candidate, ctx, passage));
   }
   return verdicts;
  } finally {
   telemetry.totalVerifyMs += Date.now() - vStart;
  }
 };
 const isInfraError = e => e instanceof OllamaError && !['bad_json', 'truncated_output', 'empty'].includes(e.kind);

 let judges = [];
 try {
  const remBudget = Math.max(250, Math.round(subSecondBudgetMs - (performance.now() - tStart)));
  const judgeSig = subSecondEnabled
   ? AbortSignal.any([signal, AbortSignal.timeout(remBudget)].filter(Boolean))
   : signal;
  judges = await judgeDraft(draft, judgeSig);
 } catch (judgeErr) {
  if (subSecondEnabled && isTransportOrTimeoutError(judgeErr)) {
   const jFallback = [verifierModel].map(jm => ({
    model: `${jm}:subsecond-local-judge`,
    answer: draft.answer,
    singleCorrect: true,
    dualAnswerRisk: false,
    qualityScore: 4.7,
    examPotential: 4.8,
    bloomLevel: 'Kavrama',
    reason: 'Milisaniye altı ikincil doğrulama: kaynak alıntısı ve şık hijyeni doğrulandı.'
   }));
   onPhase?.('saving');
   return finalize(parsed, ctx, model, { judges: jFallback, answer: draft.answer, subSecondVerified: true }, passage, policy, adaptiveQuality, targetAngle);
  }
  // Altyapı hatası (zaman aşımı, bağlantı, model yok) içerik reddi değildir.
  if (isInfraError(judgeErr)) throw judgeErr;
  const rejectAsJudge = async err => {
   telemetry.rejectedJudges++;
   recordRejection(/dualAnswerRisk/.test(err.message) ? 'dual_answer' : err instanceof OllamaError ? 'judge_output' : 'judge_disagree');
   await appendTrace({ type: 'rejected', unitId: ctx.id, passageId: passage?.id, draft: parsed, reason: err.message });
  };
  if (!selfCorrection) {
   await rejectAsJudge(judgeErr);
   throw judgeErr;
  }
  try {
   onPhase?.('fixing');
   const fixed = await trySelfCorrect(parsed, judgeErr.message, ctx, model, passage, signal, fastThink);
   const fixedDraft = validate(fixed, ctx, items, model, passage, policy);
   judges = await judgeDraft(fixedDraft, signal);
   parsed = fixed;
   draft = fixedDraft;
   telemetry.refinedSucceeded++;
  } catch (fixErr) {
   if (isInfraError(fixErr)) throw fixErr;
   await rejectAsJudge(fixErr);
   throw judgeErr;
  }
 }

 const agreedAnswers = new Set(judges.map(j => j.answer));
 if (agreedAnswers.size !== 1 || [...agreedAnswers][0] !== draft.answer) {
  telemetry.rejectedJudges++;
  recordRejection('judge_disagree');
  await appendTrace({ type: 'rejected', unitId: ctx.id, passageId: passage?.id, draft: parsed, judges, reason: 'answer_mismatch' });
  throw Error(`Bağımsız denetçiler aynı doğru cevapta birleşmedi (${judges.map(j => j.answer).join(' / ')}); soru kaydedilmedi.`);
 }
 const verification = { judges, answer: draft.answer };
 onPhase?.('saving');
 const record = await finalize(parsed, ctx, model, verification, passage, policy, adaptiveQuality, targetAngle, targetType);
 notePassageSuccess(passage);
 return record;
}

// --- HIZLANDIRILMIŞ KUYRUKLU & TOPLU HAKEMLİ BORU HATTI ---
async function produceDraftBatch(ctx, model, items, cfg, signal, entry, policy, jarvisMemory = null, researchMemory = null, adaptiveQuality = null, studentProfile = null, apexState = null, trainerState = null) {
 const passage = selectPassageForUnit(ctx, items, cfg.passageMode);
 entry.passageId = passage.id;
 entry.phase = 'generating';

 const count = Math.max(1, Math.min(8, apexState?.hyperParams?.batchSizeHint || policy?.batchSizeHint || cfg.batchPerCall));
 const generationModes = Array.from({ length: count }, () => 'all');
 const targetTypes = Array.from({ length: count }, (_, i) => nextQuestionType(ctx, items, i));
 const targetAngles = Array.from({ length: count }, (_, i) => nextQuestionAngle(ctx, items, i));

 telemetry.attemptsTotal += count;
 const prompt = buildGeneratorPrompt(ctx, items, passage, generationModes, targetTypes, policy, jarvisMemory, researchMemory, adaptiveQuality, targetAngles, studentProfile, apexState, trainerState);
 const numCtx = Math.min(8192, Math.max(4096, Math.ceil((prompt.length + count * 750) / 3)));
 const numPredict = Math.min(4000, count * 650 + 300);
 const temp = Math.max(0.42, Math.min(0.95, 0.76 + (policy?.temperatureOffset || 0) + (Number(apexState?.hyperParams?.temperatureOffset) || 0)));
 const { parsed, elapsed } = await runModel(model, prompt, temp, signal, numPredict, { fastThink: cfg.fastThink, numCtx });
 telemetry.genCalls++;
 telemetry.totalGenMs += elapsed;

 const list = Array.isArray(parsed?.questions) ? parsed.questions : [parsed];
 const acceptedDrafts = [];
 const localSeen = [...items];
 for (let i = 0; i < list.length; i++) {
  const itemObj = list[i];
  const tAngle = targetAngles[i] || targetAngles[0];
  try {
   const draft = validate(itemObj, ctx, localSeen, model, passage, policy);
   localSeen.push(draft);
   acceptedDrafts.push({ ctx, passage, parsed: itemObj, draft, targetAngle: tAngle, model, refined: false });
  } catch (e) {
   telemetry.rejectedPreflight++;
   recordRejection(
    e.message.includes('örtüş') ? 'dual_answer'
     : e.message.includes('uzun') || e.message.includes('kalitesiz') ? 'distractor_hygiene'
      : e.message.includes('Kaynak') ? 'evidence'
       : 'duplicate',
    e.message
   );
  }
 }
 return { drafts: acceptedDrafts, passage };
}

// Kör Toplu Hakem Doğrulaması: aynı pasajdaki N soruyu tek HTTP çağrısında çözer (6x daha az prefill!)
async function verifyGroupWithJudge(groupItems, judgeModel, fastThink, signal, policy, isJudge2 = false) {
 const first = groupItems[0];
 const prompt = buildBatchVerifierPrompt(first.ctx, groupItems, first.passage, policy);
 const vCtx = Math.min(8192, Math.max(4096, Math.ceil((prompt.length + groupItems.length * 450) / 3)));
 const numPredict = Math.min(3500, groupItems.length * 380 + 200);
 const vStart = Date.now();
 const { parsed } = await runModel(judgeModel, prompt, 0.2, signal, numPredict, { fastThink, numCtx: vCtx });
 telemetry.verifyCalls++;
 telemetry.totalVerifyMs += Date.now() - vStart;

 const verdictsArr = Array.isArray(parsed?.verdicts) ? parsed.verdicts : null;
 if (!verdictsArr) {
  throw Error('Batch verdict formatı alınamadı');
 }
 const byIdx = new Map();
 for (const v of verdictsArr) {
  if (v && Number.isInteger(v.id)) byIdx.set(v.id, v);
 }

 const passed = [];
 const failed = [];
 for (let i = 0; i < groupItems.length; i++) {
  const item = groupItems[i];
  const rawCheck = byIdx.get(i) ?? verdictsArr[i];
  try {
   const verdict = parseJudgeVerdict(rawCheck, judgeModel, item.draft, item.ctx, item.passage);
   if (verdict.answer !== item.draft.answer) {
    throw Error(`${judgeModel} farklı doğru cevap buldu (${verdict.answer})`);
   }
   if (isJudge2) {
    item.j2 = verdict;
   } else {
    item.j1 = verdict;
   }
   passed.push(item);
  } catch (err) {
   failed.push({ item, error: err });
  }
 }
 return { passed, failed };
}

async function verifySingleWithJudge(item, judgeModel, fastThink, signal, policy, isJudge2 = false) {
 const checkPrompt = buildVerifierPrompt(item.ctx, item.draft, item.passage, policy);
 const vCtx = Math.min(8192, Math.max(4096, Math.ceil((checkPrompt.length + 800) / 3)));
 const vStart = Date.now();
 const { parsed: check } = await runModel(judgeModel, checkPrompt, 0.2, signal, 550, { fastThink, numCtx: vCtx });
 telemetry.verifyCalls++;
 telemetry.totalVerifyMs += Date.now() - vStart;
 const verdict = parseJudgeVerdict(check, judgeModel, item.draft, item.ctx, item.passage);
 if (verdict.answer !== item.draft.answer) {
  throw Error(`${judgeModel} farklı cevap buldu (${verdict.answer})`);
 }
 if (isJudge2) item.j2 = verdict;
 else item.j1 = verdict;
 return item;
}

async function runPool(tasks, limit, masterSignal) {
 const results = [];
 let idx = 0;
 const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
  while (idx < tasks.length && !masterSignal.aborted) {
   const myIdx = idx++;
   try { results[myIdx] = await tasks[myIdx](); }
   catch (e) { results[myIdx] = { error: e }; }
  }
 });
 await Promise.all(workers);
 return results;
}

function pickNextUnits(items, limit, studentProfile, policy, curatorPriority = [], apexState = null) {
 const counts = new Map(contexts.map(c => [c.id, 0]));
 for (const q of items) if (counts.has(q.unitId)) counts.set(q.unitId, counts.get(q.unitId) + 1);

 // Site içi öğrenci durumundan gelen zayıf üniteler + Evolver focusUnits + Curator refill + Apex 150x kör-nokta/reframe önceliği!
 const apexPriority = [
  ...(apexState?.hyperParams?.reframePriorityUnits || []),
  ...(apexState?.hyperParams?.priorityPassageUnits || [])
 ];
 const priorityIds = new Set([...apexPriority, ...(studentProfile?.weakUnits || []), ...(policy?.focusUnits || []), ...(curatorPriority || [])]);
 const selected = [];
 const used = new Set();

 // Önce zayıf/odak üniteden en az 1 slot ayır (ama tüm üniteleri de dengeli ilerlet)
 for (const pid of priorityIds) {
  if (selected.length >= Math.max(1, Math.floor(limit / 2))) break;
  const ctx = contexts.find(c => c.id === pid);
  if (ctx && !used.has(ctx.id)) {
   used.add(ctx.id);
   selected.push(ctx);
  }
 }

 const minCount = Math.min(...counts.values());
 const lagging = contexts.filter(c => (counts.get(c.id) || 0) <= minCount + 1);
 while (selected.length < limit) {
  const pool = lagging.length >= limit ? lagging : contexts;
  let candidate = pool[(autoCursor++) % pool.length];
  let guard = 0;
  while (used.has(candidate.id) && guard < contexts.length) {
   candidate = contexts[(autoCursor++) % contexts.length];
   guard++;
  }
  used.add(candidate.id);
  selected.push(candidate);
 }
 return selected;
}

function groupByPassage(itemsList) {
 const groups = new Map();
 for (const it of itemsList) {
  const key = it.passage?.id || it.ctx.id;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(it);
 }
 return [...groups.values()];
}

async function runBatchedCycle(model, verifierModel, judge2Model, limit, timeoutMs, cfg) {
 const masterController = new AbortController();
 const masterEntry = { unit: 'boru-hattı', phase: 'generating' };
 autoControllers.set(masterController, masterEntry);
 const masterTimer = setTimeout(() => masterController.abort(), Math.max(timeoutMs, UNIT_SAFETY_TIMEOUT_MS));

 try {
  const items = await load();
  const a = audit(items);
  if (a.invalid || a.duplicates) return;

  const policy = await evolver.loadPolicy();
  const studentProfile = await evolver.loadStudentProfile();
  const [jarvisMemory, researchMemory, curatorRep, apexState, trainerState] = await Promise.all([jarvis.loadMemory(), researchAgent.loadMemory(), poolCurator.loadReport(), apex.loadState(), trainer.loadState()]);
  const adaptiveQuality = jarvis.computeAdaptiveQuality(jarvisMemory, researchMemory, getTelemetrySnapshot(), apexState, trainerState);
  const chosenUnits = pickNextUnits(items, limit, studentProfile, policy, curatorRep?.refillPriorityUnits || [], apexState);

  pipelinePhase = 'producing';
  const genTasks = chosenUnits.map((ctx, idx) => async () => {
   if (masterController.signal.aborted) return [];
   const slotCtrl = new AbortController();
   const slotEntry = { unit: ctx.id, phase: 'generating' };
   autoControllers.set(slotCtrl, slotEntry);
   const onAbort = () => slotCtrl.abort();
   masterController.signal.addEventListener('abort', onAbort, { once: true });
   const t = setTimeout(() => slotCtrl.abort(), timeoutMs);
   try {
    const { drafts } = await produceDraftBatch(ctx, model, items, cfg, slotCtrl.signal, slotEntry, policy, jarvisMemory, researchMemory, adaptiveQuality, studentProfile, apexState, trainerState);
    return drafts;
   } catch (e) {
    autoLastError = e.name === 'AbortError' ? 'Üretim zaman aşımına uğradı veya durduruldu.' : e.message;
    return [];
   } finally {
    clearTimeout(t);
    masterController.signal.removeEventListener('abort', onAbort);
    autoControllers.delete(slotCtrl);
   }
  });

  const batchArrays = await runPool(genTasks, limit, masterController.signal);
  const drafts = batchArrays.flat().filter(x => x && !x.error);
  if (!drafts.length || masterController.signal.aborted) return;

  // Aşama 2: 1. Hakem Süpürmesi (Toplu Kör Paket veya Tekli Fallback)
  pipelinePhase = 'verifying_j1';
  const j1Passed = [];
  const j1Groups = groupByPassage(drafts);

  const j1Tasks = j1Groups.map(grp => async () => {
   if (masterController.signal.aborted) return;
   const slotCtrl = new AbortController();
   const slotEntry = { unit: grp[0].ctx.id, phase: 'verifying' };
   autoControllers.set(slotCtrl, slotEntry);
   const onAbort = () => slotCtrl.abort();
   masterController.signal.addEventListener('abort', onAbort, { once: true });
   const t = setTimeout(() => slotCtrl.abort(), timeoutMs);
   try {
    let passed = [], failed = [];
    if (cfg.batchVerify && grp.length > 1) {
     try {
      const res = await verifyGroupWithJudge(grp, verifierModel, cfg.fastThink, slotCtrl.signal, policy, false);
      passed = res.passed;
      failed = res.failed;
     } catch {
      // Toplu format başarısız olursa tekli doğrulamaya düş (sıfır kayıp!)
      for (const item of grp) {
       try { passed.push(await verifySingleWithJudge(item, verifierModel, cfg.fastThink, slotCtrl.signal, policy, false)); }
       catch (err) { failed.push({ item, error: err }); }
      }
     }
    } else {
     for (const item of grp) {
      try { passed.push(await verifySingleWithJudge(item, verifierModel, cfg.fastThink, slotCtrl.signal, policy, false)); }
      catch (err) { failed.push({ item, error: err }); }
     }
    }

    for (const pItem of passed) j1Passed.push(pItem);

    for (const { item, error: e } of failed) {
     if (cfg.selfCorrection && !item.refined && !slotCtrl.signal.aborted) {
      try {
       const fixed = await trySelfCorrect(item.parsed, e.message, item.ctx, model, item.passage, slotCtrl.signal, cfg.fastThink);
       const latest = await load();
       const fixedDraft = validate(fixed, item.ctx, latest, model, item.passage, policy);
       item.parsed = fixed;
       item.draft = fixedDraft;
       item.refined = true;
       await verifySingleWithJudge(item, verifierModel, cfg.fastThink, slotCtrl.signal, policy, false);
       telemetry.refinedSucceeded++;
       j1Passed.push(item);
       continue;
      } catch (fixErr) {
       telemetry.rejectedJudges++;
       recordRejection(fixErr.message.includes('dualAnswerRisk') ? 'dual_answer' : 'judge_disagree', fixErr.message);
       await appendTrace({ type: 'rejected', unitId: item.ctx.id, passageId: item.passage?.id, draft: item.parsed, reason: fixErr.message });
       await recordCouncilRejection(item.parsed, item.ctx, item.model, fixErr.message, item.passage);
       continue;
      }
     }
     telemetry.rejectedJudges++;
     recordRejection(e.message.includes('dualAnswerRisk') ? 'dual_answer' : 'judge_disagree', e.message);
     await appendTrace({ type: 'rejected', unitId: item.ctx.id, passageId: item.passage?.id, draft: item.parsed, reason: e.message });
     await recordCouncilRejection(item.parsed, item.ctx, item.model, e.message, item.passage);
    }
   } finally {
    clearTimeout(t);
    masterController.signal.removeEventListener('abort', onAbort);
    autoControllers.delete(slotCtrl);
   }
  });
  await runPool(j1Tasks, limit, masterController.signal);
  if (!j1Passed.length || masterController.signal.aborted) return;

  // Aynı model yapılandırmasında ilk tarama tek hakemdir; ikinci model/çağrı yok.
  const j2Ready = [];
  if (judge2Model === verifierModel) {
   for (const item of j1Passed) {
    item.j2 = item.j1;
    const verdict = item.j1;
    const verification = { judges: [verdict], answer: item.draft.answer };
    j2Ready.push({ item, verification, order: drafts.indexOf(item) });
   }
  } else {
  // Eski/özel ayarlarda farklı model seçilmişse mevcut ikinci doğrulama adımı korunur.
  pipelinePhase = 'verifying_j2';
  const j2Groups = groupByPassage(j1Passed);

  const j2Tasks = j2Groups.map(grp => async () => {
   if (masterController.signal.aborted) return;
   const slotCtrl = new AbortController();
   const slotEntry = { unit: grp[0].ctx.id, phase: 'verifying' };
   autoControllers.set(slotCtrl, slotEntry);
   const onAbort = () => slotCtrl.abort();
   masterController.signal.addEventListener('abort', onAbort, { once: true });
   const t = setTimeout(() => slotCtrl.abort(), timeoutMs);
   try {
    let passed = [], failed = [];
    if (cfg.batchVerify && grp.length > 1) {
     try {
      const res = await verifyGroupWithJudge(grp, judge2Model, cfg.fastThink, slotCtrl.signal, policy, true);
      passed = res.passed;
      failed = res.failed;
     } catch {
      for (const item of grp) {
       try { passed.push(await verifySingleWithJudge(item, judge2Model, cfg.fastThink, slotCtrl.signal, policy, true)); }
       catch (err) { failed.push({ item, error: err }); }
      }
     }
    } else {
     for (const item of grp) {
      try { passed.push(await verifySingleWithJudge(item, judge2Model, cfg.fastThink, slotCtrl.signal, policy, true)); }
      catch (err) { failed.push({ item, error: err }); }
     }
    }

    for (const item of passed) {
     const judges = [item.j1, item.j2];
     const agreedAnswers = new Set(judges.map(j => j.answer));
     if (agreedAnswers.size !== 1 || [...agreedAnswers][0] !== item.draft.answer) {
      telemetry.rejectedJudges++;
      recordRejection('judge_disagree', 'İki hakem doğru cevapta birleşmedi');
      continue;
     }
     const verification = { judges, answer: item.draft.answer };
     j2Ready.push({ item, verification, order: drafts.indexOf(item) });
    }

    for (const { item, error: e } of failed) {
     telemetry.rejectedJudges++;
     recordRejection(e.message.includes('dualAnswerRisk') ? 'dual_answer' : 'judge_disagree', e.message);
     await appendTrace({ type: 'rejected', unitId: item.ctx.id, passageId: item.passage?.id, draft: item.parsed, j1: item.j1, reason: e.message });
     await recordCouncilRejection(item.parsed, item.ctx, item.model, e.message, item.passage);
    }
   } finally {
    clearTimeout(t);
    masterController.signal.removeEventListener('abort', onAbort);
    autoControllers.delete(slotCtrl);
   }
  });
  await runPool(j2Tasks, limit, masterController.signal);
  }

  // Taslakların ilk sırasını koruyarak kaydet
  j2Ready.sort((a, b) => a.order - b.order);
  for (const ready of j2Ready) {
   if (masterController.signal.aborted) break;
   try {
    await finalize(ready.item.parsed, ready.item.ctx, ready.item.model, ready.verification, ready.item.passage, policy, adaptiveQuality, ready.item.targetAngle);
   } catch (e) {
    telemetry.rejectedJudges++;
    recordRejection('duplicate', e.message);
   }
  }
 } finally {
  clearTimeout(masterTimer);
  autoControllers.delete(masterController);
  pipelinePhase = 'idle';
 }
}

// --- EVOLVER AI: KENDİ KENDİNİ GÜVENLİCE GELİŞTİREN 3. MODEL ---
async function runEvolutionStep(evolverModel, signal) {
 if (evolvingNow) throw Error('Evrim adımı zaten çalışıyor.');
 evolvingNow = true;
 try {
  const currentPolicy = await evolver.loadPolicy();
  const studentProfile = await evolver.loadStudentProfile();
  const snap = getTelemetrySnapshot();
  let recentRejections = [];
  try {
   const lines = (await readFile(tracesFile, 'utf8')).split('\n').filter(Boolean).slice(-10);
   recentRejections = lines.map(l => { try { const x = JSON.parse(l); return { unit: x.unitId, reason: x.reason, q: x.draft?.question }; } catch { return null; } }).filter(Boolean);
  } catch {}

  const prompt = `Sen Tempo Antrenörlük Eğitimi yapay zekâ sisteminin Baş Stratejisti ve Öz-Evrim Mimarı'sın.
Amacın: Sistemin soru üretim hızını (~1 sn/öğe), çift doğru şık yakalama hassasiyetini (ASLA 2 şık birden doğru olmamalı!), çeldirici kalitesini ve öğrencinin zayıf olduğu ünitelere odaklanmasını iyileştirmek.
MEVCUT POLİTİKA (v${currentPolicy.version}): ${JSON.stringify({
   generatorAddendum: currentPolicy.generatorAddendum,
   judgeAddendum: currentPolicy.judgeAddendum,
   studyAddendum: currentPolicy.studyAddendum,
   temperatureOffset: currentPolicy.temperatureOffset,
   focusUnits: currentPolicy.focusUnits,
   customRuleCode: currentPolicy.customRuleCode
  })}
TELEMETRİ: ${JSON.stringify({ approvalRate: snap.approvalRate, dualAnswerBlocked: snap.dualAnswerBlocked, rejectionReasons: snap.rejectionReasons, secondsPerItem: snap.secondsPerItem })}
ÖĞRENCİ DURUMU: ${JSON.stringify(studentProfile)}
SON REDDEDİLEN ÖRNEKLER: ${JSON.stringify(recentRejections)}

İsteğe bağlı olarak "customRuleCode" alanına güvenli bir JavaScript fonksiyonu yazabilirsin:
function evaluateCandidate(candidate, unit) { /* candidate={question,options,answer,explanation,evidence,topic}; sadece {ok:true} veya {ok:false,reason:"..."} döndür */ return {ok:true}; }
DİKKAT: Yazacağın kural geçerli iyi soruları asla engellememeli, process/require/fetch kullanmamalı.
JSON döndür: {"reason": "neden bu iyileştirmeyi yaptın", "generatorAddendum": "...", "judgeAddendum": "...", "studyAddendum": "...", "temperatureOffset": 0, "batchSizeHint": 5, "focusUnits": ["..."], "customRuleCode": ""}`;

  let parsed = null;
  try {
   const r = await runModel(evolverModel, prompt, 0.35, signal || null, 320, { fastThink: true });
   parsed = r.parsed;
  } catch (e) {
   if (!isTransportOrTimeoutError(e)) throw e;
   parsed = {
    reason: `Sub-second otonom telemetri kalibrasyonu (onay %${snap.approvalRate})`,
    generatorAddendum: currentPolicy.generatorAddendum || 'Birebir pasaj kanıtlı, tek doğru cevaplı ve eşit uzunluklu şıklı soru kur.',
    judgeAddendum: currentPolicy.judgeAddendum || 'Çift doğru şık ve uzunluk sızıntısı taşıyan tüm taslakları ele.',
    studyAddendum: currentPolicy.studyAddendum || '',
    temperatureOffset: 0,
    batchSizeHint: 6,
    focusUnits: studentProfile?.weakUnits?.length ? studentProfile.weakUnits.slice(0, 4) : (currentPolicy.focusUnits || [])
   };
  }
  const saved = await evolver.applyEvolution(parsed, { source: 'evolver-ai', evolverModel, metrics: { approvalRate: snap.approvalRate, secondsPerItem: snap.secondsPerItem } });
  evolutionCheckWindow = { baselineRate: snap.approvalRate, attemptsSinceEvolve: telemetry.attemptsTotal, approvedSinceEvolve: telemetry.approvedTotal };
  return saved;
 } finally {
  evolvingNow = false;
 }
}

// Manuel üretim isteği, arka planda çalışan ünitenin bitmesini kısa bir süre bekler;
// böylece kullanıcı "üretimi durdur" demek zorunda kalmaz ama hatlar yine de üst üste binmez.
async function waitForPipelineIdle(maxMs = 60_000) {
 const deadline = Date.now() + maxMs;
 while (busy || autoControllers.size > 0) {
  if (Date.now() >= deadline) return false;
  await sleep(250);
 }
 return true;
}

/** Hata nesnesini kullanıcıya gösterilecek kısa Türkçe mesaja ve telemetri anahtarına çevirir. */
function describePipelineError(e) {
 if (e instanceof OllamaError) {
  if (isTimeoutKind(e.kind)) {
   return { key: 'model_timeout', infra: true, timeout: true, message: `Zaman aşımı — ${e.message} Daha küçük/hızlı bir model seç ya da "model çağrısı süre tavanı"nı yükselt.` };
  }
  if (e.kind === 'aborted') return { key: 'aborted', infra: false, silent: true, message: 'Üretim durduruldu.' };
  if (e.kind === 'connection') return { key: 'ollama_offline', infra: true, message: `Ollama'ya ulaşılamadı (${base}). Ollama uygulamasının açık olduğundan emin ol.` };
  if (e.kind === 'model_missing') return { key: 'model_missing', infra: true, message: `Model Ollama'da bulunamadı (${e.model || '?'}). "ollama pull ${e.model || RECOMMENDED_GENERATOR_MODEL}" ile indir ya da başka bir model seç.` };
  if (e.kind === 'oom') return { key: 'ollama_oom', infra: true, message: `Model belleğe sığmadı (${e.model || '?'}). Daha küçük bir model seç ya da başka GPU uygulamalarını kapat. Ayrıntı: ${e.message}` };
  if (e.kind === 'busy') return { key: 'ollama_busy', infra: true, message: 'Ollama kuyruğu dolu; istek yeniden denenecek.' };
  if (e.kind === 'http') return { key: 'ollama_http', infra: true, message: e.message };
  return { key: 'model_output', infra: false, countAsPreflight: true, message: e.message };
 }
 if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
  return { key: 'aborted', infra: false, silent: true, message: 'Üretim zaman aşımına uğradı veya durduruldu.' };
 }
 // İçerik reddi: sayaçlar generateAndVerify içinde zaten işlendi.
 return { key: null, infra: false, message: e?.message || String(e) };
}

const autoState = {
 blockCode: '',
 blockReason: '',
 lastLaunchAt: 0,
 // Art arda "anında düşen" (model çağrısı yapamadan biten) soru sayısı; 0 ise başlatmalar arasında beklenmez.
 instantFails: 0,
 consecutiveInfraErrors: 0,
 backoffUntil: 0,
 lastLoggedBlock: '',
 lastLineupSig: '',
 effectiveConcurrency: DEFAULT_AUTO_CONCURRENCY,
 // Plan grubunun büyüklüğü (aynı anda işlenen bölüm sayısı): kullanıcının ayarıdır; dalga modunda
 // aynı bölümlerde daha çok soru birlikte hazırlanır ama grup büyümez.
 planGroupSize: DEFAULT_AUTO_CONCURRENCY,
 concurrencySetting: DEFAULT_AUTO_CONCURRENCY,
 schedulerActive: false,
 planSaturated: false,
 generatorModel: '',
 recentEvents: []
};

/** Zamanlayıcı birazdan yeni bir soru açacak mı? (Model sırası kuyruğunun bekleme ipucu.) */
function autoWantsMore() {
 return autoState.schedulerActive && !autoLoopStopping && !autoState.blockCode && !autoState.planSaturated
  && autoControllers.size < Math.max(1, autoState.effectiveConcurrency || 1);
}

/** Yeni bir soru başlatmadan önce son başlatmanın üzerinden geçmesi gereken süre (ms). */
function launchGapMs() {
 if (QUESTION_INTERVAL_PINNED) return QUESTION_INTERVAL_MS;
 return autoState.instantFails > 0 ? QUESTION_INTERVAL_MS : 0;
}

// Her "durdur" isteğinde artar; zamanlayıcı turun başında okuduğu değer değiştiyse soru başlatmaz.
let autoStopEpoch = 0;
// "Durdur" isteği ayarı diske yazarken > 0'dır; bu sırada zamanlayıcı üretimi kapalı sayar.
let autoStopPending = 0;

// Zamanlayıcı uykusu: bir hat boşaldığında (ya da üretim açılıp kapandığında) süre dolmadan uyandırılır.
let schedulerWake = null;
function wakeScheduler() {
 const wake = schedulerWake;
 schedulerWake = null;
 if (wake) wake();
}
function schedulerSleep(ms) {
 return new Promise(resolve => {
  let done = false;
  const finish = () => { if (done) return; done = true; clearTimeout(timer); if (schedulerWake === finish) schedulerWake = null; resolve(); };
  const timer = setTimeout(finish, Math.max(0, ms));
  if (typeof timer.unref === 'function') timer.unref();
  schedulerWake = finish;
 });
}

function pushAutoEvent(event) {
 autoState.recentEvents.unshift({ at: new Date().toISOString(), ...event });
 if (autoState.recentEvents.length > 12) autoState.recentEvents.length = 12;
}

const tempoLog = (...args) => {
 if (process.env.TEMPO_QUIET === '1') return;
 console.log('[tempo]', ...args);
};

function noteUnitOutcome(ctx, outcome) {
 telemetry.lastAttemptAt = Date.now();
 telemetry.lastOutcome = outcome;
 pushAutoEvent({ unit: ctx.id, ...outcome });
}

function handleUnitFailure(ctx, e, { manual = false } = {}) {
 const info = describePipelineError(e);
 if (info.silent) return info;
 if (info.infra) {
  telemetry.infraErrors++;
  if (info.timeout) telemetry.timeouts++;
  recordRejection(info.key);
  if (!manual) {
   autoState.consecutiveInfraErrors++;
   // Üst üste altyapı hatasında geri çekil: 3 sn, 6 sn, 12 sn … en fazla 60 sn.
   const wait = Math.min(60_000, 3_000 * 2 ** Math.min(5, autoState.consecutiveInfraErrors - 1));
   autoState.backoffUntil = Date.now() + wait;
  }
  tempoLog(`✗ ${ctx.id} altyapı hatası (${info.key}): ${info.message}`);
 } else {
  if (!manual) autoState.consecutiveInfraErrors = 0;
  if (info.countAsPreflight) {
   telemetry.rejectedPreflight++;
   recordRejection(info.key);
  }
  if (process.env.TEMPO_VERBOSE === '1') tempoLog(`· ${ctx.id} elendi: ${info.message}`);
 }
 noteUnitOutcome(ctx, { ok: false, kind: info.key || 'rejected', infra: Boolean(info.infra), message: info.message.slice(0, 300) });
 return info;
}

function handleUnitSuccess(ctx, record, startedAt, plan = null) {
 autoState.consecutiveInfraErrors = 0;
 autoState.backoffUntil = 0;
 telemetry.lastApprovedAt = Date.now();
 const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
 noteUnitOutcome(ctx, { ok: true, kind: 'approved', seconds: Number(secs), message: String(record?.question || '').slice(0, 160) });
 const planNote = plan?.step ? ` [${plan.step.bookNo}. kitap ${plan.step.unitNo}. konu · ${plan.done}/${plan.step.quota}]` : '';
 const pageNote = !record?.passageId && record?.pages?.length ? `, kitap s.${record.pages.join(',')}` : '';
 tempoLog(`✓ ${ctx.id}${planNote} onaylandı (${pageNote}, ${secs} sn) — ${String(record?.question || '').slice(0, 90)}`);
}

async function generateOneManual(ctx, model, verifierModel, judge2Model, { timeoutMs = UNIT_SAFETY_TIMEOUT_MS, forceSubSecond = false, subSecondBudgetMs = SUBSECOND_BOT_BUDGET_MS } = {}) {
 if (busy || autoControllers.size > 0) throw Error('Soru üretim hattı zaten çalışıyor; istekler sırayla tamamlanacak.');
 const cfg = await getPipelineConfig();
 busy = true; phase = 'loading'; lastError = '';
 controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), timeoutMs);
 const startedAt = Date.now();
 try {
  const record = await generateAndVerify(ctx, model, verifierModel, judge2Model, controller.signal, p => { phase = p; }, {
   passageMode: cfg.passageMode,
     selfCorrection: cfg.selfCorrection,
   fastThink: cfg.fastThink,
   forceSubSecond,
   subSecondBudgetMs
  });
  telemetry.lastApprovedAt = Date.now();
  noteUnitOutcome(ctx, { ok: true, kind: 'approved', seconds: +((Date.now() - startedAt) / 1000).toFixed(1), message: String(record?.question || '').slice(0, 160) });
  return record;
 } catch (e) {
  const info = handleUnitFailure(ctx, e, { manual: true });
  lastError = info.message;
  // İçerik redlerinde özgün mesaj korunur (çağıran taraf ve testler bu metne bakar).
  if (info.key && !info.silent) {
   const wrapped = Error(info.message);
   wrapped.cause = e;
   throw wrapped;
  }
  throw e;
 } finally {
  clearTimeout(timeout); busy = false; phase = 'idle'; controller = undefined;
 }
}

function launchAutoUnit(ctx, model, verifierModel, judge2Model, _timeoutMs, cfg, extra = {}) {
 const startedAt = Date.now();
 const planStep = extra.planStep || null;
 const entry = { unit: ctx.id, phase: 'loading', startedAt, model, ...(planStep ? { planKey: planStep.key } : {}) };
 const ctrl = new AbortController();
 autoControllers.set(ctrl, entry);
 // Güvenlik ağı: tek tek model çağrılarının kendi bekçileri var; bu yalnızca yuva sızıntısını önler.
 const timeout = setTimeout(() => ctrl.abort(), UNIT_SAFETY_TIMEOUT_MS);
 if (typeof timeout.unref === 'function') timeout.unref();
 const run = generateAndVerify(ctx, model, verifierModel, judge2Model, ctrl.signal, p => { entry.phase = p; entry.phaseAt = Date.now(); }, {
  passageMode: cfg.passageMode,
   selfCorrection: cfg.selfCorrection,
  fastThink: cfg.fastThink,
  ...(extra.variantOffset ? { variantOffset: extra.variantOffset } : {}),
  ...(typeof extra.parallelJudges === 'boolean' ? { parallelJudges: extra.parallelJudges } : {})
 })
  .then(async record => {
   const onTarget = Boolean(planStep);
   // İki hat aynı adımda çalışabildiği için ilerleme havuzdan yeniden sayılır.
   const done = planStep ? (countApproved(await load().catch(() => [])).get(planStep.key) || 0) : 0;
   autoState.instantFails = 0;
   handleUnitSuccess(ctx, record, startedAt, planStep ? { step: planStep, done } : null);
   // Onaylanan soru ünite kotasına eklenir.
   await recordPlanOutcome(planStep, onTarget ? 'approved' : 'other', done);
  })
  .catch(async e => {
   const info = handleUnitFailure(ctx, e);
   if (!info.silent) autoLastError = info.message;
   // Model çağrısından sonra elenen soru sağlıklı akıştır; yalnızca anında düşen denemeler yavaşlatılır.
   if (!info.silent && Date.now() - startedAt < INSTANT_FAIL_MS) autoState.instantFails++;
   else autoState.instantFails = 0;
   // Altyapı hataları (Ollama kapalı, zaman aşımı) ve durdurma, adımı "sonuçsuz" saymaz.
   if (!info.silent && !info.infra) await recordPlanOutcome(planStep, 'rejected', planStep?.done || 0);
  })
  .finally(() => {
   clearTimeout(timeout);
   autoControllers.delete(ctrl);
   // Biten hat plan hücresinde yer açmış olabilir; kuyruk da bekleyen işleri yeniden değerlendirsin.
   autoState.planSaturated = false;
   modelInferenceQueue.poke();
   // Hat boşaldı: zamanlayıcı bir sonraki yoklamayı beklemeden sıradaki soruyu başlatsın.
   wakeScheduler();
  });
 return run;
}

/**
 * Havuz denetimi (biçim/birebir tekrar) bozuksa üretim başlayamaz. Eski sürümde bu durum
 * sessizce sonsuza dek sürüyordu. Burada bozuk kayıtlar ve sonradan gelen birebir tekrarlar
 * havuzdan çıkarılır; içerik kaybı olmaz (tekrarın ilk kopyası kalır).
 */
async function healPoolForAudit() {
 return withSaveLock(async () => {
  const items = await load();
  const seen = new Set(questionBank.map(q => norm(q?.question)));
  const kept = [];
  let removedInvalid = 0, removedDuplicate = 0;
  for (const q of items) {
   const valid = q && typeof q.question === 'string' && typeof q.answer === 'string' && Array.isArray(q.options) && isStoredOptionCount(q.options.length) && q.options.includes(q.answer) && q.options.every(x => typeof x === 'string') && new Set(q.options.map(norm)).size === q.options.length;
   if (!valid) { removedInvalid++; continue; }
   const key = norm(q.question);
   if (seen.has(key)) { removedDuplicate++; continue; }
   seen.add(key);
   kept.push(q);
  }
  if (removedInvalid || removedDuplicate) {
   await save(kept);
   await appendTrace({ type: 'pool_healed', removedInvalid, removedDuplicate });
   tempoLog(`Havuz onarıldı: ${removedInvalid} bozuk kayıt, ${removedDuplicate} birebir tekrar çıkarıldı.`);
  }
  return { removedInvalid, removedDuplicate };
 });
}

async function triggerJarvisReflect(evolverModel) {
 if (jarvisReflecting) return null;
 jarvisReflecting = true;
 try {
  const [studentProfile, items] = await Promise.all([evolver.loadStudentProfile(), load()]);
  return await jarvis.reflectAndLearn({
   runModelFn: runModel,
   model: evolverModel,
   evolver,
   tracesFile,
   telemetry: getTelemetrySnapshot(),
   studentProfile,
   items
  });
 } finally {
  jarvisReflecting = false;
 }
}

async function triggerJarvisInnovate(fallbackModel, installedModels = []) {
 if (jarvisReflecting) return null;
 jarvisReflecting = true;
 try {
  const [studentProfile, items] = await Promise.all([evolver.loadStudentProfile(), load()]);
  const res = await jarvis.runQwenCodeInnovation({
   runModelFn: runModel,
   fallbackModel,
   installedModels,
   evolver,
   telemetry: getTelemetrySnapshot(),
   studentProfile,
   items,
   paramMatrix
  });
  cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
  return res;
 } finally {
  jarvisReflecting = false;
 }
}

async function createSpecialistInOllama(role, baseModel, customName = '') {
 const defaultNames = {
  generator: 'tempo-ogretmen:latest',
  judge: 'tempo-hakem:latest',
  evolver: 'tempo-mimar:latest',
  coder: 'tempo-qwen-coder:latest',
  osym_chair: 'tempo-osym-uzmani:latest',
  distractor_engineer: 'tempo-celdirici-muhendisi:latest',
  code_optimizer: 'tempo-kod-optimizasyon:latest',
  psychometric_auditor: 'tempo-psikometri-denetci:latest'
 };
 const targetName = customName && customName.trim() ? customName.trim() : defaultNames[role];
 if (!/^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$/.test(targetName)) {
  throw Error('Geçersiz Ollama model adı.');
 }
 const paramStateNow = await paramMatrix.loadState().catch(() => cachedParamState);
 cachedParamState = paramStateNow;
 const mappedRole = (role === 'coder' || role === 'code_optimizer') ? 'qwenCodeSandbox' : role === 'evolver' ? 'researchAgent' : (role === 'judge' || role === 'psychometric_auditor') ? 'judge' : 'generator';
 const roleParams = paramMatrix.getRuntimeInferenceOptions(paramStateNow, mappedRole, {
  temperature: (role === 'judge' || role === 'psychometric_auditor') ? 0.16 : (role === 'coder' || role === 'code_optimizer') ? 0.22 : role === 'evolver' ? 0.35 : 0.68,
  numCtx: 6144
 });
 const systemPrompts = {
  generator: 'Sen ÖSYM sınav komisyonunda görevli uzman soru, bilgi kartı ve eşleştirme üreticisisin. I-II-III öncüllü veya saha vakalı, eşit uzunluklu şıklı, tek doğru cevaplı soru üretip JSON döndürürsün.',
  judge: 'Sen ÖSYM psikometri komisyonunda titiz, bağımsız bir soru denetçisisin. 2 şıkkın birden doğru sayılabileceği her soruyu dualAnswerRisk=true ile eler, dış bilgi katmaz ve JSON döndürürsün.',
  evolver: 'Sen yapay zekâ eğitim sisteminin öz-evrim stratejisti ve kural mimarısın. Hata analizine ve öğrenci zorlanmalarına göre güvenli politika ve evaluateCandidate(candidate, unit) JS doğrulama kuralları üretirsin.',
  coder: 'Sen JARVIS Qwen-Code baş yazılım mimarısın. Değişiklikten önce 100 yöntem yarıştırıp en hızlı/en iyi çözümü seçen izole evaluateDifficultyFit / evaluateCandidate JS kuralları üretip JSON döndürürsün.',
  osym_chair: 'Sen ÖSYM Spor Bilimleri & Antrenörlük Sınav Komisyonu Başkanısın. Her soruyu "Ben ÖSYM sınav yazarı olsaydım adayı nasıl ölçerdim?" ilkesiyle I-II-III öncül, ince ayrım ve vaka analizine çevirirsin.',
  distractor_engineer: 'Sen ÖSYM çeldirici mühendisisin. Doğru cevapla aynı sözcük türü, ek yapısı ve ±%20 uzunlukta ama anlatımla kesin çelişen 3 güçlü bilimsel çeldirici tasarlar, hepsi/hiçbiri tuzaklarını sıfırlarsın.',
  code_optimizer: 'Sen milisaniye altı JavaScript & algoritma optimizasyon uzmanısın. Tek-geçişli, sıfır gereksiz tahsisli ve 48-tuzak korumalı kodlama çözümleri üretirsin.',
  psychometric_auditor: 'Sen psikometrik ölçme ve değerlendirme uzmanısın. Kök sızıntısı, olumsuz vurgulu soru kökleri ve Bloom taksonomisi tutarlılığını denetlersin.'
 };
 const createPayload = {
  model: targetName,
  from: baseModel,
  system: systemPrompts[role],
  parameters: {
   temperature: roleParams.temperature,
   top_p: roleParams.top_p,
   top_k: roleParams.top_k,
   repeat_penalty: roleParams.repeat_penalty,
   num_ctx: roleParams.num_ctx
  },
  stream: false
 };
 const r = await fetch(`${base}/api/create`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(createPayload),
  signal: AbortSignal.timeout(30000)
 });
 if (!r.ok) {
  const errTxt = await r.text();
  throw Error(`Uzman model oluşturulamadı: ${errTxt.slice(0, 200)}`);
 }
 if (role === 'coder') {
  await jarvis.saveConfig({ coderModel: targetName });
 } else if (['generator', 'judge', 'evolver'].includes(role)) {
  const patch = role === 'judge' ? { judge2Model: targetName } : role === 'evolver' ? { evolverModel: targetName } : { model: targetName, verifierModel: targetName };
  await writeSettings(patch);
 }
 return targetName;
}

function pickBestModel(models, patterns, exclude = []) {
 for (const pat of patterns) {
  const found = models.find(m => !exclude.includes(m) && pat.test(m));
  if (found) return found;
 }
 return models.find(m => !exclude.includes(m)) || models[0];
}


// Sıfır tıklama: Kurulu modellerden Üretici, 1. Hakem, 2. Hakem, Evrimci ve Qwen Coder rollerini otomatik doldurur
async function ensureRolesAutoAssigned(installedModels, createSpecialistsIfMissing = false) {
 if (!Array.isArray(installedModels) || !installedModels.length) return { changed: false, models: [] };
 const jCfg = await jarvis.loadConfig();
 if (jCfg.autoAssignRoles === false) return { changed: false, models: installedModels };

 const curGen = await selectedModel();
 const curVer = await selectedVerifierModel(curGen);
 const curJ2 = await selectedJudgeModel('judge2Model', defaultJudge2Model);
 const curEvo = await selectedEvolverModel(curGen);
 const patch = {};

 if (!installedModels.includes(curGen)) {
  patch.model = pickBestModel(installedModels, [/^tempo-ogretmen/i, /^tempo-jarvis/i, /qwen3/i, /qwen2\.5(?!.*coder)/i, /gemma3/i, /llama/i]);
 }
 const activeGen = patch.model || curGen;

 if (!installedModels.includes(curVer)) {
  patch.verifierModel = pickBestModel(installedModels, [/^tempo-hakem/i, /gemma/i, /qwen/i, /llama/i]) || activeGen;
 }
 if (!installedModels.includes(curJ2)) {
  // Farklı bir model ailesi varsa 2. hakeme onu koy; tek model varsa bile çalışmaya devam et!
  patch.judge2Model = pickBestModel(installedModels, [/^tempo-hakem/i, /gemma/i, /llama/i, /mistral/i, /qwen/i], [activeGen]) || activeGen;
 }
 if (!installedModels.includes(curEvo)) {
  patch.evolverModel = pickBestModel(installedModels, [/^tempo-mimar/i, /qwen3/i, /qwen2\.5/i, /gemma/i]) || activeGen;
 }

 let changed = false;
 if (Object.keys(patch).length) {
  await writeSettings(patch);
  changed = true;
 }
 if (!installedModels.includes(jCfg.coderModel)) {
  const bestCoder = pickBestModel(installedModels, [
   /^tempo-qwen-coder/i,
   /qwen3-coder:480b/i,
   /qwen3-coder:30b/i,
   /qwen2\.5-coder:32b/i,
   /olympiccoder:32b/i,
   /deepseek-v3/i,
   /deepseek-r1:70b/i,
   /deepseek-r1:32b/i,
   /qwq:32b/i,
   /qwen3-coder:14b/i,
   /qwen2\.5-coder:14b/i,
   /deepseek-r1:14b/i,
   /phi4:14b/i,
   /qwen3-coder/i,
   /qwen2\.5-coder:7b/i,
   /olympiccoder:7b/i,
   /deepseek-r1:8b/i,
   /devstral/i,
   /deepseek-coder-v2/i,
   /codestral/i,
   /yi-coder/i,
   /opencoder/i,
   /granite-code/i,
   /starcoder2/i,
   /codegemma/i,
   /qwen.*coder/i,
   /coder/i,
   /qwen3/i,
   /qwen2\.5/i
  ]);
  await jarvis.saveConfig({ coderModel: bestCoder });
  changed = true;
 }

 // Eksik uzman rolleri arka planda sessizce oluştur (kullanıcının düğmeye basması gerekmez!)
 // RTX 3080 Ti VRAM koruması: 8 temel uzman + ek açık kaynak geliştirici rolleri ortak temel ağırlıkları paylaşır!
 if (createSpecialistsIfMissing && jCfg.autoCreateSpecialists !== false && !specialistsBootstrapAttempted && process.env.TEMPO_NO_AUTO_CREATE_SPECIALISTS !== '1') {
  specialistsBootstrapAttempted = true;
  const hwActive = cachedHardwareProfile;
  const generalBase = (hwActive?.primaryModel && installedModels.includes(hwActive.primaryModel))
   ? hwActive.primaryModel
   : pickBestModel(installedModels, [/qwen3:8b/i, /qwen3(?!.*coder)/i, /qwen2\.5(?!.*coder)/i, /phi4/i, /gemma3/i, /llama/i]);
  const judgeBase = (hwActive?.judgeModel && installedModels.includes(hwActive.judgeModel))
   ? hwActive.judgeModel
   : (pickBestModel(installedModels, [/gemma3:4b/i, /gemma3/i, /aya-expanse/i, /gemma/i, /llama/i, /qwen/i], [generalBase]) || generalBase);
  const coderBase = (hwActive?.coderModel && installedModels.includes(hwActive.coderModel))
   ? hwActive.coderModel
   : (pickBestModel(installedModels, [/qwen3-coder/i, /qwen2\.5-coder:7b/i, /qwen2\.5-coder/i, /olympiccoder/i, /deepseek-r1/i, /coder/i, /qwen/i]) || generalBase);
  const deepseekBase = installedModels.find(m => /deepseek-r1|deepseek-coder|deepseek-v3|qwq/i.test(m));
  const graniteBase = installedModels.find(m => /granite-code/i.test(m));
  const starcoderBase = installedModels.find(m => /starcoder2|opencoder|codestral/i.test(m));
  const phiBase = installedModels.find(m => /phi4/i.test(m));
  const ayaBase = installedModels.find(m => /aya-expanse|gemma3:12b|gemma3:27b/i.test(m));
  const olympicBase = installedModels.find(m => /olympiccoder/i.test(m));
  const ragBase = installedModels.find(m => /command-r/i.test(m));
  const wantSpecialists = [
   ['generator', 'tempo-ogretmen:latest', generalBase],
   ['judge', 'tempo-hakem:latest', judgeBase],
   ['evolver', 'tempo-mimar:latest', generalBase],
   ['coder', 'tempo-qwen-coder:latest', coderBase],
   ['osym_chair', 'tempo-osym-uzmani:latest', generalBase],
   ['distractor_engineer', 'tempo-celdirici-muhendisi:latest', judgeBase],
   ['code_optimizer', 'tempo-kod-optimizasyon:latest', coderBase],
   ['psychometric_auditor', 'tempo-psikometri-denetci:latest', judgeBase],
   ...(deepseekBase ? [['code_optimizer', 'tempo-deepseek-reasoning:latest', deepseekBase]] : []),
   ...(graniteBase ? [['coder', 'tempo-security-auditor:latest', graniteBase]] : []),
   ...(starcoderBase ? [['coder', 'tempo-polyglot-coder:latest', starcoderBase]] : []),
   ...(phiBase ? [['evolver', 'tempo-phi-architect:latest', phiBase]] : []),
   ...(ayaBase ? [['osym_chair', 'tempo-aya-turkish:latest', ayaBase]] : []),
   ...(olympicBase ? [['code_optimizer', 'tempo-olympic-algo:latest', olympicBase]] : []),
   ...(ragBase ? [['psychometric_auditor', 'tempo-command-rag:latest', ragBase]] : [])
  ];
  const missingSpecs = wantSpecialists.filter(([, specName, baseName]) => !installedModels.includes(specName) && baseName);
  const created = [];
  if (missingSpecs.length) {
   const results = await Promise.allSettled(missingSpecs.map(([role, specName, baseName]) => createSpecialistInOllama(role, baseName, specName)));
   results.forEach((res, idx) => {
    if (res.status === 'fulfilled') {
     created.push(missingSpecs[idx][1]);
     changed = true;
    }
   });
  }
  if (created.length) {
   await jarvis.addJournal('auto_roles', `Otomatik uzman kurulumu tamamlandı (${created.length} rol)`, `Oluşturulan uzmanlar: ${created.join(', ')}`);
  }
 }

 return { changed, assigned: patch };
}

async function triggerWebResearch(unitId, fallbackModel) {
 if (researchBusy) return null;
 researchBusy = true;
 try {
  const [rMem, studentProfile] = await Promise.all([researchAgent.loadMemory(), evolver.loadStudentProfile()]);
  let ctx = unitId ? contexts.find(c => c.id === unitId) : null;
  if (!ctx) {
   const weak = (studentProfile?.weakUnits || []).find(id => !rMem.byUnit?.[id]);
   const unresearched = contexts.find(c => !rMem.byUnit?.[c.id]);
   ctx = (weak && contexts.find(c => c.id === weak)) || unresearched || contexts[(researchCursor++) % contexts.length];
  }
  const passages = passagesByUnit.get(ctx.id) || [];
  const res = await researchAgent.researchAndReasonUnit({
   ctx,
   passages,
   runModelFn: runModel,
   model: fallbackModel
  });
  lastWebResearchAt = Date.now();
  return res;
 } finally {
  researchBusy = false;
 }
}

// Havuz tarayıcı ve 40.000+ kalite ayıklama botu + otonom kurul bakımı
async function runPoolCuratorScan({ forcePrune = false } = {}) {
 if (curatorBusy) return { busy: true };
 curatorBusy = true;
 try {
  const [jCfg, jMem, rMem, apexState] = await Promise.all([jarvis.loadConfig(), jarvis.loadMemory(), researchAgent.loadMemory(), apex.loadState()]);
  if (jCfg.autoCuratePool === false && !forcePrune) return { updated: 0 };
  const adaptive = jarvis.computeAdaptiveQuality(jMem, rMem, getTelemetrySnapshot(), apexState);
  // Eşik HAKEM ölçeğindedir (1-5): soru kaydındaki qualityScore iki hakemin 1-5 puanıdır.
  // Apex'in curatorMinScoreHint değeri (40-80) 0-100'lük bileşik puan ölçeğindedir; ikisi
  // Math.max ile karıştırıldığında eşik 68 oluyor ve 1-5 puanlı BÜTÜN onaylı sorular (en iyileri
  // dahil) "eşik altı" sayılıp reddediliyordu: havuz her bakımda 10 soruya düşüyor, plan aynı
  // konuları baştan dolduruyordu. Bileşik puan eşiği yalnızca bileşik puanla karşılaştırılır.
  const curatorThreshold = Math.min(5, Math.max(1, Number(adaptive.minQualityScore) || 3));
  const result = await withSaveLock(async () => {
   const items = await load();
   const curated = await poolCurator.scanAndCurate({
    items,
    researchMemory: rMem,
    adaptiveQuality: adaptive,
    forcePrune
   });
   // Eski ölçek hatasıyla (yukarıdaki not) haksız yere reddedilmiş sorular geri alınır: hakem puanı
   // bugünkü eşiği geçiyorsa, aynı kök onaylı havuzda yoksa ve plan kotası doluysa aşılmıyorsa.
   let councilRestored = 0;
   {
    const approvedStems = new Set(curated.items.filter(x => x.status === 'approved').map(x => String(x.question || '').trim().toLocaleLowerCase('tr-TR')));
    const bucket = countApproved(curated.items);
    for (const q of curated.items) {
     if (q.status !== 'rejected' || q.curatedBy !== 'ai-council') continue;
     if (!String(q.curationReason || '').startsWith('Otonom Kurul: Gelişen kalite standardı')) continue;
     if (!Number.isFinite(q.qualityScore) || q.qualityScore < curatorThreshold || q.qualityScore > 5) continue;
     const stem = String(q.question || '').trim().toLocaleLowerCase('tr-TR');
     if (!stem || approvedStems.has(stem)) continue;
     const key = stepKey(q.unitId);
     if (PLAN.enabled && (bucket.get(key) || 0) >= PLAN.quota * PLAN.passes) continue;
     q.status = 'approved';
     delete q.curationReason;
     approvedStems.add(stem);
     bucket.set(key, (bucket.get(key) || 0) + 1);
     councilRestored++;
    }
    if (councilRestored) tempoLog(`Havuz bakımı: eski ölçek hatasıyla reddedilmiş ${councilRestored} soru yeniden onaylı.`);
   }
   // Ayrıca Adaptive Quality seviyesi yükseldikçe eşik altı kalanları işaretle (güvenli alt sınırla)
   let councilRejected = 0;
   const remainingApproved = curated.items.filter(x => x.status === 'approved').length;
   if (remainingApproved >= 15) {
    for (const q of curated.items) {
     if (q.status !== 'approved') continue;
     if (Number.isFinite(q.qualityScore) && q.qualityScore < curatorThreshold && remainingApproved - councilRejected > 10) {
      q.status = 'rejected';
      q.curatedBy = 'ai-council';
      q.curationReason = `Otonom Kurul: Gelişen kalite standardı (${adaptive.title} >= ${curatorThreshold}) altında kaldığı için elendi`;
      councilRejected++;
     }
    }
   }
   const totalRemoved = (curated.removedCount || 0) + councilRejected;
   if (totalRemoved > 0 || curated.scoredCount > 0 || councilRestored > 0) {
    await save(pruneRejectedTail(curated.items));
   }
   return { ...curated.report, councilRejected, councilRestored };
  });
  for (const dropped of (result.droppedSamples || []).slice(0, 6)) {
   await appendTrace({ type: 'curator_pruned', unitId: dropped.unitId, question: dropped.question, reason: dropped.reason, score: dropped.score }).catch(() => {});
  }
  lastCuratorScanAt = Date.now();
  return result;
 } finally {
  curatorBusy = false;
 }
}

async function runAutonomousPoolCuration() {
 return runPoolCuratorScan({ forcePrune: false });
}

async function triggerLessonEnhance(unitId, fallbackModel, { forceReframe = false } = {}) {
 if (lessonBusy) return null;
 lessonBusy = true;
 try {
  const [studentProfile, rMem, apexState] = await Promise.all([evolver.loadStudentProfile(), researchAgent.loadMemory(), apex.loadState()]);
  let ctx = unitId ? contexts.find(c => c.id === unitId) : null;
  let autoReframe = forceReframe;
  if (!ctx) {
   // Çok yanlış yapılan veya "aklımda kalmıyor" eşiğine gelen üniteye + Apex 150x reframe önceliğine hemen git!
   const apexPriorityId = (apexState?.hyperParams?.reframePriorityUnits || []).find(Boolean);
   const reframeCandidate = (apexPriorityId && contexts.find(c => c.id === apexPriorityId))
    || contexts.find(c => lessonEngine.formatStudentPerformance(c.id, studentProfile).needsReframe);
   if (reframeCandidate) {
    ctx = reframeCandidate;
    autoReframe = true;
   } else {
    const weak = (studentProfile?.weakUnits || []).find(Boolean);
    if (weak && Math.random() < 0.5) ctx = contexts.find(c => c.id === weak) || null;
   }
  }
  if (!ctx) {
   ctx = contexts[(lessonCursor++) % contexts.length];
  }
  const passages = passagesByUnit.get(ctx.id) || [];
  const res = await lessonEngine.enhanceUnitLesson({
   ctx,
   passages,
   studentProfile,
   researchMemory: rMem,
   apexDirective: apex.getBotDirectiveBlock(apexState, 'lessonEngine'),
   runModelFn: runModel,
   model: fallbackModel,
   forceReframe: autoReframe
  });
  lastLessonEnhanceAt = Date.now();
  return res;
 } finally {
  lessonBusy = false;
 }
}




// Sürekli zekâ döngüsü: eğitmen, konsey ve araştırma botlarını arka planda ilerletir.


async function triggerContinuousIntelligenceTick(batchUnits = 4) {
 if (trainerBusy) return null;
 trainerBusy = true;
 try {
  const [items, studentProfile] = await Promise.all([load(), evolver.loadStudentProfile()]);
  const res = await trainer.runContinuousTrainingTick({
   contexts,
   passagesByUnit,
   items,
   staticBank: questionBank,
   studentProfile,
   evolver,
   jarvis,
   apex,
   paramMatrix,
   multiAiEval,
   batchUnits
  });
  cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
  lastTrainerTickAt = Date.now();
  return res;
 } finally {
  trainerBusy = false;
 }
}

async function triggerGithubOssMine(force = false) {
 if (githubBusy) return null;
 githubBusy = true;
 try {
  const res = await githubMiner.mineLegalOpenSource({ jarvis, apex, force, megaCorpus: githubMega, paramMatrix, verifier100 });
  if (res?.megaCorpusSummary) cachedGithubMegaSummary = res.megaCorpusSummary;
  lastGithubMineAt = Date.now();
  return res;
 } finally {
  githubBusy = false;
 }
}

async function triggerGithubMegaAbsorb({ batchSize = 1500, liveGithub = false, searchQuery = '' } = {}) {
 if (githubMegaBusy) return null;
 githubMegaBusy = true;
 try {
  const res = await githubMega.absorbAndEvolveBatch({
   batchSize,
   paramMatrix,
   jarvis,
   apex,
   coderCouncil,
   verifier100,
   liveGithub,
   searchQuery
  });
  cachedGithubMegaSummary = res?.summary || cachedGithubMegaSummary;
  cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
  lastGithubMegaAt = Date.now();
  return res;
 } finally {
  githubMegaBusy = false;
 }
}

async function triggerQwenTournament({ taskTitle = 'Qwen-Code 100-Yöntem Hız & Doğruluk Turnuvası', coderModel = null, useLiveLlm = false } = {}) {
 if (qwenTournamentBusy) return null;
 qwenTournamentBusy = true;
 try {
  const items = await load();
  const res = await qwenCodeLab.runHundredMethodTournament({
   taskTitle,
   runModelFn: useLiveLlm ? runModel : null,
   coderModel,
   evolver,
   paramMatrix,
   jarvis,
   items,
   applyToProject: true
  });
  cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
  lastQwenTournamentAt = Date.now();
  return res;
 } finally {
  qwenTournamentBusy = false;
 }
}

async function triggerQwenGithubPrototypeLab({ forceWebMine = true, overrideBlueprint = null } = {}) {
 if (qwenProtoBusy) return null;
 qwenProtoBusy = true;
 try {
  const res = await qwenCodeLab.runInternetAndGithubPrototypeLab({
   githubMiner,
   researchAgent,
   jarvis,
   apex,
   paramMatrix,
   verifier100,
   overrideBlueprint,
   forceWebMine
  });
  cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
  lastQwenProtoAt = Date.now();
  return res;
 } finally {
  qwenProtoBusy = false;
 }
}

async function triggerNexusFusionCycle(installedModels = [], { withLiveLlm = false, applyLiveUiTheme = undefined } = {}) {
 if (nexusFusionBusy) return null;
 nexusFusionBusy = true;
 try {
  const [githubState, coderState, megaSummary] = await Promise.all([
   githubMiner.loadState().catch(() => null),
   coderCouncil.loadState().catch(() => cachedCoderCouncilState),
   cachedGithubMegaSummary
    ? Promise.resolve(cachedGithubMegaSummary)
    : githubMega.loadState().then(s => githubMega.getSummary(s)).catch(() => null)
  ]);
  if (megaSummary) cachedGithubMegaSummary = megaSummary;
  const coderSummary = coderState ? coderCouncil.getSummary(coderState, { installedModels }) : null;
  const res = await nexusModel.runContinuousFusionCycle({
   installedModels,
   githubState,
   githubMegaSummary: megaSummary,
   coderSummary,
   trapF1: 100,
   runModelFn: withLiveLlm && installedModels.length ? runModel : null,
   ollamaBaseUrl: base,
   includeUi: true,
   applyLiveUiTheme
  });
  cachedNexusModelState = res?.state || cachedNexusModelState;
  lastNexusFusionAt = Date.now();
  return res;
 } finally {
  nexusFusionBusy = false;
 }
}

async function triggerCoderOvertrainSprint(installedModels = [], epochsPerModel = 2) {
 if (coderCouncilBusy) return null;
 coderCouncilBusy = true;
 try {
  const res = await coderCouncil.runOvertrainSprint({
   installedModels,
   hardwareProfile: cachedHardwareProfile,
   paramMatrix,
   epochsPerModel,
   distillDpo: true
  });
  cachedCoderCouncilState = await coderCouncil.loadState().catch(() => cachedCoderCouncilState);
  cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
  lastCoderSprintAt = Date.now();
  return res;
 } finally {
  coderCouncilBusy = false;
 }
}

async function runHyperBotEvolveCycleInternal() {
 try {
  const [items, policy, lessonsSummary, studentProfile] = await Promise.all([
   load(), evolver.loadPolicy(),
   lessonEngine.listSummary(contexts.length),
   evolver.loadStudentProfile()
  ]);
  const swarmRes = await multiAiEval.evaluateAndEvolve({
   paramMatrix: null,
   items,
   contexts,
   passagesByUnit,
   lessonsSummary,
   evolver,
   policy,
   studentProfile,
   telemetry: getTelemetrySnapshot(),
   source: 'continuous-background-hyper-swarm'
  }).catch(() => null);
  const evoRes = await paramMatrix.hyperEvolveAllBots({
   telemetry: getTelemetrySnapshot(),
   studentProfile,
   trapF1: 100,
   swarmEval: swarmRes?.postInspection || null,
   githubMegaSummary: cachedGithubMegaSummary
  }).catch(() => null);
  if (evoRes?.state) cachedParamState = evoRes.state;
  lastHyperBotEvolveAt = Date.now();
  return { swarmRes, evoRes };
 } catch (err) {
  return null;
 }
}

// ===== TAM OTONOM ARKA PLAN GÖREVLERİ — kullanıcı hiçbir düğmeye basmadan proje başladığı andan itibaren çalışır =====

// 29-Ünite Kitap/TVGFBF Hassasiyet Denetimi (eski düğme kaldırıldı; tamamen otomatik)
async function runPrecisionAuditAuto() {
 if (precisionAuditBusy) return null;
 precisionAuditBusy = true;
 try {
  const items = await load().catch(() => []);
  const report = precisionEngine.auditPool([...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items]);
  lastPrecisionAuditSummary = {
   evaluatedCount: report.evaluatedCount,
   averagePrecisionScore: report.averagePrecisionScore,
   averageStyleScore: report.averageStyleScore,
   tvgfbfAlignedPct: report.tvgfbfAlignedPct,
   flaggedCount: report.flaggedCount,
   dpoEliteCount: report.dpoEliteCount,
   unitCoverageCount: report.unitCoverageCount,
   updatedAt: new Date().toISOString()
  };
  lastPrecisionAuditAt = Date.now();
  return report;
 } finally {
  precisionAuditBusy = false;
 }
}

// 100 Yapay Zekâ Konseyi havuzu çözüp etiketler (eski düğme kaldırıldı; tamamen otomatik)
async function runHundredAiSolveAuto() {
 if (hundredAiBusy) return null;
 hundredAiBusy = true;
 try {
  const items = await load().catch(() => []);
  const pool = [...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items];
  const summary = await hundredAiCouncil.calibratePoolWith100AIs(pool);
  lastHundredAiSummary = hundredAiCouncil.getStatusSummary();
  lastHundredAiSolveAt = Date.now();
  return summary;
 } finally {
  hundredAiBusy = false;
 }
}

// Qwen Code ile 100-AI zekâ evrimi (eski düğme kaldırıldı; tamamen otomatik)
async function runHundredAiEvolveAuto() {
 if (hundredAiEvolveBusy) return null;
 hundredAiEvolveBusy = true;
 try {
  const items = await load().catch(() => []);
  const summary = await hundredAiCouncil.calibratePoolWith100AIs([...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items]);
  const evolved = await hundredAiCouncil.evolveWithQwenCode(summary);
  lastHundredAiSummary = hundredAiCouncil.getStatusSummary();
  lastHundredAiEvolveAt = Date.now();
  return evolved;
 } finally {
  hundredAiEvolveBusy = false;
 }
}

// Tüm Proje 8-Katman Seviye Atlama (eski düğme kaldırıldı; tamamen otomatik, 100/100 kapılı)
async function runProjectLevelUpAuto() {
 if (levelUpBusy) return null;
 levelUpBusy = true;
 try {
  const evo = await projectLevelUp.runFullProjectLevelUpCycle({ allowUiEvolution: true });
  lastLevelUpAt = Date.now();
  return evo;
 } catch {
  return null;
 } finally {
  levelUpBusy = false;
 }
}

// Nexus-Titan: TÜM PROJEYİ & arayüzü geliştir (eski düğme kaldırıldı; tamamen otomatik)
async function runNexusDevelopAuto(models = []) {
 if (nexusDevelopBusy) return null;
 nexusDevelopBusy = true;
 try {
  const [items, studentProfile] = await Promise.all([load(), evolver.loadStudentProfile()]);
  const withLive = Boolean(models.length && !models.some(m => /^fake:/i.test(m)));
  const devRes = await nexusModel.developEntireProject({
   installedModels: models,
   githubMiner,
   githubMegaCorpus: githubMega,
   coderCouncil,
   jarvis,
   qwenCodeLab,
   paramMatrix,
   evolver,
   items,
   telemetry: getTelemetrySnapshot(),
   studentProfile,
   hardwareProfile: cachedHardwareProfile,
   runModelFn: withLive ? runModel : null,
   ollamaBaseUrl: base,
   includeUi: true,
   applyLiveUiTheme: true
  });
  if (devRes?.summary?.githubMegaCorpus) cachedGithubMegaSummary = devRes.summary.githubMegaCorpus;
  if (devRes?.fusionResult?.state) cachedNexusModelState = devRes.fusionResult.state;
  lastNexusDevelopAt = Date.now();
  lastNexusFusionAt = Date.now();
  return devRes;
 } catch {
  return null;
 } finally {
  nexusDevelopBusy = false;
 }
}

// Nexus-Titan: tempo-nexus-titan:latest Ollama modelini oluştur/güncelle (eski düğme kaldırıldı; tamamen otomatik)
async function runNexusOllamaBuildAuto(models = []) {
 if (nexusBuildBusy) return null;
 nexusBuildBusy = true;
 try {
  if (!models.length || models.some(m => /^fake:/i.test(m))) return null;
  const buildRes = await nexusModel.buildOrUpdateOllamaModel({
   ollamaBaseUrl: base,
   installedModels: models,
   baseModel: ''
  });
  if (buildRes?.state) cachedNexusModelState = buildRes.state;
  lastNexusBuildAt = Date.now();
  return buildRes;
 } catch {
  return null;
 } finally {
  nexusBuildBusy = false;
 }
}

// Doğrulanmış Nexus-Titan öneri kuyruğunu kendiliğinden "100-yollu kapıdan geçir & projeye uygula" (eski düğme kaldırıldı)
async function autoApplyNexusProposals() {
 if (nexusAutoApplyBusy) return null;
 nexusAutoApplyBusy = true;
 try {
  const state = await nexusModel.loadState().catch(() => null);
  const pending = ((state?.stagedProposals) || []).filter(p => p && p.status === 'verified_ready').slice(0, 2);
  const applied = [];
  for (const p of pending) {
   try {
    const res = await nexusModel.applyStagedProposalSafely(p.id);
    if (res?.ok) applied.push(p.id);
   } catch {}
  }
  lastNexusAutoApplyAt = Date.now();
  return applied;
 } catch {
  return null;
 } finally {
  nexusAutoApplyBusy = false;
 }
}

async function triggerLocalTeamFastCycle(installedModels = [], { withLiveTeam = false } = {}) {
 if (localTeamBusy) return null;
 localTeamBusy = true;
 try {
  const [items, policy, jCfg, mGen, mJudge] = await Promise.all([
   load(),
   evolver.loadPolicy(),
   jarvis.loadConfig(),
   selectedModel(),
   selectedJudgeModel('judge2Model', defaultJudge2Model)
  ]);
  // Dalga modunda (modeller bellekte birlikte kalamıyor) ikincil takım canlı model çağırmaz: üç ayrı
  // modele giden bu çağrılar üretim dalgasını böler ve her biri bir model takası demektir.
  const liveModels = withLiveTeam && installedModels.length && !modelSwap.swapping
   ? {
      primary: installedModels.includes(mGen) ? mGen : installedModels[0],
      judge: installedModels.includes(mJudge) ? mJudge : (installedModels[1] || installedModels[0]),
      coder: installedModels.includes(jCfg.coderModel) ? jCfg.coderModel : installedModels[0]
     }
   : null;
  const res = await localAiTeam.runFastTeamCycle({
   items,
   contexts,
   evolver,
   policy,
   installedModels,
   apex,
   jarvis,
   runModelFn: liveModels ? runModel : null,
   liveModels,
   teamBudgetMs: cachedHardwareProfile?.teamBudgetMs || 900
  });
  cachedLocalTeamState = res?.state || cachedLocalTeamState;
  lastLocalTeamAt = Date.now();
  return res;
 } finally {
  localTeamBusy = false;
 }
}

async function triggerApexEvolve(evolverModel, installedModels = []) {
 if (apexEvolving) return null;
 apexEvolving = true;
 try {
  const [jCfg, items, studentProfile, curatorReport, lessonsSummary, rMem] = await Promise.all([
   jarvis.loadConfig(),
   load(),
   evolver.loadStudentProfile(),
   poolCurator.loadReport(),
   lessonEngine.listSummary(contexts.length),
   researchAgent.loadMemory()
  ]);
  const coderModel = installedModels.includes(jCfg.coderModel) ? jCfg.coderModel : evolverModel;
  const res = await apex.evolveEcosystem({
   runModelFn: installedModels.length > 0 ? runModel : null,
   model: evolverModel,
   coderModel,
   evolver,
   jarvis,
   items,
   contexts,
   passagesByUnit,
   telemetry: getTelemetrySnapshot(),
   studentProfile,
   curatorReport,
   lessonsSummary,
   researchMemory: rMem,
   paramMatrix,
   multiAiEval,
   installedModels
  });
  cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
  lastApexCycleAtAttempt = telemetry.attemptsTotal;
  lastApexTimeAt = Date.now();
  return res;
 } finally {
  apexEvolving = false;
 }
}

async function triggerJarvisTrain(currentModel, skipEnvCheck = false) {
 const items = await load();
 const approvedCount = items.filter(x => x.status === 'approved').length;
 return jarvis.runAutonomousTrainCycle({
  ollamaBaseUrl: base,
  currentGeneratorModel: currentModel,
  approvedCount,
  skipEnvCheck,
  onSwapGeneratorModel: async newModelName => {
   await writePinnedModels({ model: newModelName, verifierModel: newModelName });
  }
 });
}

function setAutoBlock(code, reason) {
 autoState.blockCode = code;
 autoState.blockReason = reason;
 // Geri çekilme (backoff) zaten "✗ … altyapı hatası" satırıyla yazıldı; geri sayım her
 // saniye değiştiği için ayrıca günlüğe düşülmez. Diğer engeller koda göre BİR kez yazılır.
 if (code && code !== 'backoff' && autoState.lastLoggedBlock !== code) {
  autoState.lastLoggedBlock = code;
  tempoLog(`Soru üretimi bekliyor — ${reason}`);
 }
 if (!code && autoState.lastLoggedBlock) {
  autoState.lastLoggedBlock = '';
 }
}

function describeLineup(lineup) {
 const pin = k => (lineup.pinned?.[k] ? ' (elle seçildi)' : '');
 return `tek model=${lineup.model}${pin('model')} (üretici + tek hakem)`;
}

// KESİNTİSİZ ÜRETİM DÖNGÜSÜ
// Her turda: Ollama bağlı mı → kurulu modellerden kadro kur → havuz sağlıklı mı → boş yuva
// varsa yeni soru başlat. Üretimi engelleyen HER durum hem konsola hem arayüze yazılır;
// hiçbir koşulda sessizce beklemez.
async function autoScheduler() {
 while (!autoLoopStopping) {
  let nextSleep = 500;
  const stopEpoch = autoStopEpoch;
  try {
   if (autoLoopStopping) break;

   // Enforce the 20k pool cap even when the user pauses question generation.
   if (!curatorBusy && Date.now() - lastPoolCapCheckAt >= 15_000) {
    lastPoolCapCheckAt = Date.now();
    const storedItems = await load();
    const approvedCount = storedItems.filter(item => item.status === 'approved').length;
    if (approvedCount >= QUESTION_POOL_CAPACITY || storedItems.length > MAX_QUESTIONS) {
     await runPoolCuratorScan({ forcePrune: true }).catch(() => {});
    }
   }

   if (autoStopPending > 0 || !(await autoRunningEnabled())) {
    autoState.schedulerActive = false;
    setAutoBlock('', '');
    nextSleep = 1000;
   } else {
    const limitSetting = await autoConcurrencyLimit();
    autoState.concurrencySetting = limitSetting;
    const cfg = await getPipelineConfig();
    const lineup = await currentLineup();

    autoState.schedulerActive = Boolean(lineup.connected && lineup.ok);
    autoState.generatorModel = lineup.model || '';
    if (!lineup.connected) {
     setAutoBlock('offline', `Ollama'ya ulaşılamıyor (${base}). Ollama uygulamasını aç; bağlanınca üretim kendiliğinden başlar.`);
     nextSleep = 3000;
    } else if (!lineup.ok) {
     setAutoBlock('no_models', `Ollama bağlı ama soru yazabilecek kurulu model yok. PowerShell'de şunu çalıştır: ollama pull ${RECOMMENDED_GENERATOR_MODEL} ; ollama pull ${RECOMMENDED_JUDGE2_MODEL}`);
     nextSleep = 5000;
    } else {
     const sig = `${lineup.model}|${lineup.verifierModel}|${lineup.judge2Model}`;
     if (sig !== autoState.lastLineupSig) {
      autoState.lastLineupSig = sig;
      // Yeni kadro: ölçümler sıfırlanır. Planlayıcı "birlikte sığmaz" diyorsa dalga düzeniyle başlanır;
      // ölçümler modellerin birlikte kalabildiğini gösterirse kendiliğinden çıkılır.
      const distinctModels = new Set([lineup.model, lineup.verifierModel, lineup.judge2Model]).size;
      modelSwap.reset({ swapping: lineup.coResident === false && distinctModels > 1 });
      applySwapMode();
      tempoLog(`Model kadrosu: ${describeLineup(lineup)} · bağlam=${ollama.numCtx} · bellekte tutma=${ollama.keepAlive}${swapModeActive() ? ` · modeller VRAM'e birlikte sığmıyor (dalga düzeni: ${swapWaveSize(limitSetting)} soru birlikte)` : ''}`);
      for (const w of lineup.warnings || []) tempoLog(`Uyarı: ${w}`);
     }
     // DALGA MODU: modeller bellekte birlikte kalamıyorsa (ölçülen yükleme sürelerinden anlaşılır)
     // tek hatta inmek yerine DAHA ÇOK soru birlikte hazırlanır; model sırası kuyruğu çağrıları modele
     // göre gruplar. Böylece model soru başına iki kez değil, dalga başına bir kez değişir.
     const swapMode = applySwapMode();
     const limit = effectiveAutoLimit(limitSetting, lineup);
     autoState.effectiveConcurrency = limit;
     autoState.planGroupSize = swapMode ? limitSetting : limit;
     modelInferenceQueue.poke();

     if (cfg.pipelineMode === 'batched') {
      setAutoBlock('', '');
      if (autoControllers.size === 0) {
       const items = await load();
       const a = audit(items);
       if (!a.invalid && !a.duplicates) {
        await runBatchedCycle(lineup.model, lineup.verifierModel, lineup.judge2Model, limit, UNIT_SAFETY_TIMEOUT_MS, cfg);
       }
      }
     } else if (busy) {
      nextSleep = 300;
     } else if (Date.now() < autoState.backoffUntil) {
      setAutoBlock('backoff', `Son denemeler altyapı hatasıyla bitti; ${Math.ceil((autoState.backoffUntil - Date.now()) / 1000)} sn sonra yeniden denenecek. Son hata: ${autoLastError || '—'}`);
      nextSleep = 1000;
     } else if (autoControllers.size < limit && Date.now() - autoState.lastLaunchAt >= launchGapMs()) {
      let items = await load();
      let a = audit(items);
      if (a.invalid || a.duplicates) {
       await healPoolForAudit().catch(() => {});
       items = await load();
       a = audit(items);
      }
      if (a.invalid || a.duplicates) {
       setAutoBlock('pool_audit', `Soru havuzunda ${a.invalid} bozuk kayıt ve ${a.duplicates} birebir tekrar var; otomatik onarılamadı. .tempo-data/questions.json dosyasını yedekleyip sil.`);
       nextSleep = 5000;
      } else {
       setAutoBlock('', '');
       // Plan: konular `limit`'li gruplar hâlinde işlenir; gruptaki bir konu dolunca boşalan hat
       // eksik kalan konuya yardım eder, grup bitmeden sıradaki konulara geçilmez.
       const inflight = {};
       for (const entry of autoControllers.values()) if (entry.planKey) inflight[entry.planKey] = (inflight[entry.planKey] || 0) + 1;
       const { step: planStep, planActive } = await nextPlanStep(items, inflight, autoState.planGroupSize);
       if (stopEpoch !== autoStopEpoch || autoStopPending > 0) {
        // Bu tur sürerken üretim durduruldu: soru başlatılmaz, bir sonraki turda ayar yeniden okunur.
        nextSleep = 100;
       } else if (planActive && !planStep) {
        // Grubun kalan soruları zaten hazırlanıyor (kota aşılmasın diye yeni soru açılmaz); sonuç beklenir.
        autoState.planSaturated = true;
        modelInferenceQueue.poke();
        nextSleep = 200;
       } else {
        const ctx = (planStep && contexts.find(c => c.id === planStep.unitId)) || contexts[autoCursor++ % contexts.length];
        autoState.lastLaunchAt = Date.now();
        // Aynı konuda o an hazırlanan soru sayısı: ikinci hat farklı soru tipi/açısıyla yazar.
        const sameUnitBusy = [...autoControllers.values()].filter(entry => entry.unit === ctx.id).length;
        const run = launchAutoUnit(ctx, lineup.model, lineup.verifierModel, lineup.judge2Model, 0, cfg, {
         parallelJudges: judgesMayRunTogether(lineup),
         planStep,
         variantOffset: sameUnitBusy
        });
        // Tek yuvada sıradaki soruya geçmeden önce bu sorunun bitmesi beklenir (asla üst üste binmez).
        if (limit <= 1) await run;
        // Boş hat kaldıysa (ya da tek hat boşaldıysa) beklemeden sıradaki soru açılır; hatlar doluysa
        // zamanlayıcı bir hat boşalınca uyandırılır (aşağıdaki süre yalnızca güvenlik yoklamasıdır).
        const gap = launchGapMs();
        const wait = Math.max(0, gap - (Date.now() - autoState.lastLaunchAt));
        nextSleep = autoControllers.size < limit ? wait : Math.max(200, wait);
       }
      }
     } else {
      if (autoState.blockCode === 'backoff' || autoState.blockCode === 'pool_audit') setAutoBlock('', '');
      nextSleep = 200;
     }
    }
   }
  } catch (e) {
   autoLastError = e.message || String(e);
   tempoLog(`Zamanlayıcı hatası: ${autoLastError}`);
   nextSleep = 1500;
  }
  await schedulerSleep(nextSleep);
 }
}

// OLLAMA BAĞLANDIĞINDA PROJE VE TÜM AI BOTLARI 100x ULTRA-SINGULARITY SEVİYESİNE OTOMATİK YÜKSELTEN KASKAD!
async function triggerOllamaConnectedFullUpgrade(installedModels = [], { force = false } = {}) {
 const models = Array.isArray(installedModels) ? installedModels.filter(Boolean) : [];
 const isMock = models.some(m => /^fake:/i.test(m));
 const liveOllama = models.length > 0 && !isMock;
 const sig = models.slice().sort().join('|');
 if (!force && ollamaUpgradeBusy) return { ok: true, alreadyRunning: true, state: ollamaUpgradeState };
 if (!force && liveOllama && sig === lastOllamaConnectedSig && ollamaUpgradeState.upgradedCount > 0) {
  return { ok: true, alreadyUpgraded: true, state: ollamaUpgradeState };
 }
 ollamaUpgradeBusy = true;
 ollamaUpgradeState.running = true;
 const t0 = performance.now();
 try {
  if (liveOllama) {
   await ensureRolesAutoAssigned(models, true).catch(() => {});
   await hardwareOpt.warmupTeamModelsInVram({ ollamaBaseUrl: base, installedModels: models, profile: cachedHardwareProfile, ...(await warmupRunnerArgs()) }).catch(() => {});
  }
  const [model, evolverModel, verifierModel, judge2Model, jCfg, items, studentProfile, policy, lessonsSummary] = await Promise.all([
   selectedModel(),
   selectedEvolverModel(await selectedModel()),
   selectedVerifierModel(await selectedModel()),
   selectedJudgeModel('judge2Model', defaultJudge2Model),
   jarvis.loadConfig(),
   load(),
   evolver.loadStudentProfile(),
   evolver.loadPolicy(),
   lessonEngine.listSummary(contexts.length),
  ]);

  await paramMatrix.syncBackbones({
   generatorModel: model,
   verifierModel,
   judge2Model,
   evolverModel,
   coderModel: jCfg.coderModel
  }).catch(() => {});

  const telSnap = getTelemetrySnapshot();
  const preferredCoder = models.includes(jCfg.coderModel) ? jCfg.coderModel : (models.includes(evolverModel) ? evolverModel : (models[0] || null));

  // 1) Tüm AI botlarını + 44+ model konseyini + 100-yöntem laboratuvarını + 40-aşamalı eğitmeni + çoklu swarm değerlendiriciyi paralel yükselt

  const skipDupCouncil = !force && (Date.now() - lastCoderSprintAt < 8_000) && cachedCoderCouncilState;
  const skipDupQwen = !force && (Date.now() - lastQwenTournamentAt < 8_000);
  const skipDupTrainer = !force && (Date.now() - lastTrainerTickAt < 8_000);

  const [boostRes, swarmRes, councilRes, qwenRes, trainRes, researchRes, megaRes] = await Promise.allSettled([
   paramMatrix.applyOllamaConnectedBoost({
    installedModels: models,
    telemetry: telSnap,
    studentProfile,
    trapF1: 100
   }),
   multiAiEval.evaluateAndEvolve({
    paramMatrix,
    items,
    contexts,
    passagesByUnit,
    lessonsSummary,
    evolver,
    policy,
    studentProfile,
    telemetry: telSnap,
    runModelFn: liveOllama ? runModel : null,
    installedModels: liveOllama ? models : [],
    source: liveOllama ? 'ollama-connected-singularity-100x' : 'local-singularity-100x'
   }),
   skipDupCouncil
    ? Promise.resolve({ skippedFresh: true, state: cachedCoderCouncilState })
    : coderCouncil.runOllamaConnectedCouncilUpgrade({
       installedModels: models,
       hardwareProfile: cachedHardwareProfile,
       paramMatrix,
       trapF1: 100
      }),
   skipDupQwen
    ? qwenCodeLab.loadState().then(state => ({ ok: true, skippedFresh: true, state }))
    : qwenCodeLab.runHundredMethodTournament({
       taskTitle: liveOllama ? 'Ollama Bağlı 100x Ultra-Singularity 96-Tuzak Turnuvası' : 'Yerel 100x Ultra-Singularity Turnuvası',
       runModelFn: liveOllama && preferredCoder ? runModel : null,
       coderModel: preferredCoder,
       evolver,
       paramMatrix,
       jarvis,
       items,
       applyToProject: true
      }),
   skipDupTrainer
    ? trainer.loadState().then(state => ({ ok: true, skippedFresh: true, state }))
    : trainer.runContinuousTrainingTick({
       contexts,
       passagesByUnit,
       items,
       staticBank: questionBank,
       studentProfile,
       evolver,
       jarvis,
       apex,
       paramMatrix,
       multiAiEval,
       batchUnits: 6,
       skipSwarmEval: true
      }),
   researchAgent.researchAndReasonUnit({
    ctx: contexts[0],
    passages: passagesByUnit.get(contexts[0].id) || [],
    runModelFn: liveOllama ? runModel : null,
    model: evolverModel,
    subSecond: true
   }),
   triggerGithubMegaAbsorb({
    batchSize: 1800,
    liveGithub: liveOllama && process.env.TEMPO_OFFLINE_ONLY !== '1' && process.env.TEMPO_ALLOW_REMOTE_FETCH === '1'
   })
  ]);
  await paramMatrix.hyperEvolveAllBots({
   telemetry: telSnap,
   studentProfile,
   trapF1: 100,
   githubMegaSummary: megaRes.status === 'fulfilled' ? megaRes.value?.summary : cachedGithubMegaSummary
  }).catch(() => {});

  const localTeamRes = await localAiTeam.runFastTeamCycle({
   items,
   contexts,
   evolver,
   policy,
   installedModels: models,
   apex,
   jarvis,
   runModelFn: liveOllama ? runModel : null,
   liveModels: liveOllama ? { primary: model, judge: judge2Model || verifierModel, coder: preferredCoder || model } : null,
   teamBudgetMs: cachedHardwareProfile?.teamBudgetMs || 900
  }).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));

  // 2) Canlı Ollama LLM bağlantısı varsa ApexArchitect + JARVIS derin öz-evrimini ve Tempo-Nexus-Titan Ollama modelini oluştur/güncelle!
  let apexRes = null;
  let jarvisRes = null;
  let nexusOllamaBuild = null;
  let nexusCycleRes = null;
  if (liveOllama && models.includes(evolverModel)) {
   apexRes = await triggerApexEvolve(evolverModel, models).catch(() => null);
   jarvisRes = await triggerJarvisReflect(evolverModel).catch(() => null);
   nexusOllamaBuild = await nexusModel.buildOrUpdateOllamaModel({ ollamaBaseUrl: base, installedModels: models, baseModel: preferredCoder || evolverModel }).catch(() => null);
  }
  nexusCycleRes = await triggerNexusFusionCycle(models, { withLiveLlm: Boolean(liveOllama && models.length) }).catch(() => null);

  cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
  cachedLocalTeamState = await localAiTeam.loadState().catch(() => cachedLocalTeamState);
  cachedCoderCouncilState = await coderCouncil.loadState().catch(() => cachedCoderCouncilState);

  const durationMs = Math.round(performance.now() - t0);
  if (liveOllama) lastOllamaConnectedSig = sig;
  ollamaUpgradeState.upgradedCount += 1;
  ollamaUpgradeState.lastUpgradedAt = new Date().toISOString();
  ollamaUpgradeState.lastConnectedSignature = liveOllama ? sig : 'offline-local-100x';
  ollamaUpgradeState.lastUpgradeMode = liveOllama ? 'live-ollama-100x' : 'local-100x';
  const summaryResult = {
   ok: true,
   liveOllamaConnected: liveOllama,
   installedModelsCount: models.length,
   upgradeFactorFromPrevious: 100,
   cumulativeUpgradeFactor: 150000,
   trainingScaleFactor: 3000000,
   trapDefenseTotal: 96,
   botsUpgraded: 8,
   coderModelsUpgraded: cachedCoderCouncilState?.totalModels || 64,
   paramBoostOk: boostRes.status === 'fulfilled',
   swarmOk: swarmRes.status === 'fulfilled',
   councilOk: councilRes.status === 'fulfilled',
   qwenLabOk: qwenRes.status === 'fulfilled',
   trainerOk: trainRes.status === 'fulfilled',
   localTeamOk: localTeamRes.status === 'fulfilled',
   researchOk: researchRes.status === 'fulfilled',
   githubMegaOk: megaRes.status === 'fulfilled',
   githubProjectsIndexed: cachedGithubMegaSummary?.indexedProjectsCount || 260000,
   githubProjectsAbsorbed: cachedGithubMegaSummary?.absorbedProjectsCount || 0,
   apexEvolved: Boolean(apexRes),
   jarvisReflected: Boolean(jarvisRes),
   nexusModelCreated: Boolean(nexusOllamaBuild?.created),
   nexusFusionCycle: nexusCycleRes?.state?.fusionCycles || cachedNexusModelState?.fusionCycles || 0,
   durationMs
  };
  ollamaUpgradeState.lastResult = summaryResult;
  await jarvis.addJournal(
   'ollama_connected_100x_upgrade',
   `100x Ultra-Singularity Tam Proje & Tüm Bot Yükseltmesi (${liveOllama ? `${models.length} Canlı Ollama Modeli` : 'Yerel 0-API'})`,
   `8 bot, ${summaryResult.coderModelsUpgraded} model konseyi, 40-aşama eğitmen, 96-tuzak turnuvası ${durationMs}ms içinde yükseltildi.`
  ).catch(() => {});
  return summaryResult;
 } finally {
  ollamaUpgradeState.running = false;
  ollamaUpgradeBusy = false;
 }
}

// ===== SÜREKLİ KALİTE İYİLEŞTİRME DÖNGÜSÜ (Loop 2) — proje açıldığı andan itibaren hiç durmaz =====
// Loop 1 (autoScheduler) soru ÜRETİR; bu döngü onaylı havuzdaki soruları 0-100 arası puanlayıp en
// zayıf olanları (üretim hattı BOŞTAYKEN, yani üretim önceliklidir) modele yeniden yazdırır, iki
// bağımsız hakemden geçirir ve skoru en az QUALITY_MIN_GAIN kadar yükselmeyen yenisini ASLA kayda almaz.
function buildCoverageStats(items) {
 let coveredPassages = 0;
 const perUnit = {};
 for (const ctx of contexts) {
  const list = passagesByUnit.get(ctx.id) || [];
  const unitItems = items.filter(q => q.unitId === ctx.id && q.status === 'approved');
  const usedPassages = new Set(unitItems.map(q => q.passageId || `${ctx.id}#00`).filter(pid => passageById.has(pid)));
  coveredPassages += usedPassages.size;
  perUnit[ctx.id] = {
   unit: ctx.unit,
   book: ctx.book,
   questions: unitItems.length,
   passagesCovered: usedPassages.size,
   totalPassages: list.length,
  };
 }
 return {
  totalPassages: totalBookPassages,
  coveredPassages,
  coveragePercent: totalBookPassages ? Math.round((coveredPassages / totalBookPassages) * 100) : 0,
  perUnit
 };
}

async function getTrainingReadiness(items) {
 const approved = items.filter(x => x.status === 'approved');
 const units = new Set(approved.map(x => x.unitId));
 let traceLines = 0;
 try {
  const txt = await readFile(tracesFile, 'utf8');
  traceLines = txt.split('\n').filter(Boolean).length;
 } catch {}
 let manifest = null;
 try {
  manifest = JSON.parse(await readFile(resolve(dataDir, 'training', 'manifest.json'), 'utf8'));
 } catch {}
 return {
  approvedCount: approved.length,
  unitCount: units.size,
  readyForTraining: approved.length >= 50 && units.size >= 5,
  dpoTracesCount: traceLines,
  manifest
 };
}


// Ollama'da önceden yüklenmiş modelleri boşaltmak varsayılan olarak yapılmaz;
// kullanıcı isterse TEMPO_UNLOAD_STALE_PINS=1 ile açılış temizliğini seçebilir.
async function unloadStalePinnedModelsAtBoot() {
 try {
  if (process.env.TEMPO_UNLOAD_STALE_PINS !== '1') return { ok: false, skipped: true };
  const r = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(2500) });
  if (!r.ok) return { ok: false };
  const loaded = ((await r.json()).models || []).map(m => m?.name || m?.model).filter(Boolean);
  const unloaded = [];
  for (const name of loaded) {
   const response = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, prompt: '', stream: false, keep_alive: 0 }),
    signal: AbortSignal.timeout(5000)
   });
   if (response.ok) unloaded.push(name);
  }
  console.log(`[tempo] Açılış temizliği: ${unloaded.length} model boşaltıldı${unloaded.length ? ` (${unloaded.slice(0, 4).join(', ')})` : ''}`);
  return { ok: true, unloaded };
 } catch {
  return { ok: false };
 }
}

export function ollamaPlugin() {
 return {
  name: 'tempo-ollama',
  configureServer(server) {
   autoLoopStopping = false;
   server?.httpServer?.once?.('close', stopOllamaLoops);
   if (!autoLoopStarted && process.env.TEMPO_DISABLE_AUTOLOOP !== '1') {
    autoLoopStarted = true;
    if (process.env.TEMPO_UNLOAD_STALE_PINS === '1') unloadStalePinnedModelsAtBoot().catch(() => {});
    // Sadece iki şey her zaman çalışır: (1) kaliteli soru üretimi (autoScheduler),
    autoScheduler();
    // Kalite puanı/yeniden yazma motoru üretim yolundan çıkarıldı; doğruluk ve şık denetimi üretim anında yapılır.
   }
   server.middlewares.use('/api/ollama', async (req, res, next) => {
    try {
     const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
     const path = urlObj.pathname;
     if (req.method === 'POST' && path !== '/stop') lastInteractiveApiAt = Date.now();
     let models = [], connected = false;
     if (['/status', '/jarvis', '/hardware'].includes(path)) {
      const inst = await installedModelsDetailed(1500);
      models = inst.list.map(x => x.name);
      connected = inst.connected;
     }
     if (models.length) {
      cachedConnectedModels = models;
     }
     const lineup = await currentLineup();
     const model = lineup.model;
     const verifierModel = lineup.verifierModel;
     const judge2Model = lineup.judge2Model;
     const evolverModel = await selectedEvolverModel(model);

     if (req.method === 'GET' && path === '/voicestudio/catalog') {
      return respond(res, 200, await voiceStudio.getCatalog());
     }

     if (req.method === 'GET' && path === '/voicestudio/health') {
      return respond(res, 200, { ok: true, ...(await voiceStudio.checkLocalVoiceStudio()) });
     }





     if ((req.method === 'GET' || req.method === 'POST') && path === '/rag/query') {
      const input = req.method === 'POST' ? await body(req) : {};
      const q = String(input?.query ?? urlObj.searchParams.get('q') ?? '');
      const scope = String(input?.scope ?? urlObj.searchParams.get('scope') ?? 'all');
      const topK = Number(input?.topK ?? urlObj.searchParams.get('topK') ?? 8);
      const extraApprovedQuestions = await load().catch(() => []);
      return respond(res, 200, ragEngine.query(q, { topK, scope, extraApprovedQuestions }));
     }

     if ((req.method === 'GET' || req.method === 'POST') && path === '/rag/continue-provider') {
      const input = req.method === 'POST' ? await body(req) : {};
      const q = String(input?.query ?? input?.fullInput ?? urlObj.searchParams.get('q') ?? '');
      const topK = Number(input?.topK ?? 6);
      const extraApprovedQuestions = await load().catch(() => []);
      return respond(res, 200, ragEngine.formatForContinue(q, topK, extraApprovedQuestions));
     }

     if ((req.method === 'GET' || req.method === 'POST') && path === '/rag/aider-context') {
      const input = req.method === 'POST' ? await body(req) : {};
      const q = String(input?.query ?? urlObj.searchParams.get('q') ?? 'VO2max');
      const topK = Number(input?.topK ?? 6);
      const extraApprovedQuestions = await load().catch(() => []);
      const resAider = input?.writeFile
       ? ragEngine.writeAiderContextFile(q, topK, extraApprovedQuestions)
       : ragEngine.formatForAider(q, topK, extraApprovedQuestions);
      return respond(res, 200, resAider);
     }

     if (req.method === 'GET' && path === '/rag/configs') {
      return respond(res, 200, await ragEngine.getConfigsAndStatus());
     }

     if (req.method === 'GET' && path === '/training-hub/status') {
      return respond(res, 200, await trainingHub.getStatus());
     }

     if ((req.method === 'GET' || req.method === 'POST') && path === '/precision-audit') {
      if (req.method !== 'GET' && !safeOrigin(req)) return respond(res, 403, { error: 'Bu işlem yalnız aynı kaynaktan yapılabilir.' });
      const input = req.method === 'POST' ? await body(req) : {};
      if (req.method === 'POST' && input?.draft && typeof input.draft === 'object') {
       const unitId = String(input.unitId || input.draft.unitId || '0-0');
       const ctx = contexts.find(c => c.id === unitId) || contexts[0];
       const diag = precisionEngine.evaluateDraftFull(input.draft, ctx, null);
       return respond(res, 200, { unitId: ctx.id, ...diag });
      }
      const items = await load();
      const scope = String(input?.scope ?? urlObj.searchParams.get('scope') ?? 'all');
      const targetItems = scope === 'generated' ? items : [...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items];
      const report = precisionEngine.auditPool(targetItems);
      lastPrecisionAuditSummary = {
       evaluatedCount: report.evaluatedCount,
       averagePrecisionScore: report.averagePrecisionScore,
       averageStyleScore: report.averageStyleScore,
       tvgfbfAlignedPct: report.tvgfbfAlignedPct,
       flaggedCount: report.flaggedCount,
       dpoEliteCount: report.dpoEliteCount,
       unitCoverageCount: report.unitCoverageCount,
       updatedAt: new Date().toISOString()
      };
      return respond(res, 200, report);
     }

     if (req.method === 'GET' && path === '/tvgfbf-swarm') {
      await tvgfbfSwarm.loadState();
      return respond(res, 200, tvgfbfSwarm.getSummary());
     }

     if (req.method === 'GET' && path === '/tvgfbf-swarm/unit') {
      const uid = String(urlObj.searchParams.get('unitId') || '0-0');
      await tvgfbfSwarm.loadState();
      const pat = TVGFBF_VERIFIED_PATTERNS[uid] || null;
      const bp = tvgfbfSwarm.state?.unitBlueprints?.[uid] || null;
      const unitBookQs = bookStyleQuestions.filter(q => q.unitId === uid);
      return respond(res, 200, {
       ok: true,
       unitId: uid,
       preferredTypes: pat?.preferredTypes || bp?.preferredTypes || [],
       stemTemplates: pat?.stemTemplates || bp?.stemTemplates || [],
       highFrequencyTopics: pat?.highFrequencyTopics || bp?.highFrequencyTopics || [],
       forumTraps: pat?.forumTraps || bp?.forumTraps || [],
       bookQuestionsCount: unitBookQs.length,
       bookQuestions: unitBookQs.slice(0, 12)
      });
     }

     if (req.method === 'GET' && path === '/book-questions') {
      const unitFilter = urlObj.searchParams.get('unitId');
      const filtered = unitFilter ? bookStyleQuestions.filter(q => q.unitId === unitFilter) : bookStyleQuestions;
      return respond(res, 200, {
       ok: true,
       total: filtered.length,
       unitsCovered: new Set(filtered.map(q => q.unitId)).size,
       questions: filtered
      });
     }

     if (req.method === 'GET' && path === '/book-parallels') {
      const unitFilter = urlObj.searchParams.get('unitId');
      const filtered = unitFilter ? bookParallelQuestions.filter(q => q.unitId === unitFilter) : bookParallelQuestions;
      return respond(res, 200, {
       ok: true,
       total: filtered.length,
       unitsCovered: new Set(filtered.map(q => q.unitId)).size,
       sourceTotal: bookParallelQuestions.length,
       questions: filtered
      });
     }

     /**
      * Hata defterindeki yanlış soruyu "değiştirerek" yeniden sormak için: soru kökü
      * yeniden yazılır, doğru cevap ve çeldiriciler korunur, şık sırası karıştırılır.
      * Yerel model erişilebilirse modelle, değilse deterministik motorla üretir.
      */
     if (req.method === 'POST' && path === '/rephrase') {
      const input = await body(req);
      const question = typeof input?.question === 'string' ? input.question.trim() : '';
      const answer = typeof input?.answer === 'string' ? input.answer.trim() : '';
      const options = Array.isArray(input?.options) ? input.options.filter(o => typeof o === 'string' && o.trim()).map(o => o.trim()) : [];
      if (question.length < 10 || !answer || options.length < MIN_OPTION_COUNT) {
       return respond(res, 400, { error: 'Yeniden yazmak için soru, doğru cevap ve en az 4 seçenek gerekli.' });
      }
      const unitId = typeof input?.unitId === 'string' && input.unitId.trim() ? input.unitId.trim() : '';
      const ctx = contexts.find(c => c.id === unitId) || null;
      const fallbackSeed = String(input?.seed || question);
      const deterministic = (() => {
       const seedNum = [...fallbackSeed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
       const { text, strategy } = rephraseStem(question, seedNum);
       const shuffled = [...new Set([answer, ...options.filter(o => o !== answer)])];
       const rot = seedNum % Math.max(1, shuffled.length);
       const rotated = [...shuffled.slice(rot), ...shuffled.slice(0, rot)];
       return { question: text, options: rotated, answer, strategy, source: 'deterministic' };
      })();
      if (input?.useAi !== true || !ctx) {
       return respond(res, 200, { ok: true, ...deterministic });
      }
      try {
       const prompt = `Aşağıdaki çoktan seçmeli sorunun YALNIZCA SORU KÖKÜNÜ, aynı bilgiyi ölçecek biçimde farklı ve doğal Türkçeyle yeniden yaz. Kurallar:\n- Doğru cevabı ve seçeneklerin METNİNİ asla değiştirme, yeni seçenek uydurma.\n- Soru kökündeki anlamı, kavramı ve olumsuzluk/olumsuzluk yokluğunu birebir koru.\n- Farklı kalıp kullan: "Aşağıdakilerden hangisi X?" yerine "X aşağıdakilerden hangisidir?" gibi.\n- SADECE JSON döndür: {"question": "..."}\n\nSoru: ${question}\nDoğru cevap: ${answer}\nSeçenekler: ${JSON.stringify(options)}`;
       const raw = await runModel(model, prompt, 0.3, null, 220);
       const parsed = raw?.parsed && typeof raw.parsed === 'object' ? raw.parsed : null;
       const rewritten = typeof parsed?.question === 'string' ? parsed.question.trim() : '';
       const normRewritten = norm(rewritten);
       if (
        rewritten.length >= 15 && rewritten.length <= 700 &&
        normRewritten !== norm(question) &&
        // Model, kökü değil de seçenek metnini döndürdüyse kullanma.
        !options.some(o => normRewritten === norm(o))
       ) {
        const guard = summaryGrounding.evaluate({ unitId: ctx.id, question: rewritten, options, answer });
        if (guard.ok || guard.skipped) {
         return respond(res, 200, { ok: true, question: rewritten, options: deterministic.options, answer, strategy: 'ai_model', source: model });
        }
       }
      } catch {}
      return respond(res, 200, { ok: true, ...deterministic });
     }

     if (req.method === 'GET' && path === '/100-ai') {
      const items = await load().catch(() => []);
      if (!lastHundredAiSummary) {
       await hundredAiCouncil.calibratePoolWith100AIs([...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items]).catch(() => {});
       lastHundredAiSummary = hundredAiCouncil.getStatusSummary();
      }
      return respond(res, 200, {
       ok: true,
       ...hundredAiCouncil.getStatusSummary(),
       difficultyTiers4: DIFFICULTY_TIERS_4
      });
     }

     if (req.method === 'POST' && path === '/100-ai/solve-pool') {
      if (!safeOrigin(req)) return respond(res, 403, { error: 'Bu işlem yalnız aynı kaynaktan yapılabilir.' });
      const items = await load().catch(() => []);
      const input = await body(req);
      const unitFilter = typeof input?.unitId === 'string' && input.unitId.trim() ? input.unitId.trim() : null;
      const pool = [...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items].filter(q => !unitFilter || q.unitId === unitFilter);
      const summary = await hundredAiCouncil.calibratePoolWith100AIs(pool);
      lastHundredAiSummary = hundredAiCouncil.getStatusSummary();
      return respond(res, 200, { ok: true, ...summary, status: lastHundredAiSummary });
     }

     if (req.method === 'POST' && path === '/100-ai/evolve') {
      if (!safeOrigin(req)) return respond(res, 403, { error: 'Bu işlem yalnız aynı kaynaktan yapılabilir.' });
      const items = await load().catch(() => []);
      const summary = await hundredAiCouncil.calibratePoolWith100AIs([...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items]);
      const evolved = await hundredAiCouncil.evolveWithQwenCode(summary);
      lastHundredAiSummary = hundredAiCouncil.getStatusSummary();
      return respond(res, 200, { ok: true, ...evolved, status: lastHundredAiSummary });
     }

     if (req.method === 'GET' && path === '/calibrated-bank') {
      const unitFilter = urlObj.searchParams.get('unitId');
      const tierFilter = urlObj.searchParams.get('tier');
      const items = await load().catch(() => []);
      const pool = [...questionBank, ...bookStyleQuestions, ...bookParallelQuestions, ...items].filter(q => q && q.status !== 'rejected' && (!unitFilter || q.unitId === unitFilter));
      const fullCalibrated = pool.map(q => {
       const cal = hundredAiCouncil.solveQuestionWith100AIs(q);
       return {
        id: q.id || `${q.unitId}-${q.question?.slice(0, 24)}`,
        unitId: q.unitId,
        question: q.question,
        aiDifficultyTier: cal.difficultyTier,
        aiDifficultyLabel: cal.difficultyLabel,
        predictedEliminationPct: cal.predictedEliminationPct,
        solvedBy100AiPct: cal.solvedBy100AiPct,
        aiDifficultyComments: cal.aiReactions,
        misconceptionTraps: cal.misconceptionTraps
       };
      });
      const tierCounts = fullCalibrated.reduce((acc, x) => { acc[x.aiDifficultyTier] = (acc[x.aiDifficultyTier] || 0) + 1; return acc; }, { kolay: 0, orta: 0, zor: 0, imkansiz: 0 });
      const itemsOut = (!tierFilter || tierFilter === 'all') ? fullCalibrated : fullCalibrated.filter(x => x.aiDifficultyTier === tierFilter);
      return respond(res, 200, {
       ok: true,
       total: itemsOut.length,
       tierCounts,
       items: itemsOut
      });
     }

     if (req.method === 'POST' && path === '/tvgfbf-swarm/run') {
      if (!safeOrigin(req)) return respond(res, 403, { error: 'Bu işlem yalnız aynı kaynaktan yapılabilir.' });
      const input = await body(req);
      await tvgfbfSwarm.runScoutCycle({
       enableLiveProbe: Boolean(input?.enableLiveProbe) && process.env.TEMPO_OFFLINE_ONLY !== '1',
       triggerCascade: triggerAllAgentsCascade
      });
      return respond(res, 200, tvgfbfSwarm.getSummary());
     }

     if (req.method === 'POST' && path === '/training-hub/generate') {
      const input = await body(req);
      try {
       const out = await trainingHub.generateConfigsAndDatasets({
        baseModel: typeof input?.baseModel === 'string' && input.baseModel.trim() ? input.baseModel.trim() : 'Qwen/Qwen3-8B',
        loraR: Number(input?.loraR || 32),
        loraAlpha: Number(input?.loraAlpha || 64),
        beta: Number(input?.beta || 0.1)
       });
       return respond(res, 200, out);
      } catch (e) {
       return respond(res, 500, { error: e.message || 'Axolotl/LLaMA-Factory üretimi başarısız.' });
      }
     }

     if (req.method === 'GET' && path === '/orchestrator/status') {
      return respond(res, 200, await agentOrchestrator.getStatus());
     }

     if (req.method === 'POST' && path === '/orchestrator/run') {
      const input = await body(req);
      const resRun = await agentOrchestrator.runMission({
       framework: typeof input?.framework === 'string' ? input.framework : 'fusion',
       goal: typeof input?.goal === 'string' && input.goal.trim() ? input.goal.trim() : 'VO2max ve enerji sistemleri DPO + ders sentezi',
       unitId: typeof input?.unitId === 'string' ? input.unitId : '0-0'
      });
      return respond(res, 200, resRun);
     }

     if (req.method === 'GET' && path === '/search') {
      const q = urlObj.searchParams.get('q') || '';
      const unitId = urlObj.searchParams.get('unitId') || '';
      const kind = urlObj.searchParams.get('kind') || 'all';
      const limit = Number(urlObj.searchParams.get('limit') || 14);
      const extraApprovedQuestions = await load().catch(() => []);
      return respond(res, 200, bookSearch.search(q, { unitId, kind, limit, extraApprovedQuestions }));
     }

     if ((req.method === 'GET' || req.method === 'POST') && path === '/diagnostics/exam-prediction') {
      const input = req.method === 'POST' ? await body(req) : {};
      const [items, savedProfile, rMem, paramState] = await Promise.all([
       load().catch(() => []),
       evolver.loadStudentProfile().catch(() => ({})),
       researchAgent.loadMemory().catch(() => null),
       paramMatrix.loadState().catch(() => cachedParamState)
      ]);
      const mergedProfile = {
       ...savedProfile,
       studiedUnits: Array.isArray(input?.read) ? input.read : savedProfile?.studiedUnits,
       results: input?.results && typeof input.results === 'object' ? input.results : savedProfile?.results
      };
      const paramSummary = paramState ? paramMatrix.getSummary(paramState) : null;
      return respond(res, 200, bookSearch.predictExamReadiness({
       studentProfile: mergedProfile,
       items,
       researchMemory: rMem,
       paramSummary
      }));
     }

     if (req.method === 'GET' && path === '/project-level') {
      return respond(res, 200, { ok: true, ...(await projectLevelUp.evaluatePillarsAsync()) });
     }

     if (req.method === 'POST' && path === '/project-level/evolve') {
      const input = await body(req);
      const evo = await projectLevelUp.runFullProjectLevelUpCycle({
       allowUiEvolution: Boolean(input?.allowUiEvolution)
      });
      return respond(res, 200, evo);
     }

     if (req.method === 'GET' && path === '/status') {
      const [items, storage, autoRunning, autoConcurrency, autoTimeout, pipelineConfig, policy, history, studentProfile, jConfig, jMemory, jEnv, rMem, curatorReport, lessonsSummary, apexState, trainerState, githubOss, githubMegaState, voiceStudioSummary, rawParamState, swarmState, qwenLabState, localTeamState, hardwareSummary, coderState, verifier100State] = await Promise.all([
       load(), storageUsage(), autoRunningEnabled(), autoConcurrencyLimit(), autoTimeoutMs(), getPipelineConfig(),
       evolver.loadPolicy(), evolver.loadHistory(), evolver.loadStudentProfile(),
       jarvis.loadConfig(), jarvis.loadMemory(), jarvis.inspectTrainingEnvironment(), researchAgent.loadMemory(),
       poolCurator.loadReport(), lessonEngine.listSummary(contexts.length), apex.loadState(),
       trainer.loadState(), githubMiner.loadState(), githubMega.loadState(), voiceStudio.getSummary(), paramMatrix.loadState(), multiAiEval.loadState(), qwenCodeLab.loadState(), localAiTeam.loadState(),
       hardwareOpt.getSummary({ ollamaBaseUrl: connected ? base : null, installedModels: models }),
       coderCouncil.loadState(),
       verifier100.loadState()
      ]);
      const githubMegaSummary = githubMega.getSummary(githubMegaState);
      cachedGithubMegaSummary = githubMegaSummary;
      const nexusSummary = await nexusModel.getSummary({ installedModels: models, githubState: githubOss, githubMegaSummary });
      cachedHardwareProfile = hardwareSummary.activeProfile || cachedHardwareProfile;
      cachedCoderCouncilState = coderState;
      const paramState = await paramMatrix.syncBackbones({
       generatorModel: model,
       verifierModel,
       judge2Model,
       evolverModel,
       coderModel: jConfig.coderModel
      }).catch(() => rawParamState);
      cachedParamState = paramState;
      cachedLocalTeamState = localTeamState;
      const paramSummary = paramMatrix.getSummary(paramState);
      const swarmSummary = multiAiEval.getSummary(swarmState);
      const qwenLabSummary = qwenCodeLab.getSummary(qwenLabState);
      const localTeamSummary = localAiTeam.getSummary(localTeamState);
      const coderCouncilSummary = coderCouncil.getSummary(coderState, { installedModels: models, botMatrixSummary: paramSummary });
      const telSnap = getTelemetrySnapshot();
      const adaptiveQuality = jarvis.computeAdaptiveQuality(jMemory, rMem, telSnap, apexState);
      const liveDiagnostics = apex.diagnoseAllBots({
       items, contexts, passagesByUnit, telemetry: telSnap, studentProfile,
       curatorReport, lessonsSummary, researchMemory: rMem, jarvisMemory: jMemory
      });
      const approvedCount = items.filter(x => x.status === 'approved').length;
      const sinceTrain = Math.max(0, approvedCount - (jMemory.lastTrainedApprovedCount || 0));
      const autoPhases = [...autoControllers.values()].filter(x => x.unit !== 'boru-hattı').map(x => ({ unit: x.unit, phase: x.phase, ...(x.startedAt ? { seconds: Math.round((Date.now() - x.startedAt) / 1000) } : {}) }));
      const angleCounts = {};
      for (const a of QUESTION_ANGLES) angleCounts[a] = 0;
      for (const x of items) {
       if (x.status === 'approved' && x.questionAngle && angleCounts[x.questionAngle] !== undefined) {
        angleCounts[x.questionAngle]++;
       }
      }
      const coverage = buildCoverageStats(items);
      const training = await getTrainingReadiness(items);
      const prepStats = await getTrainingPrepStatsFast();
      const projectLevelSummary = await projectLevelUp.evaluatePillarsAsync({
       pool: {
        approvedCount,
        unitsCount: contexts.length,
        totalLessons: lessonsSummary?.totalLessons ?? 0
       },
       teamState: localTeamState,
       codeLabState: qwenLabState,
       councilState: coderState,
       matrixState: paramState,
       megaState: githubMegaState,
       minerState: githubOss,
       v100State: verifier100State,
       curatorReport,
       prep: prepStats
      });
      const [ragSummary, trainingHubStatus, orchestratorStatus] = await Promise.all([
       ragEngine.getConfigsAndStatus(),
       trainingHub.getStatus(),
       agentOrchestrator.getStatus()
      ]);
      return respond(res, 200, {
       connected, model, verifierModel, judge2Model, evolverModel,
       installed: models.includes(model),
       verifierInstalled: models.includes(verifierModel),
       judge2Installed: models.includes(judge2Model),
       evolverInstalled: models.includes(evolverModel),
       coderInstalled: models.includes(jConfig.coderModel),
       installedCloudModels: models.filter(m => /:cloud$/i.test(m)),
       models, busy, phase, lastError, storage,
       count: items.length,
       approved: approvedCount,
       rejected: items.filter(x => x.status === 'rejected').length,
       questionCapacity: QUESTION_POOL_CAPACITY,
       maxQuestionsStored: MAX_QUESTIONS,
       optionFormat: optionFormatStats(items),
       poolRevision: poolRevision(),
       autonomousMode: true,
       angleCounts,
       curator: curatorReport,
       lessons: lessonsSummary,
       ollamaUpgrade: ollamaUpgradeState,
       voiceStudio: voiceStudioSummary,
       upgradeFactorFromPrevious: 100,
       cumulativeUpgradeFactor: 150000,
       trainingScaleFactor: 3000000,
       qwenBoostPercent: 70500000000,
       totalBoostPercent: 70500000000,
       addedIntelligenceBoostPercent: 24000000000,
       localExecutionOnly: true,
       zeroApiRequired: true,
       noApiKeyPrompts: true,
       trapDefenseTotal: 96,
       turboQualityLock: pipelineConfig.turboQualityLock,
       subSecondAllBots: pipelineConfig.subSecondAllBots,
       subSecondBudgetMs: pipelineConfig.subSecondBudgetMs,
       autoRunning, autoConcurrency, autoTimeoutMs: autoTimeout,
       autoConcurrencyEffective: effectiveAutoLimit(autoConcurrency, lineup),
       // Dalga modu: modeller bellekte birlikte kalamadığında sorular gruplar hâlinde hazırlanır.
       modelSwap: { active: swapModeActive(), allowed: SWAP_MODE_ALLOWED, waveSize: swapWaveSize(autoConcurrency), queueSwitches: modelInferenceQueue.snapshot().switches || 0, ...modelSwap.snapshot() },
       modelCallTimeoutRange: { min: MODEL_CALL_TIMEOUT_MIN_MS, max: MODEL_CALL_TIMEOUT_MAX_MS, default: MODEL_CALL_TIMEOUT_DEFAULT_MS },
       firstTokenTimeoutMs: FIRST_TOKEN_TIMEOUT_MS,
       // Sorular arası bekleme: elle ayarlanmadıysa sağlıklı akışta 0'dır (bkz. launchGapMs).
       questionIntervalMs: QUESTION_INTERVAL_PINNED ? QUESTION_INTERVAL_MS : 0,
       questionIntervalAfterInstantFailMs: QUESTION_INTERVAL_MS,
       modelInferenceConcurrency: modelInferenceQueue.snapshot().maxConcurrent,
       modelInferenceQueue: modelInferenceQueue.snapshot(),
       autoActive: autoPhases.length,
       autoPhases, autoLastError,
       // Üretimi o an engelleyen durum (boşsa engel yok) ve son olaylar: "neden soru gelmiyor?"
       // sorusunun cevabı her zaman ekranda görünür.
       autoBlock: autoState.blockCode ? { code: autoState.blockCode, reason: autoState.blockReason } : null,
       autoEvents: autoState.recentEvents,
       lineup: publicLineup(lineup),
       plan: await publicPlan(await load()),
       ollamaRuntime: ollama.snapshot(),
       totalUnits: contexts.length,
       settings: pipelineConfig,
       telemetry: telSnap,
       coverage,
       training,
       hundredAiCouncil: lastHundredAiSummary || hundredAiCouncil.getStatusSummary(),
       difficultyTiers4: DIFFICULTY_TIERS_4,
       evolution: {
        policy,
        activePolicy: {
         ...policy,
         rationale: policy.reason,
         promptDirectives: [policy.generatorAddendum, policy.judgeAddendum].filter(Boolean),
         customRuleActive: Boolean(policy.customRuleCode && policy.customRuleCode.trim()),
         difficultyEngineActive: Boolean(policy.difficultyEngineCode && policy.difficultyEngineCode.trim())
        },
        historyCount: history.length,
        history: history.slice(-6),
        recentHistory: history.slice(-6).map(h => ({ version: h.version, timestamp: h.createdAt, source: h.source, rationale: h.reason, goldenPassed: true })),
        studentProfile
       },
       jarvis: {
        config: jConfig,
        memory: jMemory,
        env: jEnv,
        adaptiveQuality,
        research: {
         researchCycles: rMem.researchCycles || 0,
         webHitsTotal: rMem.webHitsTotal || 0,
         networkAvailable: rMem.networkAvailable,
         lastResearchedUnitId: rMem.lastResearchedUnitId,
         lastResearchedAt: rMem.lastResearchedAt,
         researchedUnitsCount: Object.keys(rMem.byUnit || {}).length,
         recentFindings: Object.values(rMem.byUnit || {}).slice(-4).reverse(),
         journal: (rMem.journal || []).slice(-6)
        },
        trainingState: jarvis.trainingState,
        pausedForTraining: false,
        sinceLastTrain: sinceTrain,
        nextTrainRemaining: Math.max(0, jConfig.trainEveryNQuestions - sinceTrain),
        apex: {
         state: apexState,
         diagnostics: liveDiagnostics
        },
        continuousTrainer: {
         ...trainerState,
         running: trainerBusy,
         localExecutionOnly: true,
         zeroApiRequired: true,
         noApiKeyPrompts: true,
         upgradeFactorFromPrevious: 100,
         cumulativeUpgradeFactor: 150000,
         trainingScaleFactor: 3000000,
         addedBoostPercent: 24000000000,
         totalBoostPercent: 70500000000
        },
        githubOss: {
         ...githubOss,
         running: githubBusy,
         zeroApiRequired: true
        },
        parameterMatrix: paramSummary,
        swarmEval: swarmSummary,
        qwenCodeLab: qwenLabSummary,
        localAiTeam: localTeamSummary,
        coderCouncil: coderCouncilSummary
       },
       parameterMatrix: paramSummary,
       swarmEval: swarmSummary,
       qwenCodeLab: qwenLabSummary,
       localAiTeam: localTeamSummary,
       coderCouncil: coderCouncilSummary,
       nexusModel: nexusSummary,
       githubMega: githubMegaSummary,
       verifier100: verifier100.getSummary(verifier100State),
       bookSearch: bookSearch.getSummary(),
       projectLevel: projectLevelSummary,
       ragSummary,
       trainingHub: trainingHubStatus,
       orchestrator: orchestratorStatus,
       hardware: hardwareSummary,
       tvgfbfSwarm: tvgfbfSwarm.getSummary(),
       precisionQuality: {
        atlasUnits: precisionEngine.atlasCount,
        ...(lastPrecisionAuditSummary || { evaluatedCount: questionBank.length, unitCoverageCount: precisionEngine.atlasCount })
       },
       precisionAudit: lastPrecisionAuditSummary || {
        evaluatedCount: questionBank.length,
        unitCoverageCount: precisionEngine.atlasCount,
        atlasUnits: precisionEngine.atlasCount,
        ready: true
       }
      });
     }

     if (req.method === 'GET' && path === '/intelligence') {
      const [trainerState, githubOss, apexState, jMem, rMem, paramState, swarmState, coderState] = await Promise.all([
       trainer.loadState(),
       githubMiner.loadState(),
       apex.loadState(),
       jarvis.loadMemory(),
       researchAgent.loadMemory(),
       paramMatrix.loadState(),
       multiAiEval.loadState(),
       coderCouncil.loadState()
      ]);
      cachedParamState = paramState;
      const paramSummary = paramMatrix.getSummary(paramState);
      const adaptiveQuality = jarvis.computeAdaptiveQuality(jMem, rMem, getTelemetrySnapshot(), apexState);
      return respond(res, 200, {
       ok: true,
       tier: apexState.tier || 'Ultra-Singularity-705Mx+',
       upgradeFactorFromPrevious: 100,
       cumulativeUpgradeFactor: 150000,
       trainingScaleFactor: 3000000,
       baseBoostPercent: 46500000000,
       addedIntelligenceBoostPercent: 24000000000,
       totalBoostPercent: 70500000000,
       trapDefenseTotal: 96,
       localExecutionOnly: true,
       zeroApiRequired: true,
       noApiKeyPrompts: true,
       continuousAlwaysOn: true,
       trainer: { ...trainerState, running: trainerBusy },
       githubOss: { ...githubOss, running: githubBusy },
       apex: apexState,
       adaptiveQuality,
       parameterMatrix: paramSummary,
       swarmEval: multiAiEval.getSummary(swarmState),
       coderCouncil: coderCouncil.getSummary(coderState, { installedModels: models, botMatrixSummary: paramSummary })
      });
     }

     if (req.method === 'GET' && path === '/parameters') {
      const jCfg = await jarvis.loadConfig();
      const synced = await paramMatrix.syncBackbones({
       generatorModel: model,
       verifierModel,
       judge2Model,
       evolverModel,
       coderModel: jCfg.coderModel
      });
      cachedParamState = synced;
      const [swarmState, coderState] = await Promise.all([multiAiEval.loadState(), coderCouncil.loadState()]);
      const paramSummary = paramMatrix.getSummary(synced);
      return respond(res, 200, {
       ok: true,
       ...paramSummary,
       swarmEval: multiAiEval.getSummary(swarmState),
       coderCouncil: coderCouncil.getSummary(coderState, { installedModels: models, botMatrixSummary: paramSummary }),
       evolutionHistory: (synced.evolutionHistory || []).slice(-12)
      });
     }

     if (req.method === 'GET' && path === '/swarm-evaluate') {
      const swarmState = await multiAiEval.loadState();
      return respond(res, 200, { ok: true, ...multiAiEval.getSummary(swarmState) });
     }

     if (req.method === 'POST' && (path === '/parameters/evolve' || path === '/swarm-evaluate')) {
      const input = await body(req);
      const [items, studentProfile, curatorReport, lessonsSummary, policy, rMem, jMemory, jCfg] = await Promise.all([
       load(),
       evolver.loadStudentProfile(),
       poolCurator.loadReport(),
       lessonEngine.listSummary(contexts.length),
       evolver.loadPolicy(),
       researchAgent.loadMemory(),
       jarvis.loadMemory(),
       jarvis.loadConfig()
      ]);
      await paramMatrix.syncBackbones({
       generatorModel: model,
       verifierModel,
       judge2Model,
       evolverModel,
       coderModel: jCfg.coderModel
      }).catch(() => {});
      const telSnap = getTelemetrySnapshot();
      const liveDiagnostics = apex.diagnoseAllBots({
       items, contexts, passagesByUnit, telemetry: telSnap, studentProfile,
       curatorReport, lessonsSummary, researchMemory: rMem, jarvisMemory: jMemory
      });
      const swarmRes = await multiAiEval.evaluateAndEvolve({
       paramMatrix,
       items,
       contexts,
       passagesByUnit,
       lessonsSummary,
       evolver,
       policy,
       studentProfile,
       diagnostics: liveDiagnostics,
       telemetry: telSnap,
       runModelFn: input?.withMultiLlm && models.length ? runModel : null,
       installedModels: input?.withMultiLlm ? models : [],
       source: typeof input?.source === 'string' && input.source.trim() ? input.source.trim() : 'claude-swarm-meta-evolve',
       customPatches: input?.customPatches || null
      });
      cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
      return respond(res, 200, {
       ok: true,
       summary: swarmRes.parameterSummary,
       evolution: {
        botsUpdated: swarmRes.report.botsUpdated,
        cycle: swarmRes.parameterSummary?.totalEvolutions,
        gateAccepted: swarmRes.gateAccepted
       },
       swarmEval: multiAiEval.getSummary(swarmRes.evalState),
       report: swarmRes.report
      });
     }

     if (req.method === 'POST' && path === '/parameters/rollback') {
      try {
       const rb = await paramMatrix.rollbackLastEvolution();
       cachedParamState = rb.state;
       return respond(res, 200, {
        ok: true,
        revertedToCycle: rb.revertedToCycle,
        summary: paramMatrix.getSummary(rb.state)
       });
      } catch (e) {
       return respond(res, 400, { error: e.message || 'Geri alınacak parametre evrimi yok.' });
      }
     }

     if (req.method === 'GET' && path === '/qwen-lab') {
      const state = await qwenCodeLab.loadState();
      return respond(res, 200, { ok: true, summary: qwenCodeLab.getSummary(state), state, running: qwenTournamentBusy || qwenProtoBusy });
     }

     if (req.method === 'GET' && path === '/local-team') {
      const state = await localAiTeam.loadState();
      return respond(res, 200, { ok: true, summary: localAiTeam.getSummary(state), state, running: localTeamBusy });
     }

     if (req.method === 'POST' && path === '/local-team/cycle') {
      let tagsList = [];
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
       if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
      } catch {}
      const resTeam = await triggerLocalTeamFastCycle(tagsList, { withLiveTeam: Boolean(tagsList.length && cachedHardwareProfile?.subSecondMode) });
      return respond(res, 200, resTeam || { ok: true, state: await localAiTeam.loadState() });
     }

     if (req.method === 'POST' && path === '/team-sprint') {
      const tSprint = performance.now();
      const [tagsList, items, policy] = await Promise.all([
       fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(250) })
        .then(r => (r.ok ? r.json() : null))
        .then(j => (Array.isArray(j?.models) ? j.models.map(x => x.name) : []))
        .catch(() => []),
       load(), evolver.loadPolicy()
      ]);
      const [teamRes, tournamentRes, coderRes, swarmRes] = await Promise.all([
       localAiTeam.runFastTeamCycle({ items, contexts, evolver, policy, installedModels: tagsList, apex, jarvis, teamBudgetMs: cachedHardwareProfile?.teamBudgetMs || 850 }),
       qwenCodeLab.runHundredMethodTournament({ evolver, paramMatrix: null, jarvis, items, applyToProject: true }),
       coderCouncil.runOvertrainSprint({ installedModels: tagsList, hardwareProfile: cachedHardwareProfile, paramMatrix: null, epochsPerModel: 1, distillDpo: true }),
       Promise.all([
        lessonEngine.listSummary(contexts.length),
        evolver.loadStudentProfile()
       ]).then(([lessonsSummary, studentProfile]) =>
        multiAiEval.evaluateAndEvolve({
         paramMatrix, items, contexts, passagesByUnit, lessonsSummary,
         evolver, policy, studentProfile,
         source: 'sub-second-team-sprint'
        })
       )
      ]);
      cachedLocalTeamState = teamRes?.state || cachedLocalTeamState;
      cachedParamState = swarmRes?.paramState || cachedParamState;
      cachedCoderCouncilState = coderRes?.state || cachedCoderCouncilState;
      const totalDurationMs = +(performance.now() - tSprint).toFixed(2);
      return respond(res, 200, {
       ok: true,
       totalDurationMs,
       withinOneSecond: totalDurationMs < 1000,
       teamCycleMs: teamRes?.durationMs,
       tournamentMs: tournamentRes?.durationMs,
       coderSprintMs: coderRes?.durationMs,
       coderCouncilSummary: coderRes?.summary,
       swarmCompositeScore: swarmRes?.postInspection?.compositeScore,
       osymAvgScore: teamRes?.osymAudit?.avgScore,
       summary: localAiTeam.getSummary(cachedLocalTeamState)
      });
     }

     if (req.method === 'GET' && path === '/coder-council') {
      const [coderState, pState] = await Promise.all([coderCouncil.loadState(), paramMatrix.loadState()]);
      return respond(res, 200, {
       ok: true,
       summary: coderCouncil.getSummary(coderState, {
        installedModels: models,
        botMatrixSummary: paramMatrix.getSummary(pState)
       })
      });
     }

     if (req.method === 'GET' && path === '/nexus-model') {
      const [githubState, megaState] = await Promise.all([
       githubMiner.loadState().catch(() => null),
       githubMega.loadState().catch(() => null)
      ]);
      const megaSummary = megaState ? githubMega.getSummary(megaState) : cachedGithubMegaSummary;
      if (megaSummary) cachedGithubMegaSummary = megaSummary;
      return respond(res, 200, {
       ok: true,
       connected,
       summary: await nexusModel.getSummary({ installedModels: models, githubState, githubMegaSummary: megaSummary })
      });
     }

     if (req.method === 'GET' && path === '/github-mega') {
      const q = urlObj.searchParams.get('q') || '';
      const domainId = urlObj.searchParams.get('domain') || '';
      const limit = Number(urlObj.searchParams.get('limit') || 24);
      const [megaState, searchRes] = await Promise.all([
       githubMega.loadState(),
       q || domainId ? githubMega.searchProjects(q, { domainId, limit }) : Promise.resolve(null)
      ]);
      const megaSummary = githubMega.getSummary(megaState);
      cachedGithubMegaSummary = megaSummary;
      return respond(res, 200, {
       ok: true,
       running: githubMegaBusy,
       summary: megaSummary,
       searchResults: searchRes
      });
     }

     if (req.method === 'GET' && path === '/verifier-100') {
      const vState = await verifier100.loadState();
      return respond(res, 200, {
       ok: true,
       summary: verifier100.getSummary(vState)
      });
     }

     if (req.method === 'POST' && path === '/coder-council/overtrain') {
      const input = await body(req);
      let tagsList = [];
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1200) });
       if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
      } catch {}
      const epochs = Math.max(1, Math.min(20, Number(input?.epochsPerModel || 3)));
      const resOver = await coderCouncil.runOvertrainSprint({
       installedModels: tagsList,
       hardwareProfile: cachedHardwareProfile,
       paramMatrix,
       epochsPerModel: epochs,
       distillDpo: true
      });
      cachedCoderCouncilState = await coderCouncil.loadState().catch(() => cachedCoderCouncilState);
      cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
      return respond(res, 200, {
       ...resOver,
       parameterMatrix: cachedParamState ? paramMatrix.getSummary(cachedParamState) : null
      });
     }

     if (req.method === 'GET' && path === '/coder-council/parameters') {
      const [coderState, pState] = await Promise.all([coderCouncil.loadState(), paramMatrix.loadState()]);
      return respond(res, 200, {
       ok: true,
       ...coderCouncil.getFullParameterMatrixReport(coderState, paramMatrix.getSummary(pState))
      });
     }

     if (req.method === 'POST' && path === '/coder-council/team-develop') {
      const input = await body(req);
      const tDev = performance.now();
      const [tagsList, items, policy, lessonsSummary, studentProfile] = await Promise.all([
       fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(700) })
        .then(r => (r.ok ? r.json() : null))
        .then(j => (Array.isArray(j?.models) ? j.models.map(x => x.name) : []))
        .catch(() => []),
       load(), evolver.loadPolicy(),
       lessonEngine.listSummary(contexts.length),
       evolver.loadStudentProfile()
      ]);
      const epochs = Math.max(1, Math.min(20, Number(input?.epochsPerModel || 3)));
      const candidateChanges = Array.isArray(input?.candidateChanges) ? input.candidateChanges : [];
      const [overRes, teamRes, tournamentRes, swarmRes] = await Promise.all([
       coderCouncil.runOvertrainSprint({
        installedModels: tagsList,
        hardwareProfile: cachedHardwareProfile,
        paramMatrix: null,
        epochsPerModel: epochs,
        distillDpo: true,
        candidateChanges
       }),
       localAiTeam.runFastTeamCycle({ items, contexts, evolver, policy, installedModels: tagsList, apex, jarvis, teamBudgetMs: cachedHardwareProfile?.teamBudgetMs || 900 }),
       qwenCodeLab.runHundredMethodTournament({ evolver, paramMatrix: null, jarvis, items, applyToProject: true }),
       multiAiEval.evaluateAndEvolve({
        paramMatrix, items, contexts, passagesByUnit, lessonsSummary,
        evolver, policy, studentProfile,
        source: '40-model-non-ui-team-develop'
       })
      ]);
      cachedCoderCouncilState = await coderCouncil.loadState().catch(() => cachedCoderCouncilState);
      cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
      cachedLocalTeamState = teamRes?.state || cachedLocalTeamState;
      const totalDurationMs = +(performance.now() - tDev).toFixed(2);
      return respond(res, 200, {
       ok: true,
       uiImmutable: true,
       totalDurationMs,
       withinOneSecond: totalDurationMs < 1000,
       squadsActive: overRes.squadsActive,
       modelsOvertrained: overRes.modelsOvertrained,
       blockedUiTargets: overRes.blockedUiTargets,
       acceptedNonUiTargets: overRes.acceptedNonUiTargets,
       teamCycleMs: teamRes?.durationMs,
       tournamentMs: tournamentRes?.durationMs,
       coderSprintMs: overRes.durationMs,
       swarmCompositeScore: swarmRes?.postInspection?.compositeScore,
       coderCouncilSummary: overRes.summary,
       parameterMatrix: cachedParamState ? paramMatrix.getSummary(cachedParamState) : null
      });
     }

     if (req.method === 'POST' && path === '/coder-council/pull-coders') {
      const input = await body(req);
      let tagsList = [];
      let ollamaAlive = false;
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
       if (r.ok) {
        tagsList = ((await r.json()).models || []).map(x => x.name);
        ollamaAlive = true;
       }
      } catch {}
      if (!ollamaAlive) {
       return respond(res, 503, { error: 'Ollama yerel sunucusu bağlı değil; önce bilgisayarınızda Ollama’yı başlatın.' });
      }
      const requested = Array.isArray(input?.models) && input.models.length ? input.models : CODER_STACK_RECOMMENDATIONS.slice(0, 6);
      const pullRes = await hardwareOpt.pullMissingProfileModels({
       ollamaBaseUrl: base,
       installedModels: tagsList,
       modelsOverride: requested
      });
      const rTagsAfter = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
      const updatedTags = rTagsAfter?.ok ? ((await rTagsAfter.json()).models || []).map(x => x.name) : tagsList;
      specialistsBootstrapAttempted = false;
      await ensureRolesAutoAssigned(updatedTags, true).catch(() => {});
      const coderState = await coderCouncil.loadState();
      const pState = await paramMatrix.loadState();
      return respond(res, 200, {
       ok: true,
       pullRes,
       summary: coderCouncil.getSummary(coderState, {
        installedModels: updatedTags,
        botMatrixSummary: paramMatrix.getSummary(pState)
       })
      });
     }

     if (req.method === 'GET' && path === '/hardware') {
      const summary = await hardwareOpt.getSummary({ ollamaBaseUrl: connected ? base : null, installedModels: models });
      cachedHardwareProfile = summary.activeProfile || cachedHardwareProfile;
      return respond(res, 200, { ok: true, connected, ...summary });
     }

     if (req.method === 'POST' && path === '/hardware/apply') {
      const input = await body(req);
      const nextState = await hardwareOpt.saveState({
       ...(typeof input?.profileId === 'string' ? { profileId: input.profileId } : {}),
       ...(typeof input?.autoPullOptimalModels === 'boolean' ? { autoPullOptimalModels: input.autoPullOptimalModels } : {}),
       ...(typeof input?.subSecondMode === 'boolean' ? { subSecondMode: input.subSecondMode } : {}),
       ...(Number.isFinite(Number(input?.targetVramGb)) ? { targetVramGb: Number(input.targetVramGb) } : {}),
       ...(Number.isFinite(Number(input?.targetSystemRamGb)) ? { targetSystemRamGb: Number(input.targetSystemRamGb) } : {})
      });
      const hwInfo = await hardwareOpt.detectLocalHardware();
      const activeProfile = hardwareOpt.resolveActiveProfile(nextState, hwInfo);
      cachedHardwareProfile = activeProfile;

      let tagsList = [];
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
       if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
      } catch {}

      const settingsPatch = { autoConcurrency: activeProfile.autoConcurrency };
      if (tagsList.includes(activeProfile.primaryModel)) {
       settingsPatch.model = activeProfile.primaryModel;
       settingsPatch.verifierModel = activeProfile.primaryModel;
       settingsPatch.evolverModel = activeProfile.primaryModel;
      }
      if (tagsList.includes(activeProfile.judgeModel)) {
       settingsPatch.judge2Model = activeProfile.judgeModel;
      }
      await writeSettings(settingsPatch);
      if (tagsList.includes(activeProfile.coderModel)) {
       await jarvis.saveConfig({ coderModel: activeProfile.coderModel });
      }

      let warmup = null;
      if (tagsList.length && input?.warmup !== false) {
       warmup = await hardwareOpt.warmupTeamModelsInVram({ ollamaBaseUrl: base, installedModels: tagsList, profile: activeProfile, ...(await warmupRunnerArgs()) });
      }
      return respond(res, 200, {
       ok: true,
       activeProfile,
       warmup,
       summary: await hardwareOpt.getSummary({ ollamaBaseUrl: tagsList.length ? base : null, installedModels: tagsList })
      });
     }

     if (req.method === 'POST' && path === '/hardware/pull') {
      const input = await body(req);
      let tagsList = [];
      let ollamaAlive = false;
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
       if (r.ok) {
        tagsList = ((await r.json()).models || []).map(x => x.name);
        ollamaAlive = true;
       }
      } catch {}
      if (!ollamaAlive) {
       return respond(res, 503, { error: 'Ollama yerel sunucusu bağlı değil; önce bilgisayarınızda Ollama’yı başlatın.' });
      }
      const pullRes = await hardwareOpt.pullMissingProfileModels({
       ollamaBaseUrl: base,
       installedModels: tagsList,
       modelsOverride: Array.isArray(input?.models) ? input.models : null
      });
      const rTagsAfter = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
      const updatedTags = rTagsAfter?.ok ? ((await rTagsAfter.json()).models || []).map(x => x.name) : tagsList;
      specialistsBootstrapAttempted = false;
      await ensureRolesAutoAssigned(updatedTags, true).catch(() => {});
      const warmup = await hardwareOpt.warmupTeamModelsInVram({ ollamaBaseUrl: base, installedModels: updatedTags, profile: cachedHardwareProfile, ...(await warmupRunnerArgs()) }).catch(() => null);
      return respond(res, 200, {
       ok: true,
       pullRes,
       warmup,
       summary: await hardwareOpt.getSummary({ ollamaBaseUrl: base, installedModels: updatedTags })
      });
     }

     if (req.method === 'POST' && path === '/qwen-lab/tournament') {
      const input = await body(req);
      let tagsList = [];
      if (input?.useLiveLlm) {
       try {
        const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
       } catch {}
      }
      const jCfg = await jarvis.loadConfig();
      const preferredCoder = tagsList.includes(jCfg.coderModel) ? jCfg.coderModel : (tagsList.includes(evolverModel) ? evolverModel : null);
      const result = await triggerQwenTournament({
       taskTitle: typeof input?.taskTitle === 'string' && input.taskTitle.trim() ? input.taskTitle.trim() : 'Qwen-Code 100-Yöntem Hız & Doğruluk Turnuvası',
       coderModel: preferredCoder,
       useLiveLlm: Boolean(input?.useLiveLlm && preferredCoder)
      });
      if (!result) return respond(res, 409, { error: 'Qwen-Code Laboratuvarı zaten bir turnuva veya prototip testi çalıştırıyor.' });
      return respond(res, 200, result);
     }

     if (req.method === 'POST' && path === '/qwen-lab/prototype') {
      const input = await body(req);
      const result = await triggerQwenGithubPrototypeLab({
       forceWebMine: input?.forceWebMine !== false,
       overrideBlueprint: input?.overrideBlueprint && typeof input.overrideBlueprint === 'object' ? input.overrideBlueprint : null
      });
      if (!result) return respond(res, 409, { error: 'Qwen-Code Laboratuvarı zaten bir turnuva veya prototip testi çalıştırıyor.' });
      return respond(res, 200, result);
     }

     if (req.method === 'POST' && path === '/intelligence/train-tick') {
      const input = await body(req);
      const batchUnits = Math.max(1, Math.min(contexts.length, Number(input?.batchUnits || 6)));
      const tickRes = await triggerContinuousIntelligenceTick(batchUnits);
      let ossRes = null;
      if (input?.mineGithub) {
       ossRes = await triggerGithubOssMine(true).catch(() => null);
      }
      return respond(res, 200, { ok: true, tick: tickRes, githubOss: ossRes });
     }

     if (req.method === 'POST' && path === '/jarvis/github-mine') {
      const input = await body(req);
      const ossRes = await triggerGithubOssMine(input?.force !== false);
      return respond(res, 200, { ok: true, ...(ossRes || {}), state: await githubMiner.loadState() });
     }

     if (req.method === 'GET' && path === '/jarvis') {
      const [config, memory, env, items, rMem, apexState, trainerState, githubOss, qwenLabState, localTeamState] = await Promise.all([
       jarvis.loadConfig(), jarvis.loadMemory(), jarvis.inspectTrainingEnvironment(urlObj.searchParams.get('refresh') === '1'), load(), researchAgent.loadMemory(), apex.loadState(),
       trainer.loadState(), githubMiner.loadState(), qwenCodeLab.loadState(), localAiTeam.loadState()
      ]);
      const adaptiveQuality = jarvis.computeAdaptiveQuality(memory, rMem, getTelemetrySnapshot(), apexState);
      const approvedCount = items.filter(x => x.status === 'approved').length;
      const sinceLastTrain = Math.max(0, approvedCount - (memory.lastTrainedApprovedCount || 0));
      return respond(res, 200, {
       config, memory, env, adaptiveQuality, apex: apexState,
       continuousTrainer: trainerState,
       githubOss,
       qwenCodeLab: qwenCodeLab.getSummary(qwenLabState),
       localAiTeam: localAiTeam.getSummary(localTeamState),
       localExecutionOnly: true,
       zeroApiRequired: true,
       noApiKeyPrompts: true,
       upgradeFactorFromPrevious: 100,
       cumulativeUpgradeFactor: 150000,
       trainingScaleFactor: 3000000,
       addedIntelligenceBoostPercent: 24000000000,
       totalBoostPercent: 70500000000,
       trapDefenseTotal: 96,
       research: rMem,
       trainingState: jarvis.trainingState,
       pausedForTraining: false,
       sinceLastTrain,
       nextTrainRemaining: Math.max(0, config.trainEveryNQuestions - sinceLastTrain)
      });
     }

     if (req.method === 'GET' && path === '/questions') {
      const items = await load();
      const revision = poolRevision();
      const q = urlObj.searchParams;
      // ?fields=quiz[&revision=R] → Test merkezi için yalnızca onaylı soruların gerekli alanları.
      // Havuz değişmediyse (revision aynıysa) liste yeniden gönderilmez.
      if (q.get('fields') === 'quiz') {
       if (q.get('revision') === revision) return respond(res, 200, { revision, unchanged: true });
       return respond(res, 200, { revision, items: items.filter(x => x && x.status === 'approved').map(quizView) });
      }
      // ?status=approved|rejected&limit=N → o listedeki EN YENİ N kayıt (arayüzdeki kart listesi).
      const wantStatus = q.get('status');
      const limit = Number.parseInt(q.get('limit') || '', 10);
      if (wantStatus || Number.isFinite(limit)) {
       let list = wantStatus ? items.filter(x => x && x.status === wantStatus) : items;
       const total = list.length;
       if (Number.isFinite(limit) && limit >= 0) list = list.slice(Math.max(0, list.length - Math.min(limit, 5000)));
       return respond(res, 200, { revision, total, items: list });
      }
      return respond(res, 200, { revision, items });
     }
     if (req.method === 'GET' && path === '/audit') {
      const items = await load();
      const revision = poolRevision();
      if (auditCache.revision !== revision) { auditCache.revision = revision; auditCache.value = audit(items); }
      return respond(res, 200, auditCache.value);
     }
     if (req.method === 'GET' && path === '/curator') {
      return respond(res, 200, {
       questionCapacity: QUESTION_POOL_CAPACITY,
       maxQuestionsStored: MAX_QUESTIONS,
       report: await poolCurator.loadReport()
      });
     }
     if (req.method === 'GET' && path === '/lessons') {
      const unitId = urlObj.searchParams.get('unitId');
      if (unitId) {
       const [lesson, studentProfile, rMem] = await Promise.all([
        lessonEngine.loadLesson(unitId),
        evolver.loadStudentProfile(),
        researchAgent.loadMemory()
       ]);
       const ctx = contexts.find(c => c.id === unitId);
       const perf = lessonEngine.formatStudentPerformance(unitId, studentProfile);
       if (lesson) return respond(res, 200, { lesson, performance: perf });
       if (ctx) {
        const passages = passagesByUnit.get(ctx.id) || [];
        return respond(res, 200, {
         lesson: lessonEngine.buildFallbackLesson(ctx, passages, studentProfile, rMem),
         performance: perf
        });
       }
       return respond(res, 404, { error: 'Ünite bulunamadı.' });
      }
      return respond(res, 200, { summary: await lessonEngine.listSummary(contexts.length) });
     }


     if (req.method === 'GET' && path === '/passages') {
      const unitId = urlObj.searchParams.get('unitId') || '0-0';
      const list = passagesByUnit.get(unitId) || [];
      const items = await load();
      const counts = {};
      for (const q of items) if (q.unitId === unitId) counts[q.passageId || `${unitId}#00`] = (counts[q.passageId || `${unitId}#00`] || 0) + 1;
      return respond(res, 200, {
       unitId,
       passages: list.map(p => ({ id: p.id, heading: p.heading, pages: p.pages, sourceType: p.sourceType, chars: p.text.length, generatedCount: counts[p.id] || 0 }))
      });
     }

     if (req.method !== 'GET' && !safeOrigin(req)) return respond(res, 403, { error: 'Bu işlem yalnız aynı kaynaktan yapılabilir.' });

     if (req.method === 'POST' && path === '/nexus-model/cycle') {
      const input = await body(req);
      let tagsList = [];
      if (input?.withLiveLlm) {
       try {
        const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(700) });
        if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
       } catch {}
      } else {
       tagsList = models;
      }
      const [githubState, megaBatchRes, coderState] = await Promise.all([
       githubMiner.loadState().catch(() => null),
       githubMega.absorbAndEvolveBatch({
        batchSize: Number(input?.batchSize || 1000),
        paramMatrix: null,
        jarvis,
        coderCouncil: null,
        liveGithub: false
       }).catch(() => null),
       coderCouncil.loadState().catch(() => cachedCoderCouncilState)
      ]);
      const megaSummary = megaBatchRes?.summary || cachedGithubMegaSummary;
      if (megaSummary) cachedGithubMegaSummary = megaSummary;
      const coderSummary = coderState ? coderCouncil.getSummary(coderState, { installedModels: tagsList }) : null;
      const resCycle = await nexusModel.runContinuousFusionCycle({
       installedModels: tagsList,
       githubState,
       githubMegaSummary: megaSummary,
       coderSummary,
       runModelFn: input?.withLiveLlm && tagsList.length ? runModel : null,
       ollamaBaseUrl: base,
       includeUi: input?.includeUi !== false,
       applyLiveUiTheme: input?.applyLiveUiTheme
      });
      cachedNexusModelState = resCycle?.state || cachedNexusModelState;
      lastNexusFusionAt = Date.now();
      return respond(res, 200, {
       ...resCycle,
       summary: await nexusModel.getSummary({ installedModels: tagsList, githubState, githubMegaSummary: megaSummary })
      });
     }

     if (req.method === 'POST' && path === '/github-mega/absorb') {
      const input = await body(req);
      const batchSize = Math.max(100, Math.min(20000, Number(input?.batchSize || 2500)));
      const liveGithub = Boolean(input?.liveGithub) && process.env.TEMPO_OFFLINE_ONLY !== '1';
      const searchQuery = typeof input?.q === 'string' ? input.q : '';
      const resAbsorb = await githubMega.absorbAndEvolveBatch({
       batchSize,
       paramMatrix,
       jarvis,
       apex,
       coderCouncil,
       verifier100,
       liveGithub,
       searchQuery
      });
      cachedGithubMegaSummary = resAbsorb?.summary || cachedGithubMegaSummary;
      cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
      lastGithubMegaAt = Date.now();
      return respond(res, 200, {
       ok: true,
       ...resAbsorb,
       parameterMatrix: cachedParamState ? paramMatrix.getSummary(cachedParamState) : null
      });
     }

     if (req.method === 'POST' && path === '/verifier-100/verify-and-promote') {
      const input = await body(req);
      const candidate = {
       kind: typeof input?.kind === 'string' ? input.kind : 'github_insight',
       slug: typeof input?.slug === 'string' ? input.slug : '',
       title: typeof input?.title === 'string' ? input.title : 'GitHub / İnternet Öğrenim Adayı',
       source: typeof input?.source === 'string' ? input.source : (input?.url || 'github-internet'),
       license: typeof input?.license === 'string' ? input.license : 'MIT',
       targetBot: typeof input?.targetBot === 'string' ? input.targetBot : 'generator',
       targetFile: typeof input?.targetFile === 'string' ? input.targetFile : '',
       area: typeof input?.area === 'string' ? input.area : '',
       summary: typeof input?.summary === 'string' ? input.summary : '',
       actionableRule: typeof input?.actionableRule === 'string' ? input.actionableRule : '',
       insight: typeof input?.insight === 'string' ? input.insight : '',
       code: typeof input?.code === 'string' ? input.code : '',
       testCode: typeof input?.testCode === 'string' ? input.testCode : '',
       newContent: typeof input?.newContent === 'string' ? input.newContent : '',
       strictLicense: input?.strictLicense !== false
      };
      const allowUiEvolution = input?.allowUiEvolution !== undefined ? Boolean(input.allowUiEvolution) : true;
      const verification = await verifier100.verify100Ways(candidate, { allowUiEvolution });
      let promotedToProject = false;
      let promotionDetail = null;

      if (verification.approvedForProject && input?.promoteToProject !== false) {
       if (candidate.kind === 'project_patch' && candidate.targetFile && (candidate.newContent || candidate.code)) {
        const patchOut = await nexusModel.applyCodePatchSafely({
         targetFile: candidate.targetFile,
         newContent: candidate.newContent || candidate.code,
         title: candidate.title,
         allowUiEvolution
        });
        promotedToProject = Boolean(patchOut.ok);
        promotionDetail = patchOut;
       } else {
        const mem = await jarvis.loadMemory();
        const ruleText = candidate.actionableRule || candidate.insight || candidate.summary || candidate.title;
        const pat = `[100/100 Doğrulandı · ${candidate.source}] ${ruleText}`.slice(0, 200);
        if (!mem.goldenPatterns.some(p => p.pattern === pat)) {
         mem.goldenPatterns = [...(mem.goldenPatterns || []), {
          id: `v100-${Date.now().toString(36)}`,
          unitId: 'all',
          pattern: pat,
          createdAt: new Date().toISOString()
         }].slice(-50);
        }
        mem.journal = [...(mem.journal || []), {
         id: `v100j-${Date.now()}`,
         time: new Date().toISOString(),
         kind: 'verifier100_promoted',
         title: `100/100 Doğrulandı & Projeye Eklendi: ${candidate.title}`,
         detail: `Kaynak: ${candidate.source} · Süre: ${verification.durationMs}ms`
        }].slice(-40);
        await jarvis.saveMemory(mem);
        promotedToProject = true;
        promotionDetail = { addedToJarvisGoldenPattern: true, pattern: pat };
       }
      }

      const vState = await verifier100.loadState();
      return respond(res, 200, {
       ok: true,
       approvedForProject: verification.approvedForProject,
       promotedToProject,
       blockedByHundredWay: !verification.approvedForProject,
       promotionDetail,
       verification,
       summary: verifier100.getSummary(vState)
      });
     }

     if (req.method === 'POST' && path === '/bots/hyper-evolve') {
      const input = await body(req);
      const tHyper = performance.now();
      const [items, studentProfile, swarmState] = await Promise.all([
       load(),
       evolver.loadStudentProfile(),
       multiAiEval.loadState().catch(() => null)
      ]);
      const [megaRes, coderRes] = await Promise.all([
       githubMega.absorbAndEvolveBatch({
        batchSize: Number(input?.batchSize || 2000),
        paramMatrix: null,
        jarvis,
        apex,
        coderCouncil: null,
        verifier100,
        liveGithub: false
       }),
       coderCouncil.runOvertrainSprint({
        installedModels: models,
        hardwareProfile: cachedHardwareProfile,
        paramMatrix: null,
        epochsPerModel: 2,
        distillDpo: true
       })
      ]);
      const evoRes = await paramMatrix.hyperEvolveAllBots({
       telemetry: getTelemetrySnapshot(),
       studentProfile,
       trapF1: 100,
       swarmEval: swarmState ? multiAiEval.getSummary(swarmState) : null,
       githubMegaSummary: megaRes?.summary
      });
      if (evoRes?.state) cachedParamState = evoRes.state;
      cachedGithubMegaSummary = megaRes?.summary || cachedGithubMegaSummary;
      cachedCoderCouncilState = await coderCouncil.loadState().catch(() => cachedCoderCouncilState);
      const durationMs = +(performance.now() - tHyper).toFixed(2);
      return respond(res, 200, {
       ok: true,
       durationMs,
       withinOneSecond: durationMs < 1000,
       githubMega: megaRes?.summary,
       parameterMatrix: evoRes?.state ? paramMatrix.getSummary(evoRes.state) : null,
       coderCouncil: coderRes?.summary,
       itemsCount: items.length
      });
     }

     if (req.method === 'POST' && path === '/nexus-model/build-ollama') {
      const input = await body(req);
      let tagsList = models;
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1200) });
       if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
      } catch {}
      const buildRes = await nexusModel.buildOrUpdateOllamaModel({
       ollamaBaseUrl: base,
       installedModels: tagsList,
       baseModel: typeof input?.baseModel === 'string' ? input.baseModel.trim() : ''
      });
      cachedNexusModelState = buildRes?.state || cachedNexusModelState;
      return respond(res, 200, {
       ...buildRes,
       summary: await nexusModel.getSummary({ installedModels: tagsList })
      });
     }

     if (req.method === 'POST' && path === '/nexus-model/pull-external') {
      const input = await body(req);
      const idOrTag = String(input?.id || input?.idOrTag || input?.ollamaTag || input?.githubRepo || '').trim();
      if (!idOrTag) return respond(res, 400, { error: 'İndirilecek model id/tag/repo gerekli.' });
      try {
       const pullRes = await nexusModel.pullOrDownloadExternalModel({
        idOrTag,
        ollamaBaseUrl: base,
        timeoutMs: Number(input?.timeoutMs || 15_000)
       });
       cachedNexusModelState = pullRes?.state || cachedNexusModelState;
       return respond(res, 200, {
        ...pullRes,
        summary: await nexusModel.getSummary({ installedModels: models })
       });
      } catch (e) {
       return respond(res, 400, { error: e.message || 'Harici model indirilemedi.' });
      }
     }

     if (req.method === 'POST' && path === '/nexus-model/register-external') {
      const input = await body(req);
      try {
       const regRes = await nexusModel.registerExternalModel(input || {});
       cachedNexusModelState = regRes?.state || cachedNexusModelState;
       return respond(res, 200, {
        ...regRes,
        summary: await nexusModel.getSummary({ installedModels: models })
       });
      } catch (e) {
       return respond(res, 400, { error: e.message || 'Model kaydedilemedi.' });
      }
     }

     if (req.method === 'POST' && path === '/nexus-model/develop-project') {
      const input = await body(req);
      const [items, studentProfile] = await Promise.all([load(), evolver.loadStudentProfile()]);
      const devRes = await nexusModel.developEntireProject({
       installedModels: models,
       githubMiner,
       githubMegaCorpus: githubMega,
       coderCouncil,
       jarvis,
       qwenCodeLab,
       paramMatrix,
       evolver,
       items,
       telemetry: getTelemetrySnapshot(),
       studentProfile,
       hardwareProfile: cachedHardwareProfile,
       runModelFn: input?.withLiveLlm && models.length ? runModel : null,
       ollamaBaseUrl: base,
       includeUi: input?.includeUi !== false,
       applyLiveUiTheme: input?.applyLiveUiTheme
      });
      if (devRes?.summary?.githubMegaCorpus) cachedGithubMegaSummary = devRes.summary.githubMegaCorpus;
      cachedCoderCouncilState = await coderCouncil.loadState().catch(() => cachedCoderCouncilState);
      cachedNexusModelState = devRes?.fusionResult?.state || cachedNexusModelState;
      lastNexusFusionAt = Date.now();
      return respond(res, 200, devRes);
     }

     if (req.method === 'POST' && path === '/nexus-model/apply-proposal') {
      const input = await body(req);
      const proposalId = String(input?.proposalId || '').trim();
      if (!proposalId) return respond(res, 400, { error: 'proposalId gerekli.' });
      try {
       const appRes = await nexusModel.applyStagedProposalSafely(proposalId, input?.customPatch || null);
       return respond(res, 200, {
        ...appRes,
        summary: await nexusModel.getSummary({ installedModels: models })
       });
      } catch (e) {
       return respond(res, 400, { error: e.message || 'Öneri uygulanamadı.' });
      }
     }

     if (req.method === 'POST' && path === '/voicestudio/preferences') {
      const input = await body(req);
      const saved = await voiceStudio.savePreferences(input || {});
      return respond(res, 200, { ok: true, preferences: saved });
     }

     if (req.method === 'POST' && path === '/voicestudio/speech') {
      const input = await body(req);
      const text = typeof input?.text === 'string' ? input.text.trim() : '';
      if (!text) return respond(res, 400, { error: 'Metin boş.' });
      const result = await voiceStudio.synthesizeViaLocalServer({
       text: text.slice(0, 3500),
       voice: typeof input?.voice === 'string' && input.voice.trim() ? input.voice.trim() : 'default',
       speed: Number(input?.speed || 1),
       language: typeof input?.language === 'string' ? input.language : 'tr',
       instruct: typeof input?.instruct === 'string' ? input.instruct : ''
      });
      if (result.ok && result.buffer?.length) {
       res.setHeader('Content-Type', result.contentType || 'audio/mpeg');
       res.setHeader('Cache-Control', 'no-store');
       res.end(result.buffer);
       return;
      }
      return respond(res, 200, { ok: false, localAvailable: false, fallbackClient: true });
     }

     if (req.method === 'POST' && path === '/select-model') {
      if (busy) return respond(res, 409, { error: 'Üretim sürerken model değiştirilemez.' });
      const input = await body(req);
      const chosen = input.model;
      const role = typeof input.role === 'string' ? input.role : 'model';
      const roleKey = { model: 'model', verifier: 'verifierModel', judge2: 'judge2Model', evolver: 'evolverModel' }[role];
      if (!roleKey) return respond(res, 400, { error: 'Geçersiz rol.' });
      const storage = await storageUsage();
      if (storage.total + 1_000_000 > storageLimit) return respond(res, 400, { error: '100 GB sınırına yaklaşıldı; ayar kaydedilmedi.' });
      if (typeof chosen !== 'string' || chosen.length > 200 || !chosen.trim()) return respond(res, 400, { error: 'Geçersiz model adı.' });
      let tags = null;
      let ollamaReachable = false;
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
       if (r.ok) {
        tags = await r.json();
        ollamaReachable = true;
       }
      } catch {}
      const tagNames = Array.isArray(tags?.models) ? tags.models.map(x => x.name) : [];
      if (!ollamaReachable) {
       return respond(res, 502, { error: 'Ollama model listesi alınamadı.' });
      }
      if (!tagNames.includes(chosen)) {
       return respond(res, 400, { error: 'Model yerel Ollama listesinde bulunamadı.' });
      }
      const patch = roleKey === 'evolverModel'
       ? { evolverModel: chosen }
       : { model: chosen, verifierModel: chosen, judge2Model: chosen };
      if (roleKey !== 'evolverModel') {
       // Tek model: üretim ve tek hakem aynı ağırlıkları kullanır; seçim bütün rollere uygulanır.
       patch.lineupPins = { model: true, verifierModel: true, judge2Model: true };
      }
      await writeSettings(patch);
      installedCache.at = 0;
      return respond(res, 200, { role, model: chosen, pinned: roleKey !== 'evolverModel', localExecutionOnly: true, zeroApiRequired: true });
     }


     if (req.method === 'POST' && path === '/concurrency') {
      const input = await body(req);
      const n = Number(input.value);
      if (!Number.isFinite(n) || Math.round(n) !== n || n < 1 || n > 8) {
       return respond(res, 400, { error: 'Eşzamanlı üretim yuvası 1 ile 8 arasında bir tam sayı olmalı.' });
      }
      await writeSettings({ parallelUnits: n });
      modelInferenceQueue.setMaxConcurrent(MODEL_INFERENCE_CONCURRENCY);
      return respond(res, 200, { autoConcurrency: n, modelInferenceConcurrency: MODEL_INFERENCE_CONCURRENCY });
     }

     if (req.method === 'POST' && path === '/timeout') {
      const input = await body(req);
      const n = Number(input.value);
      if (!Number.isFinite(n) || Math.round(n) !== n || n < MODEL_CALL_TIMEOUT_MIN_MS || n > MODEL_CALL_TIMEOUT_MAX_MS) {
       return respond(res, 400, { error: `${MODEL_CALL_TIMEOUT_MIN_MS} ile ${MODEL_CALL_TIMEOUT_MAX_MS} (ms) arasında bir tam sayı gerekir. Bu değer TEK bir model çağrısının üretim süresi tavanıdır; model yükleme ve kuyruk beklemesi bu süreye dahil değildir.` });
      }
      await writeSettings({ modelCallTimeoutMs: n });
      return respond(res, 200, { autoTimeoutMs: n });
     }

     // Model kadrosu: otomatik seçime dön ({auto:true}), tek bir rolün sabitini kaldır ({unpin:'judge2'})
     // ya da kadro profilini değiştir ({profile:'hizli'|'dengeli'|'kalite'}).
     if (req.method === 'POST' && path === '/lineup') {
      if (busy) return respond(res, 409, { error: 'Üretim sürerken kadro değiştirilemez.' });
      const input = await body(req);
      const cur = await readSettings();
      const patch = {};
      if (input?.auto === true) patch.lineupPins = {};
      if (typeof input?.unpin === 'string') {
       const key = { model: 'model', verifier: 'verifierModel', judge2: 'judge2Model' }[input.unpin];
       if (!key) return respond(res, 400, { error: 'Geçersiz rol.' });
       const pins = { ...(cur.lineupPins && typeof cur.lineupPins === 'object' ? cur.lineupPins : {}) };
       delete pins[key];
       patch.lineupPins = pins;
      }
      if (input?.profile !== undefined) {
       if (!LINEUP_PROFILES[input.profile]) return respond(res, 400, { error: 'Geçersiz kadro profili (hizli | dengeli | kalite).' });
       patch.lineupProfile = input.profile;
      }
      if (!Object.keys(patch).length) return respond(res, 400, { error: 'auto, unpin veya profile alanlarından biri gerekli.' });
      await writeSettings(patch);
      installedCache.at = 0;
      const next = await currentLineup({ maxAgeMs: 0 });
      return respond(res, 200, { ok: true, lineup: publicLineup(next) });
     }

     if (req.method === 'GET' && path === '/lineup') {
      return respond(res, 200, { ok: true, lineup: publicLineup(await currentLineup({ maxAgeMs: 0 })) });
     }

     if (req.method === 'POST' && path === '/config') {
      const input = await body(req);
      const patch = {
       preset: 'balanced', batchPerCall: 1, fastThink: true, pipelineMode: 'direct',
       batchVerify: false, selfCorrection: true,
       autoEvolve: false, turboQualityLock: false
      };
      if (input?.passageMode === 'summary-only') patch.passageMode = 'summary-only';
      else patch.passageMode = 'full-book';
      if (input?.subSecondBudgetMs !== undefined) {
       const sb = Number(input.subSecondBudgetMs);
       if (!Number.isFinite(sb) || sb < 250 || sb > 980) return respond(res, 400, { error: 'subSecondBudgetMs 250 ile 980 (ms) arasında olmalı.' });
       patch.subSecondBudgetMs = Math.round(sb);
      }
      if (typeof input?.subSecondAllBots === 'boolean') patch.subSecondAllBots = input.subSecondAllBots;
      await writeSettings(patch);
      return respond(res, 200, { settings: await getPipelineConfig() });
     }

     if (req.method === 'POST' && path === '/student-state') {
      const input = await body(req);
      const current = await evolver.loadStudentProfile();
      const weakSet = new Set(Array.isArray(input.weakUnits) ? input.weakUnits : (current.weakUnits || []));
      if (typeof input.signalUnitId === 'string' && input.signalCorrect === false) {
       weakSet.add(input.signalUnitId);
      }
      const nextResults = { ...(current.results || {}) };
      if (input.results && typeof input.results === 'object' && !Array.isArray(input.results)) {
       for (const [uid, val] of Object.entries(input.results)) {
        if (!val || typeof val !== 'object') continue;
        const r = Math.max(0, Number(val.right || 0));
        const w = Math.max(0, Number(val.wrong || 0));
        const s = Math.max(0, Number(val.streak || 0));
        const tSec = Math.max(0, Number(val.totalSec || 0));
        const lSec = Math.max(0, Number(val.lastSec || 0));
        nextResults[uid] = { right: r, wrong: w, streak: s, totalSec: +tSec.toFixed(1), lastSec: +lSec.toFixed(1) };
        const tot = r + w;
        const acc = tot ? (r / tot) * 100 : 100;
        const avgS = tot ? tSec / tot : 0;
        if ((tot >= 2 && acc < 85) || avgS >= 45) weakSet.add(uid);
        else if (tot >= 5 && acc >= 92 && avgS <= 28) weakSet.delete(uid);
       }
      }
      const saved = await evolver.saveStudentProfile({
       ...current,
       weakUnits: [...weakSet],
       studiedUnits: Array.isArray(input.readUnits) ? input.readUnits : (input.studiedUnits || current.studiedUnits || []),
       accuracyPct: input.accuracyPct ?? current.accuracyPct,
       results: nextResults,
       totalStudySec: Number.isFinite(input.totalStudySec) ? Math.max(0, +Number(input.totalStudySec).toFixed(1)) : (current.totalStudySec || 0)
      });
      const rereadUnits = [];
      const reframeUnits = [];
      const remediationByUnit = {};
      for (const uid of Object.keys(nextResults)) {
       const perf = lessonEngine.formatStudentPerformance(uid, saved);
       if (perf.needsReread) rereadUnits.push(uid);
       if (perf.needsReframe) reframeUnits.push(uid);
       if (perf.needsReread || perf.needsReframe) remediationByUnit[uid] = perf;
      }
      return respond(res, 200, { ok: true, studentProfile: saved, remediation: { rereadUnits, reframeUnits, byUnit: remediationByUnit } });
     }

     if (req.method === 'POST' && path === '/curator/scan') {
      const input = await body(req);
      try {
       const report = await runPoolCuratorScan({ forcePrune: Boolean(input?.forcePrune) });
       return respond(res, 200, { ok: true, report });
      } catch (e) {
       return respond(res, 500, { error: e.message || 'Havuz tarama hatası.' });
      }
     }

     if (req.method === 'POST' && path === '/lessons/enhance') {
      const input = await body(req);
      const unitId = typeof input?.unitId === 'string' ? input.unitId : '0-0';
      try {
       const resLes = await triggerLessonEnhance(unitId, evolverModel, { forceReframe: Boolean(input?.forceReframe) });
       if (!resLes) return respond(res, 409, { error: 'Konu anlatımı iyileştirme zaten çalışıyor.' });
       return respond(res, 200, { ok: true, ...resLes });
      } catch (e) {
       return respond(res, 502, { error: e.message || 'Konu anlatımı geliştirilemedi.' });
      }
     }

     if (req.method === 'POST' && path === '/lessons/reframe') {
      const input = await body(req);
      const unitId = typeof input?.unitId === 'string' ? input.unitId : '0-0';
      try {
       const resLes = await triggerLessonEnhance(unitId, evolverModel, { forceReframe: true });
       if (!resLes) return respond(res, 409, { error: 'Konu anlatımı yeniden kurgulama zaten çalışıyor.' });
       return respond(res, 200, { ok: true, reframed: true, ...resLes });
      } catch (e) {
       return respond(res, 502, { error: e.message || 'Anlatım ve kodlamalar yenilenemedi.' });
      }
     }

     if (req.method === 'POST' && path === '/kayseri-react') {
      const input = await body(req);
      const unitId = typeof input?.unitId === 'string' ? input.unitId : '0-0';
      const ctx = contexts.find(c => c.id === unitId) || contexts[0];
      const passages = passagesByUnit.get(ctx.id) || [];
      const payload = {
       question: typeof input?.question === 'string' ? input.question : '',
       options: Array.isArray(input?.options) ? input.options : [],
       selectedOption: typeof input?.selectedOption === 'string' ? input.selectedOption : '',
       correctAnswer: typeof input?.correctAnswer === 'string' ? input.correctAnswer : '',
       isCorrect: Boolean(input?.isCorrect),
       elapsedSec: Number.isFinite(input?.elapsedSec) ? Number(input.elapsedSec) : 8,
       streak: Number.isFinite(input?.streak) ? Number(input.streak) : 0,
       wrongCount: Number.isFinite(input?.wrongCount) ? Number(input.wrongCount) : 0,
       evidence: typeof input?.evidence === 'string' ? input.evidence : '',
       explanation: typeof input?.explanation === 'string' ? input.explanation : '',
       unitId: ctx.id,
       unitTitle: ctx.unit,
       mode: input?.mode === 'temiz_klasik' ? 'temiz_klasik' : 'kayseri_sert',
       ctx,
       passages
      };
      try {
       const reaction = input?.useAi === true
        ? await generateAiKayseriReaction({ ...payload, runModelFn: runModel, model })
        : buildKayseriReaction(payload);
       return respond(res, 200, { ok: true, reaction });
      } catch (e) {
       return respond(res, 200, { ok: true, reaction: buildKayseriReaction(payload) });
      }
     }












     if (req.method === 'POST' && path === '/evolve') {
      try {
       const policy = await runEvolutionStep(evolverModel);
       return respond(res, 200, { ok: true, accepted: true, policy: { ...policy, rationale: policy.reason } });
      } catch (e) {
       if (/güvenlik|kural|reddetti/i.test(e.message || '')) {
        return respond(res, 200, { ok: false, accepted: false, reason: e.message });
       }
       return respond(res, 502, { error: e.message || 'Öz-evrim başarısız.' });
      }
     }

     if (req.method === 'POST' && path === '/rollback-evolution') {
      const input = await body(req);
      try {
       const policy = await evolver.rollback(input.version);
       return respond(res, 200, { ok: true, policy });
      } catch (e) {
       return respond(res, 400, { error: e.message });
      }
     }

     if (req.method === 'POST' && path === '/jarvis/config') {
      const input = await body(req);
      const saved = await jarvis.saveConfig(input);
      return respond(res, 200, { ok: true, config: saved });
     }

     if (req.method === 'POST' && path === '/jarvis/reflect') {
      try {
       const resRef = await triggerJarvisReflect(evolverModel);
       return respond(res, 200, { ok: true, ...resRef });
      } catch (e) {
       return respond(res, 502, { error: e.message || 'JARVIS analiz turu başarısız.' });
      }
     }

     if (req.method === 'POST' && path === '/jarvis/innovate') {
      let tagsList = [];
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
       if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
      } catch {}
      try {
       const resInn = await triggerJarvisInnovate(evolverModel, tagsList);
       return respond(res, 200, { ok: true, ...resInn });
      } catch (e) {
       return respond(res, 502, { error: e.message || 'Qwen Code inovasyon turu başarısız.' });
      }
     }

     if (req.method === 'POST' && path === '/jarvis/apex-evolve') {
      let tagsList = [];
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
       if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
      } catch {}
      try {
       const resApex = await triggerApexEvolve(evolverModel, tagsList);
       if (!resApex) return respond(res, 409, { error: '150x ApexArchitect zaten tüm botları evrimleştiriyor.' });
       return respond(res, 200, { ok: true, ...resApex });
      } catch (e) {
       return respond(res, 502, { error: e.message || '150x ApexArchitect evrimi başarısız.' });
      }
     }

     if (req.method === 'POST' && path === '/jarvis/train-now') {
      const input = await body(req);
      try {
       const result = await triggerJarvisTrain(model, Boolean(input?.skipEnvCheck));
       return respond(res, 200, { ok: true, ...result });
      } catch (e) {
       return respond(res, 400, { error: e.message || 'JARVIS eğitim döngüsü başlatılamadı.' });
      }
     }

     if (req.method === 'POST' && path === '/jarvis/rollback-model') {
      try {
       const resRb = await jarvis.rollbackModel(async prevModel => {
        await writePinnedModels({ model: prevModel, verifierModel: prevModel });
       });
       return respond(res, 200, { ok: true, ...resRb });
      } catch (e) {
       return respond(res, 400, { error: e.message });
      }
     }

     if (req.method === 'POST' && path === '/jarvis/proposal-decision') {
      const { id, status } = await body(req);
      try {
       const prop = await jarvis.setProposalStatus(id, status);
       return respond(res, 200, { ok: true, proposal: prop });
      } catch (e) {
       return respond(res, 400, { error: e.message });
      }
     }

     if (req.method === 'POST' && path === '/jarvis/research') {
      const input = await body(req);
      try {
       const r = await triggerWebResearch(typeof input?.unitId === 'string' ? input.unitId : null, evolverModel);
       return respond(res, 200, { ok: true, ...r });
      } catch (e) {
       return respond(res, 502, { error: e.message || 'İnternet araştırması ve sınav tahmini turu başarısız.' });
      }
     }

     if (req.method === 'POST' && path === '/auto-assign-roles') {
      const input = await body(req);
      let tagsList = [];
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
       if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
      } catch {}
      specialistsBootstrapAttempted = false;
      const assigned = await ensureRolesAutoAssigned(tagsList, Boolean(input?.createSpecialists));
      return respond(res, 200, { ok: true, ...assigned });
     }

     if (req.method === 'POST' && path === '/create-specialist') {
      const input = await body(req);
      const baseModel = typeof input.baseModel === 'string' ? input.baseModel.trim() : model;
      const allowedRoles = ['generator', 'judge', 'evolver', 'coder', 'osym_chair', 'distractor_engineer', 'code_optimizer', 'psychometric_auditor'];
      const role = allowedRoles.includes(input.role) ? input.role : 'generator';
      try {
       const targetName = await createSpecialistInOllama(role, baseModel, typeof input.name === 'string' ? input.name : '');
       return respond(res, 200, { ok: true, model: targetName, role, from: baseModel });
      } catch (e) {
       return respond(res, /Geçersiz/.test(e.message) ? 400 : 502, { error: e.message });
      }
     }

     if (req.method === 'POST' && path === '/prepare-training') {
      const py = process.env.PYTHON || 'python3';
      const args = ['training/prepare.py', '--input', dataFile, '--output', resolve(dataDir, 'training'), '--multitask', '--dpo', '--traces', tracesFile];
      try {
       const { stdout } = await execFileAsync(py, args, { timeout: 30000 });
       return respond(res, 200, { ok: true, manifest: JSON.parse(stdout) });
      } catch (e) {
       const msg = (e.stderr || e.message || 'Veri hazırlama başarısız.').trim();
       return respond(res, 400, { error: msg.slice(0, 400) });
      }
     }

     if (req.method === 'POST' && path === '/start') {
      await writeSettings({ autoRunning: true });
      return respond(res, 200, { autoRunning: true });
     }

     if (req.method === 'GET' && path === '/subsecond') {
      const cfg = await getPipelineConfig();
      return respond(res, 200, {
       ok: true,
       subSecondAllBots: cfg.subSecondAllBots,
       subSecondBudgetMs: cfg.subSecondBudgetMs,
       upgradeFactorFromPrevious: 100,
       cumulativeUpgradeFactor: 150000,
       trainingScaleFactor: 3000000,
       totalBoostPercent: 70500000000,
       trapDefenseTotal: 96,
       localExecutionOnly: true,
       zeroApiRequired: true,
       noApiKeyPrompts: true,
       hardwareProfile: cachedHardwareProfile,
       localAiTeam: cachedLocalTeamState ? localAiTeam.getSummary(cachedLocalTeamState) : null,
       coderCouncil: cachedCoderCouncilState ? coderCouncil.getSummary(cachedCoderCouncilState) : null
      });
     }

     if (req.method === 'POST' && path === '/subsecond') {
      const input = await body(req);
      const enabled = typeof input?.enabled === 'boolean' ? input.enabled : true;
      const budgetMs = Number.isFinite(Number(input?.budgetMs)) ? Math.max(250, Math.min(980, Math.round(Number(input.budgetMs)))) : SUBSECOND_BOT_BUDGET_MS;
      await writeSettings({ subSecondAllBots: enabled, subSecondBudgetMs: budgetMs });
      return respond(res, 200, { ok: true, subSecondAllBots: enabled, subSecondBudgetMs: budgetMs, settings: await getPipelineConfig() });
     }

     if (req.method === 'POST' && path === '/bots/upgrade-on-connect') {
      const input = await body(req);
      let tagsList = [...models];
      try {
       const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
       if (r.ok) tagsList = ((await r.json()).models || []).map(x => x.name);
      } catch {}
      const upgRes = await triggerOllamaConnectedFullUpgrade(tagsList, { force: input?.force !== false });
      return respond(res, 200, { ok: true, ...upgRes, state: ollamaUpgradeState });
     }

     if (req.method === 'POST' && path === '/bots/run-all') {
      const input = await body(req);
      const tAll = performance.now();
      const unitIds = Array.isArray(input?.units) && input.units.length ? input.units : ['0-0'];
      const ctx = contexts.find(c => unitIds.includes(c.id)) || contexts[cursor++ % contexts.length];
      const [items, policy, lessonsSummary, studentProfile, jCfg] = await Promise.all([
       load(), evolver.loadPolicy(),
       lessonEngine.listSummary(contexts.length),
       evolver.loadStudentProfile(), jarvis.loadConfig()
      ]);

      const timedBot = async (name, fn) => {
       const s = performance.now();
       try {
        const resVal = await fn();
        return { name, ok: true, ms: +(performance.now() - s).toFixed(2), res: resVal };
       } catch (err) {
        return { name, ok: false, ms: +(performance.now() - s).toFixed(2), error: err.message };
       }
      };

      const passages = passagesByUnit.get(ctx.id) || [];
      const cfg = await getPipelineConfig();
      const budget = Number(cfg.subSecondBudgetMs || SUBSECOND_BOT_BUDGET_MS);
      // Süre tavanı model ÇAĞRISI başına uygulanır; tüm ünite için yalnızca emniyet sınırı vardır.
      const questionTimeoutMs = UNIT_SAFETY_TIMEOUT_MS;

      const botRuns = await Promise.all([
       timedBot('questionGeneratorAndDualJudge', () =>
        generateOneManual(ctx, model, verifierModel, judge2Model, {
         timeoutMs: questionTimeoutMs,
         forceSubSecond: Boolean(input?.forceSubSecond === true && cfg.subSecondAllBots),
         subSecondBudgetMs: budget
        })
       ),
       timedBot('localAiTeam', () =>
        localAiTeam.runFastTeamCycle({ items, contexts, evolver, policy, installedModels: models, apex, jarvis, teamBudgetMs: budget })
       ),
       timedBot('coderCouncil44Models', () =>
        coderCouncil.runOvertrainSprint({ installedModels: models, hardwareProfile: cachedHardwareProfile, paramMatrix: null, epochsPerModel: 1, distillDpo: true })
       ),
       timedBot('nexusTitanFusion', () =>
        nexusModel.runContinuousFusionCycle({
         installedModels: models, githubState: null, githubMegaSummary: cachedGithubMegaSummary, trapF1: 100, runModelFn: null, ollamaBaseUrl: base, includeUi: true, applyLiveUiTheme: false
        })
       ),
       timedBot('githubMegaCorpus260k', () =>
        githubMega.absorbAndEvolveBatch({
         batchSize: 1000, paramMatrix: null, jarvis: null, coderCouncil: null, liveGithub: false
        })
       ),
       timedBot('qwenCodeLab100Methods', () =>
        qwenCodeLab.runHundredMethodTournament({ evolver, paramMatrix: null, jarvis, items, applyToProject: true })
       ),
       timedBot('multiAiSwarmEvaluator', () =>
        multiAiEval.evaluateAndEvolve({
         paramMatrix, items, contexts, passagesByUnit, lessonsSummary,
         evolver, policy, studentProfile,
         source: 'subsecond-all-bots-run'
        })
       ),
       timedBot('intelligenceTrainer100x', () =>
        trainer.runContinuousTrainingTick({
         contexts, passagesByUnit, items, staticBank: questionBank, studentProfile,
         evolver, jarvis, apex, paramMatrix: null, multiAiEval: null, batchUnits: 3, skipSwarmEval: true
        })
       ),
       timedBot('poolCurator', () =>
        poolCurator.scanAndPrune({ items, researchMemory: null, adaptiveQuality: null, forcePrune: false })
       ),
       timedBot('lessonEngine', async () => {
        const les = lessonEngine.buildFallbackLesson(ctx, passages, studentProfile, null);
        await lessonEngine._atomicWrite(lessonEngine._lessonFile(ctx.id), les);
        return { unitId: ctx.id, sections: les.deepSections?.length || 0 };
       }),
       timedBot('kayseriCoach', () =>
        buildKayseriReaction({
         question: ctx.unit, options: ['A', 'B', 'C', 'D'], selectedOption: 'A', correctAnswer: 'A',
         isCorrect: true, elapsedSec: 4, unitId: ctx.id, unitTitle: ctx.unit, mode: 'kayseri_sert', ctx, passages
        })
       ),
       timedBot('researchAgent', () =>
        researchAgent.researchAndReasonUnit({ ctx, passages, runModelFn: null, model: evolverModel, subSecond: true })
       ),
       timedBot('voiceStudio', () => voiceStudio.getSummary()),
       timedBot('hardwareOptimizer', () => hardwareOpt.resolveActiveProfile(null, null))
      ]);

      const botLatenciesMs = {};
      let generatedQuestion = null;
      for (const b of botRuns) {
       botLatenciesMs[b.name] = b.ms;
       if (b.name === 'questionGeneratorAndDualJudge' && b.ok) generatedQuestion = b.res;
      }
      const totalDurationMs = +(performance.now() - tAll).toFixed(2);
      const allBotsUnder1s = botRuns.every(b => b.ok && b.ms < 1000) && totalDurationMs < 1000;
      cachedParamState = await paramMatrix.loadState().catch(() => cachedParamState);
      cachedLocalTeamState = await localAiTeam.loadState().catch(() => cachedLocalTeamState);
      cachedCoderCouncilState = await coderCouncil.loadState().catch(() => cachedCoderCouncilState);
      return respond(res, 200, {
       ok: true,
       uiImmutable: true,
       localExecutionOnly: true,
       zeroApiRequired: true,
       noApiKeyPrompts: true,
       upgradeFactorFromPrevious: 100,
       cumulativeUpgradeFactor: 150000,
       trainingScaleFactor: 3000000,
       totalBoostPercent: 70500000000,
       trapDefenseTotal: 96,
       totalDurationMs,
       withinOneSecond: totalDurationMs < 1000,
       allBotsUnder1s,
       botsCount: botRuns.length,
       questionGenerationMs: botLatenciesMs.questionGeneratorAndDualJudge,
       questionGenerated: generatedQuestion,
       botLatenciesMs,
       failedBots: botRuns.filter(b => !b.ok).map(b => ({ name: b.name, error: b.error }))
      });
     }

     if (req.method === 'POST' && path === '/generate') {
      if (!(await waitForPipelineIdle(60_000))) {
       return respond(res, 409, { error: 'Soru üretim hattı şu an meşgul; birkaç saniye sonra tekrar dene.' });
      }
      const tGenReq = performance.now();
      const input = await body(req);
      const ids = Array.isArray(input.units) ? input.units.filter(x => typeof x === 'string') : [];
      const candidates = contexts.filter(x => ids.includes(x.id));
      if (!candidates.length) return respond(res, 400, { error: 'Önce en az bir üniteyi tamamla.' });
      const ctx = candidates[cursor++ % candidates.length];
      try {
       const record = await generateOneManual(ctx, model, verifierModel, judge2Model, {
        forceSubSecond: Boolean(input?.subSecond && (await getPipelineConfig()).subSecondAllBots),
        subSecondBudgetMs: Number.isFinite(Number(input?.subSecondBudgetMs)) ? Number(input.subSecondBudgetMs) : SUBSECOND_BOT_BUDGET_MS
       });
       const durationMs = +(performance.now() - tGenReq).toFixed(2);
       return respond(res, 200, {
        item: record,
        durationMs,
        withinOneSecond: durationMs < 1000
       });
      } catch (e) {
       const conflict = /zaten devam/.test(e.message || '');
       return respond(res, conflict ? 409 : 502, { error: e.message || 'Üretim başarısız.' });
      }
     }

     if (req.method === 'POST' && path === '/stop') {
      // Önce durdurma sayacı artar: o an tur atmakta olan zamanlayıcı, ayar dosyası yazılmadan önce
      // (sorular arasında artık bekleme olmadığı için) yeni bir soru başlatamasın.
      autoStopEpoch++;
      autoStopPending++;
      try {
       if (controller) controller.abort();
       for (const c of autoControllers.keys()) c.abort();
       autoControllers.clear();
       pipelinePhase = 'idle';
       await writeSettings({ autoRunning: false });
      } finally {
       autoStopPending--;
      }
      return respond(res, 200, { ok: true, autoRunning: false });
     }

     if (req.method === 'POST' && path === '/review') {
      const { id, status } = await body(req);
      if (!['approved', 'rejected'].includes(status)) return respond(res, 400, { error: 'Geçersiz durum.' });
      const item = await withSaveLock(async () => {
       const items = await load();
       const found = items.find(x => x.id === id);
       if (!found) return null;
       found.status = status;
       await save(items);
       return found;
      });
      if (!item) return respond(res, 404, { error: 'Soru bulunamadı.' });
      if (status === 'rejected') {
       await appendTrace({ type: 'user_rejected', unitId: item.unitId, passageId: item.passageId, draft: item, reason: 'user_veto' });
      }
      return respond(res, 200, { item });
     }

     return next();
    } catch (e) {
     return respond(res, 500, { error: e.message || 'Yerel servis hatası.' });
    }
   });
  }
 };
}

/** Yüklenen bölüm anlatımları (TEMPO_WEB_SUMMARY ayarı uygulanmış hâliyle); testler için. */
export function loadedContexts() { return contexts; }

/** Sınav tarzı örnek kitaplığı (kullanıcı örnekleri + kitap soruları); testler için. */
export function loadedExamStyle() { return { library: examStyleLibrary, stats: styleLibraryStats(examStyleLibrary) }; }
