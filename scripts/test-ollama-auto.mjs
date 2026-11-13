import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('otomatik havuz: arka planda sürekli üretim, sıralı model kuyruğu, kitap kapsamı, zorluk sıralaması ve sabit eşzamanlılık',async()=>{
 let app, fake, dir, base, stopOllamaLoops;
 let failure=null;
 try{
  let inFlight=0, peak=0, calls=0;
 // Şıklar aynı kavram ailesinden, birbirine yakın uzunlukta ve "az kalsın doğru" niteliğinde.
 const PLAUSIBLE_OPTIONS=[
  'Doğru kavramın tam ve eksiksiz uygulanması',
  'Yanlış kavramın doğru sanılması',
  'Kısmen doğru ama eksik uygulama',
  'Doğru kavramın yanlış bağlamda kullanılması'
 ];
  const difficultyByQuestion=new Map();
  fake=http.createServer(async(req,res)=>{
   res.setHeader('Content-Type','application/json');
   if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fake:1'},{name:'tempo-ogretmen:latest'},{name:'tempo-hakem:latest'},{name:'tempo-mimar:latest'},{name:'tempo-qwen-coder:latest'}]}));
   inFlight++;peak=Math.max(peak,inFlight);
   let raw='';for await(const chunk of req)raw+=chunk;
   calls++;
   await sleep(180);
   const data=JSON.parse(raw||'{}');
   if(req.url==='/api/create'){inFlight--;return res.end(JSON.stringify({status:'success'}));}
   const prompt=data.prompt||'';
   const isBatchVerify=prompt.includes('"verdicts":');
   const isStudy=prompt.includes('"flashcards":');
   const isVerify=prompt.includes('soru denetçisisin')&&!isBatchVerify;
   let result;
   if(isBatchVerify){
    const textMatch=prompt.match(/KONU ANLATIMI:\s*([\s\S]*?)\nSORU #0:/);
    const text=textMatch?textMatch[1]:'';
    const evidence=text.trim().split(/\s+/).slice(0,8).join(' ')||'yeterince uzun bir kanit metni';
    const qMatches=[...prompt.matchAll(/SORU #(\d+): ([\s\S]*?)\nSEÇENEKLER:/g)];
    result={verdicts:qMatches.map(m=>{
     const id=Number(m[1]);
     const question=m[2].trim();
     const difficulty=difficultyByQuestion.get(question)||'kolay';
     return {id,answer:PLAUSIBLE_OPTIONS[0],singleCorrect:true,dualAnswerRisk:false,secondBestOption:'',supported:true,qualityOk:true,qualityScore:5,difficulty,evidence,reason:'Toplu kör hakem onayı.'};
    })};
   }else if(isVerify){
    const qMatch=prompt.match(/SORU: ([\s\S]*?)\nSEÇENEKLER:/);
    const question=qMatch?qMatch[1].trim():'';
    const difficulty=difficultyByQuestion.get(question)||'kolay';
    const textMatch=prompt.match(/KONU ANLATIMI:\s*([\s\S]*?)\nSORU:/);
    const text=textMatch?textMatch[1]:'';
    const evidence=text.trim().split(/\s+/).slice(0,8).join(' ')||'yeterince uzun bir kanit metni';
    result={answer:PLAUSIBLE_OPTIONS[0],singleCorrect:true,dualAnswerRisk:false,secondBestOption:'',supported:true,qualityOk:true,qualityScore:5,difficulty,evidence,reason:'Anlatımda bu bilgi doğrudan geçer.'};
   }else if(isStudy){
    const textMatch=prompt.match(/KONU ANLATIMI:\s*([\s\S]*)$/);
    const text=textMatch?textMatch[1]:'';
    const evidence=text.trim().split(/\s+/).slice(0,8).join(' ')||'yeterince uzun bir kanit metni';
    const tag=Math.random().toString(36).slice(2,8);
    result={
     flashcards:[{front:`Otomatik kart #${calls}-${tag} temel tanımı nedir?`,back:'Pasajda geçen ana kavramın özet açıklamasıdır.',mnemonic:'Kısa ipucu',evidence,difficulty:'kolay'}],
     matchings:[{title:`Eşleştirme #${calls}-${tag}`,pairs:[{left:'Kavram A',right:'Açıklama A'},{left:'Kavram B',right:'Açıklama B'},{left:'Kavram C',right:'Açıklama C'}],explanation:'Eşleştirme açıklaması',evidence,difficulty:'orta'}],
     drills:[{type:'fill_blank',prompt:`Otomatik boşluk #${calls}-${tag} ___ tamamlanır.`,answer:'planlı',hint:'İpucu',explanation:'Tekrar açıklaması',evidence,difficulty:'kolay'}]
    };
   }else{
    const textMatch=prompt.match(/KONU ANLATIMI:\s*([\s\S]*)$/);
    const text=textMatch?textMatch[1]:'';
    const evidence=text.trim().split(/\s+/).slice(0,8).join(' ')||'yeterince uzun bir kanit metni';
    const batchMatches=[...prompt.matchAll(/Soru \d+: zorluk=(KOLAY|ORTA|ZOR)/g)];
    if(batchMatches.length>0){
     result={questions:batchMatches.map((m,i)=>{
      const diff=m[1].toLocaleLowerCase('tr-TR');
      const question=`Otomatik paket sorusu #${calls}-${i}-${Math.random().toString(36).slice(2)} hangi kavramla ilişkilidir?`;
      difficultyByQuestion.set(question,diff);
      return {question,options:[...PLAUSIBLE_OPTIONS],answer:PLAUSIBLE_OPTIONS[0],explanation:'Açıklama metni yeterince uzun bir şekilde yazılmıştır.',evidence,topic:'Test konu',questionType:'kavram'};
     })};
    }else{
     const difficultyMatch=prompt.match(/tam olarak şöyle olmalı: (KOLAY|ORTA|ZOR):/);
     const difficulty=difficultyMatch?difficultyMatch[1].toLocaleLowerCase('tr-TR'):'kolay';
     const question=`Otomatik tekli sorusu #${calls}-${Math.random().toString(36).slice(2)}`;
     difficultyByQuestion.set(question,difficulty);
     result={question,options:[...PLAUSIBLE_OPTIONS],answer:PLAUSIBLE_OPTIONS[0],explanation:'Açıklama metni yeterince uzun bir şekilde yazılmıştır.',evidence,topic:'Test konu'};
    }
   }
   res.end(JSON.stringify({response:JSON.stringify(result),eval_count:160,eval_duration:200_000_000}));
   inFlight--;
  });
  const fakePort=await listen(fake);dir=await mkdtemp(join(tmpdir(),'tempo-test-auto-'));
  process.env.OLLAMA_BASE_URL=`http://127.0.0.1:${fakePort}`;process.env.OLLAMA_MODEL='fake:1';process.env.OLLAMA_VERIFIER_MODEL='fake:1';process.env.TEMPO_DATA_DIR=dir;
  process.env.OLLAMA_JUDGE2_MODEL='fake:1';
  delete process.env.TEMPO_DISABLE_AUTOLOOP;
 const mod=await import('../server/ollama.mjs');const ollamaPlugin=mod.ollamaPlugin;stopOllamaLoops=mod.stopOllamaLoops;let middleware;
 ollamaPlugin().configureServer({middlewares:{use(_path,handler){middleware=handler}}});
  app=http.createServer((req,res)=>{req.url=req.url.replace(/^\/api\/ollama/,'');middleware(req,res,()=>{res.statusCode=404;res.end()})});
  const port=await listen(app);base=`http://127.0.0.1:${port}`;

  let status=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoRunning,true);
  assert.equal(status.autoConcurrency,1);
  assert.equal(status.autoTimeoutMs,180000);
  assert.equal(status.settings.preset,'balanced');
  assert.equal(status.settings.turboQualityLock,false);
  assert.equal(status.settings.selfCorrection,true);
  assert.equal(status.settings.batchPerCall,1);
  assert.equal(status.settings.batchVerify,false);
  assert.equal(status.settings.pipelineMode,'direct');
  assert.equal(status.modelInferenceConcurrency,1);
  assert.equal(status.verifierModel,'fake:1');assert.equal(status.judge2Model,'fake:1');
  assert.equal(status.judge2Installed,true);

  let approved=0;
  for(let i=0;i<600 && approved<4;i++){await sleep(100);status=await (await fetch(`${base}/api/ollama/status`)).json();approved=status.approved}
  assert.ok(approved>=4,`en az 4 soru onaylanmalıydı, görülen: ${approved}, tel: ${JSON.stringify(status.telemetry)}, err: ${status.autoLastError}`);
  assert.equal(status.questionIntervalMs,5000,'hedef üretim temposu 5 sn olmalı');

  // Üretim temposu: sorular 5 saniyelik hedef tempodan hızlı üst üste bindirilmemeli
  const tempoQuestions=await (await fetch(`${base}/api/ollama/questions`)).json();
  const createdTimes=tempoQuestions.items.map(x=>Date.parse(x.createdAt)).sort((a,b)=>a-b);
  const gaps=createdTimes.slice(1).map((t,i)=>t-createdTimes[i]);
  assert.ok(gaps.length>=1,`tempo ölçümü için en az 2 soru gerekli, görülen: ${createdTimes.length}`);
  assert.ok(Math.min(...gaps)>=4500,`sorular arası süre en az ~5 sn olmalı, görülen en kısa aralık: ${Math.min(...gaps)}ms`);
  assert.ok(peak<=1,`modeller asla üst üste binmemeli; görülen eşzamanlı istek tepe değeri: ${peak}`);
  assert.ok(calls>=approved*3,`her soru için üretici + 2 hakem çağrısı yapılmalı; çağrı: ${calls}, soru: ${approved}`);
  assert.ok(status.coverage.coveredPassages>=2,'birden fazla kitap pasajı taranmış olmalı');
  assert.ok(status.telemetry.questionsPerMinute>0,'soru/dk hız metriği ölçülmüş olmalı');
  assert.equal(status.studyCounts?.total||0,0,'çalışma materyali üretimi varsayılan olarak kapalı olmalı');

  const questions=await (await fetch(`${base}/api/ollama/questions`)).json();
  const units=new Set(questions.items.map(x=>x.unitId));
  assert.ok(units.size>=2,`en az 2 farklı ünite üretilmeliydi, görülen: ${units.size}`);
  assert.ok(questions.items.every(x=>x.status==='approved'));
  assert.ok(questions.items.every(x=>['kolay','orta','zor'].includes(x.difficulty)));
  assert.ok(questions.items.every(x=>Array.isArray(x.verification?.judges)&&x.verification.judges.length===2));
  assert.ok(questions.items.every(x=>typeof x.passageId==='string' && x.passageId.includes('#')));

  // Her ünitenin soruları sırayla kolay -> orta -> zor kalıbıyla eklenmiş olmalı
  const byUnit={};
  for(const q of questions.items){(byUnit[q.unitId]=byUnit[q.unitId]||[]).push(q)}
  for(const unitId in byUnit){
   const ordered=byUnit[unitId].slice().sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
   const expected=['kolay','orta','zor'];
   ordered.forEach((q,i)=>{assert.equal(q.difficulty,expected[i%3],`${unitId} ünitesinde ${i+1}. soru ${expected[i%3]} olmalıydı, bulunan: ${q.difficulty}`)});
  }

  let changed=await fetch(`${base}/api/ollama/concurrency`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:1})});
  assert.equal(changed.status,200);assert.equal((await changed.json()).autoConcurrency,1);
  let bad=await fetch(`${base}/api/ollama/concurrency`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:0})});
  assert.equal(bad.status,400);
  bad=await fetch(`${base}/api/ollama/concurrency`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:1000})});
  assert.equal(bad.status,400);

  const stopped=await fetch(`${base}/api/ollama/stop`,{method:'POST',headers:{Origin:base}});
  assert.equal(stopped.status,200);
  await sleep(400);
  status=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoRunning,false);
  assert.equal(status.autoActive,0);
  const countAfterStop=status.approved;
  await sleep(400);
  const statusLater=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(statusLater.approved,countAfterStop,'durdurulduktan sonra yeni soru üretilmemeli');

 }catch(e){failure=e}
 try{stopOllamaLoops?.()}catch{}
 if(base){try{await fetch(`${base}/api/ollama/stop`,{method:'POST',headers:{Origin:base}})}catch{}}
 if(app)try{app.closeAllConnections?.();await close(app)}catch{}
 if(fake)try{fake.closeAllConnections?.();await close(fake)}catch{}
 if(dir)try{await rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:100})}catch{}
 if(failure){console.error(failure);process.exit(1)}
 process.exit(0);
});
