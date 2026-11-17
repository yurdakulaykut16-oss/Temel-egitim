/**
 * Sınav tarzı örnek kitaplığı.
 *
 * Soru yazan modele "bu sınavda sorular NASIL soruluyor" bilgisini verir. Kaynakları:
 *  1) src/examSamples.json ve server/user-exam-examples.json -> kullanıcı örnekleri,
 *  2) server/book-style-questions.json -> kitapların kendi "Neler Öğrendik?" soruları.
 *
 * Örnekten yalnızca BİÇİM alınır (kök kalıbı, şık türü, uzunluk); bilgi her zaman o anki
 * ODAK CÜMLE'den / KONU ANLATIMI'ndan gelir. Kullanıcının güvenilir olarak işaretlediği aynı-bölüm
 * cevapları içerik referansı olarak da kullanılabilir; farklı bölümdeki örnekler yalnızca biçim verir.
 */

/** Kök kalıbı aileleri (istemde okunacak kısa açıklamalarıyla). */
export const STYLE_FAMILIES = {
 tanim_terim: 'uzun bir tanım verilir, karşılığı olan kavram sorulur',
 durum_kavram: 'bir koşul (süre, şiddet, yaş, dönem, amaç) verilir; o koşulda baskın / öncelikli / uygun olan sorulur',
 olumsuz: 'üç doğru, bir yanlış ifade; "değildir / yanlıştır / yer almaz" kökü',
 onculu: 'I, II, III diye numaralı öncüller verilir',
 sayisal: 'yaş aralığı, süre, yıl, sayı ya da oran sorulur',
 bosluk: 'cümlede boş bırakılan yer sorulur',
 kisa_net: 'tek cümlelik, kısa ve doğrudan kök; şıklar 1-3 kelimelik kavram adları'
};

