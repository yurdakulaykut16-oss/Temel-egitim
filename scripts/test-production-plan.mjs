// Üretim planının saf mantığı (server/production-plan.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildPlanSteps, planSnapshot, planDifficultyForUnit, planAcceptsDifficulty, notePlanOutcome,
 sanitizePlanState, evidenceWithinSummary, pickFocusSentence, splitSummarySentences, planBatch, pickPlanWork,
 planConfigFromEnv, describeStep, stepKey, summaryWindow, passShare, summaryPageOf, bucketQuota, planBucketHasRoom, summarySectionOf, summaryWebSourceOf,
 leastUsedOption, DEFAULT_PLAN_PASSES} from '../server/production-plan.mjs';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const q = (unitId, difficulty, extra = {}) => ({ unitId, difficulty, status: 'approved', ...extra });
const many = (n, unitId, difficulty) => Array.from({ length: n }, () => q(unitId, difficulty));
const DIFFS = ['kolay', 'orta'];
// Bütün turların sonunda kolay / orta kovalarında hedeflenen sayı (kota 50, 4 tur: 100 / 100).
const CAP = d => bucketQuota(50, DEFAULT_PLAN_PASSES, DIFFS.indexOf(d));
const everything = () => contexts.flatMap(c => DIFFS.flatMap(d => many(CAP(d), c.id, d)));

test('plan sırası: her üniteye 200 soru, yalnızca kolay ve orta düzeyde eşit dağılım', () => {
 // Her turun toplamı kotadır.
 for (const quota of [50, 1, 2, 3, 10, 7]) {
  for (let pass = 1; pass <= 14; pass++) assert.equal([0, 1, 2].reduce((n, d) => n + passShare(quota, pass, d), 0), quota, `kota ${quota}, ${pass}. tur`);
 }
 // Her turda yalnızca kolay ve orta; kota 50 ikiye eşit bölünür.
 assert.deepEqual([1, 2, 3, 4].map(pass => [0, 1, 2].map(d => passShare(50, pass, d))), Array(4).fill([25, 25, 0]));
 assert.deepEqual(DIFFS.map(CAP), [100, 100]);
 assert.deepEqual(DIFFS.map((_, d) => bucketQuota(50, 12, d)), [300, 300]);
 assert.equal(DEFAULT_PLAN_PASSES, 4);
 assert.equal(planConfigFromEnv({}).passes, 4);
 assert.equal(planConfigFromEnv({ TEMPO_PLAN_PASSES: '3' }).passes, 3);

 const steps = buildPlanSteps(contexts, 50);
 // İlk dört turda da iki zorluk bulunur.
 assert.equal(steps.length, contexts.length * 4 * 2);
 assert.equal(steps.reduce((n, s) => n + s.share, 0), contexts.length * 200, 'bölüm başına 200 soru');
 assert.equal(contexts.length * 200, 5800);
 // 1. tur: bölüm sırası kitap sırasıdır ve HER bölümün kolay ve orta hücresi vardır.
 const pass1 = steps.filter(s => s.pass === 1);
 assert.deepEqual(pass1.map(s => `${s.unitId}:${s.difficulty}`), contexts.flatMap(c => ['kolay', 'orta'].map(d => `${c.id}:${d}`)));
 assert.deepEqual(pass1.slice(0, 2).map(s => [s.from, s.share, s.quota]), [[0, 25, 25], [0, 25, 25]]);
 assert.deepEqual(steps.filter(s => s.unitId === contexts[0].id && s.difficulty === 'kolay').map(s => [s.pass, s.from, s.quota]), [[1, 0, 25], [2, 25, 50], [3, 50, 75], [4, 75, 100]]);
 assert.ok(steps.filter(s => s.pass === DEFAULT_PLAN_PASSES).every(s => s.quota === CAP(s.difficulty)), 'son turun sonunda her kova toplam kotasındadır');
 assert.equal(steps[0].bookNo, 1); assert.equal(steps[0].unitNo, 1);
 const firstOfBook2 = steps.find(s => s.book !== steps[0].book);
 assert.equal(firstOfBook2.bookNo, 2); assert.equal(firstOfBook2.unitNo, 1);
 assert.match(describeStep(steps[0]), /^1\. tur · 1\. kitap 1\. bölüm — .* · kolay$/);
 // Tur sayısı ayarlanabilir.
 assert.equal(Math.max(...buildPlanSteps(contexts, 50, 3).map(s => s.pass)), 3);
 // Kota 1: tek kalan pay turlar arasında kolay / orta dönüşümlüdür.
 assert.deepEqual([1, 2, 3].map(pass => [...new Set(buildPlanSteps(contexts, 1, 3).filter(s => s.pass === pass).map(s => s.difficulty))]), [['kolay'], ['orta'], ['kolay']]);
});

