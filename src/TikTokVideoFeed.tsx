import { useCallback, useEffect, useRef, useState } from 'react';
import { speakDialogueSequence, stopVoiceStudio } from './tts/voiceStudio';

export interface KeyTermItem {
 term: string;
 meaning: string;
}

export interface FeedDialogueItem {
 speaker: string;
 emotion?: string;
 action?: string;
 text: string;
}

export interface TikTokFeedItem {
 id: string;
 unitId: string;
 variantId?: string;
 book: string;
 unit: string;
 title: string;
 summary: string;
 themeStyle: string;
 situationMode?: string;
 noQuestions: boolean;
 directAnswer: string;
 keyTerms: KeyTermItem[];
 dialogues: FeedDialogueItem[];
 hasMp4: boolean;
 mp4Url: string;
 aiVideoModel?: string;
 aiVideoEngine?: string;
 generatorProvider?: string;
 zeroApi?: boolean;
 updatedAt?: string | null;
}

interface FeedCoverage {
 filledUnits: number;
 totalUnits: number;
 coveragePct: number;
}

const SPEAKER_BADGE: Record<string, { label: string; cls: string }> = {
 kayseri: { label: '🌶️ KAYSERİLİ EMMİ', cls: 'spk-kayseri' },
 roach: { label: '🪳 BÖCÜ', cls: 'spk-roach' },
 coach: { label: '🎓 KOÇ AI', cls: 'spk-coach' },
 ada: { label: '🏃 ADA', cls: 'spk-ada' },
 can: { label: '🎭 CAN', cls: 'spk-can' }
};

