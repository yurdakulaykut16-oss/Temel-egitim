// ÜRETİM PLANI SIRA TESTİ (uçtan uca, Ollama simülatörüyle)
// ---------------------------------------------------------------------------
// İstenen düzen: ilk ünitenin 3 turdaki 9 hedef sorusu tamamlanır, ardından sonraki üniteye geçilir.
// Her ünitede zorluklar karışık ilerler; aynı anda iki hat varsa ikisi de aynı ünitede çalışır.
// Sorular yalnızca konu özetinden (kitap sayfalarından derlenmiş) kurulur ve kitap sayfasını taşır.
// Test kotayı 3'e indirir: 1. turda her konuya 1 kolay + 1 orta + 1 zor düşer.
// Tek soru hattı kullanılır; aynı ünitedeki paralel hatlar scripts/test-plan-parallel.mjs içinde sınanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFakeOllama} from './fake-ollama-sim.mjs';
import {summaryPageOf, summarySectionOf, summaryWebSourceOf, evidenceWithinSummary} from '../server/production-plan.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('plan: bir ünitenin tüm turları tamamlanır, sonra sıradaki üniteye geçilir', async () => {
 let app, sim, dir, base, stopOllamaLoops;
 let failure = null;
 try {
  const contexts = JSON.parse(await readFile(new URL('../server/contexts.json', import.meta.url), 'utf8'));
  const FIRST_UNIT_TARGET = 9; // 3 tur × 3 soru (kota 3)
  const WANT = FIRST_UNIT_TARGET + 2; // ilk ünitenin hedefi ve sıradaki ünitenin ilk iki sorusu
  sim = createFakeOllama({ loadMs: 20, genMs: 15, judgeMs: 10, keepPrompts: true });
  const fakePort = await sim.listen();
  dir = await mkdtemp(join(tmpdir(), 'tempo-plan-'));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_VERIFIER_MODEL;
  delete process.env.OLLAMA_JUDGE2_MODEL;
  process.env.TEMPO_DATA_DIR = dir;
  // Eski sürümün ölçek hatasıyla reddettiği iki soru: ilki geri alınmalı; ikincisi (hakem puanı
  // gerçekten düşük) reddedilmiş kalmalı.
  const wronged = (id, question, qualityScore) => ({
   id, unitId: contexts.at(-1).id, book: contexts.at(-1).book, unit: contexts.at(-1).unit, topic: 'Eski kayıt', question,
   options: ['Birinci seçenek metni', 'İkinci seçenek metni', 'Üçüncü seçenek metni', 'Dördüncü seçenek metni'], answer: 'Birinci seçenek metni',
   explanation: 'Eski sürümde onaylanmış, sonra havuz bakımında reddedilmiş bir kayıt.', evidence: 'Eski kayıt kanıtı.',
   status: 'rejected', difficulty: 'zor', qualityScore, examPotential: 4, curatedBy: 'ai-council', createdAt: '2026-11-01T10:00:00.000Z',
   curationReason: 'Otonom Kurul: Gelişen kalite standardı (Seviye 9 >= 68) altında kaldığı için elendi'
  });
  await writeFile(join(dir, 'questions.json'), JSON.stringify([wronged('eski-1', 'Eski sürümde haksız yere reddedilen soru hangisidir?', 5), wronged('eski-2', 'Hakem puanı gerçekten düşük olan soru hangisidir?', 2)]));
  process.env.TEMPO_OFFLINE_ONLY = '1';
  process.env.TEMPO_QUIET = '1';
  process.env.TEMPO_PLAN_QUOTA = '3';
  process.env.TEMPO_PLAN_PASSES = '3';
  process.env.TEMPO_QUESTION_INTERVAL_MS = '20';
  delete process.env.TEMPO_PLAN;
  process.env.TEMPO_AUTO_CONCURRENCY = '1';
  delete process.env.TEMPO_DISABLE_AUTOLOOP;

  const mod = await import('../server/ollama.mjs');
  stopOllamaLoops = mod.stopOllamaLoops;
  let middleware;
  mod.ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
  app = http.createServer((req, res) => {
   req.url = req.url.replace(/^\/api\/ollama/, '');
   middleware(req, res, () => { res.statusCode = 404; res.end(); });
  });
  base = `http://127.0.0.1:${await listen(app)}`;

  // Hakem bir soruyu hedeften farklı zorlukta bulursa soru o zorlukla kaydedilir (kotası varsa);
  // sıra, hedef zorluğuyla kaydedilen sorular üzerinden sınanır.
  const onTarget = list => list.filter(q => q.verification?.targetDifficulty === q.difficulty);
  let items = [];
  let midStatus = null;
  for (let i = 0; i < 700 && items.length < WANT; i++) {
   await sleep(250);
   items = onTarget((await (await fetch(`${base}/api/ollama/questions`)).json()).items.filter(q => q.status === 'approved'));
   if (!midStatus && items.length >= 4 && items.length < WANT) midStatus = await (await fetch(`${base}/api/ollama/status`)).json();
  }
  const status = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.ok(items.length >= WANT, `en az ${WANT} soru üretilmeliydi; üretilen: ${items.length}, engel: ${JSON.stringify(status.autoBlock)}, plan: ${JSON.stringify(status.plan?.current)}, son olay: ${JSON.stringify(status.autoEvents?.[0])}`);

  const seq = items.slice(0, WANT).map(q => `${q.unitId}:${q.difficulty}`);
  const firstUnit = contexts[0].id, nextUnit = contexts[1].id;
  console.log(`\nİlk ünite: ${seq.slice(0, FIRST_UNIT_TARGET).join(', ')} → sonraki: ${seq.slice(FIRST_UNIT_TARGET).join(', ')}`);
  assert.ok(seq.slice(0, FIRST_UNIT_TARGET).every(x => x.startsWith(`${firstUnit}:`)), 'ilk ünitenin 9 hedef sorusu tamamlanmalı');
  assert.deepEqual(seq.slice(0, FIRST_UNIT_TARGET).filter(x => x.endsWith(':kolay')).length, 5, 'kolay hedef kotası 5');
  assert.deepEqual(seq.slice(0, FIRST_UNIT_TARGET).filter(x => x.endsWith(':orta')).length, 4, 'orta hedef kotası 4');
  assert.ok(seq.slice(FIRST_UNIT_TARGET).every(x => x.startsWith(`${nextUnit}:`)), 'ilk ünitenin 9 hedef sorusu tamamlanmadan sonraki ünite başlamamalı');

  // Yalnızca özet: kitap pasajı kullanılmaz, kanıt cümlesi konu özetinde geçer.
  for (const q of items.slice(0, WANT)) {
   const ctx = contexts.find(c => c.id === q.unitId);
   assert.ok(!q.passageId, `kitap pasajı kullanılmamalı (${q.unitId}: ${q.passageId})`);
   assert.ok(evidenceWithinSummary(q.evidence, ctx.text).ok, `kanıt konu özetinde olmalı: ${q.evidence}`);
   assert.equal(q.verification.targetDifficulty, q.difficulty);
   // Kitaptan alınan cümleye dayanan soru, o cümlenin kitap sayfasını taşır.
   const page = summaryPageOf(ctx, q.evidence);
   assert.deepEqual(q.pages || null, page ? [page] : null, `${q.unitId}: soru kartındaki sayfa kanıt cümlesinin sayfası olmalı`);
  }
  const withPage = items.slice(0, WANT).filter(q => q.pages?.length);
  assert.ok(withPage.length >= WANT * 0.6, `kitap sayfası taşıyan soru: ${withPage.length}/${WANT}`);
  assert.ok(new Set(withPage.map(q => `${q.unitId}:${q.pages[0]}`)).size >= withPage.length * 0.8, 'sorular farklı sayfalara yayılmalı');
  const genRequests = sim.stats.requests.filter(r => r.role === 'generator');
  assert.ok(genRequests.length >= WANT && genRequests.every(r => r.focus), 'üretici istemi her soruda özetten bir odak cümlesi vermeli');
  assert.ok(genRequests.every(r => !r.bookSeed), 'yalnızca-özet modunda kitap sorusu örneği isteme eklenmemeli');
  // Sınav tarzı örneği (yalnızca biçim için) ise plan modunda da verilir; paragraf sorularında verilmez.
  const styled = genRequests.filter(r => r.examStyle).length;
  assert.ok(styled >= genRequests.length * 0.4, `sınav tarzı örneği taşıyan üretici istemi: ${styled}/${genRequests.length}`);

  // Özet kitaptan büyütüldü (konu başına ~100 cümle): isteme tamamı değil, odak / kanıt cümlesinin
  // çevresindeki bölüm konur; istem modelin bağlam penceresine sığar ve kırpılmaz.
  assert.equal(sim.stats.truncations, 0, 'hiçbir istem bağlam penceresini aşmamalı');
  const sourceOf = prompt => (prompt.match(/KONU ANLATIMI: ([\s\S]*?)(?:\nPARÇA:|\nSORU:|$)/) || [])[1] || '';
  let windows = 0;
  for (const r of sim.stats.requests) {
   const source = sourceOf(r.prompt || '');
   if (!source) continue;
   windows++;
   assert.ok(source.length <= 2400, `${r.role}: özet bölümü ${source.length} karakter (en çok 2400 olmalı)`);
   assert.ok(source.length >= 1200, `${r.role}: özet bölümü çok kısa (${source.length})`);
   assert.ok(contexts.some(c => c.text.includes(source.slice(0, 200))), `${r.role}: bölüm bir konu özetinin kesintisiz parçası olmalı`);
   if (r.role === 'generator') {
    const focus = ((r.prompt.match(/ODAK CÜMLE \([^)]*\): "([\s\S]*?)"(?:\n| Zorluk için)/) || [])[1] || '').trim();
    assert.ok(focus.length > 20, 'odak cümlesi istemde olmalı');
    assert.ok(source.includes(focus), `odak cümlesi isteme konan özet bölümünde yer almalı: ${focus.slice(0, 80)}`);
   }
  }
  assert.ok(windows >= WANT * 2, `özet bölümü içeren istem sayısı: ${windows}`);
  // Odak cümleleri yalnızca elle yazılmış kısa özetten değil kitaptan eklenen bölümden de gelir.
  const fromBook = items.slice(0, WANT).filter(q => {
   const ctx = contexts.find(c => c.id === q.unitId);
   return !evidenceWithinSummary(q.evidence, ctx.text.slice(0, ctx.baseChars)).ok;
  });
  assert.ok(fromBook.length >= 5, `kitaptan eklenen cümlelere dayanan soru sayısı: ${fromBook.length}`);

  // /status plan özeti.
  assert.equal(midStatus.plan.enabled, true);
  assert.equal(midStatus.plan.quota, 3);
  assert.equal(midStatus.plan.mixed, true);
  assert.ok(midStatus.plan.current.pass >= 2, 'ilk turun ardından ünitenin sonraki turuna geçilmeli');
  assert.equal(midStatus.plan.totalTarget, contexts.length * 9);
  assert.equal(midStatus.plan.workingUnits.length, 1);
  assert.deepEqual(midStatus.plan.workingUnits[0].cells.map(c => c.difficulty), ['kolay', 'orta'], 'çalışılan konunun yalnızca kolay / orta kovaları görünmeli');
  assert.equal(midStatus.plan.workingUnits[0].target, 3);
  assert.ok(status.plan.passes[0].done >= 3, 'ilk ünitenin 1. turu tamamlanmış görünmeli');
  assert.ok(status.plan.passes[0].unitsDone >= 1, 'ilk ünite tamamlanan turda sayılmalı');
  assert.equal(status.plan.current.unitId, contexts[1].id);
  // Kota 3, 3 tur: kolay / orta payları dönüşümlüdür; zor hedefi yoktur.
  assert.deepEqual(status.plan.difficulties.map(d => [d.difficulty, d.target]), [['kolay', contexts.length * 5], ['orta', contexts.length * 4], ['zor', 0]]);
  assert.ok(status.plan.difficulties.filter(d => d.target > 0).every(d => d.done > 0), 'kolay ve orta tamamlanan sorulara yansır');
  assert.equal(status.plan.passCount, 3);
  assert.equal(status.plan.perUnitTarget, 9);
  assert.deepEqual(status.plan.passes.map(p => [p.pass, p.mix.kolay, p.mix.orta, p.mix.zor]), [[1, 2, 1, 0], [2, 1, 2, 0], [3, 2, 1, 0]], 'her turda yalnızca kolay / orta hedeflenmeli');
  // İçindekilerden gelen konu başlığı ve internet kaynağı soru kaydında görünür.
  const done = items.slice(0, WANT);
  for (const q of done) {
   const ctx = contexts.find(c => c.id === q.unitId);
   const section = summarySectionOf(ctx, q.evidence);
   assert.equal(q.section || null, section?.title || null, `${q.unitId}: sorunun konu başlığı kanıt cümlesinin başlığı olmalı`);
   const web = summaryWebSourceOf(ctx, q.evidence);
   assert.equal(q.webSource?.url || null, web?.url || null, `${q.unitId}: internet kaynağı`);
   if (web) assert.equal(q.pages || null, null, 'internet cümlesine dayanan soruya kitap sayfası yazılmaz');
  }
  assert.ok(done.filter(q => q.section).length >= WANT * 0.6, `konu başlığı taşıyan soru: ${done.filter(q => q.section).length}/${WANT}`);
  assert.ok(genRequests.some(r => /\| Konu: /.test(r.prompt || '')), 'üretici istemi konu başlığını taşımalı');
  assert.equal(status.autoConcurrencyEffective, 1);

  // Havuz bakımı onaylı soruları toplu reddetmemeli. (Eski hata: 0-100'lük bileşik puan eşiği
  // hakemlerin 1-5'lik puanıyla karşılaştırılıyor, bakım her çalıştığında havuzda 10 soru kalıyordu.)
  const approvedNow = async () => (await (await fetch(`${base}/api/ollama/questions`)).json()).items.filter(q => q.status === 'approved');
  const before = (await approvedNow()).length;
  const scan = await (await fetch(`${base}/api/ollama/curator/scan`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' })).json();
  assert.equal(scan.ok, true, JSON.stringify(scan).slice(0, 300));
  assert.equal(scan.report.councilRejected, 0, 'hakemlerden 5/5 almış sorular kalite eşiğine takılmamalı');
  const after = await approvedNow();
  assert.ok(after.length >= before, `havuz bakımı onaylı soruları silmemeli: ${before} → ${after.length}`);
  const everything = (await (await fetch(`${base}/api/ollama/questions`)).json()).items;
  assert.ok(['approved', 'rejected'].includes(everything.find(q => q.id === 'eski-1')?.status), 'eski kayıt havuzda korunmalı');
  assert.equal(everything.find(q => q.id === 'eski-2')?.status, 'rejected', 'hakem puanı düşük soru reddedilmiş kalmalı');
  assert.deepEqual(everything.filter(q => /Otonom Kurul/.test(q.curationReason || '')).map(q => q.id).sort(), ['eski-1', 'eski-2'], 'eski kayıtların kurul gerekçeleri korunmalı');
 } catch (e) {
  failure = e;
 }
 try { stopOllamaLoops?.(); } catch {}
 if (base) { try { await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } }); } catch {} }
 if (app) try { app.closeAllConnections?.(); await close(app); } catch {}
 if (sim) try { await sim.close(); } catch {}
 if (dir) try { await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); } catch {}
 if (failure) { console.error(failure); process.exit(1); }
 process.exit(0);
});
