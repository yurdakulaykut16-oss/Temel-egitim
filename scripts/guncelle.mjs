#!/usr/bin/env node
/**
 * Projeyi GitHub'daki son sürüme günceller — `baslat.bat` her açılışta bunu çalıştırır.
 *
 *  - Klasör bir Git kopyasıysa:        git pull --ff-only
 *  - Klasör ZIP olarak indirildiyse:   bir kez yerinde Git'e bağlanır (git init + fetch +
 *    checkout) ve sonraki açılışlarda normal güncelleme alır. "git pull" → "not a git
 *    repository" hatasıyla uğraşmak gerekmez.
 *
 * Korunanlar: Git'in izlemediği her şey — üretilen sorular ve ayarlar (.tempo-data),
 * node_modules, .runtime (VoiceStudio). Proje dosyaları son sürümle değiştirilir.
 *
 * Bu betik uygulamanın açılmasını ASLA engellemez: her durumda 0 ile çıkar.
 * Kapatmak için: TEMPO_AUTO_UPDATE=0   ·   Farklı depo için: TEMPO_REPO_URL, TEMPO_REPO_BRANCH
 */
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REPO_URL = 'https://github.com/yurdakulaykut16-oss/Temel-egitim.git';
export const DEFAULT_BRANCH = 'main';

function defaultRun(command, args, { cwd, timeoutMs = 180_000 } = {}) {
 return new Promise(resolvePromise => {
  execFile(command, args, { cwd, timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
   resolvePromise({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
  });
 });
}

const lastLine = text => String(text || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';

/**
 * @returns {Promise<{action:'disabled'|'no_git'|'pulled'|'up_to_date'|'pull_failed'|'converted'|'convert_failed', detail:string}>}
 */
export async function updateProject({
 root = join(fileURLToPath(new URL('.', import.meta.url)), '..'),
 env = process.env,
 run = defaultRun,
 log = msg => console.log(`[baslat] ${msg}`)
} = {}) {
 if (env.TEMPO_AUTO_UPDATE === '0') return { action: 'disabled', detail: '' };
 const repoUrl = env.TEMPO_REPO_URL || DEFAULT_REPO_URL;
 const branch = env.TEMPO_REPO_BRANCH || DEFAULT_BRANCH;
 const git = (args, opts) => run('git', args, { cwd: root, ...opts });

 if ((await git(['--version'])).code !== 0) {
  log('Git kurulu değil; güncelleme atlandı, mevcut sürümle devam ediliyor. (Otomatik güncelleme için https://git-scm.com/download/win adresinden Git kur.)');
  return { action: 'no_git', detail: '' };
 }

 // Bu klasörün KENDİSİ bir Git kopyası mı? (Üst klasördeki başka bir depoya dokunmamak için
 // yalnızca buradaki .git aranır.)
 if (existsSync(join(root, '.git'))) {
  log('Güncelleme kontrol ediliyor…');
  const before = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const pull = await git(['pull', '--ff-only']);
  if (pull.code !== 0) {
   log(`Güncelleme alınamadı; mevcut sürümle devam ediliyor. (${lastLine(pull.stderr) || lastLine(pull.stdout) || 'bilinmeyen hata'})`);
   return { action: 'pull_failed', detail: lastLine(pull.stderr) };
  }
  const after = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  if (before && after && before !== after) {
   log(`Yeni sürüm alındı (${after.slice(0, 7)}).`);
   return { action: 'pulled', detail: after };
  }
  log('Proje güncel.');
  return { action: 'up_to_date', detail: after };
 }

 // ZIP olarak indirilmiş klasör: yerinde Git'e bağla.
 log('Bu klasör ZIP olarak indirilmiş. Güncelleme alabilmesi için bir kez GitHub deposuna bağlanıyor…');
 log('(Sorular ve ayarlar korunur; proje dosyaları son sürümle değiştirilir.)');
 const undo = () => { try { rmSync(join(root, '.git'), { recursive: true, force: true }); } catch {} };
 const steps = [
  ['init', '-q'],
  ['remote', 'add', 'origin', repoUrl],
  ['fetch', '-q', 'origin', branch]
 ];
 for (const args of steps) {
  const r = await git(args);
  if (r.code !== 0) {
   undo();
   log(`Depoya bağlanılamadı; mevcut sürümle devam ediliyor. (${lastLine(r.stderr) || 'internet bağlantısını kontrol et'})`);
   return { action: 'convert_failed', detail: lastLine(r.stderr) };
  }
 }
 // -f: ZIP'ten gelen eski proje dosyalarının üzerine yazar. İzlenmeyen dosyalara dokunmaz.
 const checkout = await git(['checkout', '-q', '-f', '-B', branch, `origin/${branch}`]);
 if (checkout.code !== 0) {
  undo();
  log(`Son sürüm açılamadı; mevcut sürümle devam ediliyor. (${lastLine(checkout.stderr) || 'bilinmeyen hata'})`);
  return { action: 'convert_failed', detail: lastLine(checkout.stderr) };
 }
 const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
 log(`Proje son sürüme getirildi (${head.slice(0, 7)}). Bundan sonra her açılışta kendiliğinden güncellenir.`);
 return { action: 'converted', detail: head };
}

const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
 try {
  await updateProject();
 } catch (e) {
  console.log(`[baslat] Güncelleme atlandı: ${e?.message || e}`);
 }
 process.exit(0);
}
