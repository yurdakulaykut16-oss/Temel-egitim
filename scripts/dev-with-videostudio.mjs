#!/usr/bin/env node
/**
 * Yerel Açık Kaynak AI Video Stüdyosu Başlatıcısı (npm run dev:videostudio)
 *
 * Sıfır API anahtarı ile çalışır:
 * 1) Bilgisayarda ComfyUI (8188 — Wan2.2/LTX-Video), Short-Video-Maker (3123) veya MoneyPrinterTurbo (8080)
 *    zaten kuruluysa otomatik algılar veya kurulu Python/Node ortamından ayağa kaldırır.
 * 2) Hiçbir harici sunucu kurulmasa bile Temel Eğitim içindeki Tempo Cinema AI Pro (24fps MP4) + VoiceStudio
 *    yerel motoru her zaman anında çalışmaya devam eder.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const RUNTIME = resolve(ROOT, '.runtime');
const SVM_DIR = join(RUNTIME, 'short-video-maker');
const COMFY_DIR = join(RUNTIME, 'ComfyUI');

function log(msg) { console.log(`[Tempo VideoStudio] ${msg}`); }
function warn(msg) { console.warn(`[Tempo VideoStudio] ⚠ ${msg}`); }

function cmdExists(cmd) {
 try {
  execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
  return true;
 } catch {
  return false;
 }
}

async function isUp(url) {
 try {
  const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
  return r.ok;
 } catch {
  return false;
 }
}

async function maybeStartShortVideoMaker() {
 const port = Number(process.env.SHORT_VIDEO_MAKER_PORT || 3123);
 if (await isUp(`http://127.0.0.1:${port}/health`)) {
  log(`Short-Video-Maker zaten ${port} portunda çalışıyor.`);
  return null;
 }
 if (!existsSync(SVM_DIR)) {
  if (!cmdExists('git') || !cmdExists('npm')) return null;
  log('Açık kaynak gyoridavid/short-video-maker (MIT) .runtime/short-video-maker içine indiriliyor…');
  mkdirSync(RUNTIME, { recursive: true });
  try {
   execFileSync('git', ['clone', '--depth', '1', 'https://github.com/gyoridavid/short-video-maker.git', SVM_DIR], { stdio: 'inherit' });
   execFileSync('npm', ['install'], { cwd: SVM_DIR, stdio: 'inherit' });
  } catch (e) {
   warn(`Short-Video-Maker kurulamadı (${e.message}) — yerleşik Tempo Cinema AI Pro motoru aktif kalacak.`);
   return null;
  }
 }
 log(`Short-Video-Maker ${port} portunda başlatılıyor…`);
 return spawn('npm', ['start'], {
  cwd: SVM_DIR,
  env: { ...process.env, PORT: String(port) },
  stdio: 'inherit'
 });
}

async function main() {
 const children = [];
 if (await isUp('http://127.0.0.1:8188/system_stats')) {
  log('Yerel ComfyUI (8188 · Wan2.2/LTX-Video) algılandı ve bağlandı.');
 } else if (existsSync(COMFY_DIR) && cmdExists('python3')) {
  log('Mevcut ComfyUI (.runtime/ComfyUI) 8188 portunda başlatılıyor…');
  children.push(spawn('python3', ['main.py', '--listen', '127.0.0.1', '--port', '8188'], {
   cwd: COMFY_DIR,
   stdio: 'inherit'
  }));
 }

 if (process.env.ENABLE_SHORT_VIDEO_MAKER === '1') {
  const svm = await maybeStartShortVideoMaker();
  if (svm) children.push(svm);
 }

 const viteCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
 const vite = spawn(viteCmd, ['vite', '--host', '0.0.0.0'], {
  cwd: ROOT,
  stdio: 'inherit'
 });
 children.push(vite);

 const cleanup = () => {
  for (const ch of children) {
   try { ch.kill(); } catch {}
  }
 };
 process.on('SIGINT', () => { cleanup(); process.exit(0); });
 process.on('SIGTERM', () => { cleanup(); process.exit(0); });
 vite.on('exit', code => { cleanup(); process.exit(code ?? 0); });
}

main().catch(e => {
 warn(e.message || String(e));
 process.exit(1);
});