test('konu içi sıra: kolay / orta dengesi; ünite 200 soruya ulaşmadan sıradaki üniteye geçilmez', () => {
 const [a, b] = contexts;
 let snap = planSnapshot({ contexts, items: [], quota: 50 });
 assert.equal(snap.current.key, stepKey(a.id, 'kolay'));
 assert.equal(snap.totalTarget, contexts.length * 200);

 // Tek hat: sorular sırayla onaylandıkça zorluk döner; ilk 50 sorunun tamamı 1. konudandır.
 const items = [];
 const order = [];
 for (let i = 0; i < 53; i++) {
  snap = planSnapshot({ contexts, items, quota: 50 });
  const step = pickPlanWork(snap.all, 1, {});
  order.push(`${step.unitId}:${step.difficulty}`);
  items.push(q(step.unitId, step.difficulty));
 }
 assert.deepEqual(order.slice(0, 7), ['kolay', 'orta', 'kolay', 'orta', 'kolay', 'orta', 'kolay'].map(d => `${a.id}:${d}`));
 assert.ok(order.slice(0, 50).every(x => x.startsWith(`${a.id}:`)), 'ilk 50 soru 1. konudan');
 const count = d => order.slice(0, 50).filter(x => x === `${a.id}:${d}`).length;
 assert.deepEqual([count('kolay'), count('orta')], [25, 25], '1. turda konuya 25 kolay + 25 orta');
 assert.deepEqual(order.slice(50), ['kolay', 'orta', 'kolay'].map(d => `${a.id}:${d}`), 'ikinci tur tamamlanana kadar ilk ünitede kalınır');

 // Onaylanmamış ya da zorluğu olmayan kayıtlar sayılmaz; fazlası kotayı aşmaz.
 snap = planSnapshot({ contexts, items: [...many(60, a.id, 'kolay'), { unitId: b.id, difficulty: 'kolay', status: 'rejected' }, { unitId: b.id, status: 'approved' }], quota: 50 });
 assert.equal(snap.totalDone, 60, 'onaylı kolay sorular toplam sayıya yansır');
 assert.equal(snap.current.key, stepKey(a.id, 'orta'), 'kolayı dolan konunun orta kovası sürer');

 // Hakemler bir zorluğu fazla verdiyse (kolay 30) o turda kalan zorluklara çalışılır.
 snap = planSnapshot({ contexts, items: [...many(30, a.id, 'kolay'), ...many(17, a.id, 'orta')], quota: 50 });
 assert.equal(pickPlanWork(snap.all, 1, {}).key, stepKey(a.id, 'orta'));

 // 1. tur bitti → 2. tur ilk konu. Önceden yazılmış sorular sayılır.
 const pass1 = contexts.flatMap(c => [...many(25, c.id, 'kolay'), ...many(25, c.id, 'orta')]);
 snap = planSnapshot({ contexts, items: pass1, quota: 50 });
 assert.equal(snap.current.pass, 2);
 assert.equal(snap.current.unitId, a.id);
 assert.equal(snap.totalDone, contexts.length * 50);
 // İkinci tur da kolay / orta arasında eşit paylaşılır.
 snap = planSnapshot({ contexts, items: [...pass1, ...many(10, a.id, 'kolay')], quota: 50 });
 assert.deepEqual([snap.current.key, snap.current.done, snap.current.quota], [stepKey(a.id, 'kolay'), 35, 50]);

 snap = planSnapshot({ contexts, items: everything(), quota: 50 });
 assert.equal(snap.complete, true);
 assert.equal(snap.current, null);
});

test('atlanan (konu, zorluk) geçilir, konunun diğer zorlukları sürer; geriye yalnızca atlananlar kalınca allParked bildirilir', () => {
 const [a, b] = contexts;
 let snap = planSnapshot({ contexts, items: many(5, a.id, 'kolay'), quota: 50, parked: { [stepKey(a.id, 'kolay')]: {} } });
 assert.equal(snap.current.key, stepKey(a.id, 'orta'), 'kolayı atlanan konunun ortasına ve zoruna devam edilir');
 assert.deepEqual(snap.parkedSteps.map(s => [s.key, s.done]), [[stepKey(a.id, 'kolay'), 5]], 'atlanan çift listede bir kez görünür');
 snap = planSnapshot({ contexts, items: [...many(5, a.id, 'kolay'), ...many(100, a.id, 'orta')], quota: 50, parked: { [stepKey(a.id, 'kolay')]: {} } });
 assert.equal(snap.current.unitId, b.id, 'ünitenin diğer tüm turları dolunca sıradaki üniteye geçilir');

 const allButOne = contexts.flatMap(c => DIFFS.flatMap(d => (c.id === a.id && d === 'kolay' ? many(CAP('kolay') - 1, c.id, d) : many(CAP(d), c.id, d))));
 snap = planSnapshot({ contexts, items: allButOne, quota: 50, parked: { [stepKey(a.id, 'kolay')]: {} } });
 assert.equal(snap.current, null);
 assert.equal(snap.complete, false);
 assert.equal(snap.allParked, true);
});

