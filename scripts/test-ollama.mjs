import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));

test('soru üretimi: kör denetim, hata ve tekrar kontrolleri',async()=>{
 let calls=[], mismatch=false, wrongDifficulty=false, judge3Disagrees=false, judge3Difficulty='kolay';
 const fake=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fake:1'},{name:'fake:2'},{name:'fake:3'}]}));
  let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);calls.push(data);
  // 0-1 ünitesi, 1 kolay/1 orta/1 zor sıralı üretimdeki "bağımsız denetçiler, hedeflenen zorlukla
  // eşleşmeyen bir sonuç verirse soru kaydedilmez" davranışını test etmek için ayrı bir metin kullanır
  // (0-0 ile aynı soru metnini kullanırsa global "aynı soru" kontrolüne takılırdı).
  const isUnit01=data.prompt.includes('Antrenmanı oluşturan ögeler');
  // 0-2 ünitesi, ÜÇ bağımsız denetçinin birbirinden FARKLI modeller olarak ayrı ayrı çağrıldığını ve
  // (a) cevapta tam birleşme şart, (b) zorlukta yalnız çoğunluk (2/3) yeterli davranışlarını test eder.
  const isUnit02=data.prompt.includes('Bireyselleştirme, süreklilik');
  let evidence='Egzersiz planlı ve tekrarlıdır';
  if(isUnit01)evidence='Kondisyonel hazırlık kuvvet, dayanıklılık ve sürat gibi özellikleri';
  if(isUnit02)evidence='Bireyselleştirme, süreklilik, çeşitlilik ve branşa özgülük temel ilkelerdir';
  let result;
  if(data.prompt.includes('soru denetçisisin')){
   if(isUnit01)result={answer:'Kondisyonel ve teknik hazırlık',singleCorrect:true,supported:true,qualityOk:true,difficulty:wrongDifficulty?'zor':'kolay',evidence,reason:'Anlatım kondisyonel ve teknik hazırlığı birlikte sayar.'};
   else if(isUnit02){
    // fake:3 (judge3), judge3Disagrees açıkken FARKLI bir cevap verir; aksi hâlde yalnızca
    // zorlukta ayrışır (judge3Difficulty), cevapta her zaman hemfikirdir.
    const disagreeingAnswer=(data.model==='fake:3'&&judge3Disagrees)?'İlke yok':'Bireysel ve sürekli ilkeler';
    const thisDifficulty=data.model==='fake:3'?judge3Difficulty:'kolay';
    result={answer:disagreeingAnswer,singleCorrect:true,supported:true,qualityOk:true,difficulty:thisDifficulty,evidence,reason:`${data.model} bağımsız değerlendirmesi.`};
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
  // Judge2/Judge3 açıkça seçilmediyse denetçiyle (verifierModel) aynı modele düşer; tek model kurulu
  // bilgisayarlarda da sistemin çalışabilmesi için.
  assert.equal(status.verifierModel,'fake:1');assert.equal(status.judge2Model,'fake:1');assert.equal(status.judge3Model,'fake:1');
  assert.equal(status.judge2Installed,true);assert.equal(status.judge3Installed,true);
  const audit=await (await fetch(`${base}/api/ollama/audit`)).json();assert.equal(audit.invalid,0);assert.equal(audit.duplicates,0);
  mismatch=true;let response=await post();assert.equal(response.status,502);
  // Üç bağımsız denetçi de (aynı sahte sunucu olduğu için) AYNI yanlış cevapta hemfikir olur; bu da
  // "aynı doğru cevapta birleşmedi" (üreticinin cevabından farklı) hatasını tetikler.
  assert.match((await response.json()).error,/birleşmedi/);
  assert.equal((await (await fetch(`${base}/api/ollama/questions`)).json()).items.length,0);
  mismatch=false;response=await post();assert.equal(response.status,200);const result=await response.json();assert.equal(result.item.status,'approved');assert.equal(result.item.verification.answer,result.item.answer);
  // Bu ünite için havuzda henüz zorluk etiketli soru yokken ilk soru her zaman "kolay" hedeflenir;
  // ÜÇ bağımsız denetçinin çoğunlukla onayladığı zorluk, kaydedilen soruya da aynen yansır.
  assert.equal(result.item.difficulty,'kolay');assert.equal(result.item.verification.difficulty,'kolay');
  // Her biri ayrı bir "yapay zekâ" rolünü temsil eden üç bağımsız denetçinin kararı da ayrı ayrı saklanır.
  assert.equal(result.item.verification.judges.length,3);
  for(const j of result.item.verification.judges){assert.equal(j.answer,'Planlama ve tekrar');assert.equal(j.difficulty,'kolay');assert.ok(j.reason)}
  // Her başarılı denemede: 1 üretim + 3 PARALEL bağımsız denetim = 4 model çağrısı.
  assert.equal(calls.length,8);// mismatch denemesi (4) + başarılı deneme (4)
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

  // 0-2 ünitesi: judge2 ve judge3'ü AYRI AYRI farklı (gerçekten farklı model adlarına sahip) modeller
  // olarak seç, böylece "üç bağımsız AI" gerçekten üç farklı model geçişiyle test edilmiş olur.
  let roleSel=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({model:'fake:1',role:'verifier'})});
  assert.equal(roleSel.status,200);
  roleSel=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({model:'fake:2',role:'judge2'})});
  assert.equal(roleSel.status,200);
  roleSel=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({model:'fake:3',role:'judge3'})});
  assert.equal(roleSel.status,200);
  const statusAfterRoles=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(statusAfterRoles.verifierModel,'fake:1');assert.equal(statusAfterRoles.judge2Model,'fake:2');assert.equal(statusAfterRoles.judge3Model,'fake:3');

  const post02=()=>fetch(`${base}/api/ollama/generate`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({units:['0-2']})});
  // Cevapta TAM birleşme şart: judge3 farklı bir CEVAP verirse (zorluk ne olursa olsun) soru
  // reddedilir, çünkü doğruluk konusunda çoğunluk değil oy birliği aranır. Bu denemeyi İLK önce
  // yapıyoruz çünkü başarısız olduğu için havuza hiçbir şey kaydetmez; aksi hâlde ikinci denemede
  // aynı (sabit) soru metni "zaten kayıtlı" kontrolüne takılırdı.
  judge3Difficulty='kolay';judge3Disagrees=true;
  let disagreeResponse=await post02();assert.equal(disagreeResponse.status,502);
  assert.match((await disagreeResponse.json()).error,/birleşmedi/);

  // Zorlukta çoğunluk yeterli: judge3 farklı bir zorluk (orta) söylese bile diğer ikisi (kolay) ile
  // birlikte 2/3 çoğunluk "kolay"dır ve bu da hedefle eşleştiği için soru KAYDEDİLMELİ.
  judge3Difficulty='orta';judge3Disagrees=false;
  let majorityOk=await post02();assert.equal(majorityOk.status,200);
  const item02=(await majorityOk.json()).item;assert.equal(item02.difficulty,'kolay');
  assert.deepEqual(item02.verification.judges.map(j=>j.difficulty).sort(),['kolay','kolay','orta']);

  // Üretim hızı ayarı: varsayılan 5000ms, API ile 1000-120000 arasına ayarlanabilir, dışı reddedilir.
  const statusWithTimeout=await (await fetch(`${base}/api/ollama/status`)).json();assert.equal(statusWithTimeout.autoTimeoutMs,5000);
  let timeoutRes=await fetch(`${base}/api/ollama/timeout`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:8000})});
  assert.equal(timeoutRes.status,200);assert.equal((await timeoutRes.json()).autoTimeoutMs,8000);
  assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).autoTimeoutMs,8000);
  timeoutRes=await fetch(`${base}/api/ollama/timeout`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:500})});
  assert.equal(timeoutRes.status,400);

 }finally{await close(app);await close(fake);await rm(dir,{recursive:true,force:true})}
});
