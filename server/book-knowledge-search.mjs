const TURKISH_STOPWORDS = new Set([
 've', 'veya', 'ile', 'bir', 'bu', 'şu', 'o', 'için', 'gibi', 'olan', 'olarak',
 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl', 'neden', 'hangi',
 'daha', 'en', 'çok', 'az', 'her', 'tüm', 'bütün', 'kadar', 'göre', 'sonra',
 'önce', 'arasında', 'üzerinde', 'altında', 'ise', 'ama', 'fakat', 'ancak'
]);

export function tokenizeTr(text = '') {
 return String(text || '')
  .toLocaleLowerCase('tr-TR')
  .split(/[^\p{L}\p{N}]+/u)
  .filter(w => w.length >= 2 && !TURKISH_STOPWORDS.has(w));
}

function trStemApprox(token) {
 // Hafif Türkçe kök yaklaşımı (ek kırpma olmadan güvenli ön-ek temsili)
 return token.length >= 6 ? token.slice(0, Math.min(token.length, 7)) : token;
}

export class BookKnowledgeSearch {
 constructor({ contexts = [], passagesByUnit = new Map(), questionBank = [] } = {}) {
  this.contexts = contexts;
  this.passagesByUnit = passagesByUnit;
  this.questionBank = questionBank;
  this.docs = [];
  this.df = new Map();
  this.stemDf = new Map();
  this.avgDocLen = 60;
  this._buildIndex();
 }

 _buildIndex() {
  const docs = [];
  const ctxMap = new Map(this.contexts.map(c => [c.id, c]));

  for (const ctx of this.contexts) {
   const unitPassages = this.passagesByUnit.get(ctx.id) || [];
   if (unitPassages.length) {
    for (const p of unitPassages) {
     const raw = `${ctx.book} ${ctx.unit} ${p.heading || ''} ${(p.keywords || []).join(' ')} ${p.text || ''}`;
     const tokens = tokenizeTr(raw);
     const stems = tokens.map(trStemApprox);
     const tf = new Map();
     const stemTf = new Map();
     for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
     for (const st of stems) stemTf.set(st, (stemTf.get(st) || 0) + 1);
     docs.push({
      id: p.id,
      kind: 'passage',
      unitId: ctx.id,
      book: ctx.book,
      unit: ctx.unit,
      heading: p.heading || ctx.unit,
      pages: Array.isArray(p.pages) ? p.pages : [],
      sourceType: p.sourceType || 'book',
      text: String(p.text || ''),
      len: Math.max(1, tokens.length),
      tf,
      stemTf
     });
    }
   } else {
    const raw = `${ctx.book} ${ctx.unit} ${ctx.text || ''}`;
    const tokens = tokenizeTr(raw);
    const tf = new Map();
    const stemTf = new Map();
    for (const t of tokens) {
     tf.set(t, (tf.get(t) || 0) + 1);
     const st = trStemApprox(t);
     stemTf.set(st, (stemTf.get(st) || 0) + 1);
    }
    docs.push({
     id: `${ctx.id}#summary`,
     kind: 'passage',
     unitId: ctx.id,
     book: ctx.book,
     unit: ctx.unit,
     heading: ctx.unit,
     pages: [1],
     sourceType: 'summary',
     text: String(ctx.text || ''),
     len: Math.max(1, tokens.length),
     tf,
     stemTf
    });
   }
  }

  for (let i = 0; i < this.questionBank.length; i++) {
   const q = this.questionBank[i];
   const ctx = ctxMap.get(q.unitId);
   const raw = `${q.question || ''} ${q.answer || ''} ${q.explanation || ''}`;
   const tokens = tokenizeTr(raw);
   const tf = new Map();
   const stemTf = new Map();
   for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
    const st = trStemApprox(t);
    stemTf.set(st, (stemTf.get(st) || 0) + 1);
   }
   docs.push({
    id: q.id || `bank-${i}`,
    kind: 'question',
    unitId: q.unitId || '0-0',
    book: ctx?.book || '',
    unit: ctx?.unit || q.unitId || '',
    heading: 'Onaylı Soru Havuzu',
    pages: [],
    sourceType: 'bank',
    text: `${q.question} — Cevap: ${q.answer}`,
    len: Math.max(1, tokens.length),
    tf,
    stemTf
   });
  }

