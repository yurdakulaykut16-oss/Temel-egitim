import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalVideoEngineHub, GITHUB_LOCAL_VIDEO_ENGINES } from '../server/local-video-engines.mjs';
import { Mp4Renderer } from '../server/mp4-renderer.mjs';
import { VideoDirector } from '../server/video-director.mjs';

const FAKE_MP4 = Buffer.concat([Buffer.from('00000018667479706d703432', 'hex'), Buffer.alloc(2048, 0x2a)]);

test('LocalVideoEngineHub: ComfyUI/Wan2.2, Short-Video-Maker, MoneyPrinterTurbo ve yerleşik Tempo Cinema AI Pro yerel video dispatch', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-local-video-'));
 const prevComfy = process.env.COMFYUI_BASE_URL;
 const prevSvm = process.env.SHORT_VIDEO_MAKER_URL;
 const prevMpt = process.env.MONEYPRINTER_URL;

 // 1) Mock ComfyUI + Wan2.2 yerel sunucusu
 const mockComfy = http.createServer((req, res) => {
  if (req.url === '/system_stats') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ system: { os: 'posix' }, devices: [{ name: 'Mock GPU' }] }));
  }
  if (req.url === '/object_info') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ WanImageToVideo: {}, CheckpointLoaderSimple: {}, SaveVideo: {} }));
  }
  if (req.method === 'POST' && req.url === '/prompt') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ prompt_id: 'wan-job-1' }));
  }
  if (req.url === '/history/wan-job-1') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({
    'wan-job-1': { outputs: { '7': { videos: [{ filename: 'wan22_out.mp4', subfolder: '', type: 'output' }] } } }
   }));
  }
  if (req.url?.startsWith('/view')) {
   res.setHeader('Content-Type', 'video/mp4');
   return res.end(FAKE_MP4);
  }
  res.statusCode = 404;
  res.end('not found');
 });

 // 2) Mock gyoridavid/short-video-maker (MIT) yerel sunucusu
 const mockSvm = http.createServer((req, res) => {
  if (req.url === '/health') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ status: 'ok' }));
  }
  if (req.method === 'POST' && req.url === '/api/short-video') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ videoId: 'svm-42' }));
  }
  if (req.url === '/api/short-video/svm-42/status') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ status: 'ready' }));
  }
  if (req.url === '/api/short-video/svm-42') {
   res.setHeader('Content-Type', 'video/mp4');
   return res.end(FAKE_MP4);
  }
  res.statusCode = 404;
  res.end('not found');
 });

 // 3) Mock harry0703/MoneyPrinterTurbo (MIT) yerel sunucusu
 let mptHostUrl = '';
 const mockMpt = http.createServer((req, res) => {
  if (req.url === '/ping') {
   res.setHeader('Content-Type', 'text/plain');
   return res.end('pong');
  }
  if (req.method === 'POST' && req.url === '/api/v1/videos') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ data: { task_id: 'mpt-77' } }));
  }
  if (req.url === '/api/v1/tasks/mpt-77') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ data: { videos: [`${mptHostUrl}/download/mpt77.mp4`] } }));
  }
  if (req.url === '/download/mpt77.mp4') {
   res.setHeader('Content-Type', 'video/mp4');
   return res.end(FAKE_MP4);
  }
  res.statusCode = 404;
  res.end('not found');
 });

 await Promise.all([
  new Promise(r => mockComfy.listen(0, '127.0.0.1', r)),
  new Promise(r => mockSvm.listen(0, '127.0.0.1', r)),
  new Promise(r => mockMpt.listen(0, '127.0.0.1', r))
 ]);

 process.env.COMFYUI_BASE_URL = `http://127.0.0.1:${mockComfy.address().port}`;
 process.env.SHORT_VIDEO_MAKER_URL = `http://127.0.0.1:${mockSvm.address().port}`;
 mptHostUrl = `http://127.0.0.1:${mockMpt.address().port}`;
 process.env.MONEYPRINTER_URL = mptHostUrl;

 try {
  assert.ok(GITHUB_LOCAL_VIDEO_ENGINES.length >= 8);
  const mp4Renderer = new Mp4Renderer();
  const vd = new VideoDirector(dir);
  const hub = new LocalVideoEngineHub(dir, { mp4Renderer });

  const detection = await hub.detectLocalEngines();
  assert.equal(detection.ok, true);
  assert.equal(detection.zeroApiRequired, true);
  assert.ok(detection.liveEnginesCount >= 4, `En az 4 canlı yerel motor bekleniyordu, gelen: ${detection.liveEnginesCount}`);
  assert.equal(detection.engines.find(e => e.id === 'comfyui-wan22')?.available, true);
  assert.equal(detection.engines.find(e => e.id === 'short-video-maker')?.available, true);
  assert.equal(detection.engines.find(e => e.id === 'moneyprinter-turbo')?.available, true);
  assert.equal(detection.engines.find(e => e.id === 'tempo-cinema-pro')?.available, true);

  const sampleVideo = vd.buildFallbackVideo(
   { id: '0-0', book: 'Antrenman', unit: 'Kuvvet Antrenmanı', text: 'Kuvvet kasların dış dirence karşı koyabilme yeteneğidir.' },
   [], {}, null, null, 'morpa_klasik'
  );

  // ComfyUI Wan2.2 render dispatch doğrulaması
  const comfyOut = join(dir, 'comfy_out.mp4');
  const comfyRes = await hub.dispatchLocalRender({ engineId: 'comfyui-wan22', video: sampleVideo, outMp4Path: comfyOut });
  assert.equal(comfyRes.engineId, 'comfyui-wan22');
  assert.equal(comfyRes.externalNeural, true);
  assert.ok(readFileSync(comfyOut).includes(Buffer.from('ftyp')));

  // Short-Video-Maker render dispatch doğrulaması
  const svmOut = join(dir, 'svm_out.mp4');
  const svmRes = await hub.dispatchLocalRender({ engineId: 'short-video-maker', video: sampleVideo, outMp4Path: svmOut });
  assert.equal(svmRes.engineId, 'short-video-maker');
  assert.ok(readFileSync(svmOut).includes(Buffer.from('ftyp')));

  // MoneyPrinterTurbo render dispatch doğrulaması
  const mptOut = join(dir, 'mpt_out.mp4');
  const mptRes = await hub.dispatchLocalRender({ engineId: 'moneyprinter-turbo', video: sampleVideo, outMp4Path: mptOut });
  assert.equal(mptRes.engineId, 'moneyprinter-turbo');
  assert.ok(readFileSync(mptOut).includes(Buffer.from('ftyp')));

  // Yerleşik Tempo Cinema AI Pro fallback + gerçek FFmpeg MP4 derleme doğrulaması
  const builtinOut = join(dir, 'builtin_out.mp4');
  const builtinRes = await hub.dispatchLocalRender({ engineId: 'tempo-cinema-pro', video: sampleVideo, outMp4Path: builtinOut, speedProfile: 'turbo' });
  assert.equal(builtinRes.engineId, 'tempo-cinema-pro');
  assert.ok(builtinRes.bytes > 1000);
  assert.ok(readFileSync(builtinOut).includes(Buffer.from('ftyp')));

  // Otomatik (auto) modda dahi harici 3. parti video motorlarına değil, Kimi+Ollama senaryosunu işleyen yerleşik MP4 derleyiciye gider
  assert.equal(detection.kimiOllamaOnly, true);
  assert.equal(detection.preferredEngineId, 'tempo-cinema-pro');
  const autoOut = join(dir, 'auto_out.mp4');
  const autoRes = await hub.dispatchLocalRender({ engineId: 'auto', video: sampleVideo, outMp4Path: autoOut, speedProfile: 'turbo' });
  assert.equal(autoRes.engineId, 'tempo-cinema-pro');
 } finally {
  mockComfy.closeAllConnections?.();
  mockComfy.close();
  mockSvm.closeAllConnections?.();
  mockSvm.close();
  mockMpt.closeAllConnections?.();
  mockMpt.close();
  if (prevComfy === undefined) delete process.env.COMFYUI_BASE_URL; else process.env.COMFYUI_BASE_URL = prevComfy;
  if (prevSvm === undefined) delete process.env.SHORT_VIDEO_MAKER_URL; else process.env.SHORT_VIDEO_MAKER_URL = prevSvm;
  if (prevMpt === undefined) delete process.env.MONEYPRINTER_URL; else process.env.MONEYPRINTER_URL = prevMpt;
  rmSync(dir, { recursive: true, force: true });
 }
});

