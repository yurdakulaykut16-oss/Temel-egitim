import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FREE_VOICESTUDIO_CATALOG, VoiceStudioManager } from '../server/voice-studio.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));

test('VoiceStudioManager: 60+ ücretsiz ses, çoklu karakter kadrosu, tercih kaydı ve yerel 3900 köprüsü', async () => {
 assert.ok(FREE_VOICESTUDIO_CATALOG.length >= 60, `En az 60 ücretsiz ses olmalı, bulunan: ${FREE_VOICESTUDIO_CATALOG.length}`);
 const providers = new Set(FREE_VOICESTUDIO_CATALOG.map(v => v.provider));
 for (const p of ['voicestudio', 'speechify', 'openai', 'elevenlabs', 'local-dsp']) {
  assert.ok(providers.has(p), `Sağlayıcı eksik: ${p}`);
 }
 assert.ok(FREE_VOICESTUDIO_CATALOG.some(v => v.id === 'voicestudio:the_luxe'), 'The Luxe sesi dahil olmalı');
 assert.ok(FREE_VOICESTUDIO_CATALOG.some(v => v.id === 'voicestudio:ml_narrator'), 'VoiceStudio çok dilli Narrator dahil olmalı');

 const dir = await mkdtemp(join(tmpdir(), 'tempo-vs-test-'));
 let speechPayload = null;
 const fakeVS = http.createServer(async (req, res) => {
  if (req.url === '/health') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ status: 'ok', version: '0.1.0' }));
  }
  if (req.url === '/models') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ models: [{ id: 'k2-fsa/OmniVoice', downloaded: true }] }));
  }
  if (req.url === '/v1/audio/voices') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({
    voices: [{ voice_id: 'custom_kayseri_clone', name: 'Kayseri Klonu', type: 'profile', language: 'tr' }]
   }));
  }
  if (req.url?.startsWith('/archetypes')) {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({
    total: 2,
    items: [
     { id: 'the_librarian', name: 'The Librarian', instruct: 'female, middle-aged' },
     { id: 'arch_custom_1', name: 'Anatolian Coach', instruct: 'male, deep pitch', language: 'tr' }
    ]
   }));
  }
  if (req.method === 'POST' && req.url === '/v1/audio/speech') {
   let body = '';
   for await (const chunk of req) body += chunk;
   speechPayload = JSON.parse(body);
   res.setHeader('Content-Type', 'audio/mpeg');
   return res.end(Buffer.from('ID3-FAKE-MP3-AUDIO-DATA-0123456789'));
  }
  res.statusCode = 404;
  res.end();
 });

 const vsPort = await listen(fakeVS);
 try {
  const mgr = new VoiceStudioManager(dir, `http://127.0.0.1:${vsPort}`);
  const catalog = await mgr.getCatalog();
  assert.equal(catalog.ok, true);
  assert.equal(catalog.zeroApiRequired, true);
  assert.equal(catalog.localAvailable, true);
  assert.ok(catalog.voices.some(v => v.id === 'voicestudio:custom_kayseri_clone'), 'Yerel klon sesi kataloğa eklenmeli');
  assert.ok(catalog.voices.some(v => v.id === 'voicestudio:arch_custom_1'), 'Yerel arketip sesi kataloğa eklenmeli');

  const saved = await mgr.savePreferences({
   selectedVoiceId: 'openai:onyx',
   rate: 1.15,
   characterCast: { roach: 'voicestudio:junior_quacks', kayseri: 'voicestudio:captain_crusty' }
  });
  assert.equal(saved.selectedVoiceId, 'openai:onyx');
  assert.equal(saved.rate, 1.15);
  assert.equal(saved.characterCast.roach, 'voicestudio:junior_quacks');

  const reloaded = await mgr.loadPreferences();
  assert.equal(reloaded.selectedVoiceId, 'openai:onyx');

  const synth = await mgr.synthesizeViaLocalServer({
   text: 'Kayseri mantısı gibi net cevap!',
   voice: 'the_librarian',
   speed: 1.1,
   language: 'tr',
   instruct: 'female, middle-aged'
  });
  assert.equal(synth.ok, true);
  assert.ok(synth.buffer.toString().includes('ID3-FAKE-MP3'));
  assert.equal(speechPayload.voice, 'the_librarian');
  assert.equal(speechPayload.instruct, 'female, middle-aged');
 } finally {
  await close(fakeVS);
  await rm(dir, { recursive: true, force: true });
 }
});

