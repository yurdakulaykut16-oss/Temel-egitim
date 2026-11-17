import {useEffect,useRef,useState} from 'react';
import {ChevronDown,Eye,EyeOff,Volume2,AlertCircle,RotateCcw} from 'lucide-react';
import {BriefGroup,BriefSection,LIST_PREVIEW,briefGroups,briefStats,groupText,sectionHasContent} from './briefs';

type Props={
 unitId:string;
 keyNote:string;
 /** Kartın tekrar vadesi (ms); kart henüz tekrar planında değilse undefined. */
 dueOf:(cardId:string)=>number|undefined;
 /** Bir ana konu en az STUDY_MS açık kaldı: öğrenildi sayılır ve ertesi güne tekrar planlanır. */
 onStudied:(cardId:string)=>void;
 onSpeak:(text:string)=>void;
 onOpenPage:(page:number)=>void;
};

/** Bir konu kartı bu kadar süre açık kalırsa "çalışıldı" sayılır. */
export const STUDY_MS=20_000;

export function dueLabel(due:number|undefined,now:number):{text:string;due:boolean}|null{
 if(due===undefined)return null;
 if(due<=now)return {text:'Tekrar zamanı',due:true};
 const days=Math.ceil((due-now)/86_400_000);
 if(due-now<3_600_000)return {text:'Birazdan tekrar',due:false};
 return {text:days<=1?'Yarın tekrar':`${days} gün sonra tekrar`,due:false};
}

function SectionBody({s}:{s:BriefSection}){
 // Uzun listeler kısa görünsün diye ilk maddeler açık gelir; hiçbir madde atılmaz, kalanı tek tıkla açılır.
 const [all,setAll]=useState(false);
 const list=s.list||[];
 const shown=all||list.length<=LIST_PREVIEW+2?list:list.slice(0,LIST_PREVIEW);
 return <>
  {s.points.length>0&&<ul className="brief-points">{s.points.map((p,i)=><li key={i}>{p}</li>)}</ul>}
  {list.length>0&&<div className="brief-list">
   {s.listIntro&&<span className="brief-list-intro">{s.listIntro}</span>}
   <ol>{shown.map((item,i)=><li key={i}>{item}</li>)}</ol>
   {shown.length<list.length&&<button type="button" className="brief-more" onClick={()=>setAll(true)}>Kalan {list.length-shown.length} maddeyi de göster</button>}
   {s.listMore?<small>Kitapta {s.listMore} madde daha var.</small>:null}
  </div>}
  {s.terms&&s.terms.length>0&&<div className="brief-terms"><span>Bu başlıkta geçen kavramlar:</span>{s.terms.map(t=><i key={t}>{t}</i>)}</div>}
  {s.notes?.map((n,i)=><p className="brief-note" key={i}><AlertCircle size={14}/> <span><b>Dikkat:</b> {n}</span></p>)}
  {!sectionHasContent(s)&&s.next&&<p className="brief-next">Bu başlık “{s.next}” başlığında anlatılır.</p>}
 </>;
}

