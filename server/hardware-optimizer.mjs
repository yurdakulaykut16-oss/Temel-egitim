import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const execFileAsync = promisify(execFile);

export const SUBSECOND_BOT_BUDGET_MS = 850;

export const HARDWARE_PROFILES = {
 rtx3080ti_subsecond: {
  id: 'rtx3080ti_subsecond',
  label: 'RTX 3080 Ti + 16 GB RAM · En Güçlü <1sn VRAM-Sabit Takım (Önerilen)',
  description: 'Tüm 3 temel model aynı anda ekran kartı VRAM belleğinde tutulur (0 RAM takası). 8 uzman rol ve 44 kodlayıcı <1 saniyede paralel hareket eder.',
  primaryModel: 'qwen3:8b',
  judgeModel: 'gemma3:4b',
  coderModel: 'qwen2.5-coder:3b',
  coder16GbVramUpgrade: 'qwen2.5-coder:7b',
  estimatedVramGb: 10.2,
  estimatedVram16Gb: 13.0,
  keepAlive: -1,
  numCtx: 2560,
  judgeNumCtx: 2048,
  numPredictGenerate: 280,
  numPredictJudge: 120,
  numPredictSprint: 100,
  numBatch: 512,
  numGpu: 99,
  lowVram: false,
  autoConcurrency: 3,
  teamBudgetMs: 850,
  subSecondMode: true
 },
 rtx3080ti_turbo_ultra: {
  id: 'rtx3080ti_turbo_ultra',
  label: 'RTX 3080 Ti · Ekstrem Hız (<500ms) Hafif Takım',
  description: '200–250 token/sn hızında qwen3:4b + gemma3:4b + qwen2.5-coder:3b ile toplam sadece ~7.8 GB VRAM kullanır; 16 GB sistem RAM için en yüksek bellek boşluğunu bırakır.',
  primaryModel: 'qwen3:4b',
  judgeModel: 'gemma3:4b',
  coderModel: 'qwen2.5-coder:3b',
  coder16GbVramUpgrade: 'qwen2.5-coder:3b',
  estimatedVramGb: 7.8,
  estimatedVram16Gb: 7.8,
  keepAlive: -1,
  numCtx: 3072,
  judgeNumCtx: 2048,
  numPredictGenerate: 280,
  numPredictJudge: 160,
  numPredictSprint: 110,
  numBatch: 512,
  numGpu: 99,
  lowVram: false,
  autoConcurrency: 4,
  teamBudgetMs: 650,
  subSecondMode: true
 },
 rtx3080ti_max_iq: {
  id: 'rtx3080ti_max_iq',
  label: 'RTX 3080 Ti · Maksimum Tek-Model Zekâ (qwen3:14b + coder:7b)',
  description: 'Derin muhakeme için en yüksek parametreli model çifti; 12 GB masaüstü VRAM sınırında model değişimlerinde >1sn yükleme gecikmesi yaşanabilir.',
  primaryModel: 'qwen3:14b',
  judgeModel: 'gemma3:4b',
  coderModel: 'qwen2.5-coder:7b',
  coder16GbVramUpgrade: 'qwen2.5-coder:7b',
  estimatedVramGb: 14.0,
  estimatedVram16Gb: 14.0,
  keepAlive: '30m',
  numCtx: 4096,
  judgeNumCtx: 3072,
  numPredictGenerate: 650,
  numPredictJudge: 320,
  numPredictSprint: 200,
  numBatch: 256,
  numGpu: 99,
  lowVram: false,
  autoConcurrency: 2,
  teamBudgetMs: 1800,
  subSecondMode: false
 },
 rtx3080ti_coder_swarm: {
  id: 'rtx3080ti_coder_swarm',
  label: 'RTX 3080 Ti · Süper Kodlama & Akıl Yürütme Konseyi',
  description: 'Kodlama & mimari ajanlarını öne alır: qwen2.5-coder:7b + deepseek-r1:8b + qwen2.5-coder:3b (16 GB VRAM’de qwen3-coder:7b dahil) ile paralel kodlama.',
  primaryModel: 'qwen2.5-coder:7b',
  judgeModel: 'gemma3:4b',
  coderModel: 'qwen2.5-coder:3b',
  coder16GbVramUpgrade: 'qwen3-coder:7b',
  estimatedVramGb: 10.1,
  estimatedVram16Gb: 12.8,
  keepAlive: -1,
  numCtx: 3072,
  judgeNumCtx: 2560,
  numPredictGenerate: 380,
  numPredictJudge: 200,
  numPredictSprint: 140,
  numBatch: 512,
  numGpu: 99,
  lowVram: false,
  autoConcurrency: 3,
  teamBudgetMs: 900,
  subSecondMode: true
 }
};

