import { readFile, mkdir, writeFile, rename, readdir, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const contexts = JSON.parse(await readFile(new URL('./contexts.json', import.meta.url), 'utf8'));
const questionBank = JSON.parse(await readFile(new URL('./question-bank.json', import.meta.url), 'utf8'));
const dataDir = resolve(process.env.TEMPO_DATA_DIR || '.tempo-data');
const dataFile = resolve(dataDir,'questions.json');
const settingsFile = resolve(dataDir,'settings.json');
const ledgerFile = resolve(dataDir,'ollama-created.json');
const storageLimit = 100_000_000_000;
const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/,'');
const defaultModel = process.env.OLLAMA_MODEL || 'qwen2.5:14b';
async function selectedModel(){try{const v=JSON.parse(await readFile(settingsFile,'utf8'));return typeof v.model==='string'&&v.model.length<=200?v.model:defaultModel}catch(e){if(e.code==='ENOENT')return defaultModel;throw e}}
let busy = false;
let phase = 'idle';
let cursor = 0;
let lastError = '';
let controller;
async function load(){try {const data=JSON.parse(await readFile(dataFile,'utf8'));return Array.isArray(data)?data:[]} catch(e){if(e.code==='ENOENT')return [];throw e}}
async function directoryBytes(path){
 let entries;try{entries=await readdir(path,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return 0;throw e}
 let bytes=0;for(const entry of entries){const full=resolve(path,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory())bytes+=await directoryBytes(full);else if(entry.isFile()){try{bytes+=(await lstat(full)).size}catch(e){if(e.code!=='ENOENT')throw e}}}return bytes;
}
async function storageUsage(){
 let ledger=[];try{ledger=JSON.parse(await readFile(ledgerFile,'utf8'));if(!Array.isArray(ledger))throw Error('Model kayıt defteri geçersiz.')}catch(e){if(e.code!=='ENOENT')throw e}
 let reserved=0;for(const row of ledger){if(!Number.isSafeInteger(row.bytes)||row.bytes<0)throw Error('Model kayıt defteri geçersiz.');reserved+=row.bytes}
 const generated=await directoryBytes(dataDir),books=await directoryBytes(resolve('public/books'));return {generated,books,modelsReserved:reserved,total:generated+books+reserved,limit:storageLimit};
}
async function save(items){const text=JSON.stringify(items,null,2),usage=await storageUsage();if(usage.total+Buffer.byteLength(text,'utf8')+1_000_000>storageLimit)throw Error('100 GB depolama sınırına yaklaşıldı; yeni soru kaydedilmedi.');await mkdir(dataDir,{recursive:true});const tmp=dataFile+'.tmp';await writeFile(tmp,text,'utf8');await rename(tmp,dataFile)}
const norm=s=>s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw new Error('İstek çok büyük.')}return JSON.parse(raw||'{}')}
function respond(res,code,obj){res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj))}
function safeOrigin(req){const origin=req.headers.origin;if(!origin)return false;try{return new URL(origin).host===req.headers.host}catch{return false}}
function audit(existing){
 const seen=new Set(); let duplicates=0, invalid=0; const answers=new Set();
 for(const q of [...questionBank,...existing]){if(!q||typeof q.question!=='string'||typeof q.answer!=='string'||!Array.isArray(q.options)||q.options.length!==4||!q.options.includes(q.answer)||q.options.some(x=>typeof x!=='string')||new Set((q.options||[]).map(norm)).size!==4){invalid++;continue}const key=norm(q.question);if(seen.has(key))duplicates++;seen.add(key);answers.add(`${q.unitId}:${norm(q.answer)}`)}
 return {checked:questionBank.length+existing.length,invalid,duplicates,answerGroups:answers.size};
}
function similarity(a,b){const aa=new Set(norm(a).split(' ').filter(w=>w.length>2));const bb=new Set(norm(b).split(' ').filter(w=>w.length>2));if(!aa.size||!bb.size)return 0;let n=0;for(const word of aa)if(bb.has(word))n++;return n/Math.max(aa.size,bb.size)}
function validate(o,ctx,existing,model){
 if(!o||typeof o!=='object')throw Error('Model geçerli bir nesne döndürmedi.');
 const {question,options,answer,explanation,evidence,topic}=o;
 if(![question,answer,explanation,evidence,topic].every(x=>typeof x==='string'&&x.trim().length>=4))throw Error('Soru alanları eksik.');
 if(question.length>700||explanation.length>1200||topic.length>120||evidence.length>500||!Array.isArray(options)||options.length!==4||options.some(x=>typeof x!=='string'||x.trim().length<2||x.length>300))throw Error('Soru alanları geçersiz.');
 if(new Set(options.map(norm)).size!==4||!options.includes(answer))throw Error('Seçenekler veya cevap geçersiz.');
 if(!norm(ctx.text).includes(norm(evidence))||norm(evidence).length<15)throw Error('Kaynak alıntısı ünite anlatımında bulunamadı.');
 if([...questionBank,...existing].some(x=>norm(x.question)===norm(question)))throw Error('Aynı soru zaten kayıtlı.');
 if([...questionBank,...existing].some(x=>x.unitId===ctx.id&&similarity(x.question,question)>=0.9))throw Error('Bu ünite için çok benzer bir soru bulundu.');
 return {id:randomUUID(),unitId:ctx.id,book:ctx.book,unit:ctx.unit,topic:topic.trim(),question:question.trim(),options:options.map(x=>x.trim()),answer:answer.trim(),explanation:explanation.trim(),evidence:evidence.trim(),status:'pending',model,createdAt:new Date().toISOString()};
}
export function ollamaPlugin(){return {name:'tempo-ollama',configureServer(server){server.middlewares.use('/api/ollama',async(req,res,next)=>{
 try{
  const path=(req.url||'').split('?')[0];
  const model=await selectedModel();const verifierModel=process.env.OLLAMA_VERIFIER_MODEL || model;
  if(req.method==='GET'&&path==='/status'){
   let models=[],connected=false;try{const r=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(2500)});if(r.ok){const d=await r.json();models=(d.models||[]).map(x=>x.name);connected=true}}catch{}
   const items=await load();const storage=await storageUsage();return respond(res,200,{connected,model,verifierModel,installed:models.includes(model),verifierInstalled:models.includes(verifierModel),models,busy,phase,lastError,storage,count:items.length,pending:items.filter(x=>x.status==='pending').length});
  }
  if(req.method==='GET'&&path==='/questions')return respond(res,200,{items:await load()});
  if(req.method==='GET'&&path==='/audit')return respond(res,200,audit(await load()));
  if(req.method!=='GET'&&!safeOrigin(req))return respond(res,403,{error:'Bu işlem yalnız aynı kaynaktan yapılabilir.'});
  if(req.method==='POST'&&path==='/select-model'){
   if(busy)return respond(res,409,{error:'Üretim sürerken model değiştirilemez.'});
   const input=await body(req);const chosen=input.model;const storage=await storageUsage();if(storage.total+1_000_000>storageLimit)return respond(res,400,{error:'100 GB sınırına yaklaşıldı; ayar kaydedilmedi.'});
   if(typeof chosen!=='string'||chosen.length>200||!chosen.trim())return respond(res,400,{error:'Geçersiz model adı.'});
   let tags;try{const r=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error('Ollama yanıt vermedi.');tags=await r.json()}catch{return respond(res,502,{error:'Ollama model listesi alınamadı.'})}
   if(!Array.isArray(tags.models)||!tags.models.some(x=>x.name===chosen))return respond(res,400,{error:'Model yerel Ollama listesinde bulunamadı.'});
   await mkdir(dataDir,{recursive:true});const tmp=settingsFile+'.tmp';await writeFile(tmp,JSON.stringify({model:chosen},null,2),'utf8');await rename(tmp,settingsFile);return respond(res,200,{model:chosen});
  }
  if(req.method==='POST'&&path==='/generate'){
   if(busy)return respond(res,409,{error:'Bir üretim zaten devam ediyor.'});
   const input=await body(req);const ids=Array.isArray(input.units)?input.units.filter(x=>typeof x==='string'):[];const candidates=contexts.filter(x=>ids.includes(x.id));
   if(!candidates.length)return respond(res,400,{error:'Önce en az bir üniteyi tamamla.'});
   const items=await load();const resultAudit=audit(items);if(resultAudit.invalid||resultAudit.duplicates)return respond(res,400,{error:'Havuz denetiminde biçim veya birebir tekrar hatası var; üretim durduruldu.'});if(items.length>=5000)return respond(res,400,{error:'Yerel havuz 5000 kayıt sınırına ulaştı.'});
   const ctx=candidates[cursor++%candidates.length];busy=true;phase='generating';lastError='';controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),360000);
   try{
    const prompt=`Sen Türkçe antrenörlük temel eğitim soru yazarı ve öğretmenisin. Yalnızca aşağıdaki konu anlatımındaki bilgilerle çözülebilen, zorlayıcı, tek doğru cevaplı dört seçenekli BİR özgün soru üret. Kaynakta bulunmayan bilgi isteme. Konunun dışına çıkma, sağlık tavsiyesi verme. Anlamsal olarak farklı bir soru sor. JSON döndür: question (soru), options (4 farklı metin), answer (options içindeki tam doğru metin), explanation (kısa gerekçe), evidence (aşağıdaki anlatımdan sorunun cevabını destekleyen aynen alınmış en az 15 karakterlik kısa bir cümle), topic (kısa konu adı). Kitap: ${ctx.book}. Ünite: ${ctx.unit}. BU ÜNİTEDE DAHA ÖNCE SORULMUŞ BAZI SORULAR (bunları tekrarlama): ${[...questionBank,...items].filter(x=>x.unitId===ctx.id).slice(-10).map(x=>x.question).join(' / ')}. KONU ANLATIMI: ${ctx.text}`;
    const runModel=async(which,input,temperature)=>{
     const r=await fetch(`${base}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:which,prompt:input,stream:false,format:'json',options:{temperature,num_predict:900}}),signal:controller.signal});
     if(!r.ok)throw Error(`Ollama (${which}) HTTP ${r.status}: ${(await r.text()).slice(0,250)}`);
     const result=await r.json();try{return JSON.parse(result.response)}catch{throw Error(`${which} geçerli JSON üretmedi.`)}
    };
    const parsed=await runModel(model,prompt,0.8);
    const record=validate(parsed,ctx,items,model);
    // The checker solves without seeing the proposed answer or explanation.
    phase='verifying';
    const checkPrompt=`Sen Türkçe antrenörlük temel eğitim alanında dikkatli bir soru denetçisisin. Aşağıdaki soruyu YALNIZ verilen anlatıma göre bağımsız çöz. Soru, anlatımda öğretilmeyen bilgiye ihtiyaç duyuyorsa, birden fazla seçenek doğruysa veya cevap açıkça çıkarılamıyorsa reddet. Dış bilgi kullanma. JSON döndür: answer (dört seçenekten tam doğru metin, çözemiyorsan boş), singleCorrect (boolean), supported (boolean), evidence (anlatımdan cevabı destekleyen 15 karakterden uzun aynen alınmış kısa metin), reason (kısa Türkçe gerekçe). KONU ANLATIMI: ${ctx.text}\nSORU: ${record.question}\nSEÇENEKLER: ${JSON.stringify(record.options)}`;
    const check=await runModel(verifierModel,checkPrompt,0);
    if(!check || check.singleCorrect!==true || check.supported!==true || typeof check.answer!=='string' || !record.options.includes(check.answer) || check.answer!==record.answer || typeof check.evidence!=='string' || norm(check.evidence).length<15 || !norm(ctx.text).includes(norm(check.evidence)) || typeof check.reason!=='string' || !check.reason.trim())throw Error('Bağımsız model kontrolü soruyu, tek doğru cevabı veya kaynak dayanağını doğrulayamadı; soru kaydedilmedi.');
    record.verification={model:verifierModel,answer:check.answer,evidence:check.evidence.trim().slice(0,500),reason:check.reason.trim().slice(0,1200)};
    phase='saving';const latest=await load();validate(parsed,ctx,latest,model);latest.push(record);await save(latest);return respond(res,200,{item:record});
   }catch(e){lastError=e.name==='AbortError'?'Üretim zaman aşımına uğradı veya durduruldu.':e.message;return respond(res,502,{error:lastError})}finally{clearTimeout(timeout);busy=false;phase='idle';controller=undefined}
  }
  if(req.method==='POST'&&path==='/stop'){if(controller)controller.abort();return respond(res,200,{ok:true})}
  if(req.method==='POST'&&path==='/review'){
   const {id,status}=await body(req);if(!['approved','rejected'].includes(status))return respond(res,400,{error:'Geçersiz durum.'});const items=await load(),item=items.find(x=>x.id===id);if(!item)return respond(res,404,{error:'Soru bulunamadı.'});item.status=status;await save(items);return respond(res,200,{item});
  }
  return next();
 }catch(e){return respond(res,500,{error:e.message||'Yerel servis hatası.'})}
 });}}}
