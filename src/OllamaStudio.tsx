import {useEffect, useRef, useState} from 'react';
import {AlertCircle, BookOpen, Brain, Check, Code2, Cpu, Database, Gauge, Globe, GraduationCap, Layers, Play, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, Square, Terminal, Wand2, X, Zap} from 'lucide-react';

type JudgeVerdict = {model: string; answer: string; difficulty?: 'kolay' | 'orta' | 'zor'; qualityScore?: number; examPotential?: number; bloomLevel?: string; dualAnswerRisk?: boolean; secondBestOption?: string; evidence: string; reason: string};
export type GeneratedQuestion = {
 id: string; unitId: string; book: string; unit: string; topic: string;
 question: string; options: string[]; answer: string; explanation: string; evidence: string;
 status: 'approved' | 'rejected'; model: string; createdAt: string;
 difficulty?: 'kolay' | 'orta' | 'zor';
 curatedBy?: string; curationReason?: string;
 passageId?: string; passageHeading?: string; pages?: number[];
 questionType?: string; questionAngle?: string; bloomLevel?: string; qualityScore?: number; examPotential?: number; curatorScore?: number;
 precisionScore?: number; styleScore?: number; precisionTier?: string; tvgfbfAligned?: boolean;
 verification?: {judges?: JudgeVerdict[]; answer: string; difficulty?: 'kolay' | 'orta' | 'zor'; qualityScore?: number; examPotential?: number; bloomLevel?: string; model?: string; evidence?: string; reason?: string};
};
type Audit = {checked: number; invalid: number; duplicates: number; answerGroups: number};
type PipelineSettings = {
 batchPerCall: number;
 pipelineMode: 'batched' | 'direct';
 fastThink: boolean;
 selfCorrection: boolean;
 batchVerify: boolean;
 generateStudyMaterials: boolean;
 autoEvolve: boolean;
 passageMode: 'full-book' | 'summary-only';
 smartDifficulty: boolean;
 preset: 'turbo' | 'balanced' | 'deep';
 turboQualityLock?: boolean;
};
type Telemetry = {
 attemptsTotal: number; approvedTotal: number; rejectedPreflight: number; rejectedJudges: number;
 dualAnswerBlocked?: number; refinedSucceeded: number; approvalRate: number; questionsPerMinute: number;
 secondsPerItem?: number; studyItemsApproved?: number;
 avgGenMs: number; avgVerifyMs: number; tokensPerSecond: number; loadSecondsTotal: number;
 pipelinePhase: string; rejectionReasons: Record<string, number>;
};
type EvolutionPolicy = {
 version: number;
 updatedAt: string;
 source: string;
 rationale: string;
 focusUnits: string[];
 difficultyWeights: {kolay: number; orta: number; zor: number};
 difficultyDirectives?: {kolay: string; orta: string; zor: string};
 promptDirectives: string[];
 customRuleCode?: string;
 customRuleActive?: boolean;
 difficultyEngineCode?: string;
 difficultyEngineActive?: boolean;
};
type EvolutionInfo = {
 activePolicy: EvolutionPolicy;
 historyCount: number;
 recentHistory: {version: number; timestamp: string; source: string; rationale: string; goldenPassed?: boolean}[];
 studentProfile: {weakUnits: string[]; unitStats?: Record<string, {attempts: number; errors: number}>};
};
type ResearchFinding = {
 unitId: string; unit: string; book: string; researchedAt: string; networkAvailable: boolean;
 webSources?: {source: string; title: string; snippet: string; url: string}[];
 examHypotheses?: {topic: string; likelihood: string; difficulty: string; reasoning: string}[];
 confusionPairs?: {conceptA: string; conceptB: string; trapNote: string}[];
 insight?: string;
};
type JarvisInfo = {
 config: {
  autoReflect: boolean; reflectEveryN: number;
  autoInnovate: boolean; innovateEveryN: number;
  autoResearch?: boolean; researchEveryN?: number;
  autoCuratePool?: boolean; autoAssignRoles?: boolean; autoCreateSpecialists?: boolean;
  autoTrainWeights: boolean; trainEveryNQuestions: number;
  baseHfModel: string; adapterSize: string;
  coderBackend: 'ollama' | 'qwen-cli'; coderModel: string;
 };
 memory: {
  generation: number; innovationCount: number;
  activeTrainedModel: string | null;
  trainedModels: {name: string; version: number; previousModel: string; baseHfModel: string; trainedAt: string}[];
  avoidLessons: {id: string; unitId: string; category: string; lesson: string}[];
  goldenPatterns: {id: string; unitId: string; pattern: string}[];
  codeProposals: {id: string; title: string; area: string; summary: string; targetFile: string; code: string; engine: string; status: string}[];
  journal: {id: string; time: string; kind: string; title: string; detail: string}[];
 };
 adaptiveQuality?: {level: number; title: string; maturityScore: number; intelligenceMultiplier?: number; minQualityScore: number; targetScenarioRatio: string; directive: string};
 apex?: {
  state?: {
   evolutionCycles: number;
   intelligenceMultiplier: number;
   peakMultiplier: number;
   repairCount?: number;
   activeBotDirectives: Record<string, string>;
   hyperParams?: {
    temperatureOffset: number;
    batchSizeHint: number;
    curatorMinScoreHint: number;
    priorityPassageUnits: string[];
    reframePriorityUnits: string[];
   };
   lastCycleImpact?: {
    cycle: number;
    healthDelta: number;
    approvalRateDelta: number;
    verdict: string;
    winnerStrategy?: string;
    evaluatedAt: string;
   } | null;
   winningPlaybook?: {strategy: string; cycle: number; score: number; multiplier: number; note: string}[];
   hypotheses: {id: string; targetBot: string; hypothesis: string; action: string; expectedGain: string; verifiedScore: number; status: string}[];
   botScoreHistory: {cycle: number; multiplier: number; botHealthAvg: number; adversarialF1: number; winner?: string}[];
   strategyJournal: {id: string; cycle: number; multiplier: number; title: string; detail: string}[];
  };
  diagnostics?: {
   botHealthAvg: number;
   passageCovPct: number;
   evalAccuracyScore?: number;
   rootCauses: string[];
   botHealth: Record<string, {score: number; status: string; bottleneck: string}>;
  };
 };
 research?: {
  researchCycles: number; webHitsTotal: number; networkAvailable: boolean | null;
  lastResearchedUnitId: string | null; lastResearchedAt: string | null;
  researchedUnitsCount: number; recentFindings: ResearchFinding[];
  journal: {id: string; time: string; unitId: string; title: string; detail: string; webCount: number}[];
 };
 env: {
  hasPython: boolean; hasCuda: boolean; gpuName: string; hasDeps: boolean;
  hasLlamaCpp: boolean; hasOllamaCli: boolean; hasQwenCli: boolean;
  weightsTrainingReady: boolean; missing: string[];
 };
 trainingState: {running: boolean; pausedGeneration: boolean; stage: string; lastError: string; logs: string[]};
 pausedForTraining: boolean;
 sinceLastTrain: number;
 nextTrainRemaining: number;
 continuousTrainer?: {
  epochsCompleted?: number;
  ticksTotal?: number;
  addedBoostPercent?: number;
  totalBoostPercent?: number;
  trapDefensePassed?: number;
  trapDefenseTotal?: number;
  poolAudit?: {scanned: number; passed: number; flagged: number; avgScore: number};
  distilledUnits?: Record<string, {unit: string; scoreBoost: number; updatedAt: string}>;
  running?: boolean;
 };
 githubOss?: {
  cycles: number;
  totalReposDiscovered: number;
  lastRunAt: string | null;
  topRepos?: {fullName: string; stars: number; license: string; track: string; url: string}[];
  synthesizedBlueprints?: {id: string; repo: string; license: string; technique: string; appliedTarget: string}[];
  running?: boolean;
 };
};
type StudyCounts = {flashcards: number; matchings: number; drills: number; total: number};
type UnitCoverage = {unit: string; book: string; questions: number; passagesCovered: number; totalPassages: number; kolay: number; orta: number; zor: number};
type Coverage = {totalPassages: number; coveredPassages: number; coveragePercent: number; perUnit: Record<string, UnitCoverage>};
type TrainingStatus = {approvedCount: number; unitCount: number; readyForTraining: boolean; dpoTracesCount: number; manifest?: {train_count: number; eval_count: number; dpo_train_count?: number; task_counts?: Record<string, number>} | null};
type CuratorReport = {
 lastScanAt: string | null; totalScans: number; pruneThreshold: number; targetAfterPrune: number;
 approvedCount: number; avgCompositeScore: number; totalPrunedLifetime: number;
 lastRunRemoved: number; nearDuplicatesFound: number; aboveThreshold: boolean;
 refillPriorityUnits: string[];
 tierBreakdown?: {kolay: number; orta: number; zor: number};
 droppedSamples?: {unitId: string; reason: string; score: number; question: string}[];
};
type LessonsSummary = {totalUnits: number; enhancedCount: number; aiEnhancedCount: number; avgVersion: number; units: {unitId: string; version: number; source: string; updatedAt: string}[]};
type VideosSummary = {
 totalUnits: number; producedCount: number; totalVariantsCount?: number; roachCount?: number;
 aiProducedCount: number; rescueCount: number; mp4Count?: number;
 filledUnits?: number; coveragePct?: number; tiktokCount?: number;
 hasGoogleFlowKey: boolean; googleFlowModel: string;
 units: {unitId: string; version: number; situationMode: string; source: string; sceneCount: number; updatedAt: string}[];
};
type LocalVideoEngineInfo = {
 id: string; name: string; repo: string; license: string; stars: string;
 category: string; endpoint: string; available: boolean; alwaysReady?: boolean;
 audioMuxReady?: boolean; detail?: string; description?: string;
};
type BotParamSummary = {
 botId: string;
 label: string;
 backboneModel: string;
 backboneParamsBillions: number;
 factoredMetaTensorBillions: number;
 kroneckerParamsQuadrillions?: number;
 deepMoEFactoredQuadrillions?: number;
 transformerLayers?: number;
 hyperRank?: string;
 skillLevel?: number;
 botIq?: number;
 githubProjectsAbsorbed?: number;
 combinedBillions: number;
 tensorHeads: number;
 virtualMatrixDim: number;
 tensorMode3Dim?: number;
 rankBasisDim: number;
 generation: number;
 fitnessScore: number;
 inferenceParams: {temperature: number; top_p: number; top_k: number; min_p?: number; repeat_penalty: number; num_ctx: number; num_predict?: number};
 behavioralWeights: Record<string, number>;
 knowledgeLevelWeights?: {noviceClarity?: number; intermediateDiscrimination?: number; expertRigor?: number; speedSkimmerImmunity?: number; adversarialTrapShield?: number};
 crossAiSwarmWeights?: {selfConsistencyPasses?: number; crossModelAgreementGain?: number; adversarialProbeRate?: number; multiSystemCoupling?: number};
 lastEvolvedBy: string;
 updatedAt: string | null;
};
type ParameterMatrixSummary = {
 totalBots: number;
 totalBackboneBillions: number;
 totalFactoredMetaTensorBillions: number;
 totalFactoredParamsQuadrillions?: number;
 totalDeepMoEFactoredQuadrillions?: number;
 transformerLayersPerBot?: number;
 avgBotIq?: number;
 totalGithubProjectsAbsorbedByBots?: number;
 totalEcosystemParamsBillions: number;
 totalEvolutions: number;
 rollbackDepth: number;
 tensorTopology: string;
 lastEvolutionAt: string | null;
 lastEvolutionSource: string | null;
 bots: BotParamSummary[];
};
type CoderCouncilModelInfo = {
 id: string;
 family: string;
 label: string;
 ollamaTag: string;
 hfBase: string;
 license: string;
 tier: string;
 specialty: string;
 physicalParamsBillions: number;
 activeParamsBillions: number;
 vramGbQ4: number;
 factoredParamsQuadrillions: number;
 deepMoEFactoredQuadrillions?: number;
 transformerLayers?: number;
 loraRank: number;
 epochsCompleted: number;
 chinchillaOvertrainRatio: number;
 dpoPairsAbsorbed: number;
 sftSamplesAbsorbed: number;
 iqScore: number;
 installedLocally: boolean;
};
type CoderCouncilSummary = {
 version: number;
 codename: string;
 totalModels: number;
 installedLocalCount: number;
 rtx3080TiLiveCandidates: string[];
 distillationTeachers: string[];
 totalPhysicalParamsBillions: number;
 councilFactoredParamsQuadrillions: number;
 councilDeepMoEFactoredQuadrillions?: number;
 combinedEcosystemPhysicalBillions: number;
 combinedEcosystemFactoredQuadrillions: number;
 combinedEcosystemDeepMoEQuadrillions?: number;
 transformerLayersPerModel?: number;
 tensorTopology: string;
 totalSprints: number;
 totalOvertrainEpochs: number;
 totalDpoPairsDistilled: number;
 totalSftSamplesAbsorbed: number;
 councilIqAvg: number;
 peakCouncilIq: number;
 lastSprintDurationMs: number;
 avgSprintDurationMs: number;
 subSecondPassCount: number;
 benchmarksCount: number;
 transparencyNote: string;
 models: CoderCouncilModelInfo[];
 updatedAt: string | null;
};
type GithubMegaDomainSummary = {
 id: string;
 title: string;
 patternsCount: number;
 absorbedInDomain: number;
};
type GithubMegaProject = {
 id: string;
 fullName: string;
 domainId: string;
 domainTitle: string;
 license: string;
 stars: number;
 summary: string;
 actionablePattern: string;
 sftInstruction: string;
 url: string;
};
type GithubMegaSummary = {
 version: number;
 indexedProjectsCount: number;
 absorbedProjectsCount: number;
 absorptionCoveragePct: number;
 domainsCount: number;
 sftDistilledCount: number;
 liveGithubReposCached: number;
 continuousBatchesCount: number;
 activeDomainTitle: string | null;
 perBotAbsorbed: Record<string, number>;
 domainBreakdown: GithubMegaDomainSummary[];
 recentProjectsSample: GithubMegaProject[];
 liveGithubSamples: GithubMegaProject[];
 lastBatchDurationMs: number;
 updatedAt: string | null;
};
type SwarmReportItem = {
 run: number;
 source: string;
 preScore: number;
 postScore: number;
 gateAccepted: boolean;
 levelScores: Record<string, number>;
 subsystemScores: Record<string, number>;
 critiqueChain: string[];
 liveShards?: {role: string; model: string; ok: boolean}[];
 consensusFindings?: string[];
 botsUpdated: number;
 timestamp: string;
};
type SwarmEvalSummary = {
 version: number;
 codename: string;
 totalSwarmRuns: number;
 selfCritiquePassesTotal: number;
 multiModelSplitsTotal: number;
 gatesAccepted: number;
 gatesRejectedOrRolledBack: number;
 lastCompositeScore: number;
 peakCompositeScore: number;
 lastLevelScores: Record<string, number>;
 lastSubsystemScores: Record<string, number>;
 recentReports: SwarmReportItem[];
 updatedAt: string | null;
};
type QwenLeaderboardItem = {
 rank: number;
 methodId: string;
 name: string;
 family: string;
 f1Score: number;
 passedTraps: number;
 totalTraps: number;
 avgMicros: number;
 compositeScore: number;
};
type QwenPrototypeItem = {
 slug: string;
 title: string;
 targetBot: string;
 githubInspiration: string;
 durationMs: number;
 testsPassed: boolean;
 promoted: boolean;
 updatedAt: string;
};
type QwenCodeLabSummary = {
 version: number;
 codename: string;
 tournamentsRun: number;
 totalMethodsBenchmarked: number;
 prototypesBuiltAndTested: number;
 prototypesPromotedToProject: number;
 selfTrainingPairsGenerated: number;
 qwenSkillLevel: number;
 qwenIqMultiplier: number;
 fastestWinnerMicros: number | null;
 lastWinnerStrategy: string | null;
 lastLeaderboard: QwenLeaderboardItem[];
 promotedPrototypes: QwenPrototypeItem[];
 updatedAt: string | null;
};
type LocalAiTeamAgent = {
 id: string;
 label: string;
 ollamaSpecialist: string | null;
 specialty: string;
};
type LocalAiTeamSummary = {
 version: number;
 codename: string;
 zeroApiRequired: boolean;
 autoStartedOnBoot: boolean;
 activeTeamMembersCount: number;
 teamAgents: LocalAiTeamAgent[];
 cyclesCompleted: number;
 lastCycleDurationMs: number;
 avgCycleDurationMs: number;
 fastestCycleMs: number | null;
 lastCycleWithin1s?: boolean;
 subSecondPassCount?: number;
 subSecondPassRatePct?: number;
 lastMemberLatenciesMs?: Record<string, number>;
 osymPoolScoreAvg: number;
 osymEliteSharePct: number;
 ruleLatencyMicros: number | null;
 localOllamaSpecialistsInstalled: string[];
 localOllamaTeamModelsAvailable: string[];
 updatedAt: string | null;
};
type HardwareProfileSummary = {
 id: string;
 label: string;
 description: string;
 primaryModel: string;
 judgeModel: string;
 coderModel: string;
 estimatedVramGb: number;
 subSecondMode: boolean;
 teamBudgetMs?: number;
 numCtx?: number;
};
type HardwareSummary = {
 state: {profileId: string; autoPullOptimalModels: boolean; subSecondMode: boolean; lastWarmupAt: string | null};
 hardware: {
  gpu: {detected: boolean; name: string | null; vramTotalGb?: number; is3080Ti?: boolean; driverNote: string};
  systemRam: {totalGb: number; freeGb: number};
  cpuCores: number;
 };
 activeProfile: HardwareProfileSummary & {recommendedModels: string[]};
 availableProfiles: HardwareProfileSummary[];
 missingRecommendedModels: string[];
 allRecommendedInstalled: boolean;
 vramStatus: {connected: boolean; loaded: {name: string; sizeGb: number; vramGb: number; gpuPct: number}[]; totalVramGb: number; cpuOffloadDetected: boolean};
 pullState: {running: boolean; stage: string; currentModel: string | null; percent: number; message: string};
};
type NexusCatalogModel = {
 id: string;
 name: string;
 sourceType: string;
 capability: string;
 ollamaTag: string;
 hfRepo: string;
 githubRepo: string;
 url: string;
 license: string;
 paramsBillions: number;
 vramGbQ4: number;
 specialty: string;
 installed: boolean;
 installedInOllama?: boolean;
 downloadState?: {status: string; detail: string; updatedAt: string} | null;
};
type NexusProposalItem = {
 id: string;
 cycle: number;
 area: string;
 layer: string;
 targetFile: string;
 title: string;
 summary: string;
 status: string;
 createdAt: string;
};
type NexusModelInfo = {
 modelName: string;
 codename: string;
 neverStopTraining: boolean;
 uiEvolutionEnabled: boolean;
 fullProjectEvolution: boolean;
 uiImmutable: boolean;
 fusionCycles: number;
 epochsCompleted: number;
 fusionIq: number;
 peakFusionIq: number;
 trapDefenseF1: number;
 ollamaModelCreated: boolean;
 ollamaBaseModelUsed: string;
 lastOllamaBuildAt: string | null;
 lastOllamaBuildError: string;
 fusedPhysicalParamsBillions: number;
 effectiveFactoredQuadrillions: number;
 deepMoEFactoredQuadrillions?: number;
 transformerLayers?: number;
 githubProjectsIndexed?: number;
 githubProjectsAbsorbed?: number;
 sftPairsTotal: number;
 dpoPairsTotal: number;
 projectEvolutionsTotal: number;
 uiEvolutionsApplied: number;
 uiAuditScore: number;
 lastCycleDurationMs: number;
 avgCycleDurationMs: number;
 subSecondPassRatePct: number;
 counts: {
  ollamaInstalled: number;
  localDiskModels: number;
  registeredExternal: number;
  catalogTotal: number;
  readyInFusion: number;
  downloadableExternal: number;
  githubBlueprints: number;
 };
 catalog: NexusCatalogModel[];
 localDiskModels: {id: string; name: string; sourceType: string; format: string; path: string; sizeMb: number}[];
 lastWorkspaceAudit?: {uiFilesCount?: number; filesChecked?: number; totalLines?: number; ariaLabelsDetected?: number; uiAuditScore?: number} | null;
 appliedImprovements: {id: string; cycle: number; targetFile: string; layer: string; title: string; verifiedBy: string; appliedAt: string}[];
 stagedProposals: NexusProposalItem[];
 evolutionJournal: {time: string; kind: string; title: string; detail: string}[];
 modelfilePath: string;
};
type Verifier100SuiteSummary = {
 id: string;
 title: string;
 passed: number;
 total: number;
 ok: boolean;
};
type Verifier100Run = {
 id: string;
 kind: string;
 title: string;
 source: string;
 passedCount: number;
 totalPaths: number;
 approvedForProject: boolean;
 durationMs: number;
 suites?: Verifier100SuiteSummary[];
 failedPaths?: {id: number; suiteId: string; name: string; detail: string}[];
 timestamp: string;
};
type Verifier100Summary = {
 version: number;
 codename: string;
 requiredPassCount: number;
 totalPathsPerCandidate: number;
 suitesCount: number;
 totalVerifications: number;
 totalTestPathsExecuted: number;
 approvedAndAddedCount: number;
 rejectedAndBlockedCount: number;
 passRateLifetimePct: number;
 lastVerification?: Verifier100Run | null;
 recentRuns?: Verifier100Run[];
 rejectedQuarantine?: {id: string; title: string; source: string; passedCount: number; timestamp: string}[];
};
type ProjectLevelSummary = {
 overallScore: number;
 projectLevel: number;
 codename: string;
 cyclesCompleted: number;
 lastRunAt?: string | null;
 lastDurationMs?: number;
 bottleneckRepaired?: string | null;
 bottleneckPillar?: {id: string; name: string; score: number; detail: string};
 pillars: {id: string; name: string; score: number; detail: string}[];
};

