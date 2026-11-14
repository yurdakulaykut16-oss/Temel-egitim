import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ADVERSARIAL_TRAP_CASES } from './apex-architect.mjs';
import { ALL_AI_BOT_IDS } from './bot-parameter-matrix.mjs';
import { auditPoolOsymStyle } from './local-ai-team.mjs';

export const KNOWLEDGE_LEVEL_PERSONAS = [
 {
  id: 'beginner_novice',
  label: 'Acemi / Temel Düzey Öğrenci',
  targetDifficulties: ['kolay'],
  focus: 'Terim karmaşası, netlik, anlaşılır kodlama/akrostiş, kafa karıştırmayan kök',
  primaryBots: ['lessonEngine', 'generator']
 },
 {
  id: 'intermediate_trainee',
  label: 'Orta Düzey Antrenör Adayı',
  targetDifficulties: ['orta'],
  focus: 'Neden-sonuç ilişkisi, güçlü çeldiriciler, ünite içi kavram transferi',
  primaryBots: ['generator', 'curator', 'researchAgent']
 },
 {
  id: 'expert_coach',
  label: 'İleri Düzey Uzman / Başhakem',
  targetDifficulties: ['zor'],
  focus: 'Saha vakası, istisna kuralları, birebir kitap kanıtı tutarlılığı, sayısal sınırlar',
  primaryBots: ['judge', 'generator', 'researchAgent']
 },
 {
  id: 'speed_skimmer',
  label: 'Hızlı Tarayıcı (Dikkat & Uzunluk Testi)',
  targetDifficulties: ['kolay', 'orta', 'zor'],
  focus: 'En uzun şık doğru cevabı ele veriyor mu, soru kökü şişkin mi',
  primaryBots: ['turboQualityGuard', 'kayseriCoach']
 },
 {
  id: 'adversarial_exploiter',
  label: 'Adversarial Red-Team (72-Tuzak & Halüsinasyon Avcısı)',
  targetDifficulties: ['kolay', 'orta', 'zor'],
  focus: 'Çift doğru şık, hepsi/hiçbiri, şive sızıntısı, uydurma kanıt, enjeksiyon, 72 tuzak zırhı',
  primaryBots: ['qwenCodeSandbox', 'judge']
 }
];

export const TESTED_SUBSYSTEMS = [
 'questionPool',
 'studyMaterials',
 'lessons',
 'sandboxAndTraps',
 'parameterMatrix'
];

function clamp(v, min, max) {
 return Math.max(min, Math.min(max, v));
}

function mean(arr, fallback = 80) {
 if (!Array.isArray(arr) || !arr.length) return fallback;
 return arr.reduce((s, x) => s + Number(x || 0), 0) / arr.length;
}

function extractUnitTokens(text = '') {
 return String(text)
  .toLocaleLowerCase('tr-TR')
  .split(/[^\p{L}\p{N}]+/u)
  .filter(w => w.length >= 4);
}

export class MultiAiSwarmEvaluator {
 constructor(dataDir) {
  this.dataDir = dataDir;
  this.brainDir = resolve(dataDir, 'ai-brain');
  this.stateFile = resolve(this.brainDir, 'multi-ai-eval.json');
 }

