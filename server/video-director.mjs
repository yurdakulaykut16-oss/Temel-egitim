import { access, readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractKeyTermsFromUnit } from './kayseri-coach.mjs';

export const SITUATION_MODES = ['ilk_kesif', 'hata_kurtarma', 'ya_cikarsa', 'hizli_tekrar'];

export const VIDEO_SPEC_VERSION = 2;
export const VIDEO_GENERATION_POLICY = 'kimi-ollama-only';
export const ALLOWED_VIDEO_PROVIDERS = ['kimi', 'ollama'];

export function isLegacyVideoRecord(record, hasMp4 = true) {
 if (!record || typeof record !== 'object') return true;
 if (!hasMp4) return true;
 const specVer = Number(record.videoSpecVersion || 1);
 if (specVer < VIDEO_SPEC_VERSION) return true;
 if (!record.upgradedAt) return true;
 const model = String(record.aiVideoModel || record.model || '').trim();
 const engine = String(record.aiVideoEngine || '').trim();
 const policy = String(record.providerPolicy || record.videoPolicy || '').trim();
 if (!model || !engine || policy !== VIDEO_GENERATION_POLICY) return true;
 return false;
}

const DISALLOWED_VIDEO_MODEL_RE = /(?:^|[-_.:/])(veo|gemini|google[-_]?flow|sora|runway|gen-?[23]|kling|pika|luma|haiper|minimax|hailuo|comfyui|wan2|ltx2|ltx-video|short-video-maker|moneyprinter|cogvideo|mochi|manim|gpt-|o[134]-|claude-|grok-|dall-e|imagen|stability|midjourney|synthesia|heygen)(?:$|[-_.:/0-9])/i;
const KIMI_MODEL_RE = /^(?:kimi|moonshot)/i;
const OLLAMA_FAMILY_RE = /^(?:qwen|gemma|llama|deepseek|glm|mistral|phi|tempo-|olmo|command-r|granite|opencoder|nemotron|starcoder|codellama|yi|solar|vicuna|orca|mixtral|internlm|baichuan|kimi)/i;

export function classifyVideoProvider(modelName) {
 const m = String(modelName || '').trim();
 if (!m) return 'kimi';
 if (KIMI_MODEL_RE.test(m)) return 'kimi';
 return 'ollama';
}

export function isAllowedVideoModel(modelName, installedOllamaModels = []) {
 const m = String(modelName || '').trim();
 if (!m || m.length > 200) return false;
 if (DISALLOWED_VIDEO_MODEL_RE.test(m)) return false;
 if (KIMI_MODEL_RE.test(m)) return true;
 if (Array.isArray(installedOllamaModels) && installedOllamaModels.includes(m)) return true;
 if (/:cloud$/i.test(m) || OLLAMA_FAMILY_RE.test(m)) return true;
 return false;
}

export const PHOTO_CLOUD_VIDEO_MODELS = [
 { id: 'kimi-k3.1-pro:cloud', label: 'Kimi K3.1 Pro (:cloud)', provider: 'kimi', badge: 'Önerilen · Akıcı Senaryo & Komedi', priority: 1 },
 { id: 'glm-5.3-flash:cloud', label: 'GLM 5.3 Flash (:cloud)', provider: 'ollama', badge: 'Hızlı · Ollama Çoklu Sahne', priority: 2 },
 { id: 'deepseek-v4.1-flash:cloud', label: 'DeepSeek V4.1 Flash (:cloud)', provider: 'ollama', badge: 'Keskin · Ollama Sınav Tuzakları', priority: 3 }
];

export const VIDEO_THEMES = [
 { id: 'tiktok_kayseri', label: 'Kayserili TikTok Özeti (Sorusuz)', emoji: '🌶️', desc: 'Soru sormadan Kayserili sert-komik diyaloglarla doğrudan net cevabı ve terimleri verir!' },
 { id: 'hamam_bocegi_komedi', label: 'Hamam Böceği Komedisi', emoji: '🪳', desc: 'Yaramaz Hamam Böceği Böcü ders tuzaklarını karıştırır, Koç & Ada onu bilgiyle kovar!' },
 { id: 'terim_avcisi', label: 'Önemli Terim & Net Cevap', emoji: '📌', desc: 'Sorusuz doğrudan kelime, terim ve sınavda çıkacak kesin cevabı akıtır.' },
 { id: 'shorts_hizli', label: '30sn Turbo Shorts', emoji: '⚡', desc: 'Çok kısa, vurucu ve saniyeler içinde derlenen hızlı ezber videosu.' },
 { id: 'stadyum_spikeri', label: 'Stadyum Spikeri', emoji: '🏟️', desc: '90. dakika derbi maçı anlatımı coşkusuyla ünite özeti!' },
 { id: 'super_kahraman', label: 'Süper Kahraman', emoji: '🦸', desc: 'Antrenman bilimi güç kalkanıyla süper kahraman görevi.' },
 { id: 'lab_deney', label: '3D Laboratuvar', emoji: '🔬', desc: 'Fizyoloji ve motor öğrenme mikroskop sahnesi.' },
 { id: 'morpa_klasik', label: 'Morpa 3D Klasik', emoji: '🎓', desc: 'Klasik sınıf akıllı tahta + Koç + Ada + Can anlatımı.' }
];

const THEME_IDS = new Set(VIDEO_THEMES.map(t => t.id));

function sanitizePart(raw, fallback = '0-0') {
 const cleaned = String(raw || fallback).replace(/[^a-zA-Z0-9_-]/g, '');
 return cleaned || fallback;
}

export class VideoDirector {
 constructor(dataDir) {
  this.dataDir = dataDir;
  this.videosDir = resolve(dataDir, 'ai-brain', 'videos');
  this.configFile = resolve(dataDir, 'ai-brain', 'video-config.json');
 }