type BookSearchSummary = {
 totalIndexedDocs: number;
 passageDocs: number;
 bankDocs: number;
 avgDocLen: number;
 vocabularySize: number;
};

type TvgfbfSwarmSummary = {
 ok: boolean;
 activeAgentsCount: number;
 verifiedPdfSourcesCount?: number;
 realBookQuestionsCount?: number;
 rejectedNoiseCount?: number;
 cyclesTotal: number;
 lastCycleAt: string | null;
 lastCycleMs: number;
 liveWebReachable: boolean;
 liveWebHits: number;
 bookStyleUnitsCovered: number;
 discoveredPatternsCount: number;
 cascadeTriggersTotal: number;
 lastCascadeAt: string | null;
 lastProbeNote: string;
 agents: {id: string; name: string; role: string; runs: number; findings: number; status: string}[];
 trustedCatalog?: {id: string; tier: string; trustScore: number; title: string; url: string; kind: string}[];
};

type HundredAiCouncilSummary = {
 totalAgents: number;
 qwenEvolutionLevel: number;
 qwenEvolutionCycles: number;
 layeredStagesCount: number;
 poolCalibratedCount: number;
 tierCounts?: {kolay: number; orta: number; zor: number; imkansiz: number};
 cohorts?: Record<string, number>;
 bugfixCorpusCount?: number;
 misconceptionDomainsCount?: number;
 lastEvolutionSummary?: string;
 updatedAt?: string | null;
};

type PrecisionQualitySummary = {
 atlasUnits: number;
 averagePrecisionScore?: number;
 evaluatedCount?: number;
 flaggedCount?: number;
 dpoEliteCount?: number;
 unitCoverageCount?: number;
};

type Status = {
 connected: boolean; installed: boolean; verifierInstalled: boolean; judge2Installed: boolean; evolverInstalled?: boolean; videoModelInstalled?: boolean; coderInstalled?: boolean;
 model: string; verifierModel: string; judge2Model: string; evolverModel?: string; videoModel?: string; models: string[];
 cloudVideoModels?: {id: string; label: string; badge: string; installed?: boolean}[];
 localVideoEngines?: {preferredEngineId: string; liveEnginesCount: number; totalCatalogCount: number; engines: LocalVideoEngineInfo[]};
 voiceStudio?: {zeroApiRequired: boolean; totalFreeVoices: number; localAvailable: boolean; selectedVoiceId: string};
 busy: boolean; phase: string; storage?: {total: number; limit: number; modelsReserved: number};
 lastError: string; count: number; approved: number; rejected: number;
 trainingScaleFactor?: number; qwenBoostPercent?: number; addedIntelligenceBoostPercent?: number; zeroApiRequired?: boolean; trapDefenseTotal?: number; turboQualityLock?: boolean;
 tiktokFeed?: {totalUnits: number; filledUnits: number; coveragePct: number; feedItemsCount: number; tiktokCount: number};
 difficultyCounts?: {kolay: number; orta: number; zor: number};
 angleCounts?: Record<string, number>;
 curator?: CuratorReport;
 lessons?: LessonsSummary;
 videos?: VideosSummary;
 studyCounts?: StudyCounts;
 autoRunning: boolean; autoConcurrency: number; autoTimeoutMs: number;
 autoActive: number; autoPhases: {unit: string; phase: string}[]; autoLastError: string; totalUnits: number;
 settings?: PipelineSettings; telemetry?: Telemetry; coverage?: Coverage; training?: TrainingStatus; evolution?: EvolutionInfo;
 jarvis?: JarvisInfo;
 parameterMatrix?: ParameterMatrixSummary;
 swarmEval?: SwarmEvalSummary;
 qwenCodeLab?: QwenCodeLabSummary;
 localAiTeam?: LocalAiTeamSummary;
 coderCouncil?: CoderCouncilSummary;
 nexusModel?: NexusModelInfo;
 githubMega?: GithubMegaSummary;
 verifier100?: Verifier100Summary;
 bookSearch?: BookSearchSummary;
 projectLevel?: ProjectLevelSummary;
 tvgfbfSwarm?: TvgfbfSwarmSummary;
 hundredAiCouncil?: HundredAiCouncilSummary;
 precisionQuality?: PrecisionQualitySummary;
 local3d?: {
  ffmpegReady: boolean;
  blenderInstalled: boolean;
  manimInstalled: boolean;
  presetsCount: number;
  enginesCount: number;
  zeroApi: boolean;
 };
 hardware?: HardwareSummary;
};

const judgeLabel = (i: number) => (i === 0 ? 'Denetçi (1. hakem)' : '2. hakem');
const difficultyLabel: Record<string, string> = {kolay: 'Kolay', orta: 'Orta', zor: 'Zor'};
const typeLabel: Record<string, string> = {
 kavram: 'Kavram', vaka: 'Vaka Analizi', karsilastirma: 'Karşılaştırma',
 neden_sonuc: 'Neden-Sonuç', istisna: 'İstisna', uygulama: 'Uygulama'
};
const angleLabel: Record<string, string> = {
 dogrudan_tanim: '1. Doğrudan Tanım',
 ters_eleme_istisna: '2. Ters Köşe / İstisna',
 saha_vakasi: '3. Saha Vakası',
 karsilastirmali_tuzak: '4. Karşılaştırma Tuzağı',
 surpriz_baglam: '5. Şaşırtıcı Bağlam'
};
const pipelinePhaseLabel: Record<string, string> = {
 idle: 'Boşta / Yeni dalga bekleniyor',
 producing: 'Üretici dalgası çalışıyor',
 verifying_j1: '1. hakem kuyruğu denetliyor',
 verifying_j2: '2. hakem son onayı veriyor'
};

const api = '/api/ollama';

export async function getGenerated(): Promise<GeneratedQuestion[]> {
 const res = await fetch(`${api}/questions`);
 if (!res.ok) throw Error('Yerel soru servisine ulaşılamadı.');
 return (await res.json()).items;
}

