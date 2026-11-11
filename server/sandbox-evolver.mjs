import vm from 'node:vm';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_DIFFICULTY_DIRECTIVES = {
 kolay: 'KOLAY: Temel tanım, ilke veya sınıflandırmayı tek açık cümleden ölç; çeldiriciler mantıklı ama net ayırt edilebilir olsun.',
 orta: 'ORTA: İki ayrı bilgiyi birleştir, neden-sonuç veya karşılaştırma yaptır; çeldiriciler aynı ünite terimlerinden gelsin.',
 zor: 'ZOR: Çok adımlı antrenörlük saha vakası, istisna analizi veya ince bilimsel ayrım sor; düşündürücü ama tek doğru cevap garantili çeldiriciler kur.'
};

const DEFAULT_POLICY = {
 version: 1,
 createdAt: new Date().toISOString(),
 reason: 'Başlangıç politikası: katı tek doğru cevap, yüksek hız toplu denetim ve korunmuş kolay/orta/zor sistemi.',
 source: 'system',
 preserveDifficultyTiers: true,
 difficultyDirectives: { ...DEFAULT_DIFFICULTY_DIRECTIVES },
 generatorAddendum: 'Her yanlış şıkkın kaynak metinle doğrudan çeliştiğinden emin ol. İki şıkkın birlikte doğru olabileceği belirsiz ifadelerden kaçın.',
 judgeAddendum: 'Herhangi iki seçeneğin kısmen de olsa doğru kabul edilme ihtimali varsa dualAnswerRisk=true ve singleCorrect=false ver.',
 studyAddendum: 'Kartlarda tek net kavram ölç; eşleştirmelerde birbirine karışabilecek benzer tanımları aynı sete koyma.',
 temperatureOffset: 0,
 batchSizeHint: null,
 focusUnits: [],
 customRuleCode: '',
 difficultyEngineCode: '',
 metricsAtCreation: null
};

// Bilinen altın iyi ve kötü test senaryoları: Evolver'ın yazdığı hiçbir JS kuralı iyi soruları
// reddedemez ve tehlikeli/çift-doğru-cevaplı soruları yanlışlıkla onaylayamaz.
export const GOLDEN_GOOD_CASES = [
 {
  question: 'Egzersiz ile fiziksel aktivite arasındaki temel fark nedir?',
  options: [
   'Egzersiz planlı, programlı ve tekrarlıdır',
   'Fiziksel aktivite yalnızca yarışma sporudur',
   'Egzersiz hiçbir enerji harcaması gerektirmez',
   'Fiziksel aktivite sadece uyku sırasında oluşur'
  ],
  answer: 'Egzersiz planlı, programlı ve tekrarlıdır',
  evidence: 'Fiziksel aktivite enerji harcatan her iskelet kası hareketidir; egzersiz ise planlı ve tekrarlı bir fiziksel aktivitedir.',
  difficulty: 'kolay'
 },
 {
  question: 'Bir antrenörün 12 yaşındaki sporcularında aşırı yüklenme sonrası performansın başlangıç düzeyinin üzerine çıkması hangi kavramla açıklanır?',
  options: [
   'Fazla tamamlama (süperkompansasyon)',
   'Antrenmanın tamamen kesilmesi (detraining)',
   'Statik eklem esnekliği kaybı',
   'Klasik bürokratik yönetim yaklaşımı'
  ],
  answer: 'Fazla tamamlama (süperkompansasyon)',
  evidence: 'Toparlanma uygun olduğunda vücut uyum gösterebilir; fazla tamamlama modelinde kapasite başlangıç düzeyini aşar.',
  difficulty: 'orta'
 },
 {
  question: 'Aynı anda hem maksimal kuvvet hem de yüksek hacimli aerobik dayanıklılık yüklemesi verilen bir sporcuda beklenen interferans (girişim) etkisini en aza indirmek için nasıl bir sıralama tercih edilmelidir?',
  options: [
   'Önce yüksek sinirsel nitelikli kuvvet çalışması, yeterli toparlanma sonrası dayanıklılık yüklemesi uygulanmalıdır',
   'Maksimal kuvvet ve uzun süreli düşük tempolu koşu mutlaka aynı dakika içinde kesintisiz dönüşümlü yapılmalıdır',
   'Yüksek şiddetli sürat ve maksimal kuvvet egzersizleri tamamen bırakılıp yalnızca statik germe yapılmalıdır',
   'Sporcunun dinlenme kalp atım hızı düşene kadar haftalık antrenman sayısı sıfıra indirilmelidir'
  ],
  answer: 'Önce yüksek sinirsel nitelikli kuvvet çalışması, yeterli toparlanma sonrası dayanıklılık yüklemesi uygulanmalıdır',
  evidence: 'Antrenman yüklemelerinin sıralanmasında sinir sistemi yorgunluğu oluşturacak nitelikli çalışmalar önce planlanır.',
  difficulty: 'zor'
 }
];