/** Kısa ve eksiksiz ezber özeti: kitaptaki her başlık, altında 1-3 ezber cümlesi ve madde listeleriyle. */
export function UnitBrief({unitId,keyNote,dueOf,onStudied,onSpeak,onOpenPage}:Props){
 const groups=briefGroups(unitId);
 const stats=briefStats(unitId);
 const [open,setOpen]=useState<Set<string>>(()=>new Set(groups.slice(0,1).map(g=>g.id)));
 // Kendini sına: içerikler gizlenir, "göster"e basınca açılır (aktif hatırlama).
 const [selfTest,setSelfTest]=useState(false);
 const [revealed,setRevealed]=useState<Set<number>>(()=>new Set());
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{setOpen(new Set(briefGroups(unitId).slice(0,1).map(g=>g.id)));setRevealed(new Set());setNow(Date.now());},[unitId]);

 // Açık kalan kartı "çalışıldı" say: her kartın açıldığı an tutulur, süre dolunca bir kez bildirilir.
 const openedAt=useRef(new Map<string,number>());
 const reported=useRef(new Set<string>());
 const studied=useRef(onStudied);studied.current=onStudied;
 useEffect(()=>{
  const time=Date.now();
  for(const id of [...openedAt.current.keys()])if(!open.has(id))openedAt.current.delete(id);
  const timers:number[]=[];
  for(const id of open){
   if(reported.current.has(id))continue;
   if(!openedAt.current.has(id))openedAt.current.set(id,time);
   const left=Math.max(0,STUDY_MS-(time-(openedAt.current.get(id) as number)));
   timers.push(window.setTimeout(()=>{
    if(document.visibilityState==='hidden')return;
    reported.current.add(id);studied.current(id);setNow(Date.now());
   },left));
  }
  return ()=>timers.forEach(t=>window.clearTimeout(t));
 },[open]);

 const allOpen=open.size===groups.length;
 const toggle=(id:string)=>setOpen(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next;});
 const reveal=(i:number)=>setRevealed(prev=>new Set(prev).add(i));
 const hidden=(s:BriefSection)=>selfTest&&!revealed.has(s.i)&&sectionHasContent(s);
 const row=(s:BriefSection,isHead:boolean)=>{
  if(isHead&&!sectionHasContent(s))return null;
  return <div className={`brief-row level-${s.level}${isHead?' head':''}`} key={s.i}>
   {!isHead&&<div className="brief-sub"><h4>{s.title}</h4>{s.page?<button type="button" className="brief-page" title="Kitapta bu sayfayı aç" onClick={()=>onOpenPage(s.page as number)}>s.{s.page}</button>:null}</div>}
   {hidden(s)
    ?<button type="button" className="brief-reveal" onClick={()=>reveal(s.i)}>Önce hatırlamaya çalış · göster</button>
    :<SectionBody s={s}/>}
  </div>;
 };
 const card=(g:BriefGroup,index:number)=>{
  const isOpen=open.has(g.id);
  const label=dueLabel(dueOf(g.id),now);
  return <section className={`brief-card${isOpen?' open':''}`} key={g.id}>
   <button type="button" className="brief-card-head" onClick={()=>toggle(g.id)} aria-expanded={isOpen}>
    <span className="brief-no">{index+1}</span>
    <span className="brief-title">{g.head.title}<small>{g.children.length?`${g.children.length} alt başlık`:'tek başlık'}{g.head.page?` · s.${g.head.page}`:''}</small></span>
    {label&&<span className={`brief-due${label.due?' now':''}`}><RotateCcw size={11}/> {label.text}</span>}
    <ChevronDown size={18} className="brief-chevron"/>
   </button>
   {isOpen&&<div className="brief-card-body">
    {row(g.head,true)}
    {g.children.map(s=>row(s,false))}
    <button type="button" className="brief-listen" onClick={()=>onSpeak(groupText(g))}><Volume2 size={14}/> Bu konuyu dinle</button>
   </div>}
  </section>;
 };
 if(!groups.length)return null;
 return <div className="brief">
  <div className="brief-key"><span>ÖZÜN ÖZÜ</span><p>{keyNote}</p></div>
  <div className="brief-toolbar">
   <span className="brief-meta">Kitaptaki <b>{stats.headings}</b> başlığın tamamı · yaklaşık <b>{stats.minutes} dk</b></span>
   <div>
    <button type="button" className={selfTest?'on':''} onClick={()=>{setSelfTest(v=>!v);setRevealed(new Set())}}>{selfTest?<><Eye size={14}/> Hepsini göster</>:<><EyeOff size={14}/> Kendini sına</>}</button>
    <button type="button" onClick={()=>setOpen(allOpen?new Set():new Set(groups.map(g=>g.id)))}>{allOpen?'Tümünü kapat':'Tümünü aç'}</button>
   </div>
  </div>
  {groups.map(card)}
 </div>;
}
