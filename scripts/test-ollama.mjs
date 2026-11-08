import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));

test('soru üretimi: kör denetim, hata ve tekrar kontrolleri',async()=>{
 let calls=[], mismatch=false, wrongDifficulty=false, judge2DisagreesAnswer=false, judge2Difficulty='kolay';
 const fake=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fake:1'},{name:'fake:2'}]}));
  let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);calls.push(data);
  // 0-1 ünitesi, 1 kolay/1 orta/1 zor sıralı üretimdeki "bağımsız denetçiler, hedeflenen zorlukla
  // eşleşmeyen bir sonuç verirse soru kaydedilmez" davranışını test etmek için ayrı bir metin kullanır
  // (0-0 ile aynı soru metnini kullanırsa global "aynı soru" kontrolüne takılırdı).
  const isUnit01=data.prompt.includes('Antrenmanı oluşturan ögeler');
  // 0-2 ünitesi, İKİ bağımsız denetçinin (verifier=fake:1, judge2=fake:2) birbirinden FARKLI
  // modeller olarak ayrı ayrı çağrıldığını ve yalnız ikisi de TAM hemfikir olursa (hem cevapta
  // hem zorlukta) sorunun kaydedildiğini test eder — iki hakemle "çoğunluk" anlamlı olmadığı için
  // tam oy birliği aranır.
  const isUnit02=data.prompt.includes('Bireyselleştirme, süreklilik');
  let evidence='Egzersiz planlı ve tekrarlıdır';
  if(isUnit01)evidence='Kondisyonel hazırlık kuvvet, dayanıklılık ve sürat gibi özellikleri';
  if(isUnit02)evidence='Bireyselleştirme, süreklilik, çeşitlilik ve branşa özgülük temel ilkelerdir';
  let result;
  if(data.prompt.includes('soru denetçisisin')){
   if(isUnit01)result={answer:'Kondisyonel ve teknik hazırlık',singleCorrect:true,supported:true,qualityOk:true,difficulty:wrongDifficulty?'zor':'kolay',evidence,reason:'Anlatım kondisyonel ve teknik hazırlığı birlikte sayar.'};
   else if(isUnit02){
    // fake:1 (verifier) her zaman sabit kalır; fake:2 (judge2) bayraklara göre ayrışabilir.
    const isJudge2=data.model==='fake:2';
    const answer=(isJudge2&&judge2DisagreesAnswer)?'İlke yok':'Bireysel ve sürekli ilkeler';
    const difficulty=isJudge2?judge2Difficulty:'kolay';
    result={answer,singleCorrect:true,supported:true,qualityOk:true,difficulty,evidence,reason:`${data.model} bağımsız değerlendirmesi.`};
   }
   else result={answer:mismatch?'İhmal':'Planlama ve tekrar',singleCorrect:true,supported:true,qualityOk:true,difficulty:'kolay',evidence,reason:'Anlatım egzersizin planlı ve tekrarlı olduğunu belirtir.'};
  }else{
   if(isUnit01)result={question:'Antrenmanı oluşturan ögelerden hangileri birlikte sayılır?',options:['Kondisyonel ve teknik hazırlık','İhmal','Tahkim','Bürokrasi'],answer:'Kondisyonel ve teknik hazırlık',explanation:'Kondisyonel ve teknik hazırlık birlikte sayılır.',evidence,topic:'Antrenmanın ögeleri'};
   else if(isUnit02)result={question:'Antrenman yükü planlanırken hangi temel ilkeler gözetilir?',options:['Bireysel ve sürekli ilkeler','İlke yok','Tahkim','Bürokrasi'],answer:'Bireysel ve sürekli ilkeler',explanation:'Bireyselleştirme ve süreklilik temel ilkelerdendir.',evidence,topic:'Antrenman ilkeleri'};
   else result={question:'Düzenli hareketin planlama niteliği hangi iki özellikle belirlenir?',options:['Planlama ve tekrar','İhmal','Tahkim','Bürokrasi'],answer:'Planlama ve tekrar',explanation:'Egzersiz planlı ve tekrarlıdır.',evidence,topic:'Egzersizin özellikleri'};
  }
  res.end(JSON.stringify({response:JSON.stringify(result)}));
 });
 const fakePort=await listen(fake);const dir=await mkdtemp(join(tmpdir(),'tempo-test-'));
 process.env.OLLAMA_BASE_URL=`http://127.0.0.1:${fakePort}`;process.env.OLLAMA_MODEL='fake:1';process.env.OLLAMA_VERIFIER_MODEL='fake:1';process.env.TEMPO_DATA_DIR=dir;
 process.env.TEMPO_DISABLE_AUTOLOOP='1'; // testte sunucunun kendi kendine çalışan döngüsünü kapat; determinizm için
 const {ollamaPlugin}=await import('../server/ollama.mjs');let middleware;
 ollamaPlugin().configureServer({middlewares:{use(_path,handler){middleware=handler}}});
 const app=http.createServer((req,res)=>{req.url=req.url.replace(/^\/api\/ollama/,'');middleware(req,res,()=>{res.statusCode=404;res.end()})});const port=await listen(app);const base=`http://127.0.0.1:${port}`;
 const post=()=>fetch(`${base}/api/ollama/generate`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({units:['0-0']})});
 try{
  const status=await (await fetch(`${base}/api/ollama/status`)).json();assert.equal(status.verifierInstalled,true);
  // Judge2 açıkça seçilmediyse (ve OLLAMA_JUDGE2_MODEL ortam değişkeni de ayarlanmadıysa) GERÇEK
  // bağımsızlık için denetçiden FARKLI, önceden tanımlı bir model (gemma3:12b) varsayılan olur;
  // bu test ortamında kurulu olmadığı için judge2Installed=false görünmesi beklenir — arayüz de
  // kullanıcıya bunu "kurulu değil" olarak gösterecektir.
  assert.equal(status.verifierModel,'fake:1');assert.equal(status.judge2Model,'gemma3:12b');
  assert.equal(status.judge2Installed,false);
  const audit=await (await fetch(`${base}/api/ollama/audit`)).json();assert.equal(audit.invalid,0);assert.equal(audit.duplicates,0);
  mismatch=true;let response=await post();assert.equal(response.status,502);
  // Her iki bağımsız denetçi de (aynı sahte sunucu olduğu için) AYNI yanlış cevapta hemfikir olur;
  // bu da "aynı doğru cevapta birleşmedi" (üreticinin cevabından farklı) hatasını tetikler.
  assert.match((await response.json()).error,/birleşmedi/);
  assert.equal((await (await fetch(`${base}/api/ollama/questions`)).json()).items.length,0);
  mismatch=false;response=await post();assert.equal(response.status,200);const result=await response.json();assert.equal(result.item.status,'approved');assert.equal(result.item.verification.answer,result.item.answer);
  // Bu ünite için havuzda henüz zorluk etiketli soru yokken ilk soru her zaman "kolay" hedeflenir;
  // İKİ bağımsız denetçinin de hemfikir olduğu zorluk, kaydedilen soruya da aynen yansır.
  assert.equal(result.item.difficulty,'kolay');assert.equal(result.item.verification.difficulty,'kolay');
  // Her biri ayrı bir "yapay zekâ" rolünü temsil eden iki bağımsız denetçinin kararı da ayrı ayrı saklanır.
  assert.equal(result.item.verification.judges.length,2);
  for(const j of result.item.verification.judges){assert.equal(j.answer,'Planlama ve tekrar');assert.equal(j.difficulty,'kolay');assert.ok(j.reason)}
  // Her başarılı denemede: 1 üretim + 2 PARALEL bağımsız denetim = 3 model çağrısı.
  assert.equal(calls.length,6);// mismatch denemesi (3) + başarılı deneme (3)
  assert.ok(calls.some(c=>c.prompt.includes('SORU:')));
  assert.ok(!calls.some(c=>c.prompt.includes('Egzersiz düzenli ve planlı etkinliktir.')));
  response=await post();assert.equal(response.status,502);assert.match((await response.json()).error,/zaten kayıtlı|benzer/);
  let selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({model:'fake:2'})});assert.equal(selected.status,200);assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).model,'fake:2');
  selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({model:'not-installed'})});assert.equal(selected.status,400);
  selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.invalid'},body:JSON.stringify({model:'fake:1'})});assert.equal(selected.status,403);
  selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({model:'fake:2',role:'nope'})});assert.equal(selected.status,400);

  // Yapay zekâ "öğretmen" kendi kendine onaylar: kullanıcı ayrıca onaylamadan soru havuzda approved olarak durur.
  const afterSave=await (await fetch(`${base}/api/ollama/status`)).json();assert.equal(afterSave.approved,1);assert.equal(afterSave.rejected,0);
  assert.equal(afterSave.autoRunning,true); // varsayılan: kendi kendine üretim açık
  let stopped=await fetch(`${base}/api/ollama/stop`,{method:'POST',headers:{Origin:base}});assert.equal(stopped.status,200);assert.equal((await stopped.json()).autoRunning,false);
  assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).autoRunning,false);
  let started=await fetch(`${base}/api/ollama/start`,{method:'POST',headers:{Origin:base}});assert.equal(started.status,200);assert.equal((await started.json()).autoRunning,true);
  // Kullanıcı yine de bir AI onaylı soruyu reddedebilir (veto); bu durumda 'rejected' olur.
  const savedId=result.item.id;
  let reviewed=await fetch(`${base}/api/ollama/review`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({id:savedId,status:'rejected'})});
  assert.equal(reviewed.status,200);assert.equal((await reviewed.json()).item.status,'rejected');
  assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).rejected,1);

  // Zorluk sıralaması: 0-1 ünitesi henüz hiç zorluk etiketli soru içermediği için hedef "kolay"dır.
  // Bağımsız denetçiler farklı bir zorlukta anlaşırsa (burada "zor"), soru kalıbı bozulmasın diye hiç
  // kaydedilmez; aynı istek daha sonra denetçiler "kolay" derse normal şekilde kaydedilir.
  const post01=()=>fetch(`${base}/api/ollama/generate`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({units:['0-1']})});
  wrongDifficulty=true;let mismatchResponse=await post01();assert.equal(mismatchResponse.status,502);assert.match((await mismatchResponse.json()).error,/hedef zorluk/);
  wrongDifficulty=false;let okResponse=await post01();assert.equal(okResponse.status,200);const item01=(await okResponse.json()).item;assert.equal(item01.difficulty,'kolay');

  // 0-2 ünitesi: judge2'yi AYRI bir (gerçekten farklı model adına sahip) model olarak seç, böylece
  // "iki bağımsız AI" gerçekten iki farklı model geçişiyle test edilmiş olur.
  let roleSel=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({model:'fake:1',role:'verifier'})});
  assert.equal(roleSel.status,200);
  roleSel=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({model:'fake:2',role:'judge2'})});
  assert.equal(roleSel.status,200);
  const statusAfterRoles=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(statusAfterRoles.verifierModel,'fake:1');assert.equal(statusAfterRoles.judge2Model,'fake:2');

  const post02=()=>fetch(`${base}/api/ollama/generate`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({units:['0-2']})});
  // Cevapta TAM birleşme şart: judge2 farklı bir CEVAP verirse soru reddedilir. Bu denemeyi İLK
  // önce yapıyoruz çünkü başarısız olduğu için havuza hiçbir şey kaydetmez; aksi hâlde sonraki
  // denemede aynı (sabit) soru metni "zaten kayıtlı" kontrolüne takılırdı.
  judge2DisagreesAnswer=true;judge2Difficulty='kolay';
  let disagreeResponse=await post02();assert.equal(disagreeResponse.status,502);
  assert.match((await disagreeResponse.json()).error,/birleşmedi/);

  // Cevapta hemfikir ama zorlukta değiller: iki hakemle "çoğunluk" anlamlı olmadığından (1-1 berabere),
  // zorlukta da TAM oy birliği aranır; anlaşamazlarsa soru yine kaydedilmez.
  judge2DisagreesAnswer=false;judge2Difficulty='orta';
  let difficultySplit=await post02();assert.equal(difficultySplit.status,502);
  assert.match((await difficultySplit.json()).error,/görüş birliğine varamadı/);

  // Hem cevapta hem zorlukta (ikisi de "kolay") TAM hemfikir olunca soru KAYDEDİLMELİ.
  judge2DisagreesAnswer=false;judge2Difficulty='kolay';
  let agreedOk=await post02();assert.equal(agreedOk.status,200);
  const item02=(await agreedOk.json()).item;assert.equal(item02.difficulty,'kolay');
  assert.deepEqual(item02.verification.judges.map(j=>j.difficulty),['kolay','kolay']);
  assert.deepEqual(item02.verification.judges.map(j=>j.model).sort(),['fake:1','fake:2']);

  // Üretim hızı ayarı: varsayılan 5000ms, API ile 1000-120000 arasına ayarlanabilir, dışı reddedilir.
  const statusWithTimeout=await (await fetch(`${base}/api/ollama/status`)).json();assert.equal(statusWithTimeout.autoTimeoutMs,5000);
  let timeoutRes=await fetch(`${base}/api/ollama/timeout`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:8000})});
  assert.equal(timeoutRes.status,200);assert.equal((await timeoutRes.json()).autoTimeoutMs,8000);
  assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).autoTimeoutMs,8000);
  timeoutRes=await fetch(`${base}/api/ollama/timeout`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:500})});
  assert.equal(timeoutRes.status,400);

 }finally{await close(app);await close(fake);await rm(dir,{recursive:true,force:true})}
});
