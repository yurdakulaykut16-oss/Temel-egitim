import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalAiTeamHub, LOCAL_TEAM_ROLES } from '../server/local-ai-team.mjs';
import { HardwareTeamOptimizer } from '../server/hardware-optimizer.mjs';
import { SandboxEvolver } from '../server/sandbox-evolver.mjs';
import { ApexArchitect } from '../server/apex-architect.mjs';
import { JarvisCore } from '../server/jarvis-core.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));

test('LocalAiTeamHub: 5 yerel 0-API ajan milisaniyede paralel çalışır ve ÖSYM psikometri puanlaması yapar', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-local-team-'));
 try {
  const hub = new LocalAiTeamHub(dir);
  const evolver = new SandboxEvolver(dir);
  const apex = new ApexArchitect(dir);
  const jarvis = new JarvisCore(dir, process.cwd());
  const policy = await evolver.loadPolicy();

  // 1) Gerçek ÖSYM I-II-III öncüllü vaka sorusu yüksek puan almalı, sığ/ipuçlu soru düşük puan almalı
  const osymGood = {
   id: 'osym-1', unitId: '0-0', status: 'approved',
   question: 'Bir antrenör dayanıklılık gelişimini değerlendirirken: I. VO2max artışı, II. Laktat eşiğinin yükselmesi, III. İstirahat nabzının artması durumlarından hangilerinin oluşmasını bekler?',
   options: ['Yalnız I', 'I ve II', 'II ve III', 'I, II ve III'],
   answer: 'I ve II',
   explanation: 'Düzenli aerobik antrenman VO2max ve laktat eşiğini artırırken istirahat nabzını düşürür.',
   evidence: 'Aerobik antrenman kalp atım hacmini ve VO2max değerini artırır.'
  };
  const weakTrivia = {
   id: 'weak-1', unitId: '0-0', status: 'approved',
   question: 'VO2max nedir?',
   options: ['A', 'B', 'Maksimal oksijen tüketim kapasitesinin en uzun ve en detaylı bilimsel açıklamasıdır', 'D'],
   answer: 'Maksimal oksijen tüketim kapasitesinin en uzun ve en detaylı bilimsel açıklamasıdır',
   explanation: 'ok',
   evidence: 'kısa'
  };

  const goodRes = hub.scoreOsymQuestion(osymGood);
  const badRes = hub.scoreOsymQuestion(weakTrivia);
  assert.equal(goodRes.isOsymElite, true);
  assert.ok(goodRes.score >= 85);
  assert.equal(badRes.isOsymElite, false);
  assert.ok(badRes.score < 60);

  // 2) Tüm 5 ajanlı paralel takım turu milisaniyeler içinde (< 50 ms) tamamlanmalı
  const cycle = await hub.runFastTeamCycle({
   items: [osymGood],
   contexts: [{ id: '0-0', book: 'Hareket', unit: 'Dayanıklılık', text: 'Aerobik ve anaerobik dayanıklılık antrenmanlarında süperkompansasyon ve VO2max kritiktir.' }],
   evolver,
   policy,
   installedModels: ['qwen3:14b', 'qwen2.5-coder:14b', 'tempo-osym-uzmani:latest'],
   apex,
   jarvis
  });
  assert.equal(cycle.ok, true);
  assert.ok(cycle.durationMs < 50, `Takım turu milisaniyelerde bitmeliydi; ${cycle.durationMs}ms sürdü`);
  assert.equal(LOCAL_TEAM_ROLES.length, 5);
  assert.equal(cycle.osymAudit.avgScore, goodRes.score);
  assert.ok(cycle.state.localOllamaSpecialistsInstalled.includes('tempo-osym-uzmani:latest'));

  const promptBlock = hub.getOsymCommitteePromptBlock(cycle.state, '0-0');
  assert.match(promptBlock, /ÖSYM SORU KOMİSYONU/);
  assert.match(promptBlock, /ÖSYM ÇELDİRİCİ KAVRAM TUZAKLARI/);
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
});

