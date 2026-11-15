// Üretim planının saf mantığı (server/production-plan.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildPlanSteps, planSnapshot, planDifficultyForUnit, planAcceptsDifficulty, notePlanOutcome,
 sanitizePlanState, evidenceWithinSummary, pickFocusSentence, splitSummarySentences, planBatch, pickPlanWork,
 planConfigFromEnv, describeStep, stepKey, summaryWindow} from '../server/production-plan.mjs';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const q = (unitId, difficulty, extra = {}) => ({ unitId, difficulty, status: 'approved', ...extra });
const many = (n, unitId, difficulty) => Array.from({ length: n }, () => q(unitId, difficulty));

test('adım sırası: 1. tur tüm konular kolay, 2. tur orta, 3. tur zor; konu sırası kitap sırasıdır', () => {
 const steps = buildPlanSteps(contexts, 50);
 assert.equal(steps.length, contexts.length * 3);
 assert.deepEqual(steps.slice(0, contexts.length).map(s => s.unitId), contexts.map(c => c.id));
 assert.ok(steps.slice(0, contexts.length).every(s => s.difficulty === 'kolay' && s.pass === 1));
 assert.ok(steps.slice(contexts.length, 2 * contexts.length).every(s => s.difficulty === 'orta' && s.pass === 2));
 assert.ok(steps.slice(2 * contexts.length).every(s => s.difficulty === 'zor' && s.pass === 3));
 assert.equal(steps[0].bookNo, 1); assert.equal(steps[0].unitNo, 1);
 const firstOfBook2 = steps.find(s => s.book !== steps[0].book);
 assert.equal(firstOfBook2.bookNo, 2); assert.equal(firstOfBook2.unitNo, 1);
 assert.match(describeStep(steps[0]), /^1\. tur \(kolay\) · 1\. kitap 1\. konu — /);
});

test('sıradaki adım: kota dolmadan konu değişmez; tur bitmeden zorluk değişmez', () => {
 const [a, b] = contexts;
 let snap = planSnapshot({ contexts, items: [], quota: 50 });
 assert.equal(snap.current.key, stepKey(a.id, 'kolay'));
 assert.equal(snap.totalTarget, contexts.length * 150);

 snap = planSnapshot({ contexts, items: many(49, a.id, 'kolay'), quota: 50 });
 assert.equal(snap.current.key, stepKey(a.id, 'kolay'));
 assert.equal(snap.current.done, 49);

 snap = planSnapshot({ contexts, items: many(50, a.id, 'kolay'), quota: 50 });
 assert.equal(snap.current.key, stepKey(b.id, 'kolay'), '50 kolay dolunca aynı konunun ortasına değil, sıradaki konunun kolayına geçilir');

 // Onaylanmamış ya da zorluğu olmayan kayıtlar sayılmaz; fazlası kotayı aşmaz.
 snap = planSnapshot({ contexts, items: [...many(60, a.id, 'kolay'), { unitId: b.id, difficulty: 'kolay', status: 'rejected' }, { unitId: b.id, status: 'approved' }], quota: 50 });
 assert.equal(snap.totalDone, 50);
 assert.equal(snap.current.key, stepKey(b.id, 'kolay'));

 // 1. tur bitti → 2. tur ilk konu orta. Önceden yazılmış orta sorular sayılır.
 const pass1 = contexts.flatMap(c => many(50, c.id, 'kolay'));
 snap = planSnapshot({ contexts, items: [...pass1, ...many(7, a.id, 'orta')], quota: 50 });
 assert.equal(snap.current.key, stepKey(a.id, 'orta'));
 assert.equal(snap.current.pass, 2);
 assert.equal(snap.current.done, 7);

 const all = contexts.flatMap(c => ['kolay', 'orta', 'zor'].flatMap(d => many(50, c.id, d)));
 snap = planSnapshot({ contexts, items: all, quota: 50 });
 assert.equal(snap.complete, true);
 assert.equal(snap.current, null);
});

test('atlanan adım geçilir; geriye yalnızca atlananlar kalınca allParked bildirilir', () => {
 const [a, b] = contexts;
 let snap = planSnapshot({ contexts, items: many(31, a.id, 'kolay'), quota: 50, parked: { [stepKey(a.id, 'kolay')]: {} } });
 assert.equal(snap.current.key, stepKey(b.id, 'kolay'));
 assert.deepEqual(snap.parkedSteps.map(s => [s.key, s.done]), [[stepKey(a.id, 'kolay'), 31]]);

 const allButOne = contexts.flatMap(c => ['kolay', 'orta', 'zor'].flatMap(d => (c.id === a.id && d === 'kolay' ? many(31, c.id, d) : many(50, c.id, d))));
 snap = planSnapshot({ contexts, items: allButOne, quota: 50, parked: { [stepKey(a.id, 'kolay')]: {} } });
 assert.equal(snap.current, null);
 assert.equal(snap.complete, false);
 assert.equal(snap.allParked, true);
});

