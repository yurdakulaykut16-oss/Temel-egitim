// baslat.bat'in çağırdığı güncelleme betiğini (scripts/guncelle.mjs) gerçek git ile, ağ
// kullanmadan (yerel bir "uzak depo" üzerinden) doğrular.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {updateProject} from './guncelle.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function makeUpstream() {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-upstream-'));
 git(dir, 'init', '-q', '-b', 'main');
 writeFileSync(join(dir, 'package.json'), '{"version":"2.0.0"}\n');
 writeFileSync(join(dir, 'baslat.bat'), '@echo off\r\n');
 writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.tempo-data/\n');
 git(dir, 'add', '-A');
 git(dir, 'commit', '-q', '-m', 'v2');
 return dir;
}

test('ZIP klasörü yerinde Git\'e bağlanır, veriler korunur, sonraki açılışlarda güncelleme alır', async () => {
 const upstream = makeUpstream();
 const zip = mkdtempSync(join(tmpdir(), 'tempo-zip-'));
 const logs = [];
 try {
  // Eski sürümün ZIP içeriği + kullanıcının verileri.
  writeFileSync(join(zip, 'package.json'), '{"version":"1.0.0"}\n');
  mkdirSync(join(zip, '.tempo-data'));
  writeFileSync(join(zip, '.tempo-data', 'questions.json'), '[{"id":"benim-sorum"}]');
  mkdirSync(join(zip, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(zip, 'node_modules', 'x', 'index.js'), '1');
  assert.equal(existsSync(join(zip, '.git')), false);

  const env = { TEMPO_REPO_URL: upstream, TEMPO_REPO_BRANCH: 'main' };
  const first = await updateProject({ root: zip, env, log: m => logs.push(m) });
  assert.equal(first.action, 'converted', logs.join(' | '));
  assert.equal(readFileSync(join(zip, 'package.json'), 'utf8'), '{"version":"2.0.0"}\n', 'eski proje dosyası son sürümle değişmeli');
  assert.ok(existsSync(join(zip, 'baslat.bat')), 'yeni dosyalar gelmeli');
  assert.equal(readFileSync(join(zip, '.tempo-data', 'questions.json'), 'utf8'), '[{"id":"benim-sorum"}]', 'kullanıcının soruları korunmalı');
  assert.ok(existsSync(join(zip, 'node_modules', 'x', 'index.js')), 'node_modules korunmalı');
  assert.equal(git(zip, 'status', '--porcelain').trim(), '', 'çalışma alanı temiz olmalı');

  const second = await updateProject({ root: zip, env, log: m => logs.push(m) });
  assert.equal(second.action, 'up_to_date');

  // Depoya yeni sürüm gelince normal güncelleme alınır.
  writeFileSync(join(upstream, 'package.json'), '{"version":"3.0.0"}\n');
  git(upstream, 'commit', '-q', '-am', 'v3');
  const third = await updateProject({ root: zip, env, log: m => logs.push(m) });
  assert.equal(third.action, 'pulled');
  assert.equal(readFileSync(join(zip, 'package.json'), 'utf8'), '{"version":"3.0.0"}\n');
 } finally {
  rmSync(upstream, { recursive: true, force: true });
  rmSync(zip, { recursive: true, force: true });
 }
});

test('depoya ulaşılamazsa klasör olduğu gibi bırakılır; git yoksa ya da kapalıysa atlanır', async () => {
 const zip = mkdtempSync(join(tmpdir(), 'tempo-zip-'));
 try {
  writeFileSync(join(zip, 'package.json'), '{"version":"1.0.0"}\n');
  const failed = await updateProject({ root: zip, env: { TEMPO_REPO_URL: join(zip, 'boyle-bir-depo-yok') }, log: () => {} });
  assert.equal(failed.action, 'convert_failed');
  assert.equal(existsSync(join(zip, '.git')), false, 'yarım kalan .git temizlenmeli (sonraki açılışta yeniden denenebilsin)');
  assert.equal(readFileSync(join(zip, 'package.json'), 'utf8'), '{"version":"1.0.0"}\n');

  const calls = [];
  const noGit = await updateProject({ root: zip, env: {}, log: () => {}, run: async (c, a) => { calls.push([c, ...a].join(' ')); return { code: 127, stdout: '', stderr: '' }; } });
  assert.equal(noGit.action, 'no_git');
  assert.deepEqual(calls, ['git --version']);

  const disabled = await updateProject({ root: zip, env: { TEMPO_AUTO_UPDATE: '0' }, log: () => {}, run: async () => { throw new Error('çağrılmamalı'); } });
  assert.equal(disabled.action, 'disabled');
 } finally {
  rmSync(zip, { recursive: true, force: true });
 }
});