test('aynı ünite bitene kadar üretilir; paralel hatlar aynı ünitede çalışır', () => {
 const [a, b, c] = contexts;
 const K = (x, z = 'kolay') => stepKey(x.id, z);
 const snapOf = (items, parked = {}) => planSnapshot({ contexts, items, quota: 50, passes: 4, parked });
 const units = steps => [...new Set(steps.map(s => s.unitId))];
 const pass1 = x => [...many(25, x.id, 'kolay'), ...many(25, x.id, 'orta')];

 // Başlangıçta birinci ünitenin yalnızca ilk turu açıktır; iki üretim hattı da o üniteden iş alır.
 let snap = snapOf([]);
 assert.deepEqual(units(planBatch(snap.all, 2)), [a.id]);
 assert.deepEqual(planBatch(snap.all, 2).map(s => `${s.pass}:${s.unitId}`), [`1:${a.id}`, `1:${a.id}`]);
 assert.equal(pickPlanWork(snap.all, 2, {}).unitId, a.id);
 assert.equal(pickPlanWork(snap.all, 2, { [K(a)]: 1 }).unitId, a.id, 'ikinci hat da aynı üniteden başka zorluk alır');
 assert.equal(pickPlanWork(snap.all, 2, { [K(a)]: 1 }).difficulty, 'orta');
 assert.equal(pickPlanWork(snap.all, 2, { [K(a)]: 1, [K(a, 'orta')]: 1 }).unitId, a.id);

 // İlk turun 50 sorusu bitince sonraki ünitenin değil, aynı ünitenin ikinci turunun işi gelir.
 snap = snapOf(pass1(a));
 assert.deepEqual(units(planBatch(snap.all, 2)), [a.id]);
 assert.ok(planBatch(snap.all, 2).every(s => s.pass === 2));

 // Bir ünitenin bütün turları dolduktan sonra sıradaki ünitenin ilk turu başlar.
 const fullA = snapOf([]).all.filter(s => s.unitId === a.id).flatMap(s => many(s.share, a.id, s.difficulty));
 snap = snapOf(fullA);
 assert.deepEqual(units(planBatch(snap.all, 2)), [b.id]);
 assert.ok(planBatch(snap.all, 2).every(s => s.pass === 1));
 assert.deepEqual(units(planBatch(snap.all, 1)), [b.id]);
 assert.deepEqual(units(planBatch(snap.all, 8)), [b.id], 'hat sayısı, eşzamanlı çalışılan üniteyi değiştirmez');

 // Ünite içindeki son soru hazırlanıyorsa ikinci hat kotayı aşmaz ve başka üniteye geçmez.
 snap = snapOf([...many(25, a.id, 'kolay'), ...many(24, a.id, 'orta')]);
 assert.equal(pickPlanWork(snap.all, 2, { [K(a, 'orta')]: 1 }), null);
 assert.deepEqual(units(planBatch(snap.all, 2)), [a.id]);

 // Atlanan zorluk aynı ünitenin diğer açık hücrelerini engellemez; tamamen atlanan ünite geçilir.
 snap = snapOf([], { [K(a)]: {} });
 assert.deepEqual(units(planBatch(snap.all, 2)), [a.id]);
 const fullB = snapOf([]).all.filter(s => s.unitId === b.id).flatMap(s => many(s.share, b.id, s.difficulty));
 snap = snapOf([...fullA, ...fullB], { [K(c)]: {}, [K(c, 'orta')]: {}, [K(c, 'zor')]: {} });
 assert.deepEqual(units(planBatch(snap.all, 2)), [contexts[3].id]);

 // Tüm ünitelerin hedefi dolunca iş kalmaz.
 snap = snapOf(everything());
 assert.deepEqual(planBatch(snap.all, 2), []);
 assert.equal(pickPlanWork(snap.all, 2, {}), null);
});

