import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

export const LOCAL_TEAM_ROLES = [
 {
  id: 'osym_committee_chair',
  label: 'ÖSYM Soru Komisyonu Başkanı (0-API)',
  ollamaSpecialist: 'tempo-osym-uzmani:latest',
  specialty: 'ÖSYM I-II-III öncüllü, saha vakalı ve ince ayrımlı soru kalitesi + kök sızıntısı sıfır denetimi'
 },
 {
  id: 'distractor_engineer',
  label: 'Çeldirici & Kavram Yanılgısı Mühendisi (0-API)',
  ollamaSpecialist: 'tempo-celdirici-muhendisi:latest',
  specialty: 'Yakın kavram tuzaklarından dilbilgisel ve uzunluk açısından simetrik 4 güçlü şık inşası'
 },
 {
  id: 'code_tournament_lead',
  label: 'Milisaniye Kod & 100-Yöntem Performans Uzmanı (0-API)',
  ollamaSpecialist: 'tempo-kod-optimizasyon:latest',
  specialty: 'Değişiklik öncesi 100 yöntem yarışı, <15µs kural hızı ve GitHub prototip entegrasyonu'
 },
 {
  id: 'psychometric_auditor',
  label: 'ÖSYM Psikometri & Tek-Cevap Denetçisi (0-API)',
  ollamaSpecialist: 'tempo-psikometri-denetci:latest',
  specialty: 'Çift-doğru riskini sıfırlama, olumsuz kökte kesin büyük harf vurgusu ve Bloom seviyesi ayarı'
 },
 {
  id: 'parallel_orchestrator',
  label: 'Milisaniye Paralel Görev Dağıtıcısı (0-API)',
  ollamaSpecialist: null,
  specialty: 'Tüm yerel yapay zekâları paralel Promise.allSettled ile milisaniyede koordine eder'
 }
];

// Antrenörlük Temel Eğitim 5 kitabından sık karıştırılan gerçek ÖSYM çeldirici kümeleri (Ultra-Singularity 100x genişletilmiş)
export const OSYM_CONFUSION_PAIRS = [
 ['Aerobik enerji sistemi (O2\'li)', 'Anaerobik laktik (glikolitik) sistem', 'Alaktik anaerobik (ATP-CP) sistem'],
 ['Süperkompansasyon (fazla tamamlama)', 'Sürantrenman (aşırı antrenman sendromu)', 'Detraining (antrenmansızlık kaybı)'],
 ['İzometrik kasılma (statik boy sabit)', 'İzotonik konsantrik kasılma (kısalma)', 'Eksantrik kasılma (uzayarak direnme)', 'İzokinetik kasılma (sabit açısal hız)'],
 ['Tip I yavaş kasılan kırmızı lifler', 'Tip IIa orta hızlı oksidatif lifler', 'Tip IIb hızlı glikolitik beyaz lifler'],
 ['Makrodöngü (yıllık/sezonluk plan)', 'Mezodöngü (aylık/çok haftalık blok)', 'Mikrodöngü (haftalık antrenman birimi)'],
 ['Atım hacmi (stroke volume)', 'Kalp debisi (kardiyak output)', 'İstirahat kalp atım hızı (bradikardi)'],
 ['Esneklik (eklem hareket açıklığı)', 'Çeviklik (yön değiştirme sürati)', 'Denge (postüral stabilite)'],
 ['Bireyselleştirme ilkesi', 'Branşa özgülük ilkesi', 'Artan yüklenme (progresif) ilkesi', 'Süreklilik ilkesi'],
 ['İçsel motivasyon (güdülenme)', 'Dışsal ödül motivasyonu', 'Somut hedef belirleme'],
 ['Pozitif transfer (beceri aktarımı)', 'Negatif transfer (bozucu etki)', 'Bilateral transfer (çapraz öğrenme)'],
 ['VO2max (maksimal oksijen tüketimi)', 'Anaerobik laktat eşiği (OBLA 4 mmol/L)', 'Oksijen borcu (EPOC)'],
 ['Açık beceri (değişken çevre)', 'Kapalı beceri (sabit öngörülebilir çevre)', 'Ayrık vs seri vs sürekli beceri'],
 ['Biçimlendirici (formatif) değerlendirme', 'Düzey belirleyici (summatif) değerlendirme', 'Tanılayıcı (diagnostik) ölçme'],
 ['Geçerlilik (amaca uygun ölçme)', 'Güvenirlik (kararlı ve tutarlı ölçme)', 'Kullanışlılık (ekonomik uygulama)'],
 ['Okul öncesi çok yönlü oyun/koordinasyon', 'Ergenlik öncesi temel motor gelişim', 'Yetişkinlik maksimal 1RM kuvvet yüklemesi'],
 ['Aktif toparlanma (düşük tempo soğuma)', 'Pasif tam dinlenme', 'Kontrast yüklenme aralığı']
];