test('Ollama :cloud video modelleri (kimi-k3.1-pro:cloud, glm-5.3-flash:cloud, deepseek-v4.1-flash:cloud) ve /voicestudio API uçları 0-API ile çalışır', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-vs-ollama-'));
 const pullCalls = [];
 const genModels = [];

 const fakeOllama = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') {
   return res.end(JSON.stringify({
    models: [
     { name: 'deepseek-v4.1-flash:cloud' },
     { name: 'glm-5.3-flash:cloud' },
     { name: 'kimi-k3.1-pro:cloud' }
    ]
   }));
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const data = JSON.parse(body || '{}');
  if (req.url === '/api/pull') {
   pullCalls.push(data.name);
   return res.end(JSON.stringify({ status: 'success' }));
  }
  if (req.url === '/api/generate') {
   genModels.push(data.model);
   return res.end(JSON.stringify({
    response: JSON.stringify({
     title: `Bulut Video (${data.model})`,
     summary: '0-API ile bulut modelin yazdığı eğlenceli 3D ders.',
     scenes: [
      {
       sceneTitle: 'Böcü Sahnesi',
       cameraMove: 'two_shot',
       boardTitle: 'Egzersiz Özeti',
       boardCode: 'P-T',
       boardBullets: ['Planlıdır', 'Tekrarlıdır'],
       dialogues: [
        { speaker: 'roach', emotion: 'cheerful', action: 'jump', text: 'Vızzz! Ben Böcü, planlı olmayı unuttum!' },
        { speaker: 'kayseri', emotion: 'warning', action: 'point_board', text: 'La otur yerine Böcü, egzersiz planlı ve tekrarlıdır!' }
       ],
       repeatPrompt: 'Planlı ve tekrarlı!',
       googleFlowPrompt: '3D classroom comedy scene with Kayseri coach and cockroach'
      }
     ]
    }),
    eval_count: 140,
    eval_duration: 500_000_000
   }));
  }
  res.statusCode = 404;
  res.end();
 });

 const fakeVS = http.createServer(async (req, res) => {
  if (req.url === '/health') {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ status: 'ok' }));
  }
  if (req.url === '/v1/audio/voices' || req.url === '/models' || req.url?.startsWith('/archetypes')) {
   res.setHeader('Content-Type', 'application/json');
   return res.end(JSON.stringify({ voices: [], models: [], items: [] }));
  }
  if (req.method === 'POST' && req.url === '/v1/audio/speech') {
   res.setHeader('Content-Type', 'audio/mpeg');
   return res.end(Buffer.from('ID3-VS-STREAM'));
  }
  res.statusCode = 404;
  res.end();
 });

 const [ollamaPort, vsPort] = await Promise.all([listen(fakeOllama), listen(fakeVS)]);
 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${ollamaPort}`;
 process.env.VOICESTUDIO_BASE_URL = `http://127.0.0.1:${vsPort}`;
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';

 const { ollamaPlugin } = await import(`../server/ollama.mjs?v=${Date.now()}`);
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const appPort = await listen(app);
 const base = `http://127.0.0.1:${appPort}`;

 try {
  // 1) Status Kimi K3.1 Pro (:cloud) modelini videoModel olarak otomatik seçmeli + VoiceStudio özeti dönmeli
  const statusRes = await fetch(`${base}/api/ollama/status`);
  assert.equal(statusRes.status, 200);
  const status = await statusRes.json();
  assert.equal(status.videoModel, 'kimi-k3.1-pro:cloud');
  assert.equal(status.videoModelInstalled, true);
  assert.equal(status.zeroApiRequired, true);
  assert.equal(status.cloudVideoModels.length, 3);
  assert.ok(status.cloudVideoModels.every(m => m.installed === true));
  assert.ok(status.voiceStudio.totalFreeVoices >= 60);

  // 2) VoiceStudio API uçları
  const cat = await (await fetch(`${base}/api/ollama/voicestudio/catalog`)).json();
  assert.equal(cat.ok, true);
  assert.ok(cat.voices.length >= 60);

  const prefRes = await fetch(`${base}/api/ollama/voicestudio/preferences`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ selectedVoiceId: 'elevenlabs:adam', rate: 1.05 })
  });
  assert.equal(prefRes.status, 200);

  const spRes = await fetch(`${base}/api/ollama/voicestudio/speech`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ text: 'Merhaba şampiyon', voice: 'the_teacher' })
  });
  assert.equal(spRes.status, 200);
  assert.match(spRes.headers.get('content-type') || '', /audio\/mpeg/);

  // 3) Video modelini glm-5.3-flash:cloud yap ve prompt yazmadan (customIdea boş) otomatik video üret
  const selRes = await fetch(`${base}/api/ollama/select-model`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ model: 'glm-5.3-flash:cloud', role: 'video' })
  });
  assert.equal(selRes.status, 200);

  const vidRes = await fetch(`${base}/api/ollama/videos/generate`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ unitId: '0-0', themeStyle: 'hamam_bocegi_komedi', instantTurbo: false })
  });
  assert.equal(vidRes.status, 200);
  const vidData = await vidRes.json();
  assert.equal(vidData.ok, true);
  assert.equal(vidData.video.source, 'ai-3d:glm-5.3-flash:cloud');
  assert.equal(vidData.hasMp4, true);
  assert.ok(genModels.includes('glm-5.3-flash:cloud'));

  // 4) 0-API tek tıkla bulut model pull ucu
  const pullRes = await fetch(`${base}/api/ollama/videos/pull-model`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ model: 'deepseek-v4.1-flash:cloud' })
  });
  assert.equal(pullRes.status, 200);
  assert.ok(pullCalls.includes('deepseek-v4.1-flash:cloud'));

  // 5) Videoları sadece Kimi ve Ollama modelleriyle üretme politikası (Google Veo, Sora, Runway, Kling, ComfyUI vb. reddedilir)
  assert.equal(status.videoPolicy, 'kimi-ollama-only');
  assert.deepEqual(status.allowedVideoProviders, ['kimi', 'ollama']);
  assert.equal(vidData.videoPolicy, 'kimi-ollama-only');

  const kimiVid = await (await fetch(`${base}/api/ollama/videos/generate`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ unitId: '0-1', model: 'kimi-k3.1-pro:cloud', themeStyle: 'tiktok_kayseri', instantTurbo: false })
  })).json();
  assert.equal(kimiVid.ok, true);
  assert.equal(kimiVid.localExecutionOnly, true);
  assert.equal(kimiVid.noApiKeyPrompts, true);
  assert.equal(kimiVid.generatorProvider, 'kimi');
  assert.equal(kimiVid.video.source, 'ai-3d:kimi-k3.1-pro:cloud');

  // Kimi API anahtarı olmadan yerel kimi-k2.5 veya Ollama modeli de sıfır anahtar ile doğrudan seçilip video üretmeli
  const kimiLocalSel = await fetch(`${base}/api/ollama/select-model`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ role: 'video', model: 'kimi-k2.5:local' })
  });
  assert.ok([200, 400].includes(kimiLocalSel.status));
  const kimiLocalVid = await (await fetch(`${base}/api/ollama/videos/generate`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json', Origin: base },
   body: JSON.stringify({ unitId: '0-2', model: 'kimi-k2.5:local', themeStyle: 'tiktok_kayseri', subSecond: true })
  })).json();
  assert.equal(kimiLocalVid.ok, true);
  assert.equal(kimiLocalVid.localExecutionOnly, true);
  assert.equal(kimiLocalVid.noApiKeyPrompts, true);
  assert.equal(kimiLocalVid.generatorProvider, 'kimi');

  for (const disallowed of ['veo-2.0-generate-001', 'sora-2', 'runway-gen3', 'kling-v2', 'comfyui-wan22', 'gpt-4o']) {
   const badGen = await fetch(`${base}/api/ollama/videos/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ unitId: '0-0', model: disallowed })
   });
   assert.equal(badGen.status, 400, `${disallowed} video üretiminde reddedilmeli`);

   const badSel = await fetch(`${base}/api/ollama/select-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ role: 'video', model: disallowed })
   });
   assert.equal(badSel.status, 400, `${disallowed} video rolüne atanamamalı`);

   const badPull = await fetch(`${base}/api/ollama/videos/pull-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ model: disallowed })
   });
   assert.equal(badPull.status, 400, `${disallowed} video modeli indirilememeli`);
  }
 } finally {
  await close(app);
  await close(fakeOllama);
  await close(fakeVS);
  await rm(dir, { recursive: true, force: true });
 }
});
