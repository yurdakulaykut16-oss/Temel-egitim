/**
 * PrecisionQualityEngine — 29 Üniteli Temel Eğitim Antrenörlük Alan Aksiyomları,
 * Çok Katmanlı Kanıt Doğrulama, ÖSYM Çeldirici Simetrisi, Polarite & Kök Sızıntısı Analizi.
 */

const TR_STOPWORDS = new Set([
 'bir', 've', 'ile', 'için', 'gibi', 'olan', 'hangisidir', 'hangisi', 'nedir',
 'aşağıdakilerden', 'yukarıdakilerden', 'göre', 'daha', 'olarak', 'kadar', 'ancak',
 'fakat', 'veya', 'ya', 'da', 'de', 'bu', 'şu', 'o', 'her', 'tüm', 'en', 'ise',
 'olarak', 'durumda', 'arasında', 'hakkında', 'ilgili', 'yönelik', 'şeklinde', 'biçimde'
]);

const BANNED_LAZY_OPTION_RE = /(?:yukarıdakilerin\s*(?:hepsi|tümü|tamamı)|aşağıdakilerin\s*(?:hepsi|tümü|tamamı)|hiçbiri|hepsi\s+doğru|tümü\s+doğru|(?:şık|seçenek)[a-zçğıöşü]*\s+(?:a\s+ve\s+b|b\s+ve\s+c))/i;
const ABSOLUTE_QUANTIFIER_RE = /\b(?:asla|tamamen|kesinlikle|hiçbir\s+zaman|hiçbir\s+şekilde|yalnızca|sadece|daima|mutlaka|bütünüyle|her\s+zaman|kesin\s+olarak)\b/gi;
const NEGATIVE_STEM_RE = /\b(?:değildir|yanlıştır|söylenemez|beklenmez|çıkarılamaz|ulaşılamaz|yer\s+almaz|kapsamaz|örnek\s+olamaz|ait\s+değildir|göstermez|görülmez)\b/i;

