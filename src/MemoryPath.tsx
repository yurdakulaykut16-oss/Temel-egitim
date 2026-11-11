import {useEffect,useState} from 'react';
import {BookOpen,Check,ChevronRight,RotateCcw,Sparkles} from 'lucide-react';
import {books} from './data';
import {Reviews,schedule} from './memory';

type Props={read:string[]; reviews:Reviews; onReviews:(v:Reviews)=>void; onOpen:(bi:number,ui:number)=>void; onQuiz:(id:string)=>void};
export function MemoryPath({read,reviews,onReviews,onOpen,onQuiz}:Props){
 const [now,setNow]=useState(Date.now),[revealed,setRevealed]=useState(false);
 const [unitBookSample,setUnitBookSample]=useState<{question:string;answer:string}|null>(null);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return()=>window.clearInterval(timer)},[]);
 const items=books.flatMap((b,bi)=>b.units.map((u,ui)=>({book:b,bi,ui,u,id:`${bi}-${ui}`}))).filter(x=>read.includes(x.id));
 const due=items.filter(x=>!reviews[x.id]||reviews[x.id].due<=now).sort((a,b)=>(reviews[a.id]?.due||0)-(reviews[b.id]?.due||0));
 const next=due[0], upcoming=items.filter(x=>reviews[x.id]&&reviews[x.id].due>now).sort((a,b)=>reviews[a.id].due-reviews[b.id].due);
 const grade=(remembered:boolean)=>{if(!next)return;const time=Date.now();onReviews({...reviews,[next.id]:schedule(reviews[next.id],remembered,time)});setNow(time);setRevealed(false)};
 useEffect(()=>{
  if(!next?.id){setUnitBookSample(null);return;}
  let alive=true;
  fetch(`/api/ollama/book-questions?unitId=${encodeURIComponent(next.id)}`)
   .then(r=>r.ok?r.json():null)
   .then(d=>{if(alive&&Array.isArray(d?.questions)&&d.questions.length){setUnitBookSample({question:d.questions[0].question,answer:d.questions[0].answer});}else if(alive)setUnitBookSample(null);})
   .catch(()=>{});
  return ()=>{alive=false;};
 },[next?.id]);
 useEffect(()=>{
  if(!next)return;
  const onKey=(e:KeyboardEvent)=>{
   const tag=(e.target as HTMLElement|null)?.tagName;
   if(tag==='INPUT'||tag==='TEXTAREA')return;
   if(e.code==='Space'&&!revealed){e.preventDefault();setRevealed(true);}
   else if(revealed&&e.key==='1'){e.preventDefault();grade(false);}
   else if(revealed&&e.key==='2'){e.preventDefault();grade(true);}
  };
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 },[next?.id,revealed]);
 const date=(t:number)=>new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(t);
 return <div className="memory-page"><div className="memory-hero"><div><div className="eyebrow">KÜÇÜK ADIMLAR · GÜÇLÜ TEKRAR</div><h1>Hatırla, pekiştir<span>.</span></h1><p>Önce cevabı kendin düşün. Sonra notu aç ve ne kadar hatırladığını dürüstçe değerlendir.</p></div><div className="memory-bubble"><Sparkles size={31}/><b>{due.length}</b><span>sırada</span></div></div>
 <div className="memory-stats"><div><b>{items.length}</b><span>Çalışılan ünite</span></div><div><b>{due.length}</b><span>Şimdi tekrar</span></div><div><b>{upcoming.length}</b><span>Planlanan tekrar</span></div></div>
 {!items.length?<div className="memory-empty"><BookOpen size={30}/><h2>İlk adım bir ünite okumak.</h2><p>Dersini tamamladığında burada ilk hatırlama kartın açılır.</p><button className="primary" onClick={()=>onOpen(0,0)}>İlk derse git <ChevronRight size={16}/></button></div>:next?<div className="memory-card"><div className="memory-top"><span>HATIRLAMA KARTI</span><b>{next.book.short} · Ünite {next.ui+1}</b></div><div className="memory-track"><div style={{width:`${Math.max(8,100*(items.length-due.length)/items.length)}%`}}/></div><p className="memory-kicker">{next.u.title}</p><h2>Bu konunun önemli noktasını kendi cümlelerinle nasıl açıklarsın?</h2><p>Notlara bakmadan düşün veya sesli anlat. Hazır olduğunda kontrol et.</p>{!revealed?<button className="memory-reveal" onClick={()=>setRevealed(true)}>Notu göster (Boşluk) <ChevronRight size={17}/></button>:<div className="memory-answer"><span>ÖNEMLİ NOT</span><p>{next.u.key}</p>{unitBookSample&&<div className="book-mini-quiz" style={{marginTop:10}}><b>📚 Kitaptan Hızlı Sınav Sorusu:</b><p style={{margin:'4px 0'}}>{unitBookSample.question}</p><small><b>Yanıt:</b> {unitBookSample.answer}</small></div>}<small>Kendi yanıtınla karşılaştır; gerekiyorsa üniteyi ve kaynak kitabı yeniden oku.</small><div className="memory-grade"><button onClick={()=>grade(false)}><RotateCcw size={16}/> Tekrar etmeliyim (1)</button><button onClick={()=>grade(true)}><Check size={17}/> Hatırladım (2)</button></div></div>}<div className="memory-links"><button onClick={()=>onOpen(next.bi,next.ui)}>Derse dön</button><button onClick={()=>onQuiz(next.id)}>Ünite testini çöz</button></div></div>:<div className="memory-empty"><Check size={32}/><h2>Şimdilik tamam!</h2><p>Şu anda vadesi gelen tekrar yok. {upcoming[0]?`En yakın tekrar: ${date(reviews[upcoming[0].id].due)}.`:''}</p><button className="outline" onClick={()=>onOpen(0,0)}>Derslere devam et <ChevronRight size={16}/></button></div>}
 <div className="memory-foot"><b>Tekrar nasıl çalışır?</b><p>“Hatırladım” seçimi sonrası ünite giderek büyüyen aralıklarla (1, 3, 7, 14, 30, 60, 120, 240, sonra yaklaşık 365 gün) tekrar gelir; amaç bir kez öğrenileni sessizce unutmak yerine kalıcı hâle getirmektir. “Tekrar etmeliyim” seçimi veya testteki bir yanlış, üniteyi hemen 10 dakika sonraya alıp tekrar baştan başlatır. Bu plan bir öneridir, kalıcı öğrenme garantisi değildir. Veriler bu tarayıcıda tutulur; bildirim gönderilmez.</p></div></div>
}