  const df = new Map();
  const stemDf = new Map();
  let totalLen = 0;
  for (const d of docs) {
   totalLen += d.len;
   for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
   for (const s of d.stemTf.keys()) stemDf.set(s, (stemDf.get(s) || 0) + 1);
  }
  this.docs = docs;
  this.df = df;
  this.stemDf = stemDf;
  this.avgDocLen = docs.length ? totalLen / docs.length : 60;
 }

 search(query = '', { unitId = '', kind = 'all', limit = 12, extraApprovedQuestions = [] } = {}) {
  const t0 = performance.now();
  const qClean = String(query || '').trim();
  const qTokens = tokenizeTr(qClean);
  const qStems = qTokens.map(trStemApprox);
  const safeLimit = Math.max(1, Math.min(40, Number(limit || 12)));
  const N = Math.max(1, this.docs.length);
  const k1 = 1.5;
  const b = 0.75;

  if (!qTokens.length) {
   const fallback = this.docs
    .filter(d => (!unitId || d.unitId === unitId) && (kind === 'all' || d.kind === kind))
    .slice(0, safeLimit)
    .map(d => ({
     id: d.id,
     kind: d.kind,
     unitId: d.unitId,
     book: d.book,
     unit: d.unit,
     heading: d.heading,
     pages: d.pages,
     snippet: d.text.slice(0, 260),
     score: 1
    }));
   return { ok: true, query: qClean, totalIndexedDocs: this.docs.length, hits: fallback, durationMs: +(performance.now() - t0).toFixed(2) };
  }

  const qLower = qClean.toLocaleLowerCase('tr-TR');
  const scored = [];
  for (let i = 0; i < this.docs.length; i++) {
   const d = this.docs[i];
   if (unitId && d.unitId !== unitId) continue;
   if (kind !== 'all' && d.kind !== kind) continue;

   let score = 0;
   const dlNorm = d.len / Math.max(1, this.avgDocLen);
   for (let j = 0; j < qTokens.length; j++) {
    const t = qTokens[j];
    const f = d.tf.get(t) || 0;
    if (f > 0) {
     const dfVal = this.df.get(t) || 1;
     const idf = Math.log(1 + (N - dfVal + 0.5) / (dfVal + 0.5));
     score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * dlNorm)));
    } else {
     const st = qStems[j];
     const sf = d.stemTf.get(st) || 0;
     if (sf > 0) {
      const sdf = this.stemDf.get(st) || 1;
      const sidf = Math.log(1 + (N - sdf + 0.5) / (sdf + 0.5));
      score += 0.55 * sidf * ((sf * (k1 + 1)) / (sf + k1 * (1 - b + b * dlNorm)));
     }
    }
   }

   if (score > 0 && d.text.toLocaleLowerCase('tr-TR').includes(qLower)) {
    score *= 1.35;
   }
   if (score > 0) {
    scored.push({
     id: d.id,
     kind: d.kind,
     unitId: d.unitId,
     book: d.book,
     unit: d.unit,
     heading: d.heading,
     pages: d.pages,
     snippet: d.text.slice(0, 280),
     score: +score.toFixed(4)
    });
   }
  }

  // Dinamik onaylanmış üretilen soruları da hızlıca puanla
  if (kind === 'all' || kind === 'question') {
   for (const q of (extraApprovedQuestions || []).slice(-300)) {
    if (!q || q.status !== 'approved') continue;
    if (unitId && q.unitId !== unitId) continue;
    const txt = `${q.question || ''} ${q.answer || ''} ${q.explanation || ''}`.toLocaleLowerCase('tr-TR');
    let hits = 0;
    for (const t of qTokens) if (txt.includes(t)) hits++;
    if (hits > 0) {
     scored.push({
      id: q.id,
      kind: 'question',
      unitId: q.unitId,
      book: q.book || '',
      unit: q.unit || q.unitId,
      heading: 'Ollama Onaylı Yeni Soru',
      pages: Array.isArray(q.pages) ? q.pages : [],
      snippet: `${q.question} — Cevap: ${q.answer}`.slice(0, 280),
      score: +(hits * 2.2 + (txt.includes(qLower) ? 2.5 : 0)).toFixed(4)
     });
    }
   }
  }

  scored.sort((a, b) => b.score - a.score);
  return {
   ok: true,
   query: qClean,
   totalIndexedDocs: this.docs.length + (extraApprovedQuestions?.length || 0),
   hits: scored.slice(0, safeLimit),
   durationMs: +(performance.now() - t0).toFixed(2)
  };
 }

 // Öğrenci performansına + kitap kapsamasına göre 5 ayrı ders (20'şer soru, 12 baraj) sınav tahmini üretir
 predictExamReadiness({ studentProfile = {}, items = [], researchMemory = null, paramSummary = null } = {}) {
  const results = studentProfile?.results || {};
  const studiedSet = new Set(Array.isArray(studentProfile?.studiedUnits) ? studentProfile.studiedUnits : []);
  const bookMap = new Map();

  for (const ctx of this.contexts) {
   const bi = Number(String(ctx.id).split('-')[0] || 0);
   if (!bookMap.has(bi)) {
    bookMap.set(bi, {
     bookIndex: bi,
     book: ctx.book,
     totalUnits: 0,
     studiedUnits: 0,
     right: 0,
     wrong: 0,
     totalSec: 0,
     weakUnitIds: [],
     approvedQuestions: 0
    });
   }
   const b = bookMap.get(bi);
   b.totalUnits += 1;
   if (studiedSet.has(ctx.id)) b.studiedUnits += 1;
   const ur = results[ctx.id];
   if (ur) {
    const r = Number(ur.right || 0);
    const w = Number(ur.wrong || 0);
    b.right += r;
    b.wrong += w;
    b.totalSec += Number(ur.totalSec || 0);
    const tot = r + w;
    if ((w >= 2 && Number(ur.streak || 0) < 3) || (tot >= 2 && r / Math.max(1, tot) < 0.8)) {
     b.weakUnitIds.push({ unitId: ctx.id, unit: ctx.unit, wrong: w, right: r });
    }
   }
  }

  for (const q of (items || [])) {
   if (q?.status !== 'approved') continue;
   const bi = Number(String(q.unitId || '0-0').split('-')[0] || 0);
   const b = bookMap.get(bi);
   if (b) b.approvedQuestions += 1;
  }

  const booksReport = [...bookMap.values()].map(b => {
   const answered = b.right + b.wrong;
   const accPct = answered ? Math.round((b.right / answered) * 100) : 0;
   const coveragePct = b.totalUnits ? Math.round((b.studiedUnits / b.totalUnits) * 100) : 0;
   // Gerçekçi 20 soruluk ders tahmini: doğruluk + okuma kapsaması birleşimi
   const rawEst = answered > 0
    ? (accPct * 0.72 + coveragePct * 0.28)
    : (coveragePct * 0.65);
   const estimatedOutOf20 = Math.max(0, Math.min(20, Math.round((rawEst / 100) * 20)));
   const passRisk = estimatedOutOf20 < 12 ? 'yuksek_risk' : estimatedOutOf20 < 15 ? 'sinirda' : 'guvenli';
   return {
    bookIndex: b.bookIndex,
    book: b.book,
    totalUnits: b.totalUnits,
    studiedUnits: b.studiedUnits,
    coveragePct,
    answered,
    accuracyPct: accPct,
    avgSecPerQ: answered ? +(b.totalSec / answered).toFixed(1) : 0,
    estimatedOutOf20,
    barajMet: estimatedOutOf20 >= 12,
    passRisk,
    weakUnits: b.weakUnitIds.slice(0, 3),
    approvedQuestions: b.approvedQuestions
   };
  });

  const totalEstimated100 = booksReport.reduce((s, b) => s + b.estimatedOutOf20, 0);
  const booksPassingBaraj = booksReport.filter(b => b.barajMet).length;
  const highestRiskBook = [...booksReport].sort((a, b) => a.estimatedOutOf20 - b.estimatedOutOf20)[0] || null;
  const researchedUnitsCount = Object.keys(researchMemory?.byUnit || {}).length;

  const priorityActions = [];
  if (highestRiskBook && highestRiskBook.estimatedOutOf20 < 15) {
   priorityActions.push({
    kind: 'focus_book',
    bookIndex: highestRiskBook.bookIndex,
    title: `${highestRiskBook.book} kitabına odaklan (Tahmin: ${highestRiskBook.estimatedOutOf20}/20)`,
    reason: highestRiskBook.barajMet
     ? '12 barajını geçsen de 15+ güvenli banda çıkmak için zayıf üniteleri tekrar et.'
     : '12/20 ders barajı riski! Bu dersten düşük almak tek ders bütünlemesine yol açabilir.'
   });
  }
  const allWeak = booksReport.flatMap(b => b.weakUnits);
  if (allWeak.length) {
   priorityActions.push({
    kind: 'weak_unit',
    unitId: allWeak[0].unitId,
    title: `${allWeak[0].unit} ünitesini 3D video + kodlamalarla tazele`,
    reason: `${allWeak[0].wrong} yanlış birikimi var.`
   });
  }
  priorityActions.push({
   kind: 'exam_sim',
   title: '5 × 20 = 100 Soruluk Süreli Tam Sınav Provası',
   reason: `Soru başı ~60 sn hızını koru · AI Koç IQ: ${paramSummary?.avgBotIq ?? 98}/100 · Araştırılan ünite: ${researchedUnitsCount}/29`
  });

  return {
   ok: true,
   generatedAt: new Date().toISOString(),
   totalEstimated100,
   booksPassingBaraj,
   totalBooks: booksReport.length,
   allBarajMet: booksPassingBaraj === booksReport.length,
   books: booksReport,
   priorityActions: priorityActions.slice(0, 3),
   indexedKnowledgeDocs: this.docs.length
  };
 }

 getSummary() {
  const passageDocs = this.docs.filter(d => d.kind === 'passage').length;
  const bankDocs = this.docs.filter(d => d.kind === 'question').length;
  return {
   totalIndexedDocs: this.docs.length,
   passageDocs,
   bankDocs,
   avgDocLen: Math.round(this.avgDocLen),
   vocabularySize: this.df.size
  };
 }
}
