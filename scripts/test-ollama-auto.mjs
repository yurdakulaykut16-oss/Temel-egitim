// Bu dosya, server/ollama.mjs içindeki PARALEL "kendi kendine üretim" havuzunu test eder:
// birden fazla ünitenin GERÇEKTEN aynı anda üretildiğini, eşzamanlılık ayarının API ile
// değiştirilebildiğini ve /stop çağrısının tüm paralel üretimleri durdurduğunu doğrular.
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

test('otomatik havuz: birden fazla ünite gerçekten paralel üretilir ve eşzamanlılık ayarlanabilir',async()=>{
 let inFlight=0, peak=0, calls=0;
 // Sahte Ollama: hangi ünite/soru için çağrıldığını anlatım metninden okuyup, gerçek üretici gibi
 // davranır. Her iki aşamada da (üretici/denetçi) aynı "kanıt" ve "cevap" kuralını kullanarak
 // gerçek doğrulama mantığının (validate/check eşleşmesi) geçmesini sağlar.
 const fake=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fake:1'}]}));
  inFlight++;peak=Math.max(peak,inFlight);
  let raw='';for await(const chunk of req)raw+=chunk;
  calls++;
  // Gerçekçi bir yük süresi simüle et: zamanlayıcı her 250ms'de bir yeni yuva açtığı için,
  // tek bir model çağrısının bundan belirgin biçimde daha uzun sürmesi gerekir; yoksa her ünite
  // bir sonraki yuva açılmadan biter ve paralellik hiç gözlemlenemez.
  await sleep(300);
  const data=JSON.parse(raw);
  const prompt=data.prompt;
  const isVerify=prompt.includes('soru denetçisisin');
  const textMatch=isVerify?prompt.match(/KONU ANLATIMI: ([\s\S]*?)\nSORU:/):prompt.match(/KONU ANLATIMI: ([\s\S]*)$/);
  const text=textMatch?textMatch[1]:'';
  const evidence=text.trim().split(/\s+/).slice(0,6).join(' ')||'yeterince uzun bir kanit metni';
  let result;
  if(isVerify){
   result={answer:'Doğru seçenek',singleCorrect:true,supported:true,qualityOk:true,evidence,reason:'Anlatımda bu bilgi doğrudan geçer.'};
  }else{
   result={question:`Otomatik test sorusu #${calls}-${Math.random().toString(36).slice(2)}`,options:['Doğru seçenek','Çeldirici A','Çeldirici B','Çeldirici C'],answer:'Doğru seçenek',explanation:'Açıklama metni yeterince uzun bir şekilde yazılmıştır.',evidence,topic:'Test konu'};
  }
  res.end(JSON.stringify({response:JSON.stringify(result)}));
  inFlight--;
 });
 const fakePort=await listen(fake);const dir=await mkdtemp(join(tmpdir(),'tempo-test-auto-'));
 process.env.OLLAMA_BASE_URL=`http://127.0.0.1:${fakePort}`;process.env.OLLAMA_MODEL='fake:1';process.env.OLLAMA_VERIFIER_MODEL='fake:1';process.env.TEMPO_DATA_DIR=dir;
 delete process.env.TEMPO_DISABLE_AUTOLOOP; // bu testte döngü KASITLI OLARAK açık
 const {ollamaPlugin}=await import('../server/ollama.mjs');let middleware;
 ollamaPlugin().configureServer({middlewares:{use(_path,handler){middleware=handler}}});
 const app=http.createServer((req,res)=>{req.url=req.url.replace(/^\/api\/ollama/,'');middleware(req,res,()=>{res.statusCode=404;res.end()})});const port=await listen(app);const base=`http://127.0.0.1:${port}`;
 try{
  // Varsayılan: autoRunning açık, varsayılan eşzamanlılık 3.
  let status=await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoRunning,true);
  assert.equal(status.autoConcurrency,3);

  // Havuz gerçekten dolana ve birkaç soru onaylanana kadar bekle.
  let approved=0;
  for(let i=0;i<60 && approved<4;i++){await sleep(100);status=await (await fetch(`${base}/api/ollama/status`)).json();approved=status.approved}
  assert.ok(approved>=4,`en az 4 soru onaylanmalıydı, görülen: ${approved}`);
  // Gerçek paralellik: sahte sunucuya aynı anda birden fazla istek ulaşmış olmalı.
  assert.ok(peak>=2,`eşzamanlı istek sayısı en az 2 olmalıydı, görülen tepe: ${peak}`);
  assert.ok(status.autoActive>=1);
  assert.ok(Array.isArray(status.autoPhases));

  // Üretilen sorular birden fazla farklı üniteye ait olmalı (tek bir üniteye takılı kalınmamalı).
  const questions=await (await fetch(`${base}/api/ollama/questions`)).json();
  const units=new Set(questions.items.map(x=>x.unitId));
  assert.ok(units.size>=2,`en az 2 farklı ünite üretilmeliydi, görülen: ${units.size}`);
  assert.ok(questions.items.every(x=>x.status==='approved'));

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

 }finally{await close(app);await close(fake);await rm(dir,{recursive:true,force:true})}
 // autoScheduler() kasıtlı olarak sonsuz döngüdür (gerçek sunucuda hep çalışmalı) ve kendine ait
 // bir iptal mekanizması yoktur; testten sonra süreç bu yüzden kendiliğinden kapanmaz. Üstteki
 // doğrulamalar ve temizlik bittiğine göre süreci burada kasıtlı olarak sonlandırıyoruz.
 process.exit(0);
});
