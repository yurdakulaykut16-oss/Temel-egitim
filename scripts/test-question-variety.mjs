// Soru çeşitliliği: aynı bilgi farklı soru biçimleriyle sorulabilir; internet anlatımı kapatılabilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'tempo-variety-'));
process.env.TEMPO_DATA_DIR = dir;
process.env.TEMPO_OFFLINE_ONLY = '1';
process.env.TEMPO_QUIET = '1';
process.env.TEMPO_DISABLE_AUTOLOOP = '1';
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9';

const contexts = JSON.parse(readFileSync(new URL('../server/contexts.json', import.meta.url), 'utf8'));
const mod = await import('../server/ollama.mjs');
const { findDuplicateReason, variedTypeAndAngle } = mod;

test.after(() => { try { mod.stopOllamaLoops?.(); } catch {} rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50).unref(); });

const ctx = contexts[0];
const existing = {
 unitId: ctx.id, questionType: 'kavram',
 question: 'Yeterli dinlenmenin ardından performans kapasitesinin başlangıç düzeyinin üzerine çıkmasına ne ad verilir?',
 options: ['Süperkompanzasyon', 'Adaptasyon', 'Yorgunluk', 'Periyotlama'], answer: 'Süperkompanzasyon'
};

test('aynı cevap, farklı soru biçimi: tip farklıysa ve kök benzemiyorsa tekrar sayılmaz', () => {
 const caseDraft = {
  questionType: 'vaka',
  question: 'Bir antrenör, yoğun bir haftadan sonra sporcusunun iki gün dinlenip eskisinden daha iyi derece yaptığını gözlüyor. Bu durum hangi kavramla açıklanır?',
  options: ['Süperkompanzasyon', 'Adaptasyon', 'Aşırı antrenman', 'Tersinirlik'], answer: 'Süperkompanzasyon'
 };
 // Aynı cevap + ortak bir çeldirici (şıkların yarısı aynı): farklı tipte kabul, aynı tipte ret.
 assert.equal(findDuplicateReason(caseDraft, ctx, [existing]), null);
 assert.match(findDuplicateReason({ ...caseDraft, questionType: 'kavram' }, ctx, [existing]) || '', /Aynı cevabı ve şıklarının çoğunu/);
 // Tipi bilinmeyen eski kayıtlarla eski (sıkı) kural geçerlidir.
 assert.match(findDuplicateReason(caseDraft, ctx, [{ ...existing, questionType: undefined }]) || '', /Aynı cevabı/);
});

test('farklı tip de olsa gerçek tekrarlar reddedilir', () => {
 const copy = { ...existing, questionType: 'tanimdan_terim' };
 assert.match(findDuplicateReason(copy, ctx, [existing]) || '', /Aynı soru zaten kayıtlı/);
 const sameOptions = { questionType: 'vaka', question: 'Sahada görülen bu toparlanma sonrası yükseliş aşağıdakilerden hangisidir?', options: [...existing.options].reverse(), answer: existing.answer };
 assert.match(findDuplicateReason(sameOptions, ctx, [existing]) || '', /şıkların tamamıyla aynı/);
 const threeShared = { questionType: 'bosluk_doldurma', question: 'Dinlenme sonrasında kapasitenin önceki düzeyi aşmasına ...... denir. Boşluğa hangisi gelmelidir?', options: ['Süperkompanzasyon', 'Adaptasyon', 'Yorgunluk', 'Tersinirlik'], answer: 'Süperkompanzasyon' };
 assert.match(findDuplicateReason(threeShared, ctx, [existing]) || '', /Aynı cevabı ve şıklarının çoğunu/);
 const nearStem = { questionType: 'tanimdan_terim', question: 'Yeterli dinlenmenin ardından performans kapasitesinin başlangıç düzeyinin üzerine çıkmasına verilen ad hangisidir?', options: ['Süperkompanzasyon', 'Uyum', 'Tükenme', 'Yüklenme'], answer: 'Süperkompanzasyon' };
 assert.ok(findDuplicateReason(nearStem, ctx, [existing]), 'kökü neredeyse aynı olan soru reddedilmeli');
 // Başka bölümdeki aynı cevaplı soru tekrar değildir.
 assert.equal(findDuplicateReason({ ...threeShared, options: ['Süperkompanzasyon', 'Uyum', 'Tükenme', 'Yüklenme'] }, contexts[1], [existing]), null);
});

test('odak cümlesinden daha önce soru yazıldıysa bu kez kullanılmamış tip ve açı seçilir', () => {
 assert.deepEqual(variedTypeAndAngle({ asked: [] }, 'kavram', 'dogrudan_tanim', 0), { type: 'kavram', angle: 'dogrudan_tanim' });
 const once = variedTypeAndAngle({ asked: [{ questionType: 'kavram', questionAngle: 'dogrudan_tanim' }] }, 'kavram', 'dogrudan_tanim', 0);
 assert.notEqual(once.type, 'kavram');
 assert.notEqual(once.angle, 'dogrudan_tanim');
 // Sıradaki tip zaten kullanılmamışsa değiştirilmez.
 assert.deepEqual(variedTypeAndAngle({ asked: [{ questionType: 'kavram', questionAngle: 'dogrudan_tanim' }] }, 'vaka', 'saha_vakasi', 0), { type: 'vaka', angle: 'saha_vakasi' });
 // Aynı cümleden art arda yazılan sorular hep farklı tipte olur (11 tip tükenene kadar).
 const asked = [];
 for (let i = 0; i < 11; i++) {
  const next = variedTypeAndAngle({ asked }, 'kavram', 'dogrudan_tanim', i);
  assert.ok(!asked.some(q => q.questionType === next.type), `${i + 1}. soru yeni bir tipte olmalı (${next.type})`);
  asked.push({ questionType: next.type, questionAngle: next.angle });
 }
 assert.equal(new Set(asked.map(q => q.questionType)).size, 11);
 assert.ok(['tanimdan_terim', 'bosluk_doldurma', 'dogru_yargi', 'ilginc_bilgi'].every(t => asked.some(q => q.questionType === t)), 'yeni soru biçimleri de kullanılmalı');
 assert.equal(new Set(asked.map(q => q.questionAngle)).size, 5);
 // Paragraf sorusu hedeflendiyse tip korunur.
 assert.equal(variedTypeAndAngle({ asked: [{ questionType: 'paragraf' }] }, 'paragraf', 'saha_vakasi', 0).type, 'paragraf');
});

test('TEMPO_WEB_SUMMARY=0: internetten derlenen anlatım üretimde kullanılmaz', async () => {
 const withWeb = contexts.filter(c => Number.isInteger(c.webStart));
 assert.equal(withWeb.length, contexts.length, 'her bölümün internetten derlenmiş ek anlatımı olmalı');
 process.env.TEMPO_WEB_SUMMARY = '0';
 const off = await import(`../server/ollama.mjs?web=off${Date.now()}`);
 delete process.env.TEMPO_WEB_SUMMARY;
 try {
  const list = off.loadedContexts();
  assert.equal(list.length, contexts.length);
  for (const c of list) {
   const original = contexts.find(x => x.id === c.id);
   assert.equal(c.webStart, null);
   assert.deepEqual(c.webSources, []);
   assert.equal(c.text, original.text.slice(0, original.webStart).trimEnd());
  }
  assert.ok(mod.loadedContexts().every(c => Number.isInteger(c.webStart)), 'varsayılan ayarda internet anlatımı açıktır');
 } finally { try { off.stopOllamaLoops?.(); } catch {} }
});
