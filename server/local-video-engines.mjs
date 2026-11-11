import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rename, mkdtemp, rm, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

export const GITHUB_LOCAL_VIDEO_ENGINES = [
 {
  id: 'tempo-3d-cinema-engine',
  name: 'Tempo 3D Perspektif & İskelet Motoru (Yerleşik 3D)',
  repo: 'yurdakulaykut16-oss/Temel-egitim',
  license: 'MIT',
  stars: 'Yerleşik 3D',
  category: 'Gerçek 3D Kamera Matrisi + Z-Sıralı Hologram + İskelet + FFmpeg',
  defaultUrl: 'local://3d-engine',
  gpuRequired: false,
  zeroApi: true,
  alwaysReady: true,
  description: 'Gerçek 3D perspektif kamera projeksiyonu, Z-sıralı poligon hologramlar, eklemli karakterler ve doğrudan sesli MP4 çıktısı üretir.'
 },
 {
  id: 'tempo-cinema-pro',
  name: 'Tempo Cinema AI Pro (Yerleşik)',
  repo: 'yurdakulaykut16-oss/Temel-egitim',
  license: 'MIT',
  stars: 'Yerleşik',
  category: 'Programatik 3D/SVG + FFmpeg + VoiceStudio Mux',
  defaultUrl: 'local://builtin',
  gpuRequired: false,
  zeroApi: true,
  alwaysReady: true,
  description: 'Her bilgisayarda anında çalışan 24fps sinema MP4 derleyici; yerel VoiceStudio açıksa gerçek seslendirme kanalını MP4 içine gömer.'
 },
 {
  id: 'blender-eevee-local',
  name: 'Blender 3D / EEVEE (Yerel bpy Senaryo Üreteci)',
  repo: 'blender/blender',
  license: 'GPL-3.0',
  stars: 'Yerel 3D Rig',
  category: 'Prosedürel 3D Rig & Kamera (.py)',
  defaultUrl: 'local://blender-cli',
  gpuRequired: false,
  zeroApi: true,
  description: 'Blender kuruluysa otomatik algılar ve hazır EEVEE 3D sahne + animasyon keyframe betiği üretir.'
 },
 {
  id: 'comfyui-wan22',
  name: 'ComfyUI + Wan 2.2 / Wan 2.1',
  repo: 'Wan-Video/Wan2.2',
  hostRepo: 'Comfy-Org/ComfyUI',
  license: 'Apache-2.0',
  stars: '18.5k + 146k',
  category: 'Sinirsel Difüzyon T2V/I2V (Yerel GPU)',
  defaultUrl: process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188',
  gpuRequired: true,
  zeroApi: true,
  description: 'ComfyUI yerel API (8188) üzerinden Wan2.2 / Wan2.1, LTX-2, HunyuanVideo veya CogVideoX ile gerçek yapay zekâ videosu üretir.'
 },
 {
  id: 'ltx2-local',
  name: 'Lightricks LTX-2 / LTX-Video',
  repo: 'Lightricks/LTX-2',
  license: 'Apache-2.0',
  stars: '10.2k + 11.4k',
  category: 'Gerçek Zamanlı Sesli-Görüntülü DiT Video',
  defaultUrl: process.env.LTX_VIDEO_BASE_URL || 'http://127.0.0.1:8190',
  gpuRequired: true,
  zeroApi: true,
  description: 'Ses ve görüntüyü aynı anda yerel GPU üzerinde üreten gerçek zamanlı LTX-2 / LTX-Video açık kaynak motoru.'
 },
 {
  id: 'short-video-maker',
  name: 'Short-Video-Maker (TikTok/Shorts)',
  repo: 'gyoridavid/short-video-maker',
  license: 'MIT',
  stars: '1.5k',
  category: 'Remotion + Kokoro TTS + Whisper Altyazı',
  defaultUrl: process.env.SHORT_VIDEO_MAKER_URL || 'http://127.0.0.1:3123',
  gpuRequired: false,
  zeroApi: true,
  description: 'Tamamen yerel çalışan otomatik TikTok/Shorts video sunucusu (port 3123 · Kokoro TTS + senkron altyazı).'
 },
 {
  id: 'moneyprinter-turbo',
  name: 'MoneyPrinterTurbo (Oto-Kurgu)',
  repo: 'harry0703/MoneyPrinterTurbo',
  license: 'MIT',
  stars: '141.8k',
  category: 'Otomatik HD Video & Ses Montaj Motoru',
  defaultUrl: process.env.MONEYPRINTER_URL || 'http://127.0.0.1:8080',
  gpuRequired: false,
  zeroApi: true,
  description: 'Konu ve senaryodan yerel FastAPI (port 8080) ile çok sahneli HD kısa video üreten açık kaynak stüdyo.'
 },
 {
  id: 'cogvideox-local',
  name: 'Zhipu CogVideoX (Diffusers Yerel)',
  repo: 'zai-org/CogVideo',
  license: 'Apache-2.0',
  stars: '13.2k',
  category: 'Diffusers Yerel Video Üreticisi',
  defaultUrl: process.env.COGVIDEO_URL || 'http://127.0.0.1:7860',
  gpuRequired: true,
  zeroApi: true,
  description: 'HuggingFace Diffusers & Gradio üzerinden yerel CogVideoX-2B/5B metinden video üretimi.'
 },
 {
  id: 'mochi-local',
  name: 'Genmo Mochi 1 (Open Video)',
  repo: 'genmoai/mochi',
  license: 'Apache-2.0',
  stars: '3.8k',
  category: 'Yüksek Hareket Tutarlılıklı T2V',
  defaultUrl: process.env.MOCHI_URL || 'http://127.0.0.1:7861',
  gpuRequired: true,
  zeroApi: true,
  description: 'Doğal karakter hareketleri ve akıcı fizik için Apache-2.0 açık kaynak Mochi 1 video modeli.'
 },
 {
  id: 'manim-local',
  name: 'Manim Community (Diyagram & Formül)',
  repo: 'ManimCommunity/manim',
  license: 'MIT',
  stars: '42.4k',
  category: 'Programatik Bilim & Grafik Animasyon',
  defaultUrl: 'local://manim-cli',
  gpuRequired: false,
  zeroApi: true,
  description: 'VKİ, kalp debisi ve yüklenme grafiklerini sinema kalitesinde vektörel animasyona çeviren Python motoru.'
 }
];

