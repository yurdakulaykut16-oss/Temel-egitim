import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HundredWayVerifier } from './hundred-way-verifier.mjs';

const DEFAULT_RESEARCH_MEMORY = {
 version: 2,
 upgradeTier: 'Ultra-Singularity-100x',
 researchCycles: 0,
 webHitsTotal: 0,
 verified100Promotions: 0,
 blocked100Rejections: 0,
 networkAvailable: null,
 lastResearchedUnitId: null,
 lastResearchedAt: null,
 byUnit: {}, // unitId -> { unit, book, researchedAt, webSources: [{title, snippet, url}], examHypotheses: [...], confusionPairs: [...], insight: '' }
 globalInsights: [], // [{ id, unitId, unit, insight, createdAt }]
 journal: [] // [{ id, time, unitId, title, detail, webCount }]
};

function stripHtml(html) {
 return String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

export class ResearchAgent {
 constructor(dataDir, opts = {}) {
  this.dataDir = dataDir;
  this.brainDir = resolve(dataDir, 'ai-brain');
  this.memoryFile = resolve(this.brainDir, 'research-memory.json');
  this.hasCustomFetch = Boolean(opts.fetchFn);
  this.fetchFn = opts.fetchFn || ((url, init) => fetch(url, init));
  this.verifier100 = opts.verifier100 || new HundredWayVerifier(dataDir);
 }

 async _atomicWrite(filePath, obj) {
  await mkdir(this.brainDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 async loadMemory() {
  try {
   const parsed = JSON.parse(await readFile(this.memoryFile, 'utf8'));
   return { ...DEFAULT_RESEARCH_MEMORY, ...(parsed || {}) };
  } catch (e) {
   if (e.code === 'ENOENT') return { ...DEFAULT_RESEARCH_MEMORY };
   throw e;
  }
 }

 async saveMemory(mem) {
  const next = {
   ...DEFAULT_RESEARCH_MEMORY,
   ...mem,
   globalInsights: (mem.globalInsights || []).slice(-30),
   journal: (mem.journal || []).slice(-40)
  };
  await this._atomicWrite(this.memoryFile, next);
  return next;
 }

 // Gerçek internet araması: Türkçe Vikipedi API + DuckDuckGo HTML (sıfır dış paket, ağ yoksa zarif degrade)
 async searchWebForUnit(ctx, { timeoutMs = 480 } = {}) {
  const canRemote = this.hasCustomFetch || process.env.TEMPO_ALLOW_REMOTE_FETCH === '1';
  if (!canRemote || process.env.TEMPO_WEB_RESEARCH === '0' || process.env.TEMPO_OFFLINE_ONLY === '1') {
   return { networkAvailable: false, sources: [], query: '', reason: '%100 yerel derin kitap analizi' };
  }

  const cleanUnit = String(ctx.unit || '').replace(/^\d+\.\s*/, '').trim();
  const cleanBook = String(ctx.book || '').split(':')[0].trim();
  const wikiQuery = `${cleanUnit} spor antrenörlük`.trim();
  const ddgQuery = `"antrenörlük" "${cleanUnit}" ${cleanBook} sınav konu özeti`;
  const sources = [];
  let networkOk = false;

  // 1) Türkçe Vikipedi açık API
  try {
   const wikiUrl = `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(wikiQuery)}&srlimit=3&utf8=1&format=json`;
   const r = await this.fetchFn(wikiUrl, {
    headers: { 'User-Agent': 'TemelEgitimStudio-ResearchAgent/1.0 (local-educational-tool)' },
    signal: AbortSignal.timeout(timeoutMs)
   });
   if (r.ok) {
    networkOk = true;
    const data = await r.json();
    const list = Array.isArray(data?.query?.search) ? data.query.search : [];
    for (const item of list.slice(0, 3)) {
     const snippet = stripHtml(item.snippet);
     if (item.title && snippet.length >= 20) {
      sources.push({
       source: 'tr.wikipedia.org',
       title: String(item.title).slice(0, 120),
       snippet: snippet.slice(0, 340),
       url: `https://tr.wikipedia.org/wiki/${encodeURIComponent(String(item.title).replace(/ /g, '_'))}`
      });
     }
    }
   }
  } catch {}

  // 2) DuckDuckGo HTML arama (gerçek web sonuçları, antrenörlük / BESYO / AÖF sınav konuları)
  try {
   const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(ddgQuery)}`;
   const r = await this.fetchFn(ddgUrl, {
    headers: {
     'User-Agent': 'Mozilla/5.0 (compatible; TemelEgitimStudio/1.0)',
     Accept: 'text/html'
    },
    signal: AbortSignal.timeout(timeoutMs)
   });
   if (r.ok) {
    networkOk = true;
    const html = await r.text();
    const titles = [...html.matchAll(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)];
    for (let i = 0; i < Math.min(4, titles.length); i++) {
     const title = stripHtml(titles[i][2]);
     const snippet = stripHtml(snippets[i]?.[1] || '');
     const rawUrl = String(titles[i][1] || '');
     if (title && (snippet.length >= 20 || title.length >= 10)) {
      sources.push({
       source: 'web-search',
       title: title.slice(0, 140),
       snippet: snippet.slice(0, 360),
       url: rawUrl.slice(0, 260)
      });
     }
    }
   }
  } catch {}

  return {
   networkAvailable: networkOk,
   query: ddgQuery,
   sources: sources.slice(0, 6)
  };
 }

 // Web bulguları + kitabın kendi metni üzerinden "Sınavda Çıkabilecek Soruları Bulma" akıl yürütmesi + 100-Yollu Doğrulama Kapısı
 async researchAndReasonUnit({ ctx, passages = [], runModelFn, model, signal, subSecond = true, timeoutMs = 700, verifier100 = null }) {
  const mem = await this.loadMemory();
  const activeVerifier = verifier100 || this.verifier100;
  const webRes = await this.searchWebForUnit(ctx, { timeoutMs: subSecond ? 420 : 4000 });
  const sampleText = [
   ctx.text || '',
   ...passages.slice(0, 3).map(p => `[${p.heading}] ${String(p.text || '').slice(0, 700)}`)
  ].join('\n').slice(0, 3200);

  // İnternetten gelen ham kaynakları da önce 100-yollu kontrolden geçir
  const verifiedWebSources = [];
  let blockedWebSourcesCount = 0;
  for (const s of (webRes.sources || [])) {
   const sv = await activeVerifier.verify100Ways({
    kind: 'internet_research',
    title: String(s.title || ctx.unit),
    source: s.url || s.source || 'web',
    license: 'WEB-EDU',
    targetBot: 'researchAgent',
    summary: String(s.snippet || s.title || '').trim() || `${ctx.unit} araştırma özeti`
   }, { persist: false });
   if (sv.approvedForProject) verifiedWebSources.push(s);
   else blockedWebSourcesCount += 1;
  }

  const webSummary = verifiedWebSources.length
   ? verifiedWebSources.map((s, i) => `(${i + 1}) [${s.source}] ${s.title}: ${s.snippet}`).join('\n')
   : 'İnternet erişimi şu an yok veya sonuç dönmedi; kitabın kendi pasajları üzerinden derin sınav örüntüsü akıl yürütmesi yap.';

  const prompt = `Sen Türkiye Antrenörlük Temel Eğitimi (Spor Bilimleri / BESYO / Federasyon Sınavları) Baş Araştırmacısı ve Sınav Stratejistisin.
Görevin: Hem internetten toplanan ders araştırma bulgularını hem de resmi ders kitabının ünite metnini inceleyerek:
1) Sınavda çıkma olasılığı en yüksek soru kalıplarını AKIL YÜRÜTEREK tahmin etmek,
2) Adayların sınavda en sık birbirine karıştırdığı kavram/sayı/sınıflandırma tuzaklarını tespit etmek,
3) Soru yazan yapay zekâya bu ders için kendini geliştirme içgörüsü vermek.

DERS / KİTAP: ${ctx.book}
ÜNİTE: ${ctx.unit} (${ctx.id})
İNTERNET ARAŞTIRMA BULGULARI (${webRes.sources.length} kaynak):
${webSummary}

RESMİ DERS KİTABI METNİ:
${sampleText}

JSON döndür:
{
  "examHypotheses": [
    { "topic": "çıkması muhtemel alt konu", "likelihood": "yuksek|orta", "difficulty": "kolay|orta|zor", "reasoning": "neden sınavda sorulabileceğine dair akıl yürütme ve beklenen soru açısı" }
  ],
  "confusionPairs": [
    { "conceptA": "kavram 1", "conceptB": "kavram 2", "trapNote": "sınavda nasıl çeldirici tuzağı kurulur" }
  ],
  "selfImprovementInsight": "Soru üreten ve denetleyen yapay zekânın bu ünitede kalitesini artırmak için uygulaması gereken 1-2 somut ders"
}`;

  let parsed = null;
  if (typeof runModelFn === 'function') {
   try {
    const out = await runModelFn(model, prompt, 0.35, signal || AbortSignal.timeout(subSecond ? timeoutMs : 40_000), subSecond ? 260 : 1400, { fastThink: true, numCtx: subSecond ? 2560 : 6144 });
    parsed = out?.parsed || null;
   } catch {}
  }

  if (!parsed) {
   const combinedSentences = [
    ...String(ctx.text || '').split(/(?<=[.!?])\s+/),
    ...passages.slice(0, 6).flatMap(p => String(p.text || '').split(/(?<=[.!?])\s+/))
   ].map(s => s.trim()).filter(s => s.length >= 24 && s.length <= 240);
   const numericSent = combinedSentences.find(s => /\d+\s*(%|dk|dakika|saat|hafta|tekrar|set|sn|atım|bpm|ml|kg|1rm)/i.test(s));
   const contrastSent = combinedSentences.find(s => /([A-ZÇĞİÖŞÜa-zçğıöşü]{4,32})\s+(?:ise|aksine|farklı olarak)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{4,32})/i.test(s));
   const words = String(ctx.unit || '').split(/\s+/).filter(w => w.length >= 4);
   parsed = {
    examHypotheses: [
     {
      topic: `${ctx.unit} temel ilke ve saha uygulaması`,
      likelihood: 'yuksek',
      difficulty: 'orta',
      reasoning: combinedSentences[0]?.slice(0, 180) || `${ctx.unit} ünitesindeki neden-sonuç ilişkileri doğrudan soru adayıdır.`
     },
     ...(numericSent ? [{
      topic: `${ctx.unit} sayısal eşik ve fizyolojik parametreler`,
      likelihood: 'yuksek',
      difficulty: 'zor',
      reasoning: numericSent.slice(0, 180)
     }] : []),
     ...(passages.slice(0, 2).map(p => ({
      topic: String(p.heading || ctx.unit).slice(0, 100),
      likelihood: 'orta',
      difficulty: 'zor',
      reasoning: String(p.text || '').slice(0, 160)
     })))
    ],
    confusionPairs: [
     ...(contrastSent ? [{
      conceptA: contrastSent.slice(0, 48),
      conceptB: words[0] || ctx.unit || 'Komşu İlke',
      trapNote: 'Doğrudan kitap cümlesi içi zıtlık ayrımı — ÖSYM yüksek frekans tuzağı.'
     }] : []),
     {
      conceptA: words[0] || ctx.unit || 'Temel kavram',
      conceptB: words[1] || 'Komşu uygulama ilkesi',
      trapNote: 'Tanım ve uygulama koşulları arasında ince çeldirici ayrımı kurulur.'
     }
    ],
    selfImprovementInsight: `${ctx.unit} sorularında birebir kitap kanıtı ve simetrik şık uzunluğu koruyarak sayısal ve kavram ayrımını keskinleştir.`
   };
  }

  const hypotheses = (Array.isArray(parsed?.examHypotheses) ? parsed.examHypotheses : [])
   .filter(h => h && typeof h.topic === 'string' && h.topic.trim())
   .slice(0, 4)
   .map(h => ({
    topic: h.topic.trim().slice(0, 120),
    likelihood: h.likelihood === 'orta' ? 'orta' : 'yuksek',
    difficulty: ['kolay', 'orta', 'zor'].includes(h.difficulty) ? h.difficulty : 'orta',
    reasoning: typeof h.reasoning === 'string' ? h.reasoning.trim().slice(0, 260) : ''
   }));

  const confusionPairs = (Array.isArray(parsed?.confusionPairs) ? parsed.confusionPairs : [])
   .filter(c => c && typeof c.conceptA === 'string' && typeof c.conceptB === 'string')
   .slice(0, 4)
   .map(c => ({
    conceptA: c.conceptA.trim().slice(0, 80),
    conceptB: c.conceptB.trim().slice(0, 80),
    trapNote: typeof c.trapNote === 'string' ? c.trapNote.trim().slice(0, 180) : ''
   }));

  const insight = typeof parsed?.selfImprovementInsight === 'string' ? parsed.selfImprovementInsight.trim().slice(0, 280) : '';

  const synthesizedSummary = [
   ...hypotheses.map(h => `${h.topic}: ${h.reasoning}`),
   ...confusionPairs.map(c => `${c.conceptA} vs ${c.conceptB}: ${c.trapNote}`),
   insight
  ].filter(Boolean).join(' | ');

  // Projeye/hafızaya yazmadan önce internet araştırma sentezini 100 farklı yolla doğrula!
  const verification100 = await activeVerifier.verify100Ways({
   kind: 'internet_research',
   title: `İnternet & Sınav Araştırması: ${ctx.unit}`,
   source: verifiedWebSources.map(s => s.url || s.source).join(', ') || 'kitap-ve-internet-sentezi',
   license: 'WEB-EDU',
   targetBot: 'researchAgent',
   summary: synthesizedSummary.slice(0, 560),
   insight
  });
  const promotedToProject = Boolean(verification100.approvedForProject);

  mem.researchCycles = (mem.researchCycles || 0) + 1;
  mem.webHitsTotal = (mem.webHitsTotal || 0) + verifiedWebSources.length;
  mem.networkAvailable = webRes.networkAvailable;
  mem.lastResearchedUnitId = ctx.id;
  mem.lastResearchedAt = new Date().toISOString();

  if (promotedToProject) {
   mem.verified100Promotions = Number(mem.verified100Promotions || 0) + 1;
   mem.byUnit = {
    ...(mem.byUnit || {}),
    [ctx.id]: {
     unitId: ctx.id,
     unit: ctx.unit,
     book: ctx.book,
     researchedAt: mem.lastResearchedAt,
     networkAvailable: webRes.networkAvailable,
     webSources: verifiedWebSources.slice(0, 4),
     examHypotheses: hypotheses,
     confusionPairs,
     insight,
     verified100: { id: verification100.id, passedCount: verification100.passedCount, totalPaths: verification100.totalPaths }
    }
   };

   if (insight) {
    mem.globalInsights = [
     ...(mem.globalInsights || []),
     { id: `ri-${Date.now()}`, unitId: ctx.id, unit: ctx.unit, insight, createdAt: mem.lastResearchedAt }
    ].slice(-30);
   }
  } else {
   mem.blocked100Rejections = Number(mem.blocked100Rejections || 0) + 1;
  }

  mem.journal = [
   ...(mem.journal || []),
   {
    id: `rj-${Date.now()}`,
    time: mem.lastResearchedAt,
    unitId: ctx.id,
    webCount: verifiedWebSources.length,
    blockedWebSourcesCount,
    promotedToProject,
    verified100Paths: `${verification100.passedCount}/${verification100.totalPaths}`,
    title: promotedToProject
     ? `${ctx.id} (${ctx.unit}) 100/100 doğrulandı & eklendi · ${hypotheses.length} sınav tahmini`
     : `${ctx.id} (${ctx.unit}) 100-yollu kontrolde engellendi (${verification100.passedCount}/100)`,
    detail: promotedToProject
     ? (verifiedWebSources.length
        ? `Web'den ${verifiedWebSources.length} doğrulanmış kaynak tarandı (${verifiedWebSources[0].source})${insight ? ` · ${insight.slice(0, 140)}` : ''}`
        : `Çevrimdışı/kitap içi derin sınav örüntüsü 100/100 doğrulandı${insight ? ` · ${insight.slice(0, 140)}` : ''}`)
     : `Güvenlik/tutarlılık kapısı (${verification100.passedCount}/100) nedeniyle projeye eklenmedi.`
   }
  ].slice(-40);

  const saved = await this.saveMemory(mem);
  return {
   memory: saved,
   unitResearch: promotedToProject ? saved.byUnit[ctx.id] : null,
   webSources: verifiedWebSources,
   blockedWebSourcesCount,
   promotedToProject,
   verification100: {
    id: verification100.id,
    passedCount: verification100.passedCount,
    totalPaths: verification100.totalPaths,
    approvedForProject: verification100.approvedForProject,
    failedPaths: verification100.failedPaths
   }
  };
 }

 // Soru üretim promptuna sınav tahmini & karışan kavram yönlendirmesi enjekte eder (kanıt yine kitaptan alınır!)
 getResearchGuidance(memory, unitId) {
  const unitData = memory?.byUnit?.[unitId];
  if (!unitData) return '';
  const parts = [];
  if (unitData.examHypotheses?.length) {
   const top = unitData.examHypotheses.slice(0, 2).map(h => `[${h.difficulty.toUpperCase()} · ${h.topic}] ${h.reasoning}`).join(' | ');
   parts.push(`SINAV TAHMİNİ & AKIL YÜRÜTME (Öncelikli Sınav Açısı): ${top}`);
  }
  if (unitData.confusionPairs?.length) {
   const pairs = unitData.confusionPairs.slice(0, 2).map(p => `${p.conceptA} vs ${p.conceptB} (${p.trapNote})`).join(' | ');
   parts.push(`KARIŞTIRILAN KAVRAM TUZAKLARI (Çeldiricide kullan): ${pairs}`);
  }
  if (unitData.insight) {
   parts.push(`ARAŞTIRMA İÇGÖRÜSÜ: ${unitData.insight}`);
  }
  return parts.length ? `\n${parts.join('\n')}\n(NOT: Yukarıdaki sınav tahminini YALNIZ aşağıda verilen resmi KONU ANLATIMI metni içinden kanıtlayarak sor.)` : '';
 }
}
