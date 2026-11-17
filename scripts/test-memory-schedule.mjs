// KALICI EZBER PLANI: bugün öğrenilen konu yarın gelir; hatırlandıkça aralık büyür.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// src/memory.ts tarayıcı kodudur; test için JS'e çevrilip bellekten yüklenir.
const source = await readFile(new URL('../src/memory.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const mem = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 15, 9, 0, 0);

test('yeni öğrenilen kartın ilk tekrarı tam bir gün sonradır', () => {
 const r = mem.firstReview(NOW);
 assert.equal(r.due - NOW, DAY);
 assert.equal(mem.cardDue({ '0-0#0': r }, '0-0#0', '0-0', NOW) > NOW, true, 'bugün yeniden sorulmaz');
 assert.equal(mem.cardDue({ '0-0#0': r }, '0-0#0', '0-0', NOW + DAY) <= NOW + DAY, true, 'yarın sorulur');
});

test('hatırlandıkça aralık 1 → 3 → 7 → 14 → 30 → 60 → 120 → 240 → 365 gün büyür', () => {
 let r = mem.firstReview(NOW), t = NOW;
 const gaps = [(r.due - t) / DAY];
 for (let i = 0; i < 9; i++) { t = r.due; r = mem.schedule(r, true, t); gaps.push((r.due - t) / DAY); }
 assert.deepEqual(gaps, [1, 3, 7, 14, 30, 60, 120, 240, 365, 365]);
});

test('“tekrar etmeliyim” kartı 10 dakika sonraya alır ve merdiveni baştan başlatır', () => {
 const learned = mem.schedule(mem.schedule(mem.firstReview(NOW), true, NOW + DAY), true, NOW + 4 * DAY);
 const again = mem.schedule(learned, false, NOW + 11 * DAY);
 assert.equal(again.due - (NOW + 11 * DAY), 10 * 60_000);
 const back = mem.schedule(again, true, again.due);
 assert.equal((back.due - again.due) / DAY, 1, 'yeniden hatırlanınca yine ertesi gün');
});

test('kaydı olmayan kart: ünitenin eski planını izler, o da yoksa hemen tekrar edilir', () => {
 assert.equal(mem.cardDue({}, '1-2#4', '1-2', NOW), 0);
 const unit = { stage: 3, due: NOW + 5 * DAY, reviewed: NOW - DAY };
 assert.equal(mem.cardDue({ '1-2': unit }, '1-2#4', '1-2', NOW), unit.due);
});

test('ünite testinde yanlış yapılınca o ünitenin planlı kartları öne alınır; kart yeniden çalışılınca kendi planına döner', () => {
 const card = mem.firstReview(NOW);
 const wrongAt = NOW + 3_600_000;
 const reviews = { '2-1#0': card, '2-1': mem.prioritize(wrongAt) };
 assert.equal(mem.cardDue(reviews, '2-1#0', '2-1', wrongAt), wrongAt, 'yanlıştan sonra hemen sırada');
 const after = { ...reviews, '2-1#0': mem.schedule(card, true, wrongAt + 60_000) };
 assert.ok(mem.cardDue(after, '2-1#0', '2-1', wrongAt + 120_000) > wrongAt + 120_000, 'çalışılan kart yeniden sıraya girmez');
});

test('bozuk kayıtlar yüklenirken atılır, kart kimlikleri (ünite#başlık) korunur', () => {
 const raw = JSON.stringify({ '0-0#3': { stage: 1, due: NOW + DAY, reviewed: NOW }, bad: { stage: 'x' }, '0-1': null });
 assert.deepEqual(Object.keys(mem.loadReviews(raw)), ['0-0#3']);
});