async function probeUrl(url, timeoutMs = 800) {
 try {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return r;
 } catch {
  return null;
 }
}

async function curlJson(url, timeoutSec = 8) {
 try {
  const r = await fetch(url, {
   headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'TemelEgitim-LocalVideoHub/1.0' },
   signal: AbortSignal.timeout(timeoutSec * 1000)
  });
  if (r.ok) return await r.json();
 } catch {}
 try {
  const { stdout } = await execFileAsync('curl', [
   '-sSfL', '--max-time', String(timeoutSec),
   '-H', 'Accept: application/vnd.github+json',
   '-H', 'User-Agent: TemelEgitim-LocalVideoHub/1.0',
   url
  ], { timeout: (timeoutSec + 2) * 1000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
 } catch {
  return null;
 }
}

export class LocalVideoEngineHub {
 constructor(dataDir, { mp4Renderer, voiceStudio, local3dEngine } = {}) {
  this.dataDir = dataDir;
  this.mp4Renderer = mp4Renderer || null;
  this.voiceStudio = voiceStudio || null;
  this.local3dEngine = local3dEngine || null;
  this.brainDir = resolve(dataDir, 'ai-brain');
  this.stateFile = resolve(this.brainDir, 'local-video-engines.json');
 }

 async _atomicWrite(filePath, obj) {
  await mkdir(this.brainDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 async loadState() {
  try {
   const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
   if (parsed && typeof parsed === 'object') {
    return {
     ...parsed,
     kimiOllamaOnly: parsed.kimiOllamaOnly !== false,
     preferredEngineId: !parsed.preferredEngineId || parsed.preferredEngineId === 'auto' ? 'tempo-cinema-pro' : parsed.preferredEngineId
    };
   }
  } catch {}
  return {
   preferredEngineId: 'tempo-cinema-pro',
   kimiOllamaOnly: true,
   discoveredGithubRepos: [],
   lastGithubDiscoveryAt: null,
   lastRenderStats: { totalRenders: 0, lastEngineId: 'tempo-cinema-pro', lastRenderedAt: null }
  };
 }

 async saveState(patch = {}) {
  const cur = await this.loadState();
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  await this._atomicWrite(this.stateFile, next);
  return next;
 }

 async detectLocalEngines() {
  const state = await this.loadState();
  const comfyUrl = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
  const ltxUrl = (process.env.LTX_VIDEO_BASE_URL || 'http://127.0.0.1:8190').replace(/\/$/, '');
  const svmUrl = (process.env.SHORT_VIDEO_MAKER_URL || 'http://127.0.0.1:3123').replace(/\/$/, '');
  const mptUrl = (process.env.MONEYPRINTER_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
  const cogUrl = (process.env.COGVIDEO_URL || 'http://127.0.0.1:7860').replace(/\/$/, '');
  const mochiUrl = (process.env.MOCHI_URL || 'http://127.0.0.1:7861').replace(/\/$/, '');

  const [comfyRes, comfyObjRes, ltxRes, svmRes, mptRes, cogRes, mochiRes, manimCli, blenderCli, ffmpegOk, vsHealth] = await Promise.all([
   probeUrl(`${comfyUrl}/system_stats`),
   probeUrl(`${comfyUrl}/object_info`),
   probeUrl(`${ltxUrl}/health`),
   probeUrl(`${svmUrl}/health`),
   probeUrl(`${mptUrl}/ping`),
   probeUrl(`${cogUrl}/health`),
   probeUrl(`${mochiUrl}/health`),
   execFileAsync('which', ['manim'], { timeout: 1500 }).then(() => true).catch(() => false),
   execFileAsync('which', ['blender'], { timeout: 1500 }).then(() => true).catch(() => false),
   this.mp4Renderer ? this.mp4Renderer.isAvailable().catch(() => false) : Promise.resolve(false),
   this.voiceStudio ? this.voiceStudio.checkLocalVoiceStudio().catch(() => ({ localAvailable: false })) : Promise.resolve({ localAvailable: false })
  ]);

  let comfyNodes = [];
  if (comfyObjRes?.ok) {
   try {
    const obj = await comfyObjRes.json();
    comfyNodes = Object.keys(obj || {});
   } catch {}
  }

  const statuses = {
   'tempo-3d-cinema-engine': {
    available: Boolean(ffmpegOk),
    endpoint: 'local://3d-engine',
    audioMuxReady: Boolean(vsHealth?.localAvailable),
    detail: 'Gerçek 3D perspektif kamera + Z-sıralı poligon hologram + eklemli iskelet MP4 motoru AKTİF'
   },
   'blender-eevee-local': {
    available: Boolean(blenderCli),
    endpoint: 'local://blender-cli',
    detail: blenderCli ? 'Blender kurulu — yerel EEVEE 3D sahne üretimi HAZIR' : 'Opsiyonel: Blender kurulu değilse otomatik Python .py sahne betiği üretir'
   },
   'tempo-cinema-pro': {
    available: Boolean(ffmpegOk),
    endpoint: 'local://builtin',
    audioMuxReady: Boolean(vsHealth?.localAvailable),
    detail: vsHealth?.localAvailable
     ? 'Sinema MP4 + VoiceStudio gerçek konuşma sesi birleştirme AKTİF'
     : 'Yerleşik Sinema MP4 (24fps + 3D SVG/Keyframes) HAZIR'
   },
   'comfyui-wan22': {
    available: Boolean(comfyRes?.ok),
    endpoint: comfyUrl,
    detectedBackends: comfyNodes.filter(k => /Wan|LTX|Hunyuan|CogVideo|Mochi/i.test(k)).slice(0, 8),
    detail: comfyRes?.ok ? `ComfyUI yerel sunucusu bağlı (${comfyUrl})` : 'Yerel ComfyUI (port 8188) beklemede — npm run dev:videostudio ile açılabilir'
   },
   'ltx2-local': {
    available: Boolean(ltxRes?.ok || comfyNodes.some(k => /LTX/i.test(k))),
    endpoint: ltxRes?.ok ? ltxUrl : comfyUrl,
    detail: ltxRes?.ok ? `LTX-2 yerel worker bağlı (${ltxUrl})` : 'Yerel LTX-2 / LTX-Video (port 8190) beklemede'
   },
   'short-video-maker': {
    available: Boolean(svmRes?.ok),
    endpoint: svmUrl,
    detail: svmRes?.ok ? `Short-Video-Maker bağlı (${svmUrl})` : 'Yerel Short-Video-Maker (port 3123) beklemede'
   },
   'moneyprinter-turbo': {
    available: Boolean(mptRes?.ok),
    endpoint: mptUrl,
    detail: mptRes?.ok ? `MoneyPrinterTurbo bağlı (${mptUrl})` : 'Yerel MoneyPrinterTurbo (port 8080) beklemede'
   },
   'cogvideox-local': {
    available: Boolean(cogRes?.ok || comfyNodes.some(k => /CogVideo/i.test(k))),
    endpoint: cogUrl,
    detail: cogRes?.ok ? `CogVideoX yerel sunucusu bağlı (${cogUrl})` : 'Yerel CogVideoX (port 7860) beklemede'
   },
   'mochi-local': {
    available: Boolean(mochiRes?.ok || comfyNodes.some(k => /Mochi/i.test(k))),
    endpoint: mochiUrl,
    detail: mochiRes?.ok ? `Genmo Mochi 1 bağlı (${mochiUrl})` : 'Yerel Mochi 1 (port 7861) beklemede'
   },
   'manim-local': {
    available: Boolean(manimCli),
    endpoint: 'local://manim',
    detail: manimCli ? 'Manim Python animasyon motoru kurulu' : 'Opsiyonel: pip install manim ile bilimsel formül animasyonu eklenebilir'
   }
  };

  const engines = GITHUB_LOCAL_VIDEO_ENGINES.map(e => ({
   ...e,
   ...(statuses[e.id] || { available: false, endpoint: e.defaultUrl, detail: '' })
  }));

  return {
   ok: true,
   zeroApiRequired: true,
   kimiOllamaOnly: true,
   videoPolicy: 'kimi-ollama-only',
   preferredEngineId: state.preferredEngineId || 'tempo-cinema-pro',
   liveEnginesCount: engines.filter(e => e.available).length,
   totalCatalogCount: engines.length,
   engines,
   discoveredGithubRepos: state.discoveredGithubRepos || [],
   lastGithubDiscoveryAt: state.lastGithubDiscoveryAt,
   lastRenderStats: state.lastRenderStats
  };
 }

 // %100 Yerel video motor kataloğu tarayıcısı (dış ağ/API gerektirmez)
 async discoverGithubVideoEngines() {
  const canRemote = process.env.TEMPO_ALLOW_REMOTE_FETCH === '1' && process.env.TEMPO_OFFLINE_ONLY !== '1';
  const data = canRemote
   ? await curlJson('https://api.github.com/search/repositories?q=local+text-to-video+OR+Wan2.2+OR+LTX-Video+OR+short-video-maker+in:name,description&sort=stars&per_page=10', 8)
   : null;
  const items = Array.isArray(data?.items)
   ? data.items
      .filter(r => ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'GPL-3.0'].includes(r.license?.spdx_id || '') || /ComfyUI|Hunyuan/i.test(r.full_name))
      .slice(0, 8)
      .map(r => ({
       fullName: r.full_name,
       stars: r.stargazers_count || 0,
       license: r.license?.spdx_id || 'OSS',
       url: r.html_url,
       description: String(r.description || '').slice(0, 140),
       updatedAt: (r.updated_at || '').slice(0, 10)
      }))
   : [];

  if (items.length) {
   await this.saveState({
    discoveredGithubRepos: items,
    lastGithubDiscoveryAt: new Date().toISOString()
   });
  }
  const cur = await this.loadState();
  return {
   ok: true,
   liveFetched: items.length > 0,
   repos: cur.discoveredGithubRepos?.length ? cur.discoveredGithubRepos : GITHUB_LOCAL_VIDEO_ENGINES.map(e => ({
    fullName: e.repo,
    stars: e.stars,
    license: e.license,
    url: `https://github.com/${e.repo}`,
    description: e.description
   })),
   lastGithubDiscoveryAt: cur.lastGithubDiscoveryAt
  };
 }

 // Yerel VoiceStudio açıksa sahne diyalogları için gerçek konuşma sesi dosyalarını üretip birleştirir
 async _synthesizeVoiceTrack(video, workDir) {
  if (!this.voiceStudio || !this.mp4Renderer) return null;
  const vsHealth = await this.voiceStudio.checkLocalVoiceStudio().catch(() => ({ localAvailable: false }));
  if (!vsHealth?.localAvailable) return null;
  const ffmpeg = await this.mp4Renderer.getFfmpegPath?.();
  if (!ffmpeg) return null;

  const lines = (video?.scenes || []).flatMap(sc => (sc.dialogues || []).slice(0, 3)).slice(0, 8);
  if (!lines.length) return null;

  const prefs = await this.voiceStudio.loadPreferences().catch(() => ({ characterCast: {}, rate: 1 }));
  const themeFallbackVoice = {
   tiktok_kayseri: 'captain_crusty',
   hamam_bocegi_komedi: 'junior_quacks',
   stadyum_spikeri: 'the_commentator',
   super_kahraman: 'the_champion',
   shorts_hizli: 'the_hype_host',
   terim_avcisi: 'the_explainer'
  }[video?.themeStyle] || 'the_teacher';
  const audioParts = [];
  for (let i = 0; i < lines.length; i++) {
   const d = lines[i];
   const castId = prefs.characterCast?.[d.speaker] || prefs.selectedVoiceId || `voicestudio:${themeFallbackVoice}`;
   const voiceName = castId.includes(':') ? castId.split(':')[1] : castId;
   const r = await this.voiceStudio.synthesizeViaLocalServer({
    text: d.text,
    voice: voiceName || 'default',
    speed: prefs.rate || 1.0,
    language: 'tr'
   }).catch(() => null);
   if (r?.ok && r.buffer?.length > 200) {
    const segPath = join(workDir, `tts_${i}.mp3`);
    await writeFile(segPath, r.buffer);
    audioParts.push(segPath);
   }
  }
  if (!audioParts.length) return null;

  const listPath = join(workDir, 'tts_list.txt');
  await writeFile(listPath, audioParts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const mergedPath = join(workDir, 'merged_voice.mp3');
  await execFileAsync(ffmpeg, [
   '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
   '-c:a', 'libmp3lame', '-q:a', '4', mergedPath
  ], { timeout: 25_000 });
  return mergedPath;
 }

 // ComfyUI yerel API (/prompt -> /history -> /view) ile Wan2.2 / LTX-Video MP4 üretimi
 async _renderViaComfyUI(comfyUrl, video, outMp4Path) {
  const promptText = String(video?.googleFlowMasterPrompt || video?.scenes?.[0]?.googleFlowPrompt || `${video?.unit || 'Sports science'} 3D educational animation`).slice(0, 480);
  const objRes = await probeUrl(`${comfyUrl}/object_info`, 2000);
  const objInfo = objRes?.ok ? await objRes.json().catch(() => ({})) : {};
  const hasLtx = Boolean(objInfo?.EmptyLTXVLatentVideo);
  const hasWan = Boolean(objInfo?.WanImageToVideo || objInfo?.EmptyHunyuanLatentVideo);

  const workflow = hasLtx
   ? {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: process.env.COMFYUI_LTX_CKPT || 'ltx-video-2b-v0.9.5.safetensors' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: promptText, clip: ['1', 1] } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry, distorted text, watermark, low quality', clip: ['1', 1] } },
      '4': { class_type: 'EmptyLTXVLatentVideo', inputs: { width: 768, height: 512, length: 49, batch_size: 1 } },
      '5': { class_type: 'KSampler', inputs: { seed: Math.floor(Math.random() * 1e9), steps: 18, cfg: 3.5, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'VHS_VideoCombine', inputs: { images: ['6', 0], frame_rate: 24, format: 'video/h264-mp4', filename_prefix: `tempo_${video.unitId || '0-0'}` } }
     }
   : {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: process.env.COMFYUI_WAN_CKPT || (hasWan ? 'wan2.2_ti2v_5B_fp16.safetensors' : 'wan2.1_t2v_1.3B_fp16.safetensors') } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: promptText, clip: ['1', 1] } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry, jitter, text artifact, watermark', clip: ['1', 1] } },
      '4': { class_type: 'EmptyHunyuanLatentVideo', inputs: { width: 832, height: 480, length: 49, batch_size: 1 } },
      '5': { class_type: 'KSampler', inputs: { seed: Math.floor(Math.random() * 1e9), steps: 20, cfg: 5.0, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'SaveVideo', inputs: { video: ['6', 0], filename_prefix: `tempo_${video.unitId || '0-0'}`, format: 'mp4' } }
     };

  const submit = await fetch(`${comfyUrl}/prompt`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ prompt: workflow, client_id: 'tempo-local-hub' }),
   signal: AbortSignal.timeout(10_000)
  });
  if (!submit.ok) throw Error(`ComfyUI /prompt reddetti (${submit.status})`);
  const { prompt_id: promptId } = await submit.json();
  if (!promptId) throw Error('ComfyUI prompt_id dönmedi.');

  let outputFile = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
   const hr = await probeUrl(`${comfyUrl}/history/${encodeURIComponent(promptId)}`, 3000);
   if (hr?.ok) {
    const hData = await hr.json().catch(() => ({}));
    const entry = hData?.[promptId];
    if (entry?.outputs) {
     for (const nodeOut of Object.values(entry.outputs)) {
      const vids = nodeOut?.gifs || nodeOut?.videos || nodeOut?.images || [];
      const found = vids.find(v => v?.filename);
      if (found) {
       outputFile = found;
       break;
      }
     }
     if (outputFile) break;
    }
   }
   await new Promise(r => setTimeout(r, 1200));
  }
  if (!outputFile?.filename) throw Error('ComfyUI video çıktısı zaman aşımına uğradı.');

  const qs = new URLSearchParams({
   filename: outputFile.filename,
   subfolder: outputFile.subfolder || '',
   type: outputFile.type || 'output'
  });
  const dl = await fetch(`${comfyUrl}/view?${qs.toString()}`, { signal: AbortSignal.timeout(20_000) });
  if (!dl.ok) throw Error('ComfyUI üretilen video indirilemedi.');
  const buf = Buffer.from(await dl.arrayBuffer());
  await mkdir(dirname(outMp4Path), { recursive: true });
  const tmpOut = `${outMp4Path}.comfy.tmp.mp4`;
  await writeFile(tmpOut, buf);
  await rename(tmpOut, outMp4Path);
  const st = await stat(outMp4Path);
  return { engineId: 'comfyui-wan22', path: outMp4Path, bytes: st.size, externalNeural: true };
 }

 // gyoridavid/short-video-maker (MIT) yerel REST API ile MP4 üretimi
 async _renderViaShortVideoMaker(svmUrl, video, outMp4Path) {
  const scenes = (video?.scenes || []).slice(0, 4).map(sc => ({
   text: (sc.dialogues || []).map(d => d.text).join(' ').slice(0, 260) || sc.sceneTitle || video.unit,
   searchTerms: [(video?.unit || 'sports training').slice(0, 40), 'fitness athlete coach']
  }));
  const createRes = await fetch(`${svmUrl}/api/short-video`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ scenes, config: { orientation: 'portrait', musicVolume: 'medium' } }),
   signal: AbortSignal.timeout(10_000)
  });
  if (!createRes.ok) throw Error(`Short-Video-Maker HTTP ${createRes.status}`);
  const { videoId } = await createRes.json();
  if (!videoId) throw Error('Short-Video-Maker videoId dönmedi.');

  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
   const stRes = await probeUrl(`${svmUrl}/api/short-video/${encodeURIComponent(videoId)}/status`, 3000);
   if (stRes?.ok) {
    const stJson = await stRes.json().catch(() => ({}));
    if (stJson?.status === 'ready' || stJson?.status === 'completed') {
     ready = true;
     break;
    }
    if (stJson?.status === 'failed') throw Error('Short-Video-Maker render başarısız.');
   }
   await new Promise(r => setTimeout(r, 1200));
  }
  if (!ready) throw Error('Short-Video-Maker zaman aşımı.');

  const dl = await fetch(`${svmUrl}/api/short-video/${encodeURIComponent(videoId)}`, { signal: AbortSignal.timeout(20_000) });
  if (!dl.ok) throw Error('Short-Video-Maker MP4 indirilemedi.');
  const buf = Buffer.from(await dl.arrayBuffer());
  await mkdir(dirname(outMp4Path), { recursive: true });
  const tmpOut = `${outMp4Path}.svm.tmp.mp4`;
  await writeFile(tmpOut, buf);
  await rename(tmpOut, outMp4Path);
  const st = await stat(outMp4Path);
  return { engineId: 'short-video-maker', path: outMp4Path, bytes: st.size, externalNeural: true };
 }

 // Lightricks/LTX-2 yerel worker (/generate) ile MP4 üretimi
 async _renderViaLtx2(ltxUrl, video, outMp4Path) {
  const promptText = String(video?.googleFlowMasterPrompt || video?.scenes?.[0]?.googleFlowPrompt || `${video?.unit} 3D educational animation`).slice(0, 500);
  const r = await fetch(`${ltxUrl}/generate`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ prompt: promptText, width: 768, height: 512, num_frames: 65, fps: 24 }),
   signal: AbortSignal.timeout(90_000)
  });
  if (!r.ok) throw Error(`LTX-2 yerel HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) throw Error('LTX-2 geçerli video döndürmedi.');
  await mkdir(dirname(outMp4Path), { recursive: true });
  const tmpOut = `${outMp4Path}.ltx.tmp.mp4`;
  await writeFile(tmpOut, buf);
  await rename(tmpOut, outMp4Path);
  const st = await stat(outMp4Path);
  return { engineId: 'ltx2-local', path: outMp4Path, bytes: st.size, externalNeural: true };
 }

 // harry0703/MoneyPrinterTurbo (MIT) yerel FastAPI ile HD kısa video üretimi
 async _renderViaMoneyPrinterTurbo(mptUrl, video, outMp4Path) {
  const scriptText = (video?.scenes || []).flatMap(sc => (sc.dialogues || []).map(d => d.text)).join(' ').slice(0, 600) || video?.summary || video?.unit;
  const r = await fetch(`${mptUrl}/api/v1/videos`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
    video_subject: video?.unit || 'Antrenörlük Eğitimi',
    video_script: scriptText,
    video_terms: [(video?.unit || 'sports training').slice(0, 40)],
    video_aspect: '9:16',
    video_language: 'tr-TR'
   }),
   signal: AbortSignal.timeout(10_000)
  });
  if (!r.ok) throw Error(`MoneyPrinterTurbo HTTP ${r.status}`);
  const payload = await r.json();
  const taskId = payload?.data?.task_id || payload?.task_id;
  if (!taskId) throw Error('MoneyPrinterTurbo task_id dönmedi.');

  let videoUrl = '';
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
   const tr = await probeUrl(`${mptUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, 3000);
   if (tr?.ok) {
    const tj = await tr.json().catch(() => ({}));
    const files = tj?.data?.videos || tj?.videos || [];
    if (files[0]) {
     videoUrl = files[0].startsWith('http') ? files[0] : `${mptUrl}${files[0].startsWith('/') ? '' : '/'}${files[0]}`;
     break;
    }
   }
   await new Promise(r2 => setTimeout(r2, 1200));
  }
  if (!videoUrl) throw Error('MoneyPrinterTurbo video zaman aşımı.');
  const dl = await fetch(videoUrl, { signal: AbortSignal.timeout(20_000) });
  if (!dl.ok) throw Error('MoneyPrinterTurbo video indirilemedi.');
  const buf = Buffer.from(await dl.arrayBuffer());
  await mkdir(dirname(outMp4Path), { recursive: true });
  const tmpOut = `${outMp4Path}.mpt.tmp.mp4`;
  await writeFile(tmpOut, buf);
  await rename(tmpOut, outMp4Path);
  const st = await stat(outMp4Path);
  return { engineId: 'moneyprinter-turbo', path: outMp4Path, bytes: st.size, externalNeural: true };
 }

 // zai-org/CogVideo & genmoai/mochi yerel Gradio/FastAPI sunucuları (0-API) ile video üretimi
 async _renderViaGradioVideoEngine(engineId, baseUrl, video, outMp4Path) {
  const promptText = String(video?.googleFlowMasterPrompt || video?.scenes?.[0]?.googleFlowPrompt || `${video?.unit || 'Sports coaching'} 3D educational animation`).slice(0, 480);
  const endpoints = [
   { url: `${baseUrl}/generate`, body: { prompt: promptText, num_frames: 49, fps: 24, width: 768, height: 512 } },
   { url: `${baseUrl}/api/predict`, body: { data: [promptText, 49, 24] } }
  ];
  let buf = null;
  for (const ep of endpoints) {
   try {
    const r = await fetch(ep.url, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(ep.body),
     signal: AbortSignal.timeout(90_000)
    });
    if (!r.ok) continue;
    const ct = String(r.headers.get('content-type') || '');
    if (ct.includes('video/') || ct.includes('octet-stream')) {
     const raw = Buffer.from(await r.arrayBuffer());
     if (raw.length > 1000) { buf = raw; break; }
    } else {
     const j = await r.json().catch(() => null);
     const vidUrl = j?.video_url || j?.url || j?.data?.[0]?.url || j?.data?.[0];
     if (typeof vidUrl === 'string' && vidUrl.trim()) {
      const fullUrl = vidUrl.startsWith('http') ? vidUrl : `${baseUrl}${vidUrl.startsWith('/') ? '' : '/'}${vidUrl}`;
      const dl = await fetch(fullUrl, { signal: AbortSignal.timeout(20_000) });
      if (dl.ok) {
       const raw = Buffer.from(await dl.arrayBuffer());
       if (raw.length > 1000) { buf = raw; break; }
      }
     }
    }
   } catch {}
  }
  if (!buf) throw Error(`${engineId} yerel video sunucusundan MP4 alınamadı.`);
  await mkdir(dirname(outMp4Path), { recursive: true });
  const tmpOut = `${outMp4Path}.${engineId}.tmp.mp4`;
  await writeFile(tmpOut, buf);
  await rename(tmpOut, outMp4Path);
  const st = await stat(outMp4Path);
  return { engineId, path: outMp4Path, bytes: st.size, externalNeural: true, zeroApi: true };
 }

 async dispatchLocalRender({ engineId = 'auto', video, outMp4Path, speedProfile = 'cinema', preferLiveNeural = false }) {
  const detection = await this.detectLocalEngines();
  let chosen = engineId || detection.preferredEngineId || 'tempo-cinema-pro';
  if (chosen === 'auto') {
   if (preferLiveNeural) {
    const livePriority = ['comfyui-wan22', 'ltx2-local', 'short-video-maker', 'moneyprinter-turbo', 'cogvideox-local', 'mochi-local'];
    const liveEngine = livePriority.map(id => detection.engines.find(e => e.id === id)).find(e => e?.available);
    chosen = liveEngine ? liveEngine.id : 'tempo-cinema-pro';
   } else {
    // Varsayılan otomatik modda Kimi + Ollama senaryolarını yerleşik MP4 derleyici ile işle
    chosen = 'tempo-cinema-pro';
   }
  }

  let result = null;
  let fallbackUsed = false;

  if (chosen === 'tempo-3d-cinema-engine' && this.local3dEngine && this.mp4Renderer) {
   const ffmpegPath = await this.mp4Renderer.getFfmpegPath?.();
   if (ffmpegPath) {
    const workDir = await mkdtemp(join(tmpdir(), 'tempo-3d-voice-'));
    try {
     const voiceTrackPath = await this._synthesizeVoiceTrack(video, workDir).catch(() => null);
     const spec = this.local3dEngine.build3DAnimationSpec({
      unitId: video?.unitId || '0-0',
      unitTitle: video?.unit || video?.title || '3D Ders',
      book: video?.book || 'Temel Eğitim',
      environment: video?.environment || 'classroom_3d',
      keyPoints: video?.scenes?.[0]?.boardBullets || []
     });
     if (Array.isArray(video?.scenes) && video.scenes.length) spec.scenes = video.scenes;
     const r3d = await this.local3dEngine.render3dAnimationMp4(spec, outMp4Path, {
      ffmpegPath,
      speedProfile: speedProfile === 'turbo' ? 'turbo' : 'hd',
      voiceTrackPath
     });
     result = { ...r3d, audioMuxed: Boolean(voiceTrackPath) };
    } catch {
     fallbackUsed = true;
    } finally {
     await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
   }
  } else if (chosen === 'comfyui-wan22') {
   const eng = detection.engines.find(e => e.id === 'comfyui-wan22');
   if (eng?.available) {
    try { result = await this._renderViaComfyUI(eng.endpoint, video, outMp4Path); } catch { fallbackUsed = true; }
   }
  } else if (chosen === 'ltx2-local') {
   const eng = detection.engines.find(e => e.id === 'ltx2-local');
   if (eng?.available) {
    try {
     result = eng.endpoint.includes(':8188')
      ? await this._renderViaComfyUI(eng.endpoint, video, outMp4Path)
      : await this._renderViaLtx2(eng.endpoint, video, outMp4Path);
    } catch { fallbackUsed = true; }
   }
  } else if (chosen === 'short-video-maker') {
   const eng = detection.engines.find(e => e.id === 'short-video-maker');
   if (eng?.available) {
    try { result = await this._renderViaShortVideoMaker(eng.endpoint, video, outMp4Path); } catch { fallbackUsed = true; }
   }
  } else if (chosen === 'moneyprinter-turbo') {
   const eng = detection.engines.find(e => e.id === 'moneyprinter-turbo');
   if (eng?.available) {
    try { result = await this._renderViaMoneyPrinterTurbo(eng.endpoint, video, outMp4Path); } catch { fallbackUsed = true; }
   }
  } else if (chosen === 'cogvideox-local' || chosen === 'mochi-local') {
   const eng = detection.engines.find(e => e.id === chosen);
   if (eng?.available) {
    try { result = await this._renderViaGradioVideoEngine(chosen, eng.endpoint, video, outMp4Path); } catch { fallbackUsed = true; }
   }
  }

  if (!result) {
   if (!this.mp4Renderer) throw Error('Yerleşik MP4 derleyici hazır değil.');
   const workDir = await mkdtemp(join(tmpdir(), 'tempo-cinema-voice-'));
   try {
    const voiceTrackPath = await this._synthesizeVoiceTrack(video, workDir).catch(() => null);
    const rendered = await this.mp4Renderer.renderUnitMp4(video, outMp4Path, {
     speedProfile: speedProfile === 'turbo' ? 'turbo' : 'hd',
     voiceTrackPath
    });
    result = {
     engineId: 'tempo-cinema-pro',
     requestedEngineId: chosen,
     fallbackUsed: chosen !== 'tempo-cinema-pro' || fallbackUsed,
     audioMuxed: Boolean(voiceTrackPath),
     zeroApi: true,
     ...rendered
    };
   } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
   }
  }

  const cur = await this.loadState();
  await this.saveState({
   lastRenderStats: {
    totalRenders: (cur.lastRenderStats?.totalRenders || 0) + 1,
    lastEngineId: result.engineId,
    lastRenderedAt: new Date().toISOString()
   }
  });
  return { zeroApi: true, localExecutionOnly: true, engineSpecVersion: 2, ...result };
 }
}
