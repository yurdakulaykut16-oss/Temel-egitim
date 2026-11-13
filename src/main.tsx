import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LayoutDashboard,BookOpen,ClipboardList,Headphones,CalendarDays,Settings,ChevronRight,ArrowUpRight,Play,Clock,Target,Flame,Check,Volume2,RotateCcw,Menu,X,Sparkles,Bookmark,ArrowLeft,Pause,AlertCircle,Layers,Brain,RefreshCw,Film,Wand2,Smartphone,Search,Flag,Award} from 'lucide-react';
import {books,Unit} from './data';
import {extra,deepDive} from './extra';
import {bmiExercises} from './calculations';
import {scenarios} from './scenarios';
import {practice} from './practice';
import {reinforcement} from './reinforcement';
import {unique} from './unique';
import {advanced} from './advanced';
import {newQuestions} from './newQuestions';
import {challenge} from './challenge';
import bookIndex from './bookIndex.json';
import groundingIndex from './groundingIndex.json';
import {bookNotes,bookQuestions} from './bookNotes';
import {expanded} from './expanded';
import {OllamaStudio,getGenerated,GeneratedQuestion} from './OllamaStudio';
import {StudyArcade} from './StudyArcade';
import {MemoryPath} from './MemoryPath';
import {VoiceStudio} from './VoiceStudio';
import {VideoLessonStage} from './VideoLessonStage';
import {TikTokVideoFeed} from './TikTokVideoFeed';
import {speakWithVoiceStudio,stopVoiceStudio} from './tts/voiceStudio';
import {loadReviews, prioritize, Reviews} from './memory';
import {buildRetryVariant,buildRetryVariants} from './questionVariants';
import './style.css';
import './nexus-live-theme.css';

