// SINAV TARZI ÖRNEKLERİ
// ---------------------------------------------------------------------------
// Kullanıcının gönderdiği örnek / çıkmış sorular (src/examSamples.json) ve kitapların kendi
// soruları, soru yazan modele "bu sınavda sorular nasıl soruluyor" örneği olarak verilir.
// Bu dosya: kalıp sınıflandırmasını, örnek seçimini, veri bütünlüğünü ve istem bloğunu sınar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyStemStyle, buildStyleLibrary, pickStyleExample, buildExamStyleBlock, styleLibraryStats, STYLE_FAMILIES, TYPE_STYLE_FAMILIES } from '../server/exam-style.mjs';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const contexts = read('../server/contexts.json');
const samples = read('../src/examSamples.json').samples;
const bank = read('../server/question-bank.json');
const bookQuestions = read('../server/book-style-questions.json').questions;

test('kök kalıbı sınıflandırması: gönderilen örnekler ve kitap soruları doğru aileye girer', () => {
 assert.equal(classifyStemStyle('Statik ya da dinamik hareketler sırasında, destek yüzeyi değişse dahi vücudun ağırlık merkezini kontrol altında tutarak istenen pozisyonu sürdürebilme ve postüral stabiliteyi koruyabilme yeteneği aşağıdakilerden hangisidir?'), 'tanim_terim');
 assert.equal(classifyStemStyle('Uzun süreli ve orta şiddette yapılan dayanıklılık egzersizlerinde enerji üretiminde aşağıdaki sistemlerden hangisi baskın olarak kullanılır?'), 'durum_kavram');
 assert.equal(classifyStemStyle('Teknik antrenmanda başarılı olunması için hangi antrenmanın iyi bir biçimde tamamlanması gerekmektedir?'), 'kisa_net');
 assert.equal(classifyStemStyle('Aşağıdakilerden hangisi performansın başlıca içsel faktörü değildir?'), 'olumsuz');
 assert.equal(classifyStemStyle('Sporcuların en yüksek sporsal verime ulaşmalarını sağlayan tüm sistematik hazırlanma yöntemlerine ……………………. denir.'), 'bosluk');
 assert.equal(classifyStemStyle('Mikro antrenman planlaması uygulanma aralığı haftada kaç keredir?', ['3-6', '7-9', '10-12', '13-15', '16-18']), 'sayisal');
 assert.equal(classifyStemStyle('I. Isınma II. Soğuma III. Ana bölüm Yukarıdakilerden hangileri birim antrenmanın bölümüdür?'), 'onculu');
 for (const family of Object.values(TYPE_STYLE_FAMILIES).flat()) assert.ok(STYLE_FAMILIES[family], `bilinmeyen aile: ${family}`);
});

test('gönderilen örnek sorular: doğru bölümde, tutarlı ve sabit soru bankasında', () => {
 assert.ok(samples.length >= 6);
 const ids = new Set(contexts.map(c => c.id));
 for (const s of samples) {
  assert.ok(ids.has(s.unitId), `${s.id}: bölüm yok (${s.unitId})`);
  assert.equal(s.options5.length, 5, `${s.id}: sınavdaki hâli 5 şıklı olmalı`);
  assert.equal(new Set(s.options5).size, 5);
  assert.equal(s.options.length, 4, `${s.id}: uygulamadaki hâli 4 şıklı olmalı`);
  assert.ok(s.options5.includes(s.answer) && s.options.includes(s.answer), `${s.id}: doğru cevap şıklarda olmalı`);
  assert.ok(s.options.every(o => s.options5.includes(o)), `${s.id}: 4 şık 5 şığın alt kümesi olmalı`);
  assert.ok(STYLE_FAMILIES[s.style], `${s.id}: kalıp ailesi`);
  assert.ok(bank.some(q => q.unitId === s.unitId && q.question === s.question && q.answer === s.answer), `${s.id}: sabit bankada olmalı`);
 }
 // Kullanıcının üç tam sorusu doğru bölümlere yerleşmiş olmalı.
 const unitOf = id => contexts.find(c => c.id === samples.find(s => s.id === id).unitId).unit;
 assert.equal(unitOf('ornek-hareket-denge'), 'Koordinatif özellikler');
 assert.equal(unitOf('ornek-saglik-aerobik'), 'Spor fizyolojisi');
 assert.equal(unitOf('cikmis-2024-teknik-antrenman'), 'Antrenmanı oluşturan ögeler');
 // Cevabı gönderilmeyen çıkmış soru işaretlidir; cevabı destekleyen cümle bölüm anlatımındadır.
 const past = samples.find(s => s.id === 'cikmis-2024-teknik-antrenman');
 assert.equal(past.answerVerified, false);
 assert.ok(past.note.length > 40);
 assert.match(contexts.find(c => c.id === past.unitId).text, /Geliştirilmemiş fiziksel yetersizlikler/);
 // Her örneğin doğru cevabı, yerleştirildiği bölümün anlatımında geçer (kaynak dışı kalmasın).
 for (const s of samples) {
  const text = contexts.find(c => c.id === s.unitId).text.toLocaleLowerCase('tr-TR');
  const key = s.answer.toLocaleLowerCase('tr-TR').split(/\s+/)[0];
  assert.ok(text.includes(key), `${s.id}: "${key}" bölüm anlatımında geçmeli`);
 }
});

