import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));

test('soru üretimi: kör denetim, çift-cevap koruması, çeldirici hijyeni, çalışma paketi, think fallback, uzman model ve evrim API uçları',async()=>{
 let calls=[], mismatch=false, wrongDifficulty=false, judge2DisagreesAnswer=false, judge2Difficulty='kolay', dualAnswerRisk=false, overlapOptions=false, numericOptions=false;
 let rejectThinkOnce=true, sendBannedOption=false, createdModels=[];
 const fake=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fake:1'},{name:'fake:2'},...createdModels.map(n=>({name:n}))]}));
  let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);
  if(req.url==='/api/create'){
   createdModels.push(data.model);
   return res.end(JSON.stringify({status:'success'}));
  }
  // Eski Ollama sürümü veya think desteklemeyen model senaryosu
  if(rejectThinkOnce && data.think===false){
   rejectThinkOnce=false;
   res.statusCode=400;
   return res.end(JSON.stringify({error:'think parameter not supported'}));
  }
  calls.push(data);
  const isUnit01=data.prompt.includes('Antrenmanı oluşturan ögeler');
  const isUnit02=data.prompt.includes('Bireyselleştirme, süreklilik');
  let evidence='Egzersiz planlı ve tekrarlıdır';
  if(isUnit01)evidence='Kondisyonel hazırlık kuvvet, dayanıklılık ve sürat gibi özellikleri';
  if(isUnit02)evidence='Bireyselleştirme, süreklilik, çeşitlilik ve branşa özgülük temel ilkelerdir';
  let result;
  if(data.prompt.includes('Baş Stratejisti')){
   result={reason:'0-1 ünitesine öncelik ver ve uzun şıkları dengeli tut',focusUnits:['0-1'],generatorAddendum:'Tüm şıklar aynı terim sınıfından olsun ama tek doğru kalsın',judgeAddendum:'İki şık birden doğruysa dualAnswerRisk=true ver',customRuleCode:'function evaluateCandidate(candidate, unit){ if (candidate.question.length < 15) return {ok:false, reason:"Soru kökü çok kısa"}; return {ok:true}; }'};
  }else if(data.prompt.includes('"flashcards":')){
   const textMatch=data.prompt.match(/KONU ANLATIMI:\s*([\s\S]*)$/);
   const studyEv=(textMatch?textMatch[1]:'').trim().split(/\s+/).slice(0,8).join(' ')||evidence;
   result={
    flashcards:[{front:'Düzenli fiziksel egzersiz hangi iki temel özellikle tanımlanır?',back:'Planlı ve tekrarlı olmasıyla tanımlanır.',mnemonic:'P-T: Planlı ve Tekrarlı',evidence:studyEv,difficulty:'kolay'}],
    matchings:[{title:'Egzersiz Özellikleri',pairs:[{left:'Planlılık',right:'Program dahilinde yapma'},{left:'Tekrarlılık',right:'Düzenli aralıklarla uygulama'},{left:'Hareket',right:'Kas kasılmasıyla enerji harcama'}],explanation:'Temel egzersiz ögeleri',evidence:studyEv,difficulty:'kolay'}],
    drills:[{type:'fill_blank',prompt:'Egzersiz fiziksel uygunluğu korumaya yönelik ___ ve tekrarlı etkinliktir.',answer:'planlı',hint:'Programlı anlamına gelir',explanation:'Egzersiz planlıdır.',evidence:studyEv,difficulty:'kolay'}]
   };
  }else if(data.prompt.includes('soru denetçisisin')){
   if(isUnit01)result={answer:'Kondisyonel ve teknik hazırlık',singleCorrect:true,dualAnswerRisk:false,secondBestOption:'',supported:true,qualityOk:true,qualityScore:5,difficulty:wrongDifficulty?'zor':'kolay',evidence,reason:'Anlatım kondisyonel ve teknik hazırlığı birlikte sayar.'};
   else if(isUnit02){
    const isJudge2=data.model==='fake:2';
    const answer=(isJudge2&&judge2DisagreesAnswer)?'İlke yok':'Bireysel ve sürekli ilkeler';
    const difficulty=isJudge2?judge2Difficulty:'kolay';
    result={answer,singleCorrect:true,dualAnswerRisk:false,secondBestOption:'',supported:true,qualityOk:true,qualityScore:4,difficulty,evidence,reason:`${data.model} bağımsız değerlendirmesi.`};
   }
   else result={answer:numericOptions?'20 dakika egzersiz':mismatch?'İhmal':'Planlama ve tekrar',singleCorrect:!dualAnswerRisk,dualAnswerRisk,secondBestOption:dualAnswerRisk?'Tahkim':'',supported:true,qualityOk:true,qualityScore:5,difficulty:numericOptions?'orta':'kolay',evidence,reason:'Anlatım egzersizin planlı ve tekrarlı olduğunu belirtir.'};
  }else{
   if(isUnit01){result={question:'Antrenmanı oluşturan ögelerden hangileri birlikte sayılır?',options:['Kondisyonel ve teknik hazırlık','İhmal','Tahkim','Bürokrasi'],answer:'Kondisyonel ve teknik hazırlık',explanation:'Kondisyonel ve teknik hazırlık birlikte sayılır.',evidence,topic:'Antrenmanın ögeleri'};}
   else if(isUnit02)result={question:'Antrenman yükü planlanırken hangi temel ilkeler gözetilir?',options:['Bireysel ve sürekli ilkeler','İlke yok','Tahkim','Bürokrasi'],answer:'Bireysel ve sürekli ilkeler',explanation:'Bireyselleştirme ve süreklilik temel ilkelerdendir.',evidence,topic:'Antrenman ilkeleri'};
   else if(numericOptions)result={question:'Haftalık başlangıç egzersiz süresi ne kadar olmalıdır?',options:['20 dakika egzersiz','30 dakika egzersiz','45 dakika egzersiz','60 dakika egzersiz'],answer:'20 dakika egzersiz',explanation:'Egzersiz planlı ve tekrarlıdır.',evidence,topic:'Süre planlaması'};
   else result={question:'Düzenli hareketin planlama niteliği hangi iki özellikle belirlenir?',options:overlapOptions?['Planlama ve tekrar etkinliği','Tekrar ve planlama etkinliği','Tahkim kurulu','Bürokrasi yaklaşımı']:['Planlama ve tekrar','İhmal','Tahkim',sendBannedOption?'Yukarıdakilerin hepsi':'Bürokrasi'],answer:overlapOptions?'Planlama ve tekrar etkinliği':'Planlama ve tekrar',explanation:'Egzersiz planlı ve tekrarlıdır.',evidence,topic:'Egzersizin özellikleri'};
  }
  res.end(JSON.stringify({response:JSON.stringify(result),eval_count:120,eval_duration:400_000_000,load_duration:50_000_000}));
 });
 const fakePort=await listen(fake);const dir=await mkdtemp(join(tmpdir(),'tempo-test-'));
 process.env.OLLAMA_BASE_URL=`http://127.0.0.1:${fakePort}`;process.env.OLLAMA_MODEL='fake:1';process.env.OLLAMA_VERIFIER_MODEL='fake:1';process.env.TEMPO_DATA_DIR=dir;
 process.env.TEMPO_DISABLE_AUTOLOOP='1';
 const {ollamaPlugin}=await import('../server/ollama.mjs');let middleware;
 ollamaPlugin().configureServer({middlewares:{use(_path,handler){middleware=handler}}});
 const app=http.createServer((req,res)=>{req.url=req.url.replace(/^\/api\/ollama/,'');middleware(req,res,()=>{res.statusCode=404;res.end()})});const port=await listen(app);const base=`http://127.0.0.1:${port}`;
 const post=()=>fetch(`${base}/api/ollama/generate`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({units:['0-0']})});
 try{
  const status=await (await fetch(`${base}/api/ollama/status`)).json();assert.equal(status.verifierInstalled,true);
  assert.equal(status.verifierModel,'fake:1');assert.equal(status.judge2Model,'gemma3:4b');
  assert.equal(status.judge2Installed,false);
  assert.ok(status.coverage.totalPassages>=500,'tam kitap pasajları yüklenmiş olmalı');
  assert.equal(status.settings.preset,'balanced');
  assert.equal(status.settings.turboQualityLock,false);
  assert.equal(status.settings.selfCorrection,true);
  assert.equal(status.settings.batchPerCall,1);
  assert.equal(status.settings.batchVerify,false);
  assert.equal(status.settings.generateStudyMaterials,false);
  assert.equal(status.settings.autoEvolve,false);
  assert.equal(status.modelInferenceConcurrency,1);
  assert.equal(status.questionCapacity,20000);
  assert.equal(status.maxQuestionsStored,20000);
  const audit=await (await fetch(`${base}/api/ollama/audit`)).json();assert.equal(audit.invalid,0);assert.equal(audit.duplicates,0);

  // Pasaj listesi uç noktası
  const passages=await (await fetch(`${base}/api/ollama/passages?unitId=0-0`)).json();
  assert.ok(passages.passages.length>=20,'0-0 ünitesi kitaptan onlarca pasaj içermeli');

  // Üretim akışı deterministik olsun diye ünite özeti pasajlarına geç (mock kanıtları özet metne ait).
  const modeRes=await fetch(`${base}/api/ollama/config`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({passageMode:'summary-only'})});
  assert.equal(modeRes.status,200);
  assert.equal((await modeRes.json()).settings.passageMode,'summary-only');

  // İki seçenek aynı kelimeleri içerip örtüşüyorsa hakeme bile gitmeden reddedilmeli
  overlapOptions=true;
  let overlapRes=await post();
  assert.equal(overlapRes.status,502);
  assert.match((await overlapRes.json()).error,/aşırı örtüşüyor|çift doğru/);
  overlapOptions=false;

  // Çift doğru cevap riski algılandığında hakem kesin reddetmeli!
  dualAnswerRisk=true;
  let dualRes=await post();
  assert.equal(dualRes.status,502);
  assert.match((await dualRes.json()).error,/ikinci bir doğru|dualAnswerRisk|tekil/);
  dualAnswerRisk=false;

  // Yasaklı çeldirici ("Yukarıdakilerin hepsi") hakemlere bile gitmeden reddedilmeli
  sendBannedOption=true;
  let bannedRes=await post();
  assert.equal(bannedRes.status,502);
  assert.match((await bannedRes.json()).error,/kalitesiz ifade/);
  sendBannedOption=false;

  // think:false desteklemeyen modelde otomatik fallback ile sorunsuz devam etmeli
  assert.equal(rejectThinkOnce,false,'think:false 400 yanıtı sonrası fallback tetiklenmiş olmalı');

  mismatch=true;let response=await post();assert.equal(response.status,502);
  assert.match((await response.json()).error,/birleşmedi/);
  assert.equal((await (await fetch(`${base}/api/ollama/questions`)).json()).items.length,0);
  mismatch=false;response=await post();assert.equal(response.status,200);const result=await response.json();assert.equal(result.item.status,'approved');assert.equal(result.item.verification.answer,result.item.answer);
  assert.equal(result.item.difficulty,'kolay');assert.equal(result.item.verification.difficulty,'kolay');
  assert.equal(result.item.verification.judges.length,2);
  for(const j of result.item.verification.judges){assert.equal(j.answer,'Planlama ve tekrar');assert.equal(j.difficulty,'kolay');assert.ok(j.reason);assert.ok(j.qualityScore>=1)}
  assert.ok(calls.some(c=>c.prompt.includes('SORU:')));
  assert.ok(!calls.some(c=>c.prompt.includes('Egzersiz düzenli ve planlı etkinliktir.')));

  response=await post();assert.equal(response.status,502);assert.match((await response.json()).error,/zaten kayıtlı|benzer/);
  let selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({model:'fake:2'})});assert.equal(selected.status,200);assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).model,'fake:2');
  selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({model:'not-installed'})});assert.equal(selected.status,400);
  selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.invalid'},body:JSON.stringify({model:'fake:1'})});assert.equal(selected.status,403);
  selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({model:'fake:2',role:'nope'})});assert.equal(selected.status,400);

  const afterSave=await (await fetch(`${base}/api/ollama/status`)).json();assert.equal(afterSave.approved,1);assert.equal(afterSave.rejected,0);
  assert.ok(afterSave.telemetry.tokensPerSecond>0,'token/sn telemetrisi ölçülmüş olmalı');
  assert.equal(afterSave.autoRunning,true);
  let stopped=await fetch(`${base}/api/ollama/stop`,{method:'POST',headers:{Origin:base}});assert.equal(stopped.status,200);assert.equal((await stopped.json()).autoRunning,false);
  let started=await fetch(`${base}/api/ollama/start`,{method:'POST',headers:{Origin:base}});assert.equal(started.status,200);assert.equal((await started.json()).autoRunning,true);

  const savedId=result.item.id;
  let reviewed=await fetch(`${base}/api/ollama/review`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({id:savedId,status:'rejected'})});
  assert.equal(reviewed.status,200);assert.equal((await reviewed.json()).item.status,'rejected');
  assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).rejected,1);

  const post01=()=>fetch(`${base}/api/ollama/generate`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({units:['0-1']})});
  // Akıllı zorluk dengesi: 0-1 ünitesine 3 "zor" soru yerleştir, böylece zor kademesi doyar
  // ve hedef "kolay" iken hakemlerin ortak "zor" kararı reddedilir.
  writeFileSync(join(dir,'questions.json'),JSON.stringify([
   {id:'seed-a',unitId:'0-1',status:'approved',difficulty:'zor',question:'Antrenman günlüğü tutmanın temel yararı nedir?',options:['Yüklenme ve toparlanmayı izleyerek programı ayarlamak','Antrenmanı tamamen rastgele planlamak','Yalnızca yarışma gününü kaydetmek','Sporcu sayısını artırmak'],answer:'Yüklenme ve toparlanmayı izleyerek programı ayarlamak',explanation:'Günlük, yüklenme ile toparlanmayı izlemeyi sağlar.',evidence:'Kondisyonel hazırlık kuvvet, dayanıklılık ve sürat gibi özellikleri',topic:'Antrenman izleme',createdAt:new Date().toISOString()},
   {id:'seed-b',unitId:'0-1',status:'approved',difficulty:'zor',question:'Toparlanma süresi antrenman planında nasıl konumlandırılmalıdır?',options:['Program içine düzenli dinlenme günleri serpiştirilerek','Her antrenmandan sonra belirsiz bırakılarak','Yalnızca sakatlık halinde eklenerek','Sezon sonunda toplu olarak verilerek'],answer:'Program içine düzenli dinlenme günleri serpiştirilerek',explanation:'Toparlanma planın parçası olmalıdır.',evidence:'Kondisyonel hazırlık kuvvet, dayanıklılık ve sürat gibi özellikleri',topic:'Toparlanma',createdAt:new Date().toISOString()},
   {id:'seed-c',unitId:'0-1',status:'approved',difficulty:'zor',question:'Branşa özgü teknik çalışma hangi dönemde yoğunlaştırılmalıdır?',options:['Hazırlık döneminden yarışma dönemine kademeli artırılarak','Yalnızca sezon başında bir kez yapılarak','Yarışma günü sabahı başlatılarak','Antrenman takvimi dışında bırakılarak'],answer:'Hazırlık döneminden yarışma dönemine kademeli artırılarak',explanation:'Teknik çalışma dönemsel olarak kademeli artar.',evidence:'Kondisyonel hazırlık kuvvet, dayanıklılık ve sürat gibi özellikleri',topic:'Teknik çalışma',createdAt:new Date().toISOString()}
  ]));
  wrongDifficulty=true;let mismatchResponse=await post01();assert.equal(mismatchResponse.status,502);assert.match((await mismatchResponse.json()).error,/hedef zorluk/);
  wrongDifficulty=false;let okResponse=await post01();assert.equal(okResponse.status,200);const item01=(await okResponse.json()).item;assert.equal(item01.difficulty,'kolay');

  let roleSel=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({model:'fake:1',role:'verifier'})});
  assert.equal(roleSel.status,200);
  roleSel=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({model:'fake:2',role:'judge2'})});
  assert.equal(roleSel.status,200);
  const statusAfterRoles=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(statusAfterRoles.verifierModel,'fake:1');assert.equal(statusAfterRoles.judge2Model,'fake:2');

  const post02=()=>fetch(`${base}/api/ollama/generate`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({units:['0-2']})});
  judge2DisagreesAnswer=true;judge2Difficulty='kolay';
  let disagreeResponse=await post02();assert.equal(disagreeResponse.status,502);
  assert.match((await disagreeResponse.json()).error,/birleşmedi/);

  judge2DisagreesAnswer=false;judge2Difficulty='orta';
  let difficultySplit=await post02();assert.equal(difficultySplit.status,502);
  assert.match((await difficultySplit.json()).error,/görüş birliğine varamadı/);

  judge2DisagreesAnswer=false;judge2Difficulty='kolay';
  let agreedOk=await post02();assert.equal(agreedOk.status,200);
  const item02=(await agreedOk.json()).item;assert.equal(item02.difficulty,'kolay');
  assert.deepEqual(item02.verification.judges.map(j=>j.difficulty),['kolay','kolay']);
  assert.deepEqual(item02.verification.judges.map(j=>j.model).sort(),['fake:1','fake:2']);

  // Sayısal düşündürücü çeldiriciler ("20 dakika" vs "30 dakika") ASLA yanlışlıkla elenmemeli!
  // 0-0'da ilk soru kolay idi, sonraki 0-0 sorusu orta zorluk hedefleyecek; mock orta döndürsün
  numericOptions=true;
  const oldCallsLen=calls.length;
  const resNum=await fetch(`${base}/api/ollama/config`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({smartDifficulty:true})});
  assert.equal(resNum.status,200);
  let numericRes=await post();
  const numericBody=await numericRes.json();
  assert.equal(numericRes.status,200,JSON.stringify(numericBody));
  assert.ok(calls.length>oldCallsLen);
  numericOptions=false;

  // Gelişmiş /config preset ve /create-specialist testleri
  const cfgRes=await fetch(`${base}/api/ollama/config`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({preset:'turbo'})});
  assert.equal(cfgRes.status,200);
  const cfgData=(await cfgRes.json()).settings;
  assert.equal(cfgData.batchPerCall,1);assert.equal(cfgData.preset,'balanced');
  assert.equal(cfgData.selfCorrection,true);assert.equal(cfgData.smartDifficulty,true);
  assert.equal(cfgData.passageMode,'full-book');assert.equal(cfgData.fastThink,true);

  const specRes=await fetch(`${base}/api/ollama/create-specialist`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({role:'generator',baseModel:'fake:1',name:'tempo-ogretmen:latest'})});
  assert.equal(specRes.status,200);
  assert.ok(createdModels.includes('tempo-ogretmen:latest'));

  const evolverSel=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({model:'fake:2',role:'evolver'})});
  assert.equal(evolverSel.status,200);
  assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).evolverModel,'fake:2');

  // Çalışma materyalleri (Kart + Eşleştirme + Tekrar) üretimi ve listesi
  const studyGen=await fetch(`${base}/api/ollama/generate-study`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({unitId:'0-0'})});
  assert.equal(studyGen.status,200);
  assert.equal((await studyGen.json()).added,3);
  const studyMat=await (await fetch(`${base}/api/ollama/study-materials`)).json();
  assert.equal(studyMat.flashcards.length,1);
  assert.equal(studyMat.matchings.length,1);
  assert.equal(studyMat.drills.length,1);

  // Öğrenci profil sinyali + izole AI öz-evrim + geri alma
  const stRes=await fetch(`${base}/api/ollama/student-state`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({readUnits:['0-0','0-1'],weakUnits:['0-1']})});
  assert.equal(stRes.status,200);
  const evRes=await fetch(`${base}/api/ollama/evolve`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'});
  assert.equal(evRes.status,200);
  const evData=await evRes.json();
  assert.equal(evData.accepted,true);
  assert.equal(evData.policy.version,2);
  const rbRes=await fetch(`${base}/api/ollama/rollback-evolution`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'});
  assert.equal(rbRes.status,200);
  const rbJson=await rbRes.json();
  assert.equal(rbJson.policy.source,'rollback');
  assert.equal(rbJson.policy.customRuleCode,'');

  // Timeout ayarı: varsayılan 180000ms, 1000-300000 aralığında ayarlanabilir
  const statusWithTimeout=await (await fetch(`${base}/api/ollama/status`)).json();assert.equal(statusWithTimeout.autoTimeoutMs,180000);
  let timeoutRes=await fetch(`${base}/api/ollama/timeout`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:8000})});
  assert.equal(timeoutRes.status,200);assert.equal((await timeoutRes.json()).autoTimeoutMs,8000);
  assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).autoTimeoutMs,8000);
  timeoutRes=await fetch(`${base}/api/ollama/timeout`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:500})});
  assert.equal(timeoutRes.status,400);

 }finally{await close(app);await close(fake);await rm(dir,{recursive:true,force:true})}
});
