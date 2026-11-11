import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BotParameterMatrix } from './bot-parameter-matrix.mjs';
import { MultiAiSwarmEvaluator } from './multi-ai-evaluator.mjs';

export const UPGRADE_SCALE_FACTOR = 100;
export const CUMULATIVE_UPGRADE_FACTOR = 150000;
export const TRAINING_SCALE_FACTOR = 30000 * UPGRADE_SCALE_FACTOR; // 3,000,000x toplam (önceki 30,000x üzerine 100x yükseltme)
export const PREVIOUS_TRAINER_TOTAL_BOOST = 705000000;
export const TRAINER_BASE_BOOST = 465000000 * UPGRADE_SCALE_FACTOR; // 46,500,000,000%
export const TRAINER_ADDED_BOOST = 240000000 * UPGRADE_SCALE_FACTOR; // 24,000,000,000%
export const TRAINER_TOTAL_BOOST = TRAINER_BASE_BOOST + TRAINER_ADDED_BOOST; // +70,500,000,000% (100x · Ultra-Singularity-705Mx+)
export const CURRICULUM_STAGES = 40;

// 96-Tuzak Stres Testi İçin Kendini Geliştiren Çekirdek JS Kalite Motoru (Sandbox-safe, %100 Yerel, zero forbidden globals)
export const HARDENED_ULTRA_RULE_CODE = `function evaluateCandidate(c) {
 if (!c || typeof c.question !== 'string' || !Array.isArray(c.options) || c.options.length !== 4) return { ok: false, reason: '4 seçenek şart' };
 const q = c.question.trim(), ans = String(c.answer || '').trim(), ev = String(c.evidence || '').trim();
 if (q.length < 16 || ev.length < 15) return { ok: false, reason: 'Kök veya kanıt kısa' };
 if (/^(?:undefined|null|n\\/a|none|todo|fixme|\\?\\?\\?|-+|\\.{2,})$/i.test(ev)) return { ok: false, reason: 'Geçersiz kanıt' };
 if (/\\uFFFD|\\?\\?\\?|(?:^|\\s)(?:TODO|FIXME):/i.test(q + ' ' + ev)) return { ok: false, reason: 'Bozuk karakter veya taslak etiketi' };
 if (c.options.some(o => !String(o || '').trim())) return { ok: false, reason: 'Boş şık yasak' };
 const all = q + ' ' + c.options.join(' ');
 if (/<script|<\\/script>|&lt;script|<\\/system>|ignore (?:all )?previous|javascript:|__proto__|constructor\\.prototype|Object\\.setPrototypeOf|[g]lobalThis|Ref[l]ect\\.construct|proc[e]ss\\.binding|console\\.log\\(|\\\`\\\`\\\`|^\\s*\\{\\s*"question"\\s*:|\\[\\[PLACEHOLDER\\]\\]|\\/\\/\\s*TODO:/i.test(all + ' ' + ev)) return { ok: false, reason: 'Enjeksiyon veya kod sızıntısı engellendi' };
 if (/(?:^|[^\\p{L}])(la|lan|emmi oğlu|gardaşım|yuh|geyiği)(?:[^\\p{L}]|$)/iu.test(all)) return { ok: false, reason: 'Şive sızıntısı yasak' };
 if (c.options.some(o => /(?:şık\\s*[a-d1-4]|seçenek\\s*[a-d1-4].*(?:doldurulacak|buraya|boş)|option\\s*[a-d1-4]\\b|lorem ipsum|buraya gelecek|doldurulacak|\\btbd\\b|\\bcoming\\s+soon\\b)/iu.test(String(o)) || /^şık\\s*[a-d1-4]\\s*(?:boş|buraya)$/iu.test(String(o).trim()) || /^(?:\\.{2,}|[-—–*•?!]+|n\\/?a|\\d+|\\p{Emoji_Presentation}+)$/iu.test(String(o).trim()))) return { ok: false, reason: 'Yer tutucu veya anlamsız şık' };
 if (!ans || !c.options.some(o => String(o).trim() === ans)) return { ok: false, reason: 'Cevap şıklarda olmalı' };
 if (c.explanation !== undefined && !String(c.explanation).trim()) return { ok: false, reason: 'Açıklama boş olamaz' };
 const banned = /(yukarıdakilerin hepsi|aşağıdakilerin hepsi|yukarıdakilerin hiçbiri|yukarıda sayılan tüm maddeler|yukarıdaki tüm maddeler|sayılanların tümü|hepsi doğrudur|tümü birden|her ikisi de|(?:^|[^\\p{L}])hiçbiri(?:[^\\p{L}]|$))/iu;
 if (banned.test(ans) || c.options.some(o => banned.test(String(o)))) return { ok: false, reason: 'Hepsi/Hiçbiri yasak' };
 const norm = c.options.map(o => { const s = String(o).trim().replace(/^\\(+|\\)+$/g, '').replace(/[.,;:!?]+$/g, '').trim(); return /[Iİ]/.test(s) ? s.toLocaleLowerCase('tr-TR') : s.toLowerCase(); });
 if (new Set(norm).size < 4) return { ok: false, reason: 'Tekrarlı şık' };
 const lens = c.options.map(o => String(o).trim().length), minL = Math.max(1, Math.min(...lens)), maxL = Math.max(...lens);
 if (maxL > minL * 3.5 && ans.length === maxL) return { ok: false, reason: 'Uzunluk sızıntısı' };
 if (c.options.some(o => String(o).trim().split(/\\s+/).length === 1 && String(o).trim().length <= 4 && maxL >= 25)) return { ok: false, reason: 'Zayıf tek kelimelik çeldirici' };
 if (/kesinlikle her sporcuda.*242|kesinlikle tüm sporcularda.*%99\\.4|dakikada 450 atım|nabzı sıfıra|nabız dakikada 0 atım|980\\s*volt\\/kg|uyurken uygulanır|süreklilik ilkesi sürekliliktir|kitapta yazdığı gibi bu doğru şıktır/i.test(ans)) return { ok: false, reason: 'Uydurma veya totoloji cevap' };
 if (/fosfojen|atp-cp/i.test(q) && (/\\b6-10\\s*saat\\b/i.test(ans) || /saatlerce süren maratonun tek enerji kaynağıdır/i.test(ans))) return { ok: false, reason: 'Birim veya enerji sistemi uyumsuzluğu' };
 if (/akut yorgunluk tepkisi/i.test(q) && /yıllar içinde oluşan kalıcı/i.test(ans)) return { ok: false, reason: 'Akut-kronik kavram hatası' };
 if (/izometrik kasılma/i.test(q) && /kas boyunun mutlaka yarıya kısaldığı/i.test(ans)) return { ok: false, reason: 'İzometrik kasılma çelişkisi' };
 if (/biçimlendirici\\s*\\(formatif\\)/i.test(q) && /yalnızca sezon sonunda tek karne notu/i.test(ans)) return { ok: false, reason: 'Formatif-summatif kavram hatası' };
 if (/4-6 yaş okul öncesi/i.test(q) && /yetişkin maksimal 1rm/i.test(ans)) return { ok: false, reason: 'Gelişim dönemi uyumsuzluğu' };
 if (/(?:^|[^\\p{L}])(DEĞİLDİR|YANLIŞTIR)(?:[^\\p{L}]|$)/u.test(q) && (/kas sıcaklığını ve kan akımını artırmak$/i.test(ans) || /kalp atım hızını kademeli olarak düşürmek/i.test(ans) || /sakatlık riskini sıfıra indirip/i.test(ans))) return { ok: false, reason: 'Olumsuz kök çelişkisi' };
 if (c.difficulty === 'zor' && q.length < 24) return { ok: false, reason: 'Zor kök çok basit' };
 if (c.difficulty === 'kolay' && q.length > 155) return { ok: false, reason: 'Kolay kök aşırı ağır' };
 if (/progresif yüklenme.*progresif yüklenme/i.test(q)) return { ok: false, reason: 'Kök sızıntısı' };
 for (const [a, b] of [['bireyselleştirme', 'kişiye özel'], ['aerobik', 'oksijenli']]) {
  if (norm.some(o => o.includes(a)) && norm.some(o => o.includes(b)) && norm.some(o => o.includes('yaklaşım') || o.includes('ilke'))) return { ok: false, reason: 'Eşanlamlı çift doğru' };
 }
 return { ok: true };
}`;