test('takılma sayacı: adım başına üst üste retler sayılır; sınırda adım park edilir', () => {
 const [step, other] = buildPlanSteps(contexts, 50);
 let state = { parked: {}, streaks: {} };
 let res;
 for (let i = 0; i < 4; i++) { res = notePlanOutcome(state, step, 'rejected', { stuckLimit: 5 }); state = res.state; }
 assert.equal(state.streaks[step.key], 4); assert.equal(res.parkedNow, false);
 res = notePlanOutcome(state, step, 'other', { stuckLimit: 5 }); state = res.state;
 assert.equal(state.streaks[step.key], 4, 'başka zorlukla kaydedilen soru sayacı değiştirmez');
 // Aynı anda çalışan diğer adımın sonuçları bu adımın sayacını etkilemez.
 state = notePlanOutcome(state, other, 'approved', { stuckLimit: 5 }).state;
 state = notePlanOutcome(state, other, 'rejected', { stuckLimit: 5 }).state;
 assert.equal(state.streaks[step.key], 4); assert.equal(state.streaks[other.key], 1);
 res = notePlanOutcome(state, step, 'approved', { stuckLimit: 5 }); state = res.state;
 assert.equal(state.streaks[step.key], undefined, 'hedef kovaya giren soru sayacı sıfırlar');
 for (let i = 0; i < 5; i++) {
  res = notePlanOutcome(state, step, 'rejected', { stuckLimit: 5, done: 12, now: 0 }); state = res.state;
  state = notePlanOutcome(state, other, 'approved', { stuckLimit: 5 }).state; // araya giren diğer adım
 }
 assert.deepEqual(state.parked[step.key], { at: '1970-01-01T00:00:00.000Z', failures: 5, done: 12 });
 assert.equal(state.streaks[step.key], undefined);
 assert.equal(state.parked[other.key], undefined);

 // Bozuk dosya içeriği güvenli biçime gelir; planda olmayan adımlar atılır.
 assert.deepEqual(sanitizePlanState('bozuk', contexts), { parked: {}, streaks: {} });
 const clean = sanitizePlanState({ parked: { [step.key]: { failures: 3 }, 'yok|kolay': {} }, streaks: { [other.key]: 7.9, 'yok|zor': 3, [step.key]: -4 } }, contexts);
 assert.deepEqual(Object.keys(clean.parked), [step.key]); assert.deepEqual(clean.streaks, { [other.key]: 7 });
});

test('konu içi zorluk ve kabul kuralı: kova doluysa o zorluk kabul edilmez', () => {
 const a = contexts[0].id;
 // Varsayılan dört turun kotaları kolay 100, orta 100; sıradaki zorluk doluluk oranı en düşük olandır.
 assert.equal(planDifficultyForUnit(a, [], 50), 'kolay');
 assert.equal(planDifficultyForUnit(a, many(100, a, 'kolay'), 50), 'orta');
 assert.equal(planDifficultyForUnit(a, [...many(40, a, 'kolay'), ...many(80, a, 'orta')], 50), 'kolay');
 assert.equal(planDifficultyForUnit(a, [...many(20, a, 'kolay'), ...many(20, a, 'orta')], 50), 'kolay');
 assert.equal(planDifficultyForUnit(a, DIFFS.flatMap(d => many(CAP(d), a, d)), 50), null);
 assert.equal(planDifficultyForUnit(a, DIFFS.flatMap(d => many(50, a, d)), 50, 3), 'kolay', 'üç turluk planda kovalar 75 / 75');
 assert.equal(planDifficultyForUnit(a, DIFFS.flatMap(d => many(75, a, d)), 50, 3), null);
 assert.equal(planBucketHasRoom(a, 'kolay', many(99, a, 'kolay'), 50), true);
 assert.equal(planBucketHasRoom(a, 'kolay', many(100, a, 'kolay'), 50), false);

 assert.equal(planAcceptsDifficulty(a, 'kolay', 'kolay', many(50, a, 'kolay'), 50), true, 'hedefle aynı zorluk kabul edilir');
 assert.equal(planAcceptsDifficulty(a, 'orta', 'kolay', many(99, a, 'orta'), 50), true, 'kotası dolmamış başka zorluk kendi kovasına yazılır');
 assert.equal(planAcceptsDifficulty(a, 'kolay', 'orta', many(100, a, 'kolay'), 50), false, 'kolay kotası doluyken "kolay" çıkan soru alınmaz');
 assert.equal(planAcceptsDifficulty(a, 'bilinmiyor', 'kolay', [], 50), false);
});

test('yalnızca özet: kanıt cümlesi konu özetinde geçmeli', () => {
 const summary = contexts[0].text;
 const sentences = splitSummarySentences(summary);
 assert.ok(sentences.length >= 10);
 assert.equal(evidenceWithinSummary(sentences[3], summary).ok, true);
 assert.equal(evidenceWithinSummary(sentences[3].toLocaleUpperCase('tr-TR').replace(/[.,;:]/g, ' '), summary).ok, true, 'büyük/küçük harf ve noktalama farkı sorun değil');
 assert.equal(evidenceWithinSummary(sentences[5].split(' ').slice(1).join(' '), summary).ok, true, 'cümlenin büyük bölümü yeterli');
 // Başka konunun özetinden cümle bu konunun özetinde yoktur.
 const foreign = splitSummarySentences(contexts[12].text)[2];
 assert.equal(evidenceWithinSummary(foreign, summary).ok, false);
 assert.equal(evidenceWithinSummary('Kısa', summary).ok, false);
 // Özetin farklı cümlelerinden derlenmiş (tek cümlede geçmeyen) kanıt kabul edilmez.
 const stitched = [sentences[0], sentences[9]].map(s => s.split(' ').slice(0, 5).join(' ')).join(' ');
 assert.equal(evidenceWithinSummary(stitched, summary).ok, false);
});

