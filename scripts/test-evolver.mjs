import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SandboxEvolver, GOLDEN_GOOD_CASES, GOLDEN_BAD_CASES} from '../server/sandbox-evolver.mjs';

test('SandboxEvolver: tehlikeli kodları, sonsuz döngüleri ve hatalı kuralları izole reddeder; geçerli evrimi uygular ve geri alır', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-evolver-'));
 try {
  const ev = new SandboxEvolver(dir);
  const initialPolicy = await ev.loadPolicy();
  assert.equal(initialPolicy.version, 1);

  // Altın iyi vakalar boş kuralla geçmeli
  for (const good of GOLDEN_GOOD_CASES) {
   assert.equal(ev.runSandboxedRule('', good, {id: '0-0'}).ok, true);
  }
  assert.ok(GOLDEN_BAD_CASES.length >= 1);

  // 1) Yasaklı sistem erişimi / dosya / process denemesi ASLA kabul edilmemeli
  for (const dangerous of [
   'function evaluateCandidate(c){ process.exit(1); return {ok:true}; }',
   'function evaluateCandidate(c){ const fs = require("fs"); return {ok:true}; }',
   'function evaluateCandidate(c){ eval("1+1"); return {ok:true}; }',
   'function evaluateCandidate(c){ import("node:fs"); return {ok:true}; }',
   'function evaluateCandidate(c){ new Function("return 1")(); return {ok:true}; }',
   'function evaluateCandidate(c){ globalThis.x = 1; return {ok:true}; }',
   'function evaluateCandidate(c){ fetch("http://127.0.0.1"); return {ok:true}; }'
  ]) {
   await assert.rejects(
    () => ev.applyEvolution({reason: 'Zararlı kod testi', customRuleCode: dangerous}, {source: 'test'}),
    /Güvenlik ihlali|yasaklı/i
   );
   assert.equal((await ev.loadPolicy()).version, 1);
  }

  // 2) Sonsuz döngü (CPU DoS) 40ms VM timeout içinde yakalanıp güvenli şekilde reddedilmeli
  await assert.rejects(
   () => ev.applyEvolution({reason: 'Sonsuz döngü testi', customRuleCode: 'function evaluateCandidate(c){ for(;;){} return {ok:true}; }'}, {source: 'test'})
  );
  assert.equal((await ev.loadPolicy()).version, 1);

  // 3) Sözdizimi hatalı kural reddedilmeli
  await assert.rejects(
   () => ev.applyEvolution({reason: 'Syntax hatası', customRuleCode: 'function evaluateCandidate(c){ if ((( return {ok:true}; }'}, {source: 'test'})
  );
  assert.equal((await ev.loadPolicy()).version, 1);

  // 4) İyi altın vakaları yanlışlıkla engelleyen aşırı katı kural reddedilmeli
  await assert.rejects(
   () => ev.applyEvolution({reason: 'Her şeyi reddet', customRuleCode: 'function evaluateCandidate(c){ return {ok:false, reason:"Tümünü engelle"}; }'}, {source: 'test'}),
   /Evrim güvenlik kapısı reddetti/
  );
  assert.equal((await ev.loadPolicy()).version, 1);

  // 5) Geçerli, güvenli ve altın iyi testleri geçen AI evrimi v2'ye geçmeli
  const v2 = await ev.applyEvolution({
   reason: 'Zayıf 0-1 ünitesine odaklan ve soru kökünde çok kısa kalanları önle',
   focusUnits: ['0-1', '1-0'],
   generatorAddendum: 'Tüm çeldiriciler aynı terim alanından olsun ancak yalnızca tek doğru cevap kalsın.',
   judgeAddendum: 'İki seçenek anlamca örtüşüyorsa dualAnswerRisk=true ver.',
   customRuleCode: 'function evaluateCandidate(c, unit) { if (c.question.length < 15) return {ok:false, reason:"Soru kökü çok kısa"}; return {ok:true}; }'
  }, {source: 'evolver-ai', evolverModel: 'fake:evolver'});
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.focusUnits, ['0-1', '1-0']);
  assert.equal(ev.runSandboxedRule(v2.customRuleCode, {question: 'Kısa?', options: ['A', 'B', 'C', 'D'], answer: 'A'}, {id: '0-0'}).ok, false);
  assert.equal(ev.runSandboxedRule(v2.customRuleCode, GOLDEN_GOOD_CASES[0], {id: '0-0'}).ok, true);

  // 6) Öğrenci profil güncellemesi zayıf üniteleri kaydetmeli ve kalıcı olmalı
  const savedProfile = await ev.saveStudentProfile({
   studiedUnits: ['0-0', '0-1'],
   weakUnits: ['0-1', '1-2'],
   accuracyPct: 68
  });
  assert.ok(savedProfile.weakUnits.includes('0-1'));
  assert.equal(savedProfile.accuracyPct, 68);

  // 7) Geri alma v2'deki özel kuralı kaldırıp v1 ayarlarına güvenle dönmeli
  const restored = await ev.rollback();
  assert.equal(restored.source, 'rollback');
  assert.equal(restored.customRuleCode, '');
  assert.deepEqual(restored.focusUnits, []);

  // Kalıcılık kontrolü
  const ev2 = new SandboxEvolver(dir);
  assert.ok((await ev2.loadStudentProfile()).weakUnits.includes('1-2'));
  assert.equal((await ev2.loadPolicy()).customRuleCode, '');
 } finally {
  await rm(dir, {recursive: true, force: true});
 }
});