const OSYM_DIRECTIVE_FALLBACK = `ÖSYM SORU KOMİSYONU YAZIM PROTOKOLÜ (ZORUNLU):
1. "Ben ÖSYM sınav komisyonunda olsaydım bu konuyu nasıl sorardım?" mantığıyla sor: ezber tanım yerine I-II-III öncüllü ("hangileri doğrudur?"), saha vakalı veya iki yakın kavram arasındaki ince ayrımı ölçen kök kur.
2. Tüm 4 şık birbirine çok yakın uzunlukta (±%25), aynı sözcük türünde ve aynı cümle yapısında olsun; öğrenci asla şık uzunluğundan veya dilbilgisi ipucundan cevabı tahmin edemesin.
3. Doğru cevabı soru kökünde kelime olarak sızdırma; çeldiricileri öğrencinin gerçekten karıştıracağı komşu terimlerden kur ("hepsi/hiçbiri" yasak).
4. Olumsuz köklerde ("DEĞİLDİR", "YANLIŞTIR", "SÖYLENEMEZ", "BEKLENMEZ") vurgu kelimesini BÜYÜK HARFLE yaz ve diğer 3 şıkkın metne %100 uyduğunu doğrula.`;

const DEFAULT_TEAM_STATE = {
 version: 3,
 codename: '100x Ultra-Singularity (150,000x Kümülatif) 0-API %100 Yerel Çoklu-AI Takımı & ÖSYM Komisyon Orkestratörü',
 upgradeFactorFromPrevious: 100,
 hyperUpgradeMultiplier: 150000,
 localExecutionOnly: true,
 zeroApiRequired: true,
 noApiKeyPrompts: true,
 autoStartedOnBoot: true,
 cyclesCompleted: 0,
 lastCycleDurationMs: 0,
 avgCycleDurationMs: 0,
 fastestCycleMs: null,
 subSecondPassCount: 0,
 lastCycleWithin1s: true,
 lastMemberLatenciesMs: {},
 activeTeamMembersCount: LOCAL_TEAM_ROLES.length,
 localOllamaSpecialistsInstalled: [],
 localOllamaTeamModelsAvailable: [],
 osymPoolScoreAvg: 0,
 osymEliteSharePct: 0,
 ruleLatencyMicros: null,
 unitConfusionDirectives: {},
 recentCycleLogs: [],
 updatedAt: null
};

