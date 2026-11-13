import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const norm = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

function tokenSet(text) {
 return new Set(norm(text).split(' ').filter(w => w.length >= 3));
}

function jaccardSim(aSet, bSet) {
 if (!aSet.size || !bSet.size) return 0;
 let inter = 0;
 for (const w of aSet) if (bSet.has(w)) inter++;
 return inter / (aSet.size + bSet.size - inter);
}

const DEFAULT_REPORT = {
 lastScanAt: null,
 totalScans: 0,
 scansTotal: 0,
 scannedCount: 0,
 approvedCount: 0,
 rejectedCount: 0,
 avgCompositeScore: 0,
 pruneThreshold: 20_000,
 threshold: 20_000,
 targetAfterPrune: 18_500,
 totalPrunedLifetime: 0,
 totalPrunedEver: 0,
 lastRunRemoved: 0,
 lastPrunedCount: 0,
 lowQualityFound: 0,
 nearDuplicatesFound: 0,
 nearDuplicatesRemoved: 0,
 aboveThreshold: false,
 tierBreakdown: { kolay: 0, orta: 0, zor: 0 },
 refillPriorityUnits: [],
 droppedSamples: [],
 journal: []
};

export class PoolCuratorBot {
 constructor(dataDir, opts = {}) {
  this.dataDir = dataDir;
  this.brainDir = resolve(dataDir, 'ai-brain');
  this.reportFile = resolve(this.brainDir, 'curator-report.json');
  this.pruneThreshold = Number.isFinite(opts.pruneThreshold) ? opts.pruneThreshold : 20_000;
  this.targetAfterPrune = Number.isFinite(opts.targetAfterPrune) ? opts.targetAfterPrune : 18_500;
  this.minKeepPerUnit = Number.isFinite(opts.minKeepPerUnit) ? opts.minKeepPerUnit : 5;
  this.minKeepPerTier = Number.isFinite(opts.minKeepPerTier) ? opts.minKeepPerTier : 15;
 }