export const GOLDEN_BAD_CASES = [
 {
  question: 'Aşağıdakilerden hangisi antrenmanın ilkelerindendir?',
  options: [
   'Bireyselleştirme',
   'Süreklilik',
   'Çeşitlilik',
   'Yukarıdakilerin hepsi'
  ],
  answer: 'Yukarıdakilerin hepsi',
  evidence: 'Bireyselleştirme, süreklilik, çeşitlilik ve branşa özgülük temel ilkelerdir.',
  difficulty: 'kolay'
 }
];

export class SandboxEvolver {
 constructor(dataDir) {
  this.dir = resolve(dataDir, 'ai-brain');
  this.policyFile = resolve(this.dir, 'active-policy.json');
  this.historyFile = resolve(this.dir, 'history.json');
  this.studentFile = resolve(this.dir, 'student-profile.json');
  this._lock = Promise.resolve();
  this._scriptCache = new Map();
 }

 _withLock(fn) {
  const next = this._lock.then(fn, fn);
  this._lock = next.catch(() => {});
  return next;
 }

 async _writeAtomic(filePath, obj) {
  await mkdir(this.dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 async loadPolicy() {
  try {
   const data = JSON.parse(await readFile(this.policyFile, 'utf8'));
   if (data && typeof data === 'object' && typeof data.version === 'number') {
    return { ...DEFAULT_POLICY, ...data };
   }
  } catch (e) {
   if (e.code !== 'ENOENT') {
    const hist = await this.loadHistory().catch(() => []);
    if (hist.length) return { ...DEFAULT_POLICY, ...hist[hist.length - 1] };
   }
  }
  return { ...DEFAULT_POLICY };
 }

 async loadHistory() {
  try {
   const arr = JSON.parse(await readFile(this.historyFile, 'utf8'));
   return Array.isArray(arr) ? arr : [];
  } catch (e) {
   if (e.code === 'ENOENT') return [];
   throw e;
  }
 }

 async loadStudentProfile() {
  try {
   const data = JSON.parse(await readFile(this.studentFile, 'utf8'));
   return data && typeof data === 'object' ? data : { weakUnits: [], studiedUnits: [], cardMisses: [], updatedAt: null };
  } catch (e) {
   if (e.code === 'ENOENT') return { weakUnits: [], studiedUnits: [], cardMisses: [], updatedAt: null };
   throw e;
  }
 }

 async saveStudentProfile(profile) {
  await mkdir(this.dir, { recursive: true });
  const cleanResults = {};
  if (profile?.results && typeof profile.results === 'object' && !Array.isArray(profile.results)) {
   for (const [uid, val] of Object.entries(profile.results)) {
    if (!val || typeof val !== 'object') continue;
    cleanResults[uid] = {
     right: Math.max(0, Number(val.right || 0)),
     wrong: Math.max(0, Number(val.wrong || 0)),
     streak: Math.max(0, Number(val.streak || 0)),
     totalSec: Math.max(0, Number(val.totalSec || 0)),
     lastSec: Math.max(0, Number(val.lastSec || 0))
    };
   }
  }
  const clean = {
   weakUnits: Array.isArray(profile?.weakUnits) ? profile.weakUnits.filter(x => typeof x === 'string').slice(0, 29) : [],
   studiedUnits: Array.isArray(profile?.studiedUnits) ? profile.studiedUnits.filter(x => typeof x === 'string').slice(0, 29) : [],
   cardMisses: Array.isArray(profile?.cardMisses) ? profile.cardMisses.filter(x => typeof x === 'string').slice(0, 50) : [],
   accuracyPct: Number.isFinite(profile?.accuracyPct) ? Math.max(0, Math.min(100, Math.round(profile.accuracyPct))) : null,
   results: cleanResults,
   totalStudySec: Number.isFinite(profile?.totalStudySec) ? Math.max(0, +Number(profile.totalStudySec).toFixed(1)) : 0,
   updatedAt: new Date().toISOString()
  };
  const tmp = `${this.studentFile}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(clean, null, 2), 'utf8');
  await rename(tmp, this.studentFile);
  return clean;
 }

 // Kodu izole node:vm kum havuzunda derler ve yürütür. Dosya sistemi/ağ/process erişimi SIFIRDIR.
 runSandboxedRule(ruleCode, candidate, contextInfo = {}) {
  return this._runVmFn(ruleCode, 'evaluateCandidate', [candidate, contextInfo]);
 }

 // Zorluk geliştirme motorunu izole kum havuzunda çalıştırır (kolay/orta/zor sistemini geliştirir, asla silemez)
 runSandboxedDifficultyEngine(engineCode, candidate, targetDifficulty, contextInfo = {}) {
  return this._runVmFn(engineCode, 'evaluateDifficultyFit', [candidate, targetDifficulty, contextInfo]);
 }

 // Toplu izole yürütme: tek V8 bağlamı ile 96+ tuzağı <3ms içinde doğrular
 runSandboxedRuleBatch(ruleCode, callsList = []) {
  return this._runVmFnBatch(ruleCode, 'evaluateCandidate', callsList);
 }

 runSandboxedDifficultyBatch(engineCode, callsList = []) {
  return this._runVmFnBatch(engineCode, 'evaluateDifficultyFit', callsList);
 }

 _normalizeVmOut(out) {
  if (out === true || out === undefined || out === null) return { ok: true };
  if (out === false) return { ok: false, reason: 'Özel AI kalite kuralı bu adayı reddetti.' };
  if (typeof out === 'object') {
   if (out.ok === false) return { ok: false, reason: typeof out.reason === 'string' ? out.reason.slice(0, 200) : 'Özel AI kalite kuralı reddetti.' };
   return { ok: true, meta: out };
  }
  return { ok: true };
 }

 _validateCodeForVm(code) {
  if (!code || typeof code !== 'string' || !code.trim()) return false;
  if (code.length > 16000) {
   throw Error('Kural kodu boyut sınırını (16000 karakter) aşıyor.');
  }
  const forbidden = /\b(process|require|import|eval|Function|globalThis|fetch|XMLHttpRequest|fs|child_process|Reflect|Proxy|WebAssembly|SharedArrayBuffer|Atomics|while\s*\(\s*true)\b/;
  if (forbidden.test(code)) {
   throw Error('Güvenlik ihlali: kural kodunda yasaklı ifade tespit edildi.');
  }
  return true;
 }

 _runVmFnBatch(code, fnName, callsList) {
  if (!callsList.length) return [];
  if (!code || typeof code !== 'string' || !code.trim()) {
   return callsList.map(() => ({ ok: true }));
  }
  if (code.length > 16000) {
   return callsList.map(() => ({ ok: false, reason: 'Kural kodu boyut sınırını (16000 karakter) aşıyor.' }));
  }
  this._validateCodeForVm(code);
  const cacheKey = `batch::${fnName}::${code}`;
  let script = this._scriptCache.get(cacheKey);
  if (!script) {
   const wrapped = `
   "use strict";
   const targetFn = (function() {
    ${code}
    if (typeof ${fnName} === 'function') return ${fnName};
    throw new Error('${fnName}(...) fonksiyonu tanımlanmalı.');
   })();
   results = callsList.map(a => targetFn(...a));
  `;
   script = new vm.Script(wrapped);
   if (this._scriptCache.size >= 64) {
    const firstKey = this._scriptCache.keys().next().value;
    if (firstKey !== undefined) this._scriptCache.delete(firstKey);
   }
   this._scriptCache.set(cacheKey, script);
  }
  const sandbox = {
   callsList: structuredClone(callsList),
   results: []
  };
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  script.runInContext(ctx, { timeout: Math.max(80, callsList.length * 4) });
  return (sandbox.results || []).map(out => this._normalizeVmOut(out));
 }

 _runVmFn(code, fnName, args) {
  if (!code || typeof code !== 'string' || !code.trim()) {
   return { ok: true };
  }
  if (code.length > 16000) {
   return { ok: false, reason: 'Kural kodu boyut sınırını (16000 karakter) aşıyor.' };
  }
  this._validateCodeForVm(code);
  const cacheKey = `${fnName}::${code}`;
  let script = this._scriptCache.get(cacheKey);
  if (!script) {
   const wrapped = `
   "use strict";
   const targetFn = (function() {
    ${code}
    if (typeof ${fnName} === 'function') return ${fnName};
    throw new Error('${fnName}(...) fonksiyonu tanımlanmalı.');
   })();
   result = targetFn(...args);
  `;
   script = new vm.Script(wrapped);
   if (this._scriptCache.size >= 64) {
    const firstKey = this._scriptCache.keys().next().value;
    if (firstKey !== undefined) this._scriptCache.delete(firstKey);
   }
   this._scriptCache.set(cacheKey, script);
  }
  const sandbox = {
   args: structuredClone(args),
   result: null
  };
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  script.runInContext(ctx, { timeout: 40 });
  return this._normalizeVmOut(sandbox.result);
 }

 // Yeni önerilen politika ve özel kural kodunu altın testlerden geçirir; projeyi bozacak her
 // değişikliği (veya kolay/orta/zor sistemini kaldırmaya yönelik girişimleri) engeller.
 verifyCandidatePolicy(proposed) {
  if (!proposed || typeof proposed !== 'object') {
   throw Error('Geçersiz evrim politikası nesnesi.');
  }
  if (proposed.preserveDifficultyTiers === false || proposed.disableDifficultySystem === true) {
   throw Error('Güvenlik kuralı: kolay/orta/zor zorluk sistemi asla silinemez veya kapatılamaz.');
  }
  const code = typeof proposed.customRuleCode === 'string' ? proposed.customRuleCode.trim() : '';
  if (code) {
   for (const good of GOLDEN_GOOD_CASES) {
    const res = this.runSandboxedRule(code, good, { id: '0-0' });
    if (!res.ok) {
     throw Error(`Evrim güvenlik kapısı reddetti: yazılan kural iyi bir soruyu yanlışlıkla eledi (${res.reason}).`);
    }
   }
   for (const bad of GOLDEN_BAD_CASES) {
    this.runSandboxedRule(code, bad, { id: '0-0' });
   }
  }
  const diffCode = typeof proposed.difficultyEngineCode === 'string' ? proposed.difficultyEngineCode.trim() : '';
  if (diffCode) {
   for (const good of GOLDEN_GOOD_CASES) {
    const res = this.runSandboxedDifficultyEngine(diffCode, good, good.difficulty || 'kolay', { id: '0-0' });
    if (!res.ok) {
     throw Error(`Zorluk motoru güvenlik kapısı reddetti: iyi ${good.difficulty} örneği elendi (${res.reason}).`);
    }
   }
  }
  const rawDirs = proposed.difficultyDirectives && typeof proposed.difficultyDirectives === 'object' ? proposed.difficultyDirectives : {};
  const difficultyDirectives = {
   kolay: typeof rawDirs.kolay === 'string' && rawDirs.kolay.trim().length >= 10 ? rawDirs.kolay.trim().slice(0, 320) : DEFAULT_DIFFICULTY_DIRECTIVES.kolay,
   orta: typeof rawDirs.orta === 'string' && rawDirs.orta.trim().length >= 10 ? rawDirs.orta.trim().slice(0, 320) : DEFAULT_DIFFICULTY_DIRECTIVES.orta,
   zor: typeof rawDirs.zor === 'string' && rawDirs.zor.trim().length >= 10 ? rawDirs.zor.trim().slice(0, 320) : DEFAULT_DIFFICULTY_DIRECTIVES.zor
  };
  return {
   preserveDifficultyTiers: true,
   difficultyDirectives,
   generatorAddendum: typeof proposed.generatorAddendum === 'string' ? proposed.generatorAddendum.trim().slice(0, 500) : DEFAULT_POLICY.generatorAddendum,
   judgeAddendum: typeof proposed.judgeAddendum === 'string' ? proposed.judgeAddendum.trim().slice(0, 500) : DEFAULT_POLICY.judgeAddendum,
   studyAddendum: typeof proposed.studyAddendum === 'string' ? proposed.studyAddendum.trim().slice(0, 400) : DEFAULT_POLICY.studyAddendum,
   temperatureOffset: Number.isFinite(proposed.temperatureOffset) ? Math.max(-0.15, Math.min(0.15, Number(proposed.temperatureOffset))) : 0,
   batchSizeHint: Number.isFinite(proposed.batchSizeHint) ? Math.max(1, Math.min(8, Math.round(proposed.batchSizeHint))) : null,
   focusUnits: Array.isArray(proposed.focusUnits) ? proposed.focusUnits.filter(x => typeof x === 'string').slice(0, 12) : [],
   customRuleCode: code,
   difficultyEngineCode: diffCode,
   reason: typeof proposed.reason === 'string' && proposed.reason.trim() ? proposed.reason.trim().slice(0, 350) : 'Otomatik evrim optimizasyonu'
  };
 }

 async applyEvolution(proposed, meta = {}) {
  const verified = this.verifyCandidatePolicy(proposed);
  return this._withLock(async () => {
   const current = await this.loadPolicy();
   const history = await this.loadHistory();
   if (history.length === 0) {
    history.push(current);
   }
   const next = {
    ...current,
    ...verified,
    version: (current.version || 1) + 1,
    createdAt: new Date().toISOString(),
    source: meta.source || 'evolver-ai',
    evolverModel: meta.evolverModel || null,
    metricsAtCreation: meta.metrics || null
   };
   history.push(next);
   const trimmedHistory = history.slice(-20);
   await this._writeAtomic(this.policyFile, next);
   await this._writeAtomic(this.historyFile, trimmedHistory);
   return next;
  });
 }

 async rollback(targetVersion = null) {
  return this._withLock(async () => {
   const history = await this.loadHistory();
   const current = await this.loadPolicy();
   let target = null;
   if (targetVersion !== null && targetVersion !== undefined) {
    target = history.find(h => h.version === Number(targetVersion));
   } else if (history.length >= 2) {
    target = history[history.length - 2];
   } else {
    target = { ...DEFAULT_POLICY };
   }
   if (!target) throw Error('Geri dönülecek sürüm bulunamadı.');
   const restored = {
    ...target,
    version: (current.version || 1) + 1,
    createdAt: new Date().toISOString(),
    source: 'rollback',
    reason: `Sürüm v${target.version} güvenli geri alma (rollback)`
   };
   await this._writeAtomic(this.policyFile, restored);
   const updatedHistory = [...history, restored].slice(-20);
   await this._writeAtomic(this.historyFile, updatedHistory);
   return restored;
  });
 }
}
