import {useEffect, useMemo, useState} from 'react';
import {AlertCircle, Check, Layers, RefreshCw, RotateCw, Shuffle, Sparkles, Wand2, X} from 'lucide-react';
import {books} from './data';

export type Flashcard = {
 id: string; unitId: string; book: string; unit: string;
 passageId?: string; passageHeading?: string; pages?: number[];
 front: string; back: string; mnemonic?: string; evidence: string;
 difficulty: 'kolay' | 'orta' | 'zor'; status?: 'approved' | 'rejected'; model?: string;
};

export type MatchingSet = {
 id: string; unitId: string; book: string; unit: string;
 passageId?: string; passageHeading?: string; pages?: number[];
 title: string; pairs: {left: string; right: string}[]; explanation?: string;
 evidence: string; difficulty: 'kolay' | 'orta' | 'zor'; status?: 'approved' | 'rejected'; model?: string;
};

export type DrillItem = {
 id: string; unitId: string; book: string; unit: string;
 passageId?: string; passageHeading?: string; pages?: number[];
 type: 'fill_blank' | 'true_false' | 'recall'; prompt: string; answer: string;
 hint?: string; explanation?: string; evidence: string;
 difficulty: 'kolay' | 'orta' | 'zor'; status?: 'approved' | 'rejected'; model?: string;
};

export type StudyMaterials = {
 flashcards: Flashcard[];
 matchings: MatchingSet[];
 drills: DrillItem[];
};

const api = '/api/ollama';
const difficultyLabel: Record<string, string> = {kolay: 'Kolay', orta: 'Orta', zor: 'Zor'};

export async function getStudyMaterials(): Promise<StudyMaterials> {
 const res = await fetch(`${api}/study-materials`);
 if (!res.ok) throw Error('Çalışma materyalleri alınamadı.');
 return await res.json();
}