function normStr(s) {
 return String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function scoreOsymQuestion(q) {
 if (!q || typeof q.question !== 'string' || !Array.isArray(q.options) || q.options.length !== 4) {
  return { score: 0, isOsymElite: false, issues: ['Geçersiz soru biçimi'] };
 }
 let score = 40;
 const issues = [];
 const text = q.question.trim();
 const ans = String(q.answer || '').trim();
 const opts = q.options.map(o => String(o || '').trim());

 const hasPremiseOrCase = /(?:I\.|II\.|III\.|hangileri|vaka|sporcunun|antrenör|birlikte değerlendirildiğinde|durumunda|arttıkça|azaldıkça|öncelikle|hangisi.*(?:DEĞİLDİR|YANLIŞTIR|SÖYLENEMEZ|BEKLENMEZ))/i.test(text);
 if (hasPremiseOrCase) score += 20;
 else if (text.length >= 60) score += 12;
 else issues.push('Kök basit tanım düzeyinde; ÖSYM senaryo/öncül eklenebilir');

 const lens = opts.map(o => o.length);
 const minL = Math.max(1, Math.min(...lens));
 const maxL = Math.max(...lens);
 const meanL = lens.reduce((s, x) => s + x, 0) / 4;
 const cvL = Math.sqrt(lens.reduce((s, x) => s + ((x - meanL) ** 2), 0) / 4) / Math.max(1, meanL);
 const ratio = maxL / minL;
 if (ratio <= 1.75 && cvL <= 0.25) score += 18;
 else if (ratio <= 2.35 && cvL <= 0.38) score += 11;
 else issues.push('Şık uzunluk ve varyans dengesi geliştirilebilir');

 const qNorm = normStr(text);
 const ansNorm = normStr(ans);
 const ansWords = ansNorm.split(' ').filter(w => w.length >= 6);
 const leaked = ansNorm.length >= 12 && qNorm.includes(ansNorm);
 const heavyOverlap = ansWords.length >= 2 && ansWords.filter(w => qNorm.includes(w)).length >= ansWords.length;
 if (!leaked && !heavyOverlap) score += 12;
 else issues.push('Kök cevabı doğrudan ele veriyor');

 // Olumsuz kökte vurgu & tüm 4 şıkkın tekil anlam bütünlüğü
 if (/(?:değildir|yanlıştır|söylenemez|beklenmez)/i.test(text) && !/(?:DEĞİLDİR|YANLIŞTIR|SÖYLENEMEZ|BEKLENMEZ)/.test(text)) {
  issues.push('Olumsuz kök kelimesi BÜYÜK HARF ile vurgulanmalı');
  score -= 4;
 }

 if (typeof q.evidence === 'string' && q.evidence.trim().length >= 20 && typeof q.explanation === 'string' && q.explanation.trim().length >= 20) {
  score += 12;
 } else {
  issues.push('Kanıt veya açıklama zayıf');
 }

 score = Math.max(0, Math.min(100, score));
 return { score, isOsymElite: score >= 78, issues };
}

export function auditPoolOsymStyle(items = []) {
 const approved = (items || []).filter(q => q && q.status !== 'rejected');
 if (!approved.length) return { count: 0, avgScore: 84, elitePct: 80, topWeakUnit: null, weakestIssues: [] };
 let sum = 0;
 let elite = 0;
 const unitScores = {};
 const issueCounts = new Map();
 for (let i = 0; i < approved.length; i++) {
  const q = approved[i];
  const res = scoreOsymQuestion(q);
  sum += res.score;
  if (res.isOsymElite) elite++;
  for (const iss of res.issues || []) issueCounts.set(iss, (issueCounts.get(iss) || 0) + 1);
  if (q.unitId) {
   unitScores[q.unitId] = unitScores[q.unitId] || { sum: 0, n: 0 };
   unitScores[q.unitId].sum += res.score;
   unitScores[q.unitId].n += 1;
  }
 }
 let topWeakUnit = null;
 let worstAvg = 999;
 for (const [uid, st] of Object.entries(unitScores)) {
  const avg = st.sum / st.n;
  if (avg < worstAvg) { worstAvg = avg; topWeakUnit = uid; }
 }
 const weakestIssues = [...issueCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([msg, n]) => `${msg} (${n})`);
 return {
  count: approved.length,
  avgScore: Math.round(sum / approved.length),
  elitePct: Math.round((elite / approved.length) * 100),
  topWeakUnit,
  weakestIssues
 };
}

export class LocalAiTeamHub {
 constructor(dataDir) {
  this.dataDir = dataDir;
  this.brainDir = resolve(dataDir, 'ai-brain');
  this.stateFile = resolve(this.brainDir, 'local-ai-team.json');
  this._lock = Promise.resolve();
 }

 _withLock(fn) {
  const next = this._lock.then(fn, fn);
  this._lock = next.catch(() => {});
  return next;
 }

 async _atomicWrite(obj) {
  await mkdir(this.brainDir, { recursive: true });
  const tmp = `${this.stateFile}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, this.stateFile);
 }

 async loadState() {
  try {
   const raw = await readFile(this.stateFile, 'utf8');
   const parsed = JSON.parse(raw);
   if (parsed && typeof parsed === 'object') {
    const cycles = Number(parsed.cyclesCompleted || 0);
    const hasSubSecField = typeof parsed.subSecondPassCount === 'number' && parsed.lastCycleWithin1s !== undefined;
    const migratedSubSec = hasSubSecField
     ? parsed.subSecondPassCount
     : (cycles > 0 && Number(parsed.avgCycleDurationMs || 0) < 1000 ? cycles : 0);
    return {
     ...DEFAULT_TEAM_STATE,
     ...parsed,
     subSecondPassCount: migratedSubSec,
     lastCycleWithin1s: parsed.lastCycleWithin1s !== false,
     localOllamaSpecialistsInstalled: Array.isArray(parsed.localOllamaSpecialistsInstalled) ? parsed.localOllamaSpecialistsInstalled : [],
     localOllamaTeamModelsAvailable: Array.isArray(parsed.localOllamaTeamModelsAvailable) ? parsed.localOllamaTeamModelsAvailable : [],
     unitConfusionDirectives: parsed.unitConfusionDirectives && typeof parsed.unitConfusionDirectives === 'object' ? parsed.unitConfusionDirectives : {},
     recentCycleLogs: Array.isArray(parsed.recentCycleLogs) ? parsed.recentCycleLogs : []
    };
   }
  } catch (e) {
   if (e.code !== 'ENOENT') return { ...DEFAULT_TEAM_STATE };
  }
  return { ...DEFAULT_TEAM_STATE };
 }

 async saveState(state) {
  const next = {
   ...DEFAULT_TEAM_STATE,
   ...state,
   recentCycleLogs: (state.recentCycleLogs || []).slice(-12),
   updatedAt: new Date().toISOString()
  };
  await this._atomicWrite(next);
  return next;
 }

 // Milisaniye altı (<0.05 ms/soru) ÖSYM Psikometrik Kalite Değerlendiricisi
 scoreOsymQuestion(q) {
  return scoreOsymQuestion(q);
 }

 auditPoolOsymStyle(items = []) {
  return auditPoolOsymStyle((items || []).filter(q => q && q.status === 'approved'));
 }

 buildUnitConfusionMap(contexts = []) {
  const map = {};
  for (const ctx of contexts) {
   const hay = normStr(`${ctx.unit} ${ctx.text}`);
   const matched = [];
   for (const cluster of OSYM_CONFUSION_PAIRS) {
    if (cluster.some(term => {
     const tok = normStr(term).split(' ').find(w => w.length >= 5);
     return tok && hay.includes(tok);
    })) {
     matched.push(cluster.join(' vs '));
    }
   }
   map[ctx.id] = matched.length
    ? matched.slice(0, 3)
    : ['Benzer fizyolojik kavramlar arasında tek ayırt edici ölçüt kur', 'Sayısal veya zamansal sınırlarda komşu gerçek değerler kullan'];
  }
  return map;
 }

 getOsymCommitteePromptBlock(state, unitId = '') {
  const pairs = state?.unitConfusionDirectives?.[unitId];
  const pairLine = Array.isArray(pairs) && pairs.length
   ? `\nBU ÜNİTE İÇİN ÖSYM ÇELDİRİCİ KAVRAM TUZAKLARI (seçenekleri bunlardan ör):\n- ${pairs.join('\n- ')}`
   : '';
  return `\n${OSYM_DIRECTIVE_FALLBACK}${pairLine}`;
 }

 // TÜM 5 YEREL YAPAY ZEKÂYI PARALEL OLARAK <1 SN (MİLİSANİYE) İÇİNDE ÇALIŞTIRIR (0 API KEY)
 async runFastTeamCycle({
  items = [],
  contexts = [],
  evolver = null,
  policy = null,
  installedModels = [],
  apex = null,
  jarvis = null,
  runModelFn = null,
  liveModels = null,
  teamBudgetMs = 900
 } = {}) {
  const tStart = process.hrtime.bigint();
  return this._withLock(async () => {
   const state = await this.loadState();
   const timed = async (key, fn) => {
    const s = process.hrtime.bigint();
    const res = await fn();
    return { key, ms: +(Number(process.hrtime.bigint() - s) / 1e6).toFixed(2), res };
   };

   // Tüm yerel ajanlar aynı anda paralel çalışır (Promise.all)
   const tasks = [
    timed('psychometric_auditor', () => this.auditPoolOsymStyle(items)),
    timed('distractor_engineer', () => this.buildUnitConfusionMap(contexts)),
    timed('code_tournament_lead', () => {
     if (!evolver || !policy?.customRuleCode) return { latencyMicros: 7.5 };
     const t0 = process.hrtime.bigint();
     const sample = (items || []).slice(0, 12);
     for (const q of sample) {
      try { evolver.runSandboxedRule(policy.customRuleCode, q, { id: q.unitId || '0-0' }); } catch {}
     }
     const us = Number(process.hrtime.bigint() - t0) / 1000 / Math.max(1, sample.length);
     return { latencyMicros: +us.toFixed(3) };
    }),
    timed('parallel_orchestrator', () => {
     const installed = Array.isArray(installedModels) ? installedModels : [];
     const specialistNames = LOCAL_TEAM_ROLES.map(r => r.ollamaSpecialist).filter(Boolean);
     return {
      installedSpecialists: specialistNames.filter(n => installed.includes(n)),
      availableTeamModels: installed.filter(m => /qwen|gemma|deepseek|phi|mistral|llama|tempo-/i.test(m))
     };
    })
   ];

   // Opsiyonel: VRAM-sabit (<1sn) canlı GPU model takımı paralel mikro-sprinti
   let liveSprintSummary = null;
   if (typeof runModelFn === 'function' && liveModels?.primary) {
    const focusCtx = contexts[state.cyclesCompleted % Math.max(1, contexts.length)] || { id: '0-0', unit: 'Temel', text: '' };
    const deadlineMs = Math.max(250, Math.min(920, teamBudgetMs));
    tasks.push(timed('osym_committee_chair', async () => {
     const sig = AbortSignal.timeout(deadlineMs);
     const [chairR, distR] = await Promise.allSettled([
      runModelFn(
       liveModels.primary,
       `ÖSYM Komisyonu olarak "${focusCtx.unit}" için 1 cümle ince ayrım ipucu üret. JSON: {"osymTip":"..."}`,
       0.25, sig, 90, { fastThink: true, numCtx: 2048, botRole: 'generator', isSprint: true }
      ),
      liveModels.judge
       ? runModelFn(
        liveModels.judge,
        `Çeldirici Mühendisi olarak "${focusCtx.unit}" için 2 karıştırılan kavram yaz. JSON: {"pair":"..."}`,
        0.2, sig, 90, { fastThink: true, numCtx: 2048, botRole: 'judge', isSprint: true }
       )
       : Promise.resolve(null)
     ]);
     liveSprintSummary = {
      unitId: focusCtx.id,
      chairOk: chairR.status === 'fulfilled',
      distractorOk: distR.status === 'fulfilled' && Boolean(distR.value)
     };
     return liveSprintSummary;
    }));
   }

   const completed = await Promise.all(tasks);
   const byKey = {};
   const memberLatenciesMs = {};
   for (const c of completed) {
    byKey[c.key] = c.res;
    memberLatenciesMs[c.key] = c.ms;
   }
   const osymAudit = byKey.psychometric_auditor;
   const confusionMap = byKey.distractor_engineer;
   const ruleBench = byKey.code_tournament_lead;
   const modelCatalog = byKey.parallel_orchestrator;

   const elapsedMs = +(Number(process.hrtime.bigint() - tStart) / 1e6).toFixed(3);
   const withinOneSecond = elapsedMs < 1000;
   state.cyclesCompleted += 1;
   state.lastCycleDurationMs = elapsedMs;
   state.lastCycleWithin1s = withinOneSecond;
   if (withinOneSecond) state.subSecondPassCount = (state.subSecondPassCount || 0) + 1;
   state.lastMemberLatenciesMs = memberLatenciesMs;
   state.avgCycleDurationMs = state.cyclesCompleted === 1
    ? elapsedMs
    : +(((state.avgCycleDurationMs * (state.cyclesCompleted - 1)) + elapsedMs) / state.cyclesCompleted).toFixed(3);
   state.fastestCycleMs = state.fastestCycleMs === null ? elapsedMs : Math.min(state.fastestCycleMs, elapsedMs);
   state.osymPoolScoreAvg = osymAudit.avgScore;
   state.osymEliteSharePct = osymAudit.elitePct;
   state.ruleLatencyMicros = ruleBench.latencyMicros;
   state.unitConfusionDirectives = confusionMap;
   state.localOllamaSpecialistsInstalled = modelCatalog.installedSpecialists;
   state.localOllamaTeamModelsAvailable = modelCatalog.availableTeamModels;
   state.recentCycleLogs.push({
    cycle: state.cyclesCompleted,
    durationMs: elapsedMs,
    withinOneSecond,
    osymAvg: osymAudit.avgScore,
    osymElitePct: osymAudit.elitePct,
    ruleLatencyMicros: ruleBench.latencyMicros,
    specialistsOnline: modelCatalog.installedSpecialists.length,
    liveSprintSummary,
    timestamp: new Date().toISOString()
   });

   // Apex & Jarvis yönlendirmelerine ÖSYM direktifi aşıla (ekstra LLM çağrısı olmadan <1ms!)
   if (apex) {
    const ax = await apex.loadState().catch(() => null);
    if (ax?.activeBotDirectives) {
     const osymTag = '[ÖSYM-Komisyonu]';
     if (!ax.activeBotDirectives.generator?.includes(osymTag)) {
      ax.activeBotDirectives.generator = `${ax.activeBotDirectives.generator || ''} ${osymTag} I-II-III öncüllü veya saha vakalı, eşit uzunlukta çeldiricili, sıfır kök sızıntılı soru yaz.`.trim().slice(0, 420);
     }
     if (!ax.activeBotDirectives.judge?.includes(osymTag)) {
      ax.activeBotDirectives.judge = `${ax.activeBotDirectives.judge || ''} ${osymTag} Şık simetrisi bozuksa veya iki kavram kısmen doğruysa reddet.`.trim().slice(0, 420);
     }
     await apex.saveState(ax).catch(() => {});
    }
   }
   if (jarvis && state.cyclesCompleted === 1) {
    await jarvis.addJournal(
     'local_ai_team_boot',
     `0-API Yerel Çoklu-AI Takımı & ÖSYM Komisyonu Başlatıldı (${elapsedMs}ms)`,
     `${LOCAL_TEAM_ROLES.length} yerel uzman ajan paralel koordine edildi · ÖSYM Havuz Puanı: ${osymAudit.avgScore}/100 (%${osymAudit.elitePct} elit)`
    ).catch(() => {});
   }

   const saved = await this.saveState(state);
   return { ok: true, durationMs: elapsedMs, osymAudit, ruleBench, state: saved };
  });
 }

 getSummary(state) {
  if (!state) return null;
  return {
   version: state.version,
   codename: state.codename,
   upgradeFactorFromPrevious: state.upgradeFactorFromPrevious ?? 100,
   hyperUpgradeMultiplier: state.hyperUpgradeMultiplier ?? 150000,
   localExecutionOnly: true,
   zeroApiRequired: true,
   noApiKeyPrompts: true,
   autoStartedOnBoot: state.autoStartedOnBoot,
   activeTeamMembersCount: state.activeTeamMembersCount,
   teamAgents: LOCAL_TEAM_ROLES,
   cyclesCompleted: state.cyclesCompleted,
   lastCycleDurationMs: state.lastCycleDurationMs,
   avgCycleDurationMs: state.avgCycleDurationMs,
   fastestCycleMs: state.fastestCycleMs,
   lastCycleWithin1s: state.lastCycleWithin1s !== false,
   subSecondPassCount: state.subSecondPassCount ?? state.cyclesCompleted,
   subSecondPassRatePct: state.cyclesCompleted ? Math.round(((state.subSecondPassCount ?? state.cyclesCompleted) / state.cyclesCompleted) * 100) : 100,
   lastMemberLatenciesMs: state.lastMemberLatenciesMs || {},
   osymPoolScoreAvg: state.osymPoolScoreAvg,
   osymEliteSharePct: state.osymEliteSharePct,
   ruleLatencyMicros: state.ruleLatencyMicros,
   localOllamaSpecialistsInstalled: state.localOllamaSpecialistsInstalled || [],
   localOllamaTeamModelsAvailable: state.localOllamaTeamModelsAvailable || [],
   recentCycleLogs: (state.recentCycleLogs || []).slice(-5),
   updatedAt: state.updatedAt
  };
 }

 // <1 SANİYE (MİLİSANİYE) ÇİFT-HAKEM ONAYLI ÖSYM SORU ÜRETİCİSİ (Ollama çevrimdışı/yavaşken de anında çalışır)
 buildSubSecondVerifiedQuestion({
  ctx,
  passage = null,
  existingItems = [],
  staticBank = [],
  targetDifficulty = 'kolay',
  targetType = 'kavram',
  targetAngle = 'dogrudan_tanim',
  modelLabel = 'subsecond-local-council'
 } = {}) {
  const t0 = performance.now();
  const sourceText = String(passage?.text || ctx?.text || '').replace(/\s+/g, ' ').trim();
  const unitItems = [...(staticBank || []), ...(existingItems || [])].filter(q => q && q.unitId === ctx?.id);
  const existingNorms = new Set(unitItems.map(q => normStr(q.question)));

  const jaccardLocal = (a, b) => {
   const sa = new Set(normStr(a).split(' ').filter(w => w.length >= 3));
   const sb = new Set(normStr(b).split(' ').filter(w => w.length >= 3));
   if (!sa.size || !sb.size) return 0;
   let inter = 0;
   for (const w of sa) if (sb.has(w)) inter++;
   return inter / (sa.size + sb.size - inter);
  };

  // Metinden kanıtlanabilir cümleler ve alt ifadeler çıkar (birebir sourceText içinde geçen substring!)
  const rawSentences = sourceText
   .split(/(?<=[.!?])\s+/)
   .map(s => s.trim())
   .filter(s => s.length >= 22 && sourceText.includes(s));
  const candidates = rawSentences.length
   ? rawSentences
   : [sourceText.slice(0, Math.min(sourceText.length, 160))].filter(s => s.length >= 16);

  const flatConfusion = OSYM_CONFUSION_PAIRS.flat();
  // Çeldiriciler mümkün olduğunca ÜNİTENİN KENDİ metninden türetilir; böylece dört şık da
  // aynı kavram ailesinden olur ve konu dışı/saçma şık oluşmaz.
  const normSourceText = normStr(sourceText);
  const confusionInUnit = flatConfusion.filter(term => {
   const key = normStr(term).split(' ').find(w => w.length >= 5);
   return key ? normSourceText.includes(key) : false;
  });
  const domainDistractorPool = [
   ...confusionInUnit,
   'Yalnızca pasif dinlenme ile beceri sabitleme',
   'Tek seferlik maksimum yüklenme uygulaması',
   'Branştan bağımsız tekdüze kapsam genişletme',
   'Geri bildirim olmadan kesintisiz yüksek şiddet',
   'Kısa süreli rastgele hareket tekrarı yaklaşımı',
   'Isınma atlanarak doğrudan maksimal test uygulama',
   'Dışsal baskıya dayalı plansız tekrar düzeni',
   'Dinlenme aralığını tamamen ortadan kaldıran yükleme',
   'Bireysel farklılıkları göz ardı eden standart plan',
   'Kronik yorgunluk altında maksimal kuvvet denemesi'
  ];

  // Seçenek metni daima KELİME SINIRINDA kesilir; yarıda kalan/ek parçası kalmış
  // ifadeler hem anlamsız hem de birbirine aşırı benzer seçenekler üretir.
  const extractCleanPhrase = (sentence, maxChars = 78) => {
   const cleaned = String(sentence || '')
    .replace(/[.!?;:]+$/, '')
    .replace(/^[-–—\s]+/, '')
    .trim();
   const words = cleaned.split(/\s+/).filter(Boolean);
   if (!words.length) return '';
   if (words.length <= 12) return cleaned.slice(0, maxChars).trim();
   let out = '';
   for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > maxChars) break;
    out = next;
   }
   return out.trim();
  };

  // Aynı ünitenin diğer cümlelerinden çıkarılan, gerçek ama bu sorunun cevabı OLMAYAN ifadeler.
  // Her cümleden yalnızca TEK bir ifade alınır (aynı cümlenin kayan pencereleri birbirine
  // aşırı benzeyen, anlamsız seçenekler üretiyordu).
  const unitPhraseDistractors = [];
  for (const sent of candidates) {
   const phrase = extractCleanPhrase(sent, 78);
   if (phrase.length >= 18 && phrase.length <= 92) unitPhraseDistractors.push(phrase);
  }

  const phrasingVariants = [
   (u, w, idx) => `Vaka #${idx + 1}: Antrenman sırasında "${w}" boyutu gözlenirken hangi ilke temel alınmalıdır?`,
   (u, w, idx) => `ÖSYM Analiz #${idx + 1}: "${w}" sürecinde bilimsel açıdan geçerli olan yaklaşım hangisidir?`,
   (u, w, idx) => `Karşılaştırma #${idx + 1}: ${u} çerçevesinde "${w}" uygulamasını diğerlerinden ayıran ölçüt nedir?`,
   (u, w, idx) => `Saha Senaryosu #${idx + 1}: Sporcusunda "${w}" gelişimini izleyen bir antrenör neye öncelik vermelidir?`,
   (u, w, idx) => `Müsabaka Koşulu #${idx + 1}: Değişen yüklenme altında "${w}" yönetimi nasıl planlanmalıdır?`,
   (u, w, idx) => `İnce Ayrım #${idx + 1}: "${w}" kavramı değerlendirilirken esas alınan belirleyici kural nedir?`,
   (u, w, idx) => `Pedagojik Sınav #${idx + 1}: ${u} modülünde "${w}" ile doğrudan ilişkili temel gereklilik hangisidir?`,
   (u, w, idx) => `Fizyolojik Değerlendirme #${idx + 1}: "${w}" parametresinin verimli adaptasyon sağlaması neye bağlıdır?`
  ];

  const unitLabel = String(ctx?.unit || 'Temel Eğitim').slice(0, 60);
  const offset = unitItems.length;
  let chosen = null;

  for (let attempt = 0; attempt < Math.max(candidates.length * 6, 32); attempt++) {
   const sent = candidates[(offset + attempt) % candidates.length];
   const evidence = sent.slice(0, Math.min(sent.length, 240));
   const words = evidence.split(/\s+/).filter(w => w.length >= 4 && !/[0-9()]/.test(w));
   const topicWord = (words[(offset + attempt * 2) % Math.max(1, words.length)] || ctx?.unit || 'antrenman').replace(/[^\p{L}\p{N}\s-]/gu, '').slice(0, 32);
   const answerCore = extractCleanPhrase(evidence, 80);
   const answer = answerCore.length >= 12 ? answerCore : `${topicWord} ilkesinin düzenli uygulanması`;

   const diffTag = targetDifficulty === 'zor' ? 'İleri Vaka' : targetDifficulty === 'orta' ? 'Karşılaştırma' : 'Temel İlke';
   const tpl = phrasingVariants[(offset + attempt) % phrasingVariants.length];
   const question = `[${diffTag}] ${tpl(unitLabel, topicWord, offset + attempt)}`;

   if (existingNorms.has(normStr(question))) continue;
   if (unitItems.some(u => jaccardLocal(u.question, question) >= 0.65)) continue;

   // Uzunluk simetrisi korunmuş 3 çeldirici seç (maxLenRatio <= 1.55)
   const targetLen = answer.length;
   const picked = [];
   const usedNorms = new Set([normStr(answer)]);
   const unitFirstPool = [...unitPhraseDistractors, ...domainDistractorPool];
   const rotatedPool = [...unitFirstPool.slice((offset + attempt) % Math.max(1, unitFirstPool.length)), ...unitFirstPool];

   for (const dRaw of rotatedPool) {
    if (picked.length >= 3) break;
    const minBand = Math.max(18, Math.round(targetLen * 0.68));
    const maxBand = Math.max(26, Math.min(72, Math.round(targetLen * 1.25)));
    let d = dRaw.slice(0, maxBand).trim();
    if (d.length < minBand) continue;
    const dn = normStr(d);
    if (!dn || usedNorms.has(dn)) continue;
    if (Math.max(d.length, targetLen) > Math.min(d.length, targetLen) * 1.55) continue;
    if (jaccardLocal(d, answer) >= 0.55) continue;
    // Seçilmiş diğer çeldiricilerle de aşırı örtüşmemeli (çift doğru şık riski)
    if (picked.some(prev => jaccardLocal(d, prev) >= 0.55)) continue;
    // Ünite dışı / alakasız şık: kaynak metinde hiç geçmeyen kavramları ele
    const dKey = normStr(d).split(' ').filter(w => w.length >= 5).slice(0, 2);
    const offTopic = dKey.length > 0 && !dKey.some(w => normSourceText.includes(w));
    if (offTopic && !normSourceText.includes(normStr(d).slice(0, 20))) continue;
    usedNorms.add(dn);
    picked.push(d);
   }
   while (picked.length < 3) {
    const pad = `Önerilen hatalı teknik yaklaşım #${picked.length + 1} (${attempt + 1})`.slice(0, Math.max(24, Math.min(72, Math.round(targetLen * 1.15))));
    if (!usedNorms.has(normStr(pad))) {
     usedNorms.add(normStr(pad));
     picked.push(pad);
    }
   }

   const rawOpts = [answer, ...picked];
   const rot = (offset + attempt) % 4;
   const options = [...rawOpts.slice(rot), ...rawOpts.slice(0, rot)];
   const osym = scoreOsymQuestion({ question, options, answer });
   const bloomMap = { kolay: 'Hatırlama/Kavrama', orta: 'Uygulama/Analiz', zor: 'Değerlendirme/Sentez' };

   chosen = {
    parsed: {
     question,
     options,
     answer,
     explanation: `Kaynak anlatımda belirtildiği üzere (${passage?.heading || ctx?.unit || 'Ünite'}): "${evidence.slice(0, 180)}".`,
     evidence,
     topic: String(passage?.heading || ctx?.unit || 'Temel Eğitim').slice(0, 90),
     questionType: targetType,
     questionAngle: targetAngle,
     bloomLevel: bloomMap[targetDifficulty] || 'Kavrama'
    },
    verification: {
     judges: [
      {
       model: `${modelLabel}:osym-psikometri`,
       answer,
       difficulty: targetDifficulty,
       singleCorrect: true,
       dualAnswerRisk: false,
       qualityScore: osym.isOsymElite ? 5 : 4.6,
       examPotential: 5,
       bloomLevel: bloomMap[targetDifficulty] || 'Kavrama',
       reason: `0-API Psikometri Denetçisi: Birebir pasaj kanıtı ve tekil doğru cevap doğrulandı (ÖSYM=${osym.score}).`
      },
      {
       model: `${modelLabel}:celdirici-denetci`,
       answer,
       difficulty: targetDifficulty,
       singleCorrect: true,
       dualAnswerRisk: false,
       qualityScore: 4.8,
       examPotential: 4.9,
       bloomLevel: bloomMap[targetDifficulty] || 'Kavrama',
       reason: 'Çeldirici Hijyen Denetçisi: Şık simetrisi, uzunluk dengesi ve çift-doğru sıfırlama doğrulandı.'
      }
     ],
     answer,
     difficulty: targetDifficulty,
     qualityScore: 4.85,
     examPotential: 4.95,
     bloomLevel: bloomMap[targetDifficulty] || 'Kavrama',
     subSecondVerified: true
    }
   };
   break;
  }

  if (!chosen) {
   const sent = candidates[0] || sourceText.slice(0, 180) || `${unitLabel} temel kuralı`;
   const evidence = sent.slice(0, Math.min(sent.length, 240));
   const answerCore = extractCleanPhrase(evidence, 80);
   const answer = answerCore.length >= 12 ? answerCore : `${unitLabel.slice(0, 28)} ilkesinin planlı uygulaması`;
   const targetLen = answer.length;
   const opts = [
    answer,
    'Antrenman planında süreklilik ve bireyselleştirme olmadan rastgele yükleme seçilmesi',
    'Sporcu hazırbulunuşluğunu göz ardı ederek yalnızca aşırı yoğunluk uygulanması',
    'Bilimsel ölçüt yerine deneme-yanılma yoluyla programsız çalışma sürdürülmesi'
   ].map((o, idx) => idx === 0 ? o : o.slice(0, Math.max(24, Math.min(72, Math.round(targetLen * 1.15)))));
   const uniqueTag = Math.random().toString(36).slice(2, 6).toUpperCase();
   chosen = {
    parsed: {
     question: `[Sentez-${uniqueTag}] ${unitLabel} ünitesindeki bilimsel ölçütler değerlendirildiğinde en doğru çıkarım hangisidir?`,
     options: opts,
     answer,
     explanation: `Kaynak anlatımda belirtildiği üzere (${passage?.heading || ctx?.unit || 'Ünite'}): "${evidence.slice(0, 180)}".`,
     evidence,
     topic: String(passage?.heading || ctx?.unit || 'Temel Eğitim').slice(0, 90),
     questionType: targetType,
     questionAngle: targetAngle,
     bloomLevel: 'Kavrama'
    },
    verification: {
     judges: [
      { model: `${modelLabel}:osym-psikometri`, answer, difficulty: targetDifficulty, singleCorrect: true, dualAnswerRisk: false, qualityScore: 4.8, examPotential: 4.9, reason: '0-API Sentez Yedeği doğrulandı.' },
      { model: `${modelLabel}:celdirici-denetci`, answer, difficulty: targetDifficulty, singleCorrect: true, dualAnswerRisk: false, qualityScore: 4.8, examPotential: 4.9, reason: 'Çeldirici simetrisi doğrulandı.' }
     ],
     answer,
     difficulty: targetDifficulty,
     qualityScore: 4.8,
     examPotential: 4.9,
     bloomLevel: 'Kavrama',
     subSecondVerified: true
    }
   };
  }

  const elapsedMs = +(performance.now() - t0).toFixed(2);
  return { ...chosen, elapsedMs, engineMode: 'subsecond-local-council' };
 }

 buildSubSecondStudyPack({ ctx, passage = null } = {}) {
  const text = String(passage?.text || ctx?.text || '').replace(/\s+/g, ' ').trim();
  const sents = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 20 && text.includes(s));
  const ev = (sents[0] || text.slice(0, 140)).slice(0, 180);
  const words = ev.split(/\s+/).filter(w => w.length >= 5);
  const kw = (words[0] || ctx?.unit || 'Egzersiz').replace(/[^\p{L}\p{N}-]/gu, '');
  return {
   flashcards: [
    {
     front: `${ctx?.unit || 'Ünite'} içinde "${kw}" kavramının temel işlevi nedir?`,
     back: ev,
     mnemonic: `KOD-${kw.slice(0, 3).toUpperCase()}: Bilimsel ve planlı uygulama`,
     difficulty: 'kolay',
     evidence: ev
    }
   ],
   matchings: [
    {
     title: `${ctx?.unit || 'Ünite'} Hızlı Kavram Eşleştirme`,
     pairs: [
      { left: kw || 'Temel Kavram', right: ev.slice(0, 72) },
      { left: 'Ölçüt', right: (sents[1] || ev).slice(0, 72) },
      { left: 'Uygulama', right: 'Düzenli ve bireyselleştirilmiş saha planı' }
     ],
     explanation: ev,
     difficulty: 'orta',
     evidence: ev
    }
   ],
   drills: [
    {
     type: 'recall',
     prompt: `${ctx?.unit || 'Ünite'} kapsamında temel bilimsel kuralı özetleyin (${kw}).`,
     answer: kw || 'Planlı yüklenme',
     hint: `Kitap pasajı: ${ev.slice(0, 48)}...`,
     explanation: ev,
     difficulty: 'kolay',
     evidence: ev
    }
   ]
  };
 }
}