export const CODER_STACK_RECOMMENDATIONS = [
 'qwen2.5-coder:1.5b',
 'qwen2.5-coder:3b',
 'qwen2.5-coder:7b',
 'qwen3-coder:7b',
 'qwen3:4b',
 'qwen3:8b',
 'gemma3:4b',
 'deepseek-r1:8b',
 'deepseek-r1:14b',
 'qwen2.5-coder:14b',
 'qwen3-coder:14b',
 'deepseek-coder-v2:lite',
 'deepseek-coder-v2:16b',
 'starcoder2:7b',
 'starcoder2:15b',
 'granite-code:8b',
 'opencoder:8b',
 'olympiccoder:7b',
 'codegemma:7b',
 'codestral:7b',
 'phi4:14b',
 'yi-coder:9b',
 'aya-expanse:8b',
 'command-r7b:latest',
 'qwen3-coder:30b-a3b',
 'devstral:24b',
 'cogito:14b'
];

export const OLLAMA_GPU_ENV_RECOMMENDATIONS = {
 OLLAMA_FLASH_ATTENTION: '1',
 OLLAMA_KV_CACHE_TYPE: 'q8_0',
 OLLAMA_MAX_LOADED_MODELS: '3',
 OLLAMA_NUM_PARALLEL: '4',
 OLLAMA_KEEP_ALIVE: '-1'
};

export class HardwareTeamOptimizer {
 constructor(dataDir, { execFn = execFileAsync, fetchFn = fetch } = {}) {
  this.dataDir = dataDir;
  this.brainDir = resolve(dataDir, 'ai-brain');
  this.stateFile = resolve(this.brainDir, 'hardware-profile.json');
  this.execFn = execFn;
  this.fetchFn = fetchFn;
  this._gpuCache = null;
  this._gpuCachedAt = 0;
  this.pullState = {
   running: false,
   stage: 'idle',
   currentModel: null,
   completedModels: [],
   failedModels: [],
   percent: 0,
   message: 'Hazır',
   updatedAt: null
  };
 }

