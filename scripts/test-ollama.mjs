import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));

test('soru üretimi: kör denetim, hata ve tekrar kontrolleri',async()=>{
 let calls=[], mismatch=false;
 const fake=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fake:1'},{name:'fake:2'}]}));
  let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);calls.push(data);
  const evidence='Egzersiz planlı ve tekrarlıdır';
  const result=data.prompt.includes('soru denetçisisin')?{answer:mismatch?'İhmal':'Planlama ve tekrar',singleCorrect:true,supported:true,qualityOk:true,evidence,reason:'Anlatım egzersizin planlı ve tekrarlı olduğunu belirtir.'}:
   {question:'Düzenli hareketin planlama niteliği hangi iki özellikle belirlenir?',options:['Planlama ve tekrar','İhmal','Tahkim','Bürokrasi'],answer:'Planlama ve tekrar',explanation:'Egzersiz planlı ve tekrarlıdır.',evidence,topic:'Egzersizin özellikleri'};
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
  const audit=await (await fetch(`${base}/api/ollama/audit`)).json();assert.equal(audit.invalid,0);assert.equal(audit.duplicates,0);
  mismatch=true;let response=await post();assert.equal(response.status,502);assert.match((await response.json()).error,/doğrulayamadı/);
  assert.equal((await (await fetch(`${base}/api/ollama/questions`)).json()).items.length,0);
  mismatch=false;response=await post();assert.equal(response.status,200);const result=await response.json();assert.equal(result.item.status,'approved');assert.equal(result.item.verification.answer,result.item.answer);
  assert.equal(calls.length,4);assert.ok(calls[3].prompt.includes('SORU:'));assert.ok(!calls[3].prompt.includes('Egzersiz düzenli ve planlı etkinliktir.'));
  response=await post();assert.equal(response.status,502);assert.match((await response.json()).error,/zaten kayıtlı|benzer/);
  let selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({model:'fake:2'})});assert.equal(selected.status,200);assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).model,'fake:2');
  selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({model:'not-installed'})});assert.equal(selected.status,400);
  selected=await fetch(`${base}/api/ollama/select-model`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.invalid'},body:JSON.stringify({model:'fake:1'})});assert.equal(selected.status,403);

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

 }finally{await close(app);await close(fake);await rm(dir,{recursive:true,force:true})}
});