export function normalizeTr(s) {
 return String(s || '')
  .toLocaleLowerCase('tr-TR')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

export function stemTokensTr(text) {
 return normalizeTr(text)
  .split(' ')
  .filter(w => (/\d/.test(w) || w.length >= 2) && !TR_STOPWORDS.has(w))
  .map(w => (/\d/.test(w) ? w : w.length > 6 ? w.slice(0, 6) : w));
}

export function extractNumbersAndUnits(text) {
 const matches = String(text || '').toLocaleLowerCase('tr-TR').match(/\d+(?:[.,/:-]\d+)?/g) || [];
 return Array.from(new Set(matches.map(m => m.replace(',', '.'))));
}

export function similarityTr(a, b) {
 const ta = stemTokensTr(a);
 const tb = stemTokensTr(b);
 const aa = new Set(ta);
 const bb = new Set(tb);
 if (!aa.size || !bb.size) return 0;
 let inter = 0;
 for (const w of aa) if (bb.has(w)) inter++;
 const uniSim = inter / Math.max(aa.size, bb.size);
 if (ta.length >= 3 && tb.length >= 3) {
  const ba = new Set(ta.slice(0, -1).map((w, i) => `${w}_${ta[i + 1]}`));
  const bb2 = new Set(tb.slice(0, -1).map((w, i) => `${w}_${tb[i + 1]}`));
  let biInter = 0;
  for (const bg of ba) if (bb2.has(bg)) biInter++;
  const biSim = biInter / Math.max(ba.size, bb2.size);
  return Math.max(uniSim, biSim * 1.15);
 }
 return uniSim;
}

/**
 * 5 Kitap · 29 Ünite Bilimsel Aksiyom ve Kavram Karışıklık Haritası
 * Her girdi server/contexts.json ders kitaplarına dayalıdır.
 */
export const UNIT_AXIOM_ATLAS = {
 '0-0': {
  axioms: [
   'Fiziksel aktivite enerji harcatan her iskelet kası hareketidir; egzersiz planlı, yapılandırılmış ve tekrarlı fiziksel aktivitedir.',
   'Antrenman belirli bir gelişim ve performans hedefi için düzenlenen sistematik süreçtir.',
   'Yüklenme sonrası geçici yorgunluk ve yeterli toparlanma dengesi uyumu (süperkompansasyonu) destekler.'
  ],
  confusionPairs: [['fiziksel aktivite', 'egzersiz'], ['egzersiz', 'antrenman'], ['yüklenme', 'toparlanma']],
  forbiddenClaims: [
   { pattern: /fiziksel\s+aktivite.*?(?:her\s+zaman|mutlaka)\s+planlı/i, reason: 'Fiziksel aktivite günlük yaşam hareketlerini de kapsar; planlı/tekrarlı olan egzersizdir.' }
  ]
 },
 '0-1': {
  axioms: [
   'Kondisyonel hazırlık kuvvet, dayanıklılık ve sürat gibi fiziksel özellikleri; teknik hazırlık becerinin doğru ve ekonomik uygulanışını geliştirir.',
   'Taktik hazırlık müsabakada baskı/rakip koşullarına göre doğru karar ve plan seçimini içerir.',
   'Psikolojik hazırlık odaklanma, kaygı yönetimi ve özgüveni destekler.'
  ],
  confusionPairs: [['teknik hazırlık', 'taktik hazırlık'], ['kondisyonel hazırlık', 'psikolojik hazırlık']],
  forbiddenClaims: [
   { pattern: /teknik\s+hazırlık.*?(?:rakibe|müsabaka\s+durumuna)\s+göre\s+karar/i, reason: 'Rakibe göre karar/strateji seçimi taktik hazırlıktır; teknik hareketin uygulanışıdır.' }
  ]
 },
 '0-2': {
  axioms: [
   'Şiddet çalışmanın yoğunluğunu, hacim toplam iş miktarını, sıklık ise çalışmaların tekrar aralığını anlatır.',
   'Bireyselleştirme aynı programı herkese uygulamamayı; yaş, deneyim ve gelişim düzeyini dikkate almayı gerektirir.',
   'Bilinçli katılım, çok yönlü gelişim, süreklilik, çeşitlilik ve branşa özgülük temel ilkelerdir.'
  ],
  confusionPairs: [['şiddet', 'hacim'], ['hacim', 'sıklık'], ['çeşitlilik', 'branşa özgülük']],
  forbiddenClaims: [
   { pattern: /hacim.*?yoğunluktur|şiddet.*?toplam\s+iş\s+miktarı/i, reason: 'Şiddet yoğunluğu, hacim toplam iş miktarını ifade eder (kavramlar ters çevrilmiş).' }
  ]
 },
 '0-3': {
  axioms: [
   'Kuvvet dirence karşı koyma/yenme; dayanıklılık yorgunluğa direnme; sürat hareketi kısa sürede gerçekleştirme yeteneğidir.',
   'Maksimal kuvvet yüksek dirence karşı, çabuk kuvvet kısa sürede, kuvvette devamlılık tekrarlanan kuvvet uygulamasını vurgular.',
   'Esneklik eklem hareket açıklığıyla, reaksiyon sürati uyarana yanıtın başlamasıyla ilişkilidir.'
  ],
  confusionPairs: [['maksimal kuvvet', 'çabuk kuvvet'], ['kuvvette devamlılık', 'dayanıklılık'], ['reaksiyon sürati', 'esneklik']],
  forbiddenClaims: [
   { pattern: /bir\s+motorik\s+özellik.*?diğerlerinin\s+de\s+otomatik\s+iyi/i, reason: 'Bir motorik özellikte iyi olmak otomatik olarak diğerlerinin de iyi olduğunu göstermez.' }
  ]
 },
 '0-4': {
  axioms: [
   'Koordinasyon sinir ve kas sistemlerinin uyumlu, akıcı ve ekonomik çalışmasıdır.',
   'Çeviklik değişen koşullarda hızlı ve kontrollü yön/pozisyon değiştirmeyi içerir.',
   'Denge statik (tek ayak sabit duruş) veya dinamik (hareket sırasında kontrol) olabilir.'
  ],
  confusionPairs: [['statik denge', 'dinamik denge'], ['çeviklik', 'hareketlilik'], ['koordinasyon', 'denge']],
  forbiddenClaims: []
 },
 '0-5': {
  axioms: [
   'Birim antrenman giriş, ısınma, ana bölüm ve bitirişten oluşabilir.',
   'Mikro plan haftalık ölçektedir; yıllık ve dört yıllık olimpik döngüler uzun vadeli planlamada kullanılır.',
   'Ders kitabı aylık döngüyü makro olarak adlandırır; farklı kaynaklarda terimler değişebilir.'
  ],
  confusionPairs: [['mikro döngü', 'yıllık plan'], ['ısınma', 'ana bölüm'], ['bitiriş', 'giriş']],
  forbiddenClaims: []
 },
 '0-6': {
  axioms: [
   'Ölçme bir özelliği gözlemleyip sayı/sembolle ifade etmektir; değerlendirme ölçüt ile karşılaştırıp yorumlamaktır.',
   'Antropometrik ölçümler boy, vücut kütlesi ve vücut yapısını inceler.',
   'Dikey sıçrama patlayıcı kuvvet, mekik koşusu aerobik kapasite tahmini, T-test/Illinois çeviklik için kullanılır.'
  ],
  confusionPairs: [['ölçme', 'değerlendirme'], ['dikey sıçrama', 'mekik koşusu'], ['antropometri', 'çeviklik testi']],
  forbiddenClaims: [
   { pattern: /dikey\s+sıçrama.*?aerobik|mekik\s+koşusu.*?patlayıcı\s+kuvvet/i, reason: 'Dikey sıçrama patlayıcı kuvvet, mekik koşusu aerobik kapasite içindir.' }
  ]
 },
 '0-7': {
  axioms: [
   'Yetenek seçimi erken belirleme, gelişimin izlenmesi ve ileri aşama seçimi evrelerinden oluşur.',
   'Performans yalnız tek bir ölçüme değil gelişim hızı, çevre, deneyim ve antrenman yanıtına da bağlıdır.',
   'Hareket ekonomisi belirli bir işi görece düşük enerji harcayarak yapabilme verimliliğidir.'
  ],
  confusionPairs: [['erken belirleme', 'gelişimin izlenmesi'], ['tek ölçüm', 'uzun süreli yanıt']],
  forbiddenClaims: [
   { pattern: /yetenek\s+seçimi.*?(?:yalnız|sadece)\s+tek\s+bir\s+ölçüme/i, reason: 'Yetenek seçimi yalnız o günün tek skoruna göre yapılmaz.' }
  ]
 },
 '1-0': {
  axioms: [
   'Anatomik duruşta kişi dik, avuçlar öne bakar; medial orta hatta yakın, lateral uzak; proksimal başlangıca yakın, distal uzaktır.',
   'Sagittal düzlemde fleksiyon ve ekstansiyon; frontal düzlemde abduksiyon ve adduksiyon; transvers düzlemde rotasyon görülür.',
   'Maksimum kas kuvveti üretim sıralaması büyükten küçüğe: Eksantrik > İzometrik > Konsantrik şeklindedir.',
   'Üçüncü tip kaldıraçta kuvvet, destek (eklem) ile yük (direnç) arasındadır.'
  ],
  confusionPairs: [['medial', 'lateral'], ['proksimal', 'distal'], ['sagittal', 'frontal'], ['fleksiyon', 'ekstansiyon'], ['abduksiyon', 'adduksiyon'], ['eksantrik', 'konsantrik']],
  forbiddenClaims: [
   { pattern: /anatomik\s+duruşta\s+avuçlar\s+(?:arkaya|içe|aşağı)/i, reason: 'Anatomik duruşta avuçlar öne bakar.' },
   { pattern: /sagittal.*?abduksiyon|frontal.*?fleksiyon/i, reason: 'Sagittal düzlem fleksiyon/ekstansiyon, frontal düzlem abduksiyon/adduksiyon ile ilişkilidir.' }
  ]
 },
 '1-1': {
  axioms: [
   'ATP hücrenin kullanılabilir enerji taşıyıcısıdır; mitokondri aerobik enerji üretiminde, ribozom protein sentezinde, sarkoplazmik retikulum Ca++ düzenlenmesinde rol alır.',
   'ATP-CP (fosfajen) sistemi laktik asit üretmeden (alaktik) çok kısa ve patlayıcı yüksek şiddetli işlerde baskındır; anaerobik glikoliz ve aerobik sistem aynı anda çalışır, katkıları süre ve şiddete göre değişir.'
  ],
  confusionPairs: [['fosfajen (ATP-CP)', 'aerobik sistem'], ['mitokondri', 'ribozom'], ['sarkoplazmik retikulum', 'mitokondri']],
  forbiddenClaims: [
   { pattern: /enerji\s+sistemleri.*?sırayla\s+tek\s+başına|önce\s+biri\s+tamamen\s+biter/i, reason: 'Enerji sistemleri aynı anda çalışır; baskın katkı süre ve şiddete göre değişir.' },
   { pattern: /(?:atp[-\s]*(?:cp|pc)|fosfajen).*?laktik\s+asit/i, reason: 'ATP-CP (fosfajen) sistemi alaktik bir yoldur; laktik asit üretmez.' }
  ]
 },
 '1-2': {
  axioms: [
   'Karbonhidratlar egzersiz için önemli yakıt (kas ve karaciğerde glikojen), proteinler doku yapımı/onarımı, yağlar özellikle uzun süreli etkinliklerde enerji sağlar.',
   'B ve C vitaminleri suda; A, D, E ve K vitaminleri yağda çözünür.',
   'Demir hemoglobinde oksijen taşınmasında, kalsiyum kemik sağlığı ve kas kasılmasında önemlidir.'
  ],
  confusionPairs: [['suda çözünen (B, C)', 'yağda çözünen (A, D, E, K)'], ['karbonhidrat', 'protein'], ['demir', 'kalsiyum']],
  forbiddenClaims: [
   { pattern: /[b c]\s+vitaminleri\s+yağda|[a d e k]\s+vitaminleri\s+suda/i, reason: 'B ve C vitaminleri suda, A, D, E ve K vitaminleri yağda çözünür.' }
  ]
 },
 '1-3': {
  axioms: [
   'İçsel riskler bireye (yorgunluk, önceki yaralanma); dışsal riskler zemin, ekipman ve hava koşullarına bağlıdır.',
   'TOTAPS konuşma (Talk) ile başlar: Gözlem, Dokunma, Aktif hareket, Pasif hareket ve Beceri testiyle sürer.',
   'POLICE: Koruma, Uygun yüklenme (Optimal Loading), Buz, Kompresyon ve Elevasyon.'
  ],
  confusionPairs: [['içsel risk', 'dışsal risk'], ['TOTAPS', 'POLICE']],
  forbiddenClaims: [
   { pattern: /totaps.*?dokunma\s+ile\s+başlar/i, reason: 'TOTAPS değerlendirmesi konuşma (Talk) ile başlar.' }
  ]
 },
 '1-4': {
  axioms: [
   'Doping yalnız madde kullanımıyla sınırlı değildir; yasaklı madde bulundurma, numune vermekten kaçınma, ticareti ve işbirliği gibi ihlalleri de kapsar.',
   'Yasaklı liste madde ve yöntem sınıflarını içerir (anabolik ajanlar, kan dopingi) ve düzenli güncellenir.'
  ],
  confusionPairs: [['madde kullanımı', 'numune vermekten kaçınma'], ['güncel liste', 'sınıf adı']],
  forbiddenClaims: [
   { pattern: /doping\s+(?:yalnız|sadece)\s+(?:madde\s+)?kullanımıyla\s+sınırlıdır/i, reason: 'Doping numune vermekten kaçınma ve bulundurma gibi diğer ihlalleri de kapsar.' }
  ]
 },
 '2-0': {
  axioms: [
   'Klasik yaklaşım (Taylor, Fayol, Weber) yapı, iş bölümü, hiyerarşi ve verimliliği; neo-klasik yaklaşım insan ilişkileri ve motivasyonu vurgular.',
   'Sistem yaklaşımı girdi, süreç, çıktı ve geri bildirime bakar.',
   'Yönetim süreçleri planlama, örgütleme, yöneltme, koordinasyon ve denetimdir.'
  ],
  confusionPairs: [['klasik yaklaşım', 'neo-klasik yaklaşım'], ['sistem yaklaşımı', 'planlama-denetim']],
  forbiddenClaims: []
 },
 '2-1': {
  axioms: [
   'Spor işletmelerinde satın alma kaynak edinimi, üretim ürün/hizmete dönüşüm, pazarlama hedef kitleye ulaşma ve AR-GE yeni ürün/hizmet geliştirme işlevleridir.',
   'Finans kaynak ve bütçe yönetimini yürütürken muhasebe finansal kayıt ve raporlamadan sorumludur; insan kaynakları çalışan süreçlerini yönetir.'
  ],
  confusionPairs: [['finans', 'muhasebe'], ['pazarlama', 'halkla ilişkiler'], ['satın alma', 'AR-GE']],
  forbiddenClaims: [
   { pattern: /muhasebe.*?yalnız\s+bütçe\s+planlaması|finans\s+ile\s+muhasebe\s+(?:birebir\s+)?aynı/i, reason: 'Finans fon/bütçe yönetimi, muhasebe finansal kayıt ve raporlama işlevidir.' }
  ]
 },
 '2-2': {
  axioms: [
   'Yönetici görev/makam yetkisini kullanırken lider vizyon ve etkiyle insanları yönlendirir (kavramlar özdeş değildir).',
   'Dönüşümcü liderlik vizyon ve değişimi, etkileşimci liderlik hedef-ödül/sonuç ilişkisini, hizmetkâr liderlik başkalarının ihtiyaç/gelişimini vurgular.',
   'Otoriter tarz kararı liderde toplar, demokratik tarz katılımı destekler.'
  ],
  confusionPairs: [['yönetici', 'lider'], ['dönüşümcü liderlik', 'etkileşimci liderlik'], ['otoriter', 'demokratik']],
  forbiddenClaims: [
   { pattern: /yönetici\s+ve\s+lider\s+(?:tamamen\s+aynı|bütünüyle\s+özdeş)/i, reason: 'Aynı kişi ikisi birden olabilir ama yönetici biçimsel yetkiye, lider etki/vizyona dayanır.' }
  ]
 },
 '2-3': {
  axioms: [
   'İletişim unsurları kaynak, mesaj, kanal, alıcı ve geri bildirimdir; gürültü mesajın anlaşılmasını bozan engeldir.',
   'Etkin dinleme karşıdakinin sözünü ve duygusunu anlamayı, gerektiğinde özetleyip doğrulamayı içerir.'
  ],
  confusionPairs: [['geri bildirim', 'gürültü'], ['kaynak', 'kanal'], ['etkin dinleme', 'halkla ilişkiler']],
  forbiddenClaims: []
 },
 '2-4': {
  axioms: [
   'Spor hukuku sporcu, antrenör, kulüp ve federasyon ilişkilerini ve disiplin süreçlerini inceler.',
   'CAS uluslararası spor tahkimiyle ilişkilidir; mevzuat güncelliği her zaman resmî kaynaklardan doğrulanmalıdır.'
  ],
  confusionPairs: [['CAS', 'federasyon talimatı'], ['tahkim', 'disiplin kurulu']],
  forbiddenClaims: []
 },
 '3-0': {
  axioms: [
   'Çağdaş antrenörlük yalnız teknik öğretim değil sporcunun gelişimi, güvenliği, yaşam boyu katılımı ve ebeveyn-sporcu iletişimini kapsar.',
   'Katılım sporu ile yüksek performans sporunun ihtiyaçları farklıdır.'
  ],
  confusionPairs: [['katılım sporu', 'performans sporu'], ['çocuk gelişimi', 'yetişkin antrenmanı']],
  forbiddenClaims: []
 },
 '3-1': {
  axioms: [
   'Açık beceri değişken çevrede, kapalı beceri görece sabit koşullarda uygulanır.',
   'Kesikli becerinin başlangıç ve bitişi belirgindir; seri beceri birleşimdir; sürekli beceri tekrarlı akış içerir.',
   'Performans o anda gözlenen uygulama, öğrenme ise deneyimle oluşan görece kalıcı değişimdir.'
  ],
  confusionPairs: [['açık beceri', 'kapalı beceri'], ['kesikli beceri', 'seri beceri'], ['performans', 'öğrenme']],
  forbiddenClaims: [
   { pattern: /kapalı\s+beceri.*?değişken\s+çevrede|açık\s+beceri.*?sabit\s+koşul/i, reason: 'Açık beceri değişken çevrede, kapalı beceri sabit koşullarda uygulanır.' }
  ]
 },
 '3-2': {
  axioms: [
   'Temel hareket becerileri yer değiştirme (koşma, atlama), nesne kontrolü (atma, tutma, vurma) ve dengeleme (eğilme, ağırlık aktarma) olarak sınıflanır.',
   'Vücut farkındalığı ne yaptığına, alan farkındalığı nerede, efor farkındalığı nasıl (hız/güç) yapıldığına odaklanır.'
  ],
  confusionPairs: [['yer değiştirme', 'nesne kontrolü'], ['alan farkındalığı', 'efor farkındalığı']],
  forbiddenClaims: []
 },
 '3-3': {
  axioms: [
   'Gallahue modelinde refleksif, ilkel, temel ve sporla ilgili hareket dönemleri yer alır.',
   'Filogenetik beceriler türle ortak otomatik gelişir (ör. yürüme); ontogenetik beceriler ise öğrenme ve pratikle kazanılır (ör. paten kayma, bisiklet).',
   'Büyüme, olgunlaşma ve deneyim aynı şey değildir; gelişim yönü baştan ayağa (sefalokaudal) ve içten dışa (proksimodistal) örüntüler gösterebilir.'
  ],
  confusionPairs: [['büyüme', 'olgunlaşma'], ['refleksif dönem', 'temel hareket dönemi'], ['filogenetik', 'ontogenetik']],
  forbiddenClaims: []
 },
 '3-4': {
  axioms: [
   'Mutlak değerlendirmede ölçüt önceden sabittir; bağıl değerlendirmede grup performansı referans alınır.',
   'Biçimlendirici değerlendirme süreçte eksikleri görmeye, özetleyici değerlendirme süreç sonunda başarıyı belirlemeye yöneliktir.',
   'VKİ = vücut ağırlığı (kg) / boyun metre cinsinden karesi (m²).'
  ],
  confusionPairs: [['mutlak değerlendirme', 'bağıl değerlendirme'], ['biçimlendirici', 'özetleyici']],
  forbiddenClaims: [
   { pattern: /mutlak\s+değerlendirmede\s+grup\s+referans/i, reason: 'Grup ortalaması/normu bağıl değerlendirmede kullanılır; mutlakta ölçüt sabittir.' }
  ]
 },
 '3-5': {
  axioms: [
   'Öğrenme deneyimle oluşan görece kalıcı değişimdir.',
   'Davranışçı yaklaşım pekiştirmeyi, bilişsel yaklaşım zihinsel süreçleri, yapılandırmacı yaklaşım aktif bilgi inşasını vurgular.',
   'Öğretimde basitten karmaşığa, somuttan soyuta ve bilinenden bilinmeyene ilerlenir.'
  ],
  confusionPairs: [['davranışçı', 'bilişsel'], ['bilişsel', 'yapılandırmacı']],
  forbiddenClaims: []
 },
 '4-0': {
  axioms: [
   'Antik Olimpiyatlar MÖ 776 ile anılır; ekecheiria kutsal ateşkesi ifade eder. Spor terimi "limanda olmak" anlamındaki "De portu" kökünden (disport -> sport) türemiştir.',
   'Modern Olimpiyatlar 1896 Atina ile yeniden başlamıştır.',
   'Jahn Alman, Ling İsveç, Arnold İngiliz spor eğitim akımlarıyla ilişkilidir.'
  ],
  confusionPairs: [['MÖ 776', '1896 Atina'], ['Jahn', 'Ling'], ['Ling', 'Arnold'], ['De portu', 'deportare']],
  forbiddenClaims: []
 },
 '4-1': {
  axioms: [
   'Spora yönelik sosyalleşme bireyin sporla tanışması/katılımı, spor yoluyla sosyalleşme spor ortamında toplumsal deneyim/değerlerin edinilmesidir.',
   'Aile, okul, akranlar, medya ve antrenör temel sosyalleşme ajanlarıdır.'
  ],
  confusionPairs: [['spora yönelik sosyalleşme', 'spor yoluyla sosyalleşme']],
  forbiddenClaims: []
 },
 '4-2': {
  axioms: [
   'Durumluk kaygı belirli bir anda hissedilen geçici kaygıdır; sürekli kaygı daha genel kişilik eğilimidir.',
   'Ustalık iklimi çaba ve kişisel gelişimi, performans iklimi sosyal karşılaştırmayı ve sonucu öne çıkarır.',
   'Tükenmişlik uzun süreli stresle ilişkili fiziksel ve zihinsel yıpranmadır.'
  ],
  confusionPairs: [['durumluk kaygı', 'sürekli kaygı'], ['ustalık iklimi', 'performans iklimi']],
  forbiddenClaims: [
   { pattern: /ustalık\s+iklimi.*?sosyal\s+karşılaştırmayı/i, reason: 'Sosyal karşılaştırma performans ikliminin özelliğidir; ustalık iklimi çaba ve gelişimi öne çıkarır.' }
  ]
 },
 '4-3': {
  axioms: [
   'Formal fair play yazılı kurallara uymayı; informal fair play kuralların ötesinde rakibe saygı, dürüstlük ve gönüllü etik davranışları ifade eder.',
   'Şike, doping, şiddet ve aşırı kazanma baskısı fair play değerlerini zedeler.'
  ],
  confusionPairs: [['formal fair play', 'informal fair play']],
  forbiddenClaims: [
   { pattern: /formal\s+fair\s+play.*?(?:kuralların\s+ötesinde|gönüllü)/i, reason: 'Yazılı kurallara uyma formal, kuralların ötesindeki gönüllü erdemli davranış informal fair playdir.' }
  ]
 },
 '4-4': {
  axioms: [
   'Fiziksel istismar (darp/ceza), duygusal istismar (hakaret/aşağılama/tehdit), cinsel istismar ve ihmal (temel bakım ve güvenlik ihtiyacının karşılanmaması) çocuk güvenliğini tehdit eder.',
   'Güvenli spor ortamı yalnızca olay sonrası değil öncesinde önleyici politika ve bildirim mekanizması gerektirir.'
  ],
  confusionPairs: [['duygusal istismar', 'ihmal'], ['fiziksel istismar', 'duygusal istismar']],
  forbiddenClaims: []
 }
};

export class PrecisionQualityEngine {
 constructor({ contexts = [], passagesByUnit = new Map(), fullUnitTextNorm = new Map(), ragEngine = null, tvgfbfSwarm = null } = {}) {
  this.contexts = contexts;
  this.passagesByUnit = passagesByUnit;
  this.fullUnitTextNorm = fullUnitTextNorm;
  this.ragEngine = ragEngine;
  this.tvgfbfSwarm = tvgfbfSwarm;
  this.contextMap = new Map(contexts.map(c => [c.id, c]));
 }

 setTvgfbfSwarm(swarm) {
  this.tvgfbfSwarm = swarm;
 }

 get atlasCount() {
  return Object.keys(UNIT_AXIOM_ATLAS).length;
 }

 getUnitAxiomPromptBlock(unitId) {
  const atlas = UNIT_AXIOM_ATLAS[unitId];
  if (!atlas) return '';
  const axioms = atlas.axioms.map((a, i) => `${i + 1}) ${a}`).join(' ');
  const pairs = (atlas.confusionPairs || []).map(([a, b]) => `[${a} ↔ ${b}]`).join(', ');
  return `\nÜNİTE BİLİMSEL AKSİYOMLARI (${unitId}): ${axioms}${pairs ? `\nAYIRT EDİCİ KAVRAM ÇİFTLERİ (Çeldirici kurarken karıştırılabilen kavramları net ayırt et): ${pairs}.` : ''}`;
 }

 getRagCrossContextBlock(ctx, maxChars = 460) {
  if (!this.ragEngine || !ctx) return '';
  try {
   const res = this.ragEngine.query(`${ctx.unit} ${ctx.book}`, { topK: 3, scope: 'books' });
   if (!res?.hits?.length) return '';
   const snippets = res.hits
    .filter(h => h.unitId === ctx.id || h.score > 1)
    .slice(0, 2)
    .map(h => `[${h.heading || h.unit}${h.pages?.length ? ` s.${h.pages.join(',')}` : ''}]: ${String(h.snippet || '').slice(0, 200)}`)
    .join(' | ');
   return snippets ? `\nRAG KİTAP DOĞRULAMA BAĞLAMI: ${snippets.slice(0, maxChars)}` : '';
  } catch {
   return '';
  }
 }

 /**
  * Çok katmanlı kaynak alıntısı & sayısal tutarlılık doğrulaması
  */
 verifyEvidenceGrounding(evidence, ctx, passage = null) {
  const ne = normalizeTr(evidence);
  if (ne.length < 15) {
   return { ok: false, tier: 'failed', score: 0, reason: 'Kaynak alıntısı (evidence) en az 15 karakter olmalıdır.' };
  }
  const passageNorm = passage ? normalizeTr(passage.text) : '';
  const ctxNorm = ctx ? normalizeTr(ctx.text) : '';
  const unitFull = ctx ? (this.fullUnitTextNorm.get(ctx.id) || '') : '';
  const combinedSource = `${passageNorm} ${ctxNorm} ${unitFull}`;

  // Katman 1: Doğrudan birebir alt-dize eşleşmesi
  if ((passageNorm && passageNorm.includes(ne)) || (ctxNorm && ctxNorm.includes(ne)) || (unitFull && unitFull.includes(ne))) {
   return { ok: true, tier: 'exact', score: 25, reason: 'Birebir kaynak eşleşmesi doğrulandı.' };
  }

  // Sayısal/yıl koruma kontrolü: alıntıda sayı varsa kaynakta da aynen bulunmalı
  const evNums = extractNumbersAndUnits(evidence);
  const srcNums = new Set(extractNumbersAndUnits(`${passage?.text || ''} ${ctx?.text || ''}`));
  for (const n of evNums) {
   if (!srcNums.has(n)) {
    return {
     ok: false,
     tier: 'number_mismatch',
     score: 0,
     reason: `Kaynak alıntısındaki sayısal ifade (${n}) ders metninde yer almıyor; sayısal halüsinasyon riski.`
    };
   }
  }

  // Katman 2: Kök token örtüşme kontrolü (>= %82 token kaynak metinde yer almalı)
  const evTokens = stemTokensTr(evidence);
  if (evTokens.length < 3) {
   return { ok: false, tier: 'too_short', score: 0, reason: 'Kaynak alıntısı yeterli anlamlı terim içermiyor.' };
  }
  const srcTokenSet = new Set(stemTokensTr(combinedSource));
  let matched = 0;
  for (const t of evTokens) if (srcTokenSet.has(t)) matched++;
  const ratio = matched / evTokens.length;
  if (ratio >= 0.85) {
   return { ok: true, tier: 'semantic_tokens', score: Math.round(18 + ratio * 6), reason: `Kaynak metinle %${Math.round(ratio * 100)} terim örtüşmesi doğrulandı.` };
  }
  return {
   ok: false,
   tier: 'ungrounded',
   score: Math.round(ratio * 15),
   reason: 'Kaynak alıntısı ünite anlatımında veya kitap pasajında bulunamadı.'
  };
 }

 /**
  * 8 Boyutlu ÖSYM Çeldirici Hijyeni, Simetri, Polarite & Kök Sızıntısı Analizi
  */
 auditDistractorPsychometrics({ question = '', options = [], answer = '', explanation = '', evidence = '', unitId = '' } = {}) {
  const errors = [];
  const warnings = [];
  let score = 100;

  if (!Array.isArray(options) || options.length !== 4 || !options.includes(answer)) {
   return { ok: false, score: 0, errors: ['Seçenekler 4 adet olmalı ve doğru cevap seçenekler arasında yer almalıdır.'], warnings, breakdown: {} };
  }

  // 1. Yasaklı kolaycı kalıplar ("hepsi/hiçbiri")
  if (options.some(o => BANNED_LAZY_OPTION_RE.test(o))) {
   errors.push('Seçeneklerde "hepsi/hiçbiri" gibi kalitesiz ifade kullanıldı.');
   score -= 40;
  }

  // 2. Uzunluk simetrisi (doğru şık çeldiricilerden belirgin şekilde uzun veya kısa olmamalı)
  const wrong = options.filter(o => o !== answer);
  const ansLen = answer.trim().length;
  const wrongLens = wrong.map(w => w.trim().length);
  const avgWrongLen = wrongLens.reduce((s, x) => s + x, 0) / Math.max(1, wrongLens.length);
  if (ansLen >= 36 && avgWrongLen > 0 && ansLen / avgWrongLen >= 2.35) {
   errors.push(`Doğru seçenek (${ansLen} kr) çeldiricilerden aşırı uzun (ort. ${Math.round(avgWrongLen)} kr) olduğu için cevabı belli ediyor.`);
   score -= 25;
  } else if (avgWrongLen >= 38 && ansLen > 0 && ansLen / avgWrongLen <= 0.35) {
   warnings.push('Doğru seçenek diğer şıklara göre aşırı kısa; seçenek uzunluklarını dengele.');
   score -= 8;
  }

  // 3. Şıklar arası birebir / semantik örtüşme ve alt küme (A ⊂ B) çift-cevap kontrolü
  const isOrderedPairQ = /sırasıyla|büyükten\s+küçüğe|küçükten\s+büyüğe|soldan\s+sağa/i.test(question);
  const romanComboRe = /^(?:[IVX]+(?:\s*(?:,|ve|ile)\s*[IVX]+)*|yalnız\s+[IVX]+)$/i;
  const isRomanComboSet = options.filter(o => romanComboRe.test(o.trim())).length >= 3;
  for (let i = 0; i < options.length; i++) {
   for (let j = i + 1; j < options.length; j++) {
    const na = normalizeTr(options[i]);
    const nb = normalizeTr(options[j]);
    if (na.length < 4 || nb.length < 4) continue;
    if (na === nb) {
     errors.push('İki seçenek anlamca/kelime olarak birebir aynı; çift doğru şık riski nedeniyle reddedildi.');
     score -= 40;
     break;
    }
    if (isRomanComboSet) {
     // ÖSYM I-II-III öncüllü kombinasyon şıklarında küme özdeşliğini kontrol et ("I ve II" == "II ve I")
     const romansA = (options[i].match(/\b[IVX]+\b/gi) || []).map(x => x.toUpperCase()).sort().join(',');
     const romansB = (options[j].match(/\b[IVX]+\b/gi) || []).map(x => x.toUpperCase()).sort().join(',');
     if (romansA && romansA === romansB) {
      errors.push('İki Romen rakamlı öncül kombinasyonu aynı ögeleri tekrarlıyor; çift doğru riski.');
      score -= 35;
      break;
     }
     continue;
    }
    const ta = stemTokensTr(options[i]);
    const tb = stemTokensTr(options[j]);
    // Sırasıyla / sıralama sorularında aynı kelimelerin farklı sırada verilmesi ("Akut - Kronik" vs "Kronik - Akut") geçerlidir
    if ((isOrderedPairQ || /[-/→,]/.test(options[i])) && ta.join('|') !== tb.join('|')) {
     continue;
    }
    const numsA = na.match(/\d+/g)?.join(',') || '';
    const numsB = nb.match(/\d+/g)?.join(',') || '';
    if (numsA === numsB) {
     const sim = similarityTr(options[i], options[j]);
     if (ta.length >= 2 && tb.length >= 2 && sim >= 0.90) {
      errors.push('İki seçenek anlamca/kelime olarak aşırı örtüşüyor; çift doğru şık riski nedeniyle reddedildi.');
      score -= 32;
      break;
     }
     // Alt-küme kapsamı (A tamamen B'nin içinde)
     const setA = new Set(ta);
     const setB = new Set(tb);
     if (setA.size >= 4 && setB.size >= 4) {
      let aInB = 0;
      for (const tok of setA) if (setB.has(tok)) aInB++;
      let bInA = 0;
      for (const tok of setB) if (setA.has(tok)) bInA++;
      const contA = aInB / setA.size;
      const contB = bInA / setB.size;
      if ((contA >= 0.90 || contB >= 0.90) && Math.abs(setA.size - setB.size) <= 1) {
       errors.push('Bir seçenek diğerinin kapsadığı kavramı neredeyse aynen içeriyor; çift doğru riski.');
       score -= 28;
       break;
      }
     }
    }
   }
  }

  // 4. Kök sızıntısı (Soru kökü doğru şıkkın ayırt edici kelimesini ele veriyor mu?)
  const qTokens = new Set(stemTokensTr(question).filter(t => t.length >= 4));
  const ansTokens = stemTokensTr(answer).filter(t => t.length >= 4);
  if (ansTokens.length >= 2 && qTokens.size >= 3 && !NEGATIVE_STEM_RE.test(question)) {
   const sharedWithAns = ansTokens.filter(t => qTokens.has(t));
   const avgSharedWrong = wrong.reduce((s, w) => {
    const wt = stemTokensTr(w).filter(t => t.length >= 4);
    const hits = wt.filter(t => qTokens.has(t)).length;
    return s + (wt.length ? hits / wt.length : 0);
   }, 0) / Math.max(1, wrong.length);
   const ansLeakRatio = sharedWithAns.length / ansTokens.length;
   if (sharedWithAns.length >= 2 && ansLeakRatio >= 0.72 && avgSharedWrong <= 0.25) {
    errors.push(`Soru kökü doğru cevabın ayırt edici kelimelerini (${sharedWithAns.slice(0, 3).join(', ')}) sızdırıyor.`);
    score -= 22;
   }
  }

  // 5. Aşırı kesinlik kelimesi asimetrisi (Yalnız çeldiricilerde "asla/her zaman/tamamen" olması)
  const wrongWithAbs = wrong.filter(w => ABSOLUTE_QUANTIFIER_RE.test(w)).length;
  const ansHasAbs = ABSOLUTE_QUANTIFIER_RE.test(answer);
  if (!NEGATIVE_STEM_RE.test(question) && wrongWithAbs >= 2 && !ansHasAbs) {
   errors.push('Çeldiricilerin çoğunda "asla/tamamen/her zaman" gibi aşırı genelleme ipucu varken doğru şıkta yok; ÖSYM simetrisi bozuldu.');
   score -= 20;
  }

  // 6. Sayısal/yıl mantıksal birim tutarlılığı
  const numericOnlyCount = options.filter(o => /^\s*[\d.,/%-]+\s*[a-zçğıöşü²]*\s*$/i.test(o)).length;
  if (numericOnlyCount >= 2 && numericOnlyCount < 4) {
   warnings.push('Bazı seçenekler salt sayısal, bazıları sözel; tüm seçenekleri paralel formata getir.');
   score -= 6;
  }

  // 7. Ünite Bilimsel Aksiyom Çelişki Taraması
  const atlas = UNIT_AXIOM_ATLAS[unitId];
  if (atlas?.forbiddenClaims?.length && !NEGATIVE_STEM_RE.test(question)) {
   for (const claim of atlas.forbiddenClaims) {
    if (claim.pattern.test(`${answer} ${explanation}`)) {
     errors.push(`Bilimsel doğruluk hatası (${unitId}): ${claim.reason}`);
     score -= 40;
    }
   }
  }

  // 8. Olumsuz kök ("değildir / yanlıştır") tutarlılığı
  if (NEGATIVE_STEM_RE.test(question)) {
   if (answer.length < 4 || !explanation || explanation.trim().length < 12) {
    warnings.push('Olumsuz köklü soruda açıklama net biçimde yanlış ifadeyi ve gerekçesini belirtmeli.');
    score -= 5;
   }
  }

  // Doğru şıkkın kaynak/açıklama destek yoğunluğu
  const supTokens = new Set(stemTokensTr(`${explanation} ${evidence}`));
  const ansHits = ansTokens.filter(t => supTokens.has(t)).length;
  const entailmentRatio = ansTokens.length ? ansHits / ansTokens.length : 1;
  if (ansTokens.length >= 3 && entailmentRatio < 0.2 && !NEGATIVE_STEM_RE.test(question)) {
   warnings.push('Doğru şık ile açıklama/kaynak arasında düşük terim uyumu saptandı.');
   score -= 10;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
   ok: errors.length === 0 && finalScore >= 65,
   score: finalScore,
   firstError: errors[0] || null,
   errors,
   warnings,
   breakdown: {
    lengthSymmetry: avgWrongLen > 0 ? +(ansLen / avgWrongLen).toFixed(2) : 1,
    wrongAbsoluteCueCount: wrongWithAbs,
    entailmentRatio: +entailmentRatio.toFixed(2)
   }
  };
 }

 /**
  * Tam soru taslağı denetimi + DPO tercih çifti kalite puanı
  */
 evaluateDraftFull(draft, ctx, passage = null) {
  const unitId = ctx?.id || draft?.unitId || '';
  const ground = this.verifyEvidenceGrounding(draft?.evidence || '', ctx, passage);
  const psy = this.auditDistractorPsychometrics({
   question: draft?.question || '',
   options: draft?.options || [],
   answer: draft?.answer || '',
   explanation: draft?.explanation || '',
   evidence: draft?.evidence || '',
   unitId
  });
  const styleAlignment = this.tvgfbfSwarm?.scoreBookAndTvgfbfStyleAlignment
   ? this.tvgfbfSwarm.scoreBookAndTvgfbfStyleAlignment(draft, unitId)
   : { styleScore: 80, matchedSignals: [] };
  const combinedScore = Math.max(0, Math.min(100, Math.round(psy.score * 0.75 + ground.score)));
  const allErrors = [];
  if (!ground.ok) allErrors.push(ground.reason);
  allErrors.push(...psy.errors);
  return {
   ok: ground.ok && psy.ok,
   precisionScore: combinedScore,
   styleScore: styleAlignment.styleScore,
   styleSignals: styleAlignment.matchedSignals,
   grounding: ground,
   psychometrics: psy,
   firstError: allErrors[0] || null,
   errors: allErrors,
   warnings: psy.warnings
  };
 }

 /**
  * Tüm havuz (banka + üretilenler) üzerinde toplu hassasiyet ve kalite denetimi
  */
 auditPool(questions = []) {
  const perUnit = {};
  const perBook = {};
  let totalScore = 0;
  let totalStyleScore = 0;
  let tvgfbfAlignedCount = 0;
  let evaluated = 0;
  let flaggedTotal = 0;
  let dpoEliteTotal = 0;
  const flagged = [];
  const dpoEliteCandidates = [];

  for (const q of questions) {
   if (!q || !q.question || !Array.isArray(q.options) || q.options.length !== 4) continue;
   if (q.status === 'rejected') continue;
   const ctx = this.contextMap.get(q.unitId) || null;
   const psy = this.auditDistractorPsychometrics({
    question: q.question,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation || '',
    evidence: q.evidence || '',
    unitId: q.unitId || ''
   });
   const ground = q.evidence && ctx ? this.verifyEvidenceGrounding(q.evidence, ctx) : { ok: true, score: 22, tier: 'bank' };
   const combined = Math.round(psy.score * 0.75 + ground.score);
   const styleRes = this.tvgfbfSwarm?.scoreBookAndTvgfbfStyleAlignment
    ? this.tvgfbfSwarm.scoreBookAndTvgfbfStyleAlignment(q, q.unitId || '')
    : { styleScore: Number.isFinite(q.styleScore) ? q.styleScore : 82, matchedSignals: [] };
   const stScore = styleRes.styleScore;
   totalScore += combined;
   totalStyleScore += stScore;
   if (stScore >= 68) tvgfbfAlignedCount++;
   evaluated++;

   const bookIdx = Number(String(q.unitId || '0-0').split('-')[0] || 0);
   const bBucket = (perBook[bookIdx] ||= { bookIndex: bookIdx, count: 0, scoreSum: 0, styleSum: 0, avgPrecisionScore: 0, avgStyleScore: 0, eliteCount: 0 });
   bBucket.count++;
   bBucket.scoreSum += combined;
   bBucket.styleSum += stScore;
   bBucket.avgPrecisionScore = +(bBucket.scoreSum / bBucket.count).toFixed(1);
   bBucket.avgStyleScore = +(bBucket.styleSum / bBucket.count).toFixed(1);

   const bucket = (perUnit[q.unitId] ||= { unitId: q.unitId, count: 0, avgScore: 0, sum: 0, issues: 0 });
   bucket.count++;
   bucket.sum += combined;
   bucket.avgScore = Math.round(bucket.sum / bucket.count);
   if (!psy.ok || !ground.ok) {
    bucket.issues++;
    flaggedTotal++;
    if (flagged.length < 30) {
     flagged.push({
      id: q.id || `${q.unitId}-${bucket.count}`,
      unitId: q.unitId,
      score: combined,
      question: q.question.slice(0, 120),
      reason: psy.firstError || ground.reason || psy.warnings[0] || 'Düşük puan'
     });
    }
   } else if (combined >= 90) {
    dpoEliteTotal++;
    bBucket.eliteCount++;
    if (dpoEliteCandidates.length < 40) {
     dpoEliteCandidates.push({ unitId: q.unitId, score: combined, styleScore: stScore, question: q.question });
    }
   }
  }

  for (const b of Object.values(perUnit)) delete b.sum;
  for (const bb of Object.values(perBook)) {
   delete bb.scoreSum;
   delete bb.styleSum;
  }
  return {
   ok: true,
   atlasUnits: this.atlasCount,
   evaluatedCount: evaluated,
   averagePrecisionScore: evaluated ? +(totalScore / evaluated).toFixed(1) : 100,
   averageStyleScore: evaluated ? +(totalStyleScore / evaluated).toFixed(1) : 85,
   tvgfbfAlignedCount,
   tvgfbfAlignedPct: evaluated ? +((tvgfbfAlignedCount / evaluated) * 100).toFixed(1) : 100,
   flaggedCount: flaggedTotal,
   flagged,
   dpoEliteCount: dpoEliteTotal,
   dpoEliteCandidates,
   unitCoverageCount: Object.keys(perUnit).length,
   perBook,
   perUnit
  };
 }
}
