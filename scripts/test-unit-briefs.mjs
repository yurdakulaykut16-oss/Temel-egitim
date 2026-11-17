// EZBER ÖZETİ KAPSAMA TESTİ
// ---------------------------------------------------------------------------
// Ders sayfasındaki kısa özet (src/unitBriefs.json) kitaptaki HİÇBİR başlığı atlamamalı ve
// ezberlenebilir kısalıkta kalmalı. Kitap başlıklarının kaynağı: src/bookToc.json (PDF'lerden çıkarılır).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = async name => JSON.parse(await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8'));
const toc = await read('bookToc.json');
const briefs = await read('unitBriefs.json');
const hasOwn = s => s.points.length > 0 || (s.list?.length || 0) > 0 || (s.notes?.length || 0) > 0;

test('her ünitenin her kitap başlığı özette vardır (eksik ya da fazla başlık yok)', () => {
 assert.deepEqual(Object.keys(briefs).sort(), Object.keys(toc).sort());
 let total = 0;
 for (const [id, unit] of Object.entries(toc)) {
  const sections = briefs[id].sections;
  assert.equal(sections.length, unit.sections.length, `${id}: başlık sayısı`);
  assert.deepEqual(sections.map(s => s.i).sort((a, b) => a - b), unit.sections.map((_, i) => i), `${id}: her başlık tam bir kez`);
  for (const s of sections) {
   assert.equal(s.title, unit.sections[s.i].title, `${id}#${s.i}: başlık metni kitaptakiyle aynı`);
   assert.equal(s.level, unit.sections[s.i].level, `${id}#${s.i}: başlık düzeyi`);
  }
  total += sections.length;
 }
 assert.ok(total >= 700, `toplam başlık: ${total}`);
});

test('içeriksiz başlık kalmaz: her başlığın kendi cümlesi/listesi ya da içerikli alt başlığı vardır', () => {
 const empty = [];
 for (const [id, unit] of Object.entries(briefs)) {
  unit.sections.forEach((s, pos) => {
   if (hasOwn(s)) return;
   // Kendi metni olmayan başlık: hemen ardından gelen daha derin başlık içerik taşımalı.
   const next = unit.sections[pos + 1];
   if (!(next && next.level > s.level && (hasOwn(next) || unit.sections.slice(pos + 1).some(x => hasOwn(x))))) empty.push(`${id} ${s.title}`);
  });
 }
 assert.deepEqual(empty, []);
});

test('özet ezberlenebilir kısalıktadır: başlık başına en çok 3 cümle, açık görünen en çok 10 madde, cümleler kısa', () => {
 let points = 0, items = 0, chars = 0, long = 0;
 for (const [id, unit] of Object.entries(briefs)) {
  for (const s of unit.sections) {
   assert.ok(s.points.length <= 3, `${id} ${s.title}: ${s.points.length} cümle`);
   // Kitaptaki maddelerin tamamı saklanır (atlanan madde olmaz); arayüz ilk 8-10 maddeyi açık gösterir.
   assert.equal(s.listMore, undefined, `${id} ${s.title}: ${s.listMore} madde özete alınmamış`);
   assert.ok((s.list?.length || 0) <= 80, `${id} ${s.title}: ${s.list?.length} madde`);
   for (const p of s.points) {
    assert.ok(p.length <= 300, `${id} ${s.title}: ${p.length} karakterlik cümle`);
    assert.ok(p.trim().length >= 12, `${id} ${s.title}: boş cümle`);
    points++; chars += p.length; if (p.length > 200) long++;
   }
   (s.list || []).forEach((x, n) => { assert.ok(x.length <= 152, `${id} ${s.title}: ${x.length} karakterlik madde`); items++; if (n < 10) chars += x.length; });
  }
 }
 const headings = Object.values(briefs).reduce((n, u) => n + u.sections.length, 0);
 // Başlık başına ortalama: 2 cümleden az, açık görünen metin 400 karakterden az.
 assert.ok(points / headings < 2, `başlık başına cümle: ${(points / headings).toFixed(2)}`);
 assert.ok(chars / headings < 400, `başlık başına karakter: ${Math.round(chars / headings)}`);
 assert.ok(long / points < 0.05, `200 karakteri aşan cümle oranı: ${(long / points).toFixed(3)}`);
});

test('her ünite 3-8 ana konuya (ezber kartına) ayrılır ve ilk başlık ana konudur', () => {
 for (const [id, unit] of Object.entries(briefs)) {
  assert.equal(unit.sections[0].level, 2, `${id}: ilk başlık 2. düzey olmalı`);
  const groups = unit.sections.filter(s => s.level === 2).length;
  assert.ok(groups >= 2 && groups <= 10, `${id}: ${groups} ana konu`);
 }
});

test('"Terim: tanım" biçiminde sayılan kavramlar adlarıyla korunur ve "dikkat" kutuları atılmaz', () => {
 let withTerms = 0, notes = 0;
 for (const unit of Object.values(briefs)) {
  for (const s of unit.sections) {
   if (s.terms) {
    withTerms++;
    assert.ok(s.terms.length >= 2 && s.terms.length <= 16);
    assert.equal(new Set(s.terms.map(t => t.toLocaleLowerCase('tr-TR'))).size, s.terms.length, `${s.title}: yinelenen kavram`);
   }
   notes += s.notes?.length || 0;
  }
 }
 assert.ok(withTerms >= 40, `kavram listesi olan başlık: ${withTerms}`);
 assert.ok(notes >= 80, `dikkat notu: ${notes}`);
});
