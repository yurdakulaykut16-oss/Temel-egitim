import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pause, Play, RefreshCw, Search, Sparkles, Square, Users, Volume2 } from 'lucide-react';
import { books } from './data';
import { deepDive } from './extra';
import { unique } from './unique';
import { advanced } from './advanced';
import { newQuestions } from './newQuestions';
import { bookNotes } from './bookNotes';
import { expanded } from './expanded';
import {
 CHARACTER_ROLES,
 CharacterRole,
 fetchVoiceStudioCatalog,
 getAllAvailableVoices,
 getCharacterCast,
 getSelectedVoiceId,
 getVoiceRate,
 resetCharacterCast,
 setCharacterVoice,
 setSelectedVoiceId,
 setVoiceRate,
 speakWithVoiceStudio,
 splitSpeechChunks,
 stopVoiceStudio,
 VoiceProfile
} from './tts/voiceStudio';

// Breaking narration into short utterances avoids browser engines cutting off long text.
export function speechChunks(text: string): string[] {
 return splitSpeechChunks(text, 220);
}

const SAMPLE_PREVIEW_TEXT =
 'Merhaba şampiyon! Bugün antrenman bilimi terimlerini ve sınav şifrelerini sıfır API anahtarıyla, akıcı Türkçe sesle öğreniyoruz.';