test('odak cümlesi: en az soru sorulmuş özet cümlesi seçilir, denemeler arasında döner', () => {
 // Kısa özet (elle yazılmış bölüm): cümleler baştan sona sırayla gezilir.
 const summary = contexts[0].text.slice(0, contexts[0].baseChars);
 const sentences = splitSummarySentences(summary);
 const first = pickFocusSentence(summary, [], 0);
 assert.equal(first.index, 0); assert.equal(first.total, sentences.length);
 assert.equal(pickFocusSentence(summary, [], 1).index, 1);
 assert.equal(pickFocusSentence(summary, [], sentences.length).index, 0, 'sayaç cümle sayısını aşınca başa döner');
 // İlk iki cümleden soru yazılmışsa sıradaki kullanılmamış cümle seçilir.
 const used = [{ evidence: sentences[0] }, { evidence: sentences[1] }, { evidence: sentences[1] }];
 assert.equal(pickFocusSentence(summary, used, 0).index, 2);
 // Bütün cümleler birer kez kullanıldıysa yine en az kullanılanlar arasından seçer.
 const allOnce = sentences.map(s => ({ evidence: s }));
 const pick = pickFocusSentence(summary, [...allOnce, { evidence: sentences[0] }], 0);
 assert.equal(pick.index, 1); assert.equal(pick.usage, 1);
 // En az kullanılan tek cümle kalsa bile art arda iki deneme (aynı konuda çalışan iki hat) farklı cümle alır.
 const allButThird = sentences.filter((_, i) => i !== 3).map(s => ({ evidence: s }));
 assert.equal(pickFocusSentence(summary, allButThird, 0).index, 3);
 assert.notEqual(pickFocusSentence(summary, allButThird, 1).index, 3);
 assert.equal(pickFocusSentence('', [], 0), null);
});

test('odak cümlesi: uzun (kitapla büyütülmüş) özette seçimler özetin tamamına yayılır', () => {
 for (const ctx of contexts) {
  const sentences = splitSummarySentences(ctx.text);
  if (sentences.length <= 30) continue;
  const n = sentences.length;
  const order = Array.from({ length: n }, (_, r) => pickFocusSentence(ctx.text, [], r).index);
  assert.equal(new Set(order).size, n, `${ctx.id}: bir turda her cümle bir kez odak olmalı`);
  // 1. tur (kolay, 50 soru) özetin yalnızca başından değil her bölgesinden cümle almalı.
  const firstTen = order.slice(0, 10);
  const thirds = new Set(firstTen.map(i => Math.floor(i * 3 / n)));
  assert.equal(thirds.size, 3, `${ctx.id}: ilk 10 odak özetin baş/orta/son bölümlerine yayılmalı (${firstTen.join(',')})`);
 }
});

test('kitapla büyütülmüş özet: her konuda 200 kolay / orta soru üretimine yetecek cümle var', () => {
 assert.equal(contexts.length, 29);
 let total = 0;
 for (const ctx of contexts) {
  const sentences = splitSummarySentences(ctx.text);
  total += sentences.length;
  assert.ok(Number.isInteger(ctx.baseChars) && ctx.baseChars > 500 && ctx.baseChars < ctx.text.length, `${ctx.id}: baseChars elle yazılmış özeti göstermeli`);
  // Ünite kotası 200; kısa özetin tekrara düşmeden farklı soru açıları kurmaya yetecek kadar geniş olması gerekir.
  assert.ok(sentences.length >= 50, `${ctx.id}: ${sentences.length} cümle çok az konu çeşitliliği sağlar`);
  assert.ok(ctx.text.length >= 3 * ctx.baseChars, `${ctx.id}: özet kitapla en az üç katına çıkmalı`);
  // Her cümle kanıt kapısından geçebilmeli (model cümleyi birebir kopyaladığında).
  for (const sentence of sentences) assert.equal(evidenceWithinSummary(sentence, ctx.text).ok, true, `${ctx.id}: ${sentence}`);
  // Kitaptan alınan bölümde soru kökü, liste artığı, şekil/tablo göndermesi kalmamalı.
  const book = splitSummarySentences(ctx.text.slice(ctx.baseChars));
  for (const sentence of book) {
   assert.ok(sentence.length <= 330, `${ctx.id}: çok uzun cümle: ${sentence.slice(0, 80)}…`);
   assert.ok(!/[?•]|(?:^|\s)(?:Şekil|Tablo|Resim|Grafik)\s+\d/.test(sentence), `${ctx.id}: özet dışı kalıp: ${sentence}`);
  }
 }
 assert.ok(total >= 2500, `toplam ${total} cümle`);
});