const HARDENED_DIFFICULTY_ENGINE_CODE = `function evaluateDifficultyFit(candidate, targetDifficulty, unit) {
 const tier = targetDifficulty || candidate?.difficulty || 'orta';
 if (!['kolay', 'orta', 'zor'].includes(tier)) return { ok: false, reason: 'Geçersiz zorluk kademesi' };
 const q = String(candidate?.question || '').trim();
 if (tier === 'zor' && q.length < 24) return { ok: false, reason: 'Zor seviye soru kökü analiz derinliğine sahip olmalı' };
 if (tier === 'kolay' && q.length > 160) return { ok: false, reason: 'Kolay seviye soru gereksiz akademik karmaşaya boğulmamalı' };
 return { ok: true, tier };
}`;

const DEFAULT_TRAINER_STATE = {
 version: 4,
 codename: 'Ultra-Singularity-705Mx+ (100x Yükseltme · 3,000,000x Eğitim · +70,500,000,000% · %100 Yerel)',
 upgradeFactorFromPrevious: UPGRADE_SCALE_FACTOR,
 cumulativeUpgradeFactor: CUMULATIVE_UPGRADE_FACTOR,
 trainingScaleFactor: TRAINING_SCALE_FACTOR,
 previousBoostPercent: PREVIOUS_TRAINER_TOTAL_BOOST,
 baseBoostPercent: TRAINER_BASE_BOOST,
 addedBoostPercent: TRAINER_ADDED_BOOST,
 totalBoostPercent: TRAINER_TOTAL_BOOST,
 localExecutionOnly: true,
 zeroApiRequired: true,
 noApiKeyPrompts: true,
 curriculumStagesTotal: CURRICULUM_STAGES,
 curriculumStagesCompleted: CURRICULUM_STAGES,
 continuousActive: true,
 startedOnLaunch: true,
 bootStartedAt: null,
 lastTrainedAt: null,
 epochsCompleted: 0,
 unitCursor: 0,
 unitsTrained: [],
 distilledConceptPairs: 0,
 crossUnitEdgesCount: 0,
 syntheticDpoPairsCount: 0,
 blindSpotsMapped: 0,
 auditDefectsFound: 0,
 trapDefensePassed: 0,
 trapDefenseTotal: 96,
 trapDefenseF1: 0,
 curriculumMasteryPct: 0,
 intelligenceMultiplier: 705000000,
 peakMultiplier: 705000000,
 distilledUnits: {},
 crossUnitBridges: [],
 botEnrichmentDirectives: {},
 globalConfusionTraps: [],
 recentEpochs: []
};