test('Proje açılışı (sıfır tıklama): 100-yöntem yarışı, GitHub prototip & 8 yerel uzman model + ÖSYM prompt otomatik başlar', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-autostart-'));
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 const prevDisable = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_OFFLINE_ONLY = '1';
 delete process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;

 const createdModels = [];
 const genPrompts = [];
 const fakeOllama = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') {
   return res.end(JSON.stringify({
    models: [
     { name: 'qwen3:14b' },
     { name: 'gemma3:12b' },
     { name: 'qwen2.5-coder:14b' },
     ...createdModels.map(name => ({ name }))
    ]
   }));
  }
  let raw = '';
  for await (const ch of req) raw += ch;
  const data = JSON.parse(raw || '{}');
  if (req.url === '/api/create') {
   createdModels.push(data.model);
   return res.end(JSON.stringify({ status: 'success' }));
  }
  if (req.url === '/api/generate') {
   genPrompts.push(data.prompt || '');
   if (String(data.prompt || '').includes('soru denetçisi')) {
    return res.end(JSON.stringify({
     response: JSON.stringify({
      answer: 'Egzersiz planlıdır', singleCorrect: true, dualAnswerRisk: false, secondBestOption: '',
      supported: true, qualityOk: true, qualityScore: 5, examPotential: 5, difficulty: 'orta',
      evidence: 'Egzersiz planlı ve tekrarlıdır', reason: 'ÖSYM ölçütüne tam uygun.'
     })
    }));
   }
   return res.end(JSON.stringify({
    response: JSON.stringify({
     question: 'Egzersiz ile fiziksel aktivite karşılaştırıldığında hangisi doğrudur?',
     options: ['Egzersiz planlıdır', 'Aktivite sadece uykudur', 'Egzersiz plansızdır', 'Fark yoktur'],
     answer: 'Egzersiz planlıdır',
     explanation: 'Egzersiz planlı, programlı ve tekrarlı hareket biçimidir.',
     evidence: 'Egzersiz planlı ve tekrarlıdır',
     topic: 'Temel Kavramlar'
    })
   }));
  }
  return res.end('{}');
 });

 const fakePort = await listen(fakeOllama);
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
 process.env.OLLAMA_MODEL = 'qwen3:14b';
 process.env.OLLAMA_VERIFIER_MODEL = 'gemma3:12b';
 process.env.OLLAMA_JUDGE2_MODEL = 'gemma3:12b';

 const { ollamaPlugin, stopOllamaLoops } = await import(`../server/ollama.mjs?autoboot=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;

 try {
  // Hiçbir düğmeye basmadan sadece /status ve /local-team polling ile boot işlemlerinin kendi kendine tamamlandığını doğrula
  let st = null;
  for (let i = 0; i < 120; i++) {
   const r = await fetch(`${base}/api/ollama/status`);
   st = await r.json();
   if ((st.localAiTeam?.cyclesCompleted || 0) >= 1 && (st.qwenCodeLab?.tournamentsRun || 0) >= 1 && (st.qwenCodeLab?.prototypesPromotedToProject || 0) >= 1) {
    break;
   }
   await new Promise(r => setTimeout(r, 100));
  }

  assert.ok(st?.localAiTeam, `status yanıtı eksik/hatalı: ${JSON.stringify(st)}`);
  assert.ok(st.localAiTeam.cyclesCompleted >= 1, '0-API yerel takım boot anında otomatik başlamalıydı');
  assert.ok(st.localAiTeam.lastCycleDurationMs < 200, 'Yerel takım döngüsü milisaniyelerde bitmeliydi');
  assert.ok(st.qwenCodeLab.tournamentsRun >= 1, '100-yöntem yarışı düğmeye basılmadan otomatik başlamalıydı');
  assert.equal(st.qwenCodeLab.totalMethodsBenchmarked >= 100, true);
  assert.ok(st.qwenCodeLab.prototypesPromotedToProject >= 1, 'GitHub prototip testi düğmeye basılmadan otomatik başlamalıydı');

  // Arka planda 8 yerel uzman modelin tamamı 0-API ile oluşturulmuş veya hazır olmalı
  const assignRes = await fetch(`${base}/api/ollama/auto-assign-roles`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ createSpecialists: true })
  });
  assert.equal(assignRes.status, 200);
  assert.ok(createdModels.includes('tempo-osym-uzmani:latest'), 'ÖSYM uzmanı yerel modeli kurulmalıydı');
  assert.ok(createdModels.includes('tempo-celdirici-muhendisi:latest'), 'Çeldirici mühendisi yerel modeli kurulmalıydı');
  assert.ok(createdModels.includes('tempo-kod-optimizasyon:latest'), 'Kod optimizasyon yerel modeli kurulmalıydı');
  assert.ok(createdModels.includes('tempo-psikometri-denetci:latest'), 'Psikometri denetçi yerel modeli kurulmalıydı');

  // Üretici soru promptuna ÖSYM komisyonu perspektifinin enjekte edildiğini doğrula
  await fetch(`${base}/api/ollama/generate`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ units: ['0-0'] })
  });
  assert.ok(genPrompts.some(p => p.includes('ÖSYM') && p.includes('ÖSYM SORU KOMİSYONU')), 'Üretici promptuna ÖSYM Komisyonu yazım protokolü enjekte edilmeliydi');

  const teamJson = await (await fetch(`${base}/api/ollama/local-team`)).json();
  assert.equal(teamJson.ok, true);
  assert.equal(teamJson.summary.activeTeamMembersCount, 5);

  // Manuel düğmelerin kaldırıldığını ve UI'nin sıfır tıklama otomatik duruma geçtiğini doğrula
  const { readFile } = await import('node:fs/promises');
  const uiCode = await readFile(new URL('../src/OllamaStudio.tsx', import.meta.url), 'utf8');
  assert.equal(uiCode.includes('🏆 Qwen Code: 100 Yöntem Dene'), false, 'Manuel 100-yöntem düğmesi kaldırılmış olmalı');
  assert.equal(uiCode.includes('🧪 Web + GitHub Tarzı Prototip Yap'), false, 'Manuel GitHub prototip düğmesi kaldırılmış olmalı');
  assert.equal(uiCode.includes('localAiTeam'), true, 'UI 0-API yerel takım hızını ve ÖSYM puanını göstermeli');

  // Tüm takım (localAiTeam + 100-yöntem turnuvası + MultiAiSwarmEvaluator) tek çağrıda <1sn içinde paralel çalışmalı!
  const sprintRes = await fetch(`${base}/api/ollama/team-sprint`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: '{}'
  });
  assert.equal(sprintRes.status, 200);
  const sprint = await sprintRes.json();
  assert.equal(sprint.ok, true);
  assert.equal(sprint.withinOneSecond, true, `Birleşik takım sprinti <1sn (1000ms) olmalıydı; ${sprint.totalDurationMs}ms sürdü`);
  assert.ok(sprint.totalDurationMs < 1000);
 } finally {
  stopOllamaLoops();
  // Arka plan döngülerini durdur & temizle
  await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } }).catch(() => {});
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY;
  else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  if (prevDisable === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP;
  else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisable;
  await new Promise(r => setTimeout(r, 250));
  app.closeAllConnections?.();
  fakeOllama.closeAllConnections?.();
  await close(app);
  await close(fakeOllama);
  await rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 }).catch(() => {});
 }
});

test('HardwareTeamOptimizer: RTX 3080 Ti (12GB/16GB VRAM) + 16GB RAM için <1sn VRAM-sabit model seçer, indirir ve ısıtır', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-3080ti-'));
 const prevOffline = process.env.TEMPO_OFFLINE_ONLY;
 delete process.env.TEMPO_OFFLINE_ONLY;

 const pulled = [];
 const warmed = [];
 const fakeGpuOllama = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') {
   return res.end(JSON.stringify({ models: pulled.map(name => ({ name })) }));
  }
  if (req.url === '/api/ps') {
   return res.end(JSON.stringify({
    models: pulled.map(name => ({ name, size: 4_000_000_000, size_vram: 4_000_000_000 }))
   }));
  }
  let raw = '';
  for await (const ch of req) raw += ch;
  const data = JSON.parse(raw || '{}');
  if (req.url === '/api/pull') {
   pulled.push(data.model);
   res.write(`${JSON.stringify({ status: 'downloading', total: 100, completed: 50 })}\n`);
   res.end(`${JSON.stringify({ status: 'success', total: 100, completed: 100 })}\n`);
   return;
  }
  if (req.url === '/api/generate') {
   warmed.push({ model: data.model, keep_alive: data.keep_alive, options: data.options });
   return res.end(JSON.stringify({ response: '{}' }));
  }
  res.end('{}');
 });

 const fakePort = await listen(fakeGpuOllama);
 const ollamaUrl = `http://127.0.0.1:${fakePort}`;

 try {
  // 1) Masaüstü RTX 3080 Ti (12 GB VRAM)
  const hw12 = new HardwareTeamOptimizer(dir, {
   execFn: async () => ({ stdout: 'NVIDIA GeForce RTX 3080 Ti, 12288, 11800\n' })
  });
  const sum12 = await hw12.getSummary({ ollamaBaseUrl: ollamaUrl, installedModels: [] });
  assert.equal(sum12.hardware.gpu.is3080Ti, true);
  assert.equal(sum12.activeProfile.primaryModel, 'qwen3:8b');
  assert.equal(sum12.activeProfile.judgeModel, 'gemma3:4b');
  assert.equal(sum12.activeProfile.coderModel, 'qwen2.5-coder:3b');
  assert.ok(sum12.activeProfile.estimatedVramGb <= 11.0, '12 GB 3080 Ti VRAM sınırına takassız sığmalı');

  // 2) Dizüstü RTX 3080 Ti (16 GB VRAM) -> otomatik qwen2.5-coder:7b yükseltmesi
  const hw16 = new HardwareTeamOptimizer(dir, {
   execFn: async () => ({ stdout: 'NVIDIA GeForce RTX 3080 Ti Laptop GPU, 16384, 15900\n' })
  });
  const sum16 = await hw16.getSummary({ ollamaBaseUrl: ollamaUrl, installedModels: [] });
  assert.equal(sum16.activeProfile.coderModel, 'qwen2.5-coder:7b');
  assert.equal(sum16.activeProfile.estimatedVramGb, 13.0);

  // 3) Eksik modellerin otomatik indirilmesi & VRAM kilitlemesi (keep_alive: -1, num_gpu: 99, low_vram: false)
  const pullRes = await hw12.pullMissingProfileModels({ ollamaBaseUrl: ollamaUrl, installedModels: [] });
  assert.equal(pullRes.ok, true);
  assert.deepEqual(pulled, ['qwen3:8b', 'gemma3:4b', 'qwen2.5-coder:3b']);

  const warmRes = await hw12.warmupTeamModelsInVram({ ollamaBaseUrl: ollamaUrl, installedModels: pulled, profile: sum12.activeProfile });
  assert.equal(warmRes.warmed.length, 3);
  assert.ok(warmed.every(w => w.keep_alive === -1 && w.options.num_gpu === 99 && w.options.low_vram === false));

  const runtimeOpts = hw12.buildRuntimeOptions(sum12.activeProfile, { num_ctx: 12288, num_predict: 900 }, { role: 'judge', isSprint: true });
  assert.ok(runtimeOpts.num_ctx <= 2560, '<1sn modda KV cache taşmaması için num_ctx sınırlandırılmalı');
  assert.ok(runtimeOpts.num_predict <= 140);

  const psStatus = await hw12.getLoadedVramStatus(ollamaUrl);
  assert.equal(psStatus.cpuOffloadDetected, false);
  assert.equal(psStatus.loaded.length, 3);
 } finally {
  if (prevOffline === undefined) delete process.env.TEMPO_OFFLINE_ONLY;
  else process.env.TEMPO_OFFLINE_ONLY = prevOffline;
  fakeGpuOllama.closeAllConnections?.();
  await close(fakeGpuOllama);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
 }
});