const norm = s => String(s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

/** Bir soru kökünün hangi kalıp ailesine girdiğini kaba ama kararlı biçimde belirler. */
export function classifyStemStyle(question, options = []) {
 const raw = String(question || '');
 const q = norm(raw);
 if (!q) return 'kisa_net';
 // Öncül numaraları büyük harfle aranır: tr-TR küçültmesinde "I" -> "ı" olur.
 if (/(^|\s)I\.\s/.test(raw) && /\sII\.\s/.test(raw)) return 'onculu';
 if (/…{1,}|\.{4,}|_{3,}|-{4,}|boş bırakılan/.test(q)) return 'bosluk';
 if (/değildir|yanlıştır|yer almaz|söylenemez|olamaz|beklenmez|bulunmaz|dışındadır|hangisi .* değil/.test(q)) return 'olumsuz';
 const opts = Array.isArray(options) ? options.map(String) : [];
 const numericOptions = opts.length >= 3 && opts.filter(o => /\d/.test(o)).length >= Math.ceil(opts.length * 0.75);
 if (numericOptions || /(^|\s)kaç(tır|\s|$)|yaş aralığı|hangi yıl|yüzde kaç|kaç yaş/.test(q)) return 'sayisal';
 if (/baskın|öncelikli|ilk olarak|en önemli|en uygun|en çok|ağırlıklı|hangi evre|hangi dönem|hangi aşama/.test(q)) return 'durum_kavram';
 if (/^[“"'‘]/.test(raw.trim()) || /tanımı|olarak tanımlan|olarak adlandırıl|ifade eder|ne denir|denir\?|yeteneği|yetisi|kavram(ı)? aşağıdakilerden|hangisini (ifade|tanımla)/.test(q)) {
  return raw.length >= 110 ? 'tanim_terim' : 'kisa_net';
 }
 return 'kisa_net';
}

/** Soru tipi -> o tipe en çok yakışan kök kalıbı aileleri (öncelik sırasıyla). */
export const TYPE_STYLE_FAMILIES = {
 kavram: ['kisa_net', 'tanim_terim', 'sayisal'],
 tanimdan_terim: ['tanim_terim'],
 durum_kavram: ['durum_kavram', 'sayisal'],
 kisa_net: ['kisa_net', 'sayisal'],
 istisna: ['olumsuz'],
 bosluk_doldurma: ['bosluk', 'tanim_terim'],
 karsilastirma: ['durum_kavram', 'kisa_net'],
 uygulama: ['durum_kavram', 'sayisal'],
 en_iyi_secim: ['durum_kavram'],
 dogru_yargi: ['olumsuz', 'onculu'],
 neden_sonuc: ['kisa_net', 'durum_kavram'],
 vaka: ['durum_kavram'],
 ilginc_bilgi: ['kisa_net'],
 paragraf: []
};

/**
 * Kullanıcı örnekleri + kitap sorularından tek biçimli örnek listesi kurar.
 * Kullanıcının gönderdiği örnekler `priority: true` taşır ve seçimde öne alınır.
 */
export function buildStyleLibrary({ samples = [], bookQuestions = [] } = {}) {
 const out = [];
 const seen = new Set();
 const push = (q, extra) => {
  const question = String(q?.question || '').replace(/\s+/g, ' ').trim();
  const answer = String(q?.answer || '').trim();
  if (!question || !answer || !q?.unitId) return;
  const key = `${q.unitId}|${norm(question)}`;
  if (seen.has(key)) return;
  seen.add(key);
  const options = Array.isArray(q.options5) && q.options5.length ? q.options5 : (Array.isArray(q.options) ? q.options : []);
  out.push({ unitId: q.unitId, question, answer, family: q.style && STYLE_FAMILIES[q.style] ? q.style : classifyStemStyle(question, options), answerVerified: q.answerVerified === true, userTrusted: q.userTrusted === true, ...extra });
 };
 for (const s of samples) push(s, { priority: true, origin: s.origin || 'kullanıcı örneği' });
 for (const b of bookQuestions) push(b, { priority: false, origin: 'kitap sorusu' });
 return out;
}

/**
 * Bir istem için tarz örneği seçer.
 * Sıra: (aynı bölüm + uygun aile) > (aynı kitap + uygun aile) > (herhangi bölüm + uygun aile) > aynı bölüm.
 * Her grupta kullanıcı örnekleri öndedir; `rotation` ile dönülür ki hep aynı örnek gösterilmesin.
 */
export function pickStyleExample(library, { unitId, questionType, rotation = 0 } = {}) {
 if (!Array.isArray(library) || !library.length) return null;
 const families = TYPE_STYLE_FAMILIES[questionType];
 if (Array.isArray(families) && !families.length) return null;
 const wanted = families || ['kisa_net'];
 const book = String(unitId || '').split('-')[0];
 const inFamily = e => wanted.includes(e.family);
 const tiers = [
  library.filter(e => e.unitId === unitId && inFamily(e)),
  library.filter(e => e.unitId !== unitId && String(e.unitId).split('-')[0] === book && inFamily(e)),
  library.filter(e => String(e.unitId).split('-')[0] !== book && inFamily(e)),
  library.filter(e => e.unitId === unitId)
 ];
 const r = Math.max(0, Math.floor(Number(rotation) || 0));
 for (const tier of tiers) {
  if (!tier.length) continue;
  const ordered = [...tier.filter(e => e.priority), ...tier.filter(e => !e.priority)];
  return ordered[r % ordered.length];
 }
 return null;
}

const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));

/** İsteme eklenecek kısa blok (boş örnekte ''). */
export function buildExamStyleBlock(example, { sameUnit = false } = {}) {
 if (!example?.question) return '';
 const family = STYLE_FAMILIES[example.family] ? ` Kalıp: ${STYLE_FAMILIES[example.family]}.` : '';
 const scope = sameUnit ? '' : ' Örnek başka bir konudandır;';
 const trustedSameUnit = example.userTrusted === true && sameUnit;
 const guidance = trustedSameUnit
  ? ' Aynı bölümdeki bu cevap güvenilir içerik referansıdır; bu bilgiyi hedeflenen zorluk düzeyinde yeni ve özgün biçimde ölç, örnek soruyu kopyalama.'
  : ` yalnızca soru kurma BİÇİMİNİ örnek al.${scope} bilgiyi ODAK CÜMLE'den / KONU ANLATIMI'ndan al, bu soruyu ve cevabını KOPYALAMA.`;
 const verification = example.answerVerified === false ? ' Cevap doğrulanmamış; bilgiyi alma.' : '';
 return `\nSINAV TARZI ÖRNEĞİ (${example.origin || 'örnek'};${guidance}${verification}${family}): Soru="${clip(example.question, 230)}" | Doğru="${clip(example.answer, 50)}"`;
}

/** Kitaplığın aile dağılımı (rapor ve testler için). */
export function styleLibraryStats(library) {
 const families = {};
 const units = new Set();
 let priority = 0;
 for (const e of library || []) {
  families[e.family] = (families[e.family] || 0) + 1;
  units.add(e.unitId);
  if (e.priority) priority++;
 }
 return { total: (library || []).length, priority, units: units.size, families };
}