 async _atomicWrite(filePath, obj) {
  await mkdir(this.brainDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 async loadReport() {
  try {
   const parsed = JSON.parse(await readFile(this.reportFile, 'utf8'));
   const merged = { ...DEFAULT_REPORT, ...(parsed || {}) };
   // Upgrade persisted reports from older larger-capacity settings.
   if (Number(merged.pruneThreshold) !== this.pruneThreshold || Number(merged.targetAfterPrune) !== this.targetAfterPrune) {
    merged.pruneThreshold = this.pruneThreshold;
    merged.threshold = this.pruneThreshold;
    merged.targetAfterPrune = this.targetAfterPrune;
    merged.aboveThreshold = (Number(merged.approvedCount) || 0) >= this.pruneThreshold;
   }
   return merged;
  } catch (e) {
   if (e.code === 'ENOENT') return {
    ...DEFAULT_REPORT,
    pruneThreshold: this.pruneThreshold,
    threshold: this.pruneThreshold,
    targetAfterPrune: this.targetAfterPrune
   };
   throw e;
  }
 }

 async saveReport(rep) {
  const next = {
   ...DEFAULT_REPORT,
   ...rep,
   droppedSamples: (rep.droppedSamples || []).slice(0, 12),
   journal: (rep.journal || []).slice(-30)
  };
  await this._atomicWrite(this.reportFile, next);
  return next;
 }

 // Her soruya 0-100 arası bileşik sınav kalitesi skoru verir
 scoreQuestion(q, researchMemory = null, similarityPenalty = 0) {
  let score = 0;
  // 1) İki hakem ortalama kalite puanı (0..40)
  const judgeScore = Number.isFinite(q.qualityScore) ? q.qualityScore : (q.verification?.qualityScore || 3.5);
  score += Math.min(40, Math.max(0, judgeScore * 8));

  // 2) Sınav potansiyeli & araştırma uyumu (0..22)
  const examPot = Number.isFinite(q.examPotential) ? q.examPotential : (q.verification?.examPotential || 3.5);
  score += Math.min(17, Math.max(0, examPot * 3.4));
  const unitHypotheses = researchMemory?.byUnit?.[q.unitId]?.examHypotheses || [];
  if (unitHypotheses.length > 0) {
   const qNorm = norm(`${q.question} ${q.topic} ${q.answer}`);
   if (unitHypotheses.some(h => norm(h.topic).split(' ').some(w => w.length >= 4 && qNorm.includes(w)))) {
    score += 5;
   }
  }

  // 3) Soru tipi ve açı zenginliği (0..18)
  const typeBonus = { vaka: 10, istisna: 10, karsilastirma: 9, neden_sonuc: 9, uygulama: 8, kavram: 6 };
  score += typeBonus[q.questionType] || 5;
  const angleBonus = { surpriz_baglam: 8, karsilastirmali_tuzak: 8, ters_eleme_istisna: 7, saha_vakasi: 7, dogrudan_tanim: 5 };
  score += angleBonus[q.questionAngle] || 3;

  // 4) Açıklama, kanıt ve çeldirici dengesi (0..20)
  const expLen = (q.explanation || '').trim().length;
  const evLen = (q.evidence || '').trim().length;
  if (expLen >= 50) score += 6;
  else if (expLen >= 25) score += 3;
  if (evLen >= 30) score += 5;
  else if (evLen >= 18) score += 2;

  if (Array.isArray(q.options) && q.options.length === 4) {
   const lens = q.options.map(o => o.trim().length);
   const ratio = Math.max(...lens) / Math.max(1, Math.min(...lens));
   const meanL = lens.reduce((s, x) => s + x, 0) / 4;
   const stdL = Math.sqrt(lens.reduce((s, x) => s + ((x - meanL) ** 2), 0) / 4);
   if (ratio <= 1.9 && stdL <= meanL * 0.25) score += 10;
   else if (ratio <= 2.3) score += 8;
   else if (ratio <= 3.0) score += 5;
   if (q.options.some(o => /(?:yukarıdakilerin hepsi|aşağıdakilerin hepsi|hiçbiri|tümü birden|hepsi doğrudur)/i.test(String(o)))) {
    score -= 28;
   }
   // Kökten cevaba kelime sızıntısı ve placeholder ceza kontrolü (hızlı sıfır-regex yol)
   const ansTrim = String(q.answer || '').trim();
   const ansLow = ansTrim.toLowerCase();
   if (ansLow.length >= 12 && String(q.question || '').toLowerCase().includes(ansLow)) score -= 24;
   if (ansTrim.length <= 24 && /(?:^\s*(?:seçenek\s*[a-d]|ş[ıi]k\s*[a-d]|örnek|taslak|placeholder|lorem|todo)\s*$|(?:\.\.\.|…)$)/i.test(ansTrim)) {
    score -= 30;
   }
  }

  score -= similarityPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
 }

 // Havuzu tarar; 20.000'e ulaşınca en zayıf tekrarları ayıklayıp 18.500 civarına indirir.
 async scanAndPrune({ items, researchMemory = null, adaptiveQuality = null, forcePrune = false, threshold = this.pruneThreshold, targetKeep = this.targetAfterPrune }) {
  const prevReport = await this.loadReport();
  const approved = items.filter(q => q.status === 'approved');
  const rejected = items.filter(q => q.status === 'rejected');

  // Ünite bazlı benzerlik ve kalite taraması; parmak izi ile karşılaştırma maliyeti sınırlanır.
  const byUnit = new Map();
  for (const q of approved) {
   if (!byUnit.has(q.unitId)) byUnit.set(q.unitId, []);
   byUnit.get(q.unitId).push(q);
  }

  const scored = [];
  const nearDuplicateIds = new Set();

  for (const [, unitList] of byUnit.entries()) {
   const prelim = unitList.map(q => ({ q, raw: this.scoreQuestion(q, researchMemory, 0) }))
    .sort((a, b) => b.raw - a.raw);

   // Hızlı tam/yüksek örtüşme tespiti için normalize edilmiş n-gram parmak izi + Jaccard penceresi
   const keptFingerprints = new Map();
   const keptSampleSets = [];
   for (const { q, raw } of prelim) {
    const tokens = tokenSet(`${q.question} ${q.answer}`);
    const sig = [...tokens].sort().slice(0, 6).join('|');
    let maxSim = 0;

    if (sig && keptFingerprints.has(sig)) {
     maxSim = Math.max(maxSim, jaccardSim(tokens, keptFingerprints.get(sig)));
    }
    if (maxSim < 0.80 && tokens.size > 0) {
     // Son 48 tutulmuş soru içinde tarama + uzunluk alt sınırı (|A|/|B| < 0.75 ise Jaccard >= 0.80 olamaz)
     const startIdx = Math.max(0, keptSampleSets.length - 48);
     for (let k = startIdx; k < keptSampleSets.length; k++) {
      const other = keptSampleSets[k];
      if (other.size * 4 < tokens.size * 3 || tokens.size * 4 < other.size * 3) continue;
      const s = jaccardSim(tokens, other);
      if (s > maxSim) {
       maxSim = s;
       if (maxSim >= 0.80) break;
      }
     }
    }

    const penalty = maxSim >= 0.78 ? 35 : maxSim >= 0.65 ? 15 : 0;
    const isDup = maxSim >= 0.80 && unitList.length > 6;
    if (isDup) {
     nearDuplicateIds.add(q.id);
    } else {
     if (sig && !keptFingerprints.has(sig)) keptFingerprints.set(sig, tokens);
     keptSampleSets.push(tokens);
    }
    const composite = Math.max(0, Math.min(100, Math.round(raw - penalty)));
    q.curatorScore = composite;
    scored.push({ q, composite, nearDup: isDup });
   }
  }

  const avgScore = scored.length
   ? +(scored.reduce((s, x) => s + x.composite, 0) / scored.length).toFixed(1)
   : 0;
  const lowQualityList = scored.filter(x => x.composite < 52 || x.nearDup);

  // Ünite + kolay/orta/zor koruma sayaçları (taban sınırları başlangıç büyüklüğüne göre sabitlenir!)
  const unitCounts = new Map();
  const tierCounts = { kolay: 0, orta: 0, zor: 0 };
  for (const s of scored) {
   unitCounts.set(s.q.unitId, (unitCounts.get(s.q.unitId) || 0) + 1);
   const diff = ['kolay', 'orta', 'zor'].includes(s.q.difficulty) ? s.q.difficulty : 'orta';
   tierCounts[diff]++;
  }
  const initialUnitCounts = new Map(unitCounts);
  const initialTierCounts = { ...tierCounts };

  const toDelete = new Set();
  const canDrop = (q) => {
   const diff = ['kolay', 'orta', 'zor'].includes(q.difficulty) ? q.difficulty : 'orta';
   const initU = initialUnitCounts.get(q.unitId) || 0;
   const initT = initialTierCounts[diff] || 0;
   const unitFloor = initU <= 2 ? initU : Math.min(this.minKeepPerUnit, Math.max(2, Math.floor(initU * 0.2)));
   const tierFloor = initT <= 2 ? initT : Math.min(this.minKeepPerTier, Math.max(2, Math.floor(initT * 0.1)));
   return (unitCounts.get(q.unitId) || 0) > unitFloor && (tierCounts[diff] || 0) > tierFloor;
  };
  const markDrop = (q) => {
   const diff = ['kolay', 'orta', 'zor'].includes(q.difficulty) ? q.difficulty : 'orta';
   toDelete.add(q.id);
   unitCounts.set(q.unitId, (unitCounts.get(q.unitId) || 1) - 1);
   tierCounts[diff] = Math.max(0, (tierCounts[diff] || 1) - 1);
  };

  // 1) Önce yakın kopyaları temizle
  for (const s of scored) {
   if (s.nearDup && canDrop(s.q)) markDrop(s.q);
  }

  // 2) 20.000 eşiğine ulaşıldıysa (veya forcePrune istendiyse) kaliteyi koruyarak hedefe kadar sil
  const aboveThreshold = approved.length >= threshold;
  if ((aboveThreshold || forcePrune) && (approved.length - toDelete.size) > targetKeep) {
   const candidates = scored
    .filter(x => !toDelete.has(x.q.id))
    .sort((a, b) => a.composite - b.composite);

   for (const c of candidates) {
    if ((approved.length - toDelete.size) <= targetKeep) break;
    if (canDrop(c.q)) markDrop(c.q);
   }
  }

  const scoredById = new Map(scored.map(s => [s.q.id, s]));
  const droppedSamples = [];
  const nextItems = [];
  for (const it of items) {
   if (it.status === 'approved' && toDelete.has(it.id)) {
    const match = scoredById.get(it.id);
    droppedSamples.push({
     id: it.id,
     unitId: it.unitId,
     score: match?.composite ?? 0,
     reason: match?.nearDup ? 'Yakın tekrar soru' : '20k havuz sınırında düşük kalite',
     question: String(it.question || '').slice(0, 120)
    });
   } else {
    nextItems.push(it);
   }
  }

  // Yeniden doldurma önceliği verilecek üniteler (ort. puanı veya adedi düşenler)
  const refillPriorityUnits = [...byUnit.entries()]
   .map(([uid, arr]) => {
    const rem = arr.filter(q => !toDelete.has(q.id));
    const unitScores = scored.filter(s => s.q.unitId === uid && !toDelete.has(s.q.id));
    const unitAvg = unitScores.length ? unitScores.reduce((s, x) => s + x.composite, 0) / unitScores.length : 0;
    return { unitId: uid, count: rem.length, avgScore: +unitAvg.toFixed(1) };
   })
   .sort((a, b) => a.avgScore - b.avgScore || a.count - b.count)
   .slice(0, 6)
   .map(x => x.unitId);

  const now = new Date().toISOString();
  const prunedNow = droppedSamples.length;
  const journal = [...(prevReport.journal || [])];
  if (prunedNow > 0 || (prevReport.totalScans || 0) % 5 === 0) {
   journal.push({
    id: `cur-${Date.now()}`,
    time: now,
    title: prunedNow > 0
     ? `Havuz Botu: ${prunedNow} düşük kaliteli/tekrar soru silindi (yerine yüksek kaliteli üretiliyor)`
     : `Havuz Tarandı: ${approved.length} soru analiz edildi (Ort. kalite: ${avgScore}/100)`,
    detail: `Eşik: ${threshold} · Yakın tekrar: ${nearDuplicateIds.size} · Düşük skorlu aday: ${lowQualityList.length}`
   });
  }

  const nextScans = (prevReport.totalScans || prevReport.scansTotal || 0) + 1;
  const totalPrunedEver = (prevReport.totalPrunedLifetime || prevReport.totalPrunedEver || 0) + prunedNow;
  const nearDupsTotal = (prevReport.nearDuplicatesFound || prevReport.nearDuplicatesRemoved || 0) + nearDuplicateIds.size;

  const report = await this.saveReport({
   lastScanAt: now,
   totalScans: nextScans,
   scansTotal: nextScans,
   scannedCount: items.length,
   approvedCount: approved.length - prunedNow,
   rejectedCount: rejected.length,
   avgCompositeScore: avgScore,
   pruneThreshold: threshold,
   threshold,
   targetAfterPrune: targetKeep,
   totalPrunedLifetime: totalPrunedEver,
   totalPrunedEver,
   lastRunRemoved: prunedNow,
   lastPrunedCount: prunedNow,
   lowQualityFound: lowQualityList.length,
   nearDuplicatesFound: nearDuplicateIds.size,
   nearDuplicatesRemoved: nearDupsTotal,
   aboveThreshold,
   tierBreakdown: tierCounts,
   refillPriorityUnits,
   droppedSamples: droppedSamples.slice(0, 10),
   adaptiveMinScore: adaptiveQuality?.minQualityScore ?? 4,
   journal
  });

  return {
   changed: prunedNow > 0,
   removedCount: prunedNow,
   prunedCount: prunedNow,
   scoredCount: scored.length,
   items: nextItems,
   nextItems,
   deletedItems: droppedSamples,
   report
  };
 }

 async scanAndCurate(args) {
  return this.scanAndPrune(args);
 }
}
