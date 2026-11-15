/**
 * Model çıktısı onarımı (belirlenimci, model çağrısı yok).
 *
 * Yerel modeller içerik olarak doğru bir soru yazsa bile biçimde küçük sapmalar yapar:
 * cevabı "B" diye verir, şıkların başına "A)" koyar, kanıt cümlesini bir iki kelime
 * değiştirerek aktarır, boolean yerine "true" yazar… Eski hat bunların hepsinde soruyu
 * çöpe atıyordu. Buradaki onarımlar İÇERİĞİ DEĞİŞTİRMEZ; yalnızca biçimi düzeltir ve
 * kanıtı kaynak metindeki GERÇEK cümleyle değiştirir. Onarılamayan taslak yine reddedilir.
 */

const TR = 'tr-TR';

export const normTr = s => (typeof s === 'string' ? s : '')
 .toLocaleLowerCase(TR)
 .replace(/[^\p{L}\p{N}]+/gu, ' ')
 .trim()
 .replace(/\s+/g, ' ');

const STOP = new Set(['ve', 'veya', 'ile', 'bir', 'bu', 'şu', 'o', 'de', 'da', 'ki', 'için', 'gibi', 'olan', 'olarak', 'ise', 'en', 'çok', 'daha', 'her', 'ya', 'hem', 'ne', 'mi', 'mı', 'mu', 'mü', 'dir', 'dır', 'ancak', 'ama', 'göre', 'kadar', 'sonra', 'önce', 'ile', 'den', 'dan', 'the', 'of']);

/** Kaba Türkçe gövdeleme: ekleri atmak için kelimenin ilk 5 harfi (çekim eklerine dayanıklı). */
function tokens(s) {
 return normTr(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w)).map(w => (w.length > 5 ? w.slice(0, 5) : w));
}

const OPTION_LABEL_RE = /^\s*(?:\(?([A-Da-d])\)|([A-Da-d])[.):\-]|\(?([1-4])\)|([1-4])[.):\-])\s+/;

/** "A) metin" / "1. metin" biçimindeki şık etiketlerini (dört şıkta da varsa) temizler. */
export function stripOptionLabels(options) {
 if (!Array.isArray(options) || options.length !== 4 || options.some(o => typeof o !== 'string')) return options;
 if (!options.every(o => OPTION_LABEL_RE.test(o))) return options;
 const stripped = options.map(o => o.replace(OPTION_LABEL_RE, '').trim());
 // Etiketler A,B,C,D / 1,2,3,4 sırasında değilse dokunma (şıkların kendisi olabilir: "1 dakika").
 const labels = options.map(o => {
  const m = o.match(OPTION_LABEL_RE);
  return (m[1] || m[2] || m[3] || m[4] || '').toUpperCase();
 });
 const seq = labels.join('');
 if (seq !== 'ABCD' && seq !== '1234') return options;
 return stripped.every(o => o.length >= 1) ? stripped : options;
}

/**
 * Modelin "answer" alanını dört şıktan birine eşler.
 * Sırasıyla: birebir → normalleştirilmiş eşitlik → harf/sıra numarası → etiketli metin → tekil kapsama.
 * Eşlenemezse null.
 */
export function resolveOptionAnswer(answer, options) {
 if (!Array.isArray(options) || !options.length) return null;
 if (typeof answer === 'number' && Number.isInteger(answer)) {
  if (answer >= 1 && answer <= options.length) return options[answer - 1];
  return null;
 }
 if (typeof answer !== 'string') return null;
 const raw = answer.trim();
 if (!raw) return null;
 if (options.includes(raw)) return raw;
 const n = normTr(raw);
 const normOpts = options.map(normTr);
 let idx = normOpts.indexOf(n);
 if (idx !== -1) return options[idx];
 // "B", "b)", "(C)", "Seçenek D", "3"
 const letter = raw.match(/^(?:seçenek|şık|cevap|yanıt)?\s*\(?([A-Da-d])\)?[.):]?$/i);
 if (letter) {
  idx = letter[1].toUpperCase().charCodeAt(0) - 65;
  return idx < options.length ? options[idx] : null;
 }
 const digit = raw.match(/^\(?([1-4])\)?[.):]?$/);
 if (digit) {
  // Şıkların kendisi sayıysa ("3") sayı bir şık metnidir; yukarıda yakalanmış olurdu.
  idx = Number(digit[1]) - 1;
  return idx < options.length ? options[idx] : null;
 }
 // "B) Süperkompansasyon"
 const labelled = raw.replace(OPTION_LABEL_RE, '').trim();
 if (labelled !== raw) {
  idx = normOpts.indexOf(normTr(labelled));
  if (idx !== -1) return options[idx];
 }
 // Tek bir şık cevabı kapsıyor ya da cevap tek bir şıkkı kapsıyorsa (ör. sondaki nokta, tırnak, ek açıklama).
 if (n.length >= 6) {
  const hits = normOpts.map((o, i) => ((o.length >= 4 && (n === o || n.startsWith(`${o} `) || o.startsWith(`${n} `))) ? i : -1)).filter(i => i !== -1);
  if (hits.length === 1) return options[hits[0]];
 }
 return null;
}

