// Yeni olgusal bilgi eklemeden kısa kullanım bağlamı verir; ek model çağrısı yoktur.
// Değişen blok aynı istem bütçesinden yer alır, kaynak metin kırpılmaz.
const CONTEXTS = [
 'Bir antrenörün çalışma öncesi plan seçimini kısa bir durumla sor.',
 'Antrenman sırasında gözlenen bir durumdan uygun kavrama ulaşılmasını sor.',
 'Çalışma sonrasındaki değerlendirmede iki yakın kavramın ayrımını sor.',
 'İki uygulamanın farkını gösteren kısa bir karşılaştırma kur.'
];
export function buildQuestionContext(questionType, rotation = 0) {
 if (questionType === 'paragraf') return '';
 // Kısa tanım/boşluk sorusunu zorla vakaya dönüştürme.
 const contextual = ['vaka', 'uygulama', 'en_iyi_secim', 'durum_kavram', 'karsilastirma', 'neden_sonuc'];
 if (!contextual.includes(questionType)) return '';
 const slot = Number.isFinite(rotation) ? Math.abs(Math.trunc(rotation)) % CONTEXTS.length : 0;
 return `\nKISA BAĞLAM: ${CONTEXTS[slot]} Bağlam 1 kısa cümle olsun; yalnız KONU ANLATIMI'ndaki ilişkileri kullan. Kaynakta bulunmayan yaş, süre, ölçüm veya olay sonucu uydurma; cevabı bağlamda açıklama.`;
}
