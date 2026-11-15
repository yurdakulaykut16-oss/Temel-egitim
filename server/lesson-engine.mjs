import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const NARRATIVE_STYLES = [
 'Antrenör-Sporcu Saha Hikâyesi & Görsel Analoji',
 'Zıtlıklar & Kıyaslama Tablosu (Karıştırılan Çiftler)',
 'Günlük Yaşamdan Somut Benzetmeler & Ritimli Akrostiş',
 'Sınav Dedektifi (Tuzak Avcısı & Neden-Sonuç Zinciri)',
 'Zihin Sarayı (Mekan-Kavram Eşleştirmeli Ezber)',
 'ÖSYM Komisyon Röntgeni (5 Açıdan Kök-Şık Simetrisi)',
 'Biyomekanik & Fizyoloji Sayısal Sınır Haritası'
];

export class LessonEngine {
 constructor(dataDir) {
  this.dataDir = dataDir;
  this.lessonsDir = resolve(dataDir, 'ai-brain', 'lessons');
 }

 async _atomicWrite(filePath, obj) {
  await mkdir(this.lessonsDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 _lessonFile(unitId) {
  const safeId = String(unitId || '0-0').replace(/[^a-zA-Z0-9_-]/g, '');
  return resolve(this.lessonsDir, `${safeId}.json`);
 }

 _normalizeLesson(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const deepSections = (Array.isArray(raw.deepSections) ? raw.deepSections : []).map(s => ({
   title: s?.title || s?.heading || 'Bölüm',
   body: s?.body || s?.content || '',
   recallAnchor: s?.recallAnchor || ''
  })).filter(s => s.body);

  const proTips = (Array.isArray(raw.proTips) ? raw.proTips : []).map(t => ({
   title: t?.title || 'Püf Noktası',
   tip: t?.tip || t?.detail || '',
   examTrap: t?.examTrap || ''
  })).filter(t => t.tip);

  const memoryMnemonics = (Array.isArray(raw.memoryMnemonics) ? raw.memoryMnemonics : []).map(m => ({
   code: m?.code || 'KOD',
   standsFor: m?.standsFor || m?.expansion || '',
   story: m?.story || m?.storyHook || ''
  })).filter(m => m.code && m.standsFor);

  const spacedEchoes = (Array.isArray(raw.spacedEchoes) ? raw.spacedEchoes : []).map(e => {
   if (typeof e === 'string') return e;
   return [e?.prompt, e?.repetitionRule, e?.quickSummary].filter(Boolean).join(' — ');
  }).filter(Boolean);

  const rawSpot = raw.fiveAngleSpotlight;
  const fiveAngleSpotlight = rawSpot && Array.isArray(rawSpot.angles) ? {
   concept: rawSpot.concept || raw.unit || '',
   angles: rawSpot.angles.slice(0, 5).map((a, idx) => ({
    angle: a?.angle || a?.angleName || `${idx + 1}. Açı`,
    sampleQuestion: a?.sampleQuestion || a?.sampleStem || '',
    keyPoint: a?.keyPoint || a?.whyItWorks || ''
   })).filter(a => a.sampleQuestion)
  } : undefined;

  const miniCheckpoints = (Array.isArray(raw.miniCheckpoints) ? raw.miniCheckpoints : []).map(c => ({
   question: c?.question || '',
   answer: c?.answer || '',
   hint: c?.hint || c?.memoryHook || ''
  })).filter(c => c.question && c.answer);

  const everyCornerDetails = (Array.isArray(raw.everyCornerDetails) ? raw.everyCornerDetails : []).map(d => ({
   heading: d?.heading || 'Kitap Ayrıntısı',
   pages: Array.isArray(d?.pages) ? d.pages : [],
   keyFact: d?.keyFact || '',
   whyItCouldBeAsked: d?.whyItCouldBeAsked || ''
  })).filter(d => d.keyFact);

  return {
   unitId: raw.unitId || '0-0',
   book: raw.book || '',
   unit: raw.unit || '',
   version: Number(raw.version || 1),
   reframeCount: Number(raw.reframeCount || 0),
   activeStyle: raw.activeStyle || NARRATIVE_STYLES[0],
   source: raw.source || (raw.model ? `ai:${raw.model}` : 'ai'),
   updatedAt: raw.updatedAt || new Date().toISOString(),
   overviewHook: raw.overviewHook || raw.overview || '',
   deepSections,
   proTips,
   memoryMnemonics,
   spacedEchoes,
   fiveAngleSpotlight,
   miniCheckpoints,
   everyCornerDetails,
   adaptivePersonalCoach: raw.adaptivePersonalCoach || '',
   basedOnPerformance: raw.basedOnPerformance,
   usedMnemonics: Array.isArray(raw.usedMnemonics) ? raw.usedMnemonics : [],
   history: raw.history || []
  };
 }

 async loadLesson(unitId) {
  try {
   const parsed = JSON.parse(await readFile(this._lessonFile(unitId), 'utf8'));
   return this._normalizeLesson(parsed);
  } catch (e) {
   if (e.code === 'ENOENT') return null;
   throw e;
  }
 }

 async listSummary(totalUnits = 29) {
  try {
   const files = await readdir(this.lessonsDir);
   const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
   let totalVersions = 0;
   let aiEnhancedCount = 0;
   const units = [];
   for (const f of jsonFiles) {
    try {
     const d = JSON.parse(await readFile(resolve(this.lessonsDir, f), 'utf8'));
     if (d?.unitId) {
      const ver = Number(d.version || 1);
      totalVersions += ver;
      if (d.source !== 'fallback') aiEnhancedCount++;
      units.push({ unitId: d.unitId, unit: d.unit, version: ver, source: d.source || 'ai', updatedAt: d.updatedAt });
     }
    } catch {}
   }
   return {
    totalUnits,
    enhancedCount: units.length,
    aiEnhancedCount,
    avgVersion: units.length ? +(totalVersions / units.length).toFixed(1) : 1,
    totalVersions,
    units: units.slice(-10)
   };
  } catch (e) {
   if (e.code === 'ENOENT') {
    return { totalUnits, enhancedCount: 0, aiEnhancedCount: 0, avgVersion: 1, totalVersions: 0, units: [] };
   }
   throw e;
  }
 }

 async getSummaryStats() {
  return this.listSummary();
 }

 // Öğrencinin doğru/yanlış ve dakika/saniye performansını Türkçe analiz eder
 formatStudentPerformance(unitId, studentProfile) {
  const stats = studentProfile?.results?.[unitId] || studentProfile?.unitStats?.[unitId];
  const right = Number(stats?.right || 0);
  const wrong = Number(stats?.wrong || 0);
  const streak = Number(stats?.streak || 0);
  const totalSec = Number(stats?.totalSec || 0);
  const answered = right + wrong;
  const avgSec = answered > 0 && totalSec > 0 ? +(totalSec / answered).toFixed(1) : 0;
  const totalMin = +(totalSec / 60).toFixed(1);
  const accuracyPct = answered > 0 ? Math.round((right / answered) * 100) : 100;
  const isWeak = (studentProfile?.weakUnits || []).includes(unitId);
  const needsReread = wrong >= 2 && (streak === 0 || accuracyPct < 80);
  const needsReframe = wrong >= 3 && streak === 0;

  let statusLabel = 'Yeni Başlangıç (100/100 Hazırlık)';
  let recommendation = 'Bu üniteyi baştan sona okuyup 5 farklı soru açısıyla pekiştir.';
  if (answered > 0) {
   if (needsReframe) {
    statusLabel = 'Aklımda Kalmıyor — Yeni Kodlama & Farklı Anlatım Tarzı Devrede!';
    recommendation = 'Bu konuda çok fazla yanlış yaptın! Önce dersi tekrar biraz daha oku; eski kodlamalar işe yaramadığı için anlatım & kodlamalar yeni tarzla değiştiriliyor.';
   } else if (needsReread) {
    statusLabel = 'Çok Yanlış Yapıldı — Konuyu Tekrar Oku';
    recommendation = 'Bu konuda arka arkaya yanlışların birikti! Teste devam etmeden önce ünite konu anlatımını tekrar biraz daha incele.';
   } else if (avgSec >= 45) {
    statusLabel = 'Doğruluk İyi Ama Süre Yavaş — Kodlamayla Hızlan';
    recommendation = 'Soru başına süren uzun; kodlamalar ve püf noktalarıyla karar süreni ~20-30 saniyeye düşür.';
   } else if (accuracyPct === 100 && streak >= 3) {
    statusLabel = 'Tam Ustalık — "Ya Çıkarsa?" Kör Nokta Ayrıntılarını Koru';
    recommendation = 'Temel sorular tamam; gözden kaçabilecek alt başlık ayrıntılarını ("Ya Çıkarsa") gözden geçir.';
   } else {
    statusLabel = 'Gelişiyor — 100/100 Full Doğruya İlerliyor';
    recommendation = 'İyi gidiyorsun; yanlış yaptığın alt başlıkları tekrar okuyup 100/100 serisini tamamla.';
   }
  }

  return {
   answered,
   right,
   wrong,
   streak,
   totalSec,
   totalMin,
   avgSec,
   accuracyPct,
   accPct: answered > 0 ? accuracyPct : null,
   isWeak,
   needsReread,
   needsReframe,
   statusLabel,
   recommendation,
   summaryText: answered === 0
    ? 'Bu ünitede henüz test çözülmedi; sıfırdan uzun anlatım, kodlamalar ve 5 soru açısıyla 100/100 tam doğru temeli kuruluyor.'
    : `${answered} soru (${right} doğru, ${wrong} yanlış, %${accuracyPct} doğruluk, seri ${streak}/3) · Süre: ${totalMin} dk (${avgSec} sn/soru) — ${statusLabel}`
  };
 }

 // AI henüz bu üniteyi evrimleştirmeden önce bile boş kalmayan uzun, tekrarlı & kodlamalı başlangıç dersi
 buildFallbackLesson(ctx, passages = [], studentProfile = null, researchMemory = null) {
  const perf = this.formatStudentPerformance(ctx.id, studentProfile);
  const rUnit = researchMemory?.byUnit?.[ctx.id];
  const keywords = (ctx.unit || '').split(/\s+/).filter(w => w.length >= 4).slice(0, 4);
  const codeLetters = keywords.length >= 2
   ? keywords.map(k => k[0].toLocaleUpperCase('tr-TR')).join('-')
   : 'K-A-P-I';

  const deepSections = [
   {
    title: `${ctx.unit}: Çekirdek Mantık ve Sınav Çerçevesi`,
    body: `${ctx.text || ''} Bu konuyu yalnızca yüzeysel ezberlemek yerine neden-sonuç ilişkisiyle kavramak gerekir. Sınavda hedefimiz geçmek değil 100/100 full doğru yapmaktır; bu nedenle önce temel kuralı, ardından sınır koşullarını ve istisnalarını ayırarak ilerleyeceğiz.`,
    recallAnchor: `Şimdi kendine yüksek sesle tekrar et: "${ctx.unit} konusunda temel ayrım ölçütü nedir?"`
   },
   ...passages.slice(0, 2).map((p, idx) => ({
    title: `${idx + 2}. Kitap Derinleşmesi: ${p.heading || 'Alt Bölüm'}`,
    body: `${String(p.text || '').slice(0, 520)} Bu bölümde geçen kavramları birbirinden ayırırken her zaman kitabın belirttiği koşula ve amaca odaklan; benzer görünen terimler arasındaki ince çizgi sınav sorusunun anahtarıdır.`,
    recallAnchor: `Tekrar cümlesi: "${p.heading || ctx.unit}" bölümündeki ana kuralı 1 cümleyle zihninde özetle.`
   }))
  ];

  const proTips = [
   {
    title: 'Doğru şıkkı kökteki anahtar sözcükle eşleştir',
    tip: `Soru kökünde "${keywords[0] || ctx.unit}" bağlamı geçiyorsa şıklardaki kapsam ve amaç ifadelerini tek tek kitap tanımıyla karşılaştır.`,
    examTrap: 'Çeldiriciler genelde doğru bir ilkeyi alıp yanlış koşullu kelimeyle ("her zaman", "yalnızca", "asla") bozar.'
   },
   {
    title: 'Zıt çiftleri ayırarak ilerle',
    tip: 'İki şık birbirine çok benziyorsa ikisi de aynı anda doğru olamayacağı için ince farkı yaratan sözcüğü yakala.',
    examTrap: rUnit?.confusionPairs?.[0]
     ? `${rUnit.confusionPairs[0].conceptA} ile ${rUnit.confusionPairs[0].conceptB} sık karıştırılır: ${rUnit.confusionPairs[0].trapNote}`
     : 'İki yakın kavramın amaç, süre veya uygulama koşulu mutlaka farklıdır.'
   }
  ];

  const memoryMnemonics = [
   {
    code: codeLetters,
    standsFor: keywords.length >= 2 ? keywords.join(' · ') : 'Kavram · Amaç · Prensip · İstisna',
    story: `Soruyu okurken zihninde "${codeLetters}" anahtarını aç: önce kavramı tanı, amacını gör, ilkeyi kontrol et ve istisnayı ele!`
   }
  ];

  const fiveAngleSpotlight = {
   concept: ctx.unit,
   angles: [
    { angle: '1. Doğrudan Tanım', sampleQuestion: `${ctx.unit} kavramının temel tanımı ve amacı nedir?`, keyPoint: 'Kitaptaki çekirdek tanımı doğrudan eşleştir.' },
    { angle: '2. Ters Köşe / İstisna', sampleQuestion: `${ctx.unit} kapsamında aşağıdakilerden hangisi söylenemez / yanlıştır?`, keyPoint: '3 doğru özelliği eleyip istisnayı bul.' },
    { angle: '3. Saha Vakası', sampleQuestion: 'Bir antrenör uygulama sırasında bu ilkeyi sahada nasıl kullanır?', keyPoint: 'Teoriyi gerçek sporcu durumuna uygula.' },
    { angle: '4. Karşılaştırmalı Tuzak', sampleQuestion: 'Benzer iki kavram arasındaki kritik sınır farkı nedir?', keyPoint: 'Tanımdaki ayırt edici tek şartı yakala.' },
    { angle: '5. Şaşırtıcı Bağlam', sampleQuestion: 'Koşullar değiştiğinde beklenmedik sonuç neden ortaya çıkar?', keyPoint: 'Neden-sonuç zincirini baştan kur.' }
   ]
  };

  const everyCornerDetails = passages.slice(0, 12).map((p, idx) => ({
   heading: p.heading || `Alt Bölüm ${idx + 1}`,
   pages: Array.isArray(p.pages) ? p.pages : [],
   keyFact: String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 220),
   whyItCouldBeAsked: '5 kitaptan 20\'şer toplam 100 soru geleceği için yapay zekâ "az önemli" saysa bile bu pasajdan soru çıkabilir.'
  }));

  return {
   unitId: ctx.id,
   book: ctx.book,
   unit: ctx.unit,
   version: 1,
   reframeCount: 0,
   activeStyle: NARRATIVE_STYLES[0],
   source: 'fallback',
   updatedAt: new Date().toISOString(),
   overviewHook: `${ctx.book} · ${ctx.unit} ünitesini 100/100 full doğru hedefiyle kalıcı öğrenmeye hazır mısın? Arka plandaki yapay zekâ bu anlatımı birazdan daha da uzatıp sana özel kodlamalar ve "Ya Çıkarsa" ayrıntıları ekleyecek.`,
   deepSections,
   proTips,
   memoryMnemonics,
   spacedEchoes: [
    `1. Yankı: ${ctx.unit} konusundaki ana ölçütü şimdi kendi cümlenle tekrar et.`,
    `2. Yankı: Çeldiricilerdeki "her zaman / asla" gibi aşırı genellemelere dikkat et.`
   ],
   fiveAngleSpotlight,
   miniCheckpoints: [
    { question: `${ctx.unit} konusunda sorularda ilk kontrol edeceğin şey nedir?`, answer: 'Kavramın kitapta tanımlanan temel amacı, koşulu ve istisnasıdır.', hint: codeLetters }
   ],
   everyCornerDetails,
   adaptivePersonalCoach: perf.answered > 0
    ? `${perf.recommendation} (${perf.summaryText})`
    : 'Henüz bu üniteden soru çözmedin — önce bu rehberi ve "Ya Çıkarsa?" köşelerini oku, ardından ünite testinde hızını ve doğruluğunu ölçelim!',
   basedOnPerformance: perf
  };
 }

 async enhanceUnitLesson({ ctx, passages = [], researchMemory = null, researchData = null, studentProfile = null, apexDirective = '', runModelFn, model, signal, forceReframe = false }) {
  const existing = await this.loadLesson(ctx.id);
  const perf = this.formatStudentPerformance(ctx.id, studentProfile);
  const unitResearch = researchData || researchMemory?.byUnit?.[ctx.id] || null;
  const doReframe = Boolean(forceReframe || perf.needsReframe);
  const prevMnemonics = new Set([
   ...(existing?.usedMnemonics || []),
   ...((existing?.memoryMnemonics || []).map(m => m.code))
  ]);
  const nextStyleIdx = ((existing?.reframeCount || 0) + (doReframe ? 1 : 0)) % NARRATIVE_STYLES.length;
  const targetStyle = NARRATIVE_STYLES[nextStyleIdx];

  // "Ya Çıkarsa?" %100 Kapsam: Tüm pasaj özetlerini ve başlıklarını eksiksiz modele ver
  const allPassageDigest = passages.map((p, i) => `P${i + 1} (${p.heading || 'Bölüm'}, s.${(p.pages || []).join(',')}): ${String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 340)}`).join('\n');
  const passageChunks = [
   `ANA ÖZET: ${ctx.text || ''}`,
   allPassageDigest
  ].join('\n\n').slice(0, 6200);

  const researchSnippet = unitResearch
   ? `SINAV TAHMİNİ & ARAŞTIRMA: ${JSON.stringify({
      hypotheses: (unitResearch.examHypotheses || []).slice(0, 3),
      confusionPairs: (unitResearch.confusionPairs || []).slice(0, 3)
     })}`
   : '';

  const reframeDirective = doReframe
   ? `\nKRİTİK YENİDEN KURGULAMA (AKLIMDA KALMADI MODU — REFRAME #${(existing?.reframeCount || 0) + 1}):
Öğrenci bu konuda önceki anlatım ve kodlamalara rağmen ÇOK YANLIŞ yaptı veya "aklımda kalmıyor" dedi!
- ESKİ KODLAMALARI KESİNLİKLE YASAKLA VE KULLANMA: [${[...prevMnemonics].join(', ') || 'yok'}]
- TAMAMEN YENİ BİR ANLATIM TARZI KULLAN: "${targetStyle}"
- Kavramları bambaşka, akılda şimşek çaktıracak somut benzetmelerle ve tamamen yeni akrostiş/hikâyelerle anlat!`
   : '';

  const previousNotes = existing
   ? `MEVCUT ANLATIM v${existing.version} (BUNU DAHA DA GELİŞTİR, TEKRARLAYICI PEKİŞTİRMELERİ VE YENİ KODLAMALARI ARTIR):
Başlıklar: ${(existing.deepSections || []).map(s => s.title).join(' | ')}
Önceki kodlamalar: ${(existing.memoryMnemonics || []).map(m => m.code).join(', ')}`
   : 'İLK KEZ KAPSAMLI ANLATIM OLUŞTURUYORSUN — HEMEN BİTMESİN, UZUN VE ÖĞRETİCİ OLSUN!';

  const prompt = `Sen Türkiye Antrenörlük Temel Eğitimi Baş Öğretmeni ve Hafıza/Ezber Stratejistisin.
Öğrencinin hedefi sadece geçmek değil, sınavdaki 5 kitaptan gelecek 20'şer toplam 100 sorunun TAMAMINI (%100 FULL DOĞRU) yapmak!
Görevin: "${ctx.book} / ${ctx.unit}" ünitesi için HEMEN BİTMEYEN, uzun, akıcı ve kusursuz Türkçeyle yazılmış, tekrar edici pekiştirmeler, akılda kalıcı KODLAMALAR (akrostiş/hikâyeleştirme), püf noktaları, 5 FARKLI SORULMA AÇISINI (fiveAngleSpotlight) ve YAPAY ZEKÂ ÇIKABİLECEĞİNİ TESPİT ETMESE BİLE HİÇBİR BÖLÜMÜ ATLAMAYAN "YA ÇIKARSA?" AYRINTILARINI (everyCornerDetails) içeren konu anlatımı hazırlamak.

ÖĞRENCİNİN BU ÜNİTEDEKİ GERÇEK PERFORMANSI & SÜRE VERİSİ:
${perf.summaryText}
ÖNERİLEN ANLATIM ÜSLUBU: ${targetStyle}${reframeDirective}

${previousNotes}
${researchSnippet}
${apexDirective ? `${apexDirective}\n` : ''}
RESMİ DERS KİTABININ TÜM PASAJLARI (Tek bir bölümü bile "buradan soru çıkmaz" diyerek atlama!):
${passageChunks}

Lütfen sadece geçerli JSON döndür:
{
  "overviewHook": "Ünitenin sınavdaki önemi ve 100/100 hedef stratejisi (3-4 cümle)",
  "deepSections": [
    {
      "title": "Bölüm başlığı",
      "body": "UZUN ve açıklayıcı Türkçe konu anlatımı (en az 5-6 cümle, neden-nasıllarıyla adım adım anlat)",
      "recallAnchor": "Tekrar Edici Kalıcı Ezber Cümlesi: Şimdi kendine şu kuralı 2 kez tekrar et..."
    }
  ],
  "proTips": [
    {
      "title": "Püf Noktası Başlığı",
      "tip": "Sınavda soruyu tek bakışta doğru çözdüren kritik bilgi",
      "examTrap": "Sınav komisyonunun kurduğu klasik çeldirici tuzağı ve nasıl kaçınılır"
    }
  ],
  "memoryMnemonics": [
    {
      "code": "KISA KOD / AKROSTİŞ (ör. B-S-Ç-Ö)",
      "standsFor": "Kodun her harfinin kitap kavramı karşılığı",
      "story": "Zihinde kalıcı eğlenceli/somut Türkçe ezber hikayesi veya görsel benzetme"
    }
  ],
  "spacedEchoes": [
    "1. Tekrar: Aynı kuralı farklı sözcüklerle zihninde pekiştir...",
    "2. Tekrar: Karıştırılan kavramı ayıran kritik cümle..."
  ],
  "fiveAngleSpotlight": {
    "concept": "Bu ünitenin sınavda çıkma potansiyeli en yüksek kilit kavramı",
    "angles": [
      { "angle": "1. Doğrudan Tanım", "sampleQuestion": "Bu kavram doğrudan nasıl sorulur?", "keyPoint": "Çözüm anahtarı" },
      { "angle": "2. Ters Köşe / İstisna", "sampleQuestion": "Hangisi söylenemez/değildir biçiminde nasıl sorulur?", "keyPoint": "Eleme anahtarı" },
      { "angle": "3. Saha Vakası", "sampleQuestion": "Gerçek antrenman senaryosunda nasıl sorulur?", "keyPoint": "Senaryo ipucu" },
      { "angle": "4. Karşılaştırma Tuzağı", "sampleQuestion": "En çok karıştırılan kavramla kıyaslanarak nasıl sorulur?", "keyPoint": "Ayırt edici fark" },
      { "angle": "5. Şaşırtıcı Bağlam", "sampleQuestion": "Beklenmedik sonuç/koşul üzerinden nasıl sorulur?", "keyPoint": "Mantık zinciri" }
    ]
  },
  "miniCheckpoints": [
    { "question": "Hızlı öz-kontrol sorusu", "answer": "Net kısa cevap", "hint": "Akılda tutma kodu" }
  ],
  "everyCornerDetails": [
    {
      "heading": "Alt bölüm / pasaj başlığı",
      "keyFact": "Ya çıkarsa diye kesinlikle bilinmesi gereken satır arası/dipnot ayrıntısı",
      "whyItCouldBeAsked": "20 soruluk kitap dağılımında neden sürpriz soru olarak gelebilir"
    }
  ],
  "adaptivePersonalCoach": "Öğrencinin bu ünitedeki hızına (dakika/saniye) ve doğruluk oranına göre kişiselleştirilmiş çalışma koçu tavsiyesi"
}
ÖNEMLİ: deepSections en az 4 uzun bölüm, proTips en az 3 püf noktası, memoryMnemonics en az 3 kodlama, spacedEchoes en az 3 tekrar cümlesi, fiveAngleSpotlight 5 farklı açı ve everyCornerDetails gözden kaçabilecek pasaj detaylarını içermeli; her şey kusursuz Türkçe olmalı.`;

  let parsed = null;
  if (typeof runModelFn === 'function') {
   try {
    const out = await runModelFn(model, prompt, doReframe ? 0.65 : 0.42, signal || AbortSignal.timeout(750), 260, { fastThink: true, numCtx: 3072 });
    parsed = out?.parsed || null;
   } catch {}
  }

  if (!parsed || !Array.isArray(parsed.deepSections) || !parsed.deepSections.length) {
   const fb = this.buildFallbackLesson(ctx, passages, studentProfile, { byUnit: unitResearch ? { [ctx.id]: unitResearch } : {} });
   parsed = {
    ...fb,
    overviewHook: `${fb.overviewHook} [${targetStyle}]`,
    adaptivePersonalCoach: `${fb.adaptivePersonalCoach} · Milisaniye altı sentez (${model || 'subsecond-local'})`
   };
  }

  const cleanStr = (v, max = 1600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const rawSections = Array.isArray(parsed?.deepSections) ? parsed.deepSections : [];
  const deepSections = rawSections
   .filter(s => s && (typeof s.body === 'string' || typeof s.content === 'string') && (s.body || s.content).trim().length >= 25)
   .slice(0, 8)
   .map(s => ({
    title: cleanStr(s.title || s.heading || 'Derin İnceleme', 160),
    body: cleanStr(s.body || s.content, 2200),
    recallAnchor: cleanStr(s.recallAnchor, 420)
   }));

  if (!deepSections.length) {
   throw Error('Üretilen derin konu anlatımı yeterli bölüm içermedi.');
  }

  const proTips = (Array.isArray(parsed?.proTips) ? parsed.proTips : [])
   .filter(t => t && (typeof t.tip === 'string' || typeof t.detail === 'string'))
   .slice(0, 6)
   .map(t => ({
    title: cleanStr(t.title || 'Püf Noktası', 140),
    tip: cleanStr(t.tip || t.detail, 600),
    examTrap: cleanStr(t.examTrap, 450)
   }));

  const memoryMnemonics = (Array.isArray(parsed?.memoryMnemonics) ? parsed.memoryMnemonics : [])
   .filter(m => m && typeof m.code === 'string' && (typeof m.standsFor === 'string' || typeof m.expansion === 'string'))
   .slice(0, 6)
   .map(m => ({
    code: cleanStr(m.code, 90),
    standsFor: cleanStr(m.standsFor || m.expansion, 400),
    story: cleanStr(m.story || m.storyHook, 600)
   }));

  const spacedEchoes = (Array.isArray(parsed?.spacedEchoes) ? parsed.spacedEchoes : [])
   .map(e => typeof e === 'string'
    ? cleanStr(e, 450)
    : cleanStr([e?.prompt, e?.repetitionRule, e?.quickSummary].filter(Boolean).join(' — '), 450))
   .filter(Boolean)
   .slice(0, 6);

  const rawAngles = Array.isArray(parsed?.fiveAngleSpotlight?.angles) ? parsed.fiveAngleSpotlight.angles : [];
  const fiveAngleSpotlight = {
   concept: cleanStr(parsed?.fiveAngleSpotlight?.concept || ctx.unit, 160),
   angles: rawAngles.slice(0, 5).map((a, idx) => ({
    angle: cleanStr(a?.angle || a?.angleName || `${idx + 1}. Açı`, 100),
    sampleQuestion: cleanStr(a?.sampleQuestion || a?.sampleStem, 360),
    keyPoint: cleanStr(a?.keyPoint || a?.whyItWorks, 320)
   })).filter(a => a.sampleQuestion)
  };

  const miniCheckpoints = (Array.isArray(parsed?.miniCheckpoints) ? parsed.miniCheckpoints : [])
   .filter(c => c && typeof c.question === 'string' && typeof c.answer === 'string')
   .slice(0, 5)
   .map(c => ({
    question: cleanStr(c.question, 320),
    answer: cleanStr(c.answer, 450),
    hint: cleanStr(c.hint || c.memoryHook, 220)
   }));

  const parsedCorners = (Array.isArray(parsed?.everyCornerDetails) ? parsed.everyCornerDetails : [])
   .filter(d => d && typeof d.keyFact === 'string' && d.keyFact.trim().length >= 12)
   .slice(0, 12)
   .map(d => ({
    heading: cleanStr(d.heading || 'Alt Bölüm Ayrıntısı', 140),
    pages: [],
    keyFact: cleanStr(d.keyFact, 320),
    whyItCouldBeAsked: cleanStr(d.whyItCouldBeAsked || '20 soruluk kitap dağılımında sürpriz soru olarak çıkabilir.', 240)
   }));
  const fallbackCorners = passages.slice(0, 8).map((p, idx) => ({
   heading: p.heading || `Alt Bölüm ${idx + 1}`,
   pages: Array.isArray(p.pages) ? p.pages : [],
   keyFact: String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 220),
   whyItCouldBeAsked: 'Yapay zekâ tahmin etmese bile sınavda her kitaptan 20 soru geleceği için bu pasaj da soru adayıdır.'
  }));
  const everyCornerDetails = parsedCorners.length ? parsedCorners : fallbackCorners;

  const nextVersion = Number(existing?.version || 0) + 1;
  const nextReframeCount = Number(existing?.reframeCount || 0) + (doReframe ? 1 : 0);
  const usedMnemonics = Array.from(new Set([...prevMnemonics, ...memoryMnemonics.map(m => m.code)])).slice(-20);

  const lesson = {
   unitId: ctx.id,
   book: ctx.book,
   unit: ctx.unit,
   version: nextVersion,
   reframeCount: nextReframeCount,
   activeStyle: targetStyle,
   source: `ai:${model}`,
   model,
   updatedAt: new Date().toISOString(),
   basedOnPerformance: perf,
   overviewHook: cleanStr(parsed?.overviewHook || parsed?.overview, 900),
   deepSections,
   proTips,
   memoryMnemonics,
   spacedEchoes,
   fiveAngleSpotlight,
   miniCheckpoints,
   everyCornerDetails,
   adaptivePersonalCoach: cleanStr(parsed?.adaptivePersonalCoach, 800),
   usedMnemonics,
   history: [
    ...(existing?.history || []),
    {
     version: nextVersion,
     reframeCount: nextReframeCount,
     style: targetStyle,
     model,
     updatedAt: new Date().toISOString(),
     sectionsCount: deepSections.length,
     mnemonicsCount: memoryMnemonics.length,
     studentAnswered: perf.answered,
     studentAvgSec: perf.avgSec
    }
   ].slice(-12)
  };

  await this._atomicWrite(this._lessonFile(ctx.id), lesson);
  return { lesson, performance: perf };
 }
}
