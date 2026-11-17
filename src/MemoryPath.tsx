import {useEffect,useMemo,useState} from 'react';
import {BookOpen,Check,ChevronRight,RotateCcw,Sparkles} from 'lucide-react';
import {books} from './data';
import {Reviews,schedule,cardDue,startOfTomorrow} from './memory';
import {memoryGroups,sectionHasContent,BriefSection} from './briefs';

type Props={read:string[]; reviews:Reviews; onReviews:(v:Reviews)=>void; onOpen:(bi:number,ui:number)=>void; onQuiz:(id:string)=>void};

function Answer({s,showTitle}:{s:BriefSection;showTitle:boolean}){
 if(!sectionHasContent(s))return null;
 return <div className="memory-part">
  {showTitle&&<b>{s.title}</b>}
  {s.points.length>0&&<ul>{s.points.map((p,i)=><li key={i}>{p}</li>)}</ul>}
  {s.list&&s.list.length>0&&<ol>{s.list.map((p,i)=><li key={i}>{p}</li>)}</ol>}
  {s.terms&&s.terms.length>0&&<div className="brief-terms"><span>Kavramlar:</span>{s.terms.map(t=><i key={t}>{t}</i>)}</div>}
  {s.notes?.map((n,i)=><p className="brief-note" key={i}><span><b>Dikkat:</b> {n}</span></p>)}
 </div>;
}

/** Tekrar yolu: okunan her ünitenin her ana konusu bir ezber kartıdır. Bugün öğrenilen kart yarın,
 * hatırlandıkça 3, 7, 14 … gün sonra yeniden sorulur. */
