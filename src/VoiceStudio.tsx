import {useEffect,useRef,useState} from 'react';
import {Play,Pause,Square, Volume2} from 'lucide-react';
import {books} from './data';
import {deepDive} from './extra';
import {unique} from './unique';
import {advanced} from './advanced';
import {newQuestions} from './newQuestions';
import {bookNotes} from './bookNotes';
import {expanded} from './expanded';

// Breaking narration into short utterances avoids browser engines cutting off long text.
export function speechChunks(text:string):string[] {
  const words=text.trim().split(/\s+/); const chunks:string[]=[]; let current='';
  for (const word of words) { if (current && current.length+word.length+1>220) {chunks.push(current);current='';} current+=(current?' ':'')+word; }
  if(current) chunks.push(current); return chunks;
}
export function VoiceStudio(){
 const [bi,setBi]=useState(0),[ui,setUi]=useState(0),[rate,setRate]=useState(0.9);
 const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[voiceURI,setVoiceURI]=useState('');
 const [status,setStatus]=useState<'idle'|'playing'|'paused'>('idle');
 const [error,setError]=useState(''); const [part,setPart]=useState(0),[total,setTotal]=useState(0);
 const generation=useRef(0);
 const supported=typeof window!=='undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
 useEffect(()=>{if(!supported)return; const update=()=>setVoices(window.speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('tr')));update();window.speechSynthesis.addEventListener('voiceschanged',update);return()=>{generation.current++;window.speechSynthesis.cancel();window.speechSynthesis.removeEventListener('voiceschanged',update)}},[supported]);
 const stop=()=>{generation.current++;if(supported)window.speechSynthesis.cancel();setStatus('idle');setPart(0)};
 const play=()=>{if(!supported){setError('Bu tarayıcı seslendirmeyi desteklemiyor.');return}stop();setError('');const id=`${bi}-${ui}`,u=books[bi].units[ui];
  const text=[u.title,u.lesson,deepDive[bi][ui],unique[id]?.lesson,advanced[id]?.lesson,newQuestions[id]?.lesson,bookNotes[id]?.text,...expanded[bi][ui],`Önemli not: ${u.key}`,`Örnek: ${u.example}`].filter(Boolean).join('. ');
  const chunks=speechChunks(text);setTotal(chunks.length);const token=++generation.current;setStatus('playing');
  const next=(index:number)=>{if(token!==generation.current)return;if(index>=chunks.length){setStatus('idle');setPart(0);return}setPart(index+1);const utter=new SpeechSynthesisUtterance(chunks[index]);utter.lang='tr-TR';utter.rate=rate;const voice=voices.find(v=>v.voiceURI===voiceURI);if(voice)utter.voice=voice;utter.onend=()=>next(index+1);utter.onerror=(event)=>{if(token!==generation.current)return;setStatus('idle');setError(`Seslendirme başlatılamadı (${event.error}). Başka bir ses veya tarayıcı dene.`)};window.speechSynthesis.speak(utter)};next(0);
 };
 return <div className="voice-studio"><div className="page-title"><div className="eyebrow muted">SESLİ ÇALIŞMA</div><h1>Voice Studio<span className="accent">.</span></h1><p>Bir ünite seç, kendi hızında dinle ve istediğin kadar tekrar et.</p></div>
 <div className="voice-card"><div className="voice-heading"><span className="voice-symbol"><Volume2 size={25}/></span><div><b>Senin sesli dersin</b><p>Ünite anlatımı, genişletilmiş notlar ve örnekler.</p></div></div>
 <div className="voice-fields"><label>Kitap<select value={bi} onChange={e=>{stop();setBi(Number(e.target.value));setUi(0)}}>{books.map((b,i)=><option value={i} key={b.title}>{b.title}</option>)}</select></label><label>Ünite<select value={ui} onChange={e=>{stop();setUi(Number(e.target.value))}}>{books[bi].units.map((u,i)=><option value={i} key={u.title}>{i+1}. {u.title}</option>)}</select></label><label>Türkçe ses<select value={voiceURI} onChange={e=>setVoiceURI(e.target.value)} disabled={status!=='idle'}><option value="">Tarayıcının varsayılan sesi</option>{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label><label>Hız: {rate.toFixed(1)}x<input type="range" min="0.6" max="1.3" step="0.1" value={rate} onChange={e=>setRate(Number(e.target.value))} disabled={status!=='idle'}/></label></div>
 <p className="voice-current">{books[bi].short} · {books[bi].units[ui].title}</p><div className="voice-controls">{status==='idle'?<button className="primary" onClick={play} disabled={!supported}><Play size={16}/> Dinlemeye başla</button>:<><button className="primary" onClick={()=>{if(status==='playing'){window.speechSynthesis.pause();setStatus('paused')}else{window.speechSynthesis.resume();setStatus('playing')}}}>{status==='playing'?<><Pause size={16}/> Duraklat</>:<><Play size={16}/> Devam et</>}</button><button className="outline" onClick={stop}><Square size={15}/> Durdur</button></>}</div><p className="voice-status" role="status">{status==='idle'?'Dinlemeye hazır':`${status==='playing'?'Seslendiriliyor':'Duraklatıldı'} · Bölüm ${part} / ${total}`}</p>{error&&<p className="voice-error" role="alert">{error}</p>}{!supported&&<p className="voice-error">Bu tarayıcı seslendirmeyi desteklemiyor.</p>}{supported&&!voices.length&&<p className="disclaimer">Türkçe ses listelenmedi. Windows ses ayarlarından bir Türkçe konuşma sesi kurabilir veya başka bir tarayıcı deneyebilirsin.</p>}</div><div className="notice"><Volume2 size={20}/><span>Voice Studio, Windows ve tarayıcında bulunan sesleri kullanır; ayrı bir yapay zekâ sesi kurmaz. Ses kalitesi cihazına bağlıdır. Başka sayfaya geçince ses durur.</span></div></div>
}