export function TikTokVideoFeed() {
 const [items, setItems] = useState<TikTokFeedItem[]>([]);
 const [coverage, setCoverage] = useState<FeedCoverage>({ filledUnits: 0, totalUnits: 29, coveragePct: 0 });
 const [activeIndex, setActiveIndex] = useState(0);
 const [themeFilter, setThemeFilter] = useState('');
 const [muted, setMuted] = useState(true);
 const [loading, setLoading] = useState(true);
 const [filling, setFilling] = useState(false);
 const [speakingId, setSpeakingId] = useState<string | null>(null);
 const [rendering3dId, setRendering3dId] = useState<string | null>(null);
 const [statusMsg, setStatusMsg] = useState('');
 const [activeModelInfo, setActiveModelInfo] = useState<{ model: string; engine: string }>({
  model: 'kimi-k3.1-pro:cloud',
  engine: 'tempo-cinema-pro'
 });
 const containerRef = useRef<HTMLDivElement | null>(null);
 const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

 const loadFeed = useCallback(async (theme = themeFilter, shuffle = true) => {
  try {
   const qs = new URLSearchParams({ limit: '50', shuffle: shuffle ? '1' : '0' });
   if (theme) qs.set('theme', theme);
   const r = await fetch(`/api/ollama/videos/feed?${qs.toString()}`);
   const d = await r.json();
   if (r.ok && Array.isArray(d.items)) {
    setItems(d.items);
    if (d.coverage) setCoverage(d.coverage);
    if (d.activeVideoModel || d.activeVideoEngine) {
     setActiveModelInfo(prev => ({
      model: d.activeVideoModel || prev.model,
      engine: d.activeVideoEngine || prev.engine
     }));
    }
   }
  } catch {
   // Sessiz yedek
  } finally {
   setLoading(false);
  }
 }, [themeFilter]);

 useEffect(() => {
  loadFeed(themeFilter, true);
  return () => stopVoiceStudio();
 }, [loadFeed, themeFilter]);

 // 29 ünite tam dolana kadar arka plan ilerlemesini otomatik tazele
 useEffect(() => {
  if (coverage.filledUnits >= coverage.totalUnits && coverage.totalUnits > 0) return;
  const t = setInterval(() => {
   loadFeed(themeFilter, false);
  }, 9000);
  return () => clearInterval(t);
 }, [coverage.filledUnits, coverage.totalUnits, loadFeed, themeFilter]);

 // Aktif slayttaki MP4 videoyu oynat, diğerlerini duraklat
 useEffect(() => {
  const activeItem = items[activeIndex];
  for (const [id, el] of Object.entries(videoRefs.current)) {
   if (!el) continue;
   if (activeItem && id === activeItem.id) {
    el.muted = muted;
    el.play().catch(() => {});
   } else {
    el.pause();
   }
  }
 }, [activeIndex, items, muted]);

 const scrollToSlide = (idx: number) => {
  const clamped = Math.max(0, Math.min(items.length - 1, idx));
  setActiveIndex(clamped);
  const el = containerRef.current;
  if (el && el.children[clamped]) {
   (el.children[clamped] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
 };

 const handleScroll = () => {
  const el = containerRef.current;
  if (!el || !items.length) return;
  const h = el.clientHeight || 1;
  const nextIdx = Math.round(el.scrollTop / h);
  if (nextIdx !== activeIndex && nextIdx >= 0 && nextIdx < items.length) {
   setActiveIndex(nextIdx);
  }
 };

 const fillMoreUnits = async (all = false) => {
  setFilling(true);
  setStatusMsg(all ? `Tüm eksik üniteler ${activeModelInfo.model} + ${activeModelInfo.engine} (0-API) ile dolduruluyor...` : `Sonraki eksik üniteler ${activeModelInfo.model} (0-API) ile üretiliyor...`);
  try {
   const r = await fetch('/api/ollama/videos/fill-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(all ? { all: true } : { count: 5 })
   });
   const d = await r.json();
   if (r.ok) {
    setStatusMsg(`${d.filled || 0} yeni ünite ${d.aiVideoModel || activeModelInfo.model} (${d.aiVideoEngine || activeModelInfo.engine} · 0-API) ile üretildi · Kalan: ${d.missingRemaining ?? 0}`);
    await loadFeed(themeFilter, true);
   }
  } catch {
   setStatusMsg('Üretim isteği sırasında geçici hata oluştu.');
  } finally {
   setFilling(false);
  }
 };

 const speakDialogue = (item: TikTokFeedItem) => {
  if (speakingId === item.id) {
   stopVoiceStudio();
   setSpeakingId(null);
   return;
  }
  stopVoiceStudio();
  const lines: Array<{ speaker: string; text: string }> = [
   { speaker: item.themeStyle === 'tiktok_kayseri' ? 'kayseri' : 'coach', text: `${item.unit}. Net cevap: ${item.directAnswer}.` },
   ...(item.dialogues || []).slice(0, 4).map(d => ({ speaker: d.speaker || 'coach', text: d.text })),
   ...(item.keyTerms || []).slice(0, 2).map(k => ({ speaker: 'narrator', text: `Önemli terim ${k.term}: ${k.meaning}` }))
  ];
  setSpeakingId(item.id);
  speakDialogueSequence(lines, {
   rate: 1.05,
   onComplete: () => setSpeakingId(null)
  }).catch(() => setSpeakingId(null));
 };

 const renderSilent3dMp4 = async (item: TikTokFeedItem) => {
  if (rendering3dId) return;
  setRendering3dId(item.id);
  setStatusMsg(`${item.unit} için arka planda 3D animasyonlu MP4 hazırlanıyor...`);
  try {
   const r = await fetch('/api/ollama/videos/render-3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     unitId: item.unitId,
     title: item.title,
     keyPoints: (item.keyTerms || []).slice(0, 3).map(kt => `${kt.term}: ${kt.meaning}`),
     speedProfile: 'turbo'
    })
   });
   const d = await r.json();
   if (r.ok && d.mp4Url) {
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, hasMp4: true, mp4Url: d.mp4Url } : it));
    setStatusMsg(`${item.unit} için 3D animasyonlu MP4 güncellendi.`);
   }
  } catch {
   setStatusMsg('3D animasyon güncellemesi şu an tamamlanamadı.');
  } finally {
   setRendering3dId(null);
  }
 };

 return (
  <div className="tiktok-shell">
   <div className="tiktok-topbar">
    <div className="tiktok-top-left">
     <span className="tiktok-pill">📱 TikTok Akışı · Sorusuz Direkt Cevap</span>
     <span className="tiktok-coverage-pill">
      29 Ünite MP4 Doluluk: <strong>{coverage.filledUnits}/{coverage.totalUnits}</strong> (%{coverage.coveragePct})
     </span>
    </div>
    <div className="tiktok-top-actions">
     <select
      aria-label="Tema Filtresi"
      className="tiktok-select"
      value={themeFilter}
      onChange={e => { setThemeFilter(e.target.value); setActiveIndex(0); }}
     >
      <option value="">🎲 Tüm Üniteler Karışık</option>
      <option value="tiktok_kayseri">🌶️ Kayserili TikTok Özeti</option>
      <option value="hamam_bocegi_komedi">🪳 Hamam Böceği Komedisi</option>
      <option value="terim_avcisi">📌 Terim Avcısı</option>
      <option value="shorts_hizli">⚡ 30sn Turbo Shorts</option>
     </select>
     <button type="button" className="btn-ghost" onClick={() => loadFeed(themeFilter, true)}>
      🔀 Karıştır ({items.length})
     </button>
     <button type="button" className="btn-primary" disabled={filling} onClick={() => fillMoreUnits(false)}>
      {filling ? '⏳ Üretiliyor...' : '⚡ +5 Eksik Üniteyi Doldur'}
     </button>
     {coverage.filledUnits < coverage.totalUnits && (
      <button type="button" className="btn-secondary" disabled={filling} onClick={() => fillMoreUnits(true)}>
       🚀 29/29 Tamamını Doldur
      </button>
     )}
    </div>
   </div>

   <div className="tiktok-progress-bar">
    <div className="tiktok-progress-fill" style={{ width: `${Math.min(100, coverage.coveragePct)}%` }} />
   </div>
   {statusMsg && <div className="tiktok-status-note">{statusMsg}</div>}

   {loading ? (
    <div className="empty-box">TikTok dikey video akışı ve MP4 kütüphanesi hazırlanıyor...</div>
   ) : !items.length ? (
    <div className="empty-box">
     Bu filtrede henüz MP4 video yok. Yukarıdan <strong>+5 Eksik Üniteyi Doldur</strong> düğmesine basarak hemen doldurabilirsin.
    </div>
   ) : (
    <div className="tiktok-viewport-wrap">
     <div
      ref={containerRef}
      className="tiktok-feed-scroll"
      onScroll={handleScroll}
      tabIndex={0}
      onKeyDown={e => {
       if (e.key === 'ArrowDown') { e.preventDefault(); scrollToSlide(activeIndex + 1); }
       if (e.key === 'ArrowUp') { e.preventDefault(); scrollToSlide(activeIndex - 1); }
      }}
     >
      {items.map((item, idx) => (
       <article key={item.id} className="tiktok-card" data-unit={item.unitId}>
        <div className="tiktok-card-stage">
         {item.hasMp4 ? (
          <video
           ref={el => { videoRefs.current[item.id] = el; }}
           className="tiktok-mp4-player"
           src={item.mp4Url}
           controls
           playsInline
           loop
           muted={muted}
           preload={Math.abs(idx - activeIndex) <= 1 ? 'metadata' : 'none'}
          />
         ) : (
          <div className="tiktok-mp4-fallback">MP4 hazırlanıyor...</div>
         )}

         <div className="tiktok-floating-badges">
          <span className="tiktok-badge-unit">📚 {item.book} · {item.unit}</span>
          <span className="tiktok-badge-noquiz">🚫 Sorusuz Direkt Özet</span>
         </div>

         <div className="tiktok-side-rail">
          <button type="button" className="rail-btn" onClick={() => setMuted(m => !m)} title={muted ? 'Sesi Aç' : 'Sesi Kapat'}>
           {muted ? '🔇' : '🔊'}
          </button>
          <button
           type="button"
           className={`rail-btn ${rendering3dId === item.id ? 'active' : ''}`}
           onClick={() => renderSilent3dMp4(item)}
           disabled={Boolean(rendering3dId)}
           title="Arka Planda 3D MP4 Yenile"
          >
           {rendering3dId === item.id ? '⏳' : '🧊'}
          </button>
          <button
           type="button"
           className={`rail-btn ${speakingId === item.id ? 'active' : ''}`}
           onClick={() => speakDialogue(item)}
           title="Kayserili Koç Sesli Okusun"
          >
           {speakingId === item.id ? '⏹️' : '🎙️'}
          </button>
          <button type="button" className="rail-btn" onClick={() => scrollToSlide(idx - 1)} disabled={idx === 0} title="Önceki Video">
           ⬆️
          </button>
          <button type="button" className="rail-btn" onClick={() => scrollToSlide(idx + 1)} disabled={idx >= items.length - 1} title="Sonraki Video">
           ⬇️
          </button>
          <span className="rail-counter">{idx + 1}/{items.length}</span>
         </div>
        </div>

        <div className="tiktok-card-info">
         <h3 className="tiktok-card-title">{item.title}</h3>

         <div className="tiktok-direct-answer">
          <div className="tda-label">🎯 SINAVDA ÇIKARSA NET CEVAP (SORU SORMADAN DİREKT BİLGİ):</div>
          <p className="tda-text">{item.directAnswer}</p>
         </div>

         {item.keyTerms?.length > 0 && (
          <div className="tiktok-terms-box">
           <div className="tda-label">📌 MUTLAKA BİLİNMESİ GEREKEN KELİME & TERİMLER:</div>
           <div className="tiktok-terms-grid">
            {item.keyTerms.slice(0, 4).map((kt, ki) => (
             <div key={ki} className="tiktok-term-chip">
              <strong>{kt.term}:</strong> <span>{kt.meaning}</span>
             </div>
            ))}
           </div>
          </div>
         )}

         {item.dialogues?.length > 0 && (
          <div className="tiktok-dialogue-strip">
           {item.dialogues.slice(0, 3).map((d, di) => {
            const sp = SPEAKER_BADGE[d.speaker] || SPEAKER_BADGE.coach;
            return (
             <div key={di} className="tiktok-dlg-row">
              <span className={`tiktok-spk-badge ${sp.cls}`}>{sp.label}</span>
              <span className="tiktok-dlg-txt">{d.text}</span>
             </div>
            );
           })}
          </div>
         )}
        </div>
       </article>
      ))}
     </div>
    </div>
   )}
  </div>
 );
}
