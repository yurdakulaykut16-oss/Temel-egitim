/**
 * Kaynak temellendirme (grounding) motoru.
 *
 * AMAÇ: Havuza giren hiçbir soru, öğrencinin çalışma materyalinin dışına çıkmasın.
 * Bir soru iki kaynağa göre ölçülür:
 *   1) KONU ANLATIM ÖZETİ  -> server/contexts.json (ünite anlatımı + genişletmeler + kitap notları)
 *   2) KİTAP PASAJLARI     -> server/book-passages.json (kitabın o ünitesinden çıkarılmış gerçek metin)
 *
 * Soru kökünün ve doğru cevabın kavram sözcükleri bu iki kaynağın birleşiminde
 * aranır. Kök/cevap kaynakta geçmiyorsa soru "uydurma/hayalî" kabul edilir ve
 * üretim hattında REDDEDİLİR; statik banka ve resmî kitap sorularında ise yalnızca
 * "kaynak dışı" olarak işaretlenir (kullanıcı isterse testlerden çıkarabilir).
 *
 * Ölçüt: 0.4 * cevapKapsama + 0.6 * kökKapsama  (0..1)
 * Varsayılan eşik 0.55 — ölçüme göre:
 *   - statik banka (335 soru): en düşük 0.45, medyan 0.90  -> eşik 2 soruyu işaretler
 *   - resmî kitap soruları (268): en düşük 0.42, medyan 0.96 -> eşik 2 soruyu işaretler
 *   - alakasız/uydurma kontrol soruları: 0.00 - 0.52       -> tamamı elenir
 */
import { readFile } from 'node:fs/promises';

export const SUMMARY_GROUNDING_DEFAULT_MIN = 0.55;
export const SUMMARY_GROUNDING_WEIGHTS = { answer: 0.4, stem: 0.6 };

const norm = s => (typeof s === 'string' ? s : '')
  .toLocaleLowerCase('tr-TR')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

/**
 * Soru kalıbı gürültüsü: "aşağıdakilerden hangisi", "değildir" gibi sözcükler her
 * soruda geçtiği için kavram ölçümünü şişirir; ölçüme katılmazlar.
 */
const BOILERPLATE = new Set([
  'aşağıdakilerden', 'aşağıdaki', 'aşağıda', 'yukarıdakilerden', 'yukarıdaki', 'yukarıda',
  'hangisi', 'hangisidir', 'hangisinde', 'hangisinin', 'hangileri', 'hangilerinden', 'hangi',
  'verilen', 'verilmiş', 'verilmiştir', 'verilir', 'verilenler', 'belirtilen', 'belirtilmiştir',
  'ifade', 'eden', 'edilen', 'eder', 'etmek', 'edenler', 'ettiği',
  'değildir', 'yanlıştır', 'doğrudur', 'söylenemez', 'bulunamaz', 'yer', 'almaz', 'alır',
  'arasında', 'arasındaki', 'dışında', 'sayılır', 'denir', 'adlandırılır',
  'olan', 'olduğu', 'olduğunu', 'olduğuna', 'olmayan', 'olanı', 'olanların',
  'şeklinde', 'biçiminde', 'biçimde', 'şekliyle', 'sırasında', 'sonucunda', 'sonucu',
  'tümü', 'hepsi', 'hiçbiri', 'şunlardan', 'bunlardan', 'bunlar', 'şunlar',
  'yapılan', 'yapılması', 'yapılanlar', 'gerçekleşen', 'gerçekleşenler', 'kullanılan', 'bulunan',
  'ilişkin', 'ait', 'üzere', 'karşı', 'karşın', 'rağmen', 'dolayı', 'nedeniyle',
  'sonra', 'önce', 'birlikte', 'beraber', 'arası', 'içinde', 'üzerinde', 'altında',
  'göre', 'için', 'gibi', 'kadar', 'daha', 'ile', 've', 'veya', 'yahut',
  'ancak', 'fakat', 'lakin', 'ise', 'hem', 'ne', 'çok', 'az', 'yeni', 'aynı', 'farklı',
  'olarak', 'şekil', 'süreç', 'sistem', 'yöntem', 'temel', 'temelleri', 'durum', 'tarih',
  'bu', 'şu', 'her', 'tüm', 'bütün', 'ya', 'da', 'de', 'mi', 'mı', 'mu', 'mü',
  'yoksa', 'yada', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz',
  'hangisinin', 'doğru', 'yanlış', 'verilmiştir', 'söylenebilir', 'söylenir', 'bulunur', 'vardır', 'yoktur',
  // Paralel soru motorunun yeniden yazım kalıplarından gelen biçimsel gürültü
  'seçeneklerden', 'seçenekleri', 'seçeneğinde', 'kapsamında', 'kapsamındaki',
  'ünitenin', 'ünitesinin', 'ünitesinde', 'kitaba', 'eğitiminde', 'eğitimde', 'alanında', 'konusunda'
]);

/** Kavram sözcüğü çıkarımı: en az 4 harf, kalıp gürültüsü değil, salt sayı değil. */
export function contentTokens(text) {
  const raw = norm(text)
    .split(' ')
    .filter(w => w.length >= 4 && !BOILERPLATE.has(w) && !/^\d+$/.test(w));
  return [...new Set(raw.map(w => w.slice(0, 7)))];
}