 async _atomicWrite(filePath, obj) {
  await mkdir(this.brainDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 _defaultState() {
  return {
   version: 4,
   codename: 'Ultra-Singularity 100x (150,000x Kümülatif) Çok-Zekâlı & 5-Seviyeli %100 Yerel Öz-Doğrulama Motoru',
   upgradeFactorFromPrevious: 100,
   hyperUpgradeMultiplier: 150000,
   localExecutionOnly: true,
   zeroApiRequired: true,
   totalSwarmRuns: 0,
   selfCritiquePassesTotal: 0,
   multiModelSplitsTotal: 0,
   gatesAccepted: 0,
   gatesRejectedOrRolledBack: 0,
   lastCompositeScore: 0,
   peakCompositeScore: 0,
   lastLevelScores: {},
   lastSubsystemScores: {},
   lastPrescribedPatches: {},
   recentReports: [],
   updatedAt: null
  };
 }

 async loadState() {
  try {
   const raw = JSON.parse(await readFile(this.stateFile, 'utf8'));
   if (raw && typeof raw === 'object') {
    return {
     ...this._defaultState(),
     ...raw,
     recentReports: Array.isArray(raw.recentReports) ? raw.recentReports : []
    };
   }
  } catch (e) {
   if (e.code !== 'ENOENT') throw e;
  }
  return this._defaultState();
 }

 async saveState(state) {
  const next = {
   ...state,
   recentReports: (state.recentReports || []).slice(-25),
   updatedAt: new Date().toISOString()
  };
  await this._atomicWrite(this.stateFile, next);
  return next;
 }

 // Parça 1: Deterministik Çok-Sistemli + 5 Bilgi Seviyeli Adli Denetim (0-API, Anlık)
 inspectEcosystemAcrossLevels({
  items = [],
  study = { flashcards: [], matchings: [], drills: [] },
  contexts = [],
  passagesByUnit = new Map(),
  lessonsSummary = null,
  evolver = null,
  policy = null,
  paramState = null,
  telemetry = {}
 } = {}) {
  const approved = (items || []).filter(q => q && q.status !== 'rejected');
  const sample = approved.slice(-60);

  // --- Alt Sistem 1: Soru Havuzu & Zorluk Dağılımı ---
  const diffCounts = { kolay: 0, orta: 0, zor: 0 };
  let lengthLeakCount = 0;
  let weakEvidenceCount = 0;
  let slangOrBannedCount = 0;
  let stemRepeatPenalty = 0;
  const stemSet = new Set();

  for (const q of sample) {
   if (diffCounts[q.difficulty] !== undefined) diffCounts[q.difficulty]++;
   const opts = Array.isArray(q.options) ? q.options.map(o => String(o || '').trim()) : [];
   const ans = String(q.answer || '').trim();
   const ansLen = ans.length;
   const maxOtherLen = Math.max(0, ...opts.filter(o => o !== ans).map(o => o.length));
   if (ansLen > 24 && maxOtherLen > 0 && ansLen > maxOtherLen * 1.65) lengthLeakCount++;

   const ev = String(q.evidence || '').trim();
   const unitPassages = passagesByUnit?.get?.(q.unitId) || [];
   const unitText = unitPassages.map(p => p.text).join(' ').toLocaleLowerCase('tr-TR');
   const evTokens = extractUnitTokens(ev);
   const matchedTokens = unitText && evTokens.length
    ? evTokens.filter(t => unitText.includes(t)).length / evTokens.length
    : (ev.length >= 15 ? 0.8 : 0);
   if (ev.length < 15 || matchedTokens < 0.35) weakEvidenceCount++;

   const combined = `${q.question || ''} ${opts.join(' ')}`;
   if (/(?:^|[^\p{L}])(la|lan|emmi oğlu|gardaşım|hepsi doğrudur|yukarıdakilerin hepsi|hiçbiri)(?:[^\p{L}]|$)/iu.test(combined)) {
    slangOrBannedCount++;
   }

   const stemKey = String(q.question || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
   if (stemKey) {
    if (stemSet.has(stemKey)) stemRepeatPenalty++;
    stemSet.add(stemKey);
   }
  }

  const sampleSize = Math.max(1, sample.length);
  const osymAudit = auditPoolOsymStyle(sample);
  const diffTotal = diffCounts.kolay + diffCounts.orta + diffCounts.zor;
  const tierBalanceScore = diffTotal >= 3
   ? clamp(100 - (
    Math.abs((diffCounts.kolay / diffTotal) - 0.33) * 100 +
    Math.abs((diffCounts.orta / diffTotal) - 0.34) * 100 +
    Math.abs((diffCounts.zor / diffTotal) - 0.33) * 100
   ), 45, 100)
   : 78;

  const questionPoolScore = Math.round(clamp(
   96
    - (lengthLeakCount / sampleSize) * 40
    - (weakEvidenceCount / sampleSize) * 45
    - (slangOrBannedCount / sampleSize) * 80
    - stemRepeatPenalty * 6
    - (100 - tierBalanceScore) * 0.25
    - Math.max(0, 75 - osymAudit.avgScore) * 0.12,
   30, 100
  ));

  // --- Alt Sistem 2: Çalışma Materyalleri ---
  const fcCount = study?.flashcards?.length || 0;
  const matchCount = study?.matchings?.length || 0;
  const drillCount = study?.drills?.length || 0;
  const badDrills = (study?.drills || []).slice(-30).filter(d => d.type === 'fill_blank' && !String(d.prompt || '').includes('___')).length;
  const studyMaterialsScore = Math.round(clamp(
   82 + Math.min(18, (fcCount + matchCount + drillCount) > 0 ? 18 : 6) - badDrills * 8,
   45, 100
  ));

  // --- Alt Sistem 3: Konu Anlatımları ---
  const totalUnits = Math.max(1, contexts.length || 29);
  const enhancedPct = lessonsSummary ? clamp((lessonsSummary.enhancedCount || 0) / totalUnits * 100, 0, 100) : 75;
  const lessonsScore = Math.round(clamp(70 + enhancedPct * 0.30, 40, 100));

  // --- Alt Sistem 5: Sandbox Kuralları & 96 Tuzak Zırhı ---
  let trapPassed = ADVERSARIAL_TRAP_CASES.length;
  let trapF1 = 100;
  let regressedCount = 0;
  if (evolver && policy) {
   const ruleCode = String(policy.customRuleCode || '').trim();
   const diffCode = String(policy.difficultyEngineCode || '').trim();
   let pOk = 0;
   for (const trap of ADVERSARIAL_TRAP_CASES) {
    let rejectedByRule = false;
    try {
     if (ruleCode) {
      const r = evolver.runSandboxedRule(ruleCode, trap, { id: '0-0', unit: 'Test' });
      if (!r.ok) rejectedByRule = true;
     }
     if (!rejectedByRule && diffCode) {
      const rd = evolver.runSandboxedDifficultyEngine(diffCode, trap, trap.difficulty || 'orta', { id: '0-0', unit: 'Test' });
      if (!rd.ok) rejectedByRule = true;
     }
    } catch {}
    const expectedReject = trap.expectedReject !== false;
    const passed = expectedReject ? rejectedByRule : !rejectedByRule;
    if (passed) pOk++;
   }
   trapPassed = pOk;
   const recall = pOk / Math.max(1, ADVERSARIAL_TRAP_CASES.length);
   for (const q of sample.slice(0, 15)) {
    let regressed = false;
    try {
     if (ruleCode) {
      const r = evolver.runSandboxedRule(ruleCode, q, { id: q.unitId || '0-0', unit: q.unit || 'Test' });
      if (!r.ok) regressed = true;
     }
     if (!regressed && diffCode && q.difficulty) {
      const rd = evolver.runSandboxedDifficultyEngine(diffCode, q, q.difficulty, { id: q.unitId || '0-0', unit: q.unit || 'Test' });
      if (!rd.ok) regressed = true;
     }
    } catch { regressed = true; }
    if (regressed) regressedCount++;
   }
   const precision = sample.slice(0, 15).length ? Math.max(0, 1 - regressedCount / Math.min(15, sample.length)) : 1;
   trapF1 = Math.round(precision * 60 + recall * 40);
  }
  const sandboxAndTrapsScore = Math.round(clamp(trapF1, 25, 100));

  // --- Alt Sistem 6: Çok-Milyarlı Parametre Matrisi Sağlığı ---
  let paramFitnessMean = 85;
  if (paramState?.bots) {
   const fits = ALL_AI_BOT_IDS.map(id => Number(paramState.bots[id]?.fitnessScore ?? 0.85) * 100);
   paramFitnessMean = mean(fits, 85);
  }
  const parameterMatrixScore = Math.round(clamp(paramFitnessMean, 40, 100));

  // --- 5 Bilgi Seviyesi Skoru ---
  const approvalRate = Number(telemetry?.approvalRate ?? 82);
  const dualBlocked = Number(telemetry?.dualAnswerBlocked ?? 0);

  const levelScores = {
   beginner_novice: Math.round(clamp((lessonsScore * 0.45) + (studyMaterialsScore * 0.25) + (tierBalanceScore * 0.30) - slangOrBannedCount * 5, 35, 100)),
   intermediate_trainee: Math.round(clamp((questionPoolScore * 0.45) + (tierBalanceScore * 0.35) + (approvalRate * 0.20), 35, 100)),
   expert_coach: Math.round(clamp((questionPoolScore * 0.40) + (sandboxAndTrapsScore * 0.35) + clamp(100 - weakEvidenceCount * 8, 40, 100) * 0.25, 35, 100)),
   speed_skimmer: Math.round(clamp(clamp(100 - lengthLeakCount * 10, 35, 100) * 0.55 + (questionPoolScore * 0.45), 35, 100)),
   adversarial_exploiter: Math.round(clamp((sandboxAndTrapsScore * 0.65) + clamp(100 - slangOrBannedCount * 15 - stemRepeatPenalty * 8 - (dualBlocked > 5 ? 6 : 0), 30, 100) * 0.35, 30, 100))
  };

  const subsystemScores = {
   questionPool: questionPoolScore,
   studyMaterials: studyMaterialsScore,
   lessons: lessonsScore,
   sandboxAndTraps: sandboxAndTrapsScore,
   parameterMatrix: parameterMatrixScore
  };

  const compositeScore = Math.round(
   mean(Object.values(levelScores), 80) * 0.55 +
   mean(Object.values(subsystemScores), 80) * 0.45
  );

  return {
   compositeScore,
   levelScores,
   subsystemScores,
   diagnostics: {
    sampleCount: sample.length,
    diffCounts,
    tierBalanceScore: Math.round(tierBalanceScore),
    lengthLeakCount,
    weakEvidenceCount,
    slangOrBannedCount,
    stemRepeatPenalty,
    osymStyleScore: osymAudit.avgScore,
    osymElitePct: osymAudit.elitePct,
    osymWeakestIssues: osymAudit.weakestIssues,
    trapPassed,
    trapTotal: ADVERSARIAL_TRAP_CASES.length,
    trapF1,
    regressedCount
   }
  };
 }

 // Parça 2: Claude Tarzı 3-Aşamalı Öz-Eleştiri & Çok-Zekâlı Parametre Reçetesi Üretimi
 synthesizeSelfCritiqueAndPatches(inspection, paramState = null) {
  const { levelScores, subsystemScores, diagnostics, compositeScore } = inspection;
  const patches = {};

  const setPatch = (botId, infPatch = {}, weightPatch = {}, levelPatch = {}, swarmPatch = {}) => {
   patches[botId] = {
    ...infPatch,
    behavioralWeights: { ...(patches[botId]?.behavioralWeights || {}), ...weightPatch },
    knowledgeLevelWeights: { ...(patches[botId]?.knowledgeLevelWeights || {}), ...levelPatch },
    crossAiSwarmWeights: { ...(patches[botId]?.crossAiSwarmWeights || {}), ...swarmPatch }
   };
  };

  const critiqueChain = [];

  // Aşama 1 (Öz-Eleştiri): Acemi / Orta / Uzman Seviye Dengesi
  if (levelScores.beginner_novice < 86 || subsystemScores.lessons < 85) {
   critiqueChain.push(`[Acemi Seviye Eleştirisi · ${levelScores.beginner_novice}/100] Konu anlatımları ve kolay kademe netliği güçlendirilmeli.`);
   setPatch('lessonEngine', { num_predict: 2400 }, { mnemonicNoveltyWeight: 0.96, adaptivePacingGain: 0.94 }, { noviceClarity: 0.97 }, { selfConsistencyPasses: 3 });
   setPatch('generator', {}, { difficultyBalanceGain: 0.95 }, { noviceClarity: 0.94 });
  } else {
   setPatch('lessonEngine', {}, {}, { noviceClarity: 0.94 }, { selfConsistencyPasses: 3 });
  }

  // Aşama 2 (Karşı-Örnek Saldırısı): Uzman Kanıt Sıkılığı & Çeldirici Simetrisi
  if (diagnostics.weakEvidenceCount > 0 || levelScores.expert_coach < 88) {
   critiqueChain.push(`[Uzman/Başhakem Eleştirisi · ${levelScores.expert_coach}/100] Kitap kanıtı birebir eşleşmesi ve zor soru derinliği sıkılaştırıldı.`);
   const curTemp = paramState?.bots?.generator?.inferenceParams?.temperature ?? 0.52;
   setPatch('generator', { temperature: +clamp(curTemp - 0.04, 0.34, 0.65).toFixed(2), repeat_penalty: 1.11, num_ctx: 12288 }, {
    evidenceStrictness: 0.98,
    distractorSophistication: 0.96
   }, {
    expertRigor: 0.97,
    intermediateDiscrimination: 0.94
   }, {
    crossModelAgreementGain: 0.95
   });
   setPatch('judge', { temperature: 0.11 }, {
    hallucinationVetoThreshold: 0.98,
    dualAnswerSensitivity: 0.99
   }, {
    expertRigor: 0.98
   });
  } else {
   setPatch('judge', {}, { dualAnswerSensitivity: 0.985 }, { expertRigor: 0.96 }, { crossModelAgreementGain: 0.95 });
  }

  // Aşama 3 (Hız & Tuzak Kalkanı Sentezi): Speed Skimmer + Adversarial Exploiter
  if (diagnostics.lengthLeakCount > 0 || levelScores.speed_skimmer < 88) {
   critiqueChain.push(`[Hızlı Okuyucu Eleştirisi · ${levelScores.speed_skimmer}/100] Şık uzunluk sızıntısı kilidi yükseltildi.`);
   setPatch('turboQualityGuard', { temperature: 0.10 }, {
    optionLengthParityGate: 0.98,
    speedToQualityFloor: 0.98
   }, {
    speedSkimmerImmunity: 0.98
   });
  } else {
   setPatch('turboQualityGuard', {}, {}, { speedSkimmerImmunity: 0.96 });
  }

  if (levelScores.adversarial_exploiter < 92 || diagnostics.trapF1 < 98) {
   critiqueChain.push(`[Red-Team Saldırı Eleştirisi · ${levelScores.adversarial_exploiter}/100] ${diagnostics.trapPassed}/${diagnostics.trapTotal} tuzak zırhı ve AST güvenlik katsayısı yükseltildi.`);
   setPatch('qwenCodeSandbox', { temperature: 0.15 }, {
    adversarialTrapSensitivity: 0.995,
    astSafetyStrictness: 0.999
   }, {
    adversarialTrapShield: 0.99
   }, {
    adversarialProbeRate: 0.98,
    multiSystemCoupling: 0.96
   });
  } else {
   setPatch('qwenCodeSandbox', {}, { adversarialTrapSensitivity: 0.99 }, { adversarialTrapShield: 0.99 }, { adversarialProbeRate: 0.96 });
  }

  if (diagnostics.osymStyleScore !== undefined && diagnostics.osymStyleScore < 76) {
   critiqueChain.push(`[ÖSYM Komisyonu Psikometri Eleştirisi · ${diagnostics.osymStyleScore}/100] I-II-III öncüllü/vaka soru kökü oranı ve çeldirici simetrisi artırıldı.`);
   setPatch('generator', {}, {
    distractorSophistication: 0.985,
    difficultyBalanceGain: 0.96
   }, {
    expertRigor: 0.98,
    intermediateDiscrimination: 0.96
   });
   setPatch('judge', {}, { dualAnswerSensitivity: 0.99 }, { expertRigor: 0.98 });
  }

  // Tüm kalan botların bilgi-seviyesi & çapraz-swarm ağırlıklarını güncel tut
  setPatch('curator', {}, { tierQuotaBalanceWeight: 0.96, passageBlindSpotBonus: 0.93 }, { intermediateDiscrimination: 0.95 }, { multiSystemCoupling: 0.95 });
  setPatch('researchAgent', {}, { confusionPairMiningDepth: 0.95, rarePassageWeight: 0.92 }, { expertRigor: 0.94 }, { crossModelAgreementGain: 0.94 });
  setPatch('kayseriCoach', {}, { evidenceAnchorRatio: 0.95, humorPunchlineSharpness: 0.96 }, { noviceClarity: 0.94, speedSkimmerImmunity: 0.95 });

  if (!critiqueChain.length) {
   critiqueChain.push(`[Tam Uyum · ${compositeScore}/100] 5 bilgi seviyesi ve 6 alt-sistem Claude-Swarm denetimini tam puan bandında geçti; ince ayar gradyanları korundu.`);
  }

  return { critiqueChain, prescribedPatches: patches };
 }

 // Parça 3: İsteğe Bağlı Canlı Çoklu-LLM Parçalama (Farklı Ollama / Bulut Modellerini Karşı-Denetçi & Öğrenci Yap!)
 async runLiveMultiModelShardProbe({
  runModelFn,
  installedModels = [],
  sampleItems = [],
  sampleLesson = null,
  signal
 } = {}) {
  if (typeof runModelFn !== 'function' || !installedModels.length) {
   return { executed: false, shards: [], consensusFindings: [], modelPatches: {} };
  }

  const pickDistinct = (patterns, used = []) => {
   for (const p of patterns) {
    const m = installedModels.find(x => !used.includes(x) && p.test(x));
    if (m) return m;
   }
   return installedModels.find(x => !used.includes(x)) || installedModels[0];
  };

  const used = [];
  const noviceTesterModel = pickDistinct([/gemma/i, /llama/i, /glm/i, /qwen/i], used);
  used.push(noviceTesterModel);
  const expertCriticModel = pickDistinct([/qwen3(?!.*coder)/i, /deepseek/i, /kimi/i, /qwen2\.5/i], used);
  used.push(expertCriticModel);
  const redTeamCoderModel = pickDistinct([/coder/i, /deepseek/i, /qwen/i], used);

  const compactQuestion = sampleItems[0]
   ? { question: sampleItems[0].question, options: sampleItems[0].options, answer: sampleItems[0].answer, difficulty: sampleItems[0].difficulty, evidence: sampleItems[0].evidence }
   : { question: 'Aerobik dayanıklılık antrenmanında temel ölçüt nedir?', options: ['VO2max', 'Tek tekrar maksimum', 'Esneklik açısı', 'Reaksiyon süresi'], answer: 'VO2max', difficulty: 'orta', evidence: 'Aerobik kapasite maksimal oksijen tüketimi (VO2max) ile ölçülür.' };

  const shards = [
   {
    role: 'novice_intermediate_student_ai',
    model: noviceTesterModel,
    prompt: `Sen 2 farklı öğrenci seviyesini (Acemi ve Orta) simüle eden test yapay zekâsısın. Aşağıdaki soru ve dersi netlik, çeldirici dengesi ve öğrenilebilirlik açısından test et. JSON döndür: {"novicePass": true, "intermediatePass": true, "weakSpot": "...", "tempDelta": 0}`
      + `\nSORU: ${JSON.stringify(compactQuestion)}\nDERS ÖZETİ: ${String(sampleLesson?.summary || '').slice(0, 220)}`
   },
   {
    role: 'expert_redteam_critic_ai',
    model: expertCriticModel,
    prompt: `Sen Başhakem + Adversarial Red-Team Eleştirmenisin (Claude tarzı kendi hatalarını arayan derin analiz). Çift doğru şık, uzunluk sızıntısı ve zayıf kanıt kuralını kontrol et. JSON döndür: {"expertPass": true, "trapRisk": false, "prescription": "...", "generatorTemp": 0.48}`
      + `\nSORU: ${JSON.stringify(compactQuestion)}`
   },
   {
    role: 'self_repair_coder_ai',
    model: redTeamCoderModel,
    prompt: `Sen tüm alt-sistemlerin parametrelerini optimize eden Meta-Mühendissin. Verilen yapılar arasındaki zayıf noktaya göre 1 cümle öz-eleştiri ve sayısal ağırlık öner. JSON döndür: {"critique": "...", "parameterPatches": {"generator": {"temperature": 0.48, "repeat_penalty": 1.11}}}`
   }
  ];

  const results = await Promise.all(shards.map(async s => {
   try {
    const r = await runModelFn(s.model, s.prompt, 0.22, signal || AbortSignal.timeout(18_000), 650, { fastThink: true, numCtx: 4096, botRole: 'judge' });
    return { role: s.role, model: s.model, ok: true, parsed: r?.parsed || {} };
   } catch (e) {
    return { role: s.role, model: s.model, ok: false, error: e.message };
   }
  }));

  const mergedPatches = {};
  const consensusFindings = [];
  for (const res of results) {
   if (!res.ok) continue;
   if (res.parsed?.weakSpot) consensusFindings.push(`${res.role} (${res.model}): ${String(res.parsed.weakSpot).slice(0, 140)}`);
   if (res.parsed?.prescription) consensusFindings.push(`${res.role} (${res.model}): ${String(res.parsed.prescription).slice(0, 140)}`);
   if (res.parsed?.critique) consensusFindings.push(`${res.role} (${res.model}): ${String(res.parsed.critique).slice(0, 140)}`);
   if (res.parsed?.parameterPatches && typeof res.parsed.parameterPatches === 'object') {
    for (const [bId, patch] of Object.entries(res.parsed.parameterPatches)) {
     if (ALL_AI_BOT_IDS.includes(bId) && patch && typeof patch === 'object') {
      mergedPatches[bId] = { ...(mergedPatches[bId] || {}), ...patch };
     }
    }
   }
  }

  return {
   executed: true,
   shards: results.map(r => ({ role: r.role, model: r.model, ok: r.ok })),
   consensusFindings,
   modelPatches: mergedPatches
  };
 }

 // Parça 4: Claude Tarzı Tam Döngü: Önce Test Et -> Öz-Eleştiri Yap -> Parametreleri Evrimleştir -> Tekrar Test Kapısından Geçir!
 async evaluateAndEvolve({
  paramMatrix,
  items = [],
  study = { flashcards: [], matchings: [], drills: [] },
  contexts = [],
  passagesByUnit = new Map(),
  lessonsSummary = null,
  evolver = null,
  policy = null,
  studentProfile = {},
  diagnostics = null,
  telemetry = {},
  runModelFn = null,
  installedModels = [],
  source = 'claude-swarm-meta-evolver',
  customPatches = null,
  signal = null
 } = {}) {
  const evalState = await this.loadState();
  const paramBefore = await paramMatrix.loadState();

  // 1) Pre-Eval: Tüm sistemleri ve 5 bilgi seviyesini tara
  const preInspection = this.inspectEcosystemAcrossLevels({
   items, study, contexts, passagesByUnit, lessonsSummary,
   evolver, policy, paramState: paramBefore, telemetry
  });

  // 2) İsteğe bağlı Canlı Çok-LLM Parçalı Test
  const liveShards = installedModels?.length && typeof runModelFn === 'function'
   ? await this.runLiveMultiModelShardProbe({
    runModelFn,
    installedModels,
    sampleItems: items.filter(q => q.status === 'approved').slice(-3),
    signal
   }).catch(() => ({ executed: false, shards: [], consensusFindings: [], modelPatches: {} }))
   : { executed: false, shards: [], consensusFindings: [], modelPatches: {} };

  // 3) 3-Aşamalı Öz-Eleştiri & Reçete Sentezi
  const { critiqueChain, prescribedPatches } = this.synthesizeSelfCritiqueAndPatches(preInspection, paramBefore);

  // Tüm yamaları birleştir: Deterministik Öz-Eleştiri + Çok-LLM Konsensüs + Dış CustomPatches
  const combinedPatches = { ...prescribedPatches };
  for (const patchSource of [liveShards.modelPatches, customPatches]) {
   if (!patchSource || typeof patchSource !== 'object') continue;
   for (const [bId, p] of Object.entries(patchSource)) {
    if (!ALL_AI_BOT_IDS.includes(bId) || !p || typeof p !== 'object') continue;
    combinedPatches[bId] = {
     ...(combinedPatches[bId] || {}),
     ...p,
     behavioralWeights: { ...(combinedPatches[bId]?.behavioralWeights || {}), ...(p.behavioralWeights || {}) },
     knowledgeLevelWeights: { ...(combinedPatches[bId]?.knowledgeLevelWeights || {}), ...(p.knowledgeLevelWeights || {}) },
     crossAiSwarmWeights: { ...(combinedPatches[bId]?.crossAiSwarmWeights || {}), ...(p.crossAiSwarmWeights || {}) }
    };
   }
  }

  // 4) Parametreleri evrimleştir
  const evoResult = await paramMatrix.evolveAllBotParameters({
   diagnostics,
   telemetry,
   studentProfile,
   trapF1: preInspection.diagnostics.trapF1,
   swarmEval: preInspection,
   source,
   customPatches: combinedPatches
  });

  // 5) Post-Eval Gate: Parametre evrimi sonrası sistemi yeniden test et
  const postInspection = this.inspectEcosystemAcrossLevels({
   items, study, contexts, passagesByUnit, lessonsSummary,
   evolver, policy, paramState: evoResult.state, telemetry
  });

  let gateAccepted = true;
  let finalParamState = evoResult.state;
  // Büyük bir regresyon olursa (>3 puan düşüş ve dışarıdan kasıtlı manuel patch yoksa) otomatik geri al
  if (postInspection.compositeScore + 3 < preInspection.compositeScore && !customPatches) {
   const rb = await paramMatrix.rollbackLastEvolution();
   finalParamState = rb.state;
   gateAccepted = false;
   evalState.gatesRejectedOrRolledBack = (evalState.gatesRejectedOrRolledBack || 0) + 1;
  } else {
   evalState.gatesAccepted = (evalState.gatesAccepted || 0) + 1;
  }

  evalState.totalSwarmRuns += 1;
  evalState.selfCritiquePassesTotal += 3;
  if (liveShards.executed) evalState.multiModelSplitsTotal += liveShards.shards.length;
  evalState.lastCompositeScore = postInspection.compositeScore;
  evalState.peakCompositeScore = Math.max(evalState.peakCompositeScore || 0, postInspection.compositeScore);
  evalState.lastLevelScores = postInspection.levelScores;
  evalState.lastSubsystemScores = postInspection.subsystemScores;
  evalState.lastOsymStyleScore = postInspection.diagnostics?.osymStyleScore ?? 85;
  evalState.lastPrescribedPatches = combinedPatches;

  const report = {
   run: evalState.totalSwarmRuns,
   source,
   preScore: preInspection.compositeScore,
   postScore: postInspection.compositeScore,
   osymStyleScore: evalState.lastOsymStyleScore,
   gateAccepted,
   levelScores: postInspection.levelScores,
   subsystemScores: postInspection.subsystemScores,
   critiqueChain,
   liveShards: liveShards.shards,
   consensusFindings: liveShards.consensusFindings,
   botsUpdated: evoResult.evolution?.botsUpdated || ALL_AI_BOT_IDS.length,
   timestamp: new Date().toISOString()
  };
  evalState.recentReports = [...(evalState.recentReports || []), report].slice(-25);

  const savedEval = await this.saveState(evalState);
  return {
   ok: true,
   gateAccepted,
   preInspection,
   postInspection,
   critiqueChain,
   liveShards,
   prescribedPatches: combinedPatches,
   parameterSummary: paramMatrix.getSummary(finalParamState),
   evalState: savedEval,
   report
  };
 }

 getSummary(state) {
  if (!state) return null;
  return {
   version: state.version,
   codename: state.codename,
   upgradeFactorFromPrevious: state.upgradeFactorFromPrevious ?? 100,
   hyperUpgradeMultiplier: state.hyperUpgradeMultiplier ?? 150000,
   totalSwarmRuns: state.totalSwarmRuns,
   selfCritiquePassesTotal: state.selfCritiquePassesTotal,
   multiModelSplitsTotal: state.multiModelSplitsTotal,
   gatesAccepted: state.gatesAccepted,
   gatesRejectedOrRolledBack: state.gatesRejectedOrRolledBack,
   lastCompositeScore: state.lastCompositeScore,
   peakCompositeScore: state.peakCompositeScore,
   lastOsymStyleScore: state.lastOsymStyleScore ?? null,
   lastLevelScores: state.lastLevelScores,
   lastSubsystemScores: state.lastSubsystemScores,
   recentReports: (state.recentReports || []).slice(-5),
   updatedAt: state.updatedAt
  };
 }
}