/** Kaynak metni cümlelere böler (madde işaretleri ve satır sonları da ayırıcıdır). */
export function splitSentences(text) {
 return String(text || '')
  .replace(/\r/g, '')
  .split(/(?<=[.!?…])\s+|\n+|\s+[•●▪■◦]\s+/)
  .map(x => x.trim())
  .filter(x => x.length >= 20 && x.length <= 480);
}

/**
 * Kanıt alıntısını kaynakta arar; birebir bulunamazsa en çok örtüşen GERÇEK kaynak
 * cümlesini döndürür. Örtüşme zayıfsa null (kanıt uydurulmaz).
 *
 * @returns {{evidence:string, repaired:boolean, score:number}|null}
 */
export function repairEvidence(evidence, sourceText, { answer = '', minScore = 0.55 } = {}) {
 const src = String(sourceText || '');
 if (!src.trim()) return null;
 const ev = typeof evidence === 'string' ? evidence.trim().replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim() : '';
 const srcNorm = normTr(src);
 const evNorm = normTr(ev);
 if (evNorm.length >= 15 && srcNorm.includes(evNorm)) {
  return { evidence: ev.slice(0, 480), repaired: false, score: 1 };
 }
 const evTok = tokens(ev);
 const ansTok = tokens(answer);
 if (evTok.length < 3 && ansTok.length < 2) return null;
 const evSet = new Set(evTok);
 const ansSet = new Set(ansTok);
 let best = null;
 for (const sentence of splitSentences(src)) {
  const st = new Set(tokens(sentence));
  if (st.size < 3) continue;
  let evHit = 0;
  for (const t of evSet) if (st.has(t)) evHit++;
  let ansHit = 0;
  for (const t of ansSet) if (st.has(t)) ansHit++;
  // Kanıtın ne kadarı bu cümlede geçiyor (ağırlık 0.8) + doğru cevabın terimleri (0.2).
  const evRatio = evSet.size ? evHit / evSet.size : 0;
  const ansRatio = ansSet.size ? ansHit / ansSet.size : 0;
  const score = evSet.size >= 3 ? evRatio * 0.8 + ansRatio * 0.2 : ansRatio * 0.6;
  if (!best || score > best.score) best = { sentence, score };
 }
 if (!best || best.score < minScore) return null;
 return { evidence: best.sentence.slice(0, 480), repaired: true, score: +best.score.toFixed(3) };
}

const clean = s => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s);

/**
 * Üretici taslağını biçimce onarır. Dönüş: { draft, fixes[] }.
 * Yapısal olarak kurtarılamayan taslak aynen döner (asıl doğrulama validate() içindedir).
 */
