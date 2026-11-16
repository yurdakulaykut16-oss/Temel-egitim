// İki motorun hiçbir düğmeye basılmadan, proje açıldığı andan itibaren birlikte çalıştığını doğrular:
//  (1) Sürekli kaliteli soru üretimi (autoScheduler → /api/ollama/questions)
//  (2) Sürekli kalite iyileştirme (qualityImprovementLoop → zayıf sorunun yükseltilmesi)
// Ayrıca kart sisteminin (study-materials / studyCounts) tamamen kaldırıldığını doğrular.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = str => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; };

test('iki sürekli motor: üretim + kalite iyileştirme (kart sistemi yok)', async () => {
 let app, fake, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  let calls = 0;
  let legacyNoteSeen = 0;
  // Havuzda bekleyen ZAYIF ve ESKİ BİÇİMLİ (4 şıklı) soru: Motor 2'nin ilk yeniden yazma hedefi.
  // Yükseltilen sürüm 5 şıklı olmalıdır.
  const weakSeed = {
   id: 'seed-weak-1', unitId: '0-0', book: 'Hareket Bilimleri', unit: 'Ünite 1',
   topic: 'Zayıf konu',
   question: 'Aşırı yüklenme ilkesi aşağıdakilerden hangisidir?',
   options: ['Aşırı yüklenme ilkesi', 'Hafif tempolu bir yürüyüş programıdır ve kademeli olarak artırılır', 'Dinlenme günü planıdır', 'Beslenme düzenidir'],
   answer: 'Aşırı yüklenme ilkesi',
   explanation: 'Kısa açıklama.',
   evidence: 'kısa',
   status: 'approved', model: 'seed', createdAt: new Date(Date.now() - 86400_000).toISOString(),
   // Hakemlerin vereceği zorlukla aynı: üretim planı açıkken yeniden yazım zorluğu değiştiremez.
   difficulty: 'orta', questionType: 'kavram', questionAngle: 'dogrudan_tanim', qualityScore: 1
  };

  fake = http.createServer(async (req, res) => {
   res.setHeader('Content-Type', 'application/json');
   if (req.url === '/api/tags') {
    return res.end(JSON.stringify({ models: [{ name: 'fake:gen' }, { name: 'fake:ver' }, { name: 'fake:j2' }] }));
   }
   let raw = ''; for await (const chunk of req) raw += chunk;
   calls += 1;
   await sleep(120);
   const data = JSON.parse(raw || '{}');
   if (req.url === '/api/create') return res.end(JSON.stringify({ status: 'success' }));
   const prompt = data.prompt || '';

   // SEÇENEKLER: [...] blokunu yakala (hakem mock'u ilk şıkkı doğru kabul eder)
   const optsMatch = prompt.match(/SEÇENEKLER: (\[[\s\S]*?\])/);
   let firstOption = null;
   try { if (optsMatch) firstOption = JSON.parse(optsMatch[1])[0]; } catch {}
   const srcMatch = prompt.match(/KONU (?:ANLATIMI|KAYNAĞI):\s*([\s\S]*?)(?:\n\nMEVCUT SORU|\nSORU:)/) || prompt.match(/KONU ANLATIMI:\s*([\s\S]*?)$/);
   const srcText = srcMatch ? srcMatch[1] : '';
   const evidence = srcText.trim().split(/\s+/).slice(0, 9).join(' ') || 'kaynak metinden birebir alınan yeterince uzun bir kanit parçası';

   let result;
   if (prompt.includes('soru editörüsün')) {
    // Motor 2: zayıf sorunun YÜKSELTİLMİŞ sürümü (aynı kavram/doğru cevap, çok daha kaliteli)
    const tag = `iyilestirme-${calls}-${Math.abs(hash(String(calls)))}`;
    const words = srcText.trim().split(/\s+/).filter(w => w.length >= 5);
    const phrase = words.slice(Math.abs(hash(tag)) % Math.max(1, words.length - 10), Math.abs(hash(tag)) % Math.max(1, words.length - 10) + 9).join(' ');
    const opts = [
     `Aşırı yüklenme ilkesi: ${phrase} ile kademeli olarak uygulanan planlı yüklenme yaklaşımıdır (${tag})`,
     `Aşırı yüklenme ilkesinin tam tersi: yükün asla artırılmadığı durağan plan yaklaşımıdır (${tag})`,
     `Yalnız toparlanma odaklı yaklaşım: yük olmadan dinlenme günlerinin birleştirilmesidir (${tag})`,
     `Rastgele değişken yük yaklaşımı: bireysel eşik ölçülmeksizin uygulanan yüklemedir (${tag})`,
     `Tek tip sabit yük yaklaşımı: herkese aynı yükün değiştirilmeden uygulanmasıdır (${tag})`
    ];
    if (prompt.includes('eski 4 şıklı biçimdedir')) legacyNoteSeen += 1;
    result = {
     topic: 'Aşırı yüklenme ilkesi',
     question: `${phrase} — bu anlatımda tanımlanan temel ilke hangisidir? (${tag})`,
     options: opts,
     answer: opts[0],
     explanation: 'Doğru cevap, pasajda kademeli ve planlı yük artışı olarak tanımlanan aşırı yüklenme ilkesidir; diğer şıklar ilkeyi tersine çevirir, yalnız toparlanmayla sınırlar ya da bireysel eşiği yok sayar.',
     evidence,
     difficulty: 'orta', questionType: 'kavram', questionAngle: 'dogrudan_tanim', bloomLevel: 'kavrama'
    };
   } else if (prompt.includes('soru denetçisisin')) {
    const qMatch = prompt.match(/SORU: ([\s\S]*?)\nSEÇENEKLER:/);
    const question = qMatch ? qMatch[1] : '';
    result = {
     answer: firstOption,
     singleCorrect: true, dualAnswerRisk: false, secondBestOption: '', supported: true, qualityOk: true,
     qualityScore: 5, examPotential: 5, difficulty: 'orta', bloomLevel: 'kavrama',
     distractorPlausible: true,
     evidence,
     reason: 'Pasajda bu bilgi doğrudan ve tek doğru olarak geçer.'
    };
   } else {
    // Motor 1: üretim prompt'u — TEKLİ üretim (direct mod)
    const words = srcText.trim().split(/\s+/).filter(w => w.length >= 3);
    const start = words.length > 14 ? Math.abs(hash(`g-${calls}`)) % (words.length - 12) : 0;
    const phrase = words.slice(start, start + 10).join(' ');
    const tag = `uretim-${calls}`;
    const opts = [
     `Planlı kademeli aşırı yüklenme yaklaşımıdır (${tag})`,
     `Yükü hiç artırmadan sabit kalan durağan yaklaşımdır (${tag})`,
     `Yalnız toparlanma günlerinden oluşan dinlenme kuralıdır (${tag})`,
     `Beslenme düzenini esas alan diyet yaklaşımıdır (${tag})`,
     `Isınma süresini esas alan hazırlık yaklaşımıdır (${tag})`
    ];
    result = {
     question: `${phrase} — anlatımda tarif edilen temel ilke hangisidir? (${tag})`,
     options: opts,
     answer: opts[0],
     explanation: 'Doğru cevap pasajdaki kademeli aşırı yüklenme tanımıyla birebir örtüşür; diğer şıklar ilkenin zıttını, yalnız dinlenmeyi ya da alakasız bir alanı tarif eder.',
     evidence,
     topic: 'Test konu', questionType: 'kavram', questionAngle: 'dogrudan_tanim'
    };
   }
   res.end(JSON.stringify({ response: JSON.stringify(result), eval_count: 180, eval_duration: 200_000_000 }));
  });
  const fakePort = await listen(fake);
  dir = await mkdtemp(join(tmpdir(), 'tempo-two-engines-'));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'questions.json'), JSON.stringify([weakSeed]), 'utf8');

  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  process.env.OLLAMA_MODEL = 'fake:gen';
  process.env.OLLAMA_VERIFIER_MODEL = 'fake:ver';
  process.env.OLLAMA_JUDGE2_MODEL = 'fake:j2';
  process.env.TEMPO_DATA_DIR = dir;
  process.env.TEMPO_OFFLINE_ONLY = '1';
  delete process.env.TEMPO_DISABLE_AUTOLOOP;

  const mod = await import('../server/ollama.mjs');
  const ollamaPlugin = mod.ollamaPlugin; stopOllamaLoops = mod.stopOllamaLoops;
  let middleware;
  ollamaPlugin().configureServer({ middlewares: { use(_path, handler) { middleware = handler; } } });
  app = http.createServer((req, res) => {
   req.url = req.url.replace(/^\/api\/ollama/, '');
   middleware(req, res, () => { res.statusCode = 404; res.end(); });
  });
  const port = await listen(app);
  base = `http://127.0.0.1:${port}`;

  // 1) Proje açılır açılmaz hiçbir düğmeye basılmadan iki motor da açık olmalı
  let status = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(status.autoRunning, true, 'Motor 1 (üretim) kendiliğinden açık olmalı');
  assert.equal(status.qualityLoop?.running, true, 'Motor 2 (kalite iyileştirme) kendiliğinden açık olmalı');

  // Kart sistemi tamamen kaldırılmış olmalı
  assert.equal(status.studyCounts, undefined, 'studyCounts sunucu yanıtında yer almamalı (kart sistemi silindi)');
  const studyRes = await fetch(`${base}/api/ollama/study-materials`);
  assert.equal(studyRes.status, 404, '/study-materials 404 dönmeli (kart sistemi silindi)');
  const genStudyRes = await fetch(`${base}/api/ollama/generate-study`, { method: 'POST', headers: {'Content-Type': 'application/json', Origin: base}, body: '{}' });
  assert.equal(genStudyRes.status, 404, '/generate-study 404 dönmeli (kart sistemi silindi)');

  // 2) Motor 1'i durdur → Motor 2 üretim boştayken zayıf soruyu yükseltmeli
  const stopped = await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } });
  assert.equal(stopped.status, 200);

  let improved = 0;
  let lastQ = null;
  for (let i = 0; i < 120 && improved < 1; i++) {
   await sleep(500);
   const qs = await (await fetch(`${base}/api/ollama/questions`)).json();
   lastQ = qs.items.find(x => x.id === 'seed-weak-1');
   improved = Number(lastQ?.improvementCount) || 0;
   status = await (await fetch(`${base}/api/ollama/status`)).json();
  }

  assert.ok(improved >= 1, `Motor 2 zayıf soruyu yükseltmeliydi; qualityLoop=${JSON.stringify(status.qualityLoop)}`);
  assert.ok(status.qualityLoop.improvedTotal >= 1, 'qualityLoop.improvedTotal en az 1 olmalı');
  assert.ok(status.qualityLoop.scannedTotal >= 1, 'Havuz 0-API skorlanmalı');
  assert.notEqual(lastQ.question, weakSeed.question, 'Soru metni yeniden yazılmalıydı');
  assert.equal(lastQ.id, weakSeed.id, 'Soru kimliği korunmalı (aynı sorunun yükseltilmiş sürümü)');
  assert.ok(Array.isArray(lastQ.verification?.judges) && lastQ.verification.judges.length === 2, 'Yükseltme iki hakem onayından geçmeli');
  assert.ok(Number(lastQ.curatorScore) > 1, 'Havuz skoru yükselmeli');
  assert.equal(lastQ.options.length, 5, 'Eski 4 şıklı soru 5 şıkka yükseltilmeli');
  assert.equal(lastQ.upgradedFromLegacy, true, 'Kayıt eski biçimden yükseltildiğini taşımalı');
  assert.ok(legacyNoteSeen >= 1, 'Editör istemi eski 4 şıklı soruyu 5 şıkka tamamlama talimatını içermeli');
  assert.equal(status.optionFormat?.optionCount, 5);
  assert.ok(status.optionFormat.legacyUpgraded >= 1, 'optionFormat.legacyUpgraded sayılmalı');
  const qsAfter = await (await fetch(`${base}/api/ollama/questions`)).json();
  assert.equal(qsAfter.items.filter(x => x.status === 'approved' && x.options.length !== 5).length, 0, 'Havuzda 4 şıklı onaylı soru kalmamalı');

  // 3) Motor 2 dursa da havuz ve kayıt yapısı tutarlı kalmalı (kararlı bitiş)
  console.log(`\nMotor 2: iyileştirilen=${status.qualityLoop.improvedTotal}, taranan=${status.qualityLoop.scannedTotal}, avg=${status.qualityLoop.averageQuality}, pruned=${status.qualityLoop.prunedTotal}`);
 } catch (e) {
  failure = e;
 }
 try { stopOllamaLoops?.(); } catch {}
 if (base) { try { await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } }); } catch {} }
 if (app) try { app.closeAllConnections?.(); await close(app); } catch {}
 if (fake) try { fake.closeAllConnections?.(); await close(fake); } catch {}
 if (dir) try { await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); } catch {}
 if (failure) { console.error(failure); process.exit(1); }
 process.exit(0);
});
