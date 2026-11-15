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

test('Ollama 0-API yerel yürütme durumu ve /voicestudio API uçları (katalog, tercih, ses) sorunsuz çalışır', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-vs-ollama-'));

 const fakeOllama = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') {
   return res.end(JSON.stringify({
    models: [
     { name: 'deepseek-v4.1-flash:cloud' },
     { name: 'glm-5.3-flash:cloud' },
     { name: 'qwen3:14b' }
    ]
   }));
  }
  if (req.url === '/api/generate') {
   return res.end(JSON.stringify({ response: 'Tamam', eval_count: 140, eval_duration: 500_000_000 }));
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
  // 1) Status 0-API yerel yürütme bayraklarını ve VoiceStudio özetini dönmeli
  const statusRes = await fetch(`${base}/api/ollama/status`);
  assert.equal(statusRes.status, 200);
  const status = await statusRes.json();
  assert.equal(status.zeroApiRequired, true);
  assert.equal(status.localExecutionOnly, true);
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

 } finally {
  await close(app);
  await close(fakeOllama);
  await close(fakeVS);
  await rm(dir, { recursive: true, force: true });
 }
});