export function normalizeDraft(raw, sourceText = '') {
 const fixes = [];
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { draft: raw, fixes };
 const d = { ...raw };

 // Bazı modeller alan adlarını Türkçe/alternatif yazar.
 const alias = { soru: 'question', secenekler: 'options', 'seçenekler': 'options', choices: 'options', cevap: 'answer', dogru_cevap: 'answer', correct_answer: 'answer', correctAnswer: 'answer', aciklama: 'explanation', 'açıklama': 'explanation', kanit: 'evidence', 'kanıt': 'evidence', konu: 'topic' };
 for (const [from, to] of Object.entries(alias)) {
  if (d[to] === undefined && d[from] !== undefined) { d[to] = d[from]; delete d[from]; fixes.push(`alan:${from}`); }
 }

 // options: nesne ({A:..,B:..}) ya da {text:..} dizisi gelirse düz metin dizisine çevir.
 if (d.options && !Array.isArray(d.options) && typeof d.options === 'object') {
  const keys = Object.keys(d.options);
  if (keys.length === 4) { d.options = keys.sort().map(k => d.options[k]); fixes.push('options:object'); }
 }
 if (Array.isArray(d.options)) {
  d.options = d.options.map(o => (o && typeof o === 'object' ? (o.text ?? o.option ?? o.value ?? '') : o)).map(o => (typeof o === 'number' ? String(o) : o)).map(clean);
  const stripped = stripOptionLabels(d.options);
  if (stripped !== d.options) { d.options = stripped; fixes.push('options:labels'); }
 }

 for (const key of ['question', 'explanation', 'topic', 'evidence']) {
  if (typeof d[key] === 'string') d[key] = key === 'question' ? d[key].trim() : clean(d[key]);
 }
 if (typeof d.paragraph === 'string') d.paragraph = d.paragraph.trim();

 // answer → şıklardan biri
 if (Array.isArray(d.options) && d.options.length === 4) {
  const resolved = resolveOptionAnswer(d.answer, d.options);
  if (resolved && resolved !== d.answer) { d.answer = resolved; fixes.push('answer:mapped'); }
 }
 if (typeof d.answer === 'string') d.answer = clean(d.answer);

 // topic boşsa kısa bir konu adı türet (soru reddedilmesin diye değil; alan zorunlu olduğu için).
 if ((typeof d.topic !== 'string' || d.topic.trim().length < 4) && typeof d.answer === 'string' && d.answer.trim().length >= 4) {
  d.topic = d.answer.trim().slice(0, 80);
  fixes.push('topic:derived');
 }

 // evidence → kaynak metindeki gerçek cümle
 if (sourceText && typeof d.answer === 'string') {
  const rep = repairEvidence(d.evidence, sourceText, { answer: `${d.answer} ${typeof d.explanation === 'string' ? d.explanation : ''}` });
  if (rep) {
   if (rep.repaired) fixes.push('evidence:repaired');
   d.evidence = rep.evidence;
  }
 }
 return { draft: d, fixes };
}

const toBool = v => {
 if (typeof v === 'boolean') return v;
 if (typeof v === 'string') {
  const t = v.trim().toLocaleLowerCase(TR);
  if (['true', 'evet', 'doğru', 'dogru', 'yes', '1'].includes(t)) return true;
  if (['false', 'hayır', 'hayir', 'yanlış', 'yanlis', 'no', '0'].includes(t)) return false;
 }
 if (v === 1) return true;
 if (v === 0) return false;
 return v;
};

const toNum = v => {
 if (typeof v === 'number') return v;
 if (typeof v === 'string') {
  const m = v.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (m) return Number(m[0]);
 }
 return v;
};

const DIFF_MAP = { kolay: 'kolay', easy: 'kolay', basit: 'kolay', orta: 'orta', medium: 'orta', normal: 'orta', zor: 'zor', hard: 'zor', 'ileri': 'zor', difficult: 'zor' };

/** Hakem kararını biçimce onarır (boolean/sayı/zorluk/cevap eşleme + kanıt). */
export function normalizeVerdict(raw, options = [], sourceText = '') {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
 const v = { ...raw };
 for (const key of ['singleCorrect', 'dualAnswerRisk', 'supported', 'qualityOk', 'distractorPlausible']) {
  if (v[key] !== undefined) v[key] = toBool(v[key]);
 }
 for (const key of ['qualityScore', 'examPotential']) {
  if (v[key] !== undefined) v[key] = toNum(v[key]);
 }
 if (typeof v.difficulty === 'string') {
  const d = v.difficulty.trim().toLocaleLowerCase(TR);
  v.difficulty = DIFF_MAP[d] || d;
 }
 const resolved = resolveOptionAnswer(v.answer, options);
 if (resolved) v.answer = resolved;
 else if (typeof v.answer === 'string') v.answer = v.answer.trim();
 if (typeof v.secondBestOption === 'string') {
  const sb = resolveOptionAnswer(v.secondBestOption, options);
  v.secondBestOption = sb || v.secondBestOption.trim();
 }
 if (typeof v.reason === 'string') v.reason = clean(v.reason);
 if (sourceText) {
  const rep = repairEvidence(v.evidence, sourceText, { answer: typeof v.answer === 'string' ? v.answer : '', minScore: 0.4 });
  if (rep) v.evidence = rep.evidence;
 }
 return v;
}