 async _atomicWrite(obj) {
  await mkdir(this.brainDir, { recursive: true });
  const tmp = `${this.stateFile}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, this.stateFile);
 }

 _defaultState() {
  return {
   version: 1,
   profileId: 'rtx3080ti_subsecond',
   autoPullOptimalModels: true,
   subSecondMode: true,
   targetVramGb: 12,
   targetSystemRamGb: 16,
   lastPullAttemptAt: null,
   lastWarmupAt: null,
   lastPullResults: [],
   updatedAt: null
  };
 }

 async loadState() {
  try {
   const raw = JSON.parse(await readFile(this.stateFile, 'utf8'));
   if (raw && typeof raw === 'object') {
    const pid = HARDWARE_PROFILES[raw.profileId] ? raw.profileId : 'rtx3080ti_subsecond';
    return { ...this._defaultState(), ...raw, profileId: pid };
   }
  } catch (e) {
   if (e.code !== 'ENOENT') return this._defaultState();
  }
  return this._defaultState();
 }

 async saveState(patch = {}) {
  const cur = await this.loadState();
  const next = {
   ...cur,
   ...patch,
   profileId: HARDWARE_PROFILES[patch.profileId || cur.profileId] ? (patch.profileId || cur.profileId) : 'rtx3080ti_subsecond',
   updatedAt: new Date().toISOString()
  };
  await this._atomicWrite(next);
  return next;
 }

 async detectLocalHardware() {
  const now = Date.now();
  let gpu = this._gpuCache;
  if (!gpu || now - this._gpuCachedAt > 45_000) {
   gpu = { detected: false, name: null, vramTotalMb: 0, vramFreeMb: 0, driverNote: 'GPU sürücüsü tespit edilmedi (hedef donanım profili: RTX 3080 Ti + 16 GB RAM)' };
   try {
    const { stdout } = await this.execFn('nvidia-smi', [
     '--query-gpu=name,memory.total,memory.free',
     '--format=csv,noheader,nounits'
    ], { timeout: 1500 });
    const firstLine = String(stdout || '').trim().split('\n')[0];
    if (firstLine) {
     const parts = firstLine.split(',').map(x => x.trim());
     const name = parts[0] || 'NVIDIA GPU';
     const totalMb = Number(parts[1]) || 0;
     const freeMb = Number(parts[2]) || 0;
     gpu = {
      detected: true,
      name,
      vramTotalMb: totalMb,
      vramFreeMb: freeMb,
      vramTotalGb: +(totalMb / 1024).toFixed(1),
      is3080Ti: /3080\s*ti/i.test(name),
      driverNote: `${name} (${(totalMb / 1024).toFixed(1)} GB VRAM, ${(freeMb / 1024).toFixed(1)} GB boş)`
     };
    }
   } catch {}
   this._gpuCache = gpu;
   this._gpuCachedAt = now;
  }

  const totalMemGb = +(os.totalmem() / (1024 ** 3)).toFixed(1);
  const freeMemGb = +(os.freemem() / (1024 ** 3)).toFixed(1);
  const cpuCores = os.cpus()?.length || 2;

  return {
   gpu,
   systemRam: { totalGb: totalMemGb, freeGb: freeMemGb },
   cpuCores,
   recommendedThreads: Math.max(2, Math.min(8, Math.floor(cpuCores * 0.75) || cpuCores))
  };
 }

 resolveActiveProfile(state, hwInfo = null) {
  const base = HARDWARE_PROFILES[state?.profileId] || HARDWARE_PROFILES.rtx3080ti_subsecond;
  const vramMb = hwInfo?.gpu?.detected ? hwInfo.gpu.vramTotalMb : (state?.targetVramGb || 12) * 1024;
  const has16GbVram = vramMb >= 15000;
  const coderModel = has16GbVram ? (base.coder16GbVramUpgrade || base.coderModel) : base.coderModel;
  const estimatedVramGb = has16GbVram ? base.estimatedVram16Gb : base.estimatedVramGb;
  const recommendedModels = [...new Set([base.primaryModel, base.judgeModel, coderModel])];
  return {
   ...base,
   coderModel,
   estimatedVramGb,
   recommendedModels,
   numThreads: hwInfo?.recommendedThreads || Math.max(2, Math.min(8, os.cpus()?.length || 4))
  };
 }

 buildRuntimeOptions(profile, rawOptions = {}, { role = 'generator', isSprint = false } = {}) {
  const active = profile || HARDWARE_PROFILES.rtx3080ti_subsecond;
  const isJudge = role === 'judge' || role === 'psychometric_auditor';
  const maxCtx = isSprint
   ? Math.min(2560, active.judgeNumCtx || 2560)
   : isJudge
    ? (active.judgeNumCtx || 2560)
    : (active.numCtx || 3072);

  const requestedCtx = Number(rawOptions.num_ctx || maxCtx);
  const safeCtx = active.subSecondMode ? Math.min(requestedCtx, maxCtx) : requestedCtx;

  const requestedPredict = Number(rawOptions.num_predict || active.numPredictGenerate);
  const maxPredict = isSprint
   ? active.numPredictSprint
   : isJudge
    ? Math.min(requestedPredict, active.numPredictJudge + 120)
    : requestedPredict;

  return {
   ...rawOptions,
   num_ctx: Math.max(1024, safeCtx),
   num_predict: Math.max(80, maxPredict),
   num_gpu: active.numGpu ?? 99,
   low_vram: Boolean(active.lowVram),
   num_batch: active.numBatch ?? 512,
   num_thread: active.numThreads || Math.max(2, Math.min(8, os.cpus()?.length || 4))
  };
 }

 async getLoadedVramStatus(ollamaBaseUrl) {
  if (!ollamaBaseUrl) return { connected: false, loaded: [], totalVramGb: 0, cpuOffloadDetected: false };
  try {
   const r = await this.fetchFn(`${ollamaBaseUrl}/api/ps`, { signal: AbortSignal.timeout(1500) });
   if (!r.ok) return { connected: false, loaded: [], totalVramGb: 0, cpuOffloadDetected: false };
   const data = await r.json();
   const models = Array.isArray(data?.models) ? data.models : [];
   let vramBytes = 0;
   let totalBytes = 0;
   const loaded = models.map(m => {
    const size = Number(m.size || 0);
    const sizeVram = Number(m.size_vram || size);
    vramBytes += sizeVram;
    totalBytes += size;
    const gpuPct = size > 0 ? Math.min(100, Math.round((sizeVram / size) * 100)) : 100;
    return {
     name: m.name || m.model,
     sizeGb: +(size / (1024 ** 3)).toFixed(2),
     vramGb: +(sizeVram / (1024 ** 3)).toFixed(2),
     gpuPct
    };
   });
   return {
    connected: true,
    loaded,
    totalVramGb: +(vramBytes / (1024 ** 3)).toFixed(2),
    totalSizeGb: +(totalBytes / (1024 ** 3)).toFixed(2),
    cpuOffloadDetected: loaded.some(m => m.gpuPct < 98)
   };
  } catch {
   return { connected: false, loaded: [], totalVramGb: 0, cpuOffloadDetected: false };
  }
 }

 // Eksik önerilen modelleri Ollama üzerinden arka planda veya kullanıcı talebiyle otomatik indirir
 async pullMissingProfileModels({ ollamaBaseUrl, installedModels = [], modelsOverride = null, state = null } = {}) {
  if (process.env.TEMPO_OFFLINE_ONLY === '1') {
   return { ok: false, skipped: true, reason: 'Çevrimdışı mod (TEMPO_OFFLINE_ONLY=1)' };
  }
  if (this.pullState.running) {
   return { ok: true, alreadyRunning: true, pullState: this.pullState };
  }
  const curState = state || (await this.loadState());
  const hw = await this.detectLocalHardware();
  const profile = this.resolveActiveProfile(curState, hw);
  const targets = Array.isArray(modelsOverride) && modelsOverride.length ? modelsOverride : profile.recommendedModels;
  const missing = targets.filter(m => !installedModels.includes(m) && !installedModels.includes(`${m}:latest`));

  if (!missing.length) {
   this.pullState = {
    running: false,
    stage: 'ready',
    currentModel: null,
    completedModels: targets,
    failedModels: [],
    percent: 100,
    message: `Tüm ${targets.length} RTX 3080 Ti modeli zaten kurulu`,
    updatedAt: new Date().toISOString()
   };
   return { ok: true, missing: [], alreadyInstalled: targets, pullState: this.pullState };
  }

  this.pullState = {
   running: true,
   stage: 'pulling',
   currentModel: missing[0],
   completedModels: [],
   failedModels: [],
   percent: 0,
   message: `${missing.join(', ')} indiriliyor...`,
   updatedAt: new Date().toISOString()
  };

  const results = [];
  try {
   for (let i = 0; i < missing.length; i++) {
    const modelName = missing[i];
    this.pullState.currentModel = modelName;
    this.pullState.message = `${modelName} indiriliyor (${i + 1}/${missing.length})...`;
    try {
     const r = await this.fetchFn(`${ollamaBaseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, stream: true }),
      signal: AbortSignal.timeout(900_000)
     });
     if (!r.ok) {
      const errTxt = await r.text().catch(() => '');
      throw Error(`HTTP ${r.status}: ${errTxt.slice(0, 120)}`);
     }
     if (r.body && typeof r.body.getReader === 'function') {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
       const { value, done } = await reader.read();
       if (done) break;
       buf += dec.decode(value, { stream: true });
       const lines = buf.split('\n');
       buf = lines.pop() || '';
       for (const line of lines) {
        if (!line.trim()) continue;
        try {
         const evt = JSON.parse(line);
         if (evt.error) throw Error(evt.error);
         if (Number(evt.total) > 0 && Number.isFinite(evt.completed)) {
          const itemPct = Math.round((evt.completed / evt.total) * 100);
          this.pullState.percent = Math.min(99, Math.round(((i + itemPct / 100) / missing.length) * 100));
         }
        } catch (parseErr) {
         if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
        }
       }
      }
     }
     this.pullState.completedModels.push(modelName);
     results.push({ model: modelName, ok: true });
    } catch (e) {
     this.pullState.failedModels.push({ model: modelName, error: e.message });
     results.push({ model: modelName, ok: false, error: e.message });
    }
   }
   this.pullState.percent = 100;
   this.pullState.stage = this.pullState.failedModels.length ? 'partial' : 'ready';
   this.pullState.currentModel = null;
   this.pullState.message = this.pullState.failedModels.length
    ? `${this.pullState.completedModels.length} model indirildi, ${this.pullState.failedModels.length} model başarısız`
    : `Tüm RTX 3080 Ti modelleri hazır (${this.pullState.completedModels.join(', ')})`;
   await this.saveState({ lastPullAttemptAt: new Date().toISOString(), lastPullResults: results });
   return { ok: this.pullState.failedModels.length === 0, results, pullState: this.pullState };
  } finally {
   this.pullState.running = false;
   this.pullState.updatedAt = new Date().toISOString();
  }
 }

 // Modelleri Ollama VRAM'de önceden ısıtıp kilitler (keep_alive: -1 -> ilk sorguda 0 soğuk yükleme!)
 async warmupTeamModelsInVram({ ollamaBaseUrl, installedModels = [], profile = null } = {}) {
  if (!ollamaBaseUrl || !installedModels.length) return { warmed: [] };
  const active = profile || this.resolveActiveProfile(await this.loadState(), await this.detectLocalHardware());
  const targets = active.recommendedModels.filter(m => installedModels.includes(m));
  if (!targets.length) return { warmed: [] };

  const warmed = [];
  const t0 = performance.now();
  await Promise.allSettled(targets.map(async m => {
   const mStart = performance.now();
   const r = await this.fetchFn(`${ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     model: m,
     prompt: '',
     stream: false,
     keep_alive: active.keepAlive,
     options: { num_ctx: active.numCtx, num_gpu: active.numGpu, low_vram: false }
    }),
    signal: AbortSignal.timeout(15_000)
   });
   if (r.ok) warmed.push({ model: m, ms: Math.round(performance.now() - mStart) });
  }));
  await this.saveState({ lastWarmupAt: new Date().toISOString() }).catch(() => {});
  return { warmed, totalWarmupMs: Math.round(performance.now() - t0) };
 }

 async getSummary({ ollamaBaseUrl = null, installedModels = [] } = {}) {
  const isMockOllama = Array.isArray(installedModels) && installedModels.some(m => /^fake:/i.test(m));
  const [state, hw, vramStatus] = await Promise.all([
   this.loadState(),
   this.detectLocalHardware(),
   isMockOllama ? Promise.resolve({ connected: false, loaded: [], totalVramGb: 0, cpuOffloadDetected: false }) : this.getLoadedVramStatus(ollamaBaseUrl)
  ]);
  const activeProfile = this.resolveActiveProfile(state, hw);
  const installedSet = new Set(installedModels || []);
  const missingModels = activeProfile.recommendedModels.filter(m => !installedSet.has(m));
  return {
   state,
   hardware: hw,
   activeProfile,
   availableProfiles: Object.values(HARDWARE_PROFILES).map(p => ({
    id: p.id,
    label: p.label,
    description: p.description,
    primaryModel: p.primaryModel,
    judgeModel: p.judgeModel,
    coderModel: p.coderModel,
    estimatedVramGb: p.estimatedVramGb,
    subSecondMode: p.subSecondMode
   })),
   subSecondAllBots: true,
   subSecondBudgetMs: SUBSECOND_BOT_BUDGET_MS,
   upgradeTier: 'Ultra-Singularity-100x',
   missingRecommendedModels: missingModels,
   allRecommendedInstalled: missingModels.length === 0,
   vramStatus,
   pullState: this.pullState,
   recommendedEnv: OLLAMA_GPU_ENV_RECOMMENDATIONS
  };
 }
}