test('örnek seçimi: uygun kalıp, önce aynı bölüm ve kullanıcı örneği; döndükçe değişir', () => {
 const library = buildStyleLibrary({ samples, bookQuestions });
 const stats = styleLibraryStats(library);
 assert.equal(stats.priority, samples.length);
 assert.equal(stats.units, contexts.length, 'her bölümün en az bir örneği olmalı');
 assert.ok(stats.total >= 290);
 for (const family of ['tanim_terim', 'durum_kavram', 'olumsuz', 'sayisal', 'bosluk', 'kisa_net']) assert.ok(stats.families[family] > 0, `${family} ailesinden örnek olmalı`);

 // Aynı bölüm + uygun aile varsa oradan; kullanıcı örneği kitap sorusundan önce gelir.
 const denge = pickStyleExample(library, { unitId: '0-4', questionType: 'tanimdan_terim', rotation: 0 });
 assert.equal(denge.answer, 'Denge');
 assert.equal(denge.priority, true);
 const aerobik = pickStyleExample(library, { unitId: '1-1', questionType: 'durum_kavram', rotation: 0 });
 assert.match(aerobik.question, /baskın olarak kullanılır/);
 const past = pickStyleExample(library, { unitId: '0-1', questionType: 'kisa_net', rotation: 0 });
 assert.match(past.origin, /çıkmış soru/);
 // Bölümde o aileden örnek yoksa aynı kitaptan / başka kitaptan alınır; aile yine uygundur.
 for (const c of contexts) {
  for (const [type, families] of Object.entries(TYPE_STYLE_FAMILIES)) {
   const e = pickStyleExample(library, { unitId: c.id, questionType: type, rotation: 3 });
   if (!families.length) { assert.equal(e, null, 'paragraf sorusuna örnek verilmez'); continue; }
   assert.ok(e, `${c.id}/${type}: örnek bulunmalı`);
  }
 }
 const istisna = pickStyleExample(library, { unitId: '0-0', questionType: 'istisna', rotation: 0 });
 assert.equal(istisna.family, 'olumsuz');
 assert.equal(istisna.unitId, '0-0');
 // Döndükçe farklı örnekler gelir.
 const seen = new Set();
 for (let r = 0; r < 12; r++) seen.add(pickStyleExample(library, { unitId: '0-0', questionType: 'kavram', rotation: r }).question);
 assert.ok(seen.size >= 3, `aynı bölümde örnekler dönmeli (${seen.size})`);
 assert.equal(pickStyleExample([], { unitId: '0-0', questionType: 'kavram' }), null);
});

test('istem bloğu: kısa, biçim için olduğunu söyler, kopyalamayı yasaklar', () => {
 const library = buildStyleLibrary({ samples, bookQuestions });
 for (const e of library) {
  const block = buildExamStyleBlock(e, { sameUnit: false });
  assert.ok(block.startsWith('\nSINAV TARZI ÖRNEĞİ ('));
  assert.ok(block.length <= 620, `blok kısa kalmalı (${block.length})`);
  assert.match(block, /BİÇİMİNİ örnek al/);
  assert.match(block, /KOPYALAMA/);
  assert.match(block, /başka bir konudandır/);
 }
 assert.doesNotMatch(buildExamStyleBlock(library[0], { sameUnit: true }), /başka bir konudandır/);
 assert.equal(buildExamStyleBlock(null), '');
});

test('sunucu: örnek kitaplığı yüklenir; yeni soru tipleri kullanılır; TEMPO_EXAM_STYLE=0 kapatır', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'tempo-examstyle-'));
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_OFFLINE_ONLY = '1';
 process.env.TEMPO_QUIET = '1';
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9';
 const mod = await import('../server/ollama.mjs');
 let off;
 try {
  const { stats, library } = mod.loadedExamStyle();
  assert.equal(stats.priority, samples.length);
  assert.ok(library.some(e => e.origin === '2024 1. Kademe çıkmış soru'));
  // Aynı cümleden art arda yazılan sorularda yeni tipler de sıraya girer.
  const asked = [];
  for (let i = 0; i < 13; i++) {
   const next = mod.variedTypeAndAngle({ asked }, 'kavram', 'dogrudan_tanim', i);
   asked.push({ questionType: next.type, questionAngle: next.angle });
  }
  assert.ok(['durum_kavram', 'kisa_net', 'tanimdan_terim'].every(t => asked.some(q => q.questionType === t)));
  process.env.TEMPO_EXAM_STYLE = '0';
  off = await import(`../server/ollama.mjs?style=off${Date.now()}`);
  delete process.env.TEMPO_EXAM_STYLE;
  assert.equal(off.loadedExamStyle().stats.total, 0);
 } finally {
  delete process.env.TEMPO_EXAM_STYLE;
  try { off?.stopOllamaLoops?.(); } catch {}
  try { mod.stopOllamaLoops?.(); } catch {}
  rmSync(dir, { recursive: true, force: true });
  setTimeout(() => process.exit(0), 50).unref();
 }
});