export function VoiceStudio() {
 const [bi, setBi] = useState(0);
 const [ui, setUi] = useState(0);
 const [rate, setRate] = useState<number>(() => getVoiceRate());
 const [voices, setVoices] = useState<VoiceProfile[]>(() => getAllAvailableVoices());
 const [selectedId, setSelectedId] = useState<string>(() => getSelectedVoiceId());
 const [localReady, setLocalReady] = useState(false);
 const [checkingLocal, setCheckingLocal] = useState(false);
 const [category, setCategory] = useState<string>('Tümü');
 const [search, setSearch] = useState('');
 const [cast, setCast] = useState<Record<CharacterRole, string>>(() => getCharacterCast());
 const [previewingId, setPreviewingId] = useState<string>('');
 const [activeEngine, setActiveEngine] = useState<string>('');

 const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
 const [error, setError] = useState('');
 const [part, setPart] = useState(0);
 const [total, setTotal] = useState(0);
 const generation = useRef(0);

 const refreshVoices = async (forceLocal = false) => {
  setCheckingLocal(true);
  try {
   const res = await fetchVoiceStudioCatalog(forceLocal);
   setVoices(res.voices);
   setLocalReady(res.localAvailable);
  } finally {
   setCheckingLocal(false);
  }
 };

 useEffect(() => {
  refreshVoices(false);
  const onVoicesChanged = () => {
   setVoices(getAllAvailableVoices());
  };
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
   window.speechSynthesis.addEventListener?.('voiceschanged', onVoicesChanged);
  }
  return () => {
   generation.current++;
   stopVoiceStudio();
   if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.removeEventListener?.('voiceschanged', onVoicesChanged);
   }
  };
 }, []);

 const categories = useMemo(() => {
  const counts: Record<string, number> = { Tümü: voices.length };
  for (const v of voices) {
   counts[v.category] = (counts[v.category] || 0) + 1;
  }
  return Object.entries(counts);
 }, [voices]);

 const filteredVoices = useMemo(() => {
  const q = search.trim().toLocaleLowerCase('tr-TR');
  return voices.filter(v => {
   if (category !== 'Tümü' && v.category !== category) return false;
   if (!q) return true;
   return (
    v.label.toLocaleLowerCase('tr-TR').includes(q) ||
    v.description.toLocaleLowerCase('tr-TR').includes(q) ||
    v.category.toLocaleLowerCase('tr-TR').includes(q) ||
    v.language.toLocaleLowerCase('tr-TR').includes(q)
   );
  });
 }, [voices, category, search]);

 const selectedVoice = useMemo(
  () => voices.find(v => v.id === selectedId) || voices[0],
  [voices, selectedId]
 );

 const stop = () => {
  generation.current++;
  stopVoiceStudio();
  setStatus('idle');
  setPart(0);
  setPreviewingId('');
 };

 const selectAndPreviewVoice = async (voice: VoiceProfile) => {
  setSelectedId(voice.id);
  setSelectedVoiceId(voice.id);
  setError('');
  setStatus('idle');
  setPreviewingId(voice.id);
  const token = ++generation.current;
  const sample = voice.id.includes('kayseri') || voice.id.includes('crusty')
   ? 'La aslanım! Sınavda çıkacak net cevabı ve şifreyi tek seferde kap, pastırmayı kaptırma!'
   : voice.id.includes('bocu') || voice.id.includes('quacks')
    ? 'Vızzz! Ben Böcü! Tüm şıkları karıştırırım sanıyordun ama bu ses beni yakaladı!'
    : SAMPLE_PREVIEW_TEXT;
  try {
   await speakWithVoiceStudio(sample, {
    voiceId: voice.id,
    rate,
    onStart: (_p, engine) => {
     if (token === generation.current) setActiveEngine(engine);
    },
    onEnd: () => {
     if (token === generation.current) setPreviewingId('');
    }
   });
  } catch {
   if (token === generation.current) setPreviewingId('');
  }
 };

 const testCharacterVoice = async (role: CharacterRole) => {
  const voiceId = cast[role];
  const samples: Record<CharacterRole, string> = {
   coach: 'Harika gidiyorsun! Anahtar şifreyi hatırla ve sadece resmi kitap bilgisini işaretle.',
   kayseri: 'La gurban, otur yerine! Sınavdaki tek doğru cevap kabak gibi ortada duruyor!',
   roach: 'Vızzz! Ben Hamam Böceği Böcü! Aşırı genelleme tuzağımla herkesi düşüreceğim!',
   ada: 'Hocam bu kavramın spor sahasındaki pratik karşılığını hemen özetleyebilir miyiz?',
   can: 'Şıklara bak! Hepsi mantıklı görünüyor ama ben yine en tuzaklı kelimelere dikkat edeceğim.',
   narrator: 'Ünite özeti: Düzenli fiziksel egzersiz planlı, yapılandırılmış ve tekrarlı hareketlerdir.'
  };
  setError('');
  setPreviewingId(`role:${role}`);
  const token = ++generation.current;
  await speakWithVoiceStudio(samples[role], {
   voiceId,
   rate,
   onStart: (_p, engine) => {
    if (token === generation.current) setActiveEngine(engine);
   },
   onEnd: () => {
    if (token === generation.current) setPreviewingId('');
   }
  });
 };

 const playLesson = async () => {
  stop();
  setError('');
  const id = `${bi}-${ui}`;
  const u = books[bi].units[ui];
  const text = [
   u.title,
   u.lesson,
   deepDive[bi][ui],
   unique[id]?.lesson,
   advanced[id]?.lesson,
   newQuestions[id]?.lesson,
   bookNotes[id]?.text,
   ...expanded[bi][ui],
   `Önemli not: ${u.key}`,
   `Örnek: ${u.example}`
  ]
   .filter(Boolean)
   .join('. ');

  const chunks = speechChunks(text);
  setTotal(chunks.length);
  const token = ++generation.current;
  setStatus('playing');

  for (let i = 0; i < chunks.length; i++) {
   if (token !== generation.current) return;
   setPart(i + 1);
   const res = await speakWithVoiceStudio(chunks[i], {
    voiceId: selectedId,
    rate,
    onStart: (_p, engine) => {
     if (token === generation.current) setActiveEngine(engine);
    }
   });
   if (!res.ok && token === generation.current) {
    setError('Tarayıcı ses çıkışı başlatılamadı. Başka bir ücretsiz ses veya kategori seçebilirsin.');
    setStatus('idle');
    return;
   }
  }
  if (token === generation.current) {
   setStatus('idle');
   setPart(0);
  }
 };

 const togglePause = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (status === 'playing') {
   window.speechSynthesis.pause();
   setStatus('paused');
  } else if (status === 'paused') {
   window.speechSynthesis.resume();
   setStatus('playing');
  }
 };

 return (
  <div className="voice-studio">
   <div className="page-title">
    <div className="eyebrow muted">VOICESTUDIO · 0-API ÜCRETSİZ ÇOKLU SES MERKEZİ</div>
    <h1>
     Voice Studio<span className="accent">.</span>
    </h1>
    <p>
     {voices.length} farklı ücretsiz ses ile derslerini, Kayserili Koç Emmi’yi ve Hamam Böceği Böcü diyaloglarını hiçbir API anahtarı yazmadan dinle.
    </p>
   </div>

   <div className="vs-status-banner">
    <div className="vs-status-left">
     <span className={`vs-dot ${localReady ? 'local' : 'cloud'}`} />
     <div>
      <strong>
       {localReady
        ? 'VoiceStudio Yerel Sunucu Bağlı (Port 3900 · OmniVoice Aktif)'
        : '0-API Çoklu Ücretsiz Motor Aktif (Speechify + OpenAI + ElevenLabs + Türkçe Karakter DSP)'}
      </strong>
      <div className="muted vs-sub">
       Seçili ses: <b>{selectedVoice?.emoji} {selectedVoice?.label}</b>
       {activeEngine ? ` · Son motor: ${activeEngine}` : ''}
      </div>
     </div>
    </div>
    <button
     className="outline vs-refresh-btn"
     onClick={() => refreshVoices(true)}
     disabled={checkingLocal}
    >
     <RefreshCw size={14} className={checkingLocal ? 'spin' : ''} />{' '}
     {checkingLocal ? 'Kontrol ediliyor…' : 'VoiceStudio Yenile'}
    </button>
   </div>

   <div className="voice-card">
    <div className="voice-heading">
     <span className="voice-symbol">
      <Volume2 size={24} />
     </span>
     <div>
      <b>Sesli Ders Okuyucu (Audiobook)</b>
      <p>Seçtiğin VoiceStudio sesiyle tüm üniteyi, genişletilmiş notları ve örnekleri dinle.</p>
     </div>
    </div>

    <div className="voice-fields">
     <label>
      Kitap
      <select
       value={bi}
       onChange={e => {
        stop();
        setBi(Number(e.target.value));
        setUi(0);
       }}
      >
       {books.map((b, i) => (
        <option value={i} key={b.title}>
         {b.title}
        </option>
       ))}
      </select>
     </label>
     <label>
      Ünite
      <select
       value={ui}
       onChange={e => {
        stop();
        setUi(Number(e.target.value));
       }}
      >
       {books[bi].units.map((u, i) => (
        <option value={i} key={u.title}>
         {i + 1}. {u.title}
        </option>
       ))}
      </select>
     </label>
     <label>
      Aktif Anlatıcı Sesi ({voices.length} Ücretsiz)
      <select
       value={selectedId}
       onChange={e => {
        setSelectedId(e.target.value);
        setSelectedVoiceId(e.target.value);
       }}
       disabled={status !== 'idle'}
      >
       {voices.map(v => (
        <option key={v.id} value={v.id}>
         {v.emoji} {v.label} ({v.category})
        </option>
       ))}
      </select>
     </label>
     <label>
      Konuşma Hızı: {rate.toFixed(2)}x
      <input
       type="range"
       min="0.6"
       max="1.5"
       step="0.05"
       value={rate}
       onChange={e => {
        const next = Number(e.target.value);
        setRate(next);
        setVoiceRate(next);
       }}
       disabled={status !== 'idle'}
      />
     </label>
    </div>

    <p className="voice-current">
     {books[bi].short} · {books[bi].units[ui].title}
    </p>

    <div className="voice-controls">
     {status === 'idle' ? (
      <button className="primary" onClick={playLesson}>
       <Play size={16} /> Seçili Sesle Dinlemeye Başla
      </button>
     ) : (
      <>
       <button className="primary" onClick={togglePause}>
        {status === 'playing' ? (
         <>
          <Pause size={16} /> Duraklat
         </>
        ) : (
         <>
          <Play size={16} /> Devam et
         </>
        )}
       </button>
       <button className="outline" onClick={stop}>
        <Square size={15} /> Durdur
       </button>
      </>
     )}
    </div>

    <p className="voice-status" role="status">
     {status === 'idle'
      ? 'Dinlemeye hazır'
      : `${status === 'playing' ? 'Seslendiriliyor' : 'Duraklatıldı'} · Bölüm ${part} / ${total}`}
    </p>
    {error && (
     <p className="voice-error" role="alert">
      {error}
     </p>
    )}
   </div>

   <div className="voice-card vs-section-card">
    <div className="vs-section-head">
     <div className="voice-heading" style={{ marginBottom: 0 }}>
      <span className="voice-symbol">
       <Users size={22} />
      </span>
      <div>
       <b>Diyalog Karakter Ses Kadrosu</b>
       <p>Her karakteri farklı bir ücretsiz VoiceStudio sesiyle konuştur (konu anlatımı ve sesli dinlemeye otomatik bağlanır).</p>
      </div>
     </div>
     <button
      className="outline"
      onClick={() => setCast(resetCharacterCast())}
     >
      Varsayılan Kadroya Dön
     </button>
    </div>

    <div className="vs-cast-grid">
     {CHARACTER_ROLES.map(item => (
      <div className="vs-cast-card" key={item.role}>
       <div className="vs-cast-top">
        <span className="vs-cast-emoji">{item.emoji}</span>
        <div>
         <strong>{item.label}</strong>
         <div className="muted vs-cast-hint">{item.hint}</div>
        </div>
       </div>
       <div className="vs-cast-actions">
        <select
         value={cast[item.role] || item.defaultVoiceId}
         onChange={e => setCast(setCharacterVoice(item.role, e.target.value))}
        >
         {voices.map(v => (
          <option key={v.id} value={v.id}>
           {v.emoji} {v.label}
          </option>
         ))}
        </select>
        <button
         className="outline vs-mini-btn"
         onClick={() => testCharacterVoice(item.role)}
        >
         <Volume2 size={13} /> {previewingId === `role:${item.role}` ? 'Çalıyor…' : 'Test Et'}
        </button>
       </div>
      </div>
     ))}
    </div>
   </div>

   <div className="voice-card vs-section-card">
    <div className="vs-section-head">
     <div className="voice-heading" style={{ marginBottom: 0 }}>
      <span className="voice-symbol">
       <Sparkles size={22} />
      </span>
      <div>
       <b>Tüm Ücretsiz VoiceStudio Sesleri ({filteredVoices.length} / {voices.length})</b>
       <p>Bir karta tıkla, ses örneğini hemen dinle ve anlatıcı olarak seç.</p>
      </div>
     </div>
     <div className="vs-search-box">
      <Search size={14} />
      <input
       type="text"
       value={search}
       onChange={e => setSearch(e.target.value)}
       placeholder="Ses ara (emmi, teacher, onyx, fısıltı…)"
      />
     </div>
    </div>

    <div className="vs-cat-tabs">
     {categories.map(([cat, count]) => (
      <button
       key={cat}
       className={`vs-cat-tab ${category === cat ? 'active' : ''}`}
       onClick={() => setCategory(cat)}
      >
       {cat} <span className="vs-cat-count">{count}</span>
      </button>
     ))}
    </div>

    <div className="vs-catalog-grid">
     {filteredVoices.map(v => {
      const isSelected = v.id === selectedId;
      const isPreviewing = previewingId === v.id;
      return (
       <div
        key={v.id}
        className={`vs-voice-item ${isSelected ? 'selected' : ''}`}
        onClick={() => selectAndPreviewVoice(v)}
       >
        <div className="vs-voice-top">
         <span className="vs-voice-emoji">{v.emoji}</span>
         <div className="vs-voice-meta">
          <div className="vs-voice-title">{v.label}</div>
          <div className="vs-voice-badges">
           <span className="vs-badge">{v.category}</span>
           <span className="vs-badge muted">{v.language}</span>
           {isSelected && (
            <span className="vs-badge ok">
             <Check size={11} /> Seçili
            </span>
           )}
          </div>
         </div>
        </div>
        <p className="vs-voice-desc">{v.description}</p>
        <div className="vs-voice-foot">
         <button
          className={isSelected ? 'primary vs-mini-btn' : 'outline vs-mini-btn'}
          onClick={e => {
           e.stopPropagation();
           selectAndPreviewVoice(v);
          }}
         >
          <Volume2 size={13} /> {isPreviewing ? 'Çalıyor…' : 'Dinle & Seç'}
         </button>
        </div>
       </div>
      );
     })}
    </div>
   </div>

   <div className="notice">
    <Volume2 size={20} />
    <span>
     Hiçbir API anahtarı girmen gerekmez: tüm ücretsiz sesler anında tarayıcı + 0-API ses motorlarıyla çalışır. İstersen terminalde <code>npm run dev:voicestudio</code> komutuyla tam yerel neural VoiceStudio (port 3900 / OmniVoice) sunucusunu da açabilirsin.
    </span>
   </div>
  </div>
 );
}
