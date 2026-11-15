// `npm run dev` öncesinde çalışan Ollama hazırlığını (scripts/ensure-ollama.mjs) doğrular.
// Gerçek reg/setx/taskkill/ollama çağrıları yerine sahte komut çalıştırıcı kullanılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureOllama, evaluateOllamaEnv, isLocalBase} from './ensure-ollama.mjs';

/** Sahte Windows makinesi: kayıt defteri, çalışan Ollama ve kurulu modeller. */
function fakeMachine({ registry = {}, running = true, hasBinary = true, models = ['qwen3:8b', 'gemma3:4b'], platform = 'win32', env = {} } = {}) {
 const state = { registry: { ...registry }, running, models: [...models], commands: [], spawned: [], logs: [] };
 const run = async (command, args = []) => {
  state.commands.push([command, ...args].join(' '));
  if (command === 'reg') {
   const name = args[args.length - 1];
   const isUser = args[1].startsWith('HKCU');
   const value = isUser ? state.registry[name] : undefined;
   return value === undefined ? { code: 1, stdout: '' } : { code: 0, stdout: `\r\n${args[1]}\r\n    ${name}    REG_SZ    ${value}\r\n\r\n` };
  }
  if (command === 'setx') { state.registry[args[0]] = args[1]; return { code: 0, stdout: 'SUCCESS' }; }
  if (command === 'taskkill') { state.running = false; return { code: 0, stdout: '' }; }
  if (/ollama/.test(command)) {
   if (!hasBinary) return { code: 127, stdout: '' };
   if (args[0] === 'pull') state.models.push(args[1]);
   return { code: 0, stdout: 'ollama version is 0.12.0' };
  }
  return { code: 1, stdout: '' };
 };
 const spawnDetached = (command, args, spawnEnv) => { state.spawned.push({ command, args, env: spawnEnv }); state.running = true; };
 const fetchFn = async url => {
  if (!state.running) throw new Error('ECONNREFUSED');
  if (String(url).endsWith('/api/tags')) return { ok: true, json: async () => ({ models: state.models.map(name => ({ name, size: 5 * 1024 ** 3, details: {} })) }) };
  return { ok: true, json: async () => ({ version: '0.12.0' }) };
 };
 const deps = { platform, env, run, spawnDetached, fetchFn, exists: () => false, log: m => state.logs.push(m), sleepFn: async () => {}, readyTimeoutMs: 50 };
 return { state, deps };
}

test('evaluateOllamaEnv: yalnızca zararlı değerler düzeltilir', () => {
 assert.deepEqual(evaluateOllamaEnv({ OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_NUM_PARALLEL: '4' }), { OLLAMA_MAX_LOADED_MODELS: '2', OLLAMA_NUM_PARALLEL: '1' });
 assert.deepEqual(evaluateOllamaEnv({ OLLAMA_MAX_LOADED_MODELS: '3', OLLAMA_NUM_PARALLEL: '1' }), {});
 assert.deepEqual(evaluateOllamaEnv({ OLLAMA_MAX_LOADED_MODELS: '0', OLLAMA_NUM_PARALLEL: '1' }), {}, '0 = Ollama varsayılanı');
 assert.deepEqual(evaluateOllamaEnv({}), { OLLAMA_NUM_PARALLEL: '1' }, 'ayarlanmamış paralellik açıkça 1 yapılır');
 assert.deepEqual(evaluateOllamaEnv({}, { requireParallel: false }), {});
 assert.equal(isLocalBase('http://127.0.0.1:11434'), true);
 assert.equal(isLocalBase('http://localhost:11434'), true);
 assert.equal(isLocalBase('http://192.168.1.20:11434'), false);
});