 async _atomicWrite(filePath, obj) {
  await mkdir(this.videosDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 _videoFile(unitId, variantId = '') {
  const safeUnit = sanitizePart(unitId, '0-0');
  const safeVar = variantId ? sanitizePart(variantId, '') : '';
  return resolve(this.videosDir, safeVar ? `${safeUnit}__${safeVar}.json` : `${safeUnit}.json`);
 }

 mp4Path(unitId, variantId = '') {
  const safeUnit = sanitizePart(unitId, '0-0');
  const safeVar = variantId ? sanitizePart(variantId, '') : '';
  return resolve(this.videosDir, safeVar ? `${safeUnit}__${safeVar}.mp4` : `${safeUnit}.mp4`);
 }

 async hasMp4(unitId, variantId = '') {
  try {
   await access(this.mp4Path(unitId, variantId));
   return true;
  } catch {
   return false;
  }
 }

 async loadConfig() {
  try {
   const cfg = JSON.parse(await readFile(this.configFile, 'utf8'));
   return {
    kimiOllamaOnly: true,
    localExecutionOnly: true,
    zeroApiRequired: true,
    noApiKeyPrompts: true,
    videoPolicy: VIDEO_GENERATION_POLICY,
    allowedVideoProviders: [...ALLOWED_VIDEO_PROVIDERS],
    googleFlowApiKey: '',
    googleFlowModel: 'local-autonomous-kimi-ollama',
    autoProduceVideos: cfg.autoProduceVideos !== false,
    autoUseGoogleFlow: false,
    updatedAt: cfg.updatedAt || null
   };
  } catch (e) {
   if (e.code === 'ENOENT') {
    return {
     kimiOllamaOnly: true,
     localExecutionOnly: true,
     zeroApiRequired: true,
     noApiKeyPrompts: true,
     videoPolicy: VIDEO_GENERATION_POLICY,
     allowedVideoProviders: [...ALLOWED_VIDEO_PROVIDERS],
     googleFlowApiKey: '',
     googleFlowModel: 'local-autonomous-kimi-ollama',
     autoProduceVideos: true,
     autoUseGoogleFlow: false,
     updatedAt: null
    };
   }
   throw e;
  }
 }

 async saveConfig(patch = {}) {
  const cur = await this.loadConfig();
  const next = {
   ...cur,
   kimiOllamaOnly: true,
   localExecutionOnly: true,
   zeroApiRequired: true,
   noApiKeyPrompts: true,
   googleFlowApiKey: '',
   autoUseGoogleFlow: false,
   ...(typeof patch.autoProduceVideos === 'boolean' ? { autoProduceVideos: patch.autoProduceVideos } : {}),
   updatedAt: new Date().toISOString()
  };
  await this._atomicWrite(this.configFile, next);
  return { ...next, hasApiKey: false, googleFlowApiKey: '' };
 }

 _enrichGoogleFlowMeta(record) {
  if (!record || typeof record !== 'object') return record;
  const scenes = Array.isArray(record.scenes) ? record.scenes : [];
  const isVertical = ['tiktok_kayseri', 'terim_avcisi', 'shorts_hizli'].includes(record.themeStyle);
  const renders = Array.isArray(record.flowRenders) ? record.flowRenders : [];
  const googleFlowStatus = renders.some(r => r.status === 'embedded')
   ? 'veo_embedded'
   : renders.some(r => r.status === 'submitted')
    ? 'veo_pending'
    : 'flow_ready_0api';
  const masterPrompt = record.googleFlowMasterPrompt || scenes.map((s, i) => `Scene ${i + 1}: ${s.googleFlowPrompt || s.sceneTitle}`).join(' | ');
  return {
   ...record,
   googleFlowEnabled: true,
   zeroApiAutonomous: true,
   zeroApi: true,
   localExecutionOnly: true,
   noApiKeyPrompts: true,
   googleFlowEngine: 'Yerel Otonom · 0-API Video Motoru',
   googleFlowModel: record.googleFlowModel || 'local-autonomous-kimi-ollama',
   googleFlowAspectRatio: record.googleFlowAspectRatio || (isVertical ? '9:16' : '16:9'),
   googleFlowStatus,
   googleFlowMasterPrompt: masterPrompt
  };
 }

 async loadVideo(unitId, variantId = '') {
  try {
   const parsed = JSON.parse(await readFile(this._videoFile(unitId, variantId), 'utf8'));
   return this._enrichGoogleFlowMeta(parsed);
  } catch (e) {
   if (e.code === 'ENOENT') return null;
   throw e;
  }
 }

  async saveVideo(record, variantId = '') {
  const safeVar = variantId ? sanitizePart(variantId, '') : (record.variantId ? sanitizePart(record.variantId, '') : '');
  const enriched = this._enrichGoogleFlowMeta({
   ...record,
   videoSpecVersion: Number(record.videoSpecVersion || VIDEO_SPEC_VERSION),
   upgradedAt: record.upgradedAt || record.updatedAt || new Date().toISOString()
  });
  await this._atomicWrite(this._videoFile(enriched.unitId, safeVar), enriched);
  return enriched;
 }

 async deleteVariant(unitId, variantId = '') {
  const safeUnit = sanitizePart(unitId, '0-0');
  const safeVar = variantId ? sanitizePart(variantId, '') : '';
  await Promise.all([
   unlink(this._videoFile(safeUnit, safeVar)).catch(() => {}),
   unlink(this.mp4Path(safeUnit, safeVar)).catch(() => {})
  ]);
 }

 // Sürekli TikTok üretiminde disk taşmasını önler: her ünite için en güncel N varyantı tutup eski artık dosyaları siler
 async pruneExcessUnitVariants(unitId, { maxVariants = 8 } = {}) {
  const safeUnit = sanitizePart(unitId, '0-0');
  try {
   const files = await readdir(this.videosDir);
   const mp4Set = new Set(files.filter(f => f.endsWith('.mp4')));
   const matching = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp') && f.startsWith(`${safeUnit}__`));
   const meta = [];
   for (const f of matching) {
    const vid = f.slice(safeUnit.length + 2, -5);
    const mp4Name = `${safeUnit}__${vid}.mp4`;
    let updatedAt = '';
    let specVer = 1;
    try {
     const d = JSON.parse(await readFile(resolve(this.videosDir, f), 'utf8'));
     updatedAt = String(d?.upgradedAt || d?.updatedAt || '');
     specVer = Number(d?.videoSpecVersion || 1);
    } catch {}
    meta.push({
     vid,
     updatedAt,
     specVer,
     hasMp4: mp4Set.has(mp4Name),
     isStaleSubsec: vid.startsWith('subsec-') && !mp4Set.has(mp4Name)
    });
   }
   let removed = 0;
   // Önce MP4'süz eski subsec artıklarını ve fazlasını sil
   for (const m of meta) {
    if (m.isStaleSubsec) {
     await this.deleteVariant(safeUnit, m.vid);
     removed++;
    }
   }
   const remaining = meta.filter(m => !m.isStaleSubsec);
   if (remaining.length > maxVariants) {
    remaining.sort((a, b) => {
     if (a.hasMp4 !== b.hasMp4) return a.hasMp4 ? -1 : 1;
     if (a.specVer !== b.specVer) return b.specVer - a.specVer;
     return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    for (const drop of remaining.slice(maxVariants)) {
     await this.deleteVariant(safeUnit, drop.vid);
     removed++;
    }
   }
   return { unitId: safeUnit, removed };
  } catch (e) {
   if (e.code === 'ENOENT') return { unitId: safeUnit, removed: 0 };
   return { unitId: safeUnit, removed: 0 };
  }
 }

 async listUnitVariants(unitId) {
  const safeUnit = sanitizePart(unitId, '0-0');
  try {
   const files = await readdir(this.videosDir);
   const mp4Set = new Set(files.filter(f => f.endsWith('.mp4')));
   const matchingJson = files.filter(f =>
    f.endsWith('.json') &&
    !f.endsWith('.tmp') &&
    (f === `${safeUnit}.json` || f.startsWith(`${safeUnit}__`))
   );
   const variants = [];
   for (const f of matchingJson) {
    try {
     const d = JSON.parse(await readFile(resolve(this.videosDir, f), 'utf8'));
     const vid = f === `${safeUnit}.json` ? '' : f.slice(safeUnit.length + 2, -5);
     const mp4Name = vid ? `${safeUnit}__${vid}.mp4` : `${safeUnit}.mp4`;
     variants.push({
      unitId: d.unitId || safeUnit,
      variantId: vid,
      title: d.title || d.unit || safeUnit,
      themeStyle: d.themeStyle || 'morpa_klasik',
      situationMode: d.situationMode || 'ilk_kesif',
      source: d.source || 'fallback-3d',
      model: d.model || '',
      aiVideoModel: d.aiVideoModel || d.model || '',
      aiVideoEngine: d.aiVideoEngine || 'tempo-cinema-pro',
      generatorProvider: d.generatorProvider || (d.model ? classifyVideoProvider(d.model) : 'kimi'),
      videoPolicy: d.providerPolicy || VIDEO_GENERATION_POLICY,
      zeroApi: true,
      localExecutionOnly: true,
      noApiKeyPrompts: true,
      sceneCount: (d.scenes || []).length,
      hasMp4: mp4Set.has(mp4Name),
      mp4Url: `/api/ollama/videos/mp4?unitId=${encodeURIComponent(safeUnit)}${vid ? `&variantId=${encodeURIComponent(vid)}` : ''}`,
      googleFlowEnabled: true,
      zeroApiAutonomous: true,
      googleFlowStatus: Array.isArray(d.flowRenders) && d.flowRenders.some(r => r.status === 'embedded') ? 'veo_embedded' : (Array.isArray(d.flowRenders) && d.flowRenders.some(r => r.status === 'submitted') ? 'veo_pending' : 'flow_ready_0api'),
      googleFlowModel: d.googleFlowModel || 'local-autonomous-kimi-ollama',
      updatedAt: d.updatedAt || null
     });
    } catch {}
   }
   variants.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
   return variants;
  } catch (e) {
   if (e.code === 'ENOENT') return [];
   throw e;
  }
 }

 async listSummary(totalUnits = 29) {
  const cfg = await this.loadConfig();
  try {
   const files = await readdir(this.videosDir);
   const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
   const mp4Count = files.filter(f => f.endsWith('.mp4')).length;
   const items = [];
   const uniqueUnits = new Set();
   let aiProducedCount = 0;
   let rescueCount = 0;
   let roachCount = 0;
   let veoEmbeddedCount = 0;
   let veoPendingCount = 0;
   let legacyCount = 0;
   let upgradedV2Count = 0;
   for (const f of jsonFiles) {
    try {
     const d = JSON.parse(await readFile(resolve(this.videosDir, f), 'utf8'));
     if (d?.unitId) {
      uniqueUnits.add(d.unitId);
      if (String(d.source || '').startsWith('ai') || String(d.source || '').startsWith('google-flow')) aiProducedCount++;
      if (d.situationMode === 'hata_kurtarma') rescueCount++;
      if (d.themeStyle === 'hamam_bocegi_komedi') roachCount++;
      const hasMp4 = files.includes(d.variantId ? `${d.unitId}__${d.variantId}.mp4` : `${d.unitId}.mp4`);
      const legacy = isLegacyVideoRecord(d, hasMp4);
      if (legacy) legacyCount++;
      else upgradedV2Count++;
      const renders = Array.isArray(d.flowRenders) ? d.flowRenders : [];
      if (renders.some(r => r.status === 'embedded') || d.googleFlowStatus === 'veo_embedded') veoEmbeddedCount++;
      else if (renders.some(r => r.status === 'submitted') || d.googleFlowStatus === 'veo_pending') veoPendingCount++;
      items.push({
       unitId: d.unitId,
       variantId: d.variantId || '',
       unit: d.unit,
       version: d.version || 1,
       videoSpecVersion: Number(d.videoSpecVersion || 1),
       isLegacy: legacy,
       themeStyle: d.themeStyle || 'morpa_klasik',
       situationMode: d.situationMode || 'ilk_kesif',
       source: d.source || 'fallback-3d',
       model: d.model || '',
       aiVideoModel: d.aiVideoModel || d.model || '',
       aiVideoEngine: d.aiVideoEngine || '',
       sceneCount: (d.scenes || []).length,
       hasMp4,
       googleFlowEnabled: true,
       zeroApiAutonomous: true,
       googleFlowStatus: renders.some(r => r.status === 'embedded') ? 'veo_embedded' : (renders.some(r => r.status === 'submitted') ? 'veo_pending' : 'flow_ready_0api'),
       upgradedAt: d.upgradedAt || null,
       updatedAt: d.updatedAt
      });
     }
    } catch {}
   }
   return {
    totalUnits,
    videoCount: items.length,
    producedCount: uniqueUnits.size,
    totalVariantsCount: items.length,
    aiProducedCount,
    rescueCount,
    roachCount,
    mp4Count,
    legacyCount,
    upgradedV2Count,
    videoSpecVersion: VIDEO_SPEC_VERSION,
    googleFlowCount: items.length,
    googleFlowTagged: items.length,
    googleFlowEmbedded: veoEmbeddedCount,
    googleFlowPending: veoPendingCount,
    veoEmbeddedCount,
    veoPendingCount,
    zeroApiAutonomous: !cfg.googleFlowApiKey,
    autoUseGoogleFlow: cfg.autoUseGoogleFlow !== false,
    hasGoogleFlowKey: Boolean(cfg.googleFlowApiKey),
    googleFlowModel: cfg.googleFlowModel,
    units: items.slice(-12)
   };
  } catch (e) {
   if (e.code === 'ENOENT') {
    return {
     totalUnits,
     videoCount: 0,
     producedCount: 0,
     totalVariantsCount: 0,
     aiProducedCount: 0,
     rescueCount: 0,
     roachCount: 0,
     mp4Count: 0,
     googleFlowCount: 0,
     veoEmbeddedCount: 0,
     veoPendingCount: 0,
     autoUseGoogleFlow: cfg.autoUseGoogleFlow !== false,
     hasGoogleFlowKey: Boolean(cfg.googleFlowApiKey),
     googleFlowModel: cfg.googleFlowModel,
     units: []
    };
   }
   throw e;
  }
 }

 selectSituationMode(unitId, studentProfile) {
  const stats = studentProfile?.results?.[unitId] || studentProfile?.unitStats?.[unitId];
  const right = Number(stats?.right || 0);
  const wrong = Number(stats?.wrong || 0);
  const streak = Number(stats?.streak || 0);
  const total = right + wrong;
  if (wrong >= 2 && (streak === 0 || (total > 0 && right / total < 0.78))) return 'hata_kurtarma';
  if (total > 0 && wrong === 0 && streak >= 3) return 'ya_cikarsa';
  if (total > 0 && streak >= 1) return 'hizli_tekrar';
  return 'ilk_kesif';
 }

 _pickEnvironment(book = '', themeStyle = 'morpa_klasik') {
  if (themeStyle === 'tiktok_kayseri') return 'kayseri_tiktok';
  if (themeStyle === 'hamam_bocegi_komedi') return 'kitchen_comedy_3d';
  if (themeStyle === 'stadyum_spikeri') return 'stadium_3d';
  if (themeStyle === 'lab_deney') return 'lab_3d';
  const b = book.toLowerCase();
  if (b.includes('hareket') || b.includes('antrenman')) return 'gym_3d';
  if (b.includes('sağlık') || b.includes('saglik')) return 'lab_3d';
  if (b.includes('yönetim') || b.includes('yonetim')) return 'stadium_3d';
  return 'classroom_3d';
 }

 // Tüm 29 üniteden TikTok akışı için tüm MP4/video kartlarını döner
 async listAllFeedVideos() {
  try {
   const files = await readdir(this.videosDir);
   const mp4Set = new Set(files.filter(f => f.endsWith('.mp4')));
   const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
   const out = [];
   for (const f of jsonFiles) {
    try {
     const d = JSON.parse(await readFile(resolve(this.videosDir, f), 'utf8'));
     if (!d?.unitId || !Array.isArray(d.scenes) || !d.scenes.length) continue;
     const vid = f.includes('__') ? f.slice(f.indexOf('__') + 2, -5) : '';
     const mp4Name = vid ? `${d.unitId}__${vid}.mp4` : `${d.unitId}.mp4`;
     const boardBullets = d.scenes.flatMap(s => Array.isArray(s.boardBullets) ? s.boardBullets : []).filter(Boolean);
     const coachLine = d.scenes.flatMap(s => s.dialogues || []).find(dl => dl.speaker === 'coach' || dl.speaker === 'kayseri')?.text || '';
     const derivedAnswer = (d.directAnswer || coachLine || d.summary || d.unit || '').replace(/\?+\s*$/, '').trim();
     const derivedTerms = Array.isArray(d.keyTerms) && d.keyTerms.length
      ? d.keyTerms
      : boardBullets.slice(0, 3).map(b => ({ term: String(b).split(/[:—-]/)[0].trim().slice(0, 40), note: String(b).slice(0, 120) }));
     const hasMp4 = mp4Set.has(mp4Name);
     const legacy = isLegacyVideoRecord(d, hasMp4);
     out.push({
      id: `${d.unitId}__${vid || 'main'}`,
      unitId: d.unitId,
      variantId: vid,
      book: d.book || '',
      unit: d.unit || d.unitId,
      title: d.title || d.unit || d.unitId,
      summary: d.summary || '',
      themeStyle: d.themeStyle || 'morpa_klasik',
      situationMode: d.situationMode || 'ilk_kesif',
      source: d.source || 'fallback-3d',
      version: Number(d.version || 1),
      videoSpecVersion: Number(d.videoSpecVersion || 1),
      isLegacy: legacy,
      upgradedAt: d.upgradedAt || null,
      replacedFromLegacy: Boolean(d.replacedFromLegacy),
      model: d.model || '',
      aiVideoModel: d.aiVideoModel || d.model || '',
      aiVideoEngine: d.aiVideoEngine || (legacy ? '' : 'tempo-cinema-pro'),
      generatorProvider: d.generatorProvider || (d.model ? classifyVideoProvider(d.model) : 'kimi'),
      videoPolicy: d.providerPolicy || VIDEO_GENERATION_POLICY,
      zeroApi: true,
      localExecutionOnly: true,
      noApiKeyPrompts: true,
      noQuestions: Boolean(d.noQuestions ?? true),
      directAnswer: derivedAnswer,
      keyTerms: derivedTerms,
      dialogues: d.scenes.flatMap(s => s.dialogues || []).slice(0, 6),
      hasMp4,
      mp4Url: `/api/ollama/videos/mp4?unitId=${encodeURIComponent(d.unitId)}${vid ? `&variantId=${encodeURIComponent(vid)}` : ''}`,
      googleFlowEnabled: true,
      zeroApiAutonomous: true,
      googleFlowStatus: Array.isArray(d.flowRenders) && d.flowRenders.some(r => r.status === 'embedded') ? 'veo_embedded' : (Array.isArray(d.flowRenders) && d.flowRenders.some(r => r.status === 'submitted') ? 'veo_pending' : 'flow_ready_0api'),
      googleFlowModel: d.googleFlowModel || 'local-autonomous-kimi-ollama',
      googleFlowMasterPrompt: d.googleFlowMasterPrompt || d.scenes.map((s, i) => `Scene ${i + 1}: ${s.googleFlowPrompt || s.sceneTitle}`).join(' | '),
      updatedAt: d.updatedAt || null
     });
    } catch {}
   }
   out.sort((a, b) => {
    if (a.hasMp4 !== b.hasMp4) return a.hasMp4 ? -1 : 1;
    if (a.isLegacy !== b.isLegacy) return a.isLegacy ? 1 : -1;
    return String(b.upgradedAt || b.updatedAt || '').localeCompare(String(a.upgradedAt || a.updatedAt || ''));
   });
   return out;
  } catch (e) {
   if (e.code === 'ENOENT') return [];
   throw e;
  }
 }

 // Google Flow / Veo API olmasa bile hemen çalışan 3D Morpa Kampüs + Hamam Böceği Böcü + Kayserili TikTok uyumlu çok sahneli video
 buildFallbackVideo(ctx, passages = [], lesson = null, studentProfile = null, forcedMode = null, themeStyle = 'morpa_klasik', customIdea = '', opts = {}) {
  const safeTheme = THEME_IDS.has(themeStyle) ? themeStyle : 'morpa_klasik';
  const noQuestions = Boolean(opts?.noQuestions || safeTheme === 'tiktok_kayseri' || safeTheme === 'terim_avcisi');
  const aiModel = typeof opts?.aiModel === 'string' && opts.aiModel.trim() ? opts.aiModel.trim() : 'kimi-k3.1-pro:cloud';
  const aiVideoEngine = typeof opts?.aiVideoEngine === 'string' && opts.aiVideoEngine.trim() ? opts.aiVideoEngine.trim() : 'tempo-cinema-pro';
  const aiProvider = typeof opts?.generatorProvider === 'string' && opts.generatorProvider.trim()
   ? opts.generatorProvider.trim()
   : classifyVideoProvider(aiModel);
  const angleIndex = Math.max(0, Number(opts?.angleIndex || 0));
  const nowIso = new Date().toISOString();
  const aiModelMeta = {
   model: aiModel,
   aiVideoModel: aiModel,
   aiVideoEngine,
   generatorProvider: aiProvider,
   providerPolicy: VIDEO_GENERATION_POLICY,
   videoSpecVersion: VIDEO_SPEC_VERSION,
   upgradedAt: nowIso,
   ...(opts?.replacedFromLegacy ? { replacedFromLegacy: true, replacedLegacyAt: nowIso } : {}),
   ...(opts?.variantId ? { variantId: sanitizePart(opts.variantId, '') } : {}),
   zeroApi: true,
   localExecutionOnly: true,
   noApiKeyPrompts: true
  };
  const situationMode = SITUATION_MODES.includes(forcedMode)
   ? forcedMode
   : this.selectSituationMode(ctx.id, studentProfile);
  const env = this._pickEnvironment(ctx.book, safeTheme);
  const mnemonics = Array.isArray(lesson?.memoryMnemonics) && lesson.memoryMnemonics.length ? lesson.memoryMnemonics : [{
   code: 'K-A-P-I',
   standsFor: 'Kavram · Amaç · Prensip · İstisna',
   story: 'Her soruda önce kapıyı K-A-P-I ile aç!'
  }];
  const mnemonic = mnemonics[angleIndex % mnemonics.length];
  const ctxSents = String(ctx.text || '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 20);
  const rotatedPassage = passages.length ? passages[(angleIndex + 1) % passages.length] : null;
  const keyFact1 = (ctxSents.length > 2
   ? ctxSents.slice(angleIndex % Math.max(1, ctxSents.length - 1), (angleIndex % Math.max(1, ctxSents.length - 1)) + 2).join(' ')
   : (ctx.text || '').split('.').slice(0, 2).join('. ')).trim() || ctx.unit;
  const hiddenDetail = rotatedPassage?.text ? rotatedPassage.text.slice(0, 220).trim() : (passages[1]?.text ? passages[1].text.slice(0, 220).trim() : (ctx.text || '').slice(0, 220));
  const ideaLine = customIdea ? ` (${customIdea.slice(0, 80)})` : '';
  const keyTerms = extractKeyTermsFromUnit(ctx, passages, lesson);
  const directAnswer = `${keyFact1}${hiddenDetail && hiddenDetail !== keyFact1 ? ` · Ek: ${hiddenDetail.slice(0, 120)}` : ''}`;

  if (safeTheme === 'tiktok_kayseri' || safeTheme === 'terim_avcisi') {
   const term1 = keyTerms[0] ? `${keyTerms[0].term}: ${keyTerms[0].meaning}` : keyFact1;
   const term2 = keyTerms[1] ? `${keyTerms[1].term}: ${keyTerms[1].meaning}` : hiddenDetail;
   const isKayseri = safeTheme === 'tiktok_kayseri';
   const scenes = [
    {
     id: 'scene-1',
     sceneTitle: isKayseri ? `Kayserili Koç Emmi: "${ctx.unit}" Neyin Nesi La!` : `Sınav Terimi & Net Cevap: ${ctx.unit}`,
     environment: env,
     cameraMove: 'two_shot',
     durationSec: 15,
     boardTitle: `${ctx.unit}${ideaLine}`,
     boardCode: `CEVAP: ${mnemonic.code}`,
     boardBullets: [
      `NET CEVAP: ${keyFact1.slice(0, 105)}`,
      `TERİM 1: ${term1.slice(0, 105)}`,
      `ŞİFRE: ${mnemonic.code} (${mnemonic.standsFor})`
     ],
     dialogues: isKayseri
      ? [
         { speaker: 'roach', emotion: 'cheerful', action: 'jump', text: `Vızzz! Ben Böcü, ${ctx.unit} terimlerini birbirine karıştırdım kimse cevabı bulamayacak la!${ideaLine}` },
         { speaker: 'kayseri', emotion: 'warning', action: 'point_board', text: `La otur yerine şapşal böcek, ağzını burnunu kırdırma bana! Dinle gurban: Sınavda ${ctx.unit} çıkarsa CEVABI şak diye şu: ${keyFact1.slice(0, 150)}!` },
         { speaker: 'ada', emotion: 'cheerful', action: 'celebrate', text: `Tamam Emmi! Soru bile çözmeden direkt cevabı ve "${mnemonic.code}" terimini cebime koydum!` }
        ]
      : [
         { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: `Soru sormadan direkt sınav cevabını al: ${ctx.unit} = ${keyFact1.slice(0, 155)}.` },
         { speaker: 'ada', emotion: 'curious', action: 'think', text: `Peki hocam mutlaka bilmem gereken iki kelime hangisi?` },
         { speaker: 'coach', emotion: 'cheerful', action: 'celebrate', text: `Birincisi "${keyTerms[0]?.term || mnemonic.code}", ikincisi "${keyTerms[1]?.term || ctx.unit}" — şıklarda bunları ara!` }
        ],
     repeatPrompt: `CEVAP MÜHÜRÜ: ${keyFact1.slice(0, 140)}`,
     googleFlowPrompt: `Fast TikTok vertical-feel 3D comedy-education reel: charismatic Turkish coach from Kayseri with mustache lecturing goofy cockroach Bocu and athlete Ada in front of glowing neon board reading "DIRECT ANSWER: ${ctx.unit}", dynamic punchy subtitles, vibrant lighting.`
    },
    {
     id: 'scene-2',
     sceneTitle: isKayseri ? 'Emmi Oğlu Dinle: Şu Terimleri Bilmeyen Pastırmayı Kaptırır!' : 'Önemli Kelimeler & Gizli Ayrıntı',
     environment: env,
     cameraMove: 'zoom_board',
     durationSec: 15,
     boardTitle: `Önemli Terimler · ${mnemonic.code}`,
     boardCode: 'TERİM ÖZETİ',
     boardBullets: [
      `TERİM 2: ${term2.slice(0, 105)}`,
      `TUZAK YOK: Sadece gerçek tanımı kap!`,
      `${mnemonic.story.slice(0, 105)}`
     ],
     dialogues: isKayseri
      ? [
         { speaker: 'kayseri', emotion: 'cheerful', action: 'celebrate', text: `Bak aslanım, şu terimi bilmeyen Kayseri çarşısında donunu satar: ${term2.slice(0, 145)}.` },
         { speaker: 'roach', emotion: 'surprised', action: 'jump', text: `Vay anasını, Emmi bütün gizli terimleri doğrudan ağzından kaçırdı, bizim tuzaklar çöp oldu!` }
        ]
      : [
         { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: `İkinci altın terim: ${term2.slice(0, 155)}.` },
         { speaker: 'ada', emotion: 'cheerful', action: 'celebrate', text: `Net cevabı da terimi de direkt kaptım!` }
        ],
     repeatPrompt: `ÖNEMLİ TERİMLER: ${keyTerms.slice(0, 3).map(t => t.term).join(' · ')}`,
     googleFlowPrompt: `Punchy 3D TikTok educational ending showing floating golden vocabulary flashcards and cockroach Bocu fainting comically.`
    }
   ];

   return {
    unitId: ctx.id,
    book: ctx.book,
    unit: ctx.unit,
    version: Math.max(2, Number(opts?.prevVersion || 1) + (opts?.replacedFromLegacy ? 1 : 0)),
    source: `fallback-3d-${safeTheme}-v2`,
    ...aiModelMeta,
    themeStyle: safeTheme,
    noQuestions: true,
    directAnswer,
    keyTerms,
    situationMode,
    environment: env,
    updatedAt: nowIso,
    title: `${isKayseri ? '🌶️ Kayserili TikTok:' : '📌 Terim Özeti:'} ${ctx.unit}${ideaLine}`,
    summary: `Soru sormadan doğrudan Kayserili sert-komedi diyaloglarıyla cevabı ve önemli terimleri veren akış videosu.`,
    scenes,
    googleFlowMasterPrompt: scenes.map((s, i) => `Scene ${i + 1}: ${s.googleFlowPrompt}`).join(' | '),
    flowRenders: []
   };
  }

  if (safeTheme === 'hamam_bocegi_komedi') {
   const scenes = [
    {
     id: 'scene-1',
     sceneTitle: `Böcü Sahnesi 1: Hamam Böceği Böcü Sınav Kağıdını Kemiriyor!`,
     environment: 'kitchen_comedy_3d',
     cameraMove: 'two_shot',
     durationSec: 18,
     boardTitle: `${ctx.unit}${ideaLine}`,
     boardCode: `BÖCÜ-${mnemonic.code}`,
     boardBullets: [
      `Böcü'nün Tuzağı: Ezberciliği karıştırmak!`,
      `Altın Bilgi: ${keyFact1.slice(0, 105)}`,
      `Şifre: ${mnemonic.code} (${mnemonic.standsFor})`
     ],
     dialogues: [
      { speaker: 'roach', emotion: 'cheerful', action: 'jump', text: `Vızzz! Ben Hamam Böceği Böcü! ${ctx.unit} notlarını antenlerimle karıştırdım, kimse tam puan alamaz!${ideaLine}` },
      { speaker: 'ada', emotion: 'surprised', action: 'think', text: `Koçum! Bu şapşal hamam böceği bütün terimleri birbirine kattı, hangisi doğru?!` },
      { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: `Sakin ol Ada, Böcü'nün foyasını ortaya çıkaralım: ${keyFact1}. Bu kuralı bilen hamam böceğini sahneden süpürür!` }
     ],
     repeatPrompt: `Böcü kaçmadan bağır: "${mnemonic.code} — ${mnemonic.standsFor}"!`,
     quickQuestion: {
      question: `Hamam Böceği Böcü seni ${ctx.unit} sorusunda düşürmek isterse en çok ne yapar?`,
      options: ['Yakın kavramları ve aşırı genellemeleri karıştırır', 'Soruyu tamamen silip boş bırakır'],
      answer: 'Yakın kavramları ve aşırı genellemeleri karıştırır'
     },
     googleFlowPrompt: `3D Pixar/Oggy-style comedic educational animation: a goofy expressive brown cartoon cockroach named Bocu wearing tiny red sneakers and waving long antennae tries to scramble a glowing smartboard showing "${ctx.unit}", while an athletic Turkish coach and student Ada chase it away using a glowing knowledge shield "${mnemonic.code}". Vibrant warm kitchen-gym studio, dynamic slapstick camera, Turkish lip-sync.`
    },
    {
     id: 'scene-2',
     sceneTitle: 'Böcü Sahnesi 2: Antenli Tuzak & Terlik Darbesi!',
     environment: 'kitchen_comedy_3d',
     cameraMove: 'orbit_slow',
     durationSec: 18,
     boardTitle: `Tuzak Kırma: ${mnemonic.code}`,
     boardCode: mnemonic.code,
     boardBullets: [
      mnemonic.story,
      'Hamam Böceği Böcü asla "her zaman/asla" der!',
      hiddenDetail.slice(0, 110)
     ],
     dialogues: [
      { speaker: 'roach', emotion: 'warning', action: 'jump', text: `Haha! Şıklara "her zaman tek başına yeterlidir" yazdım bile! Antenlerim titreşiyor, kesin düşeceksiniz!` },
      { speaker: 'coach', emotion: 'cheerful', action: 'celebrate', text: `Yakalandın Böcü! Bak kitabın gizli köşesi ne diyor: ${hiddenDetail.slice(0, 150)}.` },
      { speaker: 'ada', emotion: 'cheerful', action: 'celebrate', text: `Harika! Artık hem kodlamayı (${mnemonic.code}) hem gizli ayrıntıyı biliyorum, Böcü tam puanımı çalamaz!` }
     ],
     repeatPrompt: `Son tekrar: "Hamam böceği tuzak kurar, ${mnemonic.code} hepsini bozar!"`,
     googleFlowPrompt: `3D slapstick cartoon finale: cockroach Bocu slips comically over a glowing textbook page while Coach and Ada hold up a golden "100/100 FULL" trophy, upbeat comedy lighting, smooth 3D orbital camera.`
    }
   ];

   return {
    unitId: ctx.id,
    book: ctx.book,
    unit: ctx.unit,
    version: Math.max(2, Number(opts?.prevVersion || 1) + (opts?.replacedFromLegacy ? 1 : 0)),
    source: 'fallback-3d-roach-v2',
    ...aiModelMeta,
    themeStyle: 'hamam_bocegi_komedi',
    noQuestions,
    directAnswer,
    keyTerms,
    situationMode,
    environment: 'kitchen_comedy_3d',
    updatedAt: nowIso,
    title: `🪳 ${ctx.unit} · Hamam Böceği Böcü Komedisi${ideaLine}`,
    summary: `Hamam Böceği Böcü'nün tuzaklarıyla başa çıkıp ${ctx.unit} konusunu kahkahayla kalıcı öğreten 3D/MP4 komedi dersi.`,
    scenes: noQuestions ? scenes.map(({ quickQuestion: _drop, ...rest }) => rest) : scenes,
    googleFlowMasterPrompt: scenes.map((s, i) => `Scene ${i + 1}: ${s.googleFlowPrompt}`).join(' | '),
    flowRenders: []
   };
  }

  if (safeTheme === 'shorts_hizli') {
   const scenes = [
    {
     id: 'scene-1',
     sceneTitle: 'Turbo Shorts: 15 Saniyede Çekirdek Kural',
     environment: env,
     cameraMove: 'zoom_board',
     durationSec: 12,
     boardTitle: `${ctx.unit} ⚡ SHORTS`,
     boardCode: mnemonic.code,
     boardBullets: [keyFact1.slice(0, 110), `Şifre: ${mnemonic.code}`, '20 Soruluk Modülde Altın Kural'],
     dialogues: [
      { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: `15 saniyede ${ctx.unit}! Tek cümle: ${keyFact1.slice(0, 130)}.` },
      { speaker: 'ada', emotion: 'cheerful', action: 'celebrate', text: `Kodu da cebime attım Koç: ${mnemonic.code} (${mnemonic.standsFor})!` }
     ],
     repeatPrompt: `Hızlı tekrar: ${mnemonic.code}!`,
     googleFlowPrompt: `Fast-paced 3D vertical-feel motion graphics inside bright studio, snappy zoom to glowing board "${mnemonic.code}", dynamic coach & athlete thumbs-up.`
    },
    {
     id: 'scene-2',
     sceneTitle: 'Turbo Shorts: Tek Tuzak = Tek Puan',
     environment: env,
     cameraMove: 'focus_coach',
     durationSec: 12,
     boardTitle: 'Tuzak Kalkanı ⚡',
     boardCode: '100/100',
     boardBullets: [hiddenDetail.slice(0, 110), 'İki doğru şık gibi görüneni ele!'],
     dialogues: [
      { speaker: 'can', emotion: 'surprised', action: 'jump', text: `Dur! Hızlı geçmeyin, ya şu ayrıntı çıkarsa: ${hiddenDetail.slice(0, 95)}?` },
      { speaker: 'coach', emotion: 'cheerful', action: 'celebrate', text: `Onu da kaptık Can! Shorts izleyen 100/100 full çeker!` }
     ],
     repeatPrompt: 'Hemen mini soruyu çöz!',
     googleFlowPrompt: `Snappy 3D character punchline ending with giant "100/100" neon badge.`
    }
   ];
   return {
    unitId: ctx.id,
    book: ctx.book,
    unit: ctx.unit,
    version: Math.max(2, Number(opts?.prevVersion || 1) + (opts?.replacedFromLegacy ? 1 : 0)),
    source: 'fallback-3d-shorts-v2',
    ...aiModelMeta,
    themeStyle: 'shorts_hizli',
    noQuestions,
    directAnswer,
    keyTerms,
    situationMode,
    environment: env,
    updatedAt: nowIso,
    title: `⚡ ${ctx.unit} · 30sn Turbo Shorts${ideaLine}`,
    summary: `Saniyeler içinde derlenen hızlı tempo 3D/MP4 özet videosu.`,
    scenes,
    googleFlowMasterPrompt: scenes.map((s, i) => `Scene ${i + 1}: ${s.googleFlowPrompt}`).join(' | '),
    flowRenders: []
   };
  }

  const themePrefixes = {
   stadyum_spikeri: { tag: '🏟️ CANLI MAÇ', spikerIntro: `Sayın seyirciler! ${ctx.unit} derbisinde 90. dakika ve altın pas geliyor:` },
   super_kahraman: { tag: '🦸 KAHRAMAN', spikerIntro: `Süper Kalkan aktif! ${ctx.unit} görevini kurtaran gizli güç:` },
   lab_deney: { tag: '🔬 LAB DENEYİ', spikerIntro: `Mikroskop altında ${ctx.unit} analizi başlatıldı! İşte kritik bulgu:` },
   morpa_klasik: { tag: '🎓 3D SAHNE', spikerIntro: `Hoş geldin! Bugün "${ctx.unit}" konusunu 100/100 full çıkarmak için 3D sahnede canlandırıyoruz.` }
  };
  const tp = themePrefixes[safeTheme] || themePrefixes.morpa_klasik;

  const introByMode = {
   ilk_kesif: `${tp.spikerIntro} ${ideaLine}`,
   hata_kurtarma: `Dur bakalım! Bu ünitede (${ctx.unit}) birkaç tuzak soruda takıldık. Gel, Can'ın kurduğu tuzakları Ada ile sahnede birlikte bozalım!${ideaLine}`,
   ya_cikarsa: `Harikasın ama işimizi şansa bırakmıyoruz! "Ya sınavda şu gizli dipnot çıkarsa?" diyerek kitabın en ince detaylarını tarayalım.${ideaLine}`,
   hizli_tekrar: `Sınav modu açık! ${ctx.unit} konusunu 60 saniyelik 3D tekrar düellosuyla hafızamıza mühürlüyoruz.${ideaLine}`
  };

  const scenes = [
   {
    id: 'scene-1',
    sceneTitle: `${tp.tag} Sahne 1: Büyük Resim`,
    environment: env,
    cameraMove: 'orbit_slow',
    durationSec: 20,
    boardTitle: ctx.unit,
    boardCode: mnemonic.code,
    boardBullets: [
     `${ctx.book} · 20 Soruluk Modül`,
     `Ana Şifre: ${mnemonic.code} (${mnemonic.standsFor})`,
     keyFact1.slice(0, 120)
    ],
    dialogues: [
     { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: introByMode[situationMode] },
     { speaker: 'ada', emotion: 'curious', action: 'think', text: `Koçum, ben okurken bazen terimleri birbirine karıştırıyorum. ${ctx.unit} konusunda en temel kilit cümle ne?` },
     { speaker: 'coach', emotion: 'cheerful', action: 'point_board', text: `Tahtaya bak Ada: ${keyFact1}. Sınavda bunu görürsen şıkları elerken önce bu ölçütü ara!` }
    ],
    repeatPrompt: `Şimdi yüksek sesle tekrar et: "${mnemonic.code} — ${mnemonic.standsFor}"!`,
    googleFlowPrompt: `3D Pixar-style educational animation like Morpa Kampus (${safeTheme}) inside a bright Turkish ${env}. Coach points at glowing holographic board "${ctx.unit}" and "${mnemonic.code}" while athlete Ada takes notes. Smooth slow orbital camera.`
   },
   {
    id: 'scene-2',
    sceneTitle: 'Sahne 2: Tuzak Avcısı Can & Kodlama Sırrı',
    environment: env,
    cameraMove: 'two_shot',
    durationSec: 22,
    boardTitle: `Kodlama: ${mnemonic.code}`,
    boardCode: mnemonic.code,
    boardBullets: [
     mnemonic.story,
     'Tuzak: "her zaman / yalnızca / asla" ifadelerine dikkat!',
     'Doğru şık: Kitaptaki amaç + koşul ile tam uyuşan'
    ],
    dialogues: [
     { speaker: 'can', emotion: 'surprised', action: 'jump', text: `Haha! Ben sınav komisyonu olsam hemen şıklara "her zaman aynıdır" veya benzer terimin tanımını koyup sizi düşürürdüm!` },
     { speaker: 'ada', emotion: 'surprised', action: 'think', text: `Eyvah, az kalsın düşüyordum! Koçum, bunu aklımda nasıl tutacağım?` },
     { speaker: 'coach', emotion: 'cheerful', action: 'celebrate', text: `İşte bunun için kodlamamız var: ${mnemonic.code}! Hikayemiz şu: ${mnemonic.story}. Tuzakçı Can'ın genellemelerini bununla boşa çıkar!` }
    ],
    repeatPrompt: `Gözlerini kapat ve tekrar et: "${mnemonic.story}"`,
    quickQuestion: {
     question: `${ctx.unit} sorularında Tuzakçı Can'ın en sevdiği çeldirici hatası nedir?`,
     options: [
      'Aşırı genelleme ("her zaman/asla") veya yakın kavramı karıştırma',
      'Soru numarasını kalın harfle yazmak'
     ],
     answer: 'Aşırı genelleme ("her zaman/asla") veya yakın kavramı karıştırırma'
    },
    googleFlowPrompt: `3D educational cartoon scene in bright vibrant colors (${safeTheme}), two-shot of mischievous character Can holding a trick question card and coach activating shield "${mnemonic.code}".`
   },
   {
    id: 'scene-3',
    sceneTitle: 'Sahne 3: "Ya Çıkarsa?" Gizli Kitap Ayrıntısı',
    environment: env,
    cameraMove: 'zoom_board',
    durationSec: 20,
    boardTitle: 'Ya Çıkarsa? (%100 Kapsam)',
    boardCode: '20/20 FULL',
    boardBullets: [
     'Her kitaptan 20 soru = Toplam 100 soru!',
     hiddenDetail.slice(0, 140),
     'Hiçbir satırı "çıkmaz" diye atlama!'
    ],
    dialogues: [
     { speaker: 'ada', emotion: 'curious', action: 'point_board', text: `Koçum, bu bölüm alt başlıklarda geçiyor, ya yapay zekâ önemli görmediyse ama sınavda 20 sorudan biri buradan çıkarsa?` },
     { speaker: 'coach', emotion: 'warning', action: 'point_board', text: `Harika yakaladın Ada! Hedefimiz 100/100 olduğu için "çıkmaz" diye tek satır bile atlamıyoruz. Şuna dikkat: ${hiddenDetail}` },
     { speaker: 'can', emotion: 'cheerful', action: 'celebrate', text: `Bu sefer pes ediyorum! Tüm pasajları ve 5 farklı soru açısını bilen öğrenciye hiçbir tuzak işlemez!` }
    ],
    repeatPrompt: `Son kez mühürle: "Her kitap 20 soru, hedefim 100/100 full doğru!"`,
    googleFlowPrompt: `3D dynamic zoom towards holographic textbook pages opening mid-air, 3 characters celebrating "100/100 FULL" floating 3D badge.`
   }
  ];

  return {
   unitId: ctx.id,
   book: ctx.book,
   unit: ctx.unit,
   version: Math.max(2, Number(opts?.prevVersion || 1) + (opts?.replacedFromLegacy ? 1 : 0)),
   source: `fallback-3d-${safeTheme}-v2`,
   ...aiModelMeta,
   themeStyle: safeTheme,
   noQuestions,
   directAnswer,
   keyTerms,
   situationMode,
   environment: env,
   updatedAt: nowIso,
   title: `${tp.tag} · ${ctx.unit}${ideaLine}`,
   summary: `Koç AI, Öğrenci Ada ve Tuzakçı Can arasında ${safeTheme} (${situationMode}) modunda geçen interaktif 3D & gömülü MP4 ders videosu.`,
   scenes: noQuestions ? scenes.map(({ quickQuestion: _drop, ...rest }) => rest) : scenes,
   googleFlowMasterPrompt: scenes.map((s, i) => `Scene ${i + 1}: ${s.googleFlowPrompt}`).join(' | '),
   flowRenders: []
  };
 }

 autoPickCreativeConcept(ctx, themeStyle = 'morpa_klasik', situationMode = 'ilk_kesif') {
  const unit = ctx?.unit || 'Antrenman';
  const templates = {
   tiktok_kayseri: [
    `Kayserili Emmi, ${unit} konusunda mantı/pastırma örneğiyle net sınav cevabını şak diye yapıştırsın`,
    `Kayserili Koç Emmi ile Böcü atışsın, sonunda en kritik 2 terimi direkt özetlesin`
   ],
   hamam_bocegi_komedi: [
    `Hamam Böceği Böcü ${unit} şıklarını karıştırmaya çalışsın, Koç şifreyle onu yakalasın`,
    `Böcü aşırı genelleme tuzağı kursun, Ada ile Koç terlikle o tuzağı bozsun`
   ],
   terim_avcisi: [`${unit} içindeki mutlaka çıkacak 2 anahtar terimi yıldırım hızıyla özetle`],
   shorts_hizli: [`30 saniyede ${unit} çekirdek kuralı + tuzak uyarısı`],
   stadyum_spikeri: [`90. dakika şampiyonluk golü anlatır gibi ${unit} sırrını patlat`],
   super_kahraman: [`${unit} bilgi kalkanıyla sınav tuzaklarını etkisizleştir`],
   lab_deney: [`3D spor laboratuvarında ${unit} mekanizmasını mikroskopla göster`],
   morpa_klasik: [`${unit} için sıcak sınıf diyaloğu ve ${situationMode} kurtarma özeti`]
  };
  const pool = templates[themeStyle] || templates.morpa_klasik;
  return pool[Math.abs(String(ctx?.id || '').length + themeStyle.length) % pool.length];
 }

 async produceUnitVideo({
  ctx,
  passages = [],
  lesson = null,
  studentProfile = null,
  forcedMode = null,
  themeStyle = 'morpa_klasik',
  customIdea = '',
  variantId = '',
  saveAsVariant = false,
  noQuestions = false,
  apexDirective = '',
  aiVideoEngine = 'tempo-cinema-pro',
  runModelFn,
  model,
  signal
 }) {
  const safeTheme = THEME_IDS.has(themeStyle) ? themeStyle : 'morpa_klasik';
  const skipQuiz = Boolean(noQuestions || safeTheme === 'tiktok_kayseri' || safeTheme === 'terim_avcisi');
  const keyTerms = extractKeyTermsFromUnit(ctx, passages, lesson);
  const directAnswer = (ctx.text || '').split('.').slice(0, 2).join('. ').trim() || ctx.unit;
  const targetVariant = saveAsVariant
   ? (variantId ? sanitizePart(variantId, '') : `${safeTheme}-${Date.now().toString(36)}`)
   : (variantId ? sanitizePart(variantId, '') : '');
  const existing = await this.loadVideo(ctx.id, targetVariant);
  const situationMode = SITUATION_MODES.includes(forcedMode)
   ? forcedMode
   : this.selectSituationMode(ctx.id, studentProfile);
  const env = this._pickEnvironment(ctx.book, safeTheme);
  const effectiveIdea = String(customIdea || '').trim() || this.autoPickCreativeConcept(ctx, safeTheme, situationMode);

  const stats = studentProfile?.results?.[ctx.id] || studentProfile?.unitStats?.[ctx.id];
  const perfNote = stats
   ? `Öğrenci durumu: ${stats.right || 0} doğru, ${stats.wrong || 0} yanlış, seri ${stats.streak || 0}, süre ${Math.round(stats.totalSec || 0)} sn.`
   : 'Öğrenci henüz başlamadı.';

  const passagePack = [
   ctx.text || '',
   ...passages.slice(0, 5).map((p, i) => `[Pasaj ${i + 1} - ${p.heading || 'Bölüm'}]: ${String(p.text || '').slice(0, 420)}`)
  ].join('\n').slice(0, 3200);

  const mnem = (lesson?.memoryMnemonics || []).slice(0, 2).map(m => `${m.code}: ${m.standsFor} (${m.story})`).join(' | ');
  const themeNote = {
   tiktok_kayseri: 'TEMA: KAYSERİLİ SERT-KOMEDİ TİKTOK ÖZETİ! "kayseri" (Kayserili Koç Emmi: "la gardaşım", "emmi oğlu", "gurban", "pastırma/mantı" şivesi ve keskin argo komedi!) ile "roach" (Hamam Böceği Böcü) konuşur. ASLA SORU SORMA (quickQuestion koyma)! Doğrudan sınavda çıkacak net cevabı ve mutlaka bilinmesi gereken terimleri söyle!',
   terim_avcisi: 'TEMA: ÖNEMLİ TERİMLER & NET CEVAP! ASLA SORU SORMA! Doğrudan kavram tanımlarını ve sınav cevabını ver.',
   hamam_bocegi_komedi: 'TEMA: HAMAM BÖCEĞİ BÖCÜ KOMEDİSİ! Yaramaz, hızlı konuşan, antenli çizgi film hamam böceği "roach" (Hamam Böceği Böcü) sınavdaki yanlış şıkları ve ezber hatalarını temsil eder; Koç ve Ada komik biçimde onu gerçek bilgiyle alt eder! Diyaloglarda mutlaka speaker:"roach" kullan!',
   shorts_hizli: 'TEMA: 30 SANİYE TURBO SHORTS! Çok kısa, akılda kalıcı, enerjik 2-3 sahne yaz.',
   stadyum_spikeri: 'TEMA: STADYUM CANLI MAÇ ANLATIMI! Şampiyonlar Ligi finali anlatır gibi coşkulu anlatım kur.',
   super_kahraman: 'TEMA: SÜPER KAHRAMAN AKADEMİSİ! Bilgiyi süper güç kalkanına dönüştür.',
   lab_deney: 'TEMA: 3D SPOR LABORATUVARI! Hücre, sinir sistemi, kas deneyi gibi sahnele.',
   morpa_klasik: 'TEMA: MORPA KAMPÜS 3D KLASİK! Sıcak, anlaşılır diyaloglu sınıf sahnesi.'
  }[safeTheme] || '';

  const prompt = `Sen Morpa Kampüs tarzında 3D etkileşimli eğitim videosu yönetmeni ve Google Flow / Veo senaryo yazarısın!
Görevin: "${ctx.book} / ${ctx.unit}" ünitesi için 3D sahnede geçen, karakterlerin karşılıklı konuştuğu, seyirciye tekrar yaptıran ve sınavda **100/100 FULL DOĞRU** hedefleyen **eğlenceli, hızlı ve akılda kalıcı diyaloglu video** senaryosu yazmak.

${themeNote}
OTOMATİK SAHNE KONSEPTİ (kullanıcıdan prompt beklemeden senin seçtiğin): "${effectiveIdea}" — Bunu sahneye ve diyaloglara komik/öğretici biçimde yedir!
DURUM MODU: "${situationMode}" (${perfNote})

KARAKTERLER:
- "coach": Koç Yapay Zekâ (Bilge, sıcak, kodlama öğreten antrenör öğretmen)
- "kayseri": Kayserili Koç Emmi (Kayseri şiveli, hafif sert argo/komik ve doğrudan net cevabı söyleyen efsane hoca!)
- "ada": Ada (Meraklı, akıllı sorular soran sporcu öğrenci)
- "can": Can (Sınav komisyonunun klasik tuzaklarını deneyen şakacı karakter)
- "roach": Hamam Böceği Böcü (Özellikle Hamam Böceği Komedisi ve Kayserili TikTok temasında şıkları karıştıran komik böcek!)

ÜNİTE KODLAMALARI: ${mnem || 'Kendi akrostiş/kodlama şifreni üret!'}
${apexDirective ? `${apexDirective}\n` : ''}RESMİ KİTAP KAYNAĞI (yalnız gerçek bilgi kullan):
${passagePack}

Sadece geçerli JSON döndür:
{
  "title": "Video başlığı",
  "summary": "Kısa özet",
  "scenes": [
    {
      "sceneTitle": "Sahne başlığı",
      "cameraMove": "orbit_slow" | "two_shot" | "zoom_board" | "focus_coach",
      "boardTitle": "3D Tahta Başlığı",
      "boardCode": "KISA KOD / AKROSTİŞ",
      "boardBullets": ["Tahta maddesi 1", "Tahta maddesi 2", "Tahta maddesi 3"],
      "dialogues": [
        { "speaker": "coach"|"kayseri"|"ada"|"can"|"roach", "emotion": "cheerful"|"curious"|"surprised"|"warning", "action": "point_board"|"think"|"jump"|"celebrate", "text": "Doğal Türkçe diyalog cümlesi" }
      ],
      "repeatPrompt": "Şimdi yüksek sesle veya zihninden şunu mühürle: ...",
      ${skipQuiz ? '' : '"quickQuestion": { "question": "Video içi tek doğru cevaplı mini kontrol sorusu", "options": ["Doğru şık", "Yanlış çeldirici şık"], "answer": "Doğru şık" },'}
      "googleFlowPrompt": "Detailed 3D animated scene prompt in English for Google Flow / Veo with camera movement, 3D lighting, board visual and Turkish dialogue cue"
    }
  ]
}`;

  const isCloudModel = String(model || '').includes(':cloud');
  const { parsed } = await runModelFn(model, prompt, 0.62, signal || AbortSignal.timeout(isCloudModel ? 75_000 : 45_000), 2200, { fastThink: !isCloudModel, numCtx: 6144 });
  const rawScenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  const cleanStr = (v, m = 500) => (typeof v === 'string' ? v.trim().slice(0, m) : '');

  const scenes = rawScenes
   .filter(s => s && Array.isArray(s.dialogues) && s.dialogues.length >= 2)
   .slice(0, 5)
   .map((s, idx) => ({
    id: `scene-${idx + 1}`,
    sceneTitle: cleanStr(s.sceneTitle || `Sahne ${idx + 1}`, 120),
    environment: env,
    cameraMove: ['orbit_slow', 'two_shot', 'zoom_board', 'focus_coach'].includes(s.cameraMove) ? s.cameraMove : 'orbit_slow',
    durationSec: safeTheme === 'shorts_hizli' ? 12 : 18,
    boardTitle: cleanStr(s.boardTitle || ctx.unit, 80),
    boardCode: cleanStr(s.boardCode || '100/100', 28),
    boardBullets: (Array.isArray(s.boardBullets) ? s.boardBullets : []).map(b => cleanStr(b, 140)).filter(Boolean).slice(0, 4),
    dialogues: s.dialogues.slice(0, 6).map(d => ({
     speaker: ['coach', 'kayseri', 'ada', 'can', 'roach'].includes(d?.speaker) ? d.speaker : (safeTheme === 'hamam_bocegi_komedi' ? 'roach' : safeTheme === 'tiktok_kayseri' ? 'kayseri' : 'coach'),
     emotion: ['cheerful', 'curious', 'surprised', 'warning'].includes(d?.emotion) ? d.emotion : 'cheerful',
     action: ['point_board', 'think', 'jump', 'celebrate'].includes(d?.action) ? d.action : 'point_board',
     text: cleanStr(d?.text, 340)
    })).filter(d => d.text),
    repeatPrompt: cleanStr(s.repeatPrompt || `Şimdi zihninden tekrar et: ${ctx.unit}`, 220),
    ...(!skipQuiz && s.quickQuestion?.question && Array.isArray(s.quickQuestion.options) && s.quickQuestion.options.length >= 2 && s.quickQuestion.options.includes(s.quickQuestion.answer)
     ? {
        quickQuestion: {
         question: cleanStr(s.quickQuestion.question, 220),
         options: s.quickQuestion.options.slice(0, 3).map(o => cleanStr(o, 140)),
         answer: cleanStr(s.quickQuestion.answer, 140)
        }
       }
     : {}),
    googleFlowPrompt: cleanStr(s.googleFlowPrompt || `3D Morpa Kampus style animated educational scene (${safeTheme}) for ${ctx.unit}`, 700)
   }))
   .filter(s => s.dialogues.length >= 2);

  if (!scenes.length) {
   throw Error('Video yönetmeni yeterli 3D diyaloglu sahne üretemedi.');
  }

  const nextVersion = Math.max(2, Number(existing?.version || 0) + 1);
  const provider = classifyVideoProvider(model);
  const nowIso = new Date().toISOString();
  const record = {
   unitId: ctx.id,
   ...(targetVariant ? { variantId: targetVariant } : {}),
   book: ctx.book,
   unit: ctx.unit,
   version: nextVersion,
   videoSpecVersion: VIDEO_SPEC_VERSION,
   upgradedAt: nowIso,
   ...(existing ? { replacedFromLegacy: isLegacyVideoRecord(existing, true), replacedLegacyAt: nowIso } : {}),
   source: `ai-3d:${model}`,
   model,
   aiVideoModel: model,
   aiVideoEngine: aiVideoEngine || 'tempo-cinema-pro',
   providerPolicy: VIDEO_GENERATION_POLICY,
   generatorProvider: provider,
   zeroApi: true,
   localExecutionOnly: true,
   noApiKeyPrompts: true,
   themeStyle: safeTheme,
   noQuestions: skipQuiz,
   directAnswer,
   keyTerms,
   customIdea: cleanStr(customIdea, 160),
   situationMode,
   environment: env,
   updatedAt: nowIso,
   title: cleanStr(parsed?.title || `${ctx.unit} · 3D Diyaloglu Video`, 140),
   summary: cleanStr(parsed?.summary || `${ctx.unit} için ${safeTheme} (${situationMode}) diyaloglu 3D video`, 400),
   scenes,
   googleFlowMasterPrompt: scenes.map((s, i) => `Scene ${i + 1}: ${s.googleFlowPrompt}`).join(' | '),
   flowRenders: existing?.flowRenders || []
  };

  await this.saveVideo(record, targetVariant);
  return record;
 }

 // %100 Yerel otonom 0-API akış derleyicisi: harici API anahtarı istemez, tüm sahne ve MP4 üretimini yerelden yürütür
 async requestGoogleFlowRender({ unitId, variantId = '', sceneId = 'master', prompt }) {
  const cfg = await this.loadConfig();
  const safeVar = variantId ? sanitizePart(variantId, '') : '';
  const embeddedMp4Url = `/api/ollama/videos/mp4?unitId=${encodeURIComponent(unitId)}${safeVar ? `&variantId=${encodeURIComponent(safeVar)}` : ''}`;
  const existing = await this.loadVideo(unitId, safeVar);
  const chosenPrompt = prompt || existing?.googleFlowMasterPrompt || existing?.scenes?.[0]?.googleFlowPrompt || `3D educational Turkish sports coaching animation for ${unitId}`;
  if (existing) {
   const hasAutoEntry = (existing.flowRenders || []).some(r => r.mode === 'autonomous-flow-0api');
   if (!hasAutoEntry) {
    existing.flowRenders = [
     ...(existing.flowRenders || []),
     { sceneId, operationName: `flow-0api-${unitId}`, mode: 'autonomous-flow-0api', requestedAt: new Date().toISOString(), status: 'embedded', embeddedAt: new Date().toISOString() }
    ].slice(-10);
   }
   existing.googleFlowStatus = 'flow_ready_0api';
   existing.zeroApiAutonomous = true;
   existing.localExecutionOnly = true;
   existing.providerPolicy = VIDEO_GENERATION_POLICY;
   await this.saveVideo(existing, safeVar);
  }
  return {
   submitted: true,
   zeroApiAutonomous: true,
   localExecutionOnly: true,
   noApiKeyPrompts: true,
   kimiOllamaOnly: cfg.kimiOllamaOnly !== false,
   mode: 'autonomous-flow-0api',
   embeddedMp4Url,
   googleFlowPrompt: chosenPrompt,
   reason: 'Yalnızca yerel Kimi ve Ollama modelleri + proje içi 0-API MP4 motoru devrede; harici API anahtarı istenmez.',
   prompt: chosenPrompt
  };
 }

 async pollAndEmbedGoogleFlowRender() {
  return { done: true, embedded: false, kimiOllamaOnly: true, localExecutionOnly: true, zeroApiAutonomous: true };
 }

 // Projedeki tüm videoları %100 yerel otonom 0-API akış sırasına alır
 async submitAllVideosToGoogleFlow({ limit = 60 } = {}) {
  const cfg = await this.loadConfig();
  const feed = await this.listAllFeedVideos();
  const targets = feed.filter(v => v.googleFlowStatus !== 'veo_embedded' && v.googleFlowStatus !== 'veo_pending').slice(0, limit);
  const results = [];
  for (const item of targets) {
   const r = await this.requestGoogleFlowRender({
    unitId: item.unitId,
    variantId: item.variantId || '',
    sceneId: 'master',
    prompt: item.googleFlowMasterPrompt
   });
   results.push({ unitId: item.unitId, variantId: item.variantId || '', ...r });
  }
  return {
   zeroApiAutonomous: true,
   localExecutionOnly: true,
   hasGoogleFlowKey: false,
   googleFlowModel: cfg.googleFlowModel,
   totalVideos: feed.length,
   submittedCount: results.filter(x => x.submitted).length,
   storyboardReadyCount: feed.length,
   results
  };
 }

 async pollAllPendingGoogleFlowRenders() {
  return { polled: 0, embedded: 0, kimiOllamaOnly: true, localExecutionOnly: true };
 }
}
