#!/usr/bin/env node
/**
 * Ollama'yı soru üretimine hazırlar — `npm run dev` her açılışta bunu kendiliğinden çalıştırır.
 * Elle `setx …` yazmaya ya da Ollama'yı yeniden başlatmaya gerek kalmaz.
 *
 * Yaptıkları (yalnızca gerekiyorsa):
 *  1. Windows'ta kalıcı Ollama ayarlarını düzeltir:
 *       OLLAMA_MAX_LOADED_MODELS  1 ise → 2   (üretici ile 2. hakem birbirini bellekten atmasın)
 *       OLLAMA_NUM_PARALLEL       1 değilse → 1 (bağlam belleği katlanıp VRAM'i taşırmasın)
 *  2. Bir ayar değiştiyse çalışan Ollama'yı bir kez yeniden başlatır (ayar ancak öyle etkili olur).
 *  3. Ollama çalışmıyorsa doğru ayarlarla arka planda başlatır.
 *  4. Soru yazabilecek hiç model yoksa önerilen iki modeli indirir
 *     (`--pull` ya da TEMPO_PULL_MODELS=1 ile: önerilenlerden eksik olanı da indirir).
 *
 * Bu betik geliştirme sunucusunun açılmasını ASLA engellemez: her durumda 0 ile çıkar.
 * Kapatmak için: TEMPO_MANAGE_OLLAMA=0   ·   Model indirmeyi kapatmak için: TEMPO_AUTO_PULL=0
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planLineup } from '../server/model-lineup.mjs';

// server/ollama.mjs içindeki RECOMMENDED_* sabitleriyle aynı tutulur.
export const RECOMMENDED_MODELS = ['qwen3:8b', 'gemma3:4b'];
// Ollama'yı biz başlatıyorsak ve kullanıcı ayarlamamışsa eklenen hız ayarları.
export const SERVE_DEFAULTS = { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isBlank = v => v === undefined || v === null || String(v).trim() === '';

/**
 * Verilen ortam değerlerine göre düzeltilmesi gereken Ollama ayarlarını döndürür.
 * @param {Record<string, string|undefined>} values
 * @param {{requireParallel?: boolean}} [opts] requireParallel: OLLAMA_NUM_PARALLEL hiç
 *   ayarlanmamışsa da 1 olarak yazılsın mı? (Eski Ollama sürümlerinde "otomatik" 4 seçilebiliyor.)
 * @returns {Record<string, string>}
 */
export function evaluateOllamaEnv(values = {}, { requireParallel = true } = {}) {
 const fixes = {};
 const maxLoaded = values.OLLAMA_MAX_LOADED_MODELS;
 if (!isBlank(maxLoaded)) {
  const n = Number(String(maxLoaded).trim());
  // 0 = Ollama varsayılanı (kart başına 3). 1 = her soruda model takası.
  if (!Number.isFinite(n) || n === 1 || n < 0) fixes.OLLAMA_MAX_LOADED_MODELS = '2';
 }
 const parallel = values.OLLAMA_NUM_PARALLEL;
 if (isBlank(parallel)) {
  if (requireParallel) fixes.OLLAMA_NUM_PARALLEL = '1';
 } else if (String(parallel).trim() !== '1') {
  fixes.OLLAMA_NUM_PARALLEL = '1';
 }
 return fixes;
}

export function isLocalBase(base) {
 try {
  const host = new URL(base).hostname.replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '0.0.0.0';
 } catch { return false; }
}

function defaultRun(command, args = [], { inherit = false, timeoutMs = 20_000 } = {}) {
 return new Promise(resolve => {
  if (inherit) {
   const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
   child.on('error', () => resolve({ code: 127, stdout: '' }));
   child.on('close', code => resolve({ code: code ?? 1, stdout: '' }));
   return;
  }
  execFile(command, args, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
   resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || '') });
  });
 });
}

function defaultSpawnDetached(command, args, env) {
 const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true, env });
 child.on('error', () => {});
 child.unref();
}

