#!/usr/bin/env node
/**
 * Kitap paraleli soru havuzunu kurar ve TÜM havuzu kaynak temellendirme puanıyla işaretler.
 *
 * 1) server/book-style-questions.json  -> kitabın kendi "Neler Öğrendik?" soruları
 * 2) server/book-parallel-engine.mjs   -> bu sorulardan yeniden yazılmış paralel sorular
 * 3) server/summary-grounding.mjs      -> her sorunun "konu anlatım özeti + kitap pasajı"
 *                                          kapsama puanı (özetlerde olmayan bilgi sorma!)
 *
 * Çıktı: server/book-parallel-questions.json ve, grounding alanı eklenmiş olarak,
 * server/book-style-questions.json + server/question-bank.json.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { buildParallelPool } from '../server/book-parallel-engine.mjs';
import { loadSummaryGrounding, SUMMARY_GROUNDING_DEFAULT_MIN } from '../server/summary-grounding.mjs';

const save = async (path, data) => {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const main = async () => {
  const [bookRaw, bankRaw] = await Promise.all([
    readFile(new URL('../server/book-style-questions.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../server/question-bank.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  const bookQuestions = Array.isArray(bookRaw?.questions) ? bookRaw.questions : [];

  const grounding = await loadSummaryGrounding();
  const parallels = buildParallelPool(bookQuestions);

  grounding.annotate(bookQuestions);
  const bankList = Array.isArray(bankRaw) ? bankRaw : [];
  grounding.annotate(bankList);
  // Paralel soru, kaynak sorunun AYNI bilgisini farklı lafızla ölçer; yeniden yazım
  // yalnızca biçimsel sözcük eklediği için kaynak sorunun kapsama puanı geçerlidir.
  // Yine de kendi metni daha yüksek puan veriyorsa o kullanılır.
  const seedById = new Map(bookQuestions.map(q => [q.id, q]));
  for (const par of parallels) {
    grounding.annotate([par]);
    const seed = seedById.get(par.sourceQuestionId);
    const own = par.grounding;
    const inherited = seed?.grounding;
    if (own && inherited && inherited.score > own.score) {
      par.grounding = { ...inherited, inheritedFrom: par.sourceQuestionId };
    } else if (own) {
      par.grounding = { ...own, source: 'self' };
    }
  }

  const lowBook = bookQuestions.filter(q => q.grounding && !q.grounding.inSource);
  const lowPar = parallels.filter(q => q.grounding && !q.grounding.inSource);
  const lowBank = bankList.filter(q => q.grounding && !q.grounding.inSource);

  const parallelPayload = {
    version: 1,
    generatedBy: 'scripts/build-book-parallels.mjs',
    note: 'Kitabın resmî "Neler Öğrendik?" sorularından yeniden yazılmış paralel sorular. Aynı kavramı ve kitabın kendi çeldiricilerini kullanır; kök farklı yazılır ve şık sırası karışıktır.',
    sourceTotal: bookQuestions.length,
    totalQuestions: parallels.length,
    unitsCovered: new Set(parallels.map(q => q.unitId)).size,
    groundingMinScore: grounding.minScore,
    questions: parallels
  };

  await Promise.all([
    save(new URL('../server/book-parallel-questions.json', import.meta.url), parallelPayload),
    save(new URL('../server/book-style-questions.json', import.meta.url), {
      ...bookRaw,
      groundingMinScore: grounding.minScore,
      outOfSourceCount: lowBook.length,
      questions: bookQuestions
    }),
    save(new URL('../server/question-bank.json', import.meta.url), bankList)
  ]);

  console.log(`Paralel soru havuzu: ${bookQuestions.length} kitap sorusundan ${parallels.length} paralel üretildi (${parallelPayload.unitsCovered} ünite).`);
  console.log(`Kaynak temellendirme (eşik %${Math.round(SUMMARY_GROUNDING_DEFAULT_MIN * 100)}): kitap ${lowBook.length}/${bookQuestions.length}, paralel ${lowPar.length}/${parallels.length}, banka ${lowBank.length}/${bankList.length} soru kaynak dışı işaretlendi.`);
  for (const q of [...lowBank, ...lowBook].slice(0, 6)) {
    console.log(`   · ${q.unitId} ${String(q.grounding?.score)} :: ${String(q.question).slice(0, 80)}`);
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