test('özet penceresi: isteme özetin tamamı değil ilgili cümlenin çevresi konur', () => {
 for (const ctx of contexts) {
  const sentences = splitSummarySentences(ctx.text);
  for (const [i, sentence] of sentences.entries()) {
   const win = summaryWindow(ctx.text, sentence, 2400);
   assert.equal(win.windowed, true);
   assert.ok(win.text.length <= 2400, `${ctx.id}#${i}: pencere ${win.text.length} karakter`);
   assert.ok(win.text.includes(sentence), `${ctx.id}#${i}: odak cümle pencerede olmalı`);
   assert.ok(win.start <= i && i <= win.end);
   // Pencere özetten kesintisiz bir bölümdür (cümleler bölünmez, sırası değişmez).
   assert.equal(win.text, sentences.slice(win.start, win.end + 1).join(' '));
   assert.equal(evidenceWithinSummary(sentence, win.text).ok, true);
  }
 }
 const ctx = contexts[0];
 const sentences = splitSummarySentences(ctx.text);
 // Model kanıtı küçük farklarla kopyalasa da pencere doğru cümleye ortalanır.
 const loose = sentences[40].toLocaleUpperCase('tr-TR').replace(/[.,;:]/g, ' ');
 const near = summaryWindow(ctx.text, loose, 2400);
 assert.ok(near.start <= 40 && 40 <= near.end, 'yaklaşık eşleşen kanıtın cümlesi pencerede olmalı');
 // Odak yoksa özetin başı; kısa özet olduğu gibi döner.
 assert.equal(summaryWindow(ctx.text, '', 2400).start, 0);
 const short = ctx.text.slice(0, 900);
 assert.deepEqual(summaryWindow(short, sentences[1], 2400), { text: short, windowed: false, start: 0, end: -1, center: -1 });
 // Bütçe büyüdükçe pencere de büyür.
 assert.ok(summaryWindow(ctx.text, sentences[40], 4000).text.length > summaryWindow(ctx.text, sentences[40], 2400).text.length);
});

test('ayarlar: varsayılan 50 soru; TEMPO_PLAN=0 kapatır; geçersiz değerler güvenli aralığa çekilir', () => {
 assert.deepEqual(planConfigFromEnv({}), { enabled: true, quota: 50, passes: 4, stuckLimit: 25 });
 assert.equal(planConfigFromEnv({ TEMPO_PLAN: '0' }).enabled, false);
 assert.deepEqual(planConfigFromEnv({ TEMPO_PLAN_QUOTA: '20', TEMPO_PLAN_STUCK_LIMIT: '40', TEMPO_PLAN_PASSES: '5' }), { enabled: true, quota: 20, passes: 5, stuckLimit: 40 });
 assert.deepEqual(planConfigFromEnv({ TEMPO_PLAN_QUOTA: 'abc', TEMPO_PLAN_STUCK_LIMIT: '0', TEMPO_PLAN_PASSES: '0' }), { enabled: true, quota: 50, passes: 1, stuckLimit: 2 });
});

test('kitap sayfası: özetin kitaptan alınan her cümlesinin sayfası bilinir; sorular kitabın sayfalarına yayılır', () => {
 const bookIndex = JSON.parse(readFileSync(new URL('../src/bookIndex.json', import.meta.url), 'utf8'));
 const books = Array.isArray(bookIndex) ? bookIndex : bookIndex.books;
 let rangePages = 0, coveredPages = 0;
 books.forEach((book, bi) => book.units.forEach((unit, ui) => {
  const ctx = contexts.find(c => c.id === `${bi}-${ui}`);
  assert.ok(Array.isArray(ctx.pageMarks) && ctx.pageMarks.length >= 5, `${ctx.id}: pageMarks`);
  const summaryPages = unit.summaryPages || [];
  const last = summaryPages.length ? Math.max(...summaryPages) : (unit.testPage || unit.page + 1) - 1;
  // İşaretler metin sırasıyla ve sayfa sırasıyla artar; hepsi konunun sayfa aralığındadır.
  for (const [i, [offset, page]] of ctx.pageMarks.entries()) {
   assert.ok(offset > ctx.baseChars && offset < ctx.text.length);
   assert.ok(page >= unit.page && page <= last, `${ctx.id}: s.${page} aralık dışı (${unit.page}-${last})`);
   if (i) assert.ok(offset > ctx.pageMarks[i - 1][0] && page > ctx.pageMarks[i - 1][1]);
  }
  const pages = new Set(ctx.pageMarks.map(m => m[1]));
  rangePages += last - unit.page + 1;
  coveredPages += pages.size;
  // Konunun sayfalarının çoğundan cümle vardır (kapak, tablo/şekil ve etkinlik sayfaları hariç).
  assert.ok(pages.size >= (last - unit.page + 1) * 0.6, `${ctx.id}: ${pages.size}/${last - unit.page + 1} sayfa`);

  // Elle yazılmış bölümdeki cümlenin sayfası yoktur; kitaptan alınan cümlenin sayfası işaretindekidir.
  const sentences = splitSummarySentences(ctx.text);
  assert.equal(summaryPageOf(ctx, sentences[0]), null);
  const [offset, page] = ctx.pageMarks[2];
  const sentence = splitSummarySentences(ctx.text.slice(offset))[0];
  assert.equal(summaryPageOf(ctx, sentence), page);
  assert.equal(summaryPageOf(ctx, sentence.toLocaleUpperCase('tr-TR').replace(/[.,;:]/g, ' ')), page, 'küçük farklarla kopyalanmış kanıt da aynı sayfayı verir');
  // Odak cümleleri 50 soruluk ilk turda konunun sayfalarının çoğuna uğrar.
  const visited = new Set();
  for (let r = 0; r < 50; r++) { const p = summaryPageOf(ctx, pickFocusSentence(ctx.text, [], r).sentence); if (p) visited.add(p); }
  assert.ok(visited.size >= Math.min(pages.size, 12) * 0.75, `${ctx.id}: ilk 50 odak ${visited.size}/${pages.size} sayfaya uğradı`);
 }));
 assert.equal(summaryPageOf({ text: 'Kısa bir özet cümlesi burada duruyor.' }, 'Kısa bir özet cümlesi burada duruyor.'), null);
 assert.ok(coveredPages >= rangePages * 0.85, `kitap sayfası kapsamı: ${coveredPages}/${rangePages}`);
});