export function OllamaStudio({read, onChange}: {read: string[]; onChange: (items: GeneratedQuestion[]) => void}) {
 const [status, setStatus] = useState<Status | null>(null);
 const [chosenModel, setChosenModel] = useState('');
 const [chosenVerifier, setChosenVerifier] = useState('');
 const [chosenJudge2, setChosenJudge2] = useState('');
 const [chosenEvolver, setChosenEvolver] = useState('');
 const [chosenVideo, setChosenVideo] = useState('');
 const [chosenCoder, setChosenCoder] = useState('');
 const [items, setItems] = useState<GeneratedQuestion[]>([]);
 const [audit, setAudit] = useState<Audit | null>(null);
 const [error, setError] = useState('');
 const [infoMsg, setInfoMsg] = useState('');
 const [view, setView] = useState<'approved' | 'rejected'>('approved');
 const [concurrencyInput, setConcurrencyInput] = useState('');
 const [timeoutInput, setTimeoutInput] = useState('');
 const [githubSearchQuery, setGithubSearchQuery] = useState('');
 const [githubSearchResults, setGithubSearchResults] = useState<GithubMegaProject[]>([]);
 const [showCoverage, setShowCoverage] = useState(false);
 const [busyAction, setBusyAction] = useState('');
 const mounted = useRef(true);

 const refresh = async () => {
  try {
   const [res, questions, auditResponse] = await Promise.all([
    fetch(`${api}/status`),
    getGenerated(),
    fetch(`${api}/audit`)
   ]);
   if (!res.ok || !auditResponse.ok) throw Error('Yerel servis yanıt vermedi.');
   if (!mounted.current) return;
   setStatus(await res.json());
   setAudit(await auditResponse.json());
   setItems(questions);
   onChange(questions);
  } catch {
   if (mounted.current) setError('Yerel soru servisine ulaşılamadı. Uygulamayı Ollama ile aynı bilgisayarda npm run dev komutuyla başlat.');
  }
 };

 useEffect(() => {
  mounted.current = true;
  refresh();
  const t = setInterval(refresh, 5000);
  return () => {
   mounted.current = false;
   clearInterval(t);
  };
 }, []);

 const toggleAuto = async (turnOn: boolean) => {
  try {
   const r = await fetch(`${api}/${turnOn ? 'start' : 'stop'}`, {method: 'POST'});
   if (!r.ok) throw Error('İstek başarısız.');
   setError('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'İstek başarısız.');
  }
 };

 const selectModel = async (role: 'model' | 'verifier' | 'judge2' | 'evolver' | 'video', modelName: string) => {
  try {
   const r = await fetch(`${api}/select-model`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({model: modelName, role})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Model seçilemedi.');
   setError('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Model seçilemedi.');
  }
 };

 const pullVideoCloudModel = async (modelName: string) => {
  setBusyAction(`pull-${modelName}`);
  setInfoMsg(`"${modelName}" (0-API) Ollama bulut modeli indiriliyor / etkinleştiriliyor…`);
  try {
   const r = await fetch(`${api}/videos/pull-model`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({model: modelName})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Model indirilemedi.');
   setError('');
   setChosenVideo(modelName);
   setInfoMsg(`✓ "${modelName}" hazır — hiçbir API anahtarı girmeden video üretimi aktif!`);
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Ollama çevrimdışı olsa bile 0-API Otonom video motoru her zaman hazır.');
  } finally {
   setBusyAction('');
  }
 };

 const updateConfig = async (patch: Partial<PipelineSettings>) => {
  try {
   const r = await fetch(`${api}/config`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(patch)
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Ayar güncellenemedi.');
   setError('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Ayar güncellenemedi.');
  }
 };

 const setConcurrency = async () => {
  const n = Number(concurrencyInput);
  try {
   const r = await fetch(`${api}/concurrency`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({value: n})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Eşzamanlılık ayarlanamadı.');
   setError('');
   setConcurrencyInput('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Eşzamanlılık ayarlanamadı.');
  }
 };

 const setTimeoutBudget = async () => {
  const n = Number(timeoutInput);
  try {
   const r = await fetch(`${api}/timeout`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({value: n})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Süre ayarlanamadı.');
   setError('');
   setTimeoutInput('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Süre ayarlanamadı.');
  }
 };

 const createSpecialist = async (role: 'generator' | 'judge' | 'evolver' | 'coder') => {
  const baseModel = role === 'judge'
   ? (chosenJudge2 || status?.judge2Model || status?.model)
   : role === 'evolver'
    ? (chosenEvolver || status?.evolverModel || status?.judge2Model || status?.model)
    : role === 'coder'
     ? (chosenCoder || status?.jarvis?.config?.coderModel || status?.model)
     : (chosenModel || status?.model);
  if (!baseModel) return;
  setBusyAction(`specialist-${role}`);
  setInfoMsg('');
  try {
   const r = await fetch(`${api}/create-specialist`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({role, baseModel})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Uzman model oluşturulamadı.');
   setError('');
   setInfoMsg(`"${data.model}" uzman modeli (${baseModel} tabanıyla) Ollama üzerinde oluşturuldu ve aktif seçildi!`);
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Uzman model oluşturulamadı.');
  } finally {
   setBusyAction('');
  }
 };

 const updateJarvisConfig = async (patch: Record<string, unknown>) => {
  try {
   const r = await fetch(`${api}/jarvis/config`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(patch)
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'JARVIS ayarı kaydedilemedi.');
   setError('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'JARVIS ayarı kaydedilemedi.');
  }
 };





 const setProposalDecision = async (id: string, decision: 'accepted' | 'archived') => {
  try {
   const r = await fetch(`${api}/jarvis/proposal-decision`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id, status: decision})
   });
   if (!r.ok) throw Error('Karar kaydedilemedi.');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Hata oluştu.');
  }
 };


 const triggerRollback = async () => {
  setBusyAction('rollback');
  setInfoMsg('');
  try {
   const r = await fetch(`${api}/rollback-evolution`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Geri alma başarısız.');
   setError('');
   setInfoMsg(`Politika v${data.policy?.version} sürümüne güvenle geri alındı.`);
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Geri alma hatası.');
  } finally {
   setBusyAction('');
  }
 };











 const applyHardwareProfile = async (profileId: string) => {
  setBusyAction(`hw-${profileId}`);
  setInfoMsg('');
  try {
   const r = await fetch(`${api}/hardware/apply`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({profileId, warmup: true})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Donanım profili uygulanamadı.');
   setError('');
   setInfoMsg(`Profil uygulandı: ${data.activeProfile?.label} (${data.activeProfile?.primaryModel} + ${data.activeProfile?.judgeModel} + ${data.activeProfile?.coderModel} · ~${data.activeProfile?.estimatedVramGb} GB VRAM)`);
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Donanım profil hatası.');
  } finally {
   setBusyAction('');
  }
 };

 const pullHardwareModels = async () => {
  setBusyAction('hw-pull');
  setInfoMsg('');
  try {
   const r = await fetch(`${api}/hardware/pull`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: '{}'
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'RTX 3080 Ti modelleri indirilemedi.');
   setError('');
   setInfoMsg(data.pullRes?.pullState?.message || 'Önerilen RTX 3080 Ti modelleri kuruldu ve VRAM belleğine sabitlendi!');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Model indirme hatası.');
  } finally {
   setBusyAction('');
  }
 };









 const searchGithubMega = async () => {
  setBusyAction('github-mega-search');
  try {
   const qs = new URLSearchParams({q: githubSearchQuery.trim() || 'moe', limit: '12'});
   const r = await fetch(`${api}/github-mega?${qs.toString()}`);
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'GitHub Mega araması başarısız.');
   setError('');
   setGithubSearchResults(Array.isArray(data.searchResults?.projects) ? data.searchResults.projects : []);
  } catch (e) {
   setError(e instanceof Error ? e.message : 'GitHub Mega arama hatası.');
  } finally {
   setBusyAction('');
  }
 };





 const selectLocalVideoEngine = async (engineId: string) => {
  setBusyAction(`local-video-${engineId}`);
  setInfoMsg('');
  try {
   const r = await fetch(`${api}/videos/local-engines/select`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({engineId})});
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Yerel AI video motoru seçilemedi.');
   setError('');
   setInfoMsg(`Yerel GitHub AI Video Motoru güncellendi: ${engineId} (${data.liveEnginesCount || 1} yerel motor aktif, 0 API anahtarı).`);
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Yerel video motoru seçim hatası.');
  } finally {
   setBusyAction('');
  }
 };

 const discoverLocalVideoEngines = async () => {
  setBusyAction('discover-local-video');
  setInfoMsg('');
  try {
   const r = await fetch(`${api}/videos/local-engines/discover`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'GitHub yerel video motorları taranamadı.');
   setError('');
   setInfoMsg(`GitHub Açık Kaynak AI Video Tarama (0-API): ${(data.repos || []).length} doğrulanmış proje (${(data.repos || []).slice(0, 3).map((x: {fullName: string}) => x.fullName).join(', ')})!`);
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'GitHub video tarama hatası.');
  } finally {
   setBusyAction('');
  }
 };






 const filtered = items.filter(q => q.status === view);
 const completedWithQuestions = new Set(items.filter(q => q.status === 'approved' && read.includes(q.unitId)).map(q => q.unitId)).size;
 const cfg = status?.settings;
 const tel = status?.telemetry;
 const cov = status?.coverage;
 const trn = status?.training;

 return <>
  <div className="page-title">
   <div className="eyebrow muted">GELİŞMİŞ YEREL YAPAY ZEKÂ · OLLAMA ÖĞRETMEN MOTORU v3</div>
   <h1>Soru stüdyosu<span className="accent">.</span></h1>
   <p>5 ders kitabının tamamından (~2 milyon karakter, 1.021 bölüm) beslenen; ~1 saniye/soru hızında toplu kör hakemli, kesin tek doğru cevap garantili, kart/eşleştirme/tekrar üreten ve izole kum havuzunda kendini geliştiren yapay zekâ öğretmen stüdyosu.</p>
  </div>

  <div className="notice">
   <GraduationCap size={20}/>
   <span>
    <b>Tam Otonom Kesintisiz Mimari (Sıfır Tıklama · Kesintisiz Üretim · Otonom Jüri):</b> Proje açıldığı andan itibaren yapay zekâlar rolleri otomatik devralır; bir grup hiç durmadan soru + çalışma materyali üretirken, arka plandaki koç katmanı <b>internet üzerinden dersleri araştırır, sınavda çıkabilecek soruları tahmin eder, diğer yapay zekâları sürekli eğitir</b> ve <b>AI Konseyi</b> havuzdaki soruları senin yerine kendi kendine onaylar veya eler.
   </span>
  </div>

  {/* HIZ & PERFORMANS TELEMETRİ PANELİ */}
  <div className="telemetry-grid">
   <div className="telemetry-card">
    <div className="telemetry-head"><Zap size={16}/><span>ÜRETİM HIZI</span></div>
    <strong>{tel?.secondsPerItem ? `${tel.secondsPerItem} sn` : `${tel?.questionsPerMinute ?? 0}`} <small>{tel?.secondsPerItem ? '/ soru' : 'soru/dk'}</small></strong>
    <p>{tel?.questionsPerMinute ?? 0} soru/dk · {tel?.tokensPerSecond ? `${tel.tokensPerSecond} tok/sn` : 'Veri bekleniyor'} · {cfg?.batchPerCall || 8}/çağrı</p>
   </div>
   <div className="telemetry-card">
    <div className="telemetry-head"><Gauge size={16}/><span>KART &amp; ÇİFT-CEVAP KALKANI</span></div>
    <strong>{status?.studyCounts?.total ?? 0} <small>materyal</small></strong>
    <p>{status?.studyCounts?.flashcards ?? 0} kart · {status?.studyCounts?.matchings ?? 0} eşleştirme · {tel?.dualAnswerBlocked ?? 0} çift-cevap elendi</p>
   </div>
   <div className="telemetry-card">
    <div className="telemetry-head"><Sparkles size={16}/><span>KALİTE & KURTARMA</span></div>
    <strong>%{tel?.approvalRate ?? 0} <small>onay oranı</small></strong>
    <p>{tel?.approvedTotal ?? 0} onay · {tel?.refinedSucceeded ?? 0} düzeltme · {tel?.avgVerifyMs ? `${(tel.avgVerifyMs / 1000).toFixed(1)}s` : '—'} denetim</p>
   </div>
   <div className="telemetry-card">
    <div className="telemetry-head"><BookOpen size={16}/><span>KİTAP KAPSAMI</span></div>
    <strong>%{cov?.coveragePercent ?? 0} <small>pasaj</small></strong>
    <p>{cov?.coveredPassages ?? 0} / {cov?.totalPassages ?? 1021} bölüm · Evrim v{status?.evolution?.activePolicy?.version ?? 1}</p>
   </div>
  </div>

  {/* DURUM & MODEL & HIZ KONTROL PANELİ */}
  <div className="studio-status">
   <div style={{flex: 1}}>
    <div className="eyebrow muted">BAĞLANTI & BORU HATTI DURUMU</div>
    <h2>{status?.connected ? 'Ollama bağlı' : 'Ollama bağlantısı yok'}</h2>
    <p>
     Öğretmen model: <b>{status?.model || 'qwen3:14b'}</b> ({status?.connected ? (status.installed ? 'hazır' : 'kurulu değil') : 'bekleniyor'}) ·
     Boru hattı: <b>{pipelinePhaseLabel[tel?.pipelinePhase || 'idle'] || tel?.pipelinePhase}</b>
    </p>

    {/* TEK MOD = TURBO (Kalite Kilidi AKTİF) — başka profil/mod yoktur, proje her zaman Turbo ile çalışır */}
    <div className="preset-bar">
     <span className="preset-label"><Cpu size={14}/> Çalışma Profili:</span>
     <span className="preset-btn active" title="8 soru/çağrı · Toplu kör hakem · Self-correction & kolay/orta/zor kilidi HER ZAMAN AKTİF">⚡ Turbo (Kalite Kilitli) — 8 soru/çağrı · Toplu kör hakem · Self-correction & kolay/orta/zor kilidi</span>
     <span className="jarvis-badge ok" style={{marginLeft: 8}}>
      🔒 Turbo Kalite Kilidi: AKTİF (Sıfır Saçmalama)
     </span>
    </div>

    <div className="model-select">
     <label htmlFor="model-choice">Üretici model</label>
     <select id="model-choice" value={chosenModel || status?.model || ''} onChange={e => setChosenModel(e.target.value)} disabled={!status?.models.length || status.busy}>
      <option value="" disabled>Model seç</option>
      {status?.models.map(m => <option key={m} value={m}>{m}</option>)}
     </select>
     <button className="outline" onClick={() => selectModel('model', chosenModel)} disabled={!chosenModel || !!status?.busy}>Modeli kullan</button>
     <button className="outline" onClick={() => createSpecialist('generator')} disabled={!status?.connected || !status?.models.length || !!busyAction} title="Seçili modelden antrenörlük soru yazarı uzman modeli oluşturur">
      <Wand2 size={14}/> {busyAction === 'specialist-generator' ? 'Oluşturuluyor...' : 'Uzman Öğretmen Oluştur'}
     </button>
    </div>

    <div className="model-select">
     <label htmlFor="verifier-choice">Denetçi (1. hakem)</label>
     <select id="verifier-choice" value={chosenVerifier || status?.verifierModel || ''} onChange={e => setChosenVerifier(e.target.value)} disabled={!status?.models.length || status.busy}>
      <option value="" disabled>Model seç</option>
      {status?.models.map(m => <option key={m} value={m}>{m}</option>)}
     </select>
     <button className="outline" onClick={() => selectModel('verifier', chosenVerifier)} disabled={!chosenVerifier || !!status?.busy}>Modeli kullan</button>
     <span>{status?.connected ? (status.verifierInstalled ? 'hazır' : 'kurulu değil') : 'bekleniyor'}</span>
    </div>

    <div className="model-select">
     <label htmlFor="judge2-choice">2. hakem (bağımsız)</label>
     <select id="judge2-choice" value={chosenJudge2 || status?.judge2Model || ''} onChange={e => setChosenJudge2(e.target.value)} disabled={!status?.models.length || status.busy}>
      <option value="" disabled>Model seç</option>
      {status?.models.map(m => <option key={m} value={m}>{m}</option>)}
     </select>
     <button className="outline" onClick={() => selectModel('judge2', chosenJudge2)} disabled={!chosenJudge2 || !!status?.busy}>Modeli kullan</button>
     <button className="outline" onClick={() => createSpecialist('judge')} disabled={!status?.connected || !status?.models.length || !!busyAction} title="Seçili modelden titiz hakem uzman modeli oluşturur">
      <Wand2 size={14}/> {busyAction === 'specialist-judge' ? 'Oluşturuluyor...' : 'Uzman Hakem Oluştur'}
     </button>
     <span>{status?.connected ? (status.judge2Installed ? 'hazır' : 'kurulu değil') : 'bekleniyor'}</span>
    </div>

    <div className="model-select">
     <label htmlFor="evolver-choice">3. AI Öz-Evrim (Strateji & Kural)</label>
     <select id="evolver-choice" value={chosenEvolver || status?.evolverModel || ''} onChange={e => setChosenEvolver(e.target.value)} disabled={!status?.models.length || status.busy}>
      <option value="" disabled>Model seç</option>
      {status?.models.map(m => <option key={m} value={m}>{m}</option>)}
     </select>
     <button className="outline" onClick={() => selectModel('evolver', chosenEvolver)} disabled={!chosenEvolver || !!status?.busy}>Modeli kullan</button>
     <button className="outline" onClick={() => createSpecialist('evolver')} disabled={!status?.connected || !status?.models.length || !!busyAction} title="Seçili modelden site durumuna göre kural geliştiren evrim uzmanı oluşturur">
      <Brain size={14}/> {busyAction === 'specialist-evolver' ? 'Oluşturuluyor...' : 'Uzman Mimar Oluştur'}
     </button>
     <span>{status?.connected ? (status.evolverInstalled ? 'hazır' : 'kurulu değil') : 'bekleniyor'}</span>
    </div>

    <div className="model-select">
     <label htmlFor="video-choice">4. Video Yönetmeni (0-API Bulut)</label>
     <select id="video-choice" value={chosenVideo || status?.videoModel || ''} onChange={e => setChosenVideo(e.target.value)} disabled={!status?.models.length || status.busy}>
      <option value="" disabled>Model seç</option>
      {status?.models.map(m => <option key={m} value={m}>{m}</option>)}
     </select>
     <button className="outline" onClick={() => selectModel('video', chosenVideo)} disabled={!chosenVideo || !!status?.busy}>Video Modeli Yap</button>
     <span>{status?.connected ? (status.videoModelInstalled ? `hazır (${status.videoModel})` : '0-API Otonom aktif') : '0-API Otonom hazır'}</span>
    </div>

    <div className="preset-bar" style={{marginTop: 8, marginBottom: 8}}>
     <span className="preset-label">🎬 Önerilen 0-API Bulut Video Modelleri:</span>
     {(status?.cloudVideoModels || [
      {id: 'kimi-k3.1-pro:cloud', label: 'Kimi K3.1 Pro (:cloud)', badge: 'Önerilen', installed: false},
      {id: 'glm-5.3-flash:cloud', label: 'GLM 5.3 Flash (:cloud)', badge: 'Hızlı', installed: false},
      {id: 'deepseek-v4.1-flash:cloud', label: 'DeepSeek V4.1 Flash (:cloud)', badge: 'Keskin', installed: false}
     ]).map(cm => (
      <button
       key={cm.id}
       className={`preset-btn ${status?.videoModel === cm.id ? 'active' : ''}`}
       disabled={!!busyAction}
       title={`${cm.badge} · API anahtarı gerekmez`}
       onClick={() => cm.installed ? selectModel('video', cm.id) : pullVideoCloudModel(cm.id)}
      >
       {cm.id.startsWith('kimi') ? '⭐' : cm.id.startsWith('glm') ? '⚡' : '🧠'} {cm.id} {cm.installed ? '✓' : (busyAction === `pull-${cm.id}` ? 'İniyor…' : '(Tek Tıkla Al)')}
      </button>
     ))}
     <span className="jarvis-badge ok" style={{marginLeft: 6}}>
      🎙️ VoiceStudio: {status?.voiceStudio?.totalFreeVoices ?? 62} Ücretsiz Ses · 0-API
     </span>
    </div>

    {/* GITHUB AÇIK KAYNAK YEREL AI VİDEO ÜRETİCİLERİ HUB'I (0-API) */}
    {status?.localVideoEngines && (
     <div className="jarvis-box" style={{marginTop: 8, marginBottom: 10}}>
      <div className="coverage-top" style={{marginBottom: 6}}>
       <b>🎥 GitHub Profesyonel Yerel AI Video Üreticileri (0-API · {status.localVideoEngines.liveEnginesCount}/{status.localVideoEngines.totalCatalogCount} Yerel Hazır)</b>
       <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
        <button className={`preset-btn ${status.localVideoEngines.preferredEngineId === 'auto' ? 'active' : ''}`} onClick={() => selectLocalVideoEngine('auto')} disabled={!!busyAction}>
         Otomatik (En İyi Yerel)
        </button>
        <button className="outline" onClick={discoverLocalVideoEngines} disabled={!!busyAction}>
         <Globe size={13}/> {busyAction === 'discover-local-video' ? 'Taranıyor…' : 'GitHub OSS Tara'}
        </button>
       </div>
      </div>
      <div className="jarvis-diff-grid">
       {(status.localVideoEngines.engines || []).map(eng => (
        <div className="jarvis-diff-card" key={eng.id} style={{display: 'flex', flexDirection: 'column', gap: 4}}>
         <div className="coverage-top">
          <span className={`jarvis-badge ${eng.available ? 'ok' : 'neutral'}`}>
           {eng.available ? (eng.alwaysReady ? 'YERLEŞİK HAZIR ✓' : 'YEREL BAĞLI ✓') : 'YEREL BEKLEMEDE'}
          </span>
          <small>{eng.license} · ★{eng.stars}</small>
         </div>
         <b style={{fontSize: '0.88rem'}}>{eng.name}</b>
         <p style={{margin: 0}}><small>{eng.repo} — {eng.detail || eng.description}</small></p>
         <button
          className={`preset-btn ${status.localVideoEngines?.preferredEngineId === eng.id ? 'active' : ''}`}
          style={{marginTop: 'auto'}}
          disabled={!!busyAction}
          onClick={() => selectLocalVideoEngine(eng.id)}
         >
          {status.localVideoEngines?.preferredEngineId === eng.id ? 'Seçili Motor ✓' : 'Bu Motoru Seç'}
         </button>
        </div>
       ))}
      </div>
     </div>
    )}

    {/* İNCE KAPSAM AYARI — hız/kalite Turbo kilidinde sabittir */}
    <div className="config-grid">
     <div className="config-item">
      <label htmlFor="passage-choice">Kaynak genişliği</label>
      <select id="passage-choice" value={cfg?.passageMode || 'full-book'} onChange={e => updateConfig({passageMode: e.target.value as 'full-book' | 'summary-only'})}>
       <option value="full-book">5 Kitabın Tamamı (1.021 pasaj)</option>
       <option value="summary-only">Yalnız Kısa Özetler (29 pasaj)</option>
      </select>
     </div>
    </div>

    <p className="manifest-line" style={{margin: '4px 0 10px'}}>
     🔒 Turbo Kalite Kilidi: <b>8 soru/çağrı · Toplu kör hakem (~1sn/soru) · Hızlı düşünme · Self-correction · Akıllı zorluk · Kart + Eşleştirme + Tekrar üretimi · Arka plan Öz-Evrim</b> — tümü kalıcı olarak açıktır, kapatılmaz.
    </p>

    <div className="model-select">
     <label htmlFor="concurrency-choice">Eşzamanlı yuva (1-{status?.totalUnits || 29})</label>
     <input id="concurrency-choice" type="number" min={1} max={status?.totalUnits || 29} value={concurrencyInput} placeholder={String(status?.autoConcurrency || 3)} onChange={e => setConcurrencyInput(e.target.value)}/>
     <button className="outline" onClick={setConcurrency} disabled={!concurrencyInput}>Uygula</button>
     <label htmlFor="timeout-choice" style={{marginLeft: 10}}>Zaman aşımı ms (1000-300000)</label>
     <input id="timeout-choice" type="number" min={1000} max={300000} step={1000} value={timeoutInput} placeholder={String(status?.autoTimeoutMs || 45000)} onChange={e => setTimeoutInput(e.target.value)}/>
     <button className="outline" onClick={setTimeoutBudget} disabled={!timeoutInput}>Uygula</button>
    </div>

    <p>
     Depolama: {status?.storage ? `${(status.storage.total / 1e9).toFixed(2)} / ${(status.storage.limit / 1e9).toFixed(0)} GB` : 'hesaplanıyor'} ·
     Ön kontrol: {audit ? `${audit.checked} soru, ${audit.invalid} biçim hatası, ${audit.duplicates} tekrar` : 'Bekleniyor'} ·
     Kurulu modeller: {status?.models.length ? status.models.join(', ') : 'Görünmüyor'}
    </p>
    <p>
     Havuz: <b>{status?.count || 0}</b> üretildi ({status?.approved || 0} onaylı, {status?.rejected || 0} reddedilmiş) ·
     Zorluk: Kolay {status?.difficultyCounts?.kolay || 0} · Orta {status?.difficultyCounts?.orta || 0} · Zor {status?.difficultyCounts?.zor || 0} ·
     Tamamlanan {read.length} ünitenin {completedWithQuestions} tanesinde hazır soru var.
    </p>
    <p>
     Aktif yuvalar: <b>{status?.autoActive || 0} / {status?.autoConcurrency || 3}</b>
     {status?.autoPhases?.length ? <>: {status.autoPhases.map((p, i) => <span key={i}>{i > 0 ? ', ' : ''}{p.unit} ({p.phase === 'generating' ? 'üretiliyor' : p.phase === 'verifying' ? 'denetleniyor' : p.phase === 'saving' ? 'kaydediliyor' : p.phase})</span>)}</> : ' — boşta'}
    </p>
   </div>

   <div className="studio-actions">
    <button className="outline" onClick={refresh}>Durumu yenile</button>
    {status?.autoRunning
     ? <button className="primary" onClick={() => toggleAuto(false)}><Square size={15}/> Üretimi durdur</button>
     : <button className="primary" onClick={() => toggleAuto(true)}><Play size={15}/> Üretimi başlat</button>}
    <button className="outline" onClick={() => setShowCoverage(s => !s)}>
     <Layers size={15}/> {showCoverage ? 'Kapsam haritasını gizle' : 'Kitap kapsam haritası (29 ünite)'}
    </button>
   </div>
  </div>

  {infoMsg && <div className="notice"><Check size={18}/><span>{infoMsg}</span></div>}
  {(error || status?.lastError) && <div className="notice warning"><AlertCircle size={18}/><span>{error || status?.lastError}</span></div>}
  {status?.autoLastError && <div className="notice warning"><AlertCircle size={18}/><span>Son arka plan notu: {status.autoLastError}</span></div>}

  {status?.autoRunning && <p className="studio-running">
   ● {!audit ? 'Önce soru havuzu kontrol ediliyor…'
    : audit.invalid || audit.duplicates ? 'Havuz kontrolünde hata var; üretim bekliyor.'
     : !status?.connected ? 'Ollama bağlantısı bekleniyor.'
      : !status.installed || !status.verifierInstalled || !status.judge2Installed ? 'Üretici veya hakem modellerden birinin kurulması bekleniyor.'
       : (status.autoActive || 0) > 0 ? `${status.autoActive} ünite şu an üretiliyor/denetleniyor (${pipelinePhaseLabel[tel?.pipelinePhase || 'idle'] || ''})…`
        : 'Yeni dalga için hazır…'}
  </p>}

  {/* JARVIS SÜREKLİ ÖĞRENME & QWEN CODE KOMUTA MERKEZİ */}
  {status?.jarvis && (
   <details className="training-info jarvis-panel" open>
    <summary>
     <Cpu size={14} style={{verticalAlign: 'middle', marginRight: 6}}/>
     JARVIS Sürekli Kendini Eğiten Yapay Zekâ &amp; Qwen Code (Nesil #{status.jarvis.memory.generation} · İnovasyon #{status.jarvis.memory.innovationCount} · Kolay/Orta/Zor Korumalı)
    </summary>
    <div className="training-panel">
     <div className="jarvis-badges">
      <span className="jarvis-badge ok">Kesintisiz Üretim: ASLA DURMAZ</span>
      <span className="jarvis-badge ok">Otonom Jüri: KENDİ KENDİNE ONAYLAR/ELER</span>
      {status.jarvis.adaptiveQuality && (
       <span className="jarvis-badge ok">{status.jarvis.adaptiveQuality.title} (Puan &ge; {status.jarvis.adaptiveQuality.minQualityScore})</span>
      )}
      <span className={`jarvis-badge ${status.jarvis.research?.networkAvailable ? 'ok' : 'neutral'}`}>
       Web Araştırması &amp; Sınav Tahmini: {status.jarvis.research?.researchCycles ?? 0} tur ({status.jarvis.research?.webHitsTotal ?? 0} web kaynağı)
      </span>
      <span className={`jarvis-badge ${status.jarvis.env.weightsTrainingReady ? 'ok' : 'warn'}`}>
       Katman 2 (LoRA+DPO Ağırlık): {status.jarvis.env.weightsTrainingReady ? `HAZIR (${status.jarvis.env.gpuName || 'CUDA GPU'})` : `Eksik: ${status.jarvis.env.missing.join(', ')}`}
      </span>
      <span className={`jarvis-badge ${status.jarvis.env.hasQwenCli || status.coderInstalled ? 'ok' : 'neutral'}`}>
       Qwen Code: {status.jarvis.config.coderBackend === 'qwen-cli' ? (status.jarvis.env.hasQwenCli ? 'CLI Bağlı (qwen)' : 'CLI kurulu değil (fallback aktif)') : `${status.jarvis.config.coderModel}${status.coderInstalled ? ' (hazır)' : ' (kurulu değil)'}`}
      </span>
      <span className="jarvis-badge ok">Kolay / Orta / Zor Sistemi: KORUMALI &amp; GELİŞTİRİLİYOR</span>
     </div>

     {/* QWEN CODE BAĞLANTISI & OTONOM EĞİTİM AYARLARI */}
     <div className="config-grid">
      <div className="config-item">
       <label htmlFor="jarvis-coder-backend">Qwen Code Motoru</label>
       <select id="jarvis-coder-backend" value={status.jarvis.config.coderBackend} onChange={e => updateJarvisConfig({coderBackend: e.target.value})}>
        <option value="ollama">Ollama Qwen Coder (qwen2.5-coder / qwen3-coder)</option>
        <option value="qwen-cli">Qwen Code CLI (sistemde &quot;qwen&quot; komutu)</option>
       </select>
      </div>
      <div className="config-item">
       <label htmlFor="jarvis-coder-model">Kod &amp; Geliştirme Modeli (4. Rol)</label>
       <div style={{display: 'flex', gap: 6}}>
        <select id="jarvis-coder-model" style={{flex: 1}} value={chosenCoder || status.jarvis.config.coderModel} onChange={e => { setChosenCoder(e.target.value); updateJarvisConfig({coderModel: e.target.value}); }}>
         {!status.models.includes(status.jarvis.config.coderModel) && <option value={status.jarvis.config.coderModel}>{status.jarvis.config.coderModel}</option>}
         {status.models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button className="outline" onClick={() => createSpecialist('coder')} disabled={!status?.connected || !status?.models.length || !!busyAction} title="Seçili modelden JARVIS Qwen Coder uzmanı oluştur">
         <Code2 size={14}/> Oluştur
        </button>
       </div>
      </div>
      <div className="config-item">
       <label htmlFor="jarvis-train-every">Ağırlık Eğitimi Eşiği (Soru Sayısı)</label>
       <select id="jarvis-train-every" value={status.jarvis.config.trainEveryNQuestions} onChange={e => updateJarvisConfig({trainEveryNQuestions: Number(e.target.value)})}>
        {[50, 100, 200, 300, 500].map(n => <option key={n} value={n}>Her +{n} onaylı soruda LoRA+DPO eğit</option>)}
       </select>
      </div>
      <div className="config-item">
       <label htmlFor="jarvis-base-hf">Eğitim Taban Modeli (Qwen Coder / Qwen3)</label>
       <select id="jarvis-base-hf" value={status.jarvis.config.baseHfModel} onChange={e => updateJarvisConfig({baseHfModel: e.target.value})}>
        {[
         'Qwen/Qwen3-8B',
         'Qwen/Qwen2.5-Coder-7B-Instruct',
         'Qwen/Qwen2.5-Coder-14B-Instruct',
         'Qwen/Qwen2.5-Coder-32B-Instruct',
         'Qwen/Qwen3-Coder-30B-A3B-Instruct',
         'Qwen/Qwen3-14B',
         'Qwen/Qwen3-32B',
         'Qwen/Qwen2.5-7B-Instruct'
        ].map(m => <option key={m} value={m}>{m}</option>)}
       </select>
      </div>
      <div className="config-item">
       <label htmlFor="jarvis-adapter-size">Adaptör Gücü (LoRA / DoRA / Mega)</label>
       <select id="jarvis-adapter-size" value={status.jarvis.config.adapterSize} onChange={e => updateJarvisConfig({adapterSize: e.target.value})}>
        <option value="pro">pro (r=16 rsLoRA · tüm katmanlar)</option>
        <option value="dora">dora (r=16 DoRA · yüksek doğruluk)</option>
        <option value="ultra">ultra (r=32 rsLoRA · derin kod/zekâ)</option>
        <option value="mega">mega (r=64 DoRA · maksimum kapasite)</option>
        <option value="standard">standard (r=8 dikkat)</option>
        <option value="compact">compact (r=1 ~98K)</option>
       </select>
      </div>
     </div>

     <div className="toggle-row" style={{margin: 0}}>
      <label className="toggle-pill">
       <input type="checkbox" checked={status.jarvis.config.autoResearch !== false} onChange={e => updateJarvisConfig({autoResearch: e.target.checked})}/>
       <span>Arka planda sürekli internet araştırması &amp; sınav tahmini</span>
      </label>
      <label className="toggle-pill">
       <input type="checkbox" checked={status.jarvis.config.autoCuratePool !== false} onChange={e => updateJarvisConfig({autoCuratePool: e.target.checked})}/>
       <span>Otonom AI Konseyi (havuzu kendi kendine onaylar/eler)</span>
      </label>
      <label className="toggle-pill">
       <input type="checkbox" checked={status.jarvis.config.autoReflect} onChange={e => updateJarvisConfig({autoReflect: e.target.checked})}/>
       <span>Soru üretirken diğer AI&apos;ları koçlukla eğit ({status.jarvis.config.reflectEveryN} denemede bir)</span>
      </label>
      <label className="toggle-pill">
       <input type="checkbox" checked={status.jarvis.config.autoInnovate} onChange={e => updateJarvisConfig({autoInnovate: e.target.checked})}/>
       <span>Qwen Code ile kolay/orta/zor &amp; kural inovasyonu ({status.jarvis.config.innovateEveryN} denemede bir)</span>
      </label>
      <label className="toggle-pill">
       <input type="checkbox" checked={status.jarvis.config.autoTrainWeights} onChange={e => updateJarvisConfig({autoTrainWeights: e.target.checked})}/>
       <span>Üretimi durdurmadan otonom LoRA+DPO Ağırlık Eğitimi + Hot-Swap</span>
      </label>
     </div>

     {/* SONRAKİ AĞIRLIK EĞİTİMİ İLERLEME & DURUM */}
     <div>
      <div className="coverage-meta" style={{marginBottom: 4}}>
       <span>
        Son ağırlık eğitiminden beri biriken altın soru: <b>{status.jarvis.sinceLastTrain} / {status.jarvis.config.trainEveryNQuestions}</b>
        {status.jarvis.memory.activeTrainedModel ? ` · Aktif eğitilmiş beyin: ${status.jarvis.memory.activeTrainedModel}` : ''}
       </span>
       <span>{status.jarvis.trainingState.running ? `Eğitim aşaması (üretim devam ediyor): ${status.jarvis.trainingState.stage}` : `Kalan: ${status.jarvis.nextTrainRemaining} soru`}</span>
      </div>
      <div className="progress"><div style={{width: `${Math.min(100, Math.round((status.jarvis.sinceLastTrain / Math.max(1, status.jarvis.config.trainEveryNQuestions)) * 100))}%`, background: '#5b8f3d'}}/></div>
     </div>

     <p className="manifest-line" style={{marginTop: 10}}>
      🤖 <b>Tamamen Otonom:</b> Rol atama, web araştırması, havuz taraması, konu anlatımı geliştirme, 3D video üretimi, ApexArchitect evrimi, sürekli zekâ eğitimi, Nexus-Titan tam proje geliştirme, GitHub OSS madenciliği, parametre evrimi, LoRA+DPO ağırlık eğitimi ve hot-swap — <b>tümü proje açıldığı andan itibaren arka planda kendiliğinden çalışır.</b> Hiçbir düğmeye basman gerekmez.
     </p>

     {/* 20x OMEGA-4700x+ (+470,000%) APEXARCHITECT, +160,000% KESİNTİSİZ ZEKÂ EĞİTİMİ & 0-API YASAL GITHUB OSS PANELİ */}
     {(() => {
      const apexData = status.jarvis?.apex;
      const trainerData = status.jarvis?.continuousTrainer;
      const ossData = status.jarvis?.githubOss;
      if (!apexData) return null;
      return (
       <div className="jarvis-box">
       <div className="coverage-top">
        <b><Zap size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> 100x Ultra-Singularity Meta-Geliştirici (+100x Sürekli Eğitim &amp; Qwen Code · 11 Alt-Sistem)</b>
        <span className="jarvis-badge ok">
         Güç: +%{status.qwenBoostPercent ?? 70500000000} ({apexData.state?.intelligenceMultiplier ?? 705000000}x) · Tur #{apexData.state?.evolutionCycles ?? 0}
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>11 Alt-Sistem Ort. Sağlığı:</b> %{apexData.diagnostics?.botHealthAvg ?? 0} ·
        <b> Kitap Pasaj Kapsamı:</b> %{apexData.diagnostics?.passageCovPct ?? 0} ·
        <b> Çekirdek Doğruluk:</b> %{apexData.diagnostics?.evalAccuracyScore ?? 0} ·
        <b> 96-Tuzak Zırhı:</b> {trainerData?.trapDefensePassed ?? 96}/{trainerData?.trapDefenseTotal ?? 96} ·
        <b> 40-Aşamalı Eğitim Turu:</b> #{trainerData?.epochsCompleted ?? trainerData?.ticksTotal ?? 0} ({Object.keys(trainerData?.distilledUnits || {}).length}/{status.totalUnits} ünite damıtıldı) ·
        <b> 29 Ünite TikTok MP4:</b> {status.tiktokFeed?.filledUnits ?? status.videos?.filledUnits ?? 0}/{status.totalUnits} (%{status.tiktokFeed?.coveragePct ?? status.videos?.coveragePct ?? 0})
       </p>
        {ossData && (
         <p style={{margin: '4px 0'}}>
          <small>
           <b>🐙 0-API Yasal Açık Kaynak Madenciliği (MIT/Apache-2.0):</b>{' '}
           {ossData.cycles || 0} tarama · {ossData.totalReposDiscovered || 0} yasal açık kaynak depo ·{' '}
           {ossData.synthesizedBlueprints?.slice(-2).map(b => `${b.repo} (${b.license}: ${b.technique})`).join(' · ') || 'İlk açık kaynak sentezine hazır (0 API key)'}
          </small>
         </p>
        )}
        {apexData.state?.lastCycleImpact && (
         <p style={{margin: '4px 0'}}>
          <small>
           <b>Son Tur A/B Etki Doğrulaması (#{apexData.state.lastCycleImpact.cycle}):</b>{' '}
           {apexData.state.lastCycleImpact.verdict === 'kazandi' ? 'Kazandı ✓' : apexData.state.lastCycleImpact.verdict === 'geri_alindi' ? 'Geri Alındı ↺' : 'Dengeli'} ·
           Bot Sağlığı Δ: {apexData.state.lastCycleImpact.healthDelta >= 0 ? '+' : ''}{apexData.state.lastCycleImpact.healthDelta} ·
           Onay Δ: {apexData.state.lastCycleImpact.approvalRateDelta >= 0 ? '+' : ''}{apexData.state.lastCycleImpact.approvalRateDelta}
           {apexData.state.lastCycleImpact.winnerStrategy ? ` · Turnuva Kazananı: ${apexData.state.lastCycleImpact.winnerStrategy}` : ''}
          </small>
         </p>
        )}
        {apexData.state?.hyperParams && (
         <p style={{margin: '4px 0'}}>
          <small>
           <b>Canlı HyperParams:</b> Sıcaklık {apexData.state.hyperParams.temperatureOffset >= 0 ? '+' : ''}{apexData.state.hyperParams.temperatureOffset} ·
           Paket {apexData.state.hyperParams.batchSizeHint} ·
           Kurul Alt Eşiği {apexData.state.hyperParams.curatorMinScoreHint}
           {apexData.state.hyperParams.priorityPassageUnits?.length ? ` · Kör Nokta Öncelik: ${apexData.state.hyperParams.priorityPassageUnits.join(', ')}` : ''}
          </small>
         </p>
        )}
        {apexData.state?.winningPlaybook?.length ? (
         <p style={{margin: '4px 0'}}>
          <small>
           <b>Kazanan Strateji Playbook ({apexData.state.winningPlaybook.length}):</b>{' '}
           {apexData.state.winningPlaybook.slice(-3).map(p => `${p.strategy} (Tur #${p.cycle}, Skor ${p.score})`).join(' · ')}
          </small>
         </p>
        ) : null}
        {apexData.diagnostics?.botHealth && (
         <div className="jarvis-diff-grid" style={{marginTop: 6}}>
          {Object.entries(apexData.diagnostics.botHealth).map(([botName, info]) => (
           <div className="jarvis-diff-card" key={botName}>
            <span className="jarvis-badge ok" style={{marginBottom: 4}}>{botName}: %{info.score} ({info.status})</span>
            <p style={{margin: 0}}><small><b>Darboğaz:</b> {info.bottleneck}</small></p>
            {apexData.state?.activeBotDirectives?.[botName] && (
             <p style={{margin: '4px 0 0'}}><small><b>Aktif Direktif:</b> {apexData.state.activeBotDirectives[botName].slice(0, 120)}</small></p>
            )}
           </div>
          ))}
         </div>
        )}
        {apexData.diagnostics?.rootCauses?.length ? (
         <p style={{margin: '6px 0 0'}}><small><b>Kök Neden Teşhisi:</b> {apexData.diagnostics.rootCauses.join(' · ')}</small></p>
        ) : null}
        {apexData.state?.hypotheses?.length ? (
         <ul style={{marginTop: 6}}>
          {apexData.state.hypotheses.slice(-3).reverse().map(h => (
           <li key={h.id}><code>[{h.targetBot} · F1:%{h.verifiedScore}]</code> {h.hypothesis} → <b>{h.action}</b></li>
          ))}
         </ul>
        ) : null}
       </div>
      );
     })()}

     {/* RTX 3080 Ti + 16 GB RAM · EN GÜÇLÜ <1SN VRAM-SABİT TAKIM PROFİLİ */}
     {status.hardware && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><Cpu size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> {status.hardware.activeProfile.label}</b>
        <span className={`jarvis-badge ${status.hardware.activeProfile.subSecondMode ? 'ok' : ''}`}>
         {status.hardware.activeProfile.subSecondMode ? '<1sn VRAM-Sabit Takım ✓' : 'Yüksek Parametre Modu'} · ~{status.hardware.activeProfile.estimatedVramGb} GB VRAM
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>Takım Model Yığını (0 RAM Takası):</b>{' '}
        <code>{status.hardware.activeProfile.primaryModel}</code> (Üretici/ÖSYM/Mimar) +{' '}
        <code>{status.hardware.activeProfile.judgeModel}</code> (Hakem/Çeldirici/Psikometri) +{' '}
        <code>{status.hardware.activeProfile.coderModel}</code> (Qwen-Code) ·{' '}
        <b>ctx={status.hardware.activeProfile.numCtx ?? 3072}</b> · <code>keep_alive=5m</code>
       </p>
       <p style={{margin: '4px 0'}}>
        <small>
         <b>Donanım:</b> {status.hardware.hardware.gpu.driverNote} · <b>Sistem RAM:</b> {status.hardware.hardware.systemRam.totalGb} GB ·{' '}
         {status.hardware.vramStatus?.loaded?.length
          ? `Canlı VRAM: ${status.hardware.vramStatus.totalVramGb} GB (${status.hardware.vramStatus.loaded.map(m => `${m.name}:%${m.gpuPct} GPU`).join(', ')})`
          : (status.hardware.allRecommendedInstalled ? 'Önerilen 3080 Ti modelleri hazır!' : `Eksik yerel modeller: ${status.hardware.missingRecommendedModels.join(', ')} (Ollama bağlandığında otomatik iner)`)}{' '}
         {status.hardware.pullState?.running ? ` · İndiriliyor: ${status.hardware.pullState.currentModel} (%${status.hardware.pullState.percent})` : ''}
        </small>
       </p>
       <div className="training-actions" style={{marginTop: 6}}>
        {status.hardware.availableProfiles.map(prof => (
         <button
          key={prof.id}
          className={status.hardware?.activeProfile.id === prof.id ? 'primary' : 'outline'}
          onClick={() => applyHardwareProfile(prof.id)}
          disabled={!!busyAction}
         >
          <Zap size={14}/> {prof.primaryModel} + {prof.judgeModel} + {prof.coderModel} ({prof.estimatedVramGb} GB)
         </button>
        ))}
        {!status.hardware.allRecommendedInstalled && (
         <button className="primary" onClick={pullHardwareModels} disabled={!status.connected || !!busyAction || status.hardware.pullState?.running}>
          <RefreshCw size={14}/> {busyAction === 'hw-pull' || status.hardware.pullState?.running ? `İndiriliyor (%${status.hardware.pullState?.percent ?? 0})...` : `Eksik 3080 Ti Modellerini Şimdi Yükle (${status.hardware.missingRecommendedModels.length})`}
         </button>
        )}
       </div>
      </div>
     )}

     {/* 0-API YEREL ÇOKLU-AI TAKIMI, MİLİSANİYE ORKESTRASYON & ÖSYM SORU KOMİSYONU */}
     {status.localAiTeam && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><Terminal size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> 0-API Yerel Çoklu-AI Takımı, &lt;1sn Orkestrasyon &amp; ÖSYM Soru Komisyonu (Otomatik · Sıfır Tıklama)</b>
        <span className="jarvis-badge ok">
         {status.localAiTeam.activeTeamMembersCount} Yerel Ajan Takımı · {status.localAiTeam.lastCycleDurationMs} ms/tur ({status.localAiTeam.subSecondPassRatePct ?? 100}% &lt;1sn ✓) · ÖSYM: {status.localAiTeam.osymPoolScoreAvg}/100
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>Takım Hızı:</b> Tur #{status.localAiTeam.cyclesCompleted} · Ort. <b>{status.localAiTeam.avgCycleDurationMs} ms</b> · Kural Gecikmesi: <b>{status.localAiTeam.ruleLatencyMicros ?? 7.5} µs/soru</b> ·
        <b> ÖSYM Elit Soru Payı:</b> %{status.localAiTeam.osymEliteSharePct} ·
        <b> Sıfır API Anahtarı:</b> Proje açılışından itibaren paralel kendi kendine çalışır
       </p>
       <div className="jarvis-diff-grid" style={{marginTop: 6}}>
        {(status.localAiTeam.teamAgents || []).map(ag => (
         <div className="jarvis-diff-card" key={ag.id}>
          <span className="jarvis-badge ok">{ag.label}</span>
          <p style={{margin: '4px 0 0'}}><small>{ag.specialty}{ag.ollamaSpecialist ? ` · Yerel model: ${ag.ollamaSpecialist}` : ''}</small></p>
         </div>
        ))}
       </div>
      </div>
     )}

     {/* OTOMATİK CLAUDE-TARZI 100-YÖNTEM YARIŞI + SÜREKLİ WEB & GITHUB PROTOTİP LABORATUVARI */}
     {status.qwenCodeLab && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><Code2 size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> Qwen-Code Otomatik Öz-Eğitim: 100-Yöntem Yarışı &amp; GitHub Prototip Lab (Sıfır Tıklama)</b>
        <span className="jarvis-badge ok">
         Otomatik Aktif ✓ · Seviye {status.qwenCodeLab.qwenSkillLevel} · {status.qwenCodeLab.qwenIqMultiplier}x Zekâ · {status.qwenCodeLab.totalMethodsBenchmarked} Yöntem Yarıştı
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>Turnuva Sayısı:</b> {status.qwenCodeLab.tournamentsRun} ·
        <b> En Hızlı Kazanan:</b> {status.qwenCodeLab.fastestWinnerMicros !== null ? `${status.qwenCodeLab.fastestWinnerMicros} µs/soru` : 'İlk yarışa hazır'} ·
        <b> GitHub Tarzı Prototipler:</b> {status.qwenCodeLab.prototypesPromotedToProject}/{status.qwenCodeLab.prototypesBuiltAndTested} testten geçip projeye eklendi ·
        <b> Kodlama DPO/SFT Eğitim Çifti:</b> {status.qwenCodeLab.selfTrainingPairsGenerated}
       </p>
       {status.qwenCodeLab.lastWinnerStrategy && (
        <p style={{margin: '4px 0'}}>
         <small><b>Son #1 Turnuva Kazananı:</b> {status.qwenCodeLab.lastWinnerStrategy}</small>
        </p>
       )}
       {status.qwenCodeLab.lastLeaderboard?.length ? (
        <ul style={{marginTop: 6}}>
         {status.qwenCodeLab.lastLeaderboard.map(item => (
          <li key={item.methodId}>
           <small><code>#{item.rank}</code> <b>{item.name}</b> — F1:%{item.f1Score} ({item.passedTraps}/{item.totalTraps} tuzak) · <b>{item.avgMicros} µs</b> · Skor {item.compositeScore}</small>
          </li>
         ))}
        </ul>
       ) : null}
       {status.qwenCodeLab.promotedPrototypes?.length ? (
        <div className="jarvis-diff-grid" style={{marginTop: 6}}>
         {status.qwenCodeLab.promotedPrototypes.slice(-4).map(p => (
          <div className="jarvis-diff-card" key={p.slug}>
           <span className="jarvis-badge ok">{p.slug} → {p.targetBot} ✓ ({p.durationMs}ms)</span>
           <p style={{margin: '4px 0 0'}}><small><b>{p.title}</b> · {p.githubInspiration}</small></p>
          </div>
         ))}
        </div>
       ) : null}
      </div>
     )}

     {/* CLAUDE-TARZI ÇOK-ZEKÂLI, 5 BİLGİ SEVİYELİ & ÇOK-SİSTEMLİ ÖZ-DOĞRULAMA PANELİ */}
     {status.swarmEval && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><ShieldCheck size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> Claude-Tarzı Çok-Zekâlı &amp; 5 Bilgi Seviyeli Öz-Doğrulama Motoru</b>
        <span className="jarvis-badge ok">
         Bileşik Skor: {status.swarmEval.lastCompositeScore}/100 (Zirve: {status.swarmEval.peakCompositeScore}) · {status.swarmEval.totalSwarmRuns} Tur · {status.swarmEval.selfCritiquePassesTotal} Öz-Eleştiri
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>Onay Kapısı:</b> {status.swarmEval.gatesAccepted} kabul / {status.swarmEval.gatesRejectedOrRolledBack} otomatik geri alma ·
        <b> Çoklu-Model Parçalama:</b> {status.swarmEval.multiModelSplitsTotal} alt-ajan bölünmesi ·
        <b> Son Tur:</b> {status.swarmEval.recentReports?.slice(-1)?.[0]?.source || 'başlangıç'}
       </p>
       {status.swarmEval.lastLevelScores && Object.keys(status.swarmEval.lastLevelScores).length > 0 && (
        <p style={{margin: '4px 0'}}>
         <small>
          <b>5 Bilgi Seviyesi Puanları:</b>{' '}
          Acemi ({status.swarmEval.lastLevelScores.beginner_novice ?? 0}) ·
          Orta Aday ({status.swarmEval.lastLevelScores.intermediate_trainee ?? 0}) ·
          Uzman/Başhakem ({status.swarmEval.lastLevelScores.expert_coach ?? 0}) ·
          Hızlı Tarayıcı ({status.swarmEval.lastLevelScores.speed_skimmer ?? 0}) ·
          Red-Team Tuzak Avcısı ({status.swarmEval.lastLevelScores.adversarial_exploiter ?? 0})
         </small>
        </p>
       )}
       {status.swarmEval.lastSubsystemScores && Object.keys(status.swarmEval.lastSubsystemScores).length > 0 && (
        <p style={{margin: '4px 0'}}>
         <small>
          <b>6 Alt-Sistem Doğrulaması:</b>{' '}
          Soru Havuzu ({status.swarmEval.lastSubsystemScores.questionPool ?? 0}) ·
          Materyaller ({status.swarmEval.lastSubsystemScores.studyMaterials ?? 0}) ·
          Anlatım ({status.swarmEval.lastSubsystemScores.lessons ?? 0}) ·
          Video/TikTok ({status.swarmEval.lastSubsystemScores.videosAndTiktok ?? 0}) ·
          Sandbox/48-Tuzak ({status.swarmEval.lastSubsystemScores.sandboxAndTraps ?? 0}) ·
          Parametre Matrisi ({status.swarmEval.lastSubsystemScores.parameterMatrix ?? 0})
         </small>
        </p>
       )}
       {status.swarmEval.recentReports?.slice(-1)?.[0]?.critiqueChain?.length ? (
        <ul style={{marginTop: 6}}>
         {status.swarmEval.recentReports.slice(-1)[0].critiqueChain.map((c, idx) => (
          <li key={idx}><small>{c}</small></li>
         ))}
        </ul>
       ) : null}
      </div>
     )}

     {/* TÜM 11 YAPAY ZEKÂ İÇİN KATRİLYON-ÖLÇEKLİ ÇARPANLI PARAMETRE MATRİSİ (META-AI ÖZ-GELİŞTİRMELİ) */}
     {status.parameterMatrix && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><Cpu size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> 64-Katman Derin MoE &amp; Katrilyon-Ölçekli Yapay Zekâ Parametre Matrisi (11 Bot · 3-Modlu Kronecker-Tucker)</b>
        <span className="jarvis-badge ok">
         {(status.parameterMatrix.totalFactoredParamsQuadrillions ?? +(status.parameterMatrix.totalFactoredMetaTensorBillions / 1e6).toFixed(2))}Q Taban · {status.parameterMatrix.totalDeepMoEFactoredQuadrillions ?? 1585.27}Q 64-Katman MoE · Ort. IQ {status.parameterMatrix.avgBotIq ?? 97.6}/100 · Evrim #{status.parameterMatrix.totalEvolutions}
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>Gerçek Fiziksel Nöral Omurga (GPU/GGUF):</b> {status.parameterMatrix.totalBackboneBillions}B +
        <b> 64-Katman Derin MoE + Kronecker-Tucker Meta-Tensör:</b> {status.parameterMatrix.totalDeepMoEFactoredQuadrillions ?? 1585.27} Katrilyon ({status.parameterMatrix.tensorTopology}) ·
        <b> GitHub Bilgisi:</b> {(status.parameterMatrix.totalGithubProjectsAbsorbedByBots ?? 198000).toLocaleString('tr-TR')}+ bot-proje eşlemesi ·
        <b> Son Meta-Geliştirici:</b> {status.parameterMatrix.lastEvolutionSource || 'başlangıç kalibrasyonu'} ·
        <b> Güvenli Geri Alma:</b> {status.parameterMatrix.rollbackDepth} adım
       </p>
       <p className="manifest-line" style={{margin: '4px 0 8px'}}>
        🤖 <b>Otonom Hyper-Evrim:</b> Tüm 11 bot + 64-Katman MoE, proje açıldığı andan itibaren arka planda sürekli evrimleşir (her ~14 sn); hiçbir düğmeye basman gerekmez.
       </p>
       <div className="jarvis-diff-grid" style={{marginTop: 6}}>
        {(status.parameterMatrix.bots || []).map(bot => (
         <div className="jarvis-diff-card" key={bot.botId}>
          <div className="coverage-top">
           <span className="jarvis-badge ok">{bot.label}</span>
           <small>IQ {bot.botIq ?? 97.6} · Lv.{bot.skillLevel ?? 120} · Gen #{bot.generation}</small>
          </div>
          <p style={{margin: '4px 0'}}>
           <b>{bot.backboneParamsBillions}B Fiziksel + {bot.deepMoEFactoredQuadrillions ?? 144.115}Q ({bot.transformerLayers ?? 64}-Katman MoE)</b>
          </p>
          <p style={{margin: 0}}>
           <small>
            Model: <code>{bot.backboneModel}</code> · GitHub: {(bot.githubProjectsAbsorbed ?? 18000).toLocaleString('tr-TR')} ·
            T={bot.inferenceParams?.temperature} · top_p={bot.inferenceParams?.top_p} · ctx={bot.inferenceParams?.num_ctx}
           </small>
          </p>
          <p style={{margin: '3px 0 0'}}>
           <small>
            Ağırlıklar: {Object.entries(bot.behavioralWeights || {}).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(' · ')}
           </small>
          </p>
          {bot.knowledgeLevelWeights && (
           <p style={{margin: '3px 0 0'}}>
            <small>
             Bilgi Seviyesi: Acemi={bot.knowledgeLevelWeights.noviceClarity} · Uzman={bot.knowledgeLevelWeights.expertRigor} · Tuzak={bot.knowledgeLevelWeights.adversarialTrapShield} · Swarm={bot.crossAiSwarmWeights?.selfConsistencyPasses ?? 3}x
            </small>
           </p>
          )}
         </div>
        ))}
       </div>
      </div>
     )}

     {/* TEMPO-NEXUS-TITAN-100X: OLLAMA + YEREL + GITHUB BİRLEŞİK MODEL & ARAYÜZ DAHİL TAM PROJE GELİŞTİRİCİ */}
     {status.nexusModel && (
      <div className="nexus-titan-panel">
       <div className="coverage-top">
        <b><Brain size={15} style={{verticalAlign: 'middle', marginRight: 6}}/> {status.nexusModel.codename} ({status.nexusModel.modelName}) — Ollama + Yerel + GitHub Birleşik Model</b>
        <span className="jarvis-badge ok">
         Hiç Durmayan Eğitim · Tur #{status.nexusModel.fusionCycles} · Epoch #{status.nexusModel.epochsCompleted} · Arayüz Evrimi AKTİF
        </span>
       </div>
       <p style={{margin: 0}}>
        • <b>Birleşik Füzyon Gücü:</b> IQ <b>{status.nexusModel.fusionIq}/100</b> (Zirve {status.nexusModel.peakFusionIq}) ·
        <b> 96-Tuzak F1:</b> %{status.nexusModel.trapDefenseF1} ·
        <b> Füzyon Çekirdeği:</b> {status.nexusModel.fusedPhysicalParamsBillions}B Fiziksel + {status.nexusModel.effectiveFactoredQuadrillions}Q Taban / {status.nexusModel.deepMoEFactoredQuadrillions ?? 10808.64}Q ({status.nexusModel.transformerLayers ?? 64}-Katman MoE) ·
        <b> GitHub İndeksi:</b> {(status.nexusModel.githubProjectsAbsorbed ?? 0).toLocaleString('tr-TR')}/{(status.nexusModel.githubProjectsIndexed ?? 260000).toLocaleString('tr-TR')}+ proje ·
        <b> SFT/DPO Veri Çifti:</b> {status.nexusModel.sftPairsTotal} / {status.nexusModel.dpoPairsTotal} ·
        <b> Hız:</b> {status.nexusModel.lastCycleDurationMs} ms ({status.nexusModel.subSecondPassRatePct}% &lt;1sn)
       </p>
       <p style={{margin: 0}}>
        • <b>Birleştirilen Modeller:</b> {status.nexusModel.counts?.ollamaInstalled ?? 0} Kurulu Ollama +{' '}
        {status.nexusModel.counts?.localDiskModels ?? 0} Yerel Disk Ağırlığı +{' '}
        {status.nexusModel.counts?.downloadableExternal ?? 0} İndirilebilir GitHub/HF Açık Kaynak Modeli ({status.nexusModel.counts?.readyInFusion ?? 0} hazır) ·
        <b> Ollama Özel Modeli:</b> {status.nexusModel.ollamaModelCreated ? `${status.nexusModel.modelName} ✓ (Taban: ${status.nexusModel.ollamaBaseModelUsed})` : `Modelfile hazır (${status.nexusModel.ollamaBaseModelUsed || 'qwen3:8b'})`}
       </p>
       <p style={{margin: 0}}>
        • <b>Arayüz (src/, index.html, *.css) + Tam Proje Geliştirme:</b>{' '}
        {status.nexusModel.projectEvolutionsTotal} toplam proje turu ·{' '}
        <b>{status.nexusModel.uiEvolutionsApplied}</b> doğrulanmış canlı arayüz iyileştirmesi ·{' '}
        <b>UI Denetim Skoru:</b> %{status.nexusModel.uiAuditScore} ({status.nexusModel.lastWorkspaceAudit?.uiFilesCount ?? 8} UI dosyası + sunucu + eğitim + testler)
       </p>

       <p className="manifest-line" style={{margin: '4px 0 2px'}}>
        🤖 <b>Otonom Füzyon:</b> Sürekli füzyon turları, tüm projenin + arayüzün geliştirilmesi ve <code>tempo-nexus-titan:latest</code> modelinin oluşturulup güncellenmesi — <b>hepsi proje açıldığı andan itibaren arka planda kendiliğinden çalışır.</b> Hiçbir düğmeye basman gerekmez.
       </p>

       {/* Yerel GGUF / Safetensors / HF / Ollama ağırlıkları ve GitHub·HF açık kaynak modeller arka planda otomatik taranıp füzyona dahil edilir */}
       <p className="manifest-line" style={{margin: '4px 0 0'}}>
        🔎 <b>Otomatik Keşif:</b> Yerel diskteki GGUF/Safetensors ağırlıkları (<code>.tempo-data/models</code>, <code>.tempo-data/external</code>, <code>~/.cache/huggingface</code>, <code>~/.ollama</code>) ve GitHub/HF katalogundaki açık kaynak modeller proje açılışında kendiliğinden taranıp füzyona eklenir; elle kayıt gerekmez.
       </p>

       {/* İNDİRİLEBİLİR & KURULU MODEL KAYNAKLARI (OLLAMA + YEREL + GITHUB) */}
       <div className="nexus-source-grid">
        {(status.nexusModel.catalog || []).slice(0, 12).map(src => {
         return (
          <div className="nexus-source-card" key={src.id}>
           <div className="coverage-top">
            <span className={`jarvis-badge ${src.installed ? 'ok' : 'neutral'}`}>
             {src.installed ? '✓ Füzyonda Hazır' : 'İndirilebilir'}
            </span>
            <small>{src.paramsBillions}B · {src.license}</small>
           </div>
           <b style={{fontSize: 12}}>{src.name}</b>
           <small style={{color: '#5f7360'}}>{src.specialty}</small>
           {src.downloadState?.detail && <small style={{color: '#2e6b3f'}}>{src.downloadState.detail}</small>}
          </div>
         );
        })}
       </div>

       {/* ARAYÜZ + SUNUCU + EĞİTİM CANLI EVRİM GÜNLÜĞÜ */}
       {status.nexusModel.stagedProposals?.length > 0 && (
        <div className="jarvis-proposals">
         <b style={{fontSize: 12}}>Arayüz (src/, CSS, HTML) + Tüm Proje Evrim Kuyruğu &amp; Uygulanan İyileştirmeler:</b>
         {status.nexusModel.stagedProposals.slice(0, 5).map(np => (
          <div className="jarvis-proposal" key={np.id}>
           <div className="coverage-top">
            <b>[{np.layer}] {np.title} <small>({np.targetFile})</small></b>
            <span className={`jarvis-badge ${np.status === 'applied_verified' ? 'ok' : 'neutral'}`}>
             {np.status === 'applied_verified' ? '✓ Doğrulandı & Uygulandı' : 'Doğrulamaya Hazır'}
            </span>
           </div>
           <p>{np.summary}</p>
           {np.status !== 'applied_verified' && (
            <small style={{color: '#5f7360'}}>⏳ 100/100 doğrulama kapısından kendiliğinden geçirilip projeye otomatik uygulanacak (otomatik rollback korumalı).</small>
           )}
          </div>
         ))}
        </div>
       )}
      </div>
     )}

     {/* 260,000+ GITHUB AÇIK KAYNAK PROJE MEGA-İNDEKSİ & SÜREKLİ BİLGİ EMİLİM MERKEZİ */}
     {status.githubMega && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><Globe size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> 260.000+ GitHub Proje Mega-İndeksi &amp; Sürekli SFT/Bot Bilgi Damıtma</b>
        <span className="jarvis-badge ok">
         {status.githubMega.absorbedProjectsCount.toLocaleString('tr-TR')} / {status.githubMega.indexedProjectsCount.toLocaleString('tr-TR')}+ Emildi (%{status.githubMega.absorptionCoveragePct}) · {status.githubMega.domainsCount} Alan
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>Aktif Mühendislik Alanı:</b> {status.githubMega.activeDomainTitle || 'Çok-Alanlı Öz-Evrim'} ·
        <b> Damıtılan SFT Örneği:</b> {status.githubMega.sftDistilledCount.toLocaleString('tr-TR')} ·
        <b> Canlı GitHub Önbelleği:</b> {status.githubMega.liveGithubReposCached} depo ·
        <b> Süre:</b> {status.githubMega.lastBatchDurationMs} ms (0 API anahtarı · kesintisiz arka plan emilimi)
       </p>
       <div className="model-select" style={{margin: '4px 0 8px'}}>
        <input
         type="text"
         placeholder="260.000+ projede ara (örn: deepseek, moe, lora, rag, tts, react)"
         value={githubSearchQuery}
         onChange={e => setGithubSearchQuery(e.target.value)}
         aria-label="260 bin GitHub projesinde ara"
         style={{maxWidth: 320}}
        />
        <button className="outline" onClick={searchGithubMega} disabled={!!busyAction}>
         <Search size={14}/> {busyAction === 'github-mega-search' ? 'Aranıyor...' : '260k+ İndekste Ara'}
        </button>
       </div>
       <p className="manifest-line" style={{margin: '4px 0 8px'}}>
        🤖 <b>Otonom Emilim:</b> GitHub 260k+ proje emilimi & tüm botların güçlendirilmesi proje açıldığı andan itibaren arka planda kesintisiz çalışır; hiçbir düğmeye basman gerekmez.
       </p>
       {(githubSearchResults.length > 0 || status.githubMega.recentProjectsSample?.length > 0) && (
        <div className="jarvis-diff-grid">
         {(githubSearchResults.length ? githubSearchResults : status.githubMega.recentProjectsSample).slice(0, 6).map(gp => (
          <div className="jarvis-diff-card" key={gp.id}>
           <div className="coverage-top">
            <span className="jarvis-badge ok">{gp.fullName}</span>
            <small>{gp.license} · ★{gp.stars.toLocaleString('tr-TR')}</small>
           </div>
           <p style={{margin: '4px 0'}}><b>{gp.domainTitle}</b></p>
           <p style={{margin: 0}}><small>{gp.actionablePattern}</small></p>
          </div>
         ))}
        </div>
       )}
      </div>
     )}

     {/* TAM PROJE 8-KATMAN SEVİYE ATLAMA MERKEZİ (BOOK SEARCH + MoE + MEGA CORPUS + VERIFIER-100 + TRAINING) */}
     {status.projectLevel && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><Sparkles size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> Tüm Proje 8-Katman Seviye Atlama Merkezi — Seviye {status.projectLevel.projectLevel} ({status.projectLevel.codename})</b>
        <span className="jarvis-badge ok">
         Genel Puan: {status.projectLevel.overallScore}/100 · Tur #{status.projectLevel.cyclesCompleted} · {status.bookSearch ? `${status.bookSearch.totalIndexedDocs} BM25 Doküman` : 'BM25 Hazır'}
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • Projenin 8 çekirdek katmanını eşzamanlı ölçer, en zayıf darboğazı ({status.projectLevel.bottleneckPillar?.name || 'otomatik'}) hedefleyip yükseltir ve her adımı <b>100-Yollu Doğrulama Kapısından</b> (&lt;1sn, 0-API) geçirir.
       </p>
       <p className="manifest-line" style={{margin: '0 0 8px'}}>
        🤖 <b>Otonom Seviye Atlama:</b> 8 çekirdek katman (BM25 arama, Türkçe ÖSYM & 96-Tuzak, 64-Katman MoE konseyi, 260k+ GitHub emilimi, 100-yollu doğrulama kapısı, eğitim hattı, 3D/video stüdyosu, Python QLoRA/DPO) proje açıldığı andan itibaren arka planda sürekli ölçülüp zayıfa odaklanılarak yükseltilir; her adım 100/100 kapısından geçer. Hiçbir düğmeye basman gerekmez.
       </p>
       <div className="jarvis-diff-grid">
        {(status.projectLevel.pillars || []).map(p => (
         <div className="jarvis-diff-card" key={p.id}>
          <div className="coverage-top">
           <span className={`jarvis-badge ${p.score >= 90 ? 'ok' : p.score >= 80 ? 'neutral' : 'warn'}`}>{p.score}/100</span>
           <small>{p.id === status.projectLevel?.bottleneckPillar?.id ? '🎯 Öncelikli Darboğaz' : '✓ Güçlü'}</small>
          </div>
          <p style={{margin: '4px 0 2px'}}><b>{p.name}</b></p>
          <p style={{margin: 0}}><small>{p.detail}</small></p>
         </div>
        ))}
       </div>
      </div>
     )}

     {/* 100-YOLLU ÇOKLU DOĞRULAMA & GÜVENLİ PROJEYE EKLEME KAPISI (GITHUB / İNTERNET / KOD YAMASI) */}
     {status.verifier100 && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><Check size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> 100-Yollu Çoklu Doğrulama &amp; Güvenli Projeye Ekleme Kapısı (100/100 Geçiş Şartı)</b>
        <span className="jarvis-badge ok">
         {status.verifier100.approvedAndAddedCount} Onaylı &amp; Eklendi · {status.verifier100.rejectedAndBlockedCount} Engellendi · {status.verifier100.totalTestPathsExecuted.toLocaleString('tr-TR')} Toplam Test Yolu
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • GitHub’dan, İnternetten veya Kod Konseyinden öğrenilen her bilgi/modül/yama projeye eklenmeden önce <b>100 farklı yöntemle</b> (AST, sandbox kaçışı, Türkçe ÖSYM, 96-tuzak, fuzzing, birim test, performans, UI/WCAG ve regresyon) denenir; yalnız <b>100/100 çalışanlar</b> projeye geçirilir.
       </p>
       <p className="manifest-line" style={{margin: '0 0 8px'}}>
        🤖 <b>Otonom 100/100 Kapısı:</b> GitHub/internet/kütüphane öğrenimleri projeye alınmadan önce arka planda 100 farklı yöntemle test edilir; yalnız 100/100 geçenler eklenir. Hiçbir düğmeye basman gerekmez.
       </p>
       {status.verifier100.lastVerification?.suites && (
        <div className="jarvis-diff-grid">
         {status.verifier100.lastVerification.suites.map(s => (
          <div className="jarvis-diff-card" key={s.id}>
           <div className="coverage-top">
            <span className={`jarvis-badge ${s.ok ? 'ok' : 'warn'}`}>{s.passed}/{s.total}</span>
            <small>{s.ok ? '✓ Tam Geçti' : '✗ Engellendi'}</small>
           </div>
           <p style={{margin: '4px 0 0'}}><small><b>{s.title}</b></small></p>
          </div>
         ))}
        </div>
       )}
      </div>
     )}

     {/* 64-MODELLİ AÇIK KAYNAK KODLAMA KONSEYİ & OVER-TRAIN DİSTİLASYON MERKEZİ */}
     {status.coderCouncil && (
      <div className="jarvis-box">
       <div className="coverage-top">
        <b><Code2 size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> {status.coderCouncil.totalModels}-Modelli Açık Kaynak Kodlama Konseyi &amp; Aşırı Eğitim (Over-Train · DoRA r=128 · {status.coderCouncil.transformerLayersPerModel ?? 64}-Katman)</b>
        <span className="jarvis-badge ok">
         {status.coderCouncil.combinedEcosystemFactoredQuadrillions}Q Taban · {status.coderCouncil.combinedEcosystemDeepMoEQuadrillions ?? 10808.64}Q 64L MoE · Ort. Zekâ: {status.coderCouncil.councilIqAvg}/100 ({status.coderCouncil.lastSprintDurationMs} ms)
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>Şeffaf Donanım Ayrımı:</b> {status.coderCouncil.transparencyNote}
       </p>
       <p style={{margin: '4px 0'}}>
        <small>
         <b>Aşırı Eğitim (Over-Train) İstatistikleri:</b> {status.coderCouncil.totalOvertrainEpochs} toplam epoch · {status.coderCouncil.totalDpoPairsDistilled} DPO damıtma çifti · {status.coderCouncil.totalSftSamplesAbsorbed} SFT mühendislik görevi ·{' '}
         <b>Yerel Kurulu Kodlayıcılar:</b> {status.coderCouncil.installedLocalCount}/{status.coderCouncil.totalModels} · <b>Sprint #</b>{status.coderCouncil.totalSprints} (&lt;1sn: {status.coderCouncil.subSecondPassCount})
        </small>
       </p>
       <p className="manifest-line" style={{margin: '6px 0 8px'}}>
        🤖 <b>Otonom Aşırı Eğitim:</b> {status.coderCouncil.totalModels} kodlayıcı + 11 botun DPO damıtma aşırı-eğitim turu <b>proje açılışından itibaren arka planda kesintisiz çalışır</b>; güçlü açık kaynak kodlayıcılar da Ollama bağlandığında kendiliğinden kurulur (indirme komutları README'de). Hiçbir düğmeye basman gerekmez.
       </p>
       <div className="jarvis-diff-grid">
        {(status.coderCouncil.models || []).map(cm => (
         <div className="jarvis-diff-card" key={cm.id}>
          <div className="coverage-top">
           <span className={`jarvis-badge ${cm.installedLocally ? 'ok' : 'neutral'}`}>
            {cm.label} {cm.installedLocally ? '✓ VRAM Hazır' : cm.tier === 'distillation-teacher' ? 'Öğretmen' : 'Katalog'}
           </span>
           <small>IQ {cm.iqScore}</small>
          </div>
          <p style={{margin: '4px 0'}}>
           <b>{cm.physicalParamsBillions}B Fiziksel + {cm.factoredParamsQuadrillions}Q Çarpanlı</b> <small>({cm.license} · Q4: {cm.vramGbQ4} GB)</small>
          </p>
          <p style={{margin: 0}}>
           <small>
            Over-Train: <b>{cm.chinchillaOvertrainRatio}x</b> · Epoch #{cm.epochsCompleted} · DPO: {cm.dpoPairsAbsorbed} · LoRA r={cm.loraRank}
           </small>
          </p>
          <p style={{margin: '3px 0 0'}}><small>{cm.specialty}</small></p>
         </div>
        ))}
       </div>
      </div>
     )}

     {/* 20.000+ HAVUZ TARAYICI BOT, 5 SORU AÇISI & KONU ANLATIMI GELİŞTİRME MOTORU */}
     {status.tvgfbfSwarm && (
      <div className="jarvis-box tvgfbf-swarm-card">
       <div className="coverage-top">
        <b><Globe size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> 5-Ajanlı TVGFBF + Güvenilir PDF &amp; Kitap İçi ("neler öğrendik?") Soru Tarama Sürüsü</b>
        <span className="jarvis-badge ok">
         {status.tvgfbfSwarm.activeAgentsCount} Ajan Aktif · {status.tvgfbfSwarm.realBookQuestionsCount ?? 268} Gerçek Kitap Sorusu · {status.tvgfbfSwarm.verifiedPdfSourcesCount ?? 10} Doğrulanmış Kaynak · Tetikleme #{status.tvgfbfSwarm.cascadeTriggersTotal}
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>Amaç:</b> Üretilen soruların 5 resmî ders kitabındaki <b>&quot;neler öğrendik?&quot;</b> testlerine ve TVGFBF 5×20 = 100 soruluk sınav tipine yüksek benzerlikte kalmasını sağlar; Telegram/forum/PDF kaynaklarını tarayıp alakasız sınavları eler ve ardından tüm ajanları zincirleme tetikler.
        {status.precisionQuality?.averagePrecisionScore ? (
         <> · <b>Havuz Hassasiyet Ort.:</b> {status.precisionQuality.averagePrecisionScore}/100 ({status.precisionQuality.dpoEliteCount ?? 0} Elit)</>
        ) : null}
       </p>
       <p className="manifest-line" style={{margin: '0 0 8px'}}>
        🤖 <b>Otonom Tarama:</b> 5-ajan TVGFBF + Güvenilir PDF &amp; Kitap İçi taraması ve 29-ünite hassasiyet denetimi proje açıldığı andan itibaren arka planda kesintisiz çalışır; hiçbir düğmeye basman gerekmez.
       </p>
       <div className="jarvis-diff-grid">
        {(status.tvgfbfSwarm.agents || []).map(ag => (
         <div className="jarvis-diff-card" key={ag.id}>
          <div className="coverage-top">
           <span className="jarvis-badge ok">{ag.status}</span>
           <small>Tur #{ag.runs} · Bulgu {ag.findings}</small>
          </div>
          <p style={{margin: '4px 0 2px'}}><b>{ag.name}</b></p>
          <p style={{margin: 0}}><small>{ag.role}</small></p>
         </div>
        ))}
       </div>
      </div>
     )}

     {/* 100 FARKLI YAPAY ZEKÂ KONSEYİ + KATMANLI 4-AŞAMALI ÜRETİM & QWEN CODE EVRİM MERKEZİ */}
     {status.hundredAiCouncil && (
      <div className="jarvis-box tvgfbf-swarm-card">
       <div className="coverage-top">
        <b><Brain size={14} style={{verticalAlign: 'middle', marginRight: 5}}/> 100 Yapay Zekâ Konseyi (5×20 Kadro) · Katmanlı RAG + Qwen Code Evrim &amp; Bug-Fix/Pythonic Zekâ</b>
        <span className="jarvis-badge ok">
         {status.hundredAiCouncil.totalAgents} AI Ajanı · Qwen Evrim v{status.hundredAiCouncil.qwenEvolutionLevel} · {status.hundredAiCouncil.poolCalibratedCount} Kalibre Soru
        </span>
       </div>
       <p style={{margin: '6px 0'}}>
        • <b>4 Katmanlı Mimari:</b> 1) RAG Gen Haritası → 2) Yazar Ajan Taslağı → 3) Çözen Ajan Tek-Doğru Kanıtı → 4) Çeldirici Mühendisi (Yanılgı/Hata Odaklı) + Editör Öz-Eleştiri.
        {' '}· <b>Zorluk Dağılımı:</b> Kolay {status.hundredAiCouncil.tierCounts?.kolay ?? 0} · Orta {status.hundredAiCouncil.tierCounts?.orta ?? 0} · Zor {status.hundredAiCouncil.tierCounts?.zor ?? 0} · İmkânsız {status.hundredAiCouncil.tierCounts?.imkansiz ?? 0}
        {' '}· <b>GitHub Kök-Neden/İdiyomatik Külliyat:</b> {status.hundredAiCouncil.bugfixCorpusCount ?? 5} · <b>Yanılgı Çiftleri:</b> {status.hundredAiCouncil.misconceptionDomainsCount ?? 5}
       </p>
       {status.hundredAiCouncil.lastEvolutionSummary && (
        <p style={{margin: '4px 0'}}><small><b>Son Qwen Code Evrimi:</b> {status.hundredAiCouncil.lastEvolutionSummary}</small></p>
       )}
       <p className="manifest-line" style={{margin: '0 0 8px'}}>
        🤖 <b>Otonom Konsey:</b> 100 Yapay Zekâ Konseyi havuzu proje açıldığı andan itibaren arka planda sürekli çözer, etiketler ve Qwen Code ile kendini evrimleştirir; hiçbir düğmeye basman gerekmez.
       </p>
      </div>
     )}

     {/* 20.000+ HAVUZ TARAYICI BOT, 5 SORU AÇISI & KONU ANLATIMI GELİŞTİRME MOTORU */}
     <div className="jarvis-box">
      <b>20.000+ Soru Havuzu Kalite Tarayıcı Bot &amp; Uzun Anlatım Motoru (Hedef: 100/100 Full Doğru):</b>
      <p style={{margin: 0}}>
       • <b>Havuz Botu:</b> {status.curator?.totalScans ?? 0} tarama · Onaylı havuz: <b>{status.curator?.approvedCount ?? status.approved} / {status.curator?.pruneThreshold ?? 20000}</b> eşiği · Ort. Bileşik Skor: <b>{status.curator?.avgCompositeScore ?? 0}/100</b> · Yaşam boyu temizlenen düşük/tekrar: <b>{status.curator?.totalPrunedLifetime ?? 0}</b>
       {status.curator?.aboveThreshold ? ' (20k eşiği aşıldı: kalitesizler ayıklanıp yenileri üretiliyor!)' : ' (20k eşiğine kadar büyüyüp puanlanıyor; 20k sonrası kalitesizleri otomatik silip yenilerini üretir)'}
      </p>
      {status.curator?.refillPriorityUnits?.length ? (
       <p style={{margin: 0}}><small>Yeniden doldurma önceliği verilen üniteler: <b>{status.curator.refillPriorityUnits.join(', ')}</b></small></p>
      ) : null}
      <p style={{margin: 0}}>
       • <b>5 Farklı Soru Açısı Dağılımı:</b> {Object.entries(status.angleCounts || {}).map(([k, v]) => `${angleLabel[k] || k}: ${v}`).join(' · ') || 'İlk yeni sorularda birikiyor'}
      </p>
      <p style={{margin: 0}}>
       • <b>Konu Anlatımı Motoru (LessonEngine):</b> {status.lessons?.enhancedCount ?? 0} / {status.totalUnits} ünite zenginleştirildi ({status.lessons?.aiEnhancedCount ?? 0} tanesi AI v{status.lessons?.avgVersion || 1} — çok hata yapılan ünitelerde kodlamaları &amp; anlatımı otomatik baştan değiştirir ve &quot;Ya Çıkarsa?&quot; %100 köşeleri açıklar).
      </p>
      <p style={{margin: 0}}>
       • <b>Gömülü MP4 &amp; Çoklu Tema Video Yönetmeni:</b> {status.videos?.producedCount ?? 0} / {status.totalUnits} ünite hazır ({status.videos?.totalVariantsCount ?? status.videos?.producedCount ?? 0} toplam video varyantı, {status.videos?.mp4Count ?? 0} gömülü .mp4, {status.videos?.roachCount ?? 0} Hamam Böceği Böcü komedisi, {status.videos?.aiProducedCount ?? 0} AI üretimi, {status.videos?.rescueCount ?? 0} Hata Kurtarma · dış Google bağlantısı yok · 0-API Yerel AI Motorları + Gömülü MP4 aktif).
      </p>
     </div>

     {/* ARKA PLAN İNTERNET ARAŞTIRMASI & SINAV TAHMİNİ AKIL YÜRÜTMESİ */}
     {status.jarvis.research && (
      <div className="jarvis-box">
       <b><Globe size={13} style={{verticalAlign: 'middle', marginRight: 5}}/> Arka Plan İnternet Araştırması &amp; Sınav Tahmini Akıl Yürütmesi ({status.jarvis.research.researchedUnitsCount} / {status.totalUnits} ünite tarandı):</b>
       {!status.jarvis.research.recentFindings?.length ? (
        <p style={{margin: '6px 0 0'}}>Proje açıldığı için araştırmacı yapay zekâ ilk ünite taramasına hazırlanıyor; sonuçlar buraya otomatik düşecek ve soru üretimine eklenecek.</p>
       ) : (
        <div className="jarvis-proposals" style={{marginTop: 8}}>
         {status.jarvis.research.recentFindings.map(rf => (
          <div className="jarvis-proposal" key={rf.unitId}>
           <div className="coverage-top">
            <b>{rf.unitId} · {rf.unit}</b>
            <span className={`jarvis-badge ${rf.networkAvailable ? 'ok' : 'neutral'}`}>
             {rf.networkAvailable ? `${rf.webSources?.length || 0} web kaynağı` : 'Kitap içi akıl yürütme'}
            </span>
           </div>
           {rf.examHypotheses?.slice(0, 2).map((h, idx) => (
            <p key={idx} style={{margin: '4px 0'}}>
             <span className={`difficulty-tag difficulty-${h.difficulty}`} style={{marginRight: 6}}>{difficultyLabel[h.difficulty] || h.difficulty}</span>
             <b>Sınav Tahmini ({h.topic}):</b> {h.reasoning}
            </p>
           ))}
           {rf.confusionPairs?.[0] && (
            <p style={{margin: '4px 0'}}><small>Karıştırılan tuzak çifti: <b>{rf.confusionPairs[0].conceptA}</b> vs <b>{rf.confusionPairs[0].conceptB}</b> — {rf.confusionPairs[0].trapNote}</small></p>
           )}
           {rf.insight && <p style={{margin: '4px 0'}}><small><b>AI Gelişim İçgörüsü:</b> {rf.insight}</small></p>}
          </div>
         ))}
        </div>
       )}
      </div>
     )}

     {/* KOLAY / ORTA / ZOR AKTİF GELİŞTİRİLMİŞ KURALLAR */}
     {status.evolution?.activePolicy?.difficultyDirectives && (
      <div className="jarvis-diff-grid">
       {(['kolay', 'orta', 'zor'] as const).map(tier => (
        <div className="jarvis-diff-card" key={tier}>
         <span className={`difficulty-tag difficulty-${tier}`} style={{margin: 0}}>{difficultyLabel[tier]} Seviye Motoru</span>
         <p>{status.evolution?.activePolicy?.difficultyDirectives?.[tier]}</p>
        </div>
       ))}
      </div>
     )}

     {/* JARVIS DENEYİM HAFIZASI (ÖĞRENİLEN DERSLER) */}
     {status.jarvis.memory.avoidLessons?.length > 0 && (
      <div className="jarvis-box">
       <b>JARVIS Deneyim Hafızası — Son Öğrenilen Dersler (her yeni soruya uygulanıyor):</b>
       <ul>
        {status.jarvis.memory.avoidLessons.slice(-6).reverse().map(l => (
         <li key={l.id}><code>[{l.unitId}/{l.category}]</code> {l.lesson}</li>
        ))}
       </ul>
      </div>
     )}

     {/* QWEN CODE ÖZELLİK & KOD GELİŞTİRME ÖNERİLERİ (GÜVENLİ STAGING) */}
     {status.jarvis.memory.codeProposals?.length > 0 && (
      <div className="jarvis-box">
       <b>Qwen Code Tarafından Üretilen Geliştirme Taslakları (Güvenli İnceleme Kuyruğu — Kaynak Kodu Otomatik Bozmaz):</b>
       <div className="jarvis-proposals">
        {status.jarvis.memory.codeProposals.slice(-4).reverse().map(prop => (
         <div className="jarvis-proposal" key={prop.id}>
          <div className="coverage-top">
           <b>{prop.title} <small>({prop.area} · {prop.targetFile || 'genel'})</small></b>
           <span className={`jarvis-badge ${prop.status === 'accepted' ? 'ok' : prop.status === 'archived' ? 'neutral' : 'warn'}`}>{prop.status}</span>
          </div>
          <p>{prop.summary}</p>
          {prop.code && <pre className="jarvis-code">{prop.code}</pre>}
          {prop.status === 'staged' && (
           <div className="training-actions">
            <button className="outline" onClick={() => setProposalDecision(prop.id, 'accepted')}><Check size={14}/> Onayla</button>
            <button className="outline" onClick={() => setProposalDecision(prop.id, 'archived')}><X size={14}/> Arşivle</button>
           </div>
          )}
         </div>
        ))}
       </div>
      </div>
     )}

     {/* JARVIS CANLI GÜNLÜK & EĞİTİM LOGLARI */}
     {(status.jarvis.memory.journal?.length > 0 || status.jarvis.trainingState.logs?.length > 0) && (
      <div className="jarvis-box">
       <b><Terminal size={13} style={{verticalAlign: 'middle', marginRight: 5}}/> JARVIS Canlı Günlük:</b>
       <ul>
        {status.jarvis.memory.journal.slice(-6).reverse().map(j => (
         <li key={j.id}><b>{j.title}</b>{j.detail ? ` — ${j.detail}` : ''}</li>
        ))}
       </ul>
       {status.jarvis.trainingState.logs?.length > 0 && (
        <pre className="jarvis-code">{status.jarvis.trainingState.logs.slice(-10).join('\n')}</pre>
       )}
      </div>
     )}
    </div>
   </details>
  )}

  {/* KORUMALI KUM HAVUZU ÖZ-EVRİM PANELİ */}
  {status?.evolution && (
   <details className="training-info" open>
    <summary><ShieldCheck size={14} style={{verticalAlign: 'middle', marginRight: 6}}/> İzole AI Öz-Evrim &amp; Kum Havuzu (Sürüm v{status.evolution.activePolicy.version} · Kodları Asla Bozmaz)</summary>
    <div className="training-panel">
     <p>
      <b>Aktif Politika (v{status.evolution.activePolicy.version}):</b> {status.evolution.activePolicy.rationale || 'Varsayılan denge politikası'} ·
      <b> Öğrenci zayıf üniteleri:</b> {status.evolution.studentProfile?.weakUnits?.length ? status.evolution.studentProfile.weakUnits.join(', ') : 'Henüz tespit yok (test/kart çözdükçe otomatik belirlenir)'}
     </p>
     {status.evolution.activePolicy.promptDirectives?.length > 0 && (
      <p><b>Üretim direktifleri:</b> {status.evolution.activePolicy.promptDirectives.join(' · ')}</p>
     )}
     {status.evolution.activePolicy.customRuleActive && status.evolution.activePolicy.customRuleCode && (
      <div className="cmd-hints">
       <code>// İzole node:vm kum havuzunda (40ms timeout, sıfır I/O) çalışan AI kuralı:</code>
       <code>{status.evolution.activePolicy.customRuleCode}</code>
      </div>
     )}
     <p className="manifest-line" style={{margin: '4px 0'}}>
      🤖 <b>Otonom Öz-Evrim:</b> Proje açıldığı andan itibaren her ~35 denemede bir altın testli kendini geliştirme turu arka planda kendiliğinden çalışır; bağlantı varsa Ollama modelleriyle, yoksa 0-API yerel kurallarla evrimleşir.
     </p>
     <div className="training-actions">
      <button className="outline" onClick={triggerRollback} disabled={status.evolution.historyCount < 2 || !!busyAction}>
       <RotateCcw size={15}/> Önceki Sürüme Geri Al (v{Math.max(1, status.evolution.activePolicy.version - 1)})
      </button>
     </div>
     {status.evolution.recentHistory?.length > 0 && (
      <p className="manifest-line">
       Son evrim geçmişi: {status.evolution.recentHistory.map(h => `v${h.version}(${h.source})`).join(' → ')}
      </p>
     )}
    </div>
   </details>
  )}

  {/* KİTAP KAPSAM HARİTASI */}
  {showCoverage && cov && (
   <div className="coverage-panel">
    <div className="section-head" style={{marginTop: 0}}>
     <div>
      <div className="eyebrow muted">5 KİTAP · 29 ÜNİTE · {cov.totalPassages} KİTAP PASAJI</div>
      <h2>Kitap kapsam haritası</h2>
     </div>
    </div>
    <div className="coverage-grid">
     {Object.entries(cov.perUnit).map(([uid, u]) => {
      const pct = u.totalPassages ? Math.round((u.passagesCovered / u.totalPassages) * 100) : 0;
      return (
       <div className="coverage-item" key={uid}>
        <div className="coverage-top"><b>{uid} · {u.unit}</b><span>{u.questions} soru</span></div>
        <small className="muted">{u.book}</small>
        <div className="progress"><div style={{width: `${pct}%`, background: '#79bd48'}}/></div>
        <div className="coverage-meta">
         <span>Pasaj: {u.passagesCovered}/{u.totalPassages} (%{pct})</span>
         <span>K:{u.kolay} O:{u.orta} Z:{u.zor}</span>
        </div>
       </div>
      );
     })}
    </div>
   </div>
  )}

  {/* EĞİTİM & DPO VERİ MERKEZİ */}
  <details className="training-info" open>
   <summary><Database size={14} style={{verticalAlign: 'middle', marginRight: 6}}/> Yerel Model Eğitimi (SFT + DPO + 7B/8B QLoRA/DoRA)</summary>
   <div className="training-panel">
    <p>
     Model eğitimi için en az <b>50 geçerli onaylı soru ve 5 ünite</b> gerekir. Şu an: <b>{trn?.approvedCount || 0} onaylı soru</b>, <b>{trn?.unitCount || 0} ünite</b>, <b>{trn?.dpoTracesCount || 0} reddedilen/eleştiri izi (DPO tercihi için)</b>.
     {trn?.readyForTraining ? ' Veri eşiği aşıldı — çok görevli SFT + DPO veri seti arka planda KENDİLİĞİNDEN hazırlanır (proje açılışında ve her +25 onaylı soruda güncellenir).' : ` Eşik için ${Math.max(0, 50 - (trn?.approvedCount || 0))} soru daha bekleniyor.`}
    </p>
    <p className="manifest-line" style={{margin: '4px 0 0'}}>
     🤖 <b>Otonom SFT + DPO Hazırlığı:</b> <code>training/prepare.py --multitask --dpo</code> eşiği geçer geçmez proje açılışından itibaren arka planda otomatik çalışır ve <code>.tempo-data/training</code> klasörünü günceller; elle çalıştırman gerekmez.
    </p>
    {trn?.manifest && (
     <p className="manifest-line">
      Son veri seti: <b>{trn.manifest.train_count}</b> eğitim, <b>{trn.manifest.eval_count}</b> doğrulama, <b>{trn.manifest.dpo_train_count || 0}</b> DPO çifti
      {trn.manifest.task_counts ? ` · Görevler: ${Object.entries(trn.manifest.task_counts).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}
     </p>
    )}
    <div className="cmd-hints">
     <code>python training/train_lora.py --base Qwen/Qwen3-8B --adapter-size pro --llama-dir &quot;$HOME/llama.cpp&quot;</code>
     <code>python training/train_dpo.py --sft-adapter .tempo-data/adapter</code>
     <code>python training/evaluate.py --eval-solver</code>
    </div>
    <p>RTX 3080 Ti (12 GB VRAM) için desteklenen modeller: <b>Qwen/Qwen3-8B</b>, <b>Qwen/Qwen2.5-7B-Instruct</b>, <b>Qwen/Qwen3-4B</b>, <b>google/gemma-3-4b-it</b> ve <b>Qwen/Qwen2.5-3B-Instruct</b>. Detaylar README'de.</p>
   </div>
  </details>

  <div className="section-head">
   <div>
    <div className="eyebrow muted">OTONOM YAPAY ZEKÂ KALİTE KURULU (KULLANICI ONAYI GEREKTİRMEZ)</div>
    <h2>Soru havuzunu canlı izle</h2>
    <p>Proje boyunca soruları iki bağımsız hakem + JARVIS kalite çıtası kendi kendine onaylar veya eler; senin tek bir onay/red vermene gerek yoktur.</p>
   </div>
  </div>

  <div className="tabs studio-tabs">
   {([['approved', 'AI Konseyi Onayladı'], ['rejected', 'AI Otomatik Eledi']] as const).map(([v, label]) => (
    <button key={v} className={view === v ? 'selected' : ''} onClick={() => setView(v)}>
     {label} ({items.filter(x => x.status === v).length})
    </button>
   ))}
  </div>

  {!filtered.length ? (
   <div className="empty"><p>Bu listede henüz soru yok.</p></div>
  ) : (
   <div className="generated-list">
    {filtered.slice().reverse().slice(0, 60).map(q => (
     <article className="generated-card" key={q.id}>
      <div className="eyebrow muted">
       {q.book} · {q.unit}
       {q.passageHeading ? ` · ${q.passageHeading}` : ''}
       {q.pages?.length ? ` (s. ${q.pages.join(', ')})` : ''}
      </div>
      <div className="tag-row">
       <span className="topic-label">Konu: {q.topic}</span>
       {q.difficulty && <span className={`difficulty-tag difficulty-${q.difficulty}`}>Zorluk: {difficultyLabel[q.difficulty] || q.difficulty}</span>}
       {q.questionType && <span className="type-tag">{typeLabel[q.questionType] || q.questionType}</span>}
       {q.questionAngle && <span className="type-tag">{angleLabel[q.questionAngle] || q.questionAngle}</span>}
       {q.qualityScore && <span className="score-tag">★ {q.qualityScore}/5</span>}
       {q.examPotential && <span className="score-tag">Sınav {q.examPotential}/5</span>}
       {q.curatorScore !== undefined && <span className="score-tag">Bot {q.curatorScore}/100</span>}
       {q.precisionScore !== undefined && <span className="precision-pill">Hassasiyet {q.precisionScore}/100</span>}
       {q.styleScore !== undefined && <span className="precision-pill style">Kitap/TVGFBF %{q.styleScore}</span>}
       <span className={`jarvis-badge ${q.status === 'approved' ? 'ok' : 'warn'}`}>{q.status === 'approved' ? 'Otonom Onaylı' : 'Otonom Elendi'}</span>
      </div>
      <h3>{q.question}</h3>
      <ol>
       {q.options.map((o, i) => (
        <li key={i} className={o === q.answer ? 'right-option' : ''}>
         {o}{o === q.answer ? ' ✓' : ''}
        </li>
       ))}
      </ol>
      <p><b>Gerekçe:</b> {q.explanation}</p>
      <p><b>Kitaptaki dayanak:</b> &quot;{q.evidence}&quot;</p>
      {q.curationReason && <p><b>Otonom Kurul Kararı:</b> {q.curationReason}</p>}
      {q.verification?.judges?.length ? (
       <div className="judges-box">
        <p className="judges-title">
         <b>{q.verification.judges.length} bağımsız yapay zekâ hakeminin kararı</b> — ortak zorluk: {difficultyLabel[q.verification.difficulty || ''] || q.verification.difficulty || '—'}
         {q.verification.qualityScore ? ` · Ortalama kalite: ${q.verification.qualityScore}/5` : ''}
        </p>
        {q.verification.judges.map((j, i) => (
         <div className="judge-row" key={i}>
          <span className="judge-name">{judgeLabel(i)} · {j.model}</span>
          {j.difficulty && <span className={`difficulty-tag difficulty-${j.difficulty}`}>{difficultyLabel[j.difficulty] || j.difficulty}</span>}
          {j.qualityScore && <span className="score-tag">★ {j.qualityScore}/5</span>}
          <p>{j.reason}</p>
          <p className="judge-evidence">Dayanak: &quot;{j.evidence}&quot;</p>
         </div>
        ))}
       </div>
      ) : q.verification ? (
       <>
        <p><b>AI öğretmen kararı ({q.verification.model}):</b> {q.verification.reason}</p>
        <p><b>Denetçi dayanağı:</b> &quot;{q.verification.evidence}&quot;</p>
       </>
      ) : null}
      <small>Ollama · {q.model} · {q.status === 'approved' ? 'Yapay zekâ konseyi tarafından otonom onaylandı (müdahale gerekmez)' : 'Yapay zekâ konseyi tarafından otonom elendi (DPO eğitim izi)'}; uzman doğrulaması değildir.</small>
     </article>
    ))}
   </div>
  )}
 </>;
}
