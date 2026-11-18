# İsteğe bağlı Ollama hız parametreleri

Dört şık/kısa gerekçe ve kaynak indeksi önbelleğine ek olarak, donanım üzerinde denenebilecek iki parametre vardır. **Ayar verilmezse mevcut Ollama otomatik davranışı korunur.** Sayısal hız artışı garanti edilmez.

| Ortam değişkeni | Değer | Etki / risk |
| --- | --- | --- |
| `TEMPO_OLLAMA_NUM_BATCH` | 32–2048 arası tam sayı | İstemin işlenme batch boyutu. 256/512/1024 karşılaştırılabilir. Daha büyük değer bazı GPU'larda prefill'i hızlandırır; daha çok bellek ister, yavaşlama veya OOM da yapabilir. |
| `TEMPO_OLLAMA_NUM_GPU` | -1–999 arası tam sayı | GPU'ya aktarılacak katman sayısı. -1 tüm katmanları talep eder, 0 CPU modudur. Model/KV belleği GPU'ya sığmıyorsa tüm katmanları zorlamayın; boş bırakarak Ollama'nın otomatik seçimini kullanın. |

Boş, kesirli, geçersiz veya aralık dışındaki değerler gönderilmez. Parametreler uygulama başlarken okunur; üretici ve hakemde aynı kalır. Canlı olarak rol başına değiştirilmez; böylece ayar farkından kaynaklanan yeniden yüklemeler önlenir. Değişiklikten sonra uygulamayı yeniden başlatın; ilk çağrıda yeni ayarla model yeniden yüklenebilir.

## Örnek: önce yalnız batch denemesi

PowerShell, uygulamayı çalıştıracağınız terminalde:

```powershell
$env:TEMPO_OLLAMA_NUM_BATCH = "512"
npm run dev
```

Bash:

```bash
TEMPO_OLLAMA_NUM_BATCH=512 npm run dev
```

Modelin GPU belleğine tamamen sığdığını doğruladıktan sonra ayrı bir deneyde `TEMPO_OLLAMA_NUM_GPU=-1` eklenebilir. GPU olmayan makinede bu ayarı zorlamayın. Ollama sürümü seçeneği reddederse veya bellek hatası oluşursa değişkeni kaldırıp otomatik ayara dönün.

## Karşılaştırma

Ayrı terminalde, model ısındıktan sonra:

```bash
npm run bench:live -- http://localhost:5173 180 30
```

Aynı model/ünitelerle önce ayarsız, sonra her seferinde yalnız bir parametreyi değiştirerek ölçün. Yeni onaylı soru başına süreyi, retleri, zaman aşımlarını ve bellek kullanımını birlikte değerlendirin. Büyük batch'in her zaman daha hızlı olduğunu varsaymayın. Stüdyodaki model kuyruğunda batch/GPU değerleri görünür; `/api/ollama/status` yanıtındaki `ollamaRuntime.numBatch` ve `numGpu` gönderilen değerleri gösterir, GPU'nun gerçekten ne kadarını kullandığının ölçümü değildir.

Mevcut `TEMPO_OLLAMA_NUM_THREADS` seçeneği CPU thread sayısını ayarlar. Flash Attention ve q8 KV önbellek varsayımları, uygulamanın Ollama'yı kendisi başlattığı mevcut hazırlık betiğinde zaten vardır; bu değişiklik yeni bir Ollama servisi açmaz veya çalışan servisin ayarlarını zorla değiştirmez.

Bu parametreler soru içeriği, dört şıklı yeni üretim şeması, kaynak doğrulaması, tek doğru ve çeldirici denetimini değiştirmez. Gerçek donanımda performans kazancı henüz doğrulanmamıştır.

## Otomatik çalışan ek iyileştirmeler