const REG_USER = 'HKCU\\Environment';
const REG_MACHINE = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

async function readWindowsVar(run, name) {
 for (const key of [REG_USER, REG_MACHINE]) {
  const r = await run('reg', ['query', key, '/v', name]);
  if (r.code !== 0) continue;
  const m = r.stdout.match(/REG_(?:EXPAND_)?SZ[ \t]+([^\r\n]*)/);
  if (m) return m[1].trim();
 }
 return undefined;
}

/**
 * @returns {Promise<{managed:boolean, changed:Record<string,string>, started:boolean, restarted:boolean,
 *   running:boolean, pulled:string[], notes:string[]}>}
 */
export async function ensureOllama({
 platform = process.platform,
 env = process.env,
 argv = [],
 run = defaultRun,
 spawnDetached = defaultSpawnDetached,
 fetchFn = globalThis.fetch,
 exists = existsSync,
 log = msg => console.log(`[tempo] ${msg}`),
 sleepFn = sleep,
 readyTimeoutMs = 25_000
} = {}) {
 const report = { managed: false, changed: {}, started: false, restarted: false, running: false, pulled: [], notes: [] };
 const note = msg => { report.notes.push(msg); log(msg); };
 if (env.TEMPO_MANAGE_OLLAMA === '0') return report;

 const base = String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
 if (!isLocalBase(base)) return report; // uzak Ollama: dokunma
 report.managed = true;
 const isWindows = platform === 'win32';

 const isUp = async () => {
  try {
   const r = await fetchFn(`${base}/api/version`, { signal: AbortSignal.timeout(1500) });
   return Boolean(r && r.ok);
  } catch { return false; }
 };
 const waitFor = async (wanted, timeoutMs) => {
  const until = Date.now() + timeoutMs;
  for (;;) {
   if ((await isUp()) === wanted) return true;
   if (Date.now() >= until) return false;
   await sleepFn(500);
  }
 };

 // 1) Kalıcı ayarlar (yalnızca Windows: Ollama uygulaması bunları oturum açılışında okur).
 if (isWindows) {
  const persisted = {
   OLLAMA_MAX_LOADED_MODELS: await readWindowsVar(run, 'OLLAMA_MAX_LOADED_MODELS'),
   OLLAMA_NUM_PARALLEL: await readWindowsVar(run, 'OLLAMA_NUM_PARALLEL')
  };
  for (const [name, value] of Object.entries(evaluateOllamaEnv(persisted))) {
   const r = await run('setx', [name, value]);
   if (r.code === 0) {
    report.changed[name] = value;
    note(`Ollama ayarı düzeltildi: ${name}=${value}${isBlank(persisted[name]) ? '' : ` (önceki: ${persisted[name]})`}`);
   } else {
    note(`Ollama ayarı yazılamadı: ${name}=${value}. PowerShell'de elle çalıştır: setx ${name} "${value}"`);
   }
  }
 }

 // 2) Ollama'yı bul.
 let binary = null;
 const resolveBinary = async () => {
  if (binary) return binary;
  if ((await run('ollama', ['--version'])).code === 0) { binary = 'ollama'; return binary; }
  const candidates = isWindows
   ? [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'), env.ProgramFiles && join(env.ProgramFiles, 'Ollama', 'ollama.exe')]
   : ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama'];
  binary = candidates.filter(Boolean).find(p => exists(p)) || null;
  return binary;
 };
 const serveEnv = () => {
  const out = { ...env };
  for (const [k, v] of Object.entries(SERVE_DEFAULTS)) if (isBlank(out[k])) out[k] = v;
  // Bu kabuğun ortamı setx'ten ÖNCEki değerleri taşır; az önce yazılanlar açıkça eklenir.
  return { ...out, ...evaluateOllamaEnv(out), ...report.changed };
 };
 const startServer = async () => {
  const bin = await resolveBinary();
  if (!bin) return false;
  spawnDetached(bin, ['serve'], serveEnv());
  return waitFor(true, readyTimeoutMs);
 };

 // 3) Çalışmıyorsa başlat; ayar değiştiyse bir kez yeniden başlat.
 let up = await isUp();
 const changedNames = Object.keys(report.changed);
 if (up && isWindows && changedNames.length) {
  if (await resolveBinary()) {
   log('Yeni ayarların geçerli olması için Ollama bir kez yeniden başlatılıyor…');
   await run('taskkill', ['/F', '/T', '/IM', 'ollama app.exe']);
   await run('taskkill', ['/F', '/T', '/IM', 'ollama.exe']);
   await waitFor(false, 8_000);
   up = await startServer();
   report.restarted = up;
   if (up) log('Ollama yeni ayarlarla çalışıyor.');
   else note('Ollama yeniden başlatılamadı. Başlat menüsünden Ollama uygulamasını aç; üretim bağlanınca kendiliğinden başlar.');
  } else {
   note('Ayarlar kaydedildi ama Ollama programı bulunamadığı için yeniden başlatılamadı. Ollama\'yı kapatıp yeniden aç.');
  }
 } else if (!up) {
  if (await resolveBinary()) {
   log('Ollama çalışmıyor; arka planda başlatılıyor…');
   up = await startServer();
   report.started = up;
   if (up) log('Ollama hazır.');
   else note('Ollama başlatıldı ama yanıt vermedi. Uygulama yine de açılıyor; Ollama hazır olunca üretim kendiliğinden başlar.');
  } else {
   note('Ollama kurulu değil. https://ollama.com/download adresinden kur; kurulunca soru üretimi kendiliğinden başlar.');
  }
 } else if (!isWindows && Object.keys(evaluateOllamaEnv(env, { requireParallel: false })).length) {
  note('Bu kabukta OLLAMA_MAX_LOADED_MODELS / OLLAMA_NUM_PARALLEL değerleri soru üretimi için uygun değil. Ollama servisinde OLLAMA_MAX_LOADED_MODELS=2 ve OLLAMA_NUM_PARALLEL=1 önerilir.');
 }
 report.running = up;

 // 4) Modeller.
 if (up && env.TEMPO_AUTO_PULL !== '0') {
  let installed = null;
  try {
   const r = await fetchFn(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
   if (r.ok) installed = ((await r.json()).models || []).map(m => ({ name: m.name, size: m.size, details: m.details }));
  } catch {}
  if (installed) {
   const have = new Set(installed.map(m => String(m.name).replace(/:latest$/, '')));
   const missing = RECOMMENDED_MODELS.filter(m => !have.has(m));
   const pullAllMissing = argv.includes('--pull') || env.TEMPO_PULL_MODELS === '1';
   const nothingUsable = !planLineup(installed, { vramGb: 12, numCtx: 4096 }).ok;
   if (missing.length && (pullAllMissing || nothingUsable)) {
    const bin = await resolveBinary();
    if (!bin) {
     note(`Eksik model: ${missing.join(', ')}. İndirmek için: ${missing.map(m => `ollama pull ${m}`).join(' ; ')}`);
    } else {
     for (const m of missing) {
      log(`Model indiriliyor: ${m} (ilk seferde birkaç dakika sürebilir)…`);
      const r = await run(bin, ['pull', m], { inherit: true, timeoutMs: 0 });
      if (r.code === 0) report.pulled.push(m);
      else note(`${m} indirilemedi; uygulama kurulu modellerle devam edecek.`);
     }
    }
   }
  }
 }
 return report;
}

const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
const invokedDirectly = Boolean(process.argv[1]) && samePath(fileURLToPath(import.meta.url), process.argv[1]);
if (invokedDirectly) {
 try {
  await ensureOllama({ argv: process.argv.slice(2) });
 } catch (e) {
  console.log(`[tempo] Ollama hazırlığı atlandı: ${e?.message || e}`);
 }
 process.exit(0);
}
