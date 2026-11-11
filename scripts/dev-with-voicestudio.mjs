#!/usr/bin/env node
/**
 * Opsiyonel Tam Yerel VoiceStudio Başlatıcısı (npm run dev:voicestudio).
 * Yerel bilgisayarda çalıştırıldığında debpalash/VoiceStudio deposunu .runtime/VoiceStudio içine kurar,
 * k2-fsa/OmniVoice ile 3900 portundan OpenAI uyumlu ücretsiz ses sunucusunu açar ve Temel Eğitim Vite uygulamasını başlatır.
 * Normal "npm run dev" akışı bu script olmadan da 58+ ücretsiz sesle doğrudan çalışır.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const RUNTIME = join(ROOT, '.runtime');
const VOICESTUDIO_DIR = join(RUNTIME, 'VoiceStudio');
const VS_REPO = 'https://github.com/debpalash/VoiceStudio.git';
const configuredPort = Number(process.env.VOICESTUDIO_PORT || 3900);
const VS_PORT = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65_536 ? configuredPort : 3900;
const MODEL_REPO = process.env.VOICESTUDIO_MODEL_REPO || 'k2-fsa/OmniVoice';
const AUTO_MODEL = process.env.TEMPO_AUTO_INSTALL_VOICESTUDIO_MODEL !== 'false';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const commandName = name => (process.platform === 'win32' && name === 'npm' ? 'npm.cmd' : name);

function spawnCommand(command, args = [], options = {}) {
 const safeArgs = args.filter(a => a !== undefined && a !== null && String(a).trim() !== '').map(String);
 return spawn(commandName(command), safeArgs, { ...options, shell: process.platform === 'win32' });
}

function log(msg) { console.log(`[Tempo VoiceStudio] ${msg}`); }
function warn(msg) { console.warn(`[Tempo VoiceStudio] ⚠ ${msg}`); }

function voiceStudioEnvironment() {
 const env = { ...process.env, PYTHONUNBUFFERED: '1', HF_HUB_DISABLE_XET: '1' };
 if (!env.SSL_CERT_FILE && !env.REQUESTS_CA_BUNDLE) {
  const candidates = process.platform === 'win32'
   ? [join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'curl-ca-bundle.crt')]
   : ['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'];
  const bundle = candidates.find(p => existsSync(p));
  if (bundle) {
   env.SSL_CERT_FILE = bundle;
   env.REQUESTS_CA_BUNDLE = bundle;
   env.CURL_CA_BUNDLE = bundle;
  }
 }
 return env;
}

async function canRun(command, args = ['--version']) {
 try {
  await execFileAsync(commandName(command), args, { timeout: 15_000, windowsHide: true });
  return true;
 } catch {
  return false;
 }
}

async function run(command, args, options = {}) {
 const code = await new Promise((resolve, reject) => {
  const child = spawnCommand(command, args, {
   cwd: options.cwd || ROOT,
   env: options.env || process.env,
   stdio: options.stdio || 'inherit'
  });
  child.on('error', reject);
  child.on('close', c => resolve(c ?? 1));
 });
 if (options.allowFailure || code === 0) return code;
 throw new Error(`${command} ${args.join(' ')} başarısız oldu (kod ${code})`);
}

async function findPython() {
 for (const c of process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']) {
  if (await canRun(c, ['--version'])) return c;
 }
 return null;
}

async function findUv() {
 const uvName = process.platform === 'win32' ? 'uv.exe' : 'uv';
 const candidates = [
  'uv',
  process.env.UV_BINARY,
  join(RUNTIME, 'uv-venv', process.platform === 'win32' ? 'Scripts' : 'bin', uvName),
  join(homedir(), '.local', 'bin', uvName),
  join(homedir(), '.cargo', 'bin', uvName)
 ].filter(Boolean);
 for (const c of candidates) {
  if ((c === 'uv' || existsSync(c)) && await canRun(c, ['--version'])) return c;
 }
 return null;
}

async function ensureUv() {
 const existing = await findUv();
 if (existing) return existing;
 const python = await findPython();
 if (!python) throw new Error('Python 3.11+ bulunamadı.');
 log('uv proje içi Python ortamına kuruluyor…');
 const uvVenv = join(RUNTIME, 'uv-venv');
 mkdirSync(RUNTIME, { recursive: true });
 if (!existsSync(join(uvVenv, process.platform === 'win32' ? 'Scripts' : 'bin'))) {
  await run(python, ['-m', 'venv', uvVenv]);
 }
 const venvPy = process.platform === 'win32' ? join(uvVenv, 'Scripts', 'python.exe') : join(uvVenv, 'bin', 'python');
 await run(venvPy, ['-m', 'pip', 'install', '--upgrade', 'uv']);
 const installed = await findUv();
 if (!installed) throw new Error('uv kurulamadı.');
 return installed;
}

async function voiceStudioHealth() {
 for (const p of ['/system/info', '/health']) {
  try {
   const r = await fetch(`http://127.0.0.1:${VS_PORT}${p}`, { signal: AbortSignal.timeout(1500) });
   if (r.ok) return true;
  } catch {}
 }
 return false;
}

async function ensureSource() {
 mkdirSync(RUNTIME, { recursive: true });
 if (existsSync(join(VOICESTUDIO_DIR, '.git'))) return;
 if (!(await canRun('git', ['--version']))) throw new Error('Git bulunamadı.');
 if (existsSync(VOICESTUDIO_DIR)) rmSync(VOICESTUDIO_DIR, { recursive: true, force: true });
 log('VoiceStudio açık kaynak deposu .runtime/VoiceStudio içine indiriliyor…');
 await run('git', ['clone', '--depth', '1', VS_REPO, VOICESTUDIO_DIR]);
}

function patchPyproject() {
 const p = join(VOICESTUDIO_DIR, 'pyproject.toml');
 if (!existsSync(p)) return;
 let src = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
 const orig = src;
 src = src.replace(/^\s*"kittentts @ [^\n]+",\n/m, '');
 src = src.replace(/^\s*"en-core-web-sm @ [^\n]+",\n/m, '');
 const start = src.indexOf('\n[tool.uv.sources]\n');
 const end = start === -1 ? -1 : src.indexOf('\n[tool.uv]\n', start);
 if (start !== -1 && end !== -1) src = src.slice(0, start + 1) + src.slice(end + 1);
 if (src !== orig) writeFileSync(p, src);
}

async function prepareDeps(uv) {
 const marker = join(VOICESTUDIO_DIR, '.tempo-api-ready');
 if (existsSync(marker) && existsSync(join(VOICESTUDIO_DIR, '.venv'))) return;
 log('VoiceStudio bağımlılıkları hazırlanıyor…');
 patchPyproject();
 await run(uv, ['lock', '--system-certs'], { cwd: VOICESTUDIO_DIR });
 await run(uv, ['sync', '--system-certs'], { cwd: VOICESTUDIO_DIR });
 await run(uv, ['run', '--system-certs', 'python', 'scripts/setup.py'], { cwd: VOICESTUDIO_DIR, allowFailure: true });
 writeFileSync(marker, new Date().toISOString());
}

async function installModelIfMissing() {
 if (!AUTO_MODEL) return;
 try {
  const r = await fetch(`http://127.0.0.1:${VS_PORT}/models`);
  if (!r.ok) return;
  const cat = await r.json();
  if ((cat.models || []).some(m => m.repo_id === MODEL_REPO && m.installed)) {
   log('VoiceStudio OmniVoice modeli hazır.');
   return;
  }
  await fetch(`http://127.0.0.1:${VS_PORT}/models/install`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ repo_id: MODEL_REPO, target: 'local' })
  });
 } catch {}
}

async function bootstrapVoiceStudio() {
 if (process.env.TEMPO_SKIP_VOICESTUDIO === 'true' || await voiceStudioHealth()) {
  if (await voiceStudioHealth()) {
   log('Yerel VoiceStudio zaten 3900 portunda çalışıyor.');
   void installModelIfMissing();
  }
  return { child: null, owned: false };
 }
 await ensureSource();
 const uv = await findUv() || await ensureUv();
 await prepareDeps(uv);
 const child = spawnCommand(uv, ['run', 'uvicorn', 'main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', String(VS_PORT)], {
  cwd: VOICESTUDIO_DIR,
  env: voiceStudioEnvironment(),
  stdio: 'inherit'
 });
 const deadline = Date.now() + 180_000;
 while (Date.now() < deadline) {
  if (await voiceStudioHealth()) {
   void installModelIfMissing();
   return { child, owned: true };
  }
  await sleep(1500);
 }
 throw new Error('VoiceStudio 180 saniye içinde yanıt vermedi.');
}

async function main() {
 let backend = { child: null, owned: false };
 let closing = false;
 const frontend = spawnCommand('npm', ['run', 'dev'], { cwd: ROOT, env: process.env, stdio: 'inherit' });

 const shutdown = (code = 0) => {
  if (closing) return;
  closing = true;
  try { frontend.kill('SIGTERM'); } catch {}
  if (backend.owned && backend.child) try { backend.child.kill('SIGTERM'); } catch {}
  setTimeout(() => process.exit(code), 250);
 };
 process.once('SIGINT', () => shutdown(0));
 process.once('SIGTERM', () => shutdown(0));
 frontend.once('exit', code => shutdown(code ?? 0));

 try {
  backend = await bootstrapVoiceStudio();
 } catch (e) {
  warn(`VoiceStudio başlatılamadı (${e.message}) — Temel Eğitim 58+ ücretsiz tarayıcı/0-API sesiyle devam ediyor.`);
 }
}

main().catch(err => { console.error(err); process.exit(1); });
