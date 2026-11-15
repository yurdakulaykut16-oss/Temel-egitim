// Kayserili + Sert/Küfürlü Komedi Üsluplu AI Tepki ve Diyalog Motoru
// Not: Öğrencinin isteğine göre Kayseri şivesi, sert argo/küfür komedisi ve doğrudan bilgi/terim öğretimini birleştirir.

export function extractKeyTermsFromUnit(ctx, passages = [], lesson = null) {
 const terms = [];
 const seen = new Set();

 if (Array.isArray(lesson?.memoryMnemonics)) {
  for (const m of lesson.memoryMnemonics.slice(0, 2)) {
   if (m?.code && !seen.has(m.code)) {
    seen.add(m.code);
    terms.push({
     term: `${m.code}${m.standsFor ? ` (${m.standsFor})` : ''}`.slice(0, 65),
     meaning: (m.story || '').slice(0, 140),
     examTip: 'Sınavda şıkları bu kodlamayla ele!'
    });
   }
  }
 }

 const sentences = [
  ...(String(ctx?.text || '').split('.')),
  ...passages.slice(0, 6).flatMap(p => String(p.text || '').split('.'))
 ].map(s => s.trim()).filter(s => s.length >= 22 && s.length <= 220);

 // 1) Öncelikle sayısal ölçütlü veya karşılaştırmalı kritik cümleleri çıkar
 for (const s of sentences) {
  if (terms.length >= 8) break;
  const hasNumeric = /\d+\s*(%|dk|dakika|saat|hafta|gün|tekrar|set|sn|saniye|atım|bpm|kalori|derece|yaş|ml|kg|1rm)/i.test(s);
  const hasContrast = /\b(?:ise|aksine|farklı olarak|ancak|yalnızca|zorunludur)\b/i.test(s);
  if (!hasNumeric && !hasContrast) continue;
  const words = s.split(/\s+/);
  const head = words.slice(0, 4).join(' ').replace(/[,:;.]$/, '');
  if (head.length >= 4 && !seen.has(head.toLowerCase())) {
   seen.add(head.toLowerCase());
   terms.push({
    term: head,
    meaning: s,
    examTip: hasNumeric ? 'Sayısal sınır sorusu — ezberle!' : 'Karşılaştırma & istisna tuzağı — ayırt et!'
   });
  }
 }

 for (const s of sentences) {
  if (terms.length >= 8) break;
  const words = s.split(/\s+/);
  const head = words.slice(0, 3).join(' ').replace(/[,:;.]$/, '');
  if (head.length >= 4 && !seen.has(head.toLowerCase())) {
   seen.add(head.toLowerCase());
   terms.push({
    term: head,
    meaning: s,
    examTip: 'Kitapta birebir geçiyor — doğrudan cevap adayı!'
   });
  }
 }

 if (!terms.length) {
  terms.push({
   term: ctx?.unit || 'Ana Kavram',
   meaning: String(ctx?.text || ctx?.unit || '').slice(0, 140),
   examTip: 'Modülde mutlaka çıkar!'
  });
 }
 return terms.slice(0, 8);
}

