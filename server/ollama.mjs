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
// Qwen3 14B: Qwen2.5 32B seviyesinde yanıt kalitesi sunar ve ~9-12 GB VRAM ile 12 GB'lik
// kartlara (örn. RTX 3080 Ti) sığar; bu nedenle varsayılan "öğretmen" modeli budur.
const defaultModel = process.env.OLLAMA_MODEL || 'qwen3:14b';
// 2. hakem için varsayılan olarak üreticiden/denetçiden FARKLI bir model önerilir: Gemma 3 12B
// (Google), Qwen ailesinden tamamen bağımsız, Türkçe dahil 140'tan fazla dilde resmi destek sunar
// ve soru-cevap/akıl yürütme değerlendirmesinde güçlüdür; Q4 nicemlemeyle ~8 GB VRAM kullanır, 12
// GB'lik kartlara (RTX 3080 Ti) rahatça sığar. Soru ÜRETMEDE illa daha iyi olması gerekmez — burada
// önemli olan, denetim/kalite değerlendirmesinde bağımsız ikinci bir "görüş" sağlamasıdır. Bu model
// kurulu değilse arayüz "kurulu değil" gösterir ve kullanıcı `ollama pull gemma3:12b` ile indirip
// Soru stüdyosu'ndan değiştirebilir; indirilmemişse otomatik üretim bu hakem kurulana kadar bekler.
const defaultJudge2Model = process.env.OLLAMA_JUDGE2_MODEL || 'gemma3:12b';
const defaultConcurrency = 3; // aynı anda kaç ünite için soru üretilsin (bkz. autoConcurrencyLimit)
const defaultAutoTimeoutMs = 5000; // bir ünitenin üretim+bağımsız kontrol denemesinin alabileceği azami süre
const DIFFICULTIES = ['kolay','orta','zor'];
async function readSettings(){try{const v=JSON.parse(await readFile(settingsFile,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch(e){if(e.code==='ENOENT')return {};throw e}}
async function writeSettings(patch){await mkdir(dataDir,{recursive:true});const current=await readSettings();const next={...current,...patch};const tmp=settingsFile+'.tmp';await writeFile(tmp,JSON.stringify(next,null,2),'utf8');await rename(tmp,settingsFile);return next}
async function selectedModel(){const v=await readSettings();return typeof v.model==='string'&&v.model.length<=200&&v.model.trim()?v.model:defaultModel}
// Denetçi ve bir ek "bağımsız hakem" modeli: arayüzden ayrı ayrı seçilebilir (bkz.
// /select-model'in role alanı). Hiçbiri seçilmemişse denetçi, eski OLLAMA_VERIFIER_MODEL ortam
// değişkenine veya üretici modele düşer; judge2 ise GERÇEK bağımsızlık sağlaması için varsayılan
// olarak FARKLI bir model (bkz. defaultJudge2Model) dener, kullanıcı ayrıca kendi seçimini yaparsa
// o kullanılır.
async function selectedVerifierModel(model){const v=await readSettings();if(typeof v.verifierModel==='string'&&v.verifierModel.length<=200&&v.verifierModel.trim())return v.verifierModel;return process.env.OLLAMA_VERIFIER_MODEL||model}
async function selectedJudgeModel(key,fallback){const v=await readSettings();return typeof v[key]==='string'&&v[key].length<=200&&v[key].trim()?v[key]:fallback}
async function autoRunningEnabled(){const v=await readSettings();return v.autoRunning!==false}
async function autoConcurrencyLimit(){const v=await readSettings();const n=Number.isFinite(v.autoConcurrency)?Math.round(v.autoConcurrency):defaultConcurrency;return Math.max(1,Math.min(contexts.length,n))}
// Bir ünite için tek bir üretim denemesinin (üretici + bağımsız denetçi çağrısı dahil) en fazla ne
// kadar sürebileceği: bu süre dolarsa deneme iptal edilir ve o "yuva" hemen yeni bir denemeyle
// doldurulur. Varsayılan 5000ms istenen azami hızı yansıtır; yavaş donanımlarda sürekli zaman
// aşımına uğranıyorsa ayar ekranından yükseltilebilir (bkz. /api/ollama/timeout).
async function autoTimeoutMs(){const v=await readSettings();const n=Number.isFinite(v.autoTimeoutMs)?Math.round(v.autoTimeoutMs):defaultAutoTimeoutMs;return Math.max(1000,Math.min(120000,n))}
// Bir ünite için havuzda zaten kaç tane YAPAY ZEKÂ ÜRETİMİ (zorluk etiketli) soru varsa, sıradaki
// denemenin hangi zorlukta olması gerektiğini belirler: her ünite için sırayla kolay → orta → zor
// → tekrar kolay... Kitaptan gelen hazır sorular (question-bank.json, zorluk etiketi yok) bu sayıma
// dahil edilmez.
function nextDifficulty(ctx,items){const n=[...questionBank,...items].filter(x=>x.unitId===ctx.id&&DIFFICULTIES.includes(x.difficulty)).length;return DIFFICULTIES[n%3]}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// --- Manuel (API ile tek seferlik) üretim için paylaşılan durum ---
let busy = false;
let phase = 'idle';
let cursor = 0;
let lastError = '';
let controller;

// --- Sunucunun kendi kendine, PARALEL çalışan "öğretmen" döngüsü için paylaşılan durum ---
// Her ünite kendi AbortController'ıyla bağımsızca üretilir; hiçbiri ortak bir "busy" bayrağını
// paylaşmaz, bu yüzden birden fazla ünite GERÇEKTEN aynı anda üretilebilir (donanım izin verdiğince).
let autoCursor = 0;
let autoControllers = new Map(); // controller -> {unit, phase}
let autoLastError = '';
let autoLoopStarted = false;

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
// Birden fazla ünite aynı anda üretildiğinde dosyaya yazma adımının birbirini ezmemesi için basit
// bir sıra (mutex): yavaş olan model çağrıları KİLİT DIŞINDA, paralel çalışır; yalnız dosyayı
// okuyup-kontrol edip-yazan ucuz ve hızlı son adım sıraya alınır.
let saveQueue = Promise.resolve();
function withSaveLock(fn){const run=saveQueue.then(fn,fn);saveQueue=run.then(()=>{},()=>{});return run}
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
 // Not: status burada doğrudan 'approved' olarak kurulur, fakat bu kayıt yalnızca aşağıdaki
 // bağımsız denetçi geçişini de geçtikten SONRA diske yazılır. Yani her kaydedilen soru,
 // kaydedilmeden önce zaten iki aşamalı yapay zekâ "öğretmen" denetiminden geçmiş olur;
 // kullanıcıdan ayrı bir onay beklenmez. Kullanıcı yine de /review ile istediği soruyu reddedebilir.
 return {id:randomUUID(),unitId:ctx.id,book:ctx.book,unit:ctx.unit,topic:topic.trim(),question:question.trim(),options:options.map(x=>x.trim()),answer:answer.trim(),explanation:explanation.trim(),evidence:evidence.trim(),status:'approved',model,createdAt:new Date().toISOString()};
}
async function runModel(which,input,temperature,signal,numPredict=900){
 const r=await fetch(`${base}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:which,prompt:input,stream:false,format:'json',options:{temperature,num_predict:numPredict}}),signal});
 if(!r.ok)throw Error(`Ollama (${which}) HTTP ${r.status}: ${(await r.text()).slice(0,250)}`);
 const result=await r.json();try{return JSON.parse(result.response)}catch{throw Error(`${which} geçerli JSON üretmedi.`)}
}
// Dosyaya son yazma adımı: her zaman withSaveLock üzerinden çağrılır, böylece paralel üretimler
// birbirinin kaydını ezmez ve aynı anda eklenen iki soru çakışırsa (birebir/çok benzer) sondan
// gelen reddedilir.
async function finalize(parsed,ctx,model,verification){
 return withSaveLock(async()=>{
  const latest=await load();
  const record=validate(parsed,ctx,latest,model);
  record.verification=verification;
  // Zorluk etiketi GÜVENİLİR KAYNAK olarak her zaman bağımsız denetçinin kendi değerlendirmesinden
  // gelir (verification.difficulty); üreticinin kendi iddiasına güvenilmez.
  record.difficulty=verification.difficulty;
  latest.push(record);
  await save(latest);
  return record;
 });
}
// Üretim + bağımsız denetim çekirdeği. Paylaşılan hiçbir tekil değişkene (busy/controller gibi)
// dokunmaz; bu sayede hem elle tetiklenen istekten hem de kendi kendine çalışan döngüden, hatta
// BİRDEN FAZLA ünite için AYNI ANDA çağrılabilir. Yavaş olan iki model çağrısı burada, kilit
// olmadan çalışır; yalnızca sondaki finalize() kilitlidir.
async function generateAndVerify(ctx,model,verifierModel,judge2Model,signal,onPhase){
 const items=await load();
 const resultAudit=audit(items);
 if(resultAudit.invalid||resultAudit.duplicates)throw Error('Havuz denetiminde biçim veya birebir tekrar hatası var; üretim durduruldu.');
 if(items.length>=5000)throw Error('Yerel havuz 5000 kayıt sınırına ulaştı.');
 // Bu ünite için havuzda zaten kaç zorluk etiketli soru varsa, sıradakinin hangi zorlukta
 // OLMASI GEREKTİĞİNİ belirler: her ünitede sırayla kolay → orta → zor → tekrar kolay...
 const targetDifficulty=nextDifficulty(ctx,items);
 const difficultyHint={kolay:'KOLAY: cevap anlatımda tek ve açık bir cümlede doğrudan geçmeli, neredeyse birebir hatırlama ile bulunabilmeli.',orta:'ORTA: cevap için anlatımdaki iki ayrı bilgiyi birleştirmek veya basit bir çıkarım yapmak gerekmeli; tek cümleyi aynen tekrarlamak yetmemeli.',zor:'ZOR: cevap anlatımın ayrıntılı veya az vurgulanan bir noktasına dayanmalı ya da birbirine yakın görünen seçenekler arasında ince bir ayrım gerektirmeli.'}[targetDifficulty];
 onPhase?.('generating');
 const prompt=`Sen Türkçe antrenörlük temel eğitim soru yazarı ve öğretmenisin. Yalnızca aşağıdaki konu anlatımındaki bilgilerle çözülebilen, tek doğru cevaplı dört seçenekli BİR özgün soru üret. Sorunun zorluk seviyesi tam olarak şöyle olmalı: ${difficultyHint} Kaynakta bulunmayan bilgi isteme. Konunun dışına çıkma, sağlık tavsiyesi verme. Anlamsal olarak farklı bir soru sor. JSON döndür: question (soru), options (4 farklı metin), answer (options içindeki tam doğru metin), explanation (kısa gerekçe), evidence (aşağıdaki anlatımdan sorunun cevabını destekleyen aynen alınmış en az 15 karakterlik kısa bir cümle), topic (kısa konu adı). Kitap: ${ctx.book}. Ünite: ${ctx.unit}. BU ÜNİTEDE DAHA ÖNCE SORULMUŞ BAZI SORULAR (bunları tekrarlama, anlamca da çok benzer bir soru sorma): ${[...questionBank,...items].filter(x=>x.unitId===ctx.id).slice(-10).map(x=>x.question).join(' / ')}. KONU ANLATIMI: ${ctx.text}`;
 const parsed=await runModel(model,prompt,0.8,signal,900);
 const draft=validate(parsed,ctx,items,model);
 // Soru havuza eklenmeden ÖNCE, cevabı ve gerekçeyi hiç GÖRMEYEN İKİ bağımsız model (denetçi +
 // 1 ayrı "hakem") aynı soruyu birbirinden habersiz, PARALEL olarak kendi başlarına çözer; her biri
 // hem doğruluğu (tek doğru cevap, kaynak desteği, kalite) hem de zorluk seviyesini (kolay/orta/zor)
 // bağımsızca değerlendirir. İkisi de AYNI cevapta VE aynı zorlukta birleşmezse soru hiç kaydedilmez
 // — yalnızca iki hakem olduğu için "çoğunluk" kavramı yerine tam görüş birliği aranır.
 // Gerçek bağımsızlık için judge2 varsayılan olarak denetçiden FARKLI bir modele (bkz.
 // defaultJudge2Model) düşer; kullanıcı kendi seçimini yaparsa o kullanılır. İki çağrı da aynı anda (Promise.all ile)
 // gönderilir; tek ekran kartlı bir bilgisayarda Ollama bunları muhtemelen sırayla işler, bu yüzden
 // gerçek süre tek bir denetim çağrısının ~2 katına kadar çıkabilir (bkz. README "azami süre bütçesi").
 onPhase?.('verifying');
 const checkPrompt=`Sen Türkçe antrenörlük temel eğitim alanında dikkatli bir öğretmen/soru denetçisisin. Aşağıdaki soruyu YALNIZ verilen anlatıma göre bağımsız çöz. Soru, anlatımda öğretilmeyen bilgiye ihtiyaç duyuyorsa, birden fazla seçenek doğruysa, belirsizse, konuyla ilgisizse veya dil bilgisi/anlatım açısından sınava uygun değilse reddet. Ayrıca soruyu, sana SÖYLENEN bir hedefe göre değil, TAMAMEN KENDİ bağımsız değerlendirmenle zorluk açısından sınıflandır: "kolay" (cevap anlatımda tek ve açık bir cümlede doğrudan geçer, neredeyse birebir hatırlamayla bulunur), "orta" (cevap için iki ayrı bilgiyi birleştirmek veya basit bir çıkarım gerekir) veya "zor" (cevap ayrıntılı/az vurgulanan bir noktaya dayanır ya da seçenekler arasında ince bir ayrım gerektirir). Dış bilgi kullanma. JSON döndür: answer (dört seçenekten tam doğru metin, çözemiyorsan boş), singleCorrect (boolean), supported (boolean), qualityOk (boolean: soru açık, konuya uygun ve sınav kalitesinde mi), difficulty (tam olarak "kolay", "orta" veya "zor"), evidence (anlatımdan cevabı destekleyen 15 karakterden uzun aynen alınmış kısa metin), reason (kısa Türkçe gerekçe; hem doğruluk hem zorluk değerlendirmeni açıkla). KONU ANLATIMI: ${ctx.text}\nSORU: ${draft.question}\nSEÇENEKLER: ${JSON.stringify(draft.options)}`;
 const judgeModels=[verifierModel,judge2Model];
 const rawChecks=await Promise.all(judgeModels.map(m=>runModel(m,checkPrompt,0.2,signal,500)));
 const judges=[];
 for(let i=0;i<rawChecks.length;i++){
  const check=rawChecks[i], jm=judgeModels[i];
  if(!check || check.singleCorrect!==true || check.supported!==true || check.qualityOk!==true || typeof check.answer!=='string' || !draft.options.includes(check.answer) || typeof check.evidence!=='string' || norm(check.evidence).length<15 || !norm(ctx.text).includes(norm(check.evidence)) || typeof check.reason!=='string' || !check.reason.trim() || !DIFFICULTIES.includes(check.difficulty))throw Error(`Bağımsız denetçilerden biri (${jm}) soruyu, tek doğru cevabı, kaliteyi, zorluk etiketini veya kaynak dayanağını doğrulayamadı; soru kaydedilmedi.`);
  judges.push({model:jm,answer:check.answer,difficulty:check.difficulty,evidence:check.evidence.trim().slice(0,500),reason:check.reason.trim().slice(0,1200)});
 }
 const agreedAnswers=new Set(judges.map(j=>j.answer));
 if(agreedAnswers.size!==1||[...agreedAnswers][0]!==draft.answer)throw Error(`Bağımsız denetçiler aynı doğru cevapta birleşmedi (${judges.map(j=>j.answer).join(' / ')}); soru kaydedilmedi.`);
 // Yalnızca iki hakem olduğu için "çoğunluk" anlamlı değildir: zorlukta da tam görüş birliği aranır.
 const agreedDifficulties=new Set(judges.map(j=>j.difficulty));
 if(agreedDifficulties.size!==1)throw Error(`Bağımsız denetçiler bu sorunun zorluğunda görüş birliğine varamadı (${judges.map(j=>j.difficulty).join(' / ')}); soru kaydedilmedi.`);
 const agreedDifficulty=[...agreedDifficulties][0];
 if(agreedDifficulty!==targetDifficulty)throw Error(`Soru, bu ünite için sıradaki hedef zorluk seviyesiyle (${targetDifficulty}) eşleşmedi (denetçilerin ortak kararı: ${agreedDifficulty}); kalıp bozulmasın diye kaydedilmedi, farklı bir soru denenecek.`);
 const verification={judges,answer:draft.answer,difficulty:agreedDifficulty};
 onPhase?.('saving');
 return finalize(parsed,ctx,model,verification);
}
// Elle (API ile) tek seferlik üretim: eskisi gibi tek seferde yalnız bir istek kabul eder.
async function generateOneManual(ctx,model,verifierModel,judge2Model,{timeoutMs=120000}={}){
 if(busy)throw Error('Bir üretim zaten devam ediyor.');
 busy=true;phase='loading';lastError='';
 controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await generateAndVerify(ctx,model,verifierModel,judge2Model,controller.signal,p=>{phase=p})}
 catch(e){lastError=e.name==='AbortError'?'Üretim zaman aşımına uğradı veya durduruldu.':e.message;throw e}
 finally{clearTimeout(timeout);busy=false;phase='idle';controller=undefined}
}
// Kendi kendine çalışan döngü için: ateşle-ve-unut (fire-and-forget). Kendi AbortController'ını
// autoControllers'a kaydeder; bittiğinde (başarılı ya da başarısız) kendini oradan siler ve böylece
// zamanlayıcı o "yuvayı" hemen başka bir üniteyle doldurabilir — araya yapay bir bekleme konmaz.
function launchAutoUnit(ctx,model,verifierModel,judge2Model,timeoutMs=120000){
 const entry={unit:ctx.id,phase:'loading'};
 const controller=new AbortController();
 autoControllers.set(controller,entry);
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 generateAndVerify(ctx,model,verifierModel,judge2Model,controller.signal,p=>{entry.phase=p})
  .catch(e=>{autoLastError=e.name==='AbortError'?'Üretim zaman aşımına uğradı veya durduruldu.':e.message})
  .finally(()=>{clearTimeout(timeout);autoControllers.delete(controller)});
}
// Zamanlayıcı: boşalan her "yuvayı" (autoConcurrency ayarına kadar) hemen yeni bir üniteyle
// doldurur. Başarı sonrası eklenen YAPAY bir bekleme YOKTUR; bir sonraki soru, bir öncekinin
// gerçekten bittiği an (model + Ollama hızının izin verdiği kadar hızlı) başlar. Bu nedenle gerçek
// hız, sabit bir sayıya (ör. "her 2 saniyede bir") değil, kullanılan donanıma ve modele bağlıdır.
async function autoScheduler(){
 for(;;){
  try{
   if(await autoRunningEnabled()){
    const limit=await autoConcurrencyLimit();
    if(autoControllers.size<limit){
     const model=await selectedModel();const verifierModel=await selectedVerifierModel(model);const judge2Model=await selectedJudgeModel('judge2Model',defaultJudge2Model);
     let models=[];
     try{const r=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(2500)});if(r.ok)models=((await r.json()).models||[]).map(x=>x.name)}catch{}
     if(models.includes(model)&&models.includes(verifierModel)&&models.includes(judge2Model)){
      const items=await load();const a=audit(items);
      if(!a.invalid&&!a.duplicates&&items.length<5000){
       const ctx=contexts[autoCursor++%contexts.length];
       launchAutoUnit(ctx,model,verifierModel,judge2Model,await autoTimeoutMs());
      }
     }
    }
   }
  }catch(e){autoLastError=e.message||String(e)}
  await sleep(250); // boş yuvaları hızlıca kontrol etmek için kısa bir zamanlayıcı aralığı; bu süre tek
                     // bir sorunun üretim süresi DEĞİLDİR, yalnız "yeni iş var mı?" kontrol sıklığıdır.
 }
}
export function ollamaPlugin(){return {name:'tempo-ollama',configureServer(server){
 // Döngü yalnızca gerçek geliştirme sunucusu (npm run dev) başlatıldığında kurulur; `vite build`
 // configureServer çağırmaz, bu yüzden derleme sırasında arka planda bitmeyen bir zamanlayıcı kalmaz.
 if(!autoLoopStarted&&process.env.TEMPO_DISABLE_AUTOLOOP!=='1'){autoLoopStarted=true;autoScheduler()}
 server.middlewares.use('/api/ollama',async(req,res,next)=>{
 try{
  const path=(req.url||'').split('?')[0];
  const model=await selectedModel();const verifierModel=await selectedVerifierModel(model);const judge2Model=await selectedJudgeModel('judge2Model',defaultJudge2Model);
  if(req.method==='GET'&&path==='/status'){
   let models=[],connected=false;try{const r=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(2500)});if(r.ok){const d=await r.json();models=(d.models||[]).map(x=>x.name);connected=true}}catch{}
   const items=await load();const storage=await storageUsage();const autoRunning=await autoRunningEnabled();const autoConcurrency=await autoConcurrencyLimit();const autoTimeout=await autoTimeoutMs();
   const autoPhases=[...autoControllers.values()].map(x=>({unit:x.unit,phase:x.phase}));
   const difficultyCounts={kolay:0,orta:0,zor:0};for(const x of items)if(DIFFICULTIES.includes(x.difficulty))difficultyCounts[x.difficulty]++;
   return respond(res,200,{connected,model,verifierModel,judge2Model,installed:models.includes(model),verifierInstalled:models.includes(verifierModel),judge2Installed:models.includes(judge2Model),models,busy,phase,lastError,storage,count:items.length,approved:items.filter(x=>x.status==='approved').length,rejected:items.filter(x=>x.status==='rejected').length,difficultyCounts,autoRunning,autoConcurrency,autoTimeoutMs:autoTimeout,autoActive:autoControllers.size,autoPhases,autoLastError,totalUnits:contexts.length});
  }
  if(req.method==='GET'&&path==='/questions')return respond(res,200,{items:await load()});
  if(req.method==='GET'&&path==='/audit')return respond(res,200,audit(await load()));
  if(req.method!=='GET'&&!safeOrigin(req))return respond(res,403,{error:'Bu işlem yalnız aynı kaynaktan yapılabilir.'});
  if(req.method==='POST'&&path==='/select-model'){
   if(busy)return respond(res,409,{error:'Üretim sürerken model değiştirilemez.'});
   const input=await body(req);const chosen=input.model;
   const role=typeof input.role==='string'?input.role:'model';
   const roleKey={model:'model',verifier:'verifierModel',judge2:'judge2Model'}[role];
   if(!roleKey)return respond(res,400,{error:'Geçersiz rol.'});
   const storage=await storageUsage();if(storage.total+1_000_000>storageLimit)return respond(res,400,{error:'100 GB sınırına yaklaşıldı; ayar kaydedilmedi.'});
   if(typeof chosen!=='string'||chosen.length>200||!chosen.trim())return respond(res,400,{error:'Geçersiz model adı.'});
   let tags;try{const r=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error('Ollama yanıt vermedi.');tags=await r.json()}catch{return respond(res,502,{error:'Ollama model listesi alınamadı.'})}
   if(!Array.isArray(tags.models)||!tags.models.some(x=>x.name===chosen))return respond(res,400,{error:'Model yerel Ollama listesinde bulunamadı.'});
   await writeSettings({[roleKey]:chosen});return respond(res,200,{role,model:chosen});
  }
  if(req.method==='POST'&&path==='/concurrency'){
   const input=await body(req);const n=Number(input.value);
   if(!Number.isFinite(n)||Math.round(n)!==n||n<1||n>contexts.length)return respond(res,400,{error:`1 ile ${contexts.length} arasında bir tam sayı gerekir.`});
   await writeSettings({autoConcurrency:n});return respond(res,200,{autoConcurrency:n});
  }
  if(req.method==='POST'&&path==='/timeout'){
   const input=await body(req);const n=Number(input.value);
   if(!Number.isFinite(n)||Math.round(n)!==n||n<1000||n>120000)return respond(res,400,{error:'1000 ile 120000 (ms) arasında bir tam sayı gerekir.'});
   await writeSettings({autoTimeoutMs:n});return respond(res,200,{autoTimeoutMs:n});
  }
  if(req.method==='POST'&&path==='/start'){await writeSettings({autoRunning:true});return respond(res,200,{autoRunning:true})}
  if(req.method==='POST'&&path==='/generate'){
   if(busy)return respond(res,409,{error:'Bir üretim zaten devam ediyor.'});
   const input=await body(req);const ids=Array.isArray(input.units)?input.units.filter(x=>typeof x==='string'):[];const candidates=contexts.filter(x=>ids.includes(x.id));
   if(!candidates.length)return respond(res,400,{error:'Önce en az bir üniteyi tamamla.'});
   const ctx=candidates[cursor++%candidates.length];
   try{const record=await generateOneManual(ctx,model,verifierModel,judge2Model);return respond(res,200,{item:record})}
   catch(e){const conflict=/zaten devam/.test(e.message||'');return respond(res,conflict?409:502,{error:e.message||'Üretim başarısız.'})}
  }
  if(req.method==='POST'&&path==='/stop'){if(controller)controller.abort();for(const c of autoControllers.keys())c.abort();await writeSettings({autoRunning:false});return respond(res,200,{ok:true,autoRunning:false})}
  if(req.method==='POST'&&path==='/review'){
   const {id,status}=await body(req);if(!['approved','rejected'].includes(status))return respond(res,400,{error:'Geçersiz durum.'});
   // Artık birden fazla ünite aynı anda arka planda kaydedilebildiği için, bu okuma-değiştirme-yazma
   // adımı da withSaveLock içinden geçmeli; yoksa tam o anda biten eşzamanlı bir üretim bu değişikliği
   // ezebilir.
   const item=await withSaveLock(async()=>{const items=await load();const found=items.find(x=>x.id===id);if(!found)return null;found.status=status;await save(items);return found});
   if(!item)return respond(res,404,{error:'Soru bulunamadı.'});
   return respond(res,200,{item});
  }
  return next();
 }catch(e){return respond(res,500,{error:e.message||'Yerel servis hatası.'})}
 });}}}
