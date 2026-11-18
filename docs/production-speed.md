# PR #13 tabanı ve 10 saniye/onaylı soru hedefi

Bu dal PR #13'ün birleşme sürümünü (`d7d004c`) taban alır. PR #14'ün orta-düzey-only üretim, etiket ve kurul arayüzü değişiklikleri geri alınmıştır. PR #13'teki kaynaklar, üretim planı, kalite eşikleri ve tek-model/tek-hakem üretim davranışı korunur.

## Bu dalda yapılan hız çalışması

- Kök benzerliğinde token, kelime kümesi ve ikili kelime kümeleri yeniden oluşturulmaz. Metin anahtarlı, 24.000 kayıtla sınırlı önbellek kullanılır; 1.200 karakterden uzun metinler saklanmaz. PR #13'teki normalleştirme, skor formülü ve tekrar eşikleri aynıdır. Soru düzenlenirse farklı metin anahtarı kullanılır.
- Hakem istemindeki tekrarlar kısaltıldı. Tüm cevap, tek-doğru, kaynak, ikinci doğru riski, çeldirici, dil, kalite, sınav, Bloom ve zorluk alanları korunur. Kaynak metin, seçenekler, şema, çıktı token tavanı ve kabul kontrolleri kısaltılmadı.
- Mevcut modeli bellekte tutma, sabit bağlam boyutu, yapılandırılmış JSON, erken tekrar kesme ve sıralı model kuyruğu korunur. Kalite eşiği düşürülmez, hakem atlanmaz, hız adına onaysız soru kabul edilmez.

## Doğrulama ve sınırlar

- Önceki/önbellekli benzerlik skorları 16.384 metin çifti için birebir karşılaştırıldı; soğuk/sıcak önbellekte eşitlik sınandı.
- Yerel CPU mikro ölçümünde 16.000 karşılaştırma: eski algoritma 97,1 ms, önbellekli algoritma 15,3 ms. Bu yalnızca tekrar kontrolüdür; uçtan uca soru üretiminin 6 kat hızlandığı anlamına gelmez.
- Hakem istem işlevinin kaynak uzunluğu 2.518'den 1.914 karaktere indi. Bu yaklaşık %24 işlev metni azalmasıdır; dinamik kaynak metin dahil gerçek token veya gecikme kazancı değildir.
- İçerik kalitesi için kaynak/çeldirici/çift cevap/paragraf/tekrar testleri çalıştırıldı. Sentetik testler gerçek model çıktısının insan incelemesi yerine geçmez.
- Bu geliştirme ortamında çalışan yerel Ollama bulunmadığından gerçek 10 sn/soru hedefine ulaşıldığı **doğrulanmadı**. Donanım ve gerçek model üzerinde ölçüm gerekir.

## Gerçek makinede ölçüm

Ollama ve uygulama çalışırken, üretim açıkken:

```bash
npm run bench:live -- http://localhost:5173 180 30
```

İlk 30 saniye ısınma, ardından 180 saniye gözlem yapılır. Başka port kullanılıyorsa URL'yi değiştirin. Komut yalnızca durum servisini okur; model, eşik, üretim ayarı veya soru havuzunu değiştirmez. Üretim zaten çalıştığı için bu sırada yeni sorular oluşturulabilir.

- `secondsPerApproved`: gerçek gözlem süresi / yeni onay sayısı. Retler, yeniden denemeler ve bekleme dahildir; ısınma hariçtir. Havuz budandığında toplam havuz sayısı yerine oturum onay sayacı kullanılır.
- `targetMet`: en az 12 onaylı soru gözlenirse 10 saniye hedefine göre true/false; az örnekte null. Sıfır onay başarı değildir.
- Üretici/hakem ortalamaları oturum ortalamalarıdır; ölçüm aralığına özel değildir.
- Model/oturum değişimi, kapalı üretim veya bağlantı hatasında yanıltıcı rapor yerine hata verilir.

Süre 10 saniyenin üzerindeyse raporla birlikte GPU, VRAM, seçili model/quantization ve Ollama sürümü incelenmelidir. Önce GPU offload ve tekrar yükleme sorunu araştırılmalı; daha küçük modele geçmek veya token tavanını düşürmek kalite bakımından ayrıca değerlendirilmelidir. Soru kontrolünü atlamak ya da 10 saniyede kesilen eksik çıktıyı kabul etmek çözüm değildir.

Hızdan sonra aynı ünitelerden temsili soru örnekleri PR #13 çıktılarıyla insan tarafından karşılaştırılmalıdır: doğru cevap, tek-doğruluk, kaynak desteği ve komşu kavram çeldiricileri. Watt kazancı için ayrıca donanım güç ölçümü gerekir.