export function buildKayseriReaction({
 unitId = '0-0',
 unitTitle = 'Antrenman Bilimi',
 question = '',
 chosenOption = '',
 selectedOption = '',
 correctOption = '',
 correctAnswer = '',
 isCorrect = true,
 elapsedSec = 8,
 streak = 0,
 wrongCount = 0,
 explanation = '',
 evidence = '',
 personaMode = '',
 mode = 'kayseri_sert',
 ctx = null,
 passages = []
} = {}) {
 void unitId;
 void question;
 const sec = Math.max(1, Math.round(Number(elapsedSec) || 8));
 const cleanCorrect = String(correctAnswer || correctOption || '').trim();
 const cleanChosen = String(selectedOption || chosenOption || '').trim();
 const activeMode = (personaMode || mode) === 'temiz_klasik' || (personaMode || mode) === 'kayseri_kibar'
  ? 'temiz_klasik'
  : 'kayseri_sert';
 const pick = arr => arr[Math.floor(Math.random() * arr.length)];
 const terms = ctx ? extractKeyTermsFromUnit(ctx, passages) : [];
 const mustKnowTerm = terms[0] ? `${terms[0].term} — ${terms[0].meaning.slice(0, 100)}` : (cleanCorrect ? `${cleanCorrect} (${unitTitle})` : unitTitle);
 const examFact = String(explanation || evidence || (cleanCorrect ? `Doğru cevap: "${cleanCorrect}".` : unitTitle)).trim();

 if (activeMode === 'temiz_klasik') {
  if (isCorrect) {
   const headline = pick([
    `Maşallah gardaşım, ${sec} saniyede tam isabet!`,
    `Helal olsun gurban, Erciyes gibi dimdik bildin!`,
    `Ellerine sağlık emmi oğlu, bu soruyu pastırma gibi ince ince doğradın!`
   ]);
   const roastOrPraise = `Doğru cevap "${cleanCorrect}". Aklına kazı, sınavda da böyle net bas geç!`;
   return {
    speakerLabel: '🎓 KLASİK KAYSERİ KOÇU',
    mode: 'temiz_klasik',
    personaMode: 'kayseri_kibar',
    isCorrect: true,
    mood: streak >= 3 ? 'on_fire' : 'happy',
    badge: streak >= 3 ? `🔥 ${streak} SERİ! KAYSERİ ASLANI` : `✅ ${sec}sn DOĞRU!`,
    headline,
    roastOrPraise,
    comment: roastOrPraise,
    examFact,
    evidence,
    mustKnowTerm,
    keyTakeaway: cleanCorrect
   };
  }
  const headline = pick([
   `Ah gurbanım elin kaydı herhalde, "${cleanChosen}" değilmiş!`,
   `Canın sağ olsun gardaşım, bu soruda küçük bir tuzağa bastık.`
  ]);
  const roastOrPraise = `Doğrusu "${cleanCorrect}" olacaktı. Bir nefes al, kelimenin püf noktasını kap!`;
  return {
   speakerLabel: '🎓 KLASİK KAYSERİ KOÇU',
   mode: 'temiz_klasik',
   personaMode: 'kayseri_kibar',
   isCorrect: false,
   mood: 'roast_soft',
   badge: `⚠️ YANLIŞ (${sec}sn) · HEMEN TOPARLA`,
   headline,
   roastOrPraise,
   comment: roastOrPraise,
   examFact,
   evidence,
   mustKnowTerm,
   keyTakeaway: cleanCorrect
  };
 }

 // Varsayılan: Kayserili + Keskin Küfürlü/Argo Sert Komedi (kayseri_sert)
 if (isCorrect) {
  if (sec <= 6) {
   const headline = pick([
    `Oha lan ${sec} saniyede zımbaladın, klavyenin anasını ağlattın gardaşım!`,
    `Vay anasını satayım! Soruyu okumadan kokusundan mı bildin la, Kayseri pastırması mı yedin sabah?!`,
    `Çüşşş ${sec} saniye ne la! Sorunun ağzını burnunu kırdın, helal olsun aslanım!`
   ]);
   const roastOrPraise = `"${cleanCorrect}" şıkkını şak diye yapıştırdın. Sınavda da komisyonun canına oku böyle geç!`;
   return {
    speakerLabel: '🌶️ KAYSERİLİ KOÇ EMMİ',
    mode: 'kayseri_sert',
    personaMode: 'kayseri_sert',
    isCorrect: true,
    mood: 'godmode',
    badge: `⚡ ${sec}sn · OHA MAKİNA MISIN LA!`,
    headline,
    roastOrPraise,
    comment: roastOrPraise,
    examFact,
    evidence,
    mustKnowTerm,
    keyTakeaway: cleanCorrect
   };
  }
  if (streak >= 3) {
   const headline = pick([
    `Ula gardaşım ${streak}'te ${streak} yaptın, Erciyes'in karını erittin be!`,
    `Vay arkadaş bu çocuk çıldırdı lan! ${streak} seri nedir emmi oğlu, komisyon ağlıyor şu an!`,
    `Ha şöyle yola gel aslanım! ${streak} sorudur tek fire yok, akşama iki porsiyon mantı hak ettin!`
   ]);
   const roastOrPraise = `Cevap tabii ki "${cleanCorrect}". Bu tempoyla 100/100 full çekmeyen namerttir!`;
   return {
    speakerLabel: '🌶️ KAYSERİLİ KOÇ EMMİ',
    mode: 'kayseri_sert',
    personaMode: 'kayseri_sert',
    isCorrect: true,
    mood: 'on_fire',
    badge: `🔥 ${streak} ÜST ÜSTE · DURDURAN YOK!`,
    headline,
    roastOrPraise,
    comment: roastOrPraise,
    examFact,
    evidence,
    mustKnowTerm,
    keyTakeaway: cleanCorrect
   };
  }
  if (sec >= 30) {
   const headline = pick([
    `La gardaşım ${sec} saniye ney, Kayseri'de mantı mı açtın arada? Ama bildin lan helal!`,
    `Vay arkadaş ${sec} saniye düşündün, dedim beyin yandı herhal — sonunda şak diye bildin!`
   ]);
   const roastOrPraise = `Doğru cevap "${cleanCorrect}". Bildin eyvallah ama sınavda biraz daha seri bas gurban!`;
   return {
    speakerLabel: '🌶️ KAYSERİLİ KOÇ EMMİ',
    mode: 'kayseri_sert',
    personaMode: 'kayseri_sert',
    isCorrect: true,
    mood: 'slow_win',
    badge: `🐢 ${sec}sn · GEÇ OLDU AMA TEMİZ!`,
    headline,
    roastOrPraise,
    comment: roastOrPraise,
    examFact,
    evidence,
    mustKnowTerm,
    keyTakeaway: cleanCorrect
   };
  }
  const headline = pick([
   `Hah şöyle lan! "${cleanCorrect}" şıkkının alnının çatına vurdun!`,
   `Helal la sana emmi oğlu! Bu soruda hamam böceği Böcü bile senin hızına yetişemez!`,
   `Bomba gibi bildin gardaşım! Hesabını bilen adam böyle şak diye doğruya basar!`
  ]);
  const roastOrPraise = `Ünite (${unitTitle}): "${cleanCorrect}" bilgisini cebe attık. Devam et durmak yok!`;
  return {
   speakerLabel: '🌶️ KAYSERİLİ KOÇ EMMİ',
   mode: 'kayseri_sert',
   personaMode: 'kayseri_sert',
   isCorrect: true,
   mood: 'happy',
   badge: `✅ ${sec}sn · TAM İSABET GARDAŞIM`,
   headline,
   roastOrPraise,
   comment: roastOrPraise,
   examFact,
   evidence,
   mustKnowTerm,
   keyTakeaway: cleanCorrect
  };
 }

 // YANLIŞ CEVAPLAR — Kayserili Küfürlü/Argo Sert Komedi Tepkileri
 if (wrongCount >= 2) {
  const headline = pick([
   `Yuh la gardaşım kaçıncı yanlış oldu bu! Erciyes'in rüzgarı kafana mı vurdu lan?!`,
   `Hass... siktir et demeyeceğim gurban, uyan! Bu hamam böceği Böcü bile bu kadar düşmedi!`,
   `Oğlum ne yaptın la! "${cleanChosen}" şıkkına basarken hiç mi için sızlamadı emmi oğlu?!`
  ]);
  const roastOrPraise = `Bak buraya kafanı gözünü aç da bak: DOĞRUSU "${cleanCorrect}"! Şu kelimeyi aklına kazımadan bir yere gitmek yok!`;
  return {
   speakerLabel: '🌶️ KAYSERİLİ KOÇ EMMİ',
   mode: 'kayseri_sert',
   personaMode: 'kayseri_sert',
   isCorrect: false,
   mood: 'rage_comedy',
   badge: `💀 ${wrongCount + 1}. HATA · UYAN GARDAŞIM!`,
   headline,
   roastOrPraise,
   comment: roastOrPraise,
   examFact,
   evidence,
   mustKnowTerm,
   keyTakeaway: cleanCorrect
  };
 }
 if (sec <= 4) {
  const headline = pick([
   `Çüşşş ${sec} saniyede soruyu okumadan neye bastın lan, pastırma mı kapışıyoz?!`,
   `La yavaş ol biraz itfaiye mi çağırıyon! "${cleanChosen}" değil oğlum o, sazan gibi atlamışın yeme!`
  ]);
  const roastOrPraise = `Tuzakçı Can'la hamam böceği Böcü seni tavladı! Doğrusu "${cleanCorrect}" — azıcık oku öyle bas gurban!`;
  return {
   speakerLabel: '🌶️ KAYSERİLİ KOÇ EMMİ',
   mode: 'kayseri_sert',
   personaMode: 'kayseri_sert',
   isCorrect: false,
   mood: 'rush_roast',
   badge: `💥 ${sec}sn ACELE TUZAĞI!`,
   headline,
   roastOrPraise,
   comment: roastOrPraise,
   examFact,
   evidence,
   mustKnowTerm,
   keyTakeaway: cleanCorrect
  };
 }
 const headline = pick([
  `Vay arkadaş nasıl "${cleanChosen}" dedin lan buna! Pastırmayı kaptırdın elin adamına!`,
  `Oğlum sen şaka mısın la, Kayseri çarşısında böyle pazarlık yapsan dükkânı siktir edip batırırsın!`,
  `Çüşş gurbanım, "${cleanChosen}" ne alaka! Beyin kısa devre mi yaptı iki dakka?`
 ]);
 const roastOrPraise = `Doğru cevap kabak gibi ortada: "${cleanCorrect}". Şimdi bunu hafızana çak, bir daha aynı boka... pardon tuzağa düşme!`;
 return {
  speakerLabel: '🌶️ KAYSERİLİ KOÇ EMMİ',
  mode: 'kayseri_sert',
  personaMode: 'kayseri_sert',
  isCorrect: false,
  mood: 'roast',
  badge: `🌶️ YANLIŞ (${sec}sn) · KAYSERİLİ KOÇ KIZDI`,
  headline,
  roastOrPraise,
  comment: roastOrPraise,
  examFact,
  evidence,
  mustKnowTerm,
  keyTakeaway: cleanCorrect
 };
}