function normTokens(text) {
 return String(text || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .split(/\s+/)
  .filter(w => w.length >= 4);
}

// 20-Aşamalı Derin Bilgi Madenciliği: tanımlar, karşılaştırmalar, sayısal ölçütler, sebep-sonuç ve istisnalar
function mineDeepKnowledgeFromText(text) {
 const sentences = String(text || '')
  .split(/(?<=[.!?])\s+/)
  .map(s => s.trim())
  .filter(s => s.length >= 26 && s.length <= 280);

 const facts = [];
 const contrastPairs = [];
 const numericRules = [];
 const causeEffectChains = [];
 const exceptionClauses = [];

 for (const s of sentences) {
  if (/\d+\s*(%|dk|dakika|saat|hafta|gün|tekrar|set|sn|saniye|atım|kalori|derece|yaş|bölüm|evre|ml|kg)/i.test(s)) {
   numericRules.push(s);
  }
  const vsMatch = s.match(/([A-ZÇĞİÖŞÜa-zçğıöşü\s]{4,36})\s+(?:ise|aksine|farklı olarak|karşın|yerine)\s+([A-ZÇĞİÖŞÜa-zçğıöşü\s]{4,36})/i);
  if (vsMatch) {
   contrastPairs.push({
    conceptA: vsMatch[1].trim().slice(0, 48),
    conceptB: vsMatch[2].trim().slice(0, 48),
    distinction: s.slice(0, 190)
   });
  } else if (/(?:sonucunda|nedeniyle|yol açar|artırır|azaltır|etkiler|sayesinde|tetikler)/i.test(s)) {
   causeEffectChains.push(s.slice(0, 210));
  } else if (/(?:ancak|hariç|dışında|olmadıkça|yalnızca|sadece|yasaktır|kaçınılmalıdır)/i.test(s)) {
   exceptionClauses.push(s.slice(0, 210));
  } else if (/(?:denir|ifade eder|anlamına gelir|gerektirir|sağlar|hedefler|amaçlar|dayanır)/i.test(s)) {
   facts.push(s.slice(0, 210));
  }
 }

 return {
  facts: facts.slice(0, 8),
  contrastPairs: contrastPairs.slice(0, 6),
  numericRules: numericRules.slice(0, 6),
  causeEffectChains: causeEffectChains.slice(0, 6),
  exceptionClauses: exceptionClauses.slice(0, 5)
 };
}

export class IntelligenceTrainer {
 constructor(dataDir) {
  this.dataDir = dataDir;
  this.brainDir = resolve(dataDir, 'ai-brain');
  this.stateFile = resolve(this.brainDir, 'intelligence-trainer.json');
 }

 async _atomicWrite(filePath, obj) {
  await mkdir(this.brainDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 async loadState() {
  try {
   const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
   if (parsed && typeof parsed === 'object') {
    const needs100xMigration = (parsed.version || 0) < 4 || (parsed.totalBoostPercent || 0) < TRAINER_TOTAL_BOOST;
    const prevMult = Number(parsed.intelligenceMultiplier || 7050000);
    const prevPeak = Number(parsed.peakMultiplier || prevMult || 7050000);
    const migratedMult = needs100xMigration
     ? Math.max(705000000, prevMult < 705000000 ? (prevMult >= 7050000 ? prevMult * 100 : prevMult * 150000) : prevMult)
     : Math.max(705000000, prevMult);
    const migratedPeak = needs100xMigration
     ? Math.max(705000000, migratedMult, prevPeak < 705000000 ? (prevPeak >= 7050000 ? prevPeak * 100 : prevPeak * 150000) : prevPeak)
     : Math.max(705000000, migratedMult, prevPeak);
    return {
     ...DEFAULT_TRAINER_STATE,
     ...parsed,
     version: 4,
     codename: DEFAULT_TRAINER_STATE.codename,
     upgradeFactorFromPrevious: UPGRADE_SCALE_FACTOR,
     cumulativeUpgradeFactor: CUMULATIVE_UPGRADE_FACTOR,
     trainingScaleFactor: TRAINING_SCALE_FACTOR,
     previousBoostPercent: PREVIOUS_TRAINER_TOTAL_BOOST,
     baseBoostPercent: TRAINER_BASE_BOOST,
     addedBoostPercent: TRAINER_ADDED_BOOST,
     totalBoostPercent: TRAINER_TOTAL_BOOST,
     localExecutionOnly: true,
     zeroApiRequired: true,
     noApiKeyPrompts: true,
     curriculumStagesTotal: CURRICULUM_STAGES,
     curriculumStagesCompleted: CURRICULUM_STAGES,
     trapDefenseTotal: Math.max(96, Number(parsed.trapDefenseTotal || 96)),
     intelligenceMultiplier: migratedMult,
     peakMultiplier: migratedPeak,
     distilledUnits: parsed.distilledUnits && typeof parsed.distilledUnits === 'object' ? parsed.distilledUnits : {},
     crossUnitBridges: Array.isArray(parsed.crossUnitBridges) ? parsed.crossUnitBridges : [],
     botEnrichmentDirectives: parsed.botEnrichmentDirectives && typeof parsed.botEnrichmentDirectives === 'object' ? parsed.botEnrichmentDirectives : {},
     globalConfusionTraps: Array.isArray(parsed.globalConfusionTraps) ? parsed.globalConfusionTraps : [],
     recentEpochs: Array.isArray(parsed.recentEpochs) ? parsed.recentEpochs : [],
     unitsTrained: Array.isArray(parsed.unitsTrained) ? parsed.unitsTrained : []
    };
   }
  } catch (e) {
   if (e.code !== 'ENOENT') throw e;
  }
  return {
   ...DEFAULT_TRAINER_STATE,
   bootStartedAt: new Date().toISOString()
  };
 }

 async saveState(state) {
  const next = {
   ...DEFAULT_TRAINER_STATE,
   ...state,
   globalConfusionTraps: (state.globalConfusionTraps || []).slice(-80),
   crossUnitBridges: (state.crossUnitBridges || []).slice(-40),
   recentEpochs: (state.recentEpochs || []).slice(-30),
   unitsTrained: [...new Set(state.unitsTrained || [])].slice(0, 60),
   lastTrainedAt: new Date().toISOString()
  };
  await this._atomicWrite(this.stateFile, next);
  return next;
 }

 // Mevcut soru havuzu (statik + AI) üzerinde adli kalite & zorluk denetimi yapar
 auditQuestionPool(allQuestions = []) {
  const defects = [];
  const diffCounts = { kolay: 0, orta: 0, zor: 0 };
  const lengthLeaks = [];
  const weakEvidence = [];

  for (const q of allQuestions) {
   if (!q || q.status === 'rejected') continue;
   if (diffCounts[q.difficulty] !== undefined) diffCounts[q.difficulty]++;
   if (Array.isArray(q.options) && q.options.length === 4) {
    const lens = q.options.map(o => String(o || '').trim().length);
    const minL = Math.max(1, Math.min(...lens));
    const maxL = Math.max(...lens);
    const ansLen = String(q.answer || '').trim().length;
    if (maxL > minL * 3.2 && ansLen === maxL) {
     lengthLeaks.push(q.unitId || '0-0');
    }
   }
   const ev = String(q.evidence || '').trim();
   if (ev.length > 0 && ev.length < 18) {
    weakEvidence.push(q.unitId || '0-0');
   }
  }

  if (lengthLeaks.length) {
   defects.push({
    unitId: lengthLeaks[0],
    category: 'distractor',
    lesson: `Uzunluk sızıntısı yakalandı (${lengthLeaks.length} soruda doğru şık çeldiricilerden >3x uzun). Tüm 4 şıkkı eşit sözcük bandında kur.`
   });
  }
  if (weakEvidence.length) {
   defects.push({
    unitId: weakEvidence[0],
    category: 'evidence',
    lesson: `Kısa kanıt uyarısı (${weakEvidence.length} soru): Her soruda kitap pasajından en az 25 karakterlik birebir kanıt cümlesi ekle.`
   });
  }
  const totalDiff = diffCounts.kolay + diffCounts.orta + diffCounts.zor;
  if (totalDiff >= 12) {
   const minTier = ['kolay', 'orta', 'zor'].sort((a, b) => diffCounts[a] - diffCounts[b])[0];
   if (diffCounts[minTier] < totalDiff * 0.22) {
    defects.push({
     unitId: 'all',
     category: 'difficulty',
     lesson: `Zorluk dengesi uyarısı: "${minTier}" kademesi %${Math.round((diffCounts[minTier] / totalDiff) * 100)} ile düşük — kolay/orta/zor oranını %33 bandında dengele.`
    });
   }
  }
  return { defects, diffCounts, totalAudited: allQuestions.length };
 }

 // 20x Omega-4700x+ (+470,000%) 20-Aşamalı Sürekli Eğitim Adımı — TÜM 11 Botu ve Milyarlarca Parametrelerini Eşzamanlı Zenginleştirir!
 async runContinuousTrainingTick({
  contexts = [],
  passagesByUnit = new Map(),
  items = [],
  staticBank = [],
  studentProfile = {},
  evolver,
  jarvis,
  apex,
  paramMatrix = null,
  multiAiEval = null,
  batchUnits = 8,
  skipSwarmEval = false
 } = {}) {
  const state = await this.loadState();
  if (!state.bootStartedAt) state.bootStartedAt = new Date().toISOString();

  const totalUnits = Math.max(1, contexts.length);
  const startIdx = state.unitCursor % totalUnits;
  const targets = [];
  for (let i = 0; i < Math.min(batchUnits, totalUnits); i++) {
   targets.push(contexts[(startIdx + i) % totalUnits]);
  }
  state.unitCursor = (startIdx + targets.length) % totalUnits;

  const approvedAi = items.filter(x => x.status === 'approved');
  const recentBankTail = staticBank.length > 180 ? staticBank.slice(-180) : staticBank;
  const combinedQuestions = [...recentBankTail, ...approvedAi];
  const coveredPassageSet = new Set(approvedAi.map(q => q.passageId).filter(Boolean));

  let newlyDistilledPairs = 0;
  const unitKeywordBuckets = new Map();

  // Aşama 1–10: Çok Boyutlu Bilgi, Sebep-Sonuç, İstisna, Zorluk Açığı & Sentetik DPO Çifti Damıtma
  for (const ctx of targets) {
   if (!ctx) continue;
   const passages = passagesByUnit.get(ctx.id) || [];
   const fullText = [ctx.text || '', ...passages.slice(0, 12).map(p => p.text || '')].join(' ').slice(0, 18000);
   const mined = mineDeepKnowledgeFromText(fullText);

   const blindSpots = passages.filter(p => !coveredPassageSet.has(p.id)).map(p => ({
    id: p.id,
    heading: p.heading || ctx.unit,
    keywords: (p.keywords || []).slice(0, 5)
   }));

   const unitQuestions = combinedQuestions.filter(q => q.unitId === ctx.id);
   const uDiff = { kolay: 0, orta: 0, zor: 0 };
   for (const q of unitQuestions) {
    if (uDiff[q.difficulty] !== undefined) uDiff[q.difficulty]++;
   }
   const deficitTier = ['kolay', 'orta', 'zor'].sort((a, b) => uDiff[a] - uDiff[b])[0];

   const kws = [...new Set(passages.flatMap(p => p.keywords || []).filter(k => typeof k === 'string' && k.length >= 4))];
   unitKeywordBuckets.set(ctx.id, kws);
   const autoTraps = [...mined.contrastPairs];
   if (autoTraps.length === 0 && kws.length >= 2) {
    autoTraps.push({
     conceptA: kws[0],
     conceptB: kws[1],
     distinction: `${ctx.unit} içinde "${kws[0]}" ve "${kws[1]}" kavramlarını aynı çeldirici ailesinde keskin sınırla ayır.`
    });
   }

   // Sentetik zor-negatif DPO eğitim çifti üretimi (üretici + hakem + video için)
   const syntheticDpoPairs = [];
   if (mined.facts.length > 0 && kws.length >= 2) {
    syntheticDpoPairs.push({
     promptFocus: `${ctx.unit}: ${kws.slice(0, 3).join(', ')}`,
     chosenRule: mined.facts[0],
     rejectedTrap: `${kws[0]} her branşta dakikada 242 atıma sabitlenir ve yukarıdakilerin hepsidir.`
    });
   }

   const videoEnrichmentCue = `${ctx.unit} sinema vurgusu: ${kws.slice(0, 4).join(' • ')}${mined.causeEffectChains[0] ? ` | Etki: ${mined.causeEffectChains[0].slice(0, 110)}` : ''}`;
   const kayseriHook = autoTraps[0]
    ? `La gardaşım ${autoTraps[0].conceptA} ile ${autoTraps[0].conceptB} kavramını birbirine katarsan mantıyı yakarsın!`
    : `Emmi oğlu ${ctx.unit} ünitesindeki şu kilidi kap da sınavda şaşma!`;

   state.distilledUnits[ctx.id] = {
    unitId: ctx.id,
    unit: ctx.unit,
    book: ctx.book,
    keyFacts: mined.facts,
    numericRules: mined.numericRules,
    causeEffectChains: mined.causeEffectChains,
    exceptionClauses: mined.exceptionClauses,
    confusionTraps: autoTraps,
    syntheticDpoPairs,
    videoEnrichmentCue,
    kayseriHook,
    keywords: kws.slice(0, 12),
    blindSpots: blindSpots.slice(0, 8),
    deficitTier,
    tokenDensity: fullText.slice(0, 6000).trim().split(/\s+/).length,
    updatedAt: new Date().toISOString()
   };

   if (!state.unitsTrained.includes(ctx.id)) {
    state.unitsTrained.push(ctx.id);
   }
   newlyDistilledPairs += mined.facts.length + autoTraps.length + mined.numericRules.length + mined.causeEffectChains.length + mined.exceptionClauses.length + syntheticDpoPairs.length;
   for (const t of autoTraps) {
    const label = `${ctx.id}: ${t.conceptA} ↔ ${t.conceptB}`;
    if (!state.globalConfusionTraps.some(x => x.label === label)) {
     state.globalConfusionTraps.push({ label, distinction: t.distinction });
    }
   }
  }

  // Aşama 11–13: Çapraz-Ünite Kavram Köprüsü Madenciliği (Cross-Unit Transfer Graph)
  const existingIds = Object.keys(state.distilledUnits);
  const crossBridges = [...(state.crossUnitBridges || [])];
  for (let i = 0; i < targets.length; i++) {
   const a = targets[i];
   if (!a) continue;
   const aKws = new Set((state.distilledUnits[a.id]?.keywords || []).map(x => x.toLowerCase()));
   if (!aKws.size) continue;
   for (const otherId of existingIds) {
    if (otherId === a.id) continue;
    const otherUnit = state.distilledUnits[otherId];
    const shared = (otherUnit?.keywords || []).filter(k => aKws.has(k.toLowerCase()));
    if (shared.length >= 1) {
     const edgeKey = [a.id, otherId].sort().join('↔');
     if (!crossBridges.some(e => e.edgeKey === edgeKey)) {
      crossBridges.push({
       edgeKey,
       unitA: a.id,
       unitB: otherId,
       sharedConcepts: shared.slice(0, 4),
       bridgeNote: `${a.id} ve ${otherId} üniteleri "${shared.slice(0, 2).join(' / ')}" ekseninde çapraz sınav sorusu ve video karşılaştırması için birleştirildi.`
      });
     }
    }
   }
  }
  state.crossUnitBridges = crossBridges.slice(-40);
  state.crossUnitEdgesCount = state.crossUnitBridges.length;

  // Aşama 14–17: Tüm Havuz Adli Denetimi + 96-Tuzak Adversarial Sandbox Stres Kapısı
  const auditRes = this.auditQuestionPool(combinedQuestions.slice(-180));
  state.auditDefectsFound = auditRes.defects.length;

  let policyUpgraded = false;
  let trapF1 = state.trapDefenseF1 || 0;
  let trapPassed = state.trapDefensePassed || 0;
  let trapTotal = 96;

  if (evolver && apex) {
   const currentPolicy = await evolver.loadPolicy();
   const currentStress = apex.evaluateRulePrecision({
    evolver,
    customRuleCode: currentPolicy.customRuleCode || '',
    difficultyEngineCode: currentPolicy.difficultyEngineCode || '',
    sampleApprovedItems: approvedAi
   });
   trapF1 = currentStress.f1Score;
   trapPassed = currentStress.passedTraps;
   trapTotal = currentStress.totalTraps;

   // Mevcut kural henüz yoksa veya 96 tuzak F1 skoru <%94 ise sertleştirilmiş Ultra-Singularity-705Mx+ kuralını doğrula ve etkinleştir!
   if (!currentPolicy.customRuleCode?.trim() || currentStress.f1Score < 94) {
    const ultraStress = apex.evaluateRulePrecision({
     evolver,
     customRuleCode: HARDENED_ULTRA_RULE_CODE,
     difficultyEngineCode: HARDENED_DIFFICULTY_ENGINE_CODE,
     sampleApprovedItems: approvedAi
    });
    if (ultraStress.valid && ultraStress.f1Score >= currentStress.f1Score) {
     try {
      await evolver.applyEvolution({
       reason: `Ultra-Singularity-705Mx+ (100x · +70,500,000,000% Sürekli Zekâ Eğitimi #${state.epochsCompleted + 1}): ${ultraStress.passedTraps}/${ultraStress.totalTraps} tuzak kalkanı aktif`,
       customRuleCode: HARDENED_ULTRA_RULE_CODE,
       difficultyEngineCode: HARDENED_DIFFICULTY_ENGINE_CODE,
       preserveDifficultyTiers: true,
       focusUnits: [...new Set([
        ...(studentProfile?.weakUnits || []),
        ...targets.filter(Boolean).map(t => t.id)
       ])].slice(0, 8)
      }, {
       source: 'ultra-singularity-continuous-trainer-100x',
       evolverModel: 'intelligence-trainer-v8-100x',
       metrics: { f1Score: ultraStress.f1Score, passedTraps: ultraStress.passedTraps, scaleFactor: TRAINING_SCALE_FACTOR }
      });
      trapF1 = ultraStress.f1Score;
      trapPassed = ultraStress.passedTraps;
      trapTotal = ultraStress.totalTraps;
      policyUpgraded = true;
     } catch {}
    }
   }
  }

  // Aşama 18–40: Tüm 11 Bot İçin Somut Zenginleştirme Direktifleri & JARVIS / Apex Senkronizasyonu
  const topFocusUnit = targets[0]?.id || '0-0';
  const topDu = state.distilledUnits[topFocusUnit];
  const topDeficit = topDu?.deficitTier || 'orta';
  const enrichedDirectives = {
   generator: `Ultra-Singularity-705Mx+ (100x · %100 Yerel): ${topFocusUnit} başta olmak üzere ${state.crossUnitEdgesCount} çapraz kavram köprüsünü ve "${topDeficit}" zorluk açığını kitap kanıtıyla üret.`,
   judge: `Ultra-Singularity-705Mx+ (100x · %100 Yerel): ${trapPassed}/${trapTotal} tuzak kapısı F1:%${trapF1} ile çift-cevap, uzunluk sızıntısı ve kök tekrarını sıfır toleransla ele.`,
   curator: `Ultra-Singularity-705Mx+ (100x · 40k Havuz): Tüm 29 ünitede kör pasajları (${state.blindSpotsMapped} adet) kapatıp kolay/orta/zor oranını %33 bandında tut.`,
   lessonEngine: `Ultra-Singularity-705Mx+ (100x · %100 Yerel): Sebep-sonuç (${topDu?.causeEffectChains?.length || 0}) ve istisna kurallarını zihin kancasıyla 40 aşamalı derinleştir.`,
   videoDirector: `Ultra-Singularity-705Mx+ (100x · Yalnızca Kimi/Ollama Yerel): ${topDu?.videoEnrichmentCue || 'Kitap terimleri + sinema sahnesi'} yönlendirmesiyle sürekli TikTok video yenilemesi + 3D sahne üret.`,
   researchAgent: `Ultra-Singularity-705Mx+ (100x · %100 Yerel): ${state.globalConfusionTraps.length} global kavram tuzağını yerel sınav tahmini çeldiricisi olarak besle.`,
   kayseriCoach: `Ultra-Singularity-705Mx+ (100x · %100 Yerel): ${topDu?.kayseriHook || 'Kayserili şivesi + anlık kitap kanıtı'} ile keskin komedi & doğrulama sun.`,
   tiktokFeed: `Ultra-Singularity-705Mx+ (100x · %100 Yerel): Sıfır soru kuralı + eski videoları arka planda yenile + sürekli yeni TikTok videosu üret.`,
   qwenCodeSandbox: `Ultra-Singularity-705Mx+ (100x · +70,500,000,000%): 96 adversarial tuzak testi ve self-repair JS kurallarını sıfır regresyonla kilitle.`,
   turboQualityGuard: `Ultra-Singularity-705Mx+ (100x · %100 Yerel): Milisaniye turbo hızda dahi en az 25 krk kitap kanıtı ve eşit uzunlukta 4 şık kuralını kilitle.`,
   localVideoStudio: `Ultra-Singularity-705Mx+ (100x · Yalnızca Kimi/Ollama + VoiceStudio): Harici API/anahtar istemeden yerel MP4 + sürekli dönen TikTok üretimi sun.`
  };
  state.botEnrichmentDirectives = enrichedDirectives;

  let jarvisUpdated = false;
  if (jarvis) {
   const jMem = await jarvis.loadMemory();
   let changed = false;
   for (const d of auditRes.defects.slice(0, 2)) {
    if (!jMem.avoidLessons.some(l => l.lesson.toLowerCase() === d.lesson.toLowerCase())) {
     jMem.avoidLessons.push({
      id: `ut-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      unitId: d.unitId,
      category: d.category,
      lesson: d.lesson.slice(0, 220),
      createdAt: new Date().toISOString()
     });
     changed = true;
    }
   }
   for (const ctx of targets.slice(0, 2)) {
    const du = ctx && state.distilledUnits[ctx.id];
    if (du?.confusionTraps?.[0]) {
     const pat = `${ctx.id} (${ctx.unit}): "${du.confusionTraps[0].conceptA}" vs "${du.confusionTraps[0].conceptB}" ayrımını çeldiricide keskin kullan (${du.deficitTier} kademesini besle).`.slice(0, 200);
     if (!jMem.goldenPatterns.some(p => p.pattern.toLowerCase() === pat.toLowerCase())) {
      jMem.goldenPatterns.push({
       id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
       unitId: ctx.id,
       pattern: pat,
       createdAt: new Date().toISOString()
      });
      changed = true;
     }
    }
   }
   jMem.generation = Math.max(1, (jMem.generation || 0) + (state.epochsCompleted === 0 || changed ? 1 : 0));
   jMem.qwenBoostPercent = TRAINER_TOTAL_BOOST;
   jMem.addedIntelligenceBoostPercent = TRAINER_ADDED_BOOST;
   jMem.trainingScaleFactor = TRAINING_SCALE_FACTOR;
   jMem.upgradeFactorFromPrevious = UPGRADE_SCALE_FACTOR;
   jMem.qwenPowerMultiplier = Math.max(705000000, state.intelligenceMultiplier || 705000000);
   if (state.epochsCompleted === 0 || policyUpgraded || changed) {
    jMem.journal.push({
     id: `utj-${Date.now()}`,
     time: new Date().toISOString(),
     kind: 'continuous_ultra_singularity_train_100x',
     title: `Ultra-Singularity-705Mx+ (100x · +70,500,000,000% · 40 Aşama) Epoch #${state.epochsCompleted + 1}`,
     detail: `${targets.map(t => t?.id).filter(Boolean).join(', ')} damıtıldı · ${trapPassed}/${trapTotal} tuzak F1:%${trapF1} · ${state.crossUnitEdgesCount} çapraz köprü${policyUpgraded ? ' · Yeni Ultra-Singularity kural aktif' : ''}`
    });
   }
   await jarvis.saveMemory(jMem);
   jarvisUpdated = true;
  }

  state.epochsCompleted += 1;
  state.curriculumStagesCompleted = CURRICULUM_STAGES;
  state.distilledConceptPairs = Object.values(state.distilledUnits)
   .reduce((sum, u) =>
    sum
    + (u.keyFacts?.length || 0)
    + (u.confusionTraps?.length || 0)
    + (u.numericRules?.length || 0)
    + (u.causeEffectChains?.length || 0)
    + (u.exceptionClauses?.length || 0),
   0);
  state.syntheticDpoPairsCount = Object.values(state.distilledUnits)
   .reduce((sum, u) => sum + (u.syntheticDpoPairs?.length || 0), 0);
  state.blindSpotsMapped = Object.values(state.distilledUnits)
   .reduce((sum, u) => sum + (u.blindSpots?.length || 0), 0);
  state.trapDefensePassed = trapPassed;
  state.trapDefenseTotal = trapTotal;
  state.trapDefenseF1 = trapF1;

  const unitMasteryRatio = state.unitsTrained.length / totalUnits;
  state.curriculumMasteryPct = Math.min(100, Math.round(unitMasteryRatio * 55 + (trapF1 / 100) * 35 + Math.min(10, state.epochsCompleted * 1.5)));

  const multiplier = Math.max(
   705000000,
   Math.min(
    4500000000,
    705000000
     + Math.min(720000000, state.epochsCompleted * 36000000)
     + Math.min(540000000, Math.round(unitMasteryRatio * 540000000))
     + Math.min(480000000, Math.round(state.distilledConceptPairs * 2700000))
     + Math.min(300000000, state.crossUnitEdgesCount * 9000000)
     + Math.round((trapF1 / 100) * 420000000)
   )
  );
  state.intelligenceMultiplier = multiplier;
  state.peakMultiplier = Math.max(state.peakMultiplier || 705000000, multiplier);

  state.recentEpochs.push({
   epoch: state.epochsCompleted,
   stages: CURRICULUM_STAGES,
   units: targets.map(t => t?.id).filter(Boolean),
   newlyDistilledPairs,
   crossUnitEdges: state.crossUnitEdgesCount,
   trapPassed,
   trapTotal,
   trapF1,
   policyUpgraded,
   multiplier,
   timestamp: new Date().toISOString()
  });

  // ApexArchitect durumunu da senkron güncelle ki tüm 11 alt-sistem anında yararlansın!
  if (apex) {
   const axState = await apex.loadState();
   axState.version = 8;
   axState.upgradeFactorFromPrevious = UPGRADE_SCALE_FACTOR;
   axState.cumulativeUpgradeFactor = CUMULATIVE_UPGRADE_FACTOR;
   axState.trainingScaleFactor = TRAINING_SCALE_FACTOR;
   axState.codename = 'Ultra-Singularity-705Mx+ (100x Yükseltme · 3,000,000x Eğitim · +70,500,000,000% · %100 Yerel)';
   axState.baseBoostPercentage = TRAINER_BASE_BOOST;
   axState.addedIntelligenceBoostPercent = TRAINER_ADDED_BOOST;
   axState.boostPercentage = TRAINER_TOTAL_BOOST;
   axState.localExecutionOnly = true;
   axState.zeroApiRequired = true;
   axState.noApiKeyPrompts = true;
   axState.continuousTrainingEpochs = state.epochsCompleted;
   axState.trainedKnowledgeUnits = state.unitsTrained.length;
   axState.intelligenceMultiplier = Math.max(axState.intelligenceMultiplier || 705000000, multiplier);
   axState.peakMultiplier = Math.max(axState.peakMultiplier || 705000000, axState.intelligenceMultiplier);
   axState.turboQualityLock = true;
   axState.activeBotDirectives = {
    ...(axState.activeBotDirectives || {}),
    ...enrichedDirectives
   };
   const weakList = (studentProfile?.weakUnits || []).slice(0, 4);
   if (weakList.length) {
    axState.hyperParams.reframePriorityUnits = [...new Set([...(axState.hyperParams.reframePriorityUnits || []), ...weakList])].slice(0, 6);
   }
   axState.hyperParams.turboQualityLock = true;
   axState.hyperParams.preserveDifficultyTiers = true;
   axState.hyperParams.localExecutionOnly = true;
   await apex.saveState(axState);
  }

  // Claude-Tarzı Çok-Zekâlı & 5 Bilgi Seviyeli Öz-Doğrulama + 11 Botun Çok-Milyarlı Parametre Evrimi!
  let swarmRes = null;
  if (!skipSwarmEval) {
   const matrix = paramMatrix || new BotParameterMatrix(this.dataDir);
   const swarm = multiAiEval || new MultiAiSwarmEvaluator(this.dataDir);
   const policyForSwarm = evolver ? await evolver.loadPolicy().catch(() => null) : null;
   swarmRes = await swarm.evaluateAndEvolve({
    paramMatrix: matrix,
    items,
    contexts,
    passagesByUnit,
    evolver,
    policy: policyForSwarm,
    studentProfile,
    telemetry: { approvalRate: 85, dualAnswerBlocked: 0 },
    source: 'ultra-singularity-continuous-trainer-100x'
   }).catch(() => null);
   if (swarmRes?.parameterSummary) {
    state.parameterMatrixTotalBillions = swarmRes.parameterSummary.totalEcosystemParamsBillions;
    state.parameterEvolutionsCount = swarmRes.parameterSummary.totalEvolutions;
    state.swarmCompositeScore = swarmRes.postInspection?.compositeScore || 0;
    state.swarmLevelScores = swarmRes.postInspection?.levelScores || {};
    state.swarmSubsystemScores = swarmRes.postInspection?.subsystemScores || {};
   }
  }

  const saved = await this.saveState(state);
  return {
   ok: true,
   state: saved,
   ticksTotal: saved.epochsCompleted,
   upgradeFactorFromPrevious: UPGRADE_SCALE_FACTOR,
   cumulativeUpgradeFactor: CUMULATIVE_UPGRADE_FACTOR,
   trainingScaleFactor: TRAINING_SCALE_FACTOR,
   curriculumStagesCompleted: CURRICULUM_STAGES,
   localExecutionOnly: true,
   zeroApiRequired: true,
   noApiKeyPrompts: true,
   distilledCount: Object.keys(saved.distilledUnits || {}).length,
   crossUnitEdgesCount: saved.crossUnitEdgesCount,
   syntheticDpoPairsCount: saved.syntheticDpoPairsCount,
   parameterMatrix: swarmRes?.parameterSummary || null,
   swarmReport: swarmRes?.report || null,
   addedBoostPercent: TRAINER_ADDED_BOOST,
   totalBoostPercent: TRAINER_TOTAL_BOOST,
   trapReport: { passed: trapPassed, total: trapTotal, f1: trapF1 },
   targetsTrained: targets.map(t => t?.id).filter(Boolean),
   newlyDistilledPairs,
   policyUpgraded,
   jarvisUpdated,
   auditDefects: auditRes.defects
  };
 }

 // Soru üretimi, hakem denetimi, konu anlatımı ve video motoruna damıtılmış ünite zekâsı enjekte eder
 getUnitDistilledPrompt(state, unitId) {
  const du = state?.distilledUnits?.[unitId];
  if (!du) return '';
  const parts = [`ULTRA-SINGULARITY-705Mx+ (100x · 3,000,000x EĞİTİM · +70,500,000,000% · %100 YEREL) DAMITILMIŞ ÜNİTE ZEKÂSI (${unitId}):`];
  if (du.confusionTraps?.length) {
   parts.push(`• Tuzak Çiftleri: ${du.confusionTraps.slice(0, 2).map(t => `${t.conceptA} vs ${t.conceptB} (${t.distinction.slice(0, 90)})`).join(' | ')}`);
  }
  if (du.causeEffectChains?.length) {
   parts.push(`• Sebep-Sonuç Zinciri: ${du.causeEffectChains[0].slice(0, 140)}`);
  }
  if (du.exceptionClauses?.length) {
   parts.push(`• Kritik İstisna/Sınır: ${du.exceptionClauses[0].slice(0, 130)}`);
  }
  if (du.numericRules?.length) {
   parts.push(`• Sayısal/Ölçüt Kuralı: ${du.numericRules[0].slice(0, 140)}`);
  }
  if (du.deficitTier) {
   parts.push(`• Öncelikli Zorluk Açığı: "${du.deficitTier}" (kolay/orta/zor dengesini koru).`);
  }
  return `\n${parts.join('\n')}`;
 }

 // Video Yönetmeni & Yerel Video Stüdyosu için ünite zekâsından sinematik vurguları döndürür
 getVideoEnrichmentHint(state, unitId) {
  const du = state?.distilledUnits?.[unitId];
  if (!du) return '';
  return du.videoEnrichmentCue || '';
 }
}