function ratioCovered(tokens, haystacks) {
  if (!tokens.length) return 1;
  let hit = 0;
  for (const w of tokens) {
    let found = false;
    for (const hay of haystacks) {
      if (hay.includes(w)) { found = true; break; }
    }
    if (found) hit++;
  }
  return hit / tokens.length;
}

/**
 * @param {{contexts:Array<{id:string,text:string}>, passagesByUnit:Map<string,Array<{text:string}>>, minScore?:number}} opts
 */
export function createSummaryGrounding({ contexts = [], passagesByUnit = new Map(), minScore = SUMMARY_GROUNDING_DEFAULT_MIN } = {}) {
  const summaryNorm = new Map();
  for (const ctx of contexts) summaryNorm.set(ctx.id, norm(ctx?.text || ''));
  const bookNorm = new Map();
  for (const [unitId, list] of passagesByUnit.entries()) {
    bookNorm.set(unitId, norm((list || []).map(p => p?.text || '').join(' ')));
  }
  const limit = Number.isFinite(Number(minScore)) ? Math.min(1, Math.max(0, Number(minScore))) : SUMMARY_GROUNDING_DEFAULT_MIN;

  /** Birimin kaynak havuzları: [konu anlatım özeti, kitap pasajları]. */
  function sourcesFor(unitId) {
    const sum = summaryNorm.get(unitId);
    const book = bookNorm.get(unitId) || '';
    return { summary: sum, book, has: sum !== undefined, stacks: [sum || '', book].filter(Boolean) };
  }

  /**
   * @returns {{score:number, answerScore:number, stemScore:number, summaryScore:number, missing:string[], tokens:string[]}|null}
   */
  function scoreItem(item) {
    if (!item || typeof item.question !== 'string') return null;
    const unitId = item.unitId;
    const { has, summary, stacks } = sourcesFor(unitId);
    if (!has || !stacks.length) return null;
    const answerTokens = contentTokens(item.answer || '');
    const stemTokens = contentTokens(item.question);
    const optionTokens = contentTokens((Array.isArray(item.options) ? item.options : []).join(' '));
    // Kavram ağırlığı: doğru cevap + soru kökü. Şıklar yalnızca kök çok kısa olduğunda
    // (ör. boşluk doldurma) ölçüme destek olur; tek başına kapsamayı şişirmesin.
    const stemPool = stemTokens.length >= 2 ? stemTokens : [...new Set([...stemTokens, ...optionTokens])].slice(0, 8);
    const answerScore = ratioCovered(answerTokens, stacks);
    const stemScore = ratioCovered(stemPool, stacks);
    const summaryScore = ratioCovered([...answerTokens, ...stemPool], [summary || '']);
    const missing = [...answerTokens, ...stemPool].filter(w => !stacks.some(h => h.includes(w)));
    const score = SUMMARY_GROUNDING_WEIGHTS.answer * answerScore + SUMMARY_GROUNDING_WEIGHTS.stem * stemScore;
    return {
      score: Math.max(0, Math.min(1, score)),
      answerScore,
      stemScore,
      summaryScore,
      missing: missing.slice(0, 8),
      tokens: stemPool
    };
  }

  /**
   * Üretim hattı için sert kapı. Kaynak dışı soruyu Türkçe gerekçeyle reddeder.
   */
  function evaluate(item) {
    const res = scoreItem(item);
    if (!res) return { ok: true, skipped: true, score: null };
    if (res.score >= limit) return { ok: true, score: res.score, ...res };
    const pct = n => `%${Math.round(n * 100)}`;
    const missingList = res.missing.slice(0, 4).join(', ');
    return {
      ok: false,
      score: res.score,
      ...res,
      reason: `Soru konu anlatım özetinde ve kitap pasajlarında yeterince karşılığı olmayan kavramlar içeriyor (kaynak kapsaması ${pct(res.score)}, eşik ${pct(limit)})${missingList ? `; kaynakta bulunamayan: ${missingList}` : ''}. YALNIZCA konu anlatımı ve kitapta geçen kavramlardan soru kur.`
    };
  }

  /** Listeyi `grounding` alanıyla zenginleştirir (statik banka / kitap soruları için). */
  function annotate(list) {
    for (const item of list) {
      const res = scoreItem(item);
      if (!res) continue;
      item.grounding = {
        score: Number(res.score.toFixed(3)),
        answerScore: Number(res.answerScore.toFixed(3)),
        stemScore: Number(res.stemScore.toFixed(3)),
        summaryScore: Number(res.summaryScore.toFixed(3)),
        inSource: res.score >= limit
      };
      if (res.score < limit && Array.isArray(res.missing) && res.missing.length) {
        item.grounding.missingTerms = res.missing.slice(0, 5);
      }
    }
    return list;
  }

  return {
    minScore: limit,
    scoreItem,
    evaluate,
    annotate,
    score: scoreItem,
    stats() {
      return { units: summaryNorm.size, bookUnits: bookNorm.size, minScore: limit };
    }
  };
}

/**
 * Sunucu modülleri için hazır örnek: server/contexts.json + server/book-passages.json okur.
 */
export async function loadSummaryGrounding({ minScore } = {}) {
  const [contexts, bookPassages] = await Promise.all([
    readFile(new URL('./contexts.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => []),
    readFile(new URL('./book-passages.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => null)
  ]);
  const passagesByUnit = new Map();
  for (const unit of (bookPassages?.units || [])) passagesByUnit.set(unit.id, unit.passages || []);
  return createSummaryGrounding({ contexts, passagesByUnit, minScore });
}