test('içindekiler: her bölümün adı ve konu başlıkları kitabın içindekiler sayfalarından gelir; cümlenin konu başlığı bilinir', () => {
 const toc = JSON.parse(readFileSync(new URL('../src/bookToc.json', import.meta.url), 'utf8'));
 assert.equal(Object.keys(toc).length, contexts.length);
 // Kitabın içindekiler sayfasındaki bölüm adları ve konular (elle doğrulanmış örnekler).
 assert.equal(toc['0-0'].title, 'Genel Antrenman Bilimi: Antrenmanla İlgili Temel Kuram ve Kavramlar');
 assert.deepEqual(toc['0-0'].sections.filter(s => s.level === 2).map(s => s.title), ['Giriş', 'Antrenmanla İlgili Temel Kavramlar', 'Sporcu Gelişim Modelleri', 'Antrenmana Akut ve Kronik Uyum']);
 assert.deepEqual(toc['0-0'].sections.filter(s => s.level === 3 && s.parent === 1).map(s => s.title), ['Spor', 'Fiziksel aktivite', 'Performans', 'Egzersiz', 'Antrenman', 'Antrenör']);
 assert.equal(toc['4-3'].title, 'Sporda Fair Play I');
 assert.ok(toc['4-3'].sections.some(s => s.title === 'TMOK Fair Play Konseyi' && s.level === 3 && s.page === 128));
 assert.ok(toc['1-4'].sections.some(s => s.title === 'Doping Kontrol İşleminin 11 Basamağı'), 'iki satıra bölünmüş başlık birleştirilir');
 for (const ctx of contexts) {
  const entry = toc[ctx.id];
  assert.equal(ctx.chapter, entry.title);
  assert.equal(ctx.chapterNo, entry.no);
  assert.ok(entry.sections.filter(s => s.toc && s.level === 2).length >= 3, `${ctx.id}: ana konular`);
  // İçindekilerdeki her konu başlığı kitabın gövdesinde bulunmuştur (sayfası bilinir).
  assert.deepEqual(entry.sections.filter(s => s.toc && !Number.isInteger(s.page)).map(s => s.title), [], `${ctx.id}: gövdede bulunamayan başlık`);
  // Alt konunun ana konusu bir düzey-2 başlığıdır.
  for (const s of entry.sections.filter(x => x.level === 3)) assert.equal(entry.sections[s.parent]?.level, 2, `${ctx.id}: ${s.title}`);
  // Kitaptan alınan her cümlenin konu başlığı bilinir ve başlığın sayfası cümlenin sayfasından sonra değildir.
  assert.ok(ctx.sectionMarks.length >= ctx.pageMarks.length);
  const unknown = ctx.sectionMarks.filter(m => m[1] < 0).length;
  assert.ok(unknown <= 2, `${ctx.id}: konusuz ${unknown} grup`);
  const [offset, index] = ctx.sectionMarks[Math.floor(ctx.sectionMarks.length / 2)];
  const sentence = splitSummarySentences(ctx.text.slice(offset))[0];
  const section = summarySectionOf(ctx, sentence);
  assert.equal(section.title, ctx.sections[index].title);
  assert.ok(ctx.sections[index].page <= summaryPageOf(ctx, sentence), `${ctx.id}: "${section.title}" başlığı s.${ctx.sections[index].page}, cümle s.${summaryPageOf(ctx, sentence)}`);
  // Elle yazılmış bölümdeki cümlenin konu başlığı yoktur.
  assert.equal(summarySectionOf(ctx, splitSummarySentences(ctx.text)[0]), null);
 }
 const first = contexts[0];
 const spor = first.sectionMarks.find(m => first.sections[m[1]]?.title === 'Spor');
 assert.deepEqual(summarySectionOf(first, splitSummarySentences(first.text.slice(spor[0]))[0]), { index: spor[1], title: 'Spor', level: 3, parent: 'Antrenmanla İlgili Temel Kavramlar' });
});