export function MemoryPath({read,reviews,onReviews,onOpen,onQuiz}:Props){
 const [now,setNow]=useState(Date.now),[revealed,setRevealed]=useState(false);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return()=>window.clearInterval(timer)},[]);
 const cards=useMemo(()=>books.flatMap((b,bi)=>b.units.flatMap((u,ui)=>{
  const unitId=`${bi}-${ui}`;
  // Ünite "okundu" ise bütün konuları, değilse yalnız derste çalışılmış (planı olan) konuları karttır.
  const groups=memoryGroups(unitId), whole=read.includes(unitId);
  return groups.map((g,gi)=>({book:b,bi,ui,u,unitId,g,gi,total:groups.length})).filter(c=>whole||Boolean(reviews[c.g.id]));
 })),[read,reviews]);
 const withDue=cards.map(c=>({...c,due:cardDue(reviews,c.g.id,c.unitId,now)}));
 const due=withDue.filter(c=>c.due<=now).sort((a,b)=>a.due-b.due);
 const upcoming=withDue.filter(c=>c.due>now).sort((a,b)=>a.due-b.due);
 const tomorrowStart=startOfTomorrow(now), tomorrow=upcoming.filter(c=>c.due<tomorrowStart+86_400_000).length;
 const next=due[0];
 const units=new Set(cards.map(c=>c.unitId)).size;
 const grade=(remembered:boolean)=>{if(!next)return;const time=Date.now();onReviews({...reviews,[next.g.id]:schedule(reviews[next.g.id]||reviews[next.unitId],remembered,time)});setNow(time);setRevealed(false);window.scrollTo({top:0,behavior:'smooth'})};
 useEffect(()=>{setRevealed(false)},[next?.g.id]);
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
 },[next?.g.id,revealed]);
 const date=(t:number)=>new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(t);
 const subTitles=next?next.g.children.filter(s=>s.level===3).map(s=>s.title):[];
 return <div className="memory-page"><div className="memory-hero"><div><div className="eyebrow">BUGÜN ÖĞREN · YARIN HATIRLA</div><h1>Hatırla, pekiştir<span>.</span></h1><p>Okuduğun her konu ertesi gün yeniden karşına çıkar. Önce kendin hatırla, sonra özeti aç.</p></div><div className="memory-bubble"><Sparkles size={31}/><b>{due.length}</b><span>sırada</span></div></div>
 <div className="memory-stats"><div><b>{units}</b><span>Çalışılan ünite</span></div><div><b>{due.length}</b><span>Şimdi tekrar</span></div><div><b>{tomorrow}</b><span>Yarın gelecek</span></div></div>
 {!cards.length?<div className="memory-empty"><BookOpen size={30}/><h2>İlk adım bir ünite okumak.</h2><p>Derste bir konuyu açıp okuduğunda o konu yarın burada karşına çıkar.</p><button className="primary" onClick={()=>onOpen(0,0)}>İlk derse git <ChevronRight size={16}/></button></div>
 :next?<div className="memory-card"><div className="memory-top"><span>EZBER KARTI · {next.gi+1}/{next.total}</span><b>{next.book.short} · Ünite {next.ui+1}</b></div><div className="memory-track"><div style={{width:`${Math.max(4,100*(cards.length-due.length)/cards.length)}%`}}/></div>
  <p className="memory-kicker">{next.u.title}</p><h2>{next.g.head.title}</h2>
  <p>Bu başlıkta neler anlatılıyordu? Tanımları ve maddeleri notlara bakmadan say.</p>
  {subTitles.length>0&&<div className="memory-cues"><span>İpucu — alt başlıklar:</span>{subTitles.map(t=><i key={t}>{t}</i>)}</div>}
  {!revealed?<button className="memory-reveal" onClick={()=>setRevealed(true)}>Özeti göster (Boşluk) <ChevronRight size={17}/></button>
  :<div className="memory-answer"><span>EZBER ÖZETİ</span>
   <Answer s={next.g.head} showTitle={false}/>
   {next.g.children.map(s=><Answer s={s} showTitle key={s.i}/>)}
   <small>Kendi yanıtınla karşılaştır; eksik kaldıysa “Tekrar etmeliyim” de, kart 10 dakika sonra yeniden gelir.</small>
   <div className="memory-grade"><button onClick={()=>grade(false)}><RotateCcw size={16}/> Tekrar etmeliyim (1)</button><button onClick={()=>grade(true)}><Check size={17}/> Hatırladım (2)</button></div></div>}
  <div className="memory-links"><button onClick={()=>onOpen(next.bi,next.ui)}>Derse dön</button><button onClick={()=>onQuiz(next.unitId)}>Ünite testini çöz</button></div></div>
 :<div className="memory-empty"><Check size={32}/><h2>Şimdilik tamam!</h2><p>Şu anda vadesi gelen kart yok. {upcoming[0]?`Sıradaki tekrar: ${date(upcoming[0].due)} — ${upcoming[0].g.head.title}.`:''}</p></div>}
 {upcoming.length>0&&<div className="memory-upcoming"><b>Yaklaşan tekrarlar</b>{upcoming.slice(0,6).map(c=><p key={c.g.id}><span>{date(c.due)}</span>{c.u.title} › {c.g.head.title}</p>)}</div>}
 <div className="memory-foot"><b>Tekrar nasıl çalışır?</b><p>Derste açıp okuduğun her ana konu kendiliğinden bir ezber kartı olur ve <b>ertesi gün</b> karşına çıkar; “Okudum, tamamla” dersen ünitenin bütün konuları plana girer. “Hatırladım” dedikçe aralar büyür (3, 7, 14, 30, 60, 120, 240, sonra yaklaşık 365 gün); böylece öğrendiğin şey sessizce unutulmaz. “Tekrar etmeliyim” seçimi kartı 10 dakika sonraya alıp baştan başlatır; bir ünite testinde yanlış yaparsan o ünitenin kartları da öne alınır. Bu plan bir öneridir, kalıcı öğrenme garantisi değildir. Veriler bu tarayıcıda tutulur; bildirim gönderilmez.</p></div></div>
}