export async function generateAiKayseriReaction(params = {}, opts = {}) {
 const { runModelFn: pRun, model: pModel, signal: pSignal, ...cleanParams } = params;
 const runModelFn = opts.runModelFn || pRun;
 const model = opts.model || pModel;
 const signal = opts.signal || pSignal;

 const fallback = buildKayseriReaction(cleanParams);
 if (!runModelFn || !model) return fallback;

 try {
  const modeNote = fallback.mode === 'temiz_klasik'
   ? 'Sıcak Kayseri şivesiyle konuş (küfürsüz, esprili).'
   : 'Kayserili ağzıyla ("la gardaşım", "emmi oğlu", "gurban", "pastırma", "mantı", "Erciyes") keskin argo/hafif küfürlü sert komedi karışık konuş; çok komik ama öğretici ol!';
  const prompt = `Sen Kayserili, komik ve dobra bir Antrenörlük Sınav Koçusun. ${modeNote}
Öğrenci az önce bir soruya ${cleanParams.elapsedSec || 5} saniyede cevap verdi.
Ünite: ${cleanParams.unitTitle || 'Ünite'}
Soru: ${String(cleanParams.question || '').slice(0, 220)}
Öğrencinin bastığı şık: ${cleanParams.selectedOption || cleanParams.chosenOption || ''} (${cleanParams.isCorrect ? 'DOĞRU BİLDİ' : 'YANLIŞ YAPTI!'})
Gerçek doğru cevap: ${cleanParams.correctAnswer || cleanParams.correctOption || ''}
Seri: ${cleanParams.streak || 0}

JSON döndür:
{
  "headline": "Tek cümlelik çok komik Kayserili tepki başlığı",
  "roastOrPraise": "Hem güldüren hem de neden doğru/yanlış olduğunu 1 cümlede kafaya çakan açıklama"
}`;
  const { parsed } = await runModelFn(model, prompt, 0.85, signal || AbortSignal.timeout(2800), 220, { fastThink: true, numCtx: 2048 });
  if (parsed && typeof parsed.headline === 'string' && parsed.headline.trim().length >= 8) {
   const text = typeof parsed.roastOrPraise === 'string' && parsed.roastOrPraise.trim()
    ? parsed.roastOrPraise.trim().slice(0, 320)
    : fallback.roastOrPraise;
   return {
    ...fallback,
    headline: parsed.headline.trim().slice(0, 220),
    roastOrPraise: text,
    comment: text,
    source: `ai:${model}`
   };
  }
 } catch {}
 return fallback;
}
