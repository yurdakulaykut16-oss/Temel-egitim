export interface LocalVoiceStudioVoice {
 id: string;
 name: string;
 type: 'profile' | 'voice_design' | string;
 language: string;
 description: string;
 instruct?: string;
 previewUrl?: string;
}

const VOICESTUDIO_BASE = '/voicestudio';

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let cachedHealth: { available: boolean; at: number } = { available: false, at: 0 };
const HEALTH_TTL_MS = 45_000;

export function stopLocalVoiceStudio(): void {
 if (activeAudio) {
  try {
   activeAudio.pause();
   activeAudio.currentTime = 0;
  } catch {}
  activeAudio = null;
 }
 if (activeUrl) {
  try {
   URL.revokeObjectURL(activeUrl);
  } catch {}
  activeUrl = null;
 }
}

export async function voiceStudioIsAvailable(force = false): Promise<boolean> {
 const now = Date.now();
 if (!force && now - cachedHealth.at < HEALTH_TTL_MS) {
  return cachedHealth.available;
 }
 try {
  const h = await fetch(`${VOICESTUDIO_BASE}/health`, {
   signal: AbortSignal.timeout(1200)
  });
  if (!h.ok) {
   cachedHealth = { available: false, at: now };
   return false;
  }
  const m = await fetch(`${VOICESTUDIO_BASE}/models`, {
   signal: AbortSignal.timeout(1500)
  }).catch(() => null);
  if (m && m.ok) {
   const data = (await m.json()) as {
    models?: Array<{ id: string; downloaded?: boolean; installed?: boolean }>;
   };
   const omnivoiceReady = (data.models ?? []).some(
    x => x.id === 'k2-fsa/OmniVoice' && (x.downloaded || x.installed)
   );
   if ((data.models ?? []).length > 0 && !omnivoiceReady) {
    // Health endpoint responded, engine may still work via active backend
    cachedHealth = { available: true, at: now };
    return true;
   }
  }
  cachedHealth = { available: true, at: now };
  return true;
 } catch {
  cachedHealth = { available: false, at: now };
  return false;
 }
}

export async function listLocalVoiceStudioVoices(): Promise<LocalVoiceStudioVoice[]> {
 const ok = await voiceStudioIsAvailable();
 if (!ok) return [];
 const out: LocalVoiceStudioVoice[] = [];
 const seen = new Set<string>();
 try {
  const r = await fetch(`${VOICESTUDIO_BASE}/v1/audio/voices`, {
   signal: AbortSignal.timeout(2000)
  });
  if (r.ok) {
   const data = (await r.json()) as {
    voices?: Array<{
     voice_id: string;
     name: string;
     type?: string;
     language?: string;
     description?: string;
    }>;
   };
   for (const v of data.voices ?? []) {
    if (!v.voice_id || seen.has(v.voice_id)) continue;
    seen.add(v.voice_id);
    out.push({
     id: v.voice_id,
     name: v.name || v.voice_id,
     type: v.type || 'profile',
     language: v.language || 'Çok Dilli',
     description: v.description || '',
     previewUrl: `${VOICESTUDIO_BASE}/profiles/${encodeURIComponent(v.voice_id)}/audio`
    });
   }
  }
 } catch {}

 try {
  const a = await fetch(`${VOICESTUDIO_BASE}/archetypes?limit=150`, {
   signal: AbortSignal.timeout(2200)
  });
  if (a.ok) {
   const data = (await a.json()) as {
    items?: Array<{
     id: string;
     name?: string;
     language?: string;
     instruct?: string;
     preview_url?: string;
    }>;
   };
   for (const item of data.items ?? []) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({
     id: item.id,
     name: item.name || item.id,
     type: 'voice_design',
     language: item.language || 'Çok Dilli',
     description: item.instruct || '',
     instruct: item.instruct || '',
     previewUrl: item.preview_url ? `${VOICESTUDIO_BASE}${item.preview_url.startsWith('/') ? '' : '/'}${item.preview_url}` : ''
    });
   }
  }
 } catch {}

 return out;
}

export async function speakWithLocalVoiceStudio(
 text: string,
 voice = 'demo0001',
 rate = 1,
 onStart?: () => void,
 instruct?: string,
 language = 'tr',
 knownProfileIds?: Set<string>
): Promise<boolean> {
 stopLocalVoiceStudio();
 const clean = text.trim();
 if (!clean) return false;
 if (!(await voiceStudioIsAvailable())) return false;

 // VoiceStudio OpenAI-compat /v1/audio/speech accepts either an installed SQLite profile ID
 // OR 'default' paired with an `instruct` voice-design tag string.
 const resolvedVoice = knownProfileIds && !knownProfileIds.has(voice) && instruct ? 'default' : voice;

 try {
  const res = await fetch(`${VOICESTUDIO_BASE}/v1/audio/speech`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
    model: 'omnivoice',
    voice: resolvedVoice || 'default',
    input: clean,
    response_format: 'mp3',
    speed: Math.min(2.0, Math.max(0.5, rate)),
    language,
    ...(instruct ? { instruct } : {})
   }),
   signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) return false;
  const blob = await res.blob();
  if (!blob || blob.size < 200) return false;
  const url = URL.createObjectURL(blob);
  activeUrl = url;
  const audio = new Audio(url);
  audio.playbackRate = Math.min(1.5, Math.max(0.65, rate));
  activeAudio = audio;
  await new Promise<void>((resolve, reject) => {
   let started = false;
   audio.onplay = () => {
    started = true;
    onStart?.();
   };
   audio.onended = () => {
    stopLocalVoiceStudio();
    resolve();
   };
   audio.onerror = () => {
    stopLocalVoiceStudio();
    reject(new Error('VoiceStudio ses dosyası çalınamadı.'));
   };
   audio.play().catch(err => {
    if (!started) {
     stopLocalVoiceStudio();
     reject(err);
    }
   });
  });
  return true;
 } catch {
  cachedHealth = { available: false, at: Date.now() };
  return false;
 }
}