test('ikili grup: biri dolunca boşalan hat eksik kalan konuya yardım eder; grup bitmeden sıradaki konuya geçilmez', () => {
 const [a, b, c, d] = contexts;
 const K = (x, z = 'kolay') => stepKey(x.id, z);
 const snapOf = (items, parked = {}) => planSnapshot({ contexts, items, quota: 50, parked });
 const keys = steps => steps.map(s => s.key);

 // Başlangıç: 1. ve 2. konu birlikte; iki hat ayrı konulara dağılır.
 let snap = snapOf([]);
 assert.deepEqual(keys(planBatch(snap.all, 2)), [K(a), K(b)]);
 assert.equal(pickPlanWork(snap.all, 2, {}).key, K(a));
 assert.equal(pickPlanWork(snap.all, 2, { [K(a)]: 1 }).key, K(b), 'ikinci hat boş olan konuya gider');
 assert.equal(pickPlanWork(snap.all, 2, { [K(a)]: 1, [K(b)]: 1 }).key, K(a), 'üçüncü bir hat olsaydı en az yüklü konuya eklenirdi');

 // 1. konu doldu, 2. konu 40'ta: boşalan hat 3. konuya GEÇMEZ, 2. konuya yardım eder.
 snap = snapOf([...many(50, a.id, 'kolay'), ...many(40, b.id, 'kolay')]);
 assert.deepEqual(keys(planBatch(snap.all, 2)), [K(b)]);
 assert.equal(pickPlanWork(snap.all, 2, { [K(b)]: 1 }).key, K(b));

 // Kota aşılmaz: 49/50 iken bir soru hazırlanıyorsa ikinci hat beklemeye alınır (3. konuya da geçmez).
 snap = snapOf([...many(50, a.id, 'kolay'), ...many(49, b.id, 'kolay')]);
 assert.equal(pickPlanWork(snap.all, 2, { [K(b)]: 1 }), null);
 assert.equal(pickPlanWork(snap.all, 2, {}).key, K(b));

 // Grup tamamlanınca sıradaki grup (3. ve 4. konu) birlikte başlar.
 snap = snapOf([...many(50, a.id, 'kolay'), ...many(50, b.id, 'kolay')]);
 assert.deepEqual(keys(planBatch(snap.all, 2)), [K(c), K(d)]);

 // Gruptaki konu atlandıysa (özet yetmedi) grup bitmiş sayılır; atlanan konuya hat verilmez.
 snap = snapOf([...many(50, a.id, 'kolay'), ...many(31, b.id, 'kolay')], { [K(b)]: {} });
 assert.deepEqual(keys(planBatch(snap.all, 2)), [K(c), K(d)]);
 snap = snapOf([...many(10, a.id, 'kolay')], { [K(b)]: {} });
 assert.deepEqual(keys(planBatch(snap.all, 2)), [K(a)], 'atlanan konunun eşi tek başına tamamlanır');

 // Tek hat: konular teker teker; üç hat: üçlü gruplar.
 snap = snapOf([]);
 assert.deepEqual(keys(planBatch(snap.all, 1)), [K(a)]);
 assert.deepEqual(keys(planBatch(snap.all, 3)), [K(a), K(b), K(c)]);

 // Tur sınırı (29 konu tek sayı): son konunun kolayı ile ilk konunun ortası aynı grupta.
 const last = contexts[contexts.length - 1];
 snap = snapOf(contexts.slice(0, -1).flatMap(x => many(50, x.id, 'kolay')));
 assert.deepEqual(keys(planBatch(snap.all, 2)), [K(last), K(a, 'orta')]);

 // Plan bitti: grup boş.
 snap = snapOf(contexts.flatMap(x => ['kolay', 'orta', 'zor'].flatMap(z => many(50, x.id, z))));
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
 assert.equal(planDifficultyForUnit(a, [], 50), 'kolay');
 assert.equal(planDifficultyForUnit(a, many(50, a, 'kolay'), 50), 'orta');
 assert.equal(planDifficultyForUnit(a, [...many(50, a, 'kolay'), ...many(50, a, 'orta')], 50), 'zor');
 assert.equal(planDifficultyForUnit(a, ['kolay', 'orta', 'zor'].flatMap(d => many(50, a, d)), 50), null);

 assert.equal(planAcceptsDifficulty(a, 'kolay', 'kolay', many(50, a, 'kolay'), 50), true, 'hedefle aynı zorluk kabul edilir');
 assert.equal(planAcceptsDifficulty(a, 'orta', 'kolay', many(49, a, 'orta'), 50), true, 'kotası dolmamış başka zorluk kendi kovasına yazılır');
 assert.equal(planAcceptsDifficulty(a, 'kolay', 'orta', many(50, a, 'kolay'), 50), false, 'kolay kotası doluyken "kolay" çıkan soru alınmaz');
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

test('kitapla büyütülmüş özet: her konuda 50 kolay + 50 orta + 50 zor soruya yetecek cümle var', () => {
 assert.equal(contexts.length, 29);
 let total = 0;
 for (const ctx of contexts) {
  const sentences = splitSummarySentences(ctx.text);
  total += sentences.length;
  assert.ok(Number.isInteger(ctx.baseChars) && ctx.baseChars > 500 && ctx.baseChars < ctx.text.length, `${ctx.id}: baseChars elle yazılmış özeti göstermeli`);
  // 150 soru için cümle başına en çok 3 soru (kolay / orta / zor) düşmeli → en az 50 cümle.
  assert.ok(sentences.length >= 50, `${ctx.id}: ${sentences.length} cümle 150 soruya yetmez`);
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
 assert.deepEqual(planConfigFromEnv({}), { enabled: true, quota: 50, stuckLimit: 25 });
 assert.equal(planConfigFromEnv({ TEMPO_PLAN: '0' }).enabled, false);
 assert.deepEqual(planConfigFromEnv({ TEMPO_PLAN_QUOTA: '20', TEMPO_PLAN_STUCK_LIMIT: '40' }), { enabled: true, quota: 20, stuckLimit: 40 });
 assert.deepEqual(planConfigFromEnv({ TEMPO_PLAN_QUOTA: 'abc', TEMPO_PLAN_STUCK_LIMIT: '0' }), { enabled: true, quota: 50, stuckLimit: 2 });
});