test('Windows: yanlış kalıcı ayarlar düzeltilir ve çalışan Ollama bir kez yeniden başlatılır', async () => {
 const { state, deps } = fakeMachine({ registry: { OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_NUM_PARALLEL: '4' } });
 const report = await ensureOllama(deps);
 assert.deepEqual(report.changed, { OLLAMA_MAX_LOADED_MODELS: '2', OLLAMA_NUM_PARALLEL: '1' });
 assert.deepEqual(state.registry, { OLLAMA_MAX_LOADED_MODELS: '2', OLLAMA_NUM_PARALLEL: '1' });
 assert.equal(report.restarted, true);
 assert.ok(state.commands.some(c => c.startsWith('taskkill') && c.includes('ollama app.exe')));
 assert.equal(state.spawned.length, 1);
 assert.deepEqual(state.spawned[0].args, ['serve']);
 assert.equal(state.spawned[0].env.OLLAMA_MAX_LOADED_MODELS, '2');
 assert.equal(state.spawned[0].env.OLLAMA_NUM_PARALLEL, '1');
 assert.equal(state.spawned[0].env.OLLAMA_FLASH_ATTENTION, '1');
 assert.equal(report.running, true);

 // İkinci açılış: her şey yerinde → hiçbir şeye dokunulmaz.
 state.commands.length = 0; state.spawned.length = 0;
 const again = await ensureOllama(deps);
 assert.deepEqual(again.changed, {});
 assert.equal(again.restarted, false);
 assert.equal(state.spawned.length, 0);
 assert.ok(!state.commands.some(c => c.startsWith('taskkill') || c.startsWith('setx')), 'gereksiz yeniden başlatma olmamalı');
});

test('Windows: ayarlar doğruysa çalışan Ollama\'ya dokunulmaz; kullanıcının yüksek değeri korunur', async () => {
 const { state, deps } = fakeMachine({ registry: { OLLAMA_MAX_LOADED_MODELS: '3', OLLAMA_NUM_PARALLEL: '1' } });
 const report = await ensureOllama(deps);
 assert.deepEqual(report.changed, {});
 assert.equal(report.restarted, false);
 assert.equal(report.started, false);
 assert.equal(state.registry.OLLAMA_MAX_LOADED_MODELS, '3');
 assert.ok(!state.commands.some(c => c.startsWith('taskkill')));
});

test('Ollama çalışmıyorsa doğru ayarlarla başlatılır; kurulu değilse açılış engellenmez', async () => {
 const a = fakeMachine({ registry: { OLLAMA_NUM_PARALLEL: '1' }, running: false, env: { OLLAMA_MAX_LOADED_MODELS: '1' } });
 const started = await ensureOllama(a.deps);
 assert.equal(started.started, true);
 assert.equal(a.state.spawned[0].env.OLLAMA_MAX_LOADED_MODELS, '2', 'kabuktaki zararlı değer başlatılan sunucuya taşınmaz');
 assert.ok(!a.state.commands.some(c => c.startsWith('taskkill')));

 const b = fakeMachine({ running: false, hasBinary: false, platform: 'linux' });
 const missing = await ensureOllama(b.deps);
 assert.equal(missing.running, false);
 assert.equal(b.state.spawned.length, 0);
 assert.ok(missing.notes.some(n => /Ollama kurulu değil/.test(n)));
});

test('modeller: hiç uygun model yoksa önerilenler indirilir; varsa yalnızca --pull ile tamamlanır', async () => {
 const none = fakeMachine({ registry: { OLLAMA_NUM_PARALLEL: '1' }, models: ['nomic-embed-text:latest'] });
 const r1 = await ensureOllama(none.deps);
 assert.deepEqual(r1.pulled, ['qwen3:8b', 'gemma3:4b']);

 const partial = fakeMachine({ registry: { OLLAMA_NUM_PARALLEL: '1' }, models: ['qwen3:8b'] });
 const r2 = await ensureOllama(partial.deps);
 assert.deepEqual(r2.pulled, [], 'çalışabilir model varken sormadan indirme yapılmaz');
 const r3 = await ensureOllama({ ...partial.deps, argv: ['--pull'] });
 assert.deepEqual(r3.pulled, ['gemma3:4b']);

 const off = fakeMachine({ registry: { OLLAMA_NUM_PARALLEL: '1' }, models: [], env: { TEMPO_AUTO_PULL: '0' } });
 assert.deepEqual((await ensureOllama(off.deps)).pulled, []);
});

test('uzak Ollama adresi ya da TEMPO_MANAGE_OLLAMA=0: hiçbir şeye dokunulmaz', async () => {
 const remote = fakeMachine({ registry: { OLLAMA_MAX_LOADED_MODELS: '1' }, env: { OLLAMA_BASE_URL: 'http://192.168.1.20:11434' } });
 const r1 = await ensureOllama(remote.deps);
 assert.equal(r1.managed, false);
 assert.equal(remote.state.commands.length, 0);

 const disabled = fakeMachine({ registry: { OLLAMA_MAX_LOADED_MODELS: '1' }, env: { TEMPO_MANAGE_OLLAMA: '0' } });
 const r2 = await ensureOllama(disabled.deps);
 assert.equal(r2.managed, false);
 assert.equal(disabled.state.commands.length, 0);
});
