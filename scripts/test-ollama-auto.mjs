// Bu dosya, server/ollama.mjs içindeki PARALEL "kendi kendine üretim" havuzunu test eder:
// birden fazla ünitenin GERÇEKTEN aynı anda üretildiğini, eşzamanlılık ayarının API ile
// değiştirilebildiğini, her ünite için zorluğun kolay→orta→zor sırayla ilerlediğini ve /stop
// çağrısının tüm paralel üretimleri durdurduğunu doğrular.
// node --test her dosyayı ayrı bir süreçte çalıştırdığı için, scripts/test-ollama.mjs
// dosyasındaki modül durumundan (busy/cursor vb.) bağımsızdır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('otomatik havuz: paralel üretim, zorluk sıralaması ve eşzamanlılık ayarı',async()=>{
 // autoScheduler() kasıtlı olarak sonsuz döngüdür (gerçek sunucuda hep çalışmalı) ve kendine ait
 // bir iptal mekanizması yoktur. Bir assertion BAŞARISIZ OLURSA BİLE döngü arka planda çalışmaya
 // devam eder ve sahte Ollama sunucusuna sürekli yeni istekler açar; bu da server.close()'un asla
 // bitmemesine (süreç sonsuza dek asılı kalmasına) yol açar. Bu yüzden ne olursa olsun — başarı ya
 // da assertion hatası — EN SONDA mutlaka (1) /stop ile döngüyü durdur, (2) sunucuları kapat,
 // (3) geçici klasörü sil, (4) süreci açıkça sonlandır (process.exit) sırasını izliyoruz.
 let app, fake, dir, base;
 let failure=null;
 try{
  let inFlight=0, peak=0, calls=0;
  // unit -> hedeflenen zorluğu bağımsızca onaylayan sahte denetçi: generateAndVerify, denetçiye
  // hedefi SÖYLEMEZ (gerçek bağımsızlık için), bu yüzden sahte sunucu hedefi üretici isteminden
  // (KOLAY/ORTA/ZOR ipucu metninden) okuyup, aynı soru metni geldiğinde denetim adımında aynı
  // zorluğu "bağımsızca da öyle buldum" diyerek onaylar — gerçek bir denetçinin bu örnekte hep
  // doğru tahmin ettiği basitleştirilmiş ama tutarlı bir model.
  const difficultyByQuestion=new Map();
  fake=http.createServer(async(req,res)=>{
   res.setHeader('Content-Type','application/json');
   if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fake:1'}]}));
   inFlight++;peak=Math.max(peak,inFlight);
   let raw='';for await(const chunk of req)raw+=chunk;
   calls++;
   // Gerçekçi bir yük süresi simüle et: zamanlayıcı her 250ms'de bir yeni yuva açtığı için, tek bir
   // model çağrısının bundan belirgin biçimde daha uzun sürmesi gerekir; yoksa paralellik hiç
   // gözlemlenemez. Yine de varsayılan 5000ms üretim bütçesinin çok altında kalmalı.
   await sleep(300);
   const data=JSON.parse(raw);
   const prompt=data.prompt;
   const isVerify=prompt.includes('soru denetçisisin');
   let result;
   if(isVerify){
    const qMatch=prompt.match(/SORU: ([\s\S]*?)\nSEÇENEKLER:/);
    const question=qMatch?qMatch[1].trim():'';
    const difficulty=difficultyByQuestion.get(question)||'kolay';
    const textMatch=prompt.match(/KONU ANLATIMI: ([\s\S]*?)\nSORU:/);
    const text=textMatch?textMatch[1]:'';
    const evidence=text.trim().split(/\s+/).slice(0,6).join(' ')||'yeterince uzun bir kanit metni';
    result={answer:'Doğru seçenek',singleCorrect:true,supported:true,qualityOk:true,difficulty,evidence,reason:'Anlatımda bu bilgi doğrudan geçer.'};
   }else{
    const difficultyMatch=prompt.match(/tam olarak şöyle olmalı: (KOLAY|ORTA|ZOR):/);
    const difficulty=difficultyMatch?difficultyMatch[1].toLocaleLowerCase('tr-TR'):'kolay';
    const textMatch=prompt.match(/KONU ANLATIMI: ([\s\S]*)$/);
    const text=textMatch?textMatch[1]:'';
    const evidence=text.trim().split(/\s+/).slice(0,6).join(' ')||'yeterince uzun bir kanit metni';
    const question=`Otomatik test sorusu #${calls}-${Math.random().toString(36).slice(2)}`;
    difficultyByQuestion.set(question,difficulty);
    result={question,options:['Doğru seçenek','Çeldirici A','Çeldirici B','Çeldirici C'],answer:'Doğru seçenek',explanation:'Açıklama metni yeterince uzun bir şekilde yazılmıştır.',evidence,topic:'Test konu'};
   }
   res.end(JSON.stringify({response:JSON.stringify(result)}));
   inFlight--;
  });
  const fakePort=await listen(fake);dir=await mkdtemp(join(tmpdir(),'tempo-test-auto-'));
  process.env.OLLAMA_BASE_URL=`http://127.0.0.1:${fakePort}`;process.env.OLLAMA_MODEL='fake:1';process.env.OLLAMA_VERIFIER_MODEL='fake:1';process.env.TEMPO_DATA_DIR=dir;
  // Varsayılan judge2 modeli (gemma3:12b) bu sahte ortamda kurulu değildir; autoScheduler'ın
  // gerçekten yuva açabilmesi için burada açıkça kurulu bir modele sabitliyoruz (gerçek kullanımda
  // kullanıcı bu ortam değişkenini ayarlamazsa sistem, ikinci hakem indirilene kadar bekler).
  process.env.OLLAMA_JUDGE2_MODEL='fake:1';
  delete process.env.TEMPO_DISABLE_AUTOLOOP; // bu testte döngü KASITLI OLARAK açık
  const {ollamaPlugin}=await import('../server/ollama.mjs');let middleware;
  ollamaPlugin().configureServer({middlewares:{use(_path,handler){middleware=handler}}});
  app=http.createServer((req,res)=>{req.url=req.url.replace(/^\/api\/ollama/,'');middleware(req,res,()=>{res.statusCode=404;res.end()})});
  const port=await listen(app);base=`http://127.0.0.1:${port}`;

  // Varsayılan: autoRunning açık, varsayılan eşzamanlılık 3, azami üretim süresi 5000ms.
  let status=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoRunning,true);
  assert.equal(status.autoConcurrency,3);
  assert.equal(status.autoTimeoutMs,5000);
  // Judge2 ayrıca seçilmediyse denetçiyle (ve tek kurulu modelle) aynı ada düşer; böylece tek model
  // kurulu bir makinede de iki bağımsız çağrı (aynı modelle de olsa) yapılabilir.
  assert.equal(status.verifierModel,'fake:1');assert.equal(status.judge2Model,'fake:1');
  assert.equal(status.judge2Installed,true);

  // Havuz gerçekten dolana ve birkaç soru onaylanana kadar bekle.
  let approved=0;
  for(let i=0;i<80 && approved<6;i++){await sleep(100);status=await (await fetch(`${base}/api/ollama/status`)).json();approved=status.approved}
  assert.ok(approved>=6,`en az 6 soru onaylanmalıydı, görülen: ${approved}`);
  // Gerçek paralellik: sahte sunucuya aynı anda birden fazla istek ulaşmış olmalı.
  assert.ok(peak>=2,`eşzamanlı istek sayısı en az 2 olmalıydı, görülen tepe: ${peak}`);
  assert.ok(status.autoActive>=1);
  assert.ok(Array.isArray(status.autoPhases));

  // Üretilen sorular birden fazla farklı üniteye ait olmalı (tek bir üniteye takılı kalınmamalı).
  const questions=await (await fetch(`${base}/api/ollama/questions`)).json();
  const units=new Set(questions.items.map(x=>x.unitId));
  assert.ok(units.size>=2,`en az 2 farklı ünite üretilmeliydi, görülen: ${units.size}`);
  assert.ok(questions.items.every(x=>x.status==='approved'));
  assert.ok(questions.items.every(x=>['kolay','orta','zor'].includes(x.difficulty)),'her soru bir zorluk etiketi taşımalı');
  // Her soru, İKİ bağımsız denetçinin kendi (model, cevap, zorluk, gerekçe) kararını ayrı ayrı
  // saklamalı — konsensüs tek bir yargıya indirgenip gizlenmemeli.
  assert.ok(questions.items.every(x=>Array.isArray(x.verification?.judges)&&x.verification.judges.length===2),'her sorunun iki bağımsız denetçi kararı olmalı');
  assert.ok(questions.items.every(x=>x.verification.judges.every(j=>typeof j.model==='string'&&typeof j.answer==='string'&&['kolay','orta','zor'].includes(j.difficulty)&&typeof j.reason==='string')));

  // Zorluk sıralaması: her ünitenin kendi sorularını oluşturulma sırasına (createdAt) göre
  // dizdiğimizde kolay→orta→zor→kolay... kalıbını izlemesi gerekir.
  const byUnit={};
  for(const q of questions.items){(byUnit[q.unitId]=byUnit[q.unitId]||[]).push(q)}
  for(const unitId in byUnit){
   const ordered=byUnit[unitId].slice().sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
   const expected=['kolay','orta','zor'];
   ordered.forEach((q,i)=>{assert.equal(q.difficulty,expected[i%3],`${unitId} ünitesinde ${i+1}. soru ${expected[i%3]} olmalıydı, bulunan: ${q.difficulty}`)});
  }

  // Eşzamanlılığı 1'e düşür ve havuzun gerçekten bu sınıra uyduğunu doğrula.
  let changed=await fetch(`${base}/api/ollama/concurrency`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:1})});
  assert.equal(changed.status,200);assert.equal((await changed.json()).autoConcurrency,1);
  await sleep(600);
  status=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoConcurrency,1);
  assert.ok(status.autoActive<=1,`autoActive 1'i geçmemeliydi, görülen: ${status.autoActive}`);

  // Geçersiz eşzamanlılık değerleri reddedilmeli.
  let bad=await fetch(`${base}/api/ollama/concurrency`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:0})});
  assert.equal(bad.status,400);
  bad=await fetch(`${base}/api/ollama/concurrency`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({value:1000})});
  assert.equal(bad.status,400);

  // /stop tüm paralel üretimleri durdurmalı: durdurduktan kısa süre sonra aktif sayısı 0 olmalı
  // ve onaylanan soru sayısı artık büyümemeli.
  const stopped=await fetch(`${base}/api/ollama/stop`,{method:'POST',headers:{Origin:base}});
  assert.equal(stopped.status,200);
  await sleep(300);
  status=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoRunning,false);
  assert.equal(status.autoActive,0);
  const countAfterStop=status.approved;
  await sleep(500);
  const statusLater=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(statusLater.approved,countAfterStop,'durdurulduktan sonra yeni soru üretilmemeli');

 }catch(e){failure=e}
 // Assertion'lardan HANGİSİ başarısız olursa olsun (ya da hiçbiri olmasa bile), döngüyü kesinlikle
 // durdur — aksi hâlde sahte sunucuya sonsuza dek istek gitmeye devam eder ve server.close() asla
 // bitmez. base henüz tanımlanmadıysa (çok erken bir hata) bu adım zaten atlanır.
 if(base){try{await fetch(`${base}/api/ollama/stop`,{method:'POST',headers:{Origin:base}})}catch{}}
 if(app)try{await close(app)}catch{}
 if(fake)try{await close(fake)}catch{}
 if(dir)try{await rm(dir,{recursive:true,force:true})}catch{}
 if(failure){console.error(failure);process.exit(1)}
 process.exit(0);
});