- Yeni taslaklar dört şık ve tek kısa gerekçe ile istenir; uygun soru tipine kısa bağlam eklenir, ek model çağrısı yapılmaz.
- Kaynak cümleleri, normalleştirme ve kelime kümeleri kaynak metne bağlı, boyutu sınırlı indekste paylaşılır. Kaynak değişince yeni indeks oluşturulur.
- Havuz ön denetiminde değişmeyen soru nesnelerinin biçim özellikleri WeakMap ile paylaşılır. Kök, cevap, ünite veya seçenek düzenlenirse satır yeniden doğrulanır. Bankalar arası tekrar taraması her çağrıda sürer; havuz ekleme/silmeleri eski bir toplam üzerinden değerlendirilmez.
- Akışta Ollama nihai `done=true` kaydını gönderince ayrıca HTTP gövdesinin kapanması beklenmez. Nihai metrikler korunur; eksik JSON veya token sınırında kesilmiş yanıt yine reddedilir. Normalde HTTP hemen kapanıyorsa bu değişiklik ek kazanç sağlamayabilir.

Donanım bilinmeden eşzamanlı model çağrılarını artırmak, tüm GPU katmanlarını zorlamak veya kaynak/cevap denetimini atlamak otomatik olarak uygulanmaz. Bu işlemler bellek taşması, daha düşük hız veya yanlış soru kabulü riski taşır. “Tüm hızlandırmalar etkin” ya da “10 saniye hedefine ulaşıldı” iddiası yoktur; gerçek makinedeki ölçüm belirleyicidir.

## 5–6 saniye hedefinin doğrulanması

Canlı ölçümün varsayılan hedefi artık **6 saniye/onaylı soru**dur. İstenirse beşinci argümanla değiştirilebilir:

```bash
npm run bench:live -- http://localhost:5173 180 30 6
```

Üretim açıkken çalıştırın. Isınma sonrası geçen sürenin yeni onay sayısına bölümü ölçülür; retler/yeniden denemeler süreye dahildir. En az 12 onay olmadan başarı kararı verilmez. Rapor Ollama çalışma parametrelerini ve model başına token/istem işleme hızlarını da içerir. Bu hız değerleri oturum geneline aittir, ölçüm aralığına özel değildir.

Seçenek örtüşme kontrolünde de değişmeyen seçenek dizilerinin normalleştirilmiş özellikleri paylaşılır. Seçenekler yerinde değiştiğinde, silindiğinde veya eklendiğinde yeniden hesaplanır. Önceki örtüşme formülü ve ret eşikleri korunur.

Bu ortamda yerel Ollama bulunmadığı için 5–6 saniye hedefi doğrulanamadı. Aynı modelin üretici + hakem çağrılarının donanımdaki toplam çalışma süresi 6 saniyeyi aşıyorsa, yalnızca JavaScript optimizasyonuyla hedef garanti edilemez. Rapordaki model adı, token hızları, yükleme sayıları ve GPU/VRAM bilgisi birlikte değerlendirilmelidir. Kalite kaybı yaşamadan daha hızlı modele geçildiği varsayılmamalı; model değişiminde temsili sorular ayrıca incelenmelidir.

## Kullanıcı donanımı için etkin varsayılan profil

Son kullanıcı talebiyle uygulama artık `server/hardware-profile.mjs` üzerinden RTX 3080 Ti / i5-10400F için **6 CPU thread + 512 batch** kullanır. Önceki bölümlerdeki “batch boşsa otomatik” açıklaması yalnızca düşük seviyeli istemci için geçerlidir; uygulama artık boş batch değerini bu profilden tamamlar. Ortam değişkenleriyle verilmiş açık değerler önceliklidir. GPU katman sayısı hâlâ Ollama otomatiğidir; model VRAM'e sığmıyorsa tüm katmanlar zorlanmaz.

Kullanıcının düzelttiği 16 GB bilgisi sistem RAM'i kapasitesidir; VRAM kapasitesi olarak kullanılmaz. Var olan gerçek VRAM tespiti ve tek-model seçimi korunur; model/bağlam/kalite eşikleri bu profil nedeniyle değiştirilmez. Ayarlar uygulama yeniden başlatılınca hem üretici hem hakem çağrılarına sabit olarak uygulanır. Bilgisayara uzaktan uygulanmış bir sürücü/Windows ayarı değildir. 512 batch ölçülmüş en iyi değer değil, bu donanım için başlangıç profilidir; 5–6 saniye sonucu canlı ölçüm gerektirir.