test('ollamaPlugin yerel GitHub AI video üretici HTTP uç noktaları (/videos/local-engines*)', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-local-video-srv-'));
 const prevDataDir = process.env.TEMPO_DATA_DIR;
 const prevDisableAuto = process.env.TEMPO_DISABLE_AUTOLOOP;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 writeFileSync(join(dir, 'settings.json'), JSON.stringify({ model: 'qwen3:14b', autoRunning: false }));

 try {
  const { ollamaPlugin } = await import(`../server/ollama.mjs?localvid=${Date.now()}`);
  let middleware;
  ollamaPlugin().configureServer({ middlewares: { use: (_p, fn) => { middleware = fn; } } });

  const call = (method, urlPath, bodyObj) => new Promise((resolve, reject) => {
   const req = new http.IncomingMessage(null);
   req.method = method;
   req.url = urlPath;
   req.headers = { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' };
   const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(txt) { resolve({ status: this.statusCode, json: txt ? JSON.parse(txt) : null }); }
   };
   middleware(req, res, err => reject(err || new Error('next called')));
   if (bodyObj !== undefined) req.push(JSON.stringify(bodyObj));
   req.push(null);
  });

  const listRes = await call('GET', '/videos/local-engines');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.json.zeroApiRequired, true);
  assert.ok(listRes.json.engines.some(e => e.id === 'tempo-cinema-pro' && e.available));
  assert.ok(listRes.json.engines.some(e => e.id === 'comfyui-wan22'));
  assert.ok(listRes.json.engines.some(e => e.id === 'ltx2-local'));
  assert.ok(listRes.json.engines.some(e => e.id === 'short-video-maker'));

  const selRes = await call('POST', '/videos/local-engines/select', { engineId: 'tempo-cinema-pro' });
  assert.equal(selRes.status, 200);
  assert.equal(selRes.json.preferredEngineId, 'tempo-cinema-pro');

  const badSel = await call('POST', '/videos/local-engines/select', { engineId: 'invalid-engine' });
  assert.equal(badSel.status, 400);

  const renderRes = await call('POST', '/videos/local-engines/render', {
   unitId: '0-0',
   engineId: 'tempo-cinema-pro',
   speedProfile: 'turbo'
  });
  assert.equal(renderRes.status, 200, JSON.stringify(renderRes.json));
  assert.equal(renderRes.json.ok, true);
  assert.equal(renderRes.json.engineId, 'tempo-cinema-pro');
  assert.ok(renderRes.json.bytes > 1000);

  // TikTok akışındaki videolar da seçili yerel 0-API AI video oluşturucu modeli + motoru ile üretilmeli!
  const mockSvmServer = http.createServer((req, res) => {
   if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ status: 'ok' })); }
   if (req.method === 'POST' && req.url === '/api/short-video') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ videoId: 'tiktok-svm-1' })); }
   if (req.url === '/api/short-video/tiktok-svm-1/status') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ status: 'ready' })); }
   if (req.url === '/api/short-video/tiktok-svm-1') { res.setHeader('Content-Type', 'video/mp4'); return res.end(FAKE_MP4); }
   res.statusCode = 404; res.end('not found');
  });
  await new Promise(r => mockSvmServer.listen(0, '127.0.0.1', r));
  const prevSvmUrl = process.env.SHORT_VIDEO_MAKER_URL;
  process.env.SHORT_VIDEO_MAKER_URL = `http://127.0.0.1:${mockSvmServer.address().port}`;
  try {
   const selSvm = await call('POST', '/videos/local-engines/select', { engineId: 'short-video-maker' });
   assert.equal(selSvm.status, 200);
   assert.equal(selSvm.json.preferredEngineId, 'short-video-maker');

   const fillTikTok = await call('POST', '/videos/fill-all', { count: 2, model: 'kimi-k2.5:local' });
   assert.equal(fillTikTok.status, 200, JSON.stringify(fillTikTok.json));
   assert.equal(fillTikTok.json.filled, 2);
   assert.equal(fillTikTok.json.zeroApiRequired, true);
   assert.equal(fillTikTok.json.localExecutionOnly, true);
   assert.equal(fillTikTok.json.noApiKeyPrompts, true);
   assert.equal(fillTikTok.json.aiVideoModel, 'kimi-k2.5:local');
   assert.equal(fillTikTok.json.aiVideoEngine, 'short-video-maker');

   const feedAfter = await call('GET', '/videos/feed?limit=10');
   assert.equal(feedAfter.status, 200);
   assert.equal(feedAfter.json.activeVideoModel, 'kimi-k2.5:local');
   assert.equal(feedAfter.json.activeVideoEngine, 'short-video-maker');
   assert.ok(feedAfter.json.items.some(it => it.aiVideoModel === 'kimi-k2.5:local' && it.aiVideoEngine === 'short-video-maker' && it.zeroApi === true));
  } finally {
   mockSvmServer.closeAllConnections?.();
   mockSvmServer.close();
   if (prevSvmUrl === undefined) delete process.env.SHORT_VIDEO_MAKER_URL; else process.env.SHORT_VIDEO_MAKER_URL = prevSvmUrl;
  }
 } finally {
  if (prevDataDir === undefined) delete process.env.TEMPO_DATA_DIR; else process.env.TEMPO_DATA_DIR = prevDataDir;
  if (prevDisableAuto === undefined) delete process.env.TEMPO_DISABLE_AUTOLOOP; else process.env.TEMPO_DISABLE_AUTOLOOP = prevDisableAuto;
  rmSync(dir, { recursive: true, force: true });
 }
});