type UnitResult={right:number;wrong:number;streak:number;totalSec?:number;lastSec?:number};
type Progress={read:string[]; results:Record<string,UnitResult>; totalStudySec?:number};
type UnitLesson={
 unitId:string; book:string; unit:string; version:number; reframeCount?:number; activeStyle?:string; source:string; updatedAt:string;
 overviewHook:string;
 deepSections:{title:string;body:string;recallAnchor?:string}[];
 proTips:{title:string;tip:string;examTrap?:string}[];
 memoryMnemonics:{code:string;standsFor:string;story:string}[];
 spacedEchoes:string[];
 fiveAngleSpotlight?:{concept:string;angles:{angle:string;sampleQuestion:string;keyPoint:string}[]};
 miniCheckpoints:{question:string;answer:string;hint?:string}[];
 everyCornerDetails?:{heading:string;pages?:number[];keyFact:string;whyItCouldBeAsked:string}[];
 adaptivePersonalCoach?:string;
};
type LessonPerf={answered:number;right?:number;wrong?:number;accuracyPct:number;totalSec:number;totalMin:number;avgSec:number;statusLabel:string;needsReread?:boolean;needsReframe?:boolean;recommendation?:string;summaryText:string};
type KayseriReaction={speakerLabel:string;mode:string;headline:string;roastOrPraise:string;examFact:string;evidence?:string;mustKnowTerm?:string;isCorrect:boolean};
type MistakeEntry={key:string;unitId:string;bi:number;ui:number;unitTitle:string;question:string;answer:string;wrongOptions:string[];explanation:string;chosenWrong:string;source?:string;wrongCount:number;mastered:boolean;updatedAt:string};
type BookSearchHit={id:string;kind:string;unitId:string;book:string;unit:string;heading:string;pages:number[];snippet:string;score:number};
type BookOfficialQuestion={id:string;unitId:string;book:string;unit:string;topic?:string;question:string;options:string[];answer:string;testPage?:number;answerPage?:number;source?:string;sourceQuestionId?:string;sourceQuestion?:string;explanation?:string};
type DifficultyTier4='kolay'|'orta'|'zor'|'imkansiz';
type CalibratedBankMeta={id?:string;unitId:string;question:string;aiDifficultyTier:DifficultyTier4;aiDifficultyLabel:string;predictedEliminationPct:number;solvedBy100AiPct:number;aiDifficultyComments:string[];misconceptionTraps:string[]};
type UnitTvgfbfIntel={unitId:string;preferredTypes:string[];stemTemplates:string[];highFrequencyTopics:string[];forumTraps:string[];bookQuestionsCount:number;bookQuestions:BookOfficialQuestion[]};
type ExamBookForecast={bookIndex:number;book:string;totalUnits:number;studiedUnits:number;coveragePct:number;answered:number;accuracyPct:number;avgSecPerQ:number;estimatedOutOf20:number;barajMet:boolean;passRisk:'yuksek_risk'|'sinirda'|'guvenli';weakUnits:{unitId:string;unit:string;wrong:number;right:number}[]};
type ExamPrediction={totalEstimated100:number;booksPassingBaraj:number;totalBooks:number;allBarajMet:boolean;books:ExamBookForecast[];priorityActions:{kind:string;bookIndex?:number;unitId?:string;title:string;reason:string}[]};
const initial:Progress={read:[],results:{},totalStudySec:0};
// Bir üniteyi "öğrenilmiş/kalıcı" saymak için art arda gereken doğru sayısı. Bir ünite bu sayıya
// ulaşana kadar yanlış yapılan yerlerden daha sık ve daha ağırlıklı soru çıkar; herhangi bir yanlış
// bu sayacı sıfırlar, böylece bir kez öğrenilen bilgi sessizce unutulmaya bırakılmaz.
const MASTERY_STREAK=3;
const readSaved=():Progress=>{try{return JSON.parse(localStorage.getItem('tempo-progress')||'null')||initial}catch{return initial}};
const readSavedMistakes=():MistakeEntry[]=>{try{const v=JSON.parse(localStorage.getItem('tempo-mistakes')||'[]');return Array.isArray(v)?v:[]}catch{return []}};
const computeLocalExamPrediction=(prog:Progress):ExamPrediction=>{
 const booksReport:ExamBookForecast[]=books.map((b,bi)=>{
  let right=0,wrong=0,totalSec=0,studiedCount=0;
  const weakUnits:{unitId:string;unit:string;wrong:number;right:number}[]=[];
  b.units.forEach((u,ui)=>{
   const uid=`${bi}-${ui}`;
   if(prog.read.includes(uid))studiedCount++;
   const r=prog.results[uid];
   if(r){
    right+=Number(r.right||0);wrong+=Number(r.wrong||0);totalSec+=Number(r.totalSec||0);
    if((r.wrong||0)>=2&&(r.streak||0)<MASTERY_STREAK)weakUnits.push({unitId:uid,unit:u.title,wrong:r.wrong,right:r.right});
   }
  });
  const answered=right+wrong;
  const accuracyPct=answered?Math.round((right/answered)*100):0;
  const coveragePct=b.units.length?Math.round((studiedCount/b.units.length)*100):0;
  const rawEst=answered>0?(accuracyPct*0.72+coveragePct*0.28):(coveragePct*0.65);
  const estimatedOutOf20=Math.max(0,Math.min(20,Math.round((rawEst/100)*20)));
  const passRisk=estimatedOutOf20<12?'yuksek_risk':estimatedOutOf20<15?'sinirda':'guvenli';
  return {bookIndex:bi,book:b.short,totalUnits:b.units.length,studiedUnits:studiedCount,coveragePct,answered,accuracyPct,avgSecPerQ:answered?+(totalSec/answered).toFixed(1):0,estimatedOutOf20,barajMet:estimatedOutOf20>=12,passRisk,weakUnits:weakUnits.slice(0,3)};
 });
 const totalEstimated100=booksReport.reduce((s,x)=>s+x.estimatedOutOf20,0);
 const booksPassingBaraj=booksReport.filter(x=>x.barajMet).length;
 return {totalEstimated100,booksPassingBaraj,totalBooks:booksReport.length,allBarajMet:booksPassingBaraj===booksReport.length,books:booksReport,priorityActions:[]};
};
// Quiz öğesi: `retryOf` yalnızca hata defterinden değiştirilerek yeniden sorulan
// varyantlarda dolar; varyantta doğru yapıldığında ORİJİNAL hata kaydı ustalaşmış sayılır.
type QuizItem={u:Unit; bi:number; ui:number; id:string; weight?:number; retryOf?:string; parallelOf?:string};
const all:QuizItem[]=books.flatMap((b,bi)=>b.units.map((u,ui)=>({u,bi,ui,id:`${bi}-${ui}`})));
const days=Math.max(0,Math.ceil((new Date('2026-12-20T09:00:00').getTime()-Date.now())/86400000));
function App(){
 const [reviews,setReviews]=useState<Reviews>(()=>loadReviews(localStorage.getItem('tempo-reviews')));
 const saveReviews=(value:Reviews)=>{setReviews(value);localStorage.setItem('tempo-reviews',JSON.stringify(value))};
 const [generated,setGenerated]=useState<GeneratedQuestion[]>([]); useEffect(()=>{getGenerated().then(setGenerated).catch(()=>{});},[]);
 const [bookOfficialQs,setBookOfficialQs]=useState<BookOfficialQuestion[]>([]);
 const [bookParallelQs,setBookParallelQs]=useState<BookOfficialQuestion[]>([]);
 // Kaynak dışı (konu anlatım özetlerinde/kitapta karşılığı olmayan) sorular testlerden çıkarılsın mı?
 const [onlyInSource,setOnlyInSource]=useState<boolean>(()=>{try{return localStorage.getItem('tempo-only-insource')!=='0'}catch{return true}});
 const groundingOk=(question:string)=>{
  const key=question.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ').slice(0,120);
  const score=(groundingIndex as Record<string,number>)[key];
  return !Number.isFinite(score)||Number(score)>=0.55;
 };
 const toggleOnlyInSource=()=>setOnlyInSource(v=>{const next=!v;try{localStorage.setItem('tempo-only-insource',next?'1':'0')}catch{}return next;});
 const [calibratedMap,setCalibratedMap]=useState<Record<string,CalibratedBankMeta>>({});
 const [tierCounts,setTierCounts]=useState<Record<DifficultyTier4,number>>({kolay:0,orta:0,zor:0,imkansiz:0});
 const [selectedTier,setSelectedTier]=useState<'all'|DifficultyTier4>('all');
 const [combo,setCombo]=useState(0);
 const [xpEarned,setXpEarned]=useState(0);
 const [lastXpGain,setLastXpGain]=useState(0);
 const [eliminatedOpts,setEliminatedOpts]=useState<Record<number,string[]>>({});
 const [hintRevealed,setHintRevealed]=useState<Record<number,boolean>>({});
 const normStem=(s:string)=>s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().slice(0,95);
 const getQuestionMeta=(item:{id:string;u:Unit}):CalibratedBankMeta=>{
  const hit=calibratedMap[`${item.id}::${normStem(item.u.question)}`];
  if(hit)return hit;
  const src=String(item.u.source||'');
  const text=`${item.u.question} ${item.u.wrong.join(' ')}`;
  const hardScore=/I\..*II\.|değildir|yanlıştır|hangisi söylenemez|sıralaması/i.test(text)?64:(/imk[aâ]ns[ıi]z/i.test(src)?84:(text.length>190?58:32));
  const tier:DifficultyTier4=hardScore>=75?'imkansiz':hardScore>=55?'zor':hardScore>=34?'orta':'kolay';
  return {
   unitId:item.id,
   question:item.u.question,
   aiDifficultyTier:tier,
   aiDifficultyLabel:tier==='imkansiz'?'İmkânsız (Çok Eleyici)':tier==='zor'?'Zor':tier==='orta'?'Orta':'Kolay',
   predictedEliminationPct:hardScore,
   solvedBy100AiPct:Math.max(5,100-hardScore),
   aiDifficultyComments:[
    tier==='imkansiz'?'🤖 Çözen-07: "Bu imkânsız gibi aşırı zormuş; kavram ve öncül tuzağı adayların büyük kısmını eler!"':
    tier==='zor'?'🤖 Çözen-12: "Bu soru gerçekten zorlayıcı! İnce ayrımı yakalayamayan hemen çeldiriciye düşer."':
    tier==='orta'?'🤖 Çözen-04: "Orta düzey seçici soru; yakın kavramlar arasındaki sınırı yokluyor."':
    '🤖 Çözen-01: "Temel kavramı net ölçen kolay-ısınma sorusu."'
   ],
   misconceptionTraps:['Öğrenciler yakın kavramları ve ters/olumsuz kökü aceleyle karıştırabiliyor.']
  };
 };
 useEffect(()=>{
  fetch('/api/ollama/book-questions')
   .then(r=>r.ok?r.json():null)
   .then(d=>{if(Array.isArray(d?.questions))setBookOfficialQs(d.questions);})
   .catch(()=>{});
  fetch('/api/ollama/book-parallels')
   .then(r=>r.ok?r.json():null)
   .then(d=>{if(Array.isArray(d?.questions))setBookParallelQs(d.questions);})
   .catch(()=>{});
  fetch('/api/ollama/calibrated-bank')
   .then(r=>r.ok?r.json():null)
   .then(d=>{
    if(d?.tierCounts)setTierCounts(d.tierCounts);
    if(Array.isArray(d?.items)){
     const nextMap:Record<string,CalibratedBankMeta>={};
     for(const it of d.items){
      if(it?.unitId&&it?.question)nextMap[`${it.unitId}::${normStem(it.question)}`]=it;
     }
     setCalibratedMap(nextMap);
    }
   })
   .catch(()=>{});
 },[]);
 const [progress,setProgress]=useState<Progress>(readSaved); const [page,setPage]=useState('Genel bakış'); const [selected,setSelected]=useState<{bi:number;ui:number}|null>(null); const [quiz,setQuiz]=useState<typeof all>([]); const [qi,setQi]=useState(0); const [choice,setChoice]=useState<string|null>(null); const [score,setScore]=useState(0); const [menu,setMenu]=useState(false); const [speaking,setSpeaking]=useState(false); const [mode,setMode]=useState('Konu anlatımı');
 const [isFullExam,setIsFullExam]=useState(false);
 const [examRemainingSec,setExamRemainingSec]=useState(6000);
 const [inlinePdfUrl,setInlinePdfUrl]=useState<string>('');
 const [unitLesson,setUnitLesson]=useState<UnitLesson|null>(null);
 const [unitTvgfbfIntel,setUnitTvgfbfIntel]=useState<UnitTvgfbfIntel|null>(null);
 const [lessonPerf,setLessonPerf]=useState<LessonPerf|null>(null);
 const [enhancingLesson,setEnhancingLesson]=useState(false);
 const [reframingLesson,setReframingLesson]=useState(false);
 const [reframeMsg,setReframeMsg]=useState('');
 const [quizBookScores,setQuizBookScores]=useState<Record<number,{right:number;total:number}>>({});
 const [qElapsedSec,setQElapsedSec]=useState(0);
 const [kayseriMode,setKayseriMode]=useState<'kayseri_sert'|'temiz_klasik'>('kayseri_sert');
 const [kayseriReaction,setKayseriReaction]=useState<KayseriReaction|null>(null);
 const [nexusPill,setNexusPill]=useState<{cycles:number;iq:number;uiApplied:number;model:string;ghIndexed:number}|null>(null);
 const [mistakes,setMistakes]=useState<MistakeEntry[]>(readSavedMistakes);
 const [showMistakes,setShowMistakes]=useState(false);
 const [searchQuery,setSearchQuery]=useState('');
 const [searchHits,setSearchHits]=useState<BookSearchHit[]>([]);
 const [searching,setSearching]=useState(false);
 const [examPrediction,setExamPrediction]=useState<ExamPrediction>(()=>computeLocalExamPrediction(readSaved()));
 const [quizAnswers,setQuizAnswers]=useState<Record<number,{choice:string;correct:boolean}>>({});
 const [quizFlags,setQuizFlags]=useState<Record<number,boolean>>({});
 const qStartRef=useRef<number>(Date.now());
 const saveMistakes=(list:MistakeEntry[])=>{setMistakes(list);localStorage.setItem('tempo-mistakes',JSON.stringify(list.slice(-150)));};
 const activeMistakes=mistakes.filter(m=>!m.mastered);
 useEffect(()=>{
  let alive=true;
  const loadNexus=()=>{
   fetch('/api/ollama/nexus-model')
    .then(r=>r.ok?r.json():null)
    .then(d=>{
     const s=d?.summary;
     if(alive&&s)setNexusPill({cycles:Number(s.fusionCycles||0),iq:Number(s.fusionIq||97),uiApplied:Number(s.uiEvolutionsApplied||0),model:String(s.modelName||'tempo-nexus-titan:latest'),ghIndexed:Number(s.githubProjectsIndexed||260000)});
    })
    .catch(()=>{});
  };
  loadNexus();
  const id=setInterval(loadNexus,12000);
  return ()=>{alive=false;clearInterval(id);};
 },[]);
 const save=(p:Progress)=>{setProgress(p);localStorage.setItem('tempo-progress',JSON.stringify(p))};
 const weakUnits=Object.entries(progress.results).filter(([,r])=>((r.wrong||0)>0&&(r.streak||0)<MASTERY_STREAK)||((r.right+r.wrong)>0&&((r.totalSec||0)/(r.right+r.wrong))>=45)).map(([id])=>id);
 const rereadUnits=Object.entries(progress.results).filter(([,r])=>(r.wrong||0)>=2&&((r.streak||0)===0||((r.right+r.wrong)>0&&r.right/(r.right+r.wrong)<0.8))).map(([id])=>id);
 const totalStudySec=Object.values(progress.results).reduce((a,r)=>a+(r.totalSec||0),0);
 const totalStudyMin=+(totalStudySec/60).toFixed(1);
 const syncStudentSignal=(unitId?:string,correct?:boolean,resultsOverride?:Record<string,UnitResult>,studySecOverride?:number)=>{
  const resMap=resultsOverride||progress.results;
  const nextWeak=unitId&&correct===false?Array.from(new Set([...weakUnits,unitId])):weakUnits;
  const rightSum=Object.values(resMap).reduce((a,r)=>a+(r.right||0),0);
  const wrongSum=Object.values(resMap).reduce((a,r)=>a+(r.wrong||0),0);
  const accPct=rightSum+wrongSum?Math.round((rightSum/(rightSum+wrongSum))*100):100;
  fetch('/api/ollama/student-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({readUnits:progress.read,weakUnits:nextWeak,results:resMap,accuracyPct:accPct,totalStudySec:studySecOverride??totalStudySec,signalUnitId:unitId,signalCorrect:correct})}).catch(()=>{});
 };
 const calculated=bmiExercises(books[3].units[4]);
 const outOfSourceCount=Object.values(groundingIndex as Record<string,number>).filter(v=>Number(v)<0.55).length;
 const studied=all.filter(x=>progress.read.includes(x.id)); const nextLesson=all.find(x=>!progress.read.includes(x.id))||all[0]; const dueCount=studied.filter(x=>!reviews[x.id]||reviews[x.id].due<=Date.now()).length; const totalRight=Object.values(progress.results).reduce((a,r)=>a+r.right,0); const totalWrong=Object.values(progress.results).reduce((a,r)=>a+r.wrong,0); const accuracy=totalRight+totalWrong?Math.round(totalRight/(totalRight+totalWrong)*100):0;
 useEffect(()=>{syncStudentSignal();},[progress.read.length,totalRight,totalWrong]);
 useEffect(()=>{
  setExamPrediction(computeLocalExamPrediction(progress));
  fetch('/api/ollama/diagnostics/exam-prediction',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({read:progress.read,results:progress.results})})
   .then(r=>r.ok?r.json():null)
   .then(d=>{if(d?.books)setExamPrediction(d);})
   .catch(()=>{});
 },[progress.read.length,totalRight,totalWrong]);
 useEffect(()=>{
  const q=searchQuery.trim();
  if(q.length<2){setSearchHits([]);setSearching(false);return;}
  let alive=true;
  setSearching(true);
  const tid=setTimeout(()=>{
   const qLow=q.toLocaleLowerCase('tr-TR');
   const localHits:BookSearchHit[]=all
    .filter(x=>{
     const bn=bookNotes[x.id];
     const hay=`${books[x.bi].title} ${x.u.title} ${x.u.lesson} ${x.u.key} ${bn?.title||''} ${bn?.text||''}`.toLocaleLowerCase('tr-TR');
     return hay.includes(qLow);
    })
    .slice(0,8)
    .map(x=>({id:`local-${x.id}`,kind:'passage',unitId:x.id,book:books[x.bi].short,unit:x.u.title,heading:x.u.title,pages:[],snippet:(bookNotes[x.id]?.text||x.u.lesson).slice(0,220),score:1.5}));
   fetch(`/api/ollama/search?q=${encodeURIComponent(q)}&limit=10`)
    .then(r=>r.ok?r.json():null)
    .then(d=>{if(alive){setSearchHits(Array.isArray(d?.hits)&&d.hits.length?d.hits:localHits);setSearching(false);}})
    .catch(()=>{if(alive){setSearchHits(localHits);setSearching(false);}});
  },140);
  return ()=>{alive=false;clearTimeout(tid);};
 },[searchQuery]);
 useEffect(()=>{
  if(page!=='Test'||choice||qi>=quiz.length){setQElapsedSec(0);return;}
  qStartRef.current=Date.now();
  setQElapsedSec(0);
  const id=setInterval(()=>{setQElapsedSec(Math.floor((Date.now()-qStartRef.current)/1000));},1000);
  return ()=>clearInterval(id);
 },[page,qi,choice,quiz.length]);
 useEffect(()=>{
  if(page!=='Test'||!isFullExam||qi>=quiz.length||examRemainingSec<=0)return;
  const id=setInterval(()=>{setExamRemainingSec(s=>Math.max(0,s-1));},1000);
  return ()=>clearInterval(id);
 },[page,isFullExam,qi,quiz.length,examRemainingSec]);
 const selectedId=selected?`${selected.bi}-${selected.ui}`:'';
 const loadUnitLesson=async(uid:string)=>{
  if(!uid)return;
  try{
   const [r,rIntel]=await Promise.all([
    fetch(`/api/ollama/lessons?unitId=${encodeURIComponent(uid)}`),
    fetch(`/api/ollama/tvgfbf-swarm/unit?unitId=${encodeURIComponent(uid)}`)
   ]);
   if(r.ok){
    const d=await r.json();
    setUnitLesson(d.lesson||null);
    setLessonPerf(d.performance||null);
   }
   if(rIntel.ok){
    const dIntel=await rIntel.json();
    setUnitTvgfbfIntel(dIntel?.ok?dIntel:null);
   }
  }catch{}
 };
 useEffect(()=>{
  if(selectedId&&page==='Derslerim') loadUnitLesson(selectedId);
  else { setUnitLesson(null); setUnitTvgfbfIntel(null); }
 },[selectedId,page]);
 const enhanceCurrentLesson=async()=>{
  if(!selectedId||enhancingLesson)return;
  setEnhancingLesson(true);
  setReframeMsg('');
  try{
   const r=await fetch('/api/ollama/lessons/enhance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({unitId:selectedId})});
   if(r.ok){
    const d=await r.json();
    if(d.lesson) setUnitLesson(d.lesson);
    await loadUnitLesson(selectedId);
   }
  }catch{}finally{setEnhancingLesson(false);}
 };
 const reframeLesson=async(targetUnitId?:string,openAfter=false)=>{
  const uid=targetUnitId||selectedId;
  if(!uid||reframingLesson)return;
  setReframingLesson(true);
  setReframeMsg('');
  try{
   const r=await fetch('/api/ollama/lessons/reframe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({unitId:uid})});
   if(r.ok){
    const d=await r.json();
    if(uid===selectedId&&d.lesson) setUnitLesson(d.lesson);
    setReframeMsg(`Yeni anlatım tarzı (${d.lesson?.activeStyle||'Yeni Kurgu'}) ve yepyeni kodlamalar üretildi!`);
    if(openAfter){
     const [biStr,uiStr]=uid.split('-');
     setSelected({bi:Number(biStr),ui:Number(uiStr)});
     setPage('Derslerim');
     setMode('Konu anlatımı');
     window.scrollTo(0,0);
    }
   }
  }catch{}finally{setReframingLesson(false);}
 };
 const openUnit=(bi:number,ui:number,initialMode='Konu anlatımı')=>{setSelected({bi,ui});setPage('Derslerim');setMode(initialMode);setReframeMsg('');window.scrollTo(0,0)};
 const markRead=(id:string)=>{if(!progress.read.includes(id))save({...progress,read:[...progress.read,id]})};
 // Bir üniteyi en baştan okumak/çalışmak isteyenler için: tamamlandı işaretini, o ünitenin test
 // istatistiklerini (doğru/yanlış/ustalık serisi) ve tekrar yolu planını siler. Ünite anlatımı ve
 // kitap PDF'i zaten her zaman tekrar okunabilir; bu düğme yalnız "sıfırdan başlamak" isteyenler içindir.
 const resetUnit=(id:string)=>{
  if(!confirm('Bu üniteyi sıfırlayıp en baştan mı başlamak istiyorsun? "Tamamlandı" işareti, bu ünitenin test istatistikleri ve tekrar yolu planı silinir; ünite anlatımı ve kitap kalır.'))return;
  const results={...progress.results};delete results[id];
  save({...progress,read:progress.read.filter(x=>x!==id),results});
  const nextReviews={...reviews};delete nextReviews[id];saveReviews(nextReviews);
  window.scrollTo(0,0);
 };
 // Yanlış yapılan sorular, değiştirilerek (yeniden yazılmış kök + karışık şık sırası) sonraki
 // karma/tekrar testlerine RASTGELE aralara serpiştirilir; ayrı bir "hata testi" açmayı beklemez.
 const injectRetryVariants=(pool:QuizItem[])=>{
  if(!activeMistakes.length||!pool.length)return pool;
  const out=pool.slice();
  const maxInject=Math.min(4,Math.max(1,Math.round(out.length*0.2)));
  const variants=buildRetryVariants(activeMistakes.map(m=>({key:m.key,question:m.question,answer:m.answer,wrongOptions:m.wrongOptions,wrongCount:m.wrongCount})),8);
  const shuffled=variants.map(v=>({v,r:Math.random()})).sort((a,b)=>a.r-b.r).map(x=>x.v);
  let injected=0;
  for(const {key,variant} of shuffled){
   if(injected>=maxInject)break;
   if(out.some(x=>normStem(x.u.question)===normStem(variant.question)))continue;
   const mistake=activeMistakes.find(m=>m.key===key);
   if(!mistake)continue;
   const baseUnit=all.find(x=>x.id===mistake.unitId);
   if(!baseUnit)continue;
   const pos=Math.floor(Math.random()*(out.length+1));
   out.splice(pos,0,{...baseUnit,retryOf:key,u:{...baseUnit.u,question:variant.question,answer:variant.answer,wrong:variant.wrong,key:mistake.explanation,source:variant.source}});
   injected++;
  }
  return out;
 };
 const startQuiz=(filter?:number,onlyId?:string,hard=false,full=false,weak=false,uncovered=false,bookOfficial=false,tierFilter:('all'|DifficultyTier4)=selectedTier)=>{
  const sourceUnits=(full||bookOfficial||tierFilter==='imkansiz')?all:studied;
  const seenStems=new Set<string>();
  const rawPool=sourceUnits.filter(x=>(filter===undefined||x.bi===filter)&&(!onlyId||x.id===onlyId)&&(!weak||((progress.results[x.id]?.wrong||0)>0&&(progress.results[x.id]?.streak||0)<MASTERY_STREAK))).flatMap(x=>{
   const officialRows=bookOfficialQs.filter(bq=>bq.unitId===x.id).map(bq=>({...x,u:{...x.u,question:bq.question,answer:bq.answer,wrong:bq.options.filter(o=>o!==bq.answer),key:`${bq.book} · ${bq.unit} ünitesi "neler öğrendik?" değerlendirme sorusu (Sayfa ${bq.testPage||'-'}).`,topic:bq.topic||x.u.title,source:`Resmî Kitap "Neler Öğrendik?" · s.${bq.testPage||'-'}`}}));
   // Kitabın kendi sorusundan yeniden yazılmış paralel sorular (aynı bilgi, farklı lafız)
   const parallelRows=bookParallelQs.filter(bq=>bq.unitId===x.id).map(bq=>({...x,parallelOf:bq.sourceQuestion?normStem(bq.sourceQuestion):'',u:{...x.u,question:bq.question,answer:bq.answer,wrong:bq.options.filter(o=>o!==bq.answer),key:bq.explanation||x.u.key,topic:bq.topic||x.u.title,source:`Kitap Paraleli · ${bq.topic||x.u.title}`}}));
   if(bookOfficial){
    const aiTvgfbf=generated.filter(q=>q.status==='approved'&&q.unitId===x.id&&(q.tvgfbfAligned!==false)).map(q=>({...x,u:{...x.u,question:q.question,answer:q.answer,wrong:q.options.filter(o=>o!==q.answer),key:q.explanation,topic:q.topic,paragraph:q.paragraph,source:`TVGFBF & Kitap Stili · ${q.model}`}}));
    const localBookQ=(bookQuestions[x.id]||[]).map(line=>{const [question,answer,...rest]=line.split('|'); const explanation=rest.pop()!; return {...x,u:{...x.u,question,answer,wrong:rest,key:explanation,source:'Kitap Değerlendirme Stili'}}});
    return [...officialRows,...localBookQ,...aiTvgfbf];
   }
   return [
    ...(hard||uncovered?[]:[x]),
    ...officialRows,
    ...parallelRows,
    ...[...(hard||uncovered?[]:(extra[x.bi]?.[x.ui]||[])),...(hard||uncovered?[]:(scenarios[x.bi]?.[x.ui]||[])),...(hard||uncovered?[]:(practice[x.bi]?.[x.ui]||[])),...(hard||uncovered?[]:[reinforcement[x.bi][x.ui],...(unique[x.id]?.questions||[]),...(advanced[x.id]?.questions||[]),...(newQuestions[x.id]?.questions||[]),...(bookQuestions[x.id]||[])]),...(hard?(challenge[x.id]||[]):[])].map(line=>{const [question,answer,...rest]=line.split('|'); const explanation=rest.pop()!; return {...x,u:{...x.u,question,answer,wrong:rest,key:explanation}}}),
    ...(!hard&&!uncovered&&x.id==='3-4'?calculated.map(u=>({...x,u})):[]),
    ...(!hard?generated.filter(q=>q.status==='approved'&&q.unitId===x.id&&(!uncovered||Boolean(q.passageId)||q.questionAngle==='surpriz_baglam')).map(q=>({...x,u:{...x.u,question:q.question,answer:q.answer,wrong:q.options.filter(o=>o!==q.answer),key:q.explanation,topic:q.topic,paragraph:q.paragraph,source:`Ollama · ${q.model}${q.difficulty?` · ${q.difficulty.toUpperCase()}`:''}${q.questionAngle?` · ${q.questionAngle.replace('_',' ')}`:''}${q.examPotential?` · Sınav ★${q.examPotential}/5`:''}${q.pages?.length?` · s.${q.pages.join(',')}`:''}`}})):[])
   ];
  }).filter(x=>{
   if(x.id==='0-5'&&/mezo döngü|makro döngü/i.test(x.u.question+' '+x.u.answer))return false;
   // Konu anlatım özetlerinde ve kitapta karşılığı olmayan soru teste girmesin.
   if(onlyInSource&&!groundingOk(x.u.question))return false;
   const stemKey=x.u.question.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().slice(0,85);
   if(seenStems.has(stemKey))return false;
   seenStems.add(stemKey);
   return true;
  });
  let filteredByTier=rawPool;
  if(!full&&tierFilter!=='all'){
   const exact=rawPool.filter(x=>getQuestionMeta(x).aiDifficultyTier===tierFilter);
   filteredByTier=exact.length>=3?exact:rawPool.slice().sort((a,b)=>{
    const ea=getQuestionMeta(a).predictedEliminationPct;
    const eb=getQuestionMeta(b).predictedEliminationPct;
    return tierFilter==='imkansiz'||tierFilter==='zor'?(eb-ea):(ea-eb);
   });
  }
  let pool:QuizItem[]=filteredByTier.map(x=>{const r=progress.results[x.id]; const w=r?.wrong||0, streak=r?.streak||0, mastered=streak>=MASTERY_STREAK; const bookBonus=/Neler Öğrendik|TVGFBF/i.test(x.u.source||'')?1.35:1; return {...x, weight:Math.random()*bookBonus*(mastered?0.35:(1+w*4))}}).sort((a,b)=>b.weight-a.weight);
  if (full) { const bookPools:typeof pool=[]; for(let b=0;b<5;b++){const bItems=pool.filter(x=>x.bi===b); const perU:Record<string,number>={}; const picked:typeof pool=[]; for(const item of bItems){if(picked.length>=20)break; if((perU[item.id]||0)<5){perU[item.id]=(perU[item.id]||0)+1;picked.push(item);}} for(const item of bItems){if(picked.length>=20)break; if(!picked.includes(item))picked.push(item);} bookPools.push(...picked);} pool=bookPools; }else{if(!onlyId){const perUnit:Record<string,number>={};pool=pool.filter(x=>{const cap=((progress.results[x.id]?.wrong||0)>0&&(progress.results[x.id]?.streak||0)<MASTERY_STREAK)?5:3;perUnit[x.id]=(perUnit[x.id]||0)+1;return perUnit[x.id]<=cap;});}pool=pool.slice(0,20);}
  // Aynı testte hem kitabın kendi sorusu hem onun paraleli çıkmasın: paralel, kaynak
 // sorunun aynı bilgisini ölçer; ikisi bir arada gereksiz tekrar olur.
 {const stems=new Set(pool.map(x=>normStem(x.u.question)));pool=pool.filter(x=>!x.parallelOf||!stems.has(x.parallelOf));}
 if(!full&&!bookOfficial&&!onlyId&&filter===undefined)pool=injectRetryVariants(pool) as QuizItem[];
 qStartRef.current=Date.now();setIsFullExam(Boolean(full));setExamRemainingSec(6000);setQuizBookScores({});setQuizAnswers({});setQuizFlags({});setCombo(0);setLastXpGain(0);setEliminatedOpts({});setHintRevealed({});setQuiz(pool);setQi(0);setChoice(null);setScore(0);setPage('Test');window.scrollTo(0,0);
 };
 // Hata defterindeki yanlışlar, KÖKÜ DEĞİŞTİRİLEREK yeniden sorulur: doğru cevap ve
 // çeldiriciler korunur, yalnızca lafız değişir; böylece şık yerinin ezberlenmesi boşa çıkar.
 const startMistakeQuiz=()=>{
  if(!activeMistakes.length)return;
  const pool:QuizItem[]=activeMistakes.slice(0,25).map(m=>{
   const baseUnit=all.find(x=>x.id===m.unitId)||{u:books[m.bi]?.units?.[m.ui]||books[0].units[0],bi:m.bi,ui:m.ui,id:m.unitId};
   const variant=buildRetryVariant({question:m.question,answer:m.answer,options:[m.answer,...m.wrongOptions]},`${m.key}#retry`,m.wrongCount);
   const baseSource=`Hata Defterim (${m.wrongCount}× yanlış)${m.source?` · ${m.source}`:''}`;
   return {...baseUnit,retryOf:m.key,u:{...baseUnit.u,question:variant?variant.question:m.question,answer:m.answer,wrong:variant?variant.wrong:m.wrongOptions,key:m.explanation,source:variant?`${variant.source}${m.source?` · ${m.source}`:''}`:baseSource}};
  });
  qStartRef.current=Date.now();
  setIsFullExam(false);setExamRemainingSec(6000);setQuizBookScores({});setQuizAnswers({});setQuizFlags({});setCombo(0);setLastXpGain(0);setEliminatedOpts({});setHintRevealed({});setQuiz(pool);setQi(0);setChoice(null);setScore(0);setPage('Test');window.scrollTo(0,0);
 };
 const jumpToQuestion=(idx:number)=>{
  if(idx<0||idx>=quiz.length)return;
  setQi(idx);
  const prev=quizAnswers[idx];
  setChoice(prev?prev.choice:null);
  setKayseriReaction(null);
  qStartRef.current=Date.now();
 };
 const toggleQuizFlag=(idx:number)=>{
  setQuizFlags(prev=>({...prev,[idx]:!prev[idx]}));
 };
 const fetchKayseriReaction=(item:typeof all[number],selectedAns:string,isCorrect:boolean,modeOverride=kayseriMode,extra:{elapsedSec?:number;streak?:number;wrongCount?:number}={})=>{
  fetch('/api/ollama/kayseri-react',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    unitId:item.id,
    question:item.u.question,
    options:[item.u.answer,...item.u.wrong],
    selectedOption:selectedAns,
    correctAnswer:item.u.answer,
    isCorrect,
    elapsedSec:extra.elapsedSec??8,
    streak:extra.streak??0,
    wrongCount:extra.wrongCount??0,
    explanation:item.u.key,
    mode:modeOverride
   })
  })
   .then(r=>r.ok?r.json():null)
   .then(d=>{if(d?.reaction)setKayseriReaction(d.reaction);})
   .catch(()=>{});
 };
 const answer=(ans:string)=>{if(choice||quizAnswers[qi])return;setChoice(ans);setKayseriReaction(null);const item=quiz[qi], correct=ans===item.u.answer; const qMeta=getQuestionMeta(item); const nextCombo=correct?combo+1:0; setCombo(nextCombo); if(correct){const tierXp=qMeta.aiDifficultyTier==='imkansiz'?60:qMeta.aiDifficultyTier==='zor'?40:qMeta.aiDifficultyTier==='orta'?25:15; const gain=tierXp*Math.min(4,Math.max(1,nextCombo)); setXpEarned(x=>x+gain); setLastXpGain(gain);} else { setLastXpGain(0); } setQuizAnswers(prev=>({...prev,[qi]:{choice:ans,correct}})); const elapsedSec=Math.max(1,Math.min(600,Math.round((Date.now()-qStartRef.current)/1000))); if(correct)setScore(s=>s+1); else saveReviews({...reviews,[item.id]:prioritize(Date.now())}); const mKey=String(item.retryOf||'')||`${item.id}::${item.u.question.slice(0,90)}`; const existingIdx=mistakes.findIndex(m=>m.key===mKey); if(correct){ if(existingIdx>=0){ const upd=[...mistakes]; upd[existingIdx]={...upd[existingIdx],mastered:true,updatedAt:new Date().toISOString()}; saveMistakes(upd); } }else{ const entry:MistakeEntry={key:mKey,unitId:item.id,bi:item.bi,ui:item.ui,unitTitle:books[item.bi]?.units?.[item.ui]?.title||item.u.title,question:item.u.question,answer:item.u.answer,wrongOptions:item.u.wrong,explanation:item.u.key,chosenWrong:ans,source:item.u.source,wrongCount:(existingIdx>=0?mistakes[existingIdx].wrongCount:0)+1,mastered:false,updatedAt:new Date().toISOString()}; const upd=existingIdx>=0?mistakes.map((m,idx)=>idx===existingIdx?entry:m):[...mistakes,entry]; saveMistakes(upd); } setQuizBookScores(prev=>{const cur=prev[item.bi]||{right:0,total:0};return {...prev,[item.bi]:{right:cur.right+(correct?1:0),total:cur.total+1}};}); const old=progress.results[item.id]||{right:0,wrong:0,streak:0,totalSec:0};const nextStreak=correct?(old.streak||0)+1:0;const nextWrong=old.wrong+(correct?0:1);const nextResults={...progress.results,[item.id]:{right:old.right+(correct?1:0),wrong:nextWrong,streak:nextStreak,totalSec:+((old.totalSec||0)+elapsedSec).toFixed(1),lastSec:elapsedSec}};const nextStudySec=+((progress.totalStudySec||0)+elapsedSec).toFixed(1);save({...progress,results:nextResults,totalStudySec:nextStudySec});syncStudentSignal(item.id,correct,nextResults,nextStudySec);fetchKayseriReaction(item,ans,correct,kayseriMode,{elapsedSec,streak:nextStreak,wrongCount:old.wrong||0});};
 const triggerFiftyFifty=()=>{
  if(choice||eliminatedOpts[qi]?.length||!quiz[qi])return;
  const wrongs=quiz[qi].u.wrong.slice(0,2);
  setEliminatedOpts(prev=>({...prev,[qi]:wrongs}));
 };
 const triggerHint=()=>{
  if(!quiz[qi])return;
  setHintRevealed(prev=>({...prev,[qi]:true}));
 };
 const speak=(text:string,role:'coach'|'kayseri'|'narrator'='coach')=>{
  if(speaking){stopVoiceStudio();setSpeaking(false);return;}
  setSpeaking(true);
  speakWithVoiceStudio(text,{role,onEnd:()=>setSpeaking(false)}).catch(()=>setSpeaking(false));
 };
 const nav=(name:string)=>{stopVoiceStudio();setSpeaking(false);setInlinePdfUrl('');setPage(name);setSelected(null);setMenu(false);window.scrollTo(0,0)};
 const current=selected?books[selected.bi].units[selected.ui]:null; const currentId=selected?`${selected.bi}-${selected.ui}`:'';
 const options=(u:Unit)=>[u.answer,...u.wrong].sort((a,b)=>a.localeCompare(b,'tr'));
 return <div className="app"><aside className={menu?'sidebar open':'sidebar'}><div className="brand"><div className="brand-mark"><span>✳</span></div><div><strong>tempo<span>.</span></strong><small>TEMEL EĞİTİM</small></div><button className="close mobile" aria-label="Menüyü kapat" onClick={()=>setMenu(false)}><X size={20}/></button></div><div className="side-label">ÇALIŞMA ALANIM</div><nav aria-label="Ana gezinme">{[[LayoutDashboard,'Genel bakış'],[Smartphone,'TikTok Akışı'],[BookOpen,'Derslerim'],[Layers,'Kart & Eşleştirme'],[RotateCcw,'Tekrar yolu'],[ClipboardList,'Test merkezi'],[Headphones,'Sesli çalışma'],[Sparkles,'Soru stüdyosu'],[CalendarDays,'Çalışma planım']].map(([Icon,name])=><button className={page===name?'active':''} key={name as string} onClick={()=>nav(name as string)}><Icon size={19}/><span>{name as string}</span>{page===name&&<i/>}</button>)}</nav><div className="side-bottom"><div className="side-card"><div className="side-card-icon"><Sparkles size={17}/></div><b>Küçük adımlar,<br/>büyük sonuçlar.</b><p>Her gün biraz daha ilerle. Hedefine düşündüğünden daha yakınsın.</p></div><button onClick={()=>nav('Ayarlar')}><Settings size={18}/> Ayarlar</button><div className="profile"><div className="avatar">Ö</div><div><b>Öğrenci</b><small>100 puan hedefi</small></div><ChevronRight size={16}/></div></div></aside>
 <main><header className="topbar"><button className="mobile menu" aria-label="Menüyü aç" onClick={()=>setMenu(true)}><Menu/></button><div className="breadcrumb">Çalışma alanım <ChevronRight size={14}/> <b>{page}</b></div><div className="top-right"><button type="button" className="nexus-topbar-pill" onClick={()=>nav('Test merkezi')} title="5 modül × 20 = 100 soru · 12/20 baraj sınav simülatörü"><span className="nexus-pulse"/><span>TVGFBF 5×20 Hazırlık · {bookOfficialQs.length || 268} Kitap Sorusu{nexusPill ? ` · Sınav Hedefi %${Math.min(100, Math.round((examPrediction.totalEstimated100)))}` : ''}</span></button><span className="date-pill"><CalendarDays size={15}/> 20 Aralık 2026 sınavı</span><div className="top-avatar">Ö</div></div></header><div className="content">
 {page==='Genel bakış'&&<><div className="welcome"><div><div className="eyebrow"><span className="dot"/> YENİ NESİL ANTRENÖRLÜK HAZIRLIK</div><h1>Merhaba, geleceğin<br/><em>antrenörü.</em> <span className="wave">✳</span></h1><p>Her büyük başarı, atılan küçük bir adımla başlar.<br/>Tüm AI, RAG, 3D animasyon ve eğitim motorları arka planda senin için otomatik çalışıyor.</p><button className="primary" onClick={()=>openUnit(nextLesson.bi,nextLesson.ui)}>Derse devam et <ArrowUpRight size={17}/></button><button className="hero-repeat" onClick={()=>nav('Tekrar yolu')}>Tekrar yolum ({dueCount}) <ChevronRight size={16}/></button></div><div className="hero-art"><div className="art-circle"><div className="art-orbit orbit-one"></div><div className="art-orbit orbit-two"></div><div className="art-star">✳</div><div className="art-book"><BookOpen size={58} strokeWidth={1.1}/></div><div className="art-badge"><span>✦</span> HEDEF <b>100</b></div></div><div className="art-label">BİRLİKTE<br/><b>DAHA İLERİYE.</b></div></div></div>
 <div className="stats"><div className="stat"><div className="stat-icon green"><CalendarDays size={19}/></div><div><span>SINAVA KALAN</span><strong>{days} <small>gün</small></strong><p>20 Aralık 2026</p></div></div><div className="stat"><div className="stat-icon peach"><BookOpen size={19}/></div><div><span>TAMAMLANAN ÜNİTE</span><strong>{progress.read.length} <small>/ 29</small></strong><p>Öğrenme yolculuğun</p></div></div><div className="stat"><div className="stat-icon purple"><Target size={19}/></div><div><span>DOĞRULUK &amp; SÜRE</span><strong>%{accuracy}</strong><p>{totalRight+totalWrong} soru · {totalStudyMin} dk</p></div></div><div className="stat last"><div className="stat-icon yellow"><Flame size={19}/></div><div><span>TAHMİNİ SINAV</span><strong>{examPrediction.totalEstimated100} <small>/ 100</small></strong><p>{examPrediction.booksPassingBaraj}/5 kitap 12+ barajda</p></div></div></div>
 <div className="quick-search-box">
  <div className="quick-search-input">
   <Search size={17}/>
   <input type="search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="1.021 sayfa kitap &amp; kavram ara (örn: VO2max, laktat, ATP-CP, liderlik, doping)..." aria-label="Kitap ve kavram arama"/>
   {searchQuery&&<button type="button" className="qs-clear" onClick={()=>setSearchQuery('')}>Temizle</button>}
  </div>
  {searching&&<p className="qs-hint">Kitap sayfaları ve onaylı soru havuzu taranıyor...</p>}
  {!searching&&searchQuery.trim().length>=2&&searchHits.length===0&&<p className="qs-hint">Eşleşen pasaj veya soru bulunamadı; farklı bir anahtar kavram dene.</p>}
  {searchHits.length>0&&<div className="qs-results">
   {searchHits.map(h=>{
    const [biStr,uiStr]=String(h.unitId||'0-0').split('-');
    return <button type="button" className="qs-hit" key={h.id} onClick={()=>{setSearchQuery('');openUnit(Number(biStr||0),Number(uiStr||0));}}>
     <div className="qs-hit-top">
      <span className="qs-badge">{h.kind==='question'?'Onaylı Soru':'Kitap Pasajı'}</span>
      <b>{h.book} · {h.unit}</b>
      {h.pages?.length>0&&<small>s.{h.pages.join(',')}</small>}
     </div>
     <p>{h.snippet}...</p>
    </button>;
   })}
  </div>}
 </div>
 <div className="exam-radar-panel">
  <div className="exam-radar-head">
   <div>
    <div className="eyebrow muted">5 DERS AYRI BARAJ RADARI (12/20 BARAJI)</div>
    <h2>Tahmini Sınav Karnesi: {examPrediction.totalEstimated100} / 100</h2>
    <p>{examPrediction.allBarajMet?'Harika! Tüm dersler 12/20 barajının üzerinde görünüyor; hedefi 16+/20 güvenli banda çek.':'Dikkat: Her ders ayrı değerlendirilir; 12/20 altındaki kitap tek ders bütünlemesine yol açabilir.'}</p>
   </div>
   <div className="exam-radar-actions">
    {activeMistakes.length>0&&<button className="outline" onClick={startMistakeQuiz}><RotateCcw size={15}/> Hata Defterimden Çöz ({activeMistakes.length})</button>}
    {(()=>{const weakest=[...examPrediction.books].sort((a,b)=>a.estimatedOutOf20-b.estimatedOutOf20)[0];return weakest?<button className="outline" onClick={()=>startQuiz(weakest.bookIndex,undefined,false,false,false,false,true)}><Target size={15}/> En Zayıf: {weakest.book} ({weakest.estimatedOutOf20}/20)</button>:null;})()}
    <button className="primary" onClick={()=>startQuiz(undefined,undefined,false,true)}><Award size={15}/> 5×20=100 Tam Sınav</button>
   </div>
  </div>
  <div className="exam-radar-grid">
   {examPrediction.books.map(b=><div className={`exam-radar-card ${b.passRisk}`} key={b.bookIndex}>
    <div className="er-top">
     <b>{b.book}</b>
     <span className={`er-pill ${b.passRisk}`}>{b.estimatedOutOf20}/20 {b.passRisk==='yuksek_risk'?'Baraj Riski':b.passRisk==='sinirda'?'Sınırda':'Güvenli'}</span>
    </div>
    <div className="progress"><div style={{width:`${(b.estimatedOutOf20/20)*100}%`,background:b.passRisk==='yuksek_risk'?'#c9493b':b.passRisk==='sinirda'?'#d89a2b':'#2e6f40'}}/></div>
    <small>{b.studiedUnits}/{b.totalUnits} ünite · Doğruluk %{b.accuracyPct} · {b.answered} soru</small>
    <div className="er-links">
     <button type="button" className="text-link" onClick={()=>openUnit(b.bookIndex,0)}>Çalış</button>
     <button type="button" className="text-link" onClick={()=>startQuiz(b.bookIndex)}>20’lik Test</button>
    </div>
   </div>)}
  </div>
 </div>
 <div className="section-head"><div><div className="eyebrow muted">ÖĞRENME YOLCULUĞUN</div><h2>Derslerin, senin tempon.</h2><p>Bir ders seç, kaldığın yerden devam et.</p></div><button className="text-link" onClick={()=>nav('Derslerim')}>Tüm dersleri gör <ArrowUpRight size={16}/></button></div><div className="book-grid">{books.map((b,bi)=>{const done=b.units.filter((_,ui)=>progress.read.includes(`${bi}-${ui}`)).length;return <button className="book-card" key={b.title} onClick={()=>openUnit(bi,0)}><div className="book-top"><span className="book-icon" style={{background:b.color}}><BookOpen size={21}/></span><span className="book-num">0{bi+1} / 05</span></div><h3>{b.title}</h3><p>{b.units.length} ünite <span>•</span> Konu anlatımı & test</p><div className="progress-label"><span>İlerlemen</span><b>{done}/{b.units.length}</b></div><div className="progress"><div style={{width:`${done/b.units.length*100}%`,background:b.color}}/></div><div className="card-link">Derse git <ArrowUpRight size={15}/></div></button>})}</div>
 <div className="bottom-grid"><div className="focus-card"><div><div className="eyebrow">✦ SENİN İÇİN HAZIRLANDI</div><h2>Öğren, uygula,<br/><em>kalıcı hale getir.</em></h2><p>Önce konuyu keşfet, sonra öğrendiklerini test et. Yanlışların bir sonraki çalışmana yön versin.</p><button className="dark-button" onClick={()=>nav('Test merkezi')}>Test merkezine git <ArrowUpRight size={16}/></button></div><div className="focus-graphic"><Target size={92} strokeWidth={1}/><span>01</span></div></div><div className="routine"><div className="eyebrow muted">KÜÇÜK BİR HATIRLATMA</div><h3>Bugünün çalışma ritmi</h3><p>Başlamak için mükemmel zamanı bekleme.</p><div className="routine-row"><div className="routine-icon"><BookOpen size={17}/></div><span>Bir üniteye göz at<small>Öğrenmenin ilk adımı</small></span><ChevronRight size={16}/></div><div className="routine-row"><div className="routine-icon"><ClipboardList size={17}/></div><span>Kendini test et<small>Bilgilerini pekiştir</small></span><ChevronRight size={16}/></div></div></div>
 </>}
 {page==='Tekrar yolu'&&<MemoryPath read={progress.read} reviews={reviews} onReviews={saveReviews} onOpen={openUnit} onQuiz={id=>startQuiz(undefined,id)}/>}
 {page==='TikTok Akışı'&&<TikTokVideoFeed/>}
 {page==='Kart & Eşleştirme'&&<StudyArcade read={progress.read} weakUnits={weakUnits} onStudySignal={(uid,ok)=>{const old=progress.results[uid]||{right:0,wrong:0,streak:0};save({...progress,results:{...progress.results,[uid]:{right:old.right+(ok?1:0),wrong:old.wrong+(ok?0:1),streak:ok?(old.streak||0)+1:0}}});syncStudentSignal(uid,ok);}}/>}
 {page==='Derslerim'&&!current&&<><div className="page-title"><div className="eyebrow muted">ÖĞRENME YOLCULUĞUN</div><h1>Derslerim<span className="accent">.</span></h1><p>Beş kitap, 29 ünite. Her seferinde bir adım.</p></div>
 <div className="quick-search-box">
  <div className="quick-search-input">
   <Search size={17}/>
   <input type="search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Tüm kitaplarda kavram veya başlık ara (örn: aerobik, etik, kas kasılması)..." aria-label="Derslerimde kitap arama"/>
   {searchQuery&&<button type="button" className="qs-clear" onClick={()=>setSearchQuery('')}>Temizle</button>}
  </div>
  {searchHits.length>0&&<div className="qs-results">
   {searchHits.map(h=>{
    const [biStr,uiStr]=String(h.unitId||'0-0').split('-');
    return <button type="button" className="qs-hit" key={h.id} onClick={()=>{setSearchQuery('');openUnit(Number(biStr||0),Number(uiStr||0));}}>
     <div className="qs-hit-top">
      <span className="qs-badge">{h.kind==='question'?'Onaylı Soru':'Kitap Pasajı'}</span>
      <b>{h.book} · {h.unit}</b>
      {h.pages?.length>0&&<small>s.{h.pages.join(',')}</small>}
     </div>
     <p>{h.snippet}...</p>
    </button>;
   })}
  </div>}
 </div>
 <div className="book-grid">{books.map((b,bi)=><div className="book-card list-card" key={b.title}><span className="book-icon" style={{background:b.color}}><BookOpen size={21}/></span><h3>{b.title}</h3><p>{b.units.length} ünite</p>{b.units.map((u,ui)=><button className="unit-link" key={u.title} onClick={()=>openUnit(bi,ui)}><span>{String(ui+1).padStart(2,'0')}</span>{u.title}{progress.read.includes(`${bi}-${ui}`)?<Check size={15}/>:<ChevronRight size={15}/>}</button>)}</div>)}</div></>}
 {current&&selected&&page==='Derslerim'&&<><button className="back" onClick={()=>{setSelected(null)}}><ArrowLeft size={16}/> Tüm dersler</button><div className="lesson-layout"><div className="lesson-main"><div className="eyebrow muted">{books[selected.bi].short.toLocaleUpperCase('tr-TR')} / ÜNİTE {selected.ui+1}</div><h1>{current.title}<span className="accent">.</span></h1><p className="lead">Hedef yalnız geçmek değil <b>100/100 Full Doğru</b> ve kalıcı ezber — önce uzun, püf noktalı ve kodlamalı öğren; ardından 5 farklı soru açısıyla pekiştir.</p> <div className="tabs">{['Konu anlatımı','3D Video Ders','Örnekle öğren','Hatırla'].map(t=><button key={t} className={mode===t?'selected':''} onClick={()=>setMode(t)}>{t==='3D Video Ders'&&<Film size={14} style={{verticalAlign:'middle',marginRight:4}}/>}{t}</button>)}</div>
 {rereadUnits.length>0&&rereadUnits.includes(currentId)&&<div className="remediation-banner">
  <strong><AlertCircle size={17}/> Bu konuda fazla yanlış yaptın — önce burayı biraz daha okuyalım!</strong>
  <p>{lessonPerf?.recommendation || 'Bu ünitede arka arkaya hatalar görüldü. Önce aşağıdaki uzun konu anlatımını ve 3D diyaloglu videoyu izle; eğer hâlâ aklında kalmıyorsa kodlamaları ve hikâyeyi tek tıkla bambaşka bir yaklaşıma çevirelim.'}</p>
  <div className="remediation-actions">
   <button className="primary" onClick={()=>setMode('3D Video Ders')}><Film size={14}/> 3D Diyaloglu Videoyu İzle</button>
   <button className="outline" onClick={()=>reframeLesson(currentId)} disabled={reframingLesson}><Wand2 size={14}/> {reframingLesson?'Yeni Kodlamalar Kuruluyor...':'Aklımda Kalmadı: Kodlamaları & Anlatımı Değiştir'}</button>
  </div>
 </div>}
 {reframeMsg&&<p className="video-status-line" style={{marginBottom:12}}>{reframeMsg}</p>}
 {mode==='3D Video Ders'&&<VideoLessonStage unitId={currentId} unitTitle={current.title}/>}
 {mode!=='3D Video Ders'&&<div className="lesson-box"><div className="lesson-box-header"><span className="book-icon" style={{background:books[selected.bi].color}}><BookOpen size={21}/></span><button className="audio-btn" onClick={()=>speak(`${current.title}. ${unitLesson?.overviewHook||''} ${current.lesson} ${deepDive[selected.bi][selected.ui]} ${(unitLesson?.deepSections||[]).map(s=>`${s.title}. ${s.body} ${s.recallAnchor||''}`).join(' ')} ${(unitLesson?.proTips||[]).map(p=>`Püf noktası: ${p.title}. ${p.tip}`).join(' ')} ${(unitLesson?.memoryMnemonics||[]).map(m=>`Kodlama: ${m.code}. ${m.standsFor}. ${m.story}`).join(' ')} ${expanded[selected.bi][selected.ui].join(". ")} ${unique[currentId]?.lesson||""} ${advanced[currentId]?.lesson||""} ${newQuestions[currentId]?.lesson||""} ${bookNotes[currentId]?.text||""} Önemli not: ${current.key} Örnek: ${current.example}`)}>{speaking?<Pause size={16}/>:<Volume2 size={16}/>} {speaking?'Durdur':'Sesli dinle'}</button></div><div className="eyebrow muted">{mode==='Konu anlatımı'?'KONUYU KALICI ÖĞREN':'BİR ÖRNEKLE / HATIRLA'}</div><h2>{mode==='Konu anlatımı'?'Temel fikir ve büyük resim':mode==='Örnekle öğren'?'Bilgiyi hayata taşı':'Önemli not'}</h2><p className="lesson-text">{mode==='Konu anlatımı'?current.lesson:mode==='Örnekle öğren'?current.example:current.key}</p>{mode==='Konu anlatımı'&&<><h2>Biraz daha derine</h2><p className="lesson-text">{deepDive[selected.bi][selected.ui]} {unique[currentId]?.lesson} {advanced[currentId]?.lesson} {newQuestions[currentId]?.lesson}</p>{bookNotes[currentId]&&<><h2>{bookNotes[currentId].title}</h2><p className="lesson-text">{bookNotes[currentId].text}</p></>}{unitLesson&&<div className="ai-lesson-stack">
 <div className="ai-lesson-banner">
  <div>
   <strong><Brain size={15} style={{verticalAlign:'middle',marginRight:6}}/> Uzun, Püf Noktalı, Kodlamalı &amp; Sana Göre Şekillenen Ünite Rehberi (v{unitLesson.version}{unitLesson.reframeCount?` · Kurgu #${unitLesson.reframeCount+1}`:''})</strong>
   <p>{unitLesson.overviewHook}</p>
   {unitLesson.activeStyle&&<p><small><b>Anlatım tarzı:</b> {unitLesson.activeStyle}</small></p>}
   {lessonPerf&&<p><b>Senin bu ünite istatistiğin:</b> {lessonPerf.summaryText}</p>}
  </div>
  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
   <button className="outline" onClick={enhanceCurrentLesson} disabled={enhancingLesson}>
    <RefreshCw size={14}/> {enhancingLesson?'AI Anlatımı Geliştiriyor...':'Yapay Zekâ ile Geliştir & Uzat'}
   </button>
   <button className="outline" onClick={()=>reframeLesson(currentId)} disabled={reframingLesson}>
    <Wand2 size={14}/> {reframingLesson?'Değiştiriliyor...':'Aklımda Kalmıyor: Kodlamaları Değiştir'}
   </button>
  </div>
 </div>

 {unitLesson.adaptivePersonalCoach&&<div className="coach-box">
  <small>ÖĞRENCİ SÜRE &amp; BAŞARISINA UYARLI YAPAY ZEKÂ KOÇUN</small>
  <p>{unitLesson.adaptivePersonalCoach}</p>
 </div>}

 {unitLesson.deepSections?.length>0&&<>
  <div className="eyebrow muted" style={{marginTop:6}}>DERİNLEMESİNE &amp; YANKILI KONU ANLATIMI</div>
  {unitLesson.deepSections.map((sec,idx)=><div className="ai-section-card" key={idx}>
   <h3>{String(idx+1).padStart(2,'0')}. {sec.title}</h3>
   <p>{sec.body}</p>
   {sec.recallAnchor&&<div className="recall-anchor">📌 Zihin Çıpası: {sec.recallAnchor}</div>}
  </div>)}
 </>}

 {unitLesson.memoryMnemonics?.length>0&&<>
  <div className="eyebrow muted" style={{marginTop:6}}>KALICI EZBER KODLAMALARI &amp; AKROSTİŞLER</div>
  <div className="mnemonic-grid">
   {unitLesson.memoryMnemonics.map((m,idx)=><div className="mnemonic-card" key={idx}>
    <span className="mnemonic-code">{m.code}</span>
    <b>{m.standsFor}</b>
    <p>{m.story}</p>
   </div>)}
  </div>
 </>}

 {unitLesson.proTips?.length>0&&<>
  <div className="eyebrow muted" style={{marginTop:6}}>SINAV PÜF NOKTALARI &amp; KLASİK TUZAKLAR</div>
  <div className="tips-grid">
   {unitLesson.proTips.map((t,idx)=><div className="tip-card" key={idx}>
    <b>💡 {t.title}</b>
    <p>{t.tip}</p>
    {t.examTrap&&<div className="tip-trap">⚠️ Tuzak Uyarısı: {t.examTrap}</div>}
   </div>)}
  </div>
 </>}

 {unitLesson.fiveAngleSpotlight&&unitLesson.fiveAngleSpotlight.angles?.length>0&&<>
  <div className="eyebrow muted" style={{marginTop:6}}>1 KAVRAM · 5 FARKLI SORU AÇISI ({unitLesson.fiveAngleSpotlight.concept})</div>
  <div className="angles-grid">
   {unitLesson.fiveAngleSpotlight.angles.map((a,idx)=><div className="angle-card" key={idx}>
    <span className="angle-tag">{idx+1}. {a.angle}</span>
    <b>{a.sampleQuestion}</b>
    <p>🎯 {a.keyPoint}</p>
   </div>)}
  </div>
 </>}

 {unitLesson.spacedEchoes?.length>0&&<div className="ai-section-card">
  <h3>🔁 Tekrar Et &amp; Zihne Kazı (Yankılı Özet)</h3>
  {unitLesson.spacedEchoes.map((e,idx)=><p key={idx}>• {e}</p>)}
 </div>}

 {unitLesson.miniCheckpoints?.length>0&&<>
  <div className="eyebrow muted" style={{marginTop:6}}>ANINDA KENDİNİ DENE (AKTİF HATIRLAMA)</div>
  {unitLesson.miniCheckpoints.map((cp,idx)=><div className="checkpoint-card" key={idx}>
   <b>{idx+1}) {cp.question}</b>
   {cp.hint&&<small style={{color:'#728572'}}>İpucu: {cp.hint}</small>}
   <details><summary>Doğru cevabı &amp; açıklamayı gör</summary><p style={{margin:'8px 0 0',fontSize:13,lineHeight:1.65,color:'#365233'}}>{cp.answer}</p></details>
  </div>)}
 </>}

 {unitLesson.everyCornerDetails&&unitLesson.everyCornerDetails.length>0&&<>
  <div className="eyebrow muted" style={{marginTop:6}}>YA ÇIKARSA? KİTABIN HİÇBİR BÖLÜMÜNÜ ATLAMAYAN %100 AYRINTI LİSTESİ</div>
  <div className="every-corner-grid">
   {unitLesson.everyCornerDetails.map((ec,idx)=><div className="every-corner-card" key={idx}>
    <b>🔎 {ec.heading}{ec.pages?.length?` (s.${ec.pages.join(',')})`:''}</b>
    <p>{ec.keyFact}</p>
    <small>{ec.whyItCouldBeAsked}</small>
   </div>)}
  </div>
 </>}
</div>}<div className="expanded-notes"><div className="eyebrow muted">GENİŞLETİLMİŞ ÇALIŞMA NOTLARI</div><p className="disclaimer">Bu notlar bağımsız bir uzman tarafından doğrulanmadı ve kitabın bütün ayrıntılarını kapsadığı garanti edilmez. Eksikleri kontrol etmek için aşağıdaki kaynak kitabı kullan.</p>{expanded[selected.bi][selected.ui].map((text,i)=><div className="expanded-item" key={i}><b>{String(i+1).padStart(2,'0')}</b><p>{text}</p></div>)}</div>{unitTvgfbfIntel&&<div className="tvgfbf-unit-intel"><div className="eyebrow muted">TVGFBF SINAV RADARI &amp; KİTAP İÇİ &quot;NELER ÖĞRENDİK?&quot; ({unitTvgfbfIntel.bookQuestionsCount} GERÇEK SORU)</div>{unitTvgfbfIntel.highFrequencyTopics?.length>0&&<div className="tvgfbf-topic-chips">{unitTvgfbfIntel.highFrequencyTopics.slice(0,5).map((tp,i)=><span key={i}>🎯 {tp}</span>)}</div>}{unitTvgfbfIntel.forumTraps?.length>0&&<div className="tvgfbf-trap-list"><b>⚠️ Sınavda En Sık Düşülen Tuzaklar:</b> {unitTvgfbfIntel.forumTraps.join(' · ')}</div>}{unitTvgfbfIntel.bookQuestions?.length>0&&<div className="book-mini-quiz"><b>📚 Bu Ünitenin Kitap İçi Örnek Değerlendirme Soruları (Sınav Kalıbı):</b>{unitTvgfbfIntel.bookQuestions.slice(0,3).map((bq,idx)=><details key={bq.id||idx}><summary>{idx+1}. {bq.question} {bq.testPage?`(s.${bq.testPage})`:''}</summary><p><b>Doğru Yanıt:</b> {bq.answer}</p></details>)}</div>}</div>}<div className="book-source"><div className="eyebrow muted">KİTABIN BU BÖLÜMÜNDE</div><p>Kaynağındaki anahtar sözcükler; bazıları yukarıdaki kısa özette henüz ayrıntılı açıklanmamış olabilir.</p><div className="keywords">{bookIndex[selected.bi].units[selected.ui].keywords.map(k=><span key={k}>{k}</span>)}</div><p><b>Kitabın kendi bölüm özeti:</b> PDF sayfa {bookIndex[selected.bi].units[selected.ui].summaryPages.join(', ')} <button type="button" className="text-link" onClick={()=>setInlinePdfUrl(`${bookIndex[selected.bi].file}#page=${bookIndex[selected.bi].units[selected.ui].summaryPages[0]}`)}>Sayfa içinde özeti aç ↓</button></p><p><b>Kitaptaki sorular:</b> <button type="button" className="text-link" onClick={()=>setInlinePdfUrl(`${bookIndex[selected.bi].file}#page=${bookIndex[selected.bi].units[selected.ui].testPage}`)}>Sayfa içinde soruları aç ↓</button>{bookIndex[selected.bi].units[selected.ui].answerPage&&<> · <button type="button" className="text-link" onClick={()=>setInlinePdfUrl(`${bookIndex[selected.bi].file}#page=${bookIndex[selected.bi].units[selected.ui].answerPage}`)}>Yanıt anahtarını aç ↓</button></>}</p><details open={Boolean(inlinePdfUrl)}><summary>Kitabın ilgili bölümünü aynı pencerede oku · PDF sayfa {bookIndex[selected.bi].units[selected.ui].page}</summary><p>Ayrı sekme açılmaz — tüm kitap sayfaları doğrudan bu tek localhost önizlemesi içinde açılır.</p>{inlinePdfUrl&&<div style={{marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}><small>Açık sayfa: {inlinePdfUrl}</small><button type="button" className="outline" onClick={()=>setInlinePdfUrl('')}>Varsayılan Bölüme Dön</button></div>}<iframe title={`${current.title} kitap bölümü`} src={inlinePdfUrl || `${bookIndex[selected.bi].file}#page=${bookIndex[selected.bi].units[selected.ui].page}`}/></details></div></>}<div className="note"><Sparkles size={18}/><div><b>Kendine sor</b><p>Bu kavramı kendi cümlelerinle nasıl açıklarsın? Cevabını düşün, sonra önemli notu tekrar oku.</p></div></div></div>}<div className="lesson-actions"><button className="primary" onClick={()=>markRead(currentId)}>{progress.read.includes(currentId)?<><Check size={17}/> Ünite tamamlandı</>:<>Okudum, tamamla <Check size={17}/></>}</button><button className="outline" onClick={()=>setMode(mode==='3D Video Ders'?'Konu anlatımı':'3D Video Ders')}><Film size={16}/> {mode==='3D Video Ders'?'Yazılı Rehbere Dön':'3D Diyaloglu Video İzle'}</button><button className="outline" onClick={()=>startQuiz(undefined,currentId)}>Ünite testine geç <ArrowUpRight size={16}/></button><button className="outline" onClick={()=>startQuiz(undefined,currentId,false,false,false,false,true)}>Kitap Sorularını Çöz <BookOpen size={15}/></button>{(progress.read.includes(currentId)||progress.results[currentId])&&<button className="outline" onClick={()=>resetUnit(currentId)}><RotateCcw size={16}/> Üniteyi sıfırla, en baştan başla</button>}</div><p className="disclaimer">Anlatımı istediğin zaman tekrar okuyabilirsin; "Üniteyi sıfırla" yalnızca tamamlandı işaretini ve test istatistiklerini silip seni en başa döndürür. Testler yalnızca tamamlandı olarak işaretlediğin ünitelerden oluşturulur.</p></div><div className="lesson-sidebar"><div className="eyebrow muted">BU KİTAPTA</div><h3>{books[selected.bi].short}</h3>{books[selected.bi].units.map((u,ui)=><button className={`lesson-unit ${selected.ui===ui?'on':''}`} key={u.title} onClick={()=>openUnit(selected.bi,ui)}><span>{String(ui+1).padStart(2,'0')}</span>{u.title}{progress.read.includes(`${selected.bi}-${ui}`)&&<Check size={15}/>}</button>)}</div></div></>}
 {page==='Test merkezi'&&<><div className="page-title"><div className="eyebrow muted">BİLGİNİ PEKİŞTİR</div><h1>Test merkezi<span className="accent">.</span></h1><p>5 kitaptan 20'şer toplam 100 soruluk gerçek sınav provası yap; {bookOfficialQs.length || 290} resmî kitap içi ("neler öğrendik?"), {bookParallelQs.length || 260} kitap paraleli ve TVGFBF çıkmış sınav stili sorularla barajları garantile.</p></div><div className="notice"><AlertCircle size={20}/><span>Sorular yalnızca tamamladığın ünitelerden gelir (<b>5×20 = 100 Tam Sınav</b> ve <b>Kitap İçi 'Neler Öğrendik?' Sınavı</b> ise ilk günden tüm 5 kitaba açıktır!). Yanlış yaptığın üniteler, art arda {MASTERY_STREAK} doğruya ulaşana kadar karma testte daha sık çıkar. Şu anda {studied.length} ünite açık; havuzda toplam {all.length + extra.flat(2).length + scenarios.flat(2).length + practice.flat(2).length + reinforcement.flat().length + Object.values(unique).reduce((n,v)=>n+v.questions.length,0) + Object.values(advanced).reduce((n,v)=>n+v.questions.length,0) + Object.values(newQuestions).reduce((n,v)=>n+v.questions.length,0) + Object.values(challenge).reduce((n,v)=>n+v.length,0) + Object.values(bookQuestions).reduce((n,v)=>n+v.length,0) + bookOfficialQs.length + bookParallelQs.length + generated.filter(q=>q.status==='approved').length} onaylı soru ({bookOfficialQs.length} resmî kitap sonu testi + {bookParallelQs.length} kitap paraleli dahil) ve {calculated.length} sayısal VKİ alıştırması var.</span></div><div className="source-filter-bar"><label className="switch-row"><input type="checkbox" checked={onlyInSource} onChange={toggleOnlyInSource}/><span><b>Konu anlatım özetlerimde olmayan soru çıkmasın</b> — açıkken, konu anlatımı özetlerinde ve kitap pasajlarında karşılığı bulunmayan {outOfSourceCount} soru testlere hiç girmez. Kapatırsan bu sorular da karşına çıkabilir.</span></label><span className="sfb-note">Kaynak kapsaması: konu anlatımı özeti + kitabın o ünitesindeki gerçek pasajlar.</span></div>{rereadUnits.length>0&&<div className="remediation-banner"><strong><AlertCircle size={17}/> Dikkat — Bu Konularda Çok Yanlış Yaptın (Önce Tekrar Oku!):</strong><p>Hataların biriktiği konularda önce konuyu biraz daha okuyup 3D diyaloglu videosunu izle; aklında kalmıyorsa tek tıkla kodlamaları ve anlatımı tamamen değiştir.</p><div className="remediation-actions">{rereadUnits.slice(0,4).map(uid=>{const [biS,uiS]=uid.split('-').map(Number);const uObj=books[biS]?.units?.[uiS];if(!uObj)return null;return <button key={uid} className="outline" onClick={()=>openUnit(biS,uiS)}>{uObj.title} — Konuyu Tekrar Oku</button>})}</div></div>}
 {mistakes.length>0&&<div className="mistake-journal-bar">
  <div>
   <strong>📓 Kişisel Hata Defterim ({activeMistakes.length} telafi bekleyen · {mistakes.filter(m=>m.mastered).length} ustalaşılan)</strong>
   <span className="mj-hint">Yanlış yaptığın sorular bir daha <b>birebir</b> sorulmaz: soru kökü değiştirilip şıkları karıştırılarak sonraki karma testlere rastgele serpiştirilir; varyantı doğru yapınca orijinal hata kaydın ustalaşmış sayılır.</span>
   <p>Yanlış çözdüğün sorular burada saklanır; doğru çözdüğünde otomatik ustalaşmış sayılır.</p>
  </div>
  <div className="mj-actions">
   {activeMistakes.length>0&&<button className="primary" onClick={startMistakeQuiz}><RotateCcw size={15}/> Yanlışlarımı Tekrar Çöz ({activeMistakes.length})</button>}
   <button className="outline" onClick={()=>setShowMistakes(v=>!v)}>{showMistakes?'Defteri Gizle':'Hataları İncele'}</button>
  </div>
  {showMistakes&&<div className="mj-list">
   {mistakes.slice(-12).reverse().map(m=><div className={`mj-item ${m.mastered?'done':''}`} key={m.key}>
    <div className="mj-item-top">
     <span className={`er-pill ${m.mastered?'guvenli':'yuksek_risk'}`}>{m.mastered?'✓ Düzeltildi':`${m.wrongCount}× Yanlış`}</span>
     <b>{m.unitTitle}</b>
     <button type="button" className="text-link" onClick={()=>openUnit(m.bi,m.ui)}>Konuya Git ↗</button>
    </div>
    <p className="mj-q">{m.question}</p>
    <small>Senin seçtiğin: <s>{m.chosenWrong}</s> · <b>Doğrusu:</b> {m.answer}</small>
   </div>)}
  </div>}
 </div>}
 <div className="tier-arena-bar">
  <div className="tier-arena-head">
   <div>
    <strong>🧠 100 Yapay Zekâ Konseyi Zorluk &amp; İstatistiksel Elenme Filtresi</strong>
    <p>100 farklı AI ajanı tüm soruları çözerek zorluğa göre etiketledi ve tahmini sınav eleme oranını çıkardı.</p>
   </div>
   <div className="tier-chips">
    {([
     ['all','Tümü','🎯',Object.values(tierCounts).reduce((a,b)=>a+b,0)],
     ['kolay','Kolay','🟢',tierCounts.kolay],
     ['orta','Orta','🟡',tierCounts.orta],
     ['zor','Zor','🔴',tierCounts.zor],
     ['imkansiz','İmkânsız','💀',tierCounts.imkansiz]
    ] as const).map(([key,label,icon,cnt])=><button type="button" key={key} className={`tier-chip ${selectedTier===key?'active':''} tier-${key}`} onClick={()=>setSelectedTier(key)}><span>{icon} {label}</span>{cnt>0&&<small>{cnt}</small>}</button>)}
   </div>
  </div>
 </div>
 <div className="test-grid"><div className="test-card featured"><span className="book-icon green"><ClipboardList size={21}/></span><h2>5 × 20 = 100 Soru Tam Sınav</h2><p>Gerçek TVGFBF/AÖF sınav simülasyonu: 100 dakika geri sayım, her kitaptan 20 soru (toplam 100) ve canlı 12/20 baraj takibi.</p><button className="dark-button" onClick={()=>startQuiz(undefined,undefined,false,true)}>100 Soruluk Denemeyi Başlat <ArrowUpRight size={16}/></button></div><div className="test-card featured"><span className="book-icon peach"><Award size={21}/></span><h2>💀 İmkânsız &amp; Eleyici Meydan Okuma</h2><p>100 AI konseyinin yalnız %5–25’inin çözebildiği, en yüksek elenme yüzdeli çeldirici tuzaklı süper zor sorular.</p><button className="dark-button" onClick={()=>startQuiz(undefined,undefined,false,false,false,false,false,'imkansiz')}>İmkânsız Teste Başla <ArrowUpRight size={16}/></button></div><div className="test-card featured"><span className="book-icon yellow"><BookOpen size={21}/></span><h2>Kitaptan "Neler Öğrendik?" + TVGFBF</h2><p>5 resmî ders kitabındaki {bookOfficialQs.length || 268} gerçek bölüm sonu sorusu ve TVGFBF sınav kalıbına uyumlu seçkin sorular.</p><button className="dark-button" onClick={()=>startQuiz(undefined,undefined,false,false,false,false,true)}>Kitap Stili Teste Başla <ArrowUpRight size={16}/></button></div><div className="test-card featured"><span className="book-icon purple"><RefreshCw size={21}/></span><h2>Kitap Paraleli (Aynı Soru, Farklı Lafız)</h2><p>{bookParallelQs.length || 260} paralel soru: kitabın kendi sorusuyla AYNI bilgiyi ölçer ama kökü yeniden yazılmıştır; ezberi değil gerçek öğrenmeyi sınar.</p><button className="dark-button" onClick={()=>startQuiz(undefined,undefined,false,false,false,false,true)}>Paralelleri Çöz <ArrowUpRight size={16}/></button></div><div className="test-card featured"><span className="book-icon purple"><Sparkles size={21}/></span><h2>"Ya Çıkarsa?" Kör Nokta Testi</h2><p>Yapay zekânın tahmin etmediği alt başlıklar ve her kitabın dipnot/satır arası pasajlarından üretilen sürpriz detaylar.</p><button className="dark-button" onClick={()=>startQuiz(undefined,undefined,false,false,false,true)}>Kör Noktaları Tara <ArrowUpRight size={16}/></button></div><div className="test-card featured"><span className="book-icon peach"><RotateCcw size={21}/></span><h2>Eksik konularım</h2><p>Daha önce yanlış yaptığın, henüz ustalaşmadığın tamamlanmış ünitelerden tekrar soruları çöz.</p><button className="dark-button" onClick={()=>startQuiz(undefined,undefined,false,false,true)}>Tekrar testine geç <ArrowUpRight size={16}/></button></div><div className="test-card featured"><span className="book-icon yellow"><Target size={21}/></span><h2>Zorlayıcı karma deneme</h2><p>Okuduğun ünitelerden karşılaştırma ve uygulama soruları. Seçili seviye filtresi uygulanır.</p><button className="dark-button" onClick={()=>startQuiz(undefined,undefined,true)}>Zor denemeye başla <ArrowUpRight size={16}/></button></div><div className="test-card featured"><span className="book-icon green"><Sparkles size={21}/></span><h2>Akıllı karma test</h2><p>Seçili zorluk filtresi ({selectedTier==='all'?'Tümü':selectedTier.toLocaleUpperCase('tr-TR')}) ile kişisel tekrar.</p><button className="dark-button" onClick={()=>startQuiz()}>Teste başla <ArrowUpRight size={16}/></button></div>{books.map((b,bi)=><div className="test-card" key={b.title}><span className="book-icon" style={{background:b.color}}><ClipboardList size={21}/></span><h3>{b.short}</h3><p>{b.units.filter((_,ui)=>progress.read.includes(`${bi}-${ui}`)).length} ünite test için açık</p><button className="outline" onClick={()=>startQuiz(bi)}>Bölüm testine başla <ArrowUpRight size={15}/></button></div>)}</div></>}
 {page==='Test'&&<div className="quiz-wrap"><button className="back" onClick={()=>{setIsFullExam(false);nav('Test merkezi')}}><ArrowLeft size={16}/> Test merkezine dön</button>{quiz.length===0?<div className="empty"><BookOpen size={34}/><h2>Önce biraz öğrenelim.</h2><p>Bu testte henüz tamamlanmış ünite veya seçilen modda onaylı soru yok. Derslerden bir üniteyi oku veya Soru stüdyosunun soru üretmesini bekle.</p><button className="primary" onClick={()=>nav('Derslerim')}>Derslere git <ArrowUpRight size={16}/></button></div>:qi>=quiz.length?<div className="empty"><Sparkles size={34}/><h2>{score===quiz.length?'100/100 FULL DOĞRU! Kusursuz!':'Güzel iş çıkardın! Hedefimiz 100/100!'}</h2><p>{quiz.length} sorudan {score} doğru (%{Math.round((score/Math.max(1,quiz.length))*100)}) yaptın. Toplam çalışma süren: {totalStudyMin} dk.</p>{Object.keys(quizBookScores).length>1&&<div className="exam-breakdown">{books.map((b,bi)=>{const bs=quizBookScores[bi];if(!bs)return null;const barajPass=bs.right>=Math.ceil(bs.total*0.6);return <div className="exam-mod-box" key={b.title}><span>{b.short}</span><b>{bs.right}/{bs.total}</b><small>{barajPass?'✓ 12/20 Baraj Üstü':'⚠️ Baraj Altı · Tekrar Gerekir'}</small>{!barajPass&&<button type="button" className="text-link" style={{marginTop:4}} onClick={()=>startQuiz(bi,undefined,false,false,false,false,true)}>20 Soru Telafi Çöz ↗</button>}</div>})}</div>}<button className="primary" onClick={()=>{setIsFullExam(false);nav('Test merkezi')}}>Test merkezine dön <ArrowUpRight size={16}/></button></div>:<><div className="eyebrow muted">{books[quiz[qi].bi].short.toLocaleUpperCase('tr-TR')} · ÜNİTE {quiz[qi].ui+1}</div><h1>Birlikte deneyelim<span className="accent">.</span></h1><div className="quiz-progress"><span>SORU {qi+1} / {quiz.length}</span>{isFullExam&&<span className={`quiz-timer-pill ${examRemainingSec<600?'exam-timer-urgent':''}`}><Clock size={12}/> Sınav Süresi: {String(Math.floor(examRemainingSec/60)).padStart(2,'0')}:{String(examRemainingSec%60).padStart(2,'0')}</span>}<span className="quiz-timer-pill"><Clock size={12}/> {qElapsedSec} sn · Hedef ~60 sn</span><button type="button" className={`quiz-flag-btn ${quizFlags[qi]?'flagged':''}`} onClick={()=>toggleQuizFlag(qi)}><Flag size={12}/> {quizFlags[qi]?'İşaretli (İncele)':'Bayrakla'}</button><span>{score} doğru · {Object.values(quizFlags).filter(Boolean).length} işaretli</span></div>
 {isFullExam&&<div className="tvgfbf-baraj-strip" aria-label="Canlı 5 Modül 12/20 Baraj Durumu">
  {books.map((b,bi)=>{
   const bs=quizBookScores[bi]||{right:0,total:0};
   const pass=bs.right>=12;
   const finished=bs.total>=20;
   const cls=`tvgfbf-baraj-chip ${pass?'pass':finished?'risk':'pending'}`;
   return <div className={cls} key={b.title}><span>{b.short}</span><b>{bs.right}/20</b>{pass&&<i>✓ Baraj</i>}</div>;
  })}
 </div>}
 <div className="quiz-nav-strip" aria-label="Soru gezgini">
  {quiz.map((_,idx)=>{
   const qa=quizAnswers[idx];
   const cls=`qn-pill ${idx===qi?'cur':''} ${qa?(qa.correct?'ok':'bad'):''} ${quizFlags[idx]?'flg':''}`;
   return <button type="button" className={cls} key={idx} onClick={()=>jumpToQuestion(idx)}>{idx+1}</button>;
  })}
 </div>
 <div className="progress"><div style={{width:`${(Object.keys(quizAnswers).length/Math.max(1,quiz.length))*100}%`,background:'#a7c66e'}}/></div>
 {(()=>{const meta=getQuestionMeta(quiz[qi]);const curElim=eliminatedOpts[qi]||[];const isHint=Boolean(hintRevealed[qi]);return <div className="question-card">
  <div className="quiz-gamify-hud">
   <span className={`diff-tier-badge tier-${meta.aiDifficultyTier}`}>{meta.aiDifficultyTier==='imkansiz'?'💀':meta.aiDifficultyTier==='zor'?'🔴':meta.aiDifficultyTier==='orta'?'🟡':'🟢'} {meta.aiDifficultyLabel}</span>
   <span className="elim-stat-pill">📊 Tahmini Eleyici: <b>%{meta.predictedEliminationPct}</b> · 100 AI’dan <b>{meta.solvedBy100AiPct}</b>’i çözdü</span>
   <span className="xp-combo-pill">⚡ <b>{xpEarned} XP</b>{combo>=2?` · 🔥 x${combo} Seri`:''}</span>
  </div>
  <div className="eyebrow muted">KONU: {quiz[qi].u.topic || quiz[qi].u.title} · {quiz[qi].u.source || 'ÖZGÜN ÇALIŞMA SORUSU'}</div>
  {quiz[qi].u.paragraph && <blockquote className="quiz-paragraph">{quiz[qi].u.paragraph}</blockquote>}
  <h2>{quiz[qi].u.question}</h2>
  {!choice&&<div className="joker-bar">
   <button type="button" className="joker-btn" onClick={triggerFiftyFifty} disabled={curElim.length>0}>✂️ %50 İki Şık Ele</button>
   <button type="button" className="joker-btn" onClick={triggerHint} disabled={isHint}>📖 Kitap İpucu Aç</button>
  </div>}
  {isHint&&!choice&&<div className="quiz-hint-box">💡 <b>İpucu:</b> {quiz[qi].u.key.slice(0,110)}...</div>}
  <div className="answers">{options(quiz[qi].u).map((a,i)=>{const isElim=curElim.includes(a);return <button key={a} disabled={isElim} onClick={()=>answer(a)} className={isElim?'eliminated':choice?(a===quiz[qi].u.answer?'correct':a===choice?'incorrect':''):''}><span>{'ABCD'[i]}</span>{a}</button>;})}</div>
  {choice&&<div className={choice===quiz[qi].u.answer?'feedback good':'feedback bad'}><b>{choice===quiz[qi].u.answer?`Doğru cevap! ${lastXpGain>0?`(+${lastXpGain} XP)`:''}`:'Birlikte tekrar edelim.'}</b><p>{quiz[qi].u.key}</p><button onClick={()=>openUnit(quiz[qi].bi,quiz[qi].ui)}>Konuya dön <ArrowUpRight size={14}/></button></div>}
  {choice&&<div className="ai-council-verdict">
   <div className="acv-head"><b>🤖 100 Yapay Zekâ Konseyi Analizi</b><span>%{(100-meta.solvedBy100AiPct)} Aday Elenmesi · {meta.aiDifficultyLabel}</span></div>
   <div className="acv-quotes">{meta.aiDifficultyComments.slice(0,2).map((c,idx)=><p key={idx}>{c}</p>)}</div>
   {meta.misconceptionTraps?.length>0&&<div className="acv-traps"><b>⚠️ Çeldirici Mühendisliği (Yanlış Şık Tuzakları):</b> {meta.misconceptionTraps.slice(0,2).join(' · ')}</div>}
  </div>}
  {choice&&kayseriReaction&&<div className={`kayseri-reaction-box ${kayseriReaction.isCorrect?'good':'bad'}`}>
 <div className="kr-head">
  <span className="kr-badge">{kayseriReaction.speakerLabel}</span>
  <div className="kr-tools">
   <button type="button" className="kr-toggle" onClick={()=>{const next=kayseriMode==='kayseri_sert'?'temiz_klasik':'kayseri_sert';setKayseriMode(next);fetchKayseriReaction(quiz[qi],choice,choice===quiz[qi].u.answer,next);}}>
    {kayseriMode==='kayseri_sert'?'🌶️ Kayserili Sert-Komedi (Klasik Yap)':'🎓 Klasik Mod (Kayserili Yap)'}
   </button>
   <button type="button" className="kr-toggle" onClick={()=>speak(`${kayseriReaction.headline}. ${kayseriReaction.roastOrPraise}. ${kayseriReaction.examFact}`,kayseriMode==='kayseri_sert'?'kayseri':'coach')}>
    <Volume2 size={13}/> Sesli Oku
   </button>
  </div>
 </div>
 <h4>{kayseriReaction.headline}</h4>
 <p className="kr-roast">{kayseriReaction.roastOrPraise}</p>
 <p className="kr-fact">🎯 <b>Net Bilgi:</b> {kayseriReaction.examFact}</p>
 {kayseriReaction.mustKnowTerm&&<div className="kr-term">📌 <b>Önemli Terim:</b> {kayseriReaction.mustKnowTerm}</div>}
</div>}{choice&&choice!==quiz[qi].u.answer&&(progress.results[quiz[qi].id]?.wrong||0)>=2&&<div className="remediation-banner"><strong><AlertCircle size={16}/> Bu konuda çok yanlış yaptın — bu konuyu biraz daha oku!</strong><p>"{quiz[qi].u.title}" ünitesinde hatalar birikiyor. Şimdi konuyu baştan biraz daha okuyup 3D diyaloglu videosunu izle; eğer hâlâ aklında kalmıyorsa kodlamaları ve hikâyeyi tamamen değiştirelim.</p><div className="remediation-actions"><button className="primary" onClick={()=>openUnit(quiz[qi].bi,quiz[qi].ui)}>Konuyu Biraz Daha Oku</button><button className="outline" onClick={()=>openUnit(quiz[qi].bi,quiz[qi].ui,'3D Video Ders')}><Film size={14}/> 3D Videoyu İzle</button><button className="outline" onClick={()=>reframeLesson(quiz[qi].id,true)} disabled={reframingLesson}><Wand2 size={14}/> {reframingLesson?'Değiştiriliyor...':'Kodlamaları & Anlatımı Değiştir'}</button></div></div>}</div>;})()}{choice&&<button className="primary next" onClick={()=>{if(qi>=quiz.length-1){setQi(quiz.length);setChoice(null);setKayseriReaction(null);}else jumpToQuestion(qi+1);}}>{qi===quiz.length-1?'Sonucu gör':'Sonraki soru'} <ChevronRight size={16}/></button>}</>}</div>}
 {page==='Sesli çalışma'&&<VoiceStudio/>}
 {page==='Çalışma planım'&&<><div className="page-title"><div className="eyebrow muted">20 ARALIK'A DOĞRU</div><h1>Bir plan, büyük hedef<span className="accent">.</span></h1><p>Küçük tekrarlar büyük fark yaratır. Planını kendi hızına göre uyarla.</p></div><div className="plan-grid">{[['01','Öğren','Her gün bir ünite oku. Önemli notu kendi cümlelerinle anlat.'],['02','Uygula','Üniteyi tamamla ve testini çöz. Yanlışlarını öğrenme fırsatı olarak gör.'],['03','Tekrar et','Ertesi gün ve birkaç gün sonra konuya geri dön; karma testle kendini yokla.'],['04','Birleştir','Sınava yaklaşırken kitap testleri ve karma tekrarlarla bağlantıları güçlendir.']].map(([n,t,d])=><div className="plan-card" key={n}><span>{n}</span><h2>{t}</h2><p>{d}</p></div>)}</div><div className="notice"><CalendarDays size={20}/><span>Sınav tarihi 20 Aralık 2026 olarak ayarlandı; resmî takvimi doğrulamayı unutma. Plan öneridir, otomatik bildirim göndermez.</span></div>
 <div className="section-head"><div><div className="eyebrow muted">İNTERNETTEKİ GENEL BİLGİLERE GÖRE</div><h2>Bu sınava nasıl çalışılır?</h2><p>Antrenörlük Temel Eğitimi sınavı hakkında genel olarak paylaşılan bilgiler; resmî ve güncel kuralları her zaman Gençlik ve Spor Bakanlığı/Anadolu Üniversitesi kaynaklarından doğrula.</p></div></div>
 <div className="plan-grid">
 <div className="plan-card"><span>Sınav yapısı</span><h2>5 kitap, 20+20+20+20+20 soru</h2><p>Sınav genel olarak 5 ayrı dersten (bu uygulamadaki 5 kitap) oluşur; her dersten 20 soru, toplamda 100 soru vardır. Önemli nokta: her ders <b>ayrı ayrı</b> değerlendirilir. Dört dersten tam puan alıp beşinci dersten barajın altında kalmak, o dersten bütünlemeye kalmak anlamına gelebilir.</p></div>
 <div className="plan-card"><span>Geçme barajı</span><h2>Her dersten en az 12/20 (60 puan)</h2><p>Genel bilgilere göre yanlış cevap doğruyu götürmez; yani bilmediğin bir soruyu da boş bırakmak yerine işaretlemek mantıklı olabilir. Güvenli bir pay bırakmak için 12 barajını değil, her kitapta <b>15-16 doğruyu</b> hedeflemen önerilir.</p></div>
 <div className="plan-card"><span>En önce zayıf olduğun kitap</span><h2>Önce teşhis, sonra öncelik</h2><p>Beş kitap eşit ağırlıklıdır; hiçbiri "daha az önemli" değildir. <b>Test merkezi → Beş kitap karma deneme</b> ile erken bir deneme çöz, en düşük çıktığın kitabı bul ve ona ekstra zaman ayır. Güçlü olduğun kitapları da <b>Tekrar yolu</b> ile kısa aralıklarla tazele; aksi hâlde onlar da unutulabilir.</p></div>
 <div className="plan-card"><span>Hangi kitaplar daha "teknik"</span><h2>Terim yoğun konulara kart gibi çalış</h2><p>Genel gözlemlere göre <b>Hareket ve Antrenman Bilimleri</b> ile <b>Spor ve Sağlık Bilimleri</b> (anatomi, fizyoloji, enerji sistemleri gibi terimler) çoğu kişiye daha teknik gelir; bu konularda kelimeyi/kavramı küçük kartlar gibi tekrar tekrar çalışmak işe yarayabilir. <b>Spor Yönetimi</b> ve <b>Sporda Psikososyal Alanlar</b> genelde kavramsal olduğu için çoğu kişiye nispeten daha kolay gelir, ama yine de hafife alma.</p></div>
 <div className="plan-card"><span>Konuyu başkasına anlat</span><h2>Sesli, kendi cümlelerinle</h2><p>Bir konuyu notlara bakmadan kendi cümlelerinle anlatmaya çalışmak (bu uygulamadaki <b>Tekrar yolu</b> ve "Kendine sor" kutuları tam olarak bunu yaptırır), okumaktan daha kalıcı öğrenme sağlayabilir. Mümkünse bir arkadaşına sesli anlatmayı dene.</p></div>
 <div className="plan-card"><span>Son haftalarda süreyle çalış</span><h2>Soru başına ~1 dakika</h2><p>Sınav genel olarak 100 soruya ~100 dakika verir, yani soru başına yaklaşık 1 dakika. Sınava yaklaşırken <b>Test merkezi</b>'ndeki 20 soruluk kitap testlerini süre tutarak çözüp bu temponun kendiliğinden oluşmasını sağla; son dakikada yeni konuya başlamak yerine yanlış yaptığın yerleri tekrarla.</p></div>
 </div>
 <div className="notice warning"><AlertCircle size={20}/><span>Bu bölümdeki rakamlar (20 soru/ders, 100 soru, 12 doğru/60 puan barajı, yanlışın doğruyu götürmediği, ~100 dakikalık süre) internet üzerinde genel olarak paylaşılan bilgilere dayanır; kademeye, yıla ve kuruma göre değişebilir. Sınava kaydolurken ve sınavdan önce mutlaka resmî duyuruyu (Gençlik ve Spor Bakanlığı Spor Bilgi Sistemi / Anadolu Üniversitesi) kontrol et. Bu metin resmî bir kaynak değildir.</span></div>
 </>}
 <div hidden={page!=='Soru stüdyosu'}><OllamaStudio read={progress.read} onChange={setGenerated}/></div>
 {page==='Ayarlar'&&<><div className="page-title"><div className="eyebrow muted">ÇALIŞMA ALANIN</div><h1>Ayarlar<span className="accent">.</span></h1><p>İlerlemen bu tarayıcıda saklanır.</p></div><div className="settings-card"><h2>İlerlemeyi sıfırla</h2><p>Tamamlanan üniteler, test sonuçları, hata defteri ve tekrar planı bu tarayıcıdan silinir. Bu işlem geri alınamaz.</p><button className="outline" onClick={()=>{if(confirm('Tüm ilerlemeni, hata defterini ve tekrar planını sıfırlamak istiyor musun?')){save(initial);saveReviews({});saveMistakes([])}}}><RotateCcw size={16}/> İlerlemeyi sıfırla</button></div></>}
 <footer><span>✳ tempo. <i>Öğrenmenin kendi ritmi var.</i></span><span>Senin için, hedeflerine doğru. ♡</span></footer></div></main></div>
}

createRoot(document.getElementById('root')!).render(<App/>);