export function StudyArcade({
 read,
 weakUnits,
 onStudySignal
}: {
 read: string[];
 weakUnits: string[];
 onStudySignal: (unitId: string, correct: boolean) => void;
}) {
 const [data, setData] = useState<StudyMaterials>({flashcards: [], matchings: [], drills: []});
 const [tab, setTab] = useState<'flashcards' | 'matchings' | 'drills'>('flashcards');
 const [unitFilter, setUnitFilter] = useState<string>('all');
 const [diffFilter, setDiffFilter] = useState<'all' | 'kolay' | 'orta' | 'zor'>('all');
 const [onlyRead, setOnlyRead] = useState(false);
 const [cardIdx, setCardIdx] = useState(0);
 const [flipped, setFlipped] = useState(false);

 // Eşleştirme oyunu durumu
 const [matchIdx, setMatchIdx] = useState(0);
 const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
 const [matchedPairs, setMatchedPairs] = useState<Record<string, boolean>>({});
 const [matchErrors, setMatchErrors] = useState(0);
 const [wrongRightFlash, setWrongRightFlash] = useState<string | null>(null);

 // Tekrar egzersizi durumu
 const [drillIdx, setDrillIdx] = useState(0);
 const [drillAnswer, setDrillAnswer] = useState('');
 const [drillSubmitted, setDrillSubmitted] = useState(false);

 const [generating, setGenerating] = useState(false);
 const [bookQs, setBookQs] = useState<{id: string; unitId: string; book: string; unit: string; question: string; answer: string; options: string[]; testPage?: number}[]>([]);
 const [msg, setMsg] = useState('');
 const [err, setErr] = useState('');

 const allUnits = useMemo(
  () => books.flatMap((b, bi) => b.units.map((u, ui) => ({id: `${bi}-${ui}`, book: b.title, unit: u.title, key: u.key, example: u.example}))),
  []
 );

 useEffect(() => {
  fetch(`${api}/book-questions`)
   .then(r => (r.ok ? r.json() : null))
   .then(d => {
    if (Array.isArray(d?.questions)) setBookQs(d.questions);
   })
   .catch(() => {});
 }, []);

 // Henüz Ollama materyali birikmeden bile başlangıç kartları + 268 resmî kitap sorusu sun (boş kalmasın)
 const fallbackCards: Flashcard[] = useMemo(() => {
  const baseCards: Flashcard[] = allUnits.map(u => ({
   id: `base-${u.id}`,
   unitId: u.id,
   book: u.book,
   unit: u.unit,
   front: `${u.unit}: Bu ünitenin çekirdek kuralı/ilkesi nedir?`,
   back: u.key,
   mnemonic: `Örnek durum: ${u.example}`,
   evidence: u.key,
   difficulty: 'kolay',
   model: 'kitap-özeti'
  }));
  const bookCards: Flashcard[] = bookQs.map(bq => ({
   id: `bk-${bq.id}`,
   unitId: bq.unitId,
   book: bq.book,
   unit: bq.unit,
   front: `📚 ${bq.question}`,
   back: bq.answer,
   mnemonic: `Resmî kitap "neler öğrendik?" değerlendirme sorusu${bq.testPage ? ` (s.${bq.testPage})` : ''}`,
   evidence: `${bq.book} · ${bq.unit}`,
   difficulty: 'orta',
   model: 'kitap-neler-ogrendik'
  }));
  return [...bookCards, ...baseCards];
 }, [allUnits, bookQs]);

 const fallbackMatchings: MatchingSet[] = useMemo(() => {
  return books.map((b, bi) => ({
   id: `bk-match-${bi}`,
   unitId: `${bi}-0`,
   book: b.title,
   unit: b.short,
   title: `${b.short} — Çekirdek Kavram & İlke Eşleştirmesi`,
   pairs: b.units.slice(0, 4).map(u => ({left: u.title, right: u.key.slice(0, 72) + (u.key.length > 72 ? '…' : '')})),
   explanation: `${b.title} kitabının ana ünite ilkelerini pekiştirir.`,
   evidence: b.short,
   difficulty: 'orta',
   model: 'kitap-özeti'
  }));
 }, []);

 const fallbackDrills: DrillItem[] = useMemo(() => {
  return bookQs.map(bq => ({
   id: `bk-drill-${bq.id}`,
   unitId: bq.unitId,
   book: bq.book,
   unit: bq.unit,
   type: 'recall',
   prompt: bq.question,
   answer: bq.answer,
   hint: bq.options.filter(o => o !== bq.answer).slice(0, 2).join(' / '),
   explanation: `Resmî ders kitabı "neler öğrendik?" yanıtı: ${bq.answer}`,
   evidence: `${bq.book}${bq.testPage ? ` (s.${bq.testPage})` : ''}`,
   difficulty: 'orta',
   model: 'kitap-neler-ogrendik'
  }));
 }, [bookQs]);

 const refresh = async () => {
  try {
   const m = await getStudyMaterials();
   setData(m);
  } catch {}
 };

 useEffect(() => {
  refresh();
  const t = setInterval(refresh, 7000);
  return () => clearInterval(t);
 }, []);

 const generateNow = async () => {
  const targetUnit = unitFilter !== 'all' ? unitFilter : (weakUnits[0] || read[0] || '0-0');
  setGenerating(true);
  setErr('');
  setMsg('');
  try {
   const r = await fetch(`${api}/generate-study`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({unitId: targetUnit})
   });
   const res = await r.json();
   if (!r.ok) throw Error(res.error || 'Üretim başarısız.');
   setMsg(`${targetUnit} ünitesi için ${res.added} yeni kart/eşleştirme/tekrar egzersizi Ollama ile üretildi!`);
   await refresh();
  } catch (e) {
   setErr(e instanceof Error ? e.message : 'Üretim başarısız.');
  } finally {
   setGenerating(false);
  }
 };

 const allCards = useMemo(() => {
  const ai = data.flashcards.filter(c => c.status !== 'rejected');
  return [...ai, ...fallbackCards];
 }, [data.flashcards, fallbackCards]);

 const allMatchings = useMemo(() => {
  const ai = data.matchings.filter(m => m.status !== 'rejected');
  return ai.length ? [...ai, ...fallbackMatchings] : fallbackMatchings;
 }, [data.matchings, fallbackMatchings]);

 const allDrills = useMemo(() => {
  const ai = data.drills.filter(d => d.status !== 'rejected');
  return [...ai, ...fallbackDrills];
 }, [data.drills, fallbackDrills]);

 const filterFn = <T extends {unitId: string; difficulty: string}>(list: T[]) =>
  list.filter(item => {
   if (onlyRead && !read.includes(item.unitId)) return false;
   if (unitFilter === 'weak' && !weakUnits.includes(item.unitId)) return false;
   if (unitFilter !== 'all' && unitFilter !== 'weak' && item.unitId !== unitFilter) return false;
   if (diffFilter !== 'all' && item.difficulty !== diffFilter) return false;
   return true;
  });

 const cards = useMemo(() => filterFn(allCards), [allCards, onlyRead, unitFilter, diffFilter, read, weakUnits]);
 const matchings = useMemo(() => filterFn(allMatchings), [allMatchings, onlyRead, unitFilter, diffFilter, read, weakUnits]);
 const drills = useMemo(() => filterFn(allDrills), [allDrills, onlyRead, unitFilter, diffFilter, read, weakUnits]);

 const currentCard = cards[cardIdx % Math.max(1, cards.length)];
 const currentMatch = matchings[matchIdx % Math.max(1, matchings.length)];
 const currentDrill = drills[drillIdx % Math.max(1, drills.length)];

 // Eşleştirme sağ sütunu deterministik ama karıştırılmış sıraya koy
 const shuffledRight = useMemo(() => {
  if (!currentMatch) return [];
  return [...currentMatch.pairs].sort((a, b) => a.right.localeCompare(b.right, 'tr'));
 }, [currentMatch]);

 useEffect(() => {
  setSelectedLeft(null);
  setMatchedPairs({});
  setMatchErrors(0);
  setWrongRightFlash(null);
 }, [currentMatch?.id]);

 useEffect(() => {
  setDrillAnswer('');
  setDrillSubmitted(false);
 }, [currentDrill?.id]);

 const handleRightPick = (rightVal: string) => {
  if (!currentMatch || !selectedLeft) return;
  const pair = currentMatch.pairs.find(p => p.left === selectedLeft);
  if (!pair) return;
  if (pair.right === rightVal) {
   const next = {...matchedPairs, [selectedLeft]: true};
   setMatchedPairs(next);
   setSelectedLeft(null);
   if (Object.keys(next).length === currentMatch.pairs.length) {
    onStudySignal(currentMatch.unitId, matchErrors <= 1);
   }
  } else {
   setMatchErrors(e => e + 1);
   setWrongRightFlash(rightVal);
   onStudySignal(currentMatch.unitId, false);
   setTimeout(() => setWrongRightFlash(null), 550);
  }
 };

 const normalizeAns = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
 const isDrillCorrect = currentDrill
  ? normalizeAns(drillAnswer) === normalizeAns(currentDrill.answer)
  : false;

 return <>
  <div className="page-title">
   <div className="eyebrow muted">ETKİLEŞİMLİ ÖĞRENME · OLLAMA ÜRETİMLİ ÇALIŞMA HAVUZU</div>
   <h1>Kartlar, eşleştirme &amp; tekrar<span className="accent">.</span></h1>
   <p>Test çözmenin ötesinde aktif hatırlama kartları, kavram eşleştirme oyunları ve boşluk doldurma / doğru-yanlış egzersizleriyle konuları kalıcı hâle getir. Zorlandığın üniteler arka planda Ollama'ya otomatik bildirilir.</p>
  </div>

  <div className="telemetry-grid">
   <div className="telemetry-card">
    <div className="telemetry-head"><Layers size={15}/><span>BİLGİ KARTLARI</span></div>
    <strong>{data.flashcards.filter(x => x.status !== 'rejected').length} <small>AI kart</small></strong>
    <p>+{fallbackCards.length} temel özet kartı hazır</p>
   </div>
   <div className="telemetry-card">
    <div className="telemetry-head"><Shuffle size={15}/><span>EŞLEŞTİRME SETİ</span></div>
    <strong>{data.matchings.filter(x => x.status !== 'rejected').length} <small>bulmaca</small></strong>
    <p>1-e-1 tek eşleşmeli kavram oyunu</p>
   </div>
   <div className="telemetry-card">
    <div className="telemetry-head"><RotateCw size={15}/><span>TEKRAR EGZERSİZİ</span></div>
    <strong>{data.drills.filter(x => x.status !== 'rejected').length} <small>alıştırma</small></strong>
    <p>Boşluk doldurma, D/Y ve sözlü anlatım</p>
   </div>
   <div className="telemetry-card">
    <div className="telemetry-head"><Sparkles size={15}/><span>ZAYIF KONU ODAĞI</span></div>
    <strong>{weakUnits.length} <small>ünite</small></strong>
    <p>Yapay zekâ bu ünitelere öncelik veriyor</p>
   </div>
  </div>

  <div className="arcade-toolbar">
   <div className="tabs" style={{marginTop: 0, borderBottom: 0}}>
    <button className={tab === 'flashcards' ? 'selected' : ''} onClick={() => setTab('flashcards')}>Bilgi Kartları ({cards.length})</button>
    <button className={tab === 'matchings' ? 'selected' : ''} onClick={() => setTab('matchings')}>Eşleştirme ({matchings.length})</button>
    <button className={tab === 'drills' ? 'selected' : ''} onClick={() => setTab('drills')}>Tekrar Egzersizleri ({drills.length})</button>
   </div>

   <div className="arcade-filters">
    <select value={unitFilter} onChange={e => { setUnitFilter(e.target.value); setCardIdx(0); setMatchIdx(0); setDrillIdx(0); }}>
     <option value="all">Tüm 29 Ünite</option>
     <option value="weak">Zayıf Olduğum Üniteler ({weakUnits.length})</option>
     {allUnits.map(u => <option key={u.id} value={u.id}>{u.id} · {u.unit}</option>)}
    </select>
    <select value={diffFilter} onChange={e => { setDiffFilter(e.target.value as 'all' | 'kolay' | 'orta' | 'zor'); setCardIdx(0); setMatchIdx(0); setDrillIdx(0); }}>
     <option value="all">Tüm Zorluklar</option>
     <option value="kolay">Kolay</option>
     <option value="orta">Orta</option>
     <option value="zor">Zor</option>
    </select>
    <label className="toggle-pill">
     <input type="checkbox" checked={onlyRead} onChange={e => setOnlyRead(e.target.checked)}/>
     <span>Yalnız tamamladığım üniteler</span>
    </label>
    <button className="primary" onClick={generateNow} disabled={generating} style={{padding: '10px 14px'}}>
     <Wand2 size={15}/> {generating ? 'Üretiliyor...' : 'Ollama ile şimdi üret'}
    </button>
   </div>
  </div>

  {msg && <div className="notice"><Check size={18}/><span>{msg}</span></div>}
  {err && <div className="notice warning"><AlertCircle size={18}/><span>{err}</span></div>}

  {tab === 'flashcards' && (
   !currentCard ? (
    <div className="empty">
     <p>Bu filtrede henüz kart yok. Yukarıdan "Ollama ile şimdi üret" düğmesine basabilir veya filtreyi genişletebilirsin.</p>
    </div>
   ) : (
    <div className="arcade-stage">
     <div className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(f => !f)}>
      <div className="flashcard-meta">
       <span className="eyebrow muted">{currentCard.book} · {currentCard.unit}{currentCard.pages?.length ? ` · s.${currentCard.pages.join(',')}` : ''}</span>
       <span className={`difficulty-tag difficulty-${currentCard.difficulty}`}>{difficultyLabel[currentCard.difficulty]}</span>
      </div>
      {!flipped ? (
       <div className="flashcard-body">
        <small className="eyebrow muted">ÖN YÜZ · CEVABI DÜŞÜN VE KARTA TIKLA</small>
        <h2>{currentCard.front}</h2>
       </div>
      ) : (
       <div className="flashcard-body">
        <small className="eyebrow muted">ARKA YÜZ · NET AÇIKLAMA</small>
        <p className="flashcard-back">{currentCard.back}</p>
        {currentCard.mnemonic && <div className="flashcard-hint"><b>Akılda tutma ipucu:</b> {currentCard.mnemonic}</div>}
        <small className="muted">Kaynak: &quot;{currentCard.evidence}&quot;</small>
       </div>
      )}
     </div>
     <div className="arcade-actions">
      <button className="outline" onClick={() => setFlipped(f => !f)}><RefreshCw size={15}/> Kartı çevir</button>
      <button className="outline" onClick={() => { onStudySignal(currentCard.unitId, false); setFlipped(false); setCardIdx(i => (i + 1) % cards.length); }}>
       <X size={15}/> Zorlandım, tekrar sor
      </button>
      <button className="primary" onClick={() => { onStudySignal(currentCard.unitId, true); setFlipped(false); setCardIdx(i => (i + 1) % cards.length); }}>
       <Check size={15}/> Biliyorum, sonraki kart ({(cardIdx % cards.length) + 1}/{cards.length})
      </button>
     </div>
    </div>
   )
  )}

  {tab === 'matchings' && (
   !currentMatch ? (
    <div className="empty">
     <p>Henüz eşleştirme seti üretilmedi. "Ollama ile şimdi üret" düğmesine basarak seçili ünite için anında 1-e-1 eşleştirme setleri oluşturabilirsin.</p>
    </div>
   ) : (
    <div className="arcade-stage">
     <div className="generated-card">
      <div className="flashcard-meta">
       <span className="eyebrow muted">{currentMatch.book} · {currentMatch.unit}{currentMatch.pages?.length ? ` · s.${currentMatch.pages.join(',')}` : ''}</span>
       <span className={`difficulty-tag difficulty-${currentMatch.difficulty}`}>{difficultyLabel[currentMatch.difficulty]}</span>
      </div>
      <h3>{currentMatch.title}</h3>
      <p>Soldan bir kavram seç, sağdan onun tek doğru eşini bul. (Hata: {matchErrors})</p>
      <div className="match-board">
       <div className="match-col">
        {currentMatch.pairs.map(p => {
         const done = Boolean(matchedPairs[p.left]);
         return (
          <button
           key={p.left}
           disabled={done}
           className={`match-item ${done ? 'matched' : selectedLeft === p.left ? 'active' : ''}`}
           onClick={() => setSelectedLeft(p.left)}
          >
           {p.left}
          </button>
         );
        })}
       </div>
       <div className="match-col">
        {shuffledRight.map(p => {
         const done = Boolean(matchedPairs[p.left]);
         return (
          <button
           key={p.right}
           disabled={done || !selectedLeft}
           className={`match-item ${done ? 'matched' : wrongRightFlash === p.right ? 'wrong' : ''}`}
           onClick={() => handleRightPick(p.right)}
          >
           {p.right}
          </button>
         );
        })}
       </div>
      </div>
      {Object.keys(matchedPairs).length === currentMatch.pairs.length && (
       <div className="feedback good" style={{marginTop: 16}}>
        <b>Tebrikler! Tüm eşleştirmeler tamamlandı.</b>
        {currentMatch.explanation && <p>{currentMatch.explanation}</p>}
       </div>
      )}
     </div>
     <div className="arcade-actions">
      <button className="primary" onClick={() => setMatchIdx(i => (i + 1) % matchings.length)}>
       Sonraki eşleştirme ({(matchIdx % matchings.length) + 1}/{matchings.length})
      </button>
     </div>
    </div>
   )
  )}

  {tab === 'drills' && (
   !currentDrill ? (
    <div className="empty">
     <p>Henüz tekrar egzersizi üretilmedi. "Ollama ile şimdi üret" ile boşluk doldurma ve doğru-yanlış alıştırmaları oluşturabilirsin.</p>
    </div>
   ) : (
    <div className="arcade-stage">
     <div className="generated-card">
      <div className="flashcard-meta">
       <span className="eyebrow muted">{currentDrill.book} · {currentDrill.unit} · {currentDrill.type === 'true_false' ? 'DOĞRU / YANLIŞ' : currentDrill.type === 'fill_blank' ? 'BOŞLUK DOLDURMA' : 'SÖZLÜ ANLATIM'}</span>
       <span className={`difficulty-tag difficulty-${currentDrill.difficulty}`}>{difficultyLabel[currentDrill.difficulty]}</span>
      </div>
      <h3>{currentDrill.prompt}</h3>
      {currentDrill.hint && <p className="muted">İpucu: {currentDrill.hint}</p>}

      {currentDrill.type === 'true_false' ? (
       <div className="arcade-actions" style={{justifyContent: 'flex-start'}}>
        {['Doğru', 'Yanlış'].map(opt => (
         <button
          key={opt}
          className={`outline ${drillSubmitted && opt === currentDrill.answer ? 'right-option' : ''}`}
          onClick={() => {
           setDrillAnswer(opt);
           setDrillSubmitted(true);
           onStudySignal(currentDrill.unitId, normalizeAns(opt) === normalizeAns(currentDrill.answer));
          }}
         >
          {opt}
         </button>
        ))}
       </div>
      ) : (
       <div className="drill-input-row">
        <input
         type="text"
         value={drillAnswer}
         onChange={e => setDrillAnswer(e.target.value)}
         placeholder={currentDrill.type === 'fill_blank' ? 'Boşluğa gelecek kavramı yaz...' : 'Aklından özetle, sonra kontrol et...'}
        />
        <button
         className="primary"
         onClick={() => {
          setDrillSubmitted(true);
          if (currentDrill.type === 'fill_blank') onStudySignal(currentDrill.unitId, isDrillCorrect);
         }}
        >
         Kontrol et
        </button>
       </div>
      )}

      {drillSubmitted && (
       <div className={`feedback ${currentDrill.type === 'recall' || isDrillCorrect ? 'good' : 'bad'}`} style={{marginTop: 14}}>
        <b>{currentDrill.type === 'recall' ? 'Örnek Doğru Yanıt:' : isDrillCorrect ? 'Doğru!' : `Beklenen Yanıt: ${currentDrill.answer}`}</b>
        <p>{currentDrill.type === 'recall' ? currentDrill.answer : currentDrill.explanation}</p>
        <small>Dayanak: &quot;{currentDrill.evidence}&quot;</small>
       </div>
      )}
     </div>
     <div className="arcade-actions">
      <button className="primary" onClick={() => setDrillIdx(i => (i + 1) % drills.length)}>
       Sonraki egzersiz ({(drillIdx % drills.length) + 1}/{drills.length})
      </button>
     </div>
    </div>
   )
  )}
 </>;
}