test('internet kaynağı: ek anlatım cümlelerinin kaynağı bilinir, kitap sayfası verilmez', () => {
 const text = 'Elle yazılmış birinci özet cümlesi burada duruyor. Kitaptan alınmış ikinci cümle tam olarak şudur. İnternetten derlenmiş üçüncü cümle de budur.';
 const ctx = {
  text, pageMarks: [[text.indexOf('Kitaptan'), 12]], sections: [{ title: 'Örnek Konu', level: 2, page: 12, parent: null }], sectionMarks: [[text.indexOf('Kitaptan'), 0]],
  webStart: text.indexOf('İnternetten'), webMarks: [[text.indexOf('İnternetten'), 0]], webSources: [{ topic: 'Ek konu', title: 'Örnek kaynak', url: 'https://example.org/kaynak' }]
 };
 assert.equal(summaryPageOf(ctx, 'Kitaptan alınmış ikinci cümle tam olarak şudur.'), 12);
 assert.equal(summaryWebSourceOf(ctx, 'Kitaptan alınmış ikinci cümle tam olarak şudur.'), null);
 assert.equal(summaryPageOf(ctx, 'İnternetten derlenmiş üçüncü cümle de budur.'), null, 'internet cümlesi son kitap sayfasına yazılmaz');
 assert.equal(summarySectionOf(ctx, 'İnternetten derlenmiş üçüncü cümle de budur.'), null);
 assert.deepEqual(summaryWebSourceOf(ctx, 'İnternetten derlenmiş üçüncü cümle de budur.'), { topic: 'Ek konu', title: 'Örnek kaynak', url: 'https://example.org/kaynak' });
 // Gerçek veride: internet bölümü kitap cümlelerinden sonra gelir ve her bölümün kaynağı vardır.
 const web = JSON.parse(readFileSync(new URL('../src/webSummary.json', import.meta.url), 'utf8'));
 for (const c of contexts) {
  if (!Number.isInteger(c.webStart)) { assert.equal((web[c.id] || []).length, 0); continue; }
  assert.ok(c.webStart > c.pageMarks.at(-1)[0]);
  assert.equal(c.webMarks.length, c.webSources.length);
  for (const [offset, i] of c.webMarks) {
   // Kaynak ya bir internet adresidir ya da kullanıcının gönderdiği ders notudur (adres yok, başlık var).
   if (c.webSources[i].kind === 'ders-notu') { assert.equal(c.webSources[i].url, ''); assert.ok(c.webSources[i].title.length > 5); }
   else assert.match(c.webSources[i].url, /^https?:\/\//);
   const sentence = splitSummarySentences(c.text.slice(offset))[0];
   assert.equal(summaryWebSourceOf(c, sentence)?.url, c.webSources[i].url);
   assert.equal(summaryPageOf(c, sentence), null);
  }
 }
});

test('soru biçimi: aynı cümleden yazılan sorularda daha önce kullanılmamış tip seçilir', () => {
 const types = ['kavram', 'vaka', 'karsilastirma', 'istisna'];
 assert.equal(leastUsedOption(types, [], 0), 'kavram');
 assert.equal(leastUsedOption(types, ['kavram'], 0), 'vaka');
 assert.equal(leastUsedOption(types, ['kavram', 'vaka', 'istisna'], 0), 'karsilastirma');
 assert.equal(leastUsedOption(types, ['kavram', 'vaka', 'karsilastirma', 'istisna', 'kavram'], 1), 'karsilastirma', 'hepsi kullanıldıysa en az kullanılanlar arasında döner');
 assert.equal(leastUsedOption([], ['kavram']), null);
 // pickFocusSentence o cümleden daha önce yazılmış soruları da döndürür.
 const summary = 'Dayanıklılık, yorgunluğa karşı koyabilme yeteneğidir. Kuvvet, bir dirence karşı koyabilme yeteneğidir. Sürat, hareketi en kısa sürede yapabilme yeteneğidir.';
 const asked = [{ evidence: 'Dayanıklılık, yorgunluğa karşı koyabilme yeteneğidir.', questionType: 'kavram' }, { evidence: 'Kuvvet, bir dirence karşı koyabilme yeteneğidir.', questionType: 'vaka' }, { evidence: 'Sürat, hareketi en kısa sürede yapabilme yeteneğidir.', questionType: 'istisna' }];
 const focus = pickFocusSentence(summary, asked, 0);
 assert.equal(focus.usage, 1);
 assert.equal(focus.asked.length, 1);
 assert.equal(focus.asked[0].evidence, focus.sentence);
 assert.deepEqual(pickFocusSentence(summary, [], 0).asked, []);
});
