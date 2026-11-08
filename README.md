# Tempo — Antrenörlük temel eğitim çalışma alanı

Bu rehber **Windows 11 üzerinde, doğrudan kendi bilgisayarında** çalışmak içindir. Ubuntu veya WSL kurman gerekmez. İşlemleri sırayla yap: önce projeyi ve Ollama'yı çalıştır, ardından soruları incele. Model eğitimi isteğe bağlıdır ve sonraki adımlardadır.

> **Önce GitHub sürümünü kontrol et:** Depo adresi [github.com/yurdakulaykut16-oss/Temel-egitim](https://github.com/yurdakulaykut16-oss/Temel-egitim). Bu rehberde anlatılan güncel dosyalar, GitHub'da yer aldıkları daldan indirilmelidir. Arena'daki değişiklikler kendiliğinden GitHub'a aktarılmaz. GitHub'da seçili dalda `package.json`, `src`, `server`, `training` ve `public/books` yoksa o sürüm bu uygulamanın tamamı değildir. Çalışma dalı `arena/9b188ed1-temel-egitim` GitHub'a gönderilmediyse o daldan indirme yapılamaz.

## 1. Projeyi GitHub'dan indir

1. Tarayıcıda [proje sayfasını](https://github.com/yurdakulaykut16-oss/Temel-egitim) aç.
2. Sol üstteki dal seçme düğmesinden güncel uygulamanın bulunduğu dalı seç. Bu çalışma oturumunun dalı `arena/9b188ed1-temel-egitim` adını taşır; yalnız GitHub'a gönderilmişse listede görünür. Değişiklikler sonradan `main` dalına alınmışsa güncel `main` da kullanılabilir.
3. **Code → Download ZIP** seçeneğine bas.
4. İnen ZIP dosyasına sağ tıkla ve **Tümünü ayıkla** seç.
5. Çıkan klasörü örneğin `C:\Users\KullanıcıAdın\Desktop\Temel-egitim` konumuna koy. `KullanıcıAdın` kendi Windows kullanıcı adındır; örnek yolu harfiyen yazman gerekmez.
6. Klasörü aç. İçinde `package.json`, `src`, `server`, `training` ve `public` görünmeli. `public\books` içinde şu beş dosyanın olduğunu kontrol et:

```text
hareket.pdf
saglik.pdf
yonetim.pdf
ogrenme.pdf
psikososyal.pdf
```

Bunlar yoksa yanlış dal veya eski sürüm indirilmiş olabilir; doğru sürüm olmadan sonraki adımlara geçme. ZIP dosyası proje klasörünün içinde bir ek klasör daha oluşturmuş olabilir; **`package.json` dosyasının bulunduğu klasörü** açtığından emin ol.

## 2. Node.js kur

1. [nodejs.org](https://nodejs.org/) adresinden Windows için **LTS** sürümünü indir.
2. Kurulum dosyasını açıp varsayılan seçeneklerle kurulumu tamamla.
3. Windows Başlat menüsünden **PowerShell** aç ve kontrol et:

```powershell
node --version
npm.cmd --version
```

İki komut da sürüm numarası göstermeli. Komut bulunamazsa PowerShell'i kapatıp yeniden aç. Bu rehberde PowerShell betik izni sorununu önlemek için `npm` yerine `npm.cmd` kullanılıyor.

## 3. Ollama'yı Windows'a kur

1. [ollama.com/download/windows](https://ollama.com/download/windows) adresinden Windows kurulum dosyasını indir.
2. Kurulumu tamamla ve Başlat menüsünden **Ollama** uygulamasını aç.
3. Yeni bir PowerShell penceresi aç ve şunları yaz:

```powershell
ollama --version
ollama list
```

Sürüm ve kurulu model listesi görünmeli. Komut bulunamazsa PowerShell'i kapatıp yeniden aç. Bağlantı hatası varsa Ollama uygulamasının çalıştığını kontrol et.

## 4. Soru üretecek modeli indir

Aynı PowerShell penceresinde:

```powershell
ollama pull qwen2.5:7b
ollama list
```

İndirme tamamlanınca listede `qwen2.5:7b` görünmeli. Bu ilk başlangıç için 14B'den daha küçük bir modeldir; doğru cevap garantisi vermez. İnternet hızına göre indirme sürebilir ve disk alanı kullanır.

## 5. Ekran kartını kontrol et

PowerShell'de:

```powershell
nvidia-smi
```

RTX 3080 Ti görünmeli. Komut bulunamıyorsa veya ekran kartı listelenmiyorsa Windows NVIDIA sürücüsünü kontrol et. Ollama'nın modeli GPU'da çalıştırıp çalıştırmadığını model üretim yaparken başka bir PowerShell penceresinde `ollama ps` ve `nvidia-smi` ile kontrol edebilirsin. Modele ve belleğe göre GPU kullanımı değişebilir.

## 6. Proje klasöründe PowerShell aç

1. Dosya Gezgini'nde ayıkladığın proje klasörünü aç.
2. **`package.json` dosyasının göründüğü klasörde** üstteki adres çubuğuna `powershell` yaz ve Enter'a bas.
3. Açılan PowerShell'de kontrol et:

```powershell
dir
```

Listede `package.json` görünmeli. Görünmüyorsa yanlış klasördesin; doğru klasörü açıp tekrar dene.

## 7. Projeyi başlat

Aynı proje PowerShell penceresinde sırayla:

```powershell
npm.cmd install
$env:OLLAMA_MODEL="qwen2.5:7b"
npm.cmd run dev -- --host 127.0.0.1
```

`npm.cmd install` ilk seferde paketleri indirir. Son komuttan sonra terminalde `http://localhost:5173/` gibi bir adres görünür. Windows'ta Chrome veya Edge açıp **terminalde yazan adresi** gir. 5173 doluysa farklı port gösterilebilir.

Bu PowerShell penceresi açık kalmalı. Kapatırsan uygulama durur; durdurmak için **Ctrl + C** kullanabilirsin. Ollama uygulaması da açık olmalı. Bu yerel sunucuyu internete açma; kullanıcı yetkilendirmesi yoktur.

## 8. Modeli uygulamada seç

1. Uygulamada **Soru stüdyosu**na gir.
2. **Durumu yenile** düğmesine bas.
3. **Yerel model seçimi** listesinden `qwen2.5:7b` seç.
4. **Modeli kullan** düğmesine bas.
5. Bağlantı ve model durumunu kontrol et. Daha önce seçilmiş bir model kaydedildiyse terminaldeki varsayılanın yerine o kullanılabilir; gerekirse arayüzden tekrar seç.

**Ollama bağlantısı yok** yazıyorsa Windows'ta Ollama'nın açık olduğunu ve PowerShell'de `ollama list` komutunun çalıştığını kontrol et. **Model kurulu değil** yazıyorsa 4. adımdaki indirmeyi tamamla ve doğru modeli seç.

## 9. Ders çalış ve soru üret

1. Sol menüden **Derslerim** bölümünü aç.
2. Bir kitap ve ünite seç. Anlatımı ve ilgili kitap PDF bölümünü oku.
3. **Okudum, tamamla** düğmesine bas.
4. **Soru stüdyosu**na dön. Ollama bağlı, model hazır ve otomatik üretim açıksa tamamlanan ünitelerden soru üretimi başlar.
5. Üretim kapalıysa **Sürekli üretimi başlat** düğmesine bas.
6. Sekme açık kaldığı sürece uygulamanın diğer sayfalarına geçebilirsin. Sekme kapanırsa yeni üretim istekleri gönderilmez. Bilgisayar uykuya geçtiğinde de üretimin sürmesini bekleme.

Sorular, PDF'nin tamamından değil uygulamadaki kısa ünite anlatımından üretilir. İki aşamalı otomatik kontrolden geçemeyen taslaklar kaydedilmez. Üretim zaman alabilir; otomatik kontrol doğruluk garantisi değildir.

## 10. Soruları nasıl onaylayacağım?

1. **Soru stüdyosu** sayfasında aşağı kaydır ve **Soruları gözden geçir** başlığını bul.
2. **İncelenecek** sekmesine bas. Liste boşsa henüz geçerli taslak oluşmamış olabilir; üretimin açık olduğunu kontrol edip bekle.
3. Kartta **kitap, ünite, konu, soru, dört seçenek, işaretli cevap, gerekçe ve anlatımdaki dayanağı** oku. İşaretli cevap `✓` ile gösterilir.
4. Ünite anlatımını ve ilgili kitap PDF bölümünü aç. Sorunun anlatılan konuya ait olduğuna, yalnız bir doğru cevap bulunduğuna ve gerekçenin doğru olduğuna bak. Dayanağın cevapla gerçekten ilişkili olduğundan emin ol.
5. Soru doğru ve açıksa **Onayla ve teste ekle** düğmesine bas. Soru **Onaylanan** sekmesine geçer.
6. Soru yanlış, belirsiz, tekrarlı veya anlatım dışında bir bilgiye dayanıyorsa **Reddet** düğmesine bas. Reddedilen sorular teste ve eğitime girmez.
7. Kararını değiştirirsen **Onaylanan** veya **Reddedilen** sekmesinden sorunun durumunu değiştirebilirsin.

Bu sürümde soru metnini uygulama içinden düzeltme özelliği yoktur. Emin olmadığın soruyu onaylama. Kullanıcı onayı, bağımsız uzman doğrulaması değildir.

## 11. Tekrar yolunu kullan

1. Sol menüden **Tekrar yolu**na gir. Yalnız tamamladığın üniteler için hatırlama kartları açılır.
2. Karttaki konuyu nota bakmadan kendi cümlelerinle anlat; sonra **Notu göster** düğmesine bas.
3. Notla karşılaştır. Hatırladıysan **Hatırladım**, eksikse **Tekrar etmeliyim** seç.
4. Hatırlanan konular 1, 3, 7, 14 ve 30 gün sonra; eksik kalan konu 10 dakika sonra tekrar gösterilir. Testte yapılan yanlış, ilgili üniteyi hemen tekrar sırasına alır.
5. **Derse dön** veya **Ünite testini çöz** ile konuyu pekiştirebilirsin. Tekrar tarihi uygulamayı açtığında kontrol edilir; otomatik bildirim gönderilmez.

Bu sistem her ünitenin önemli notunu hatırlatır; kitabın tüm konularını ayrı ayrı ölçmez ve kalıcı öğrenme garantisi vermez. Tekrar planı bu tarayıcıda saklanır.

## 11A. Voice Studio ile dinle

1. Sol menüden **Sesli çalışma** aç. Voice Studio'da kitap ve ünite seç.
2. Varsa Windows'taki **Türkçe seslerden** birini seç ve hız ayarını belirle.
3. **Dinlemeye başla** düğmesine bas. **Duraklat**, **Devam et** ve **Durdur** düğmelerini kullanabilirsin.
4. Başka sayfaya geçince ses durur. Ses seçimi görünmüyorsa Windows konuşma ayarlarından Türkçe bir ses kurup tarayıcıyı yeniden başlat veya başka tarayıcı dene.

Voice Studio tarayıcı ve Windows'un sunduğu konuşma sentezini kullanır; ayrı bir yapay zekâ ses paketi kurulmaz ve MP3 dosyası oluşturmaz. Kaynaklarda eksik veya hatalı içerik seslendirmeyle düzelmez.

## 11B. Test çöz

Ünite sayfasında **Ünite testine geç** düğmesini kullan. **Test merkezi** bölümünden kitap ve karma testleri de açabilirsin. Testlerde yalnız tamamlanan ünitelerin uygun soruları kullanılır; yapay zekâ taslakları ancak sen onayladıktan sonra havuza katılır. Rastgele seçim nedeniyle bir soru her testte hemen görünmeyebilir. Yanlış sayısı yüksek üniteler sonraki karma seçimlerde daha çok ağırlık alır.

## 12. Her gün yeniden açarken

1. Windows'ta **Ollama** uygulamasını aç.
2. Proje klasörüne git ve adres çubuğuna `powershell` yazıp Enter'a bas.
3. Şunları çalıştır:

```powershell
$env:OLLAMA_MODEL="qwen2.5:7b"
npm.cmd run dev -- --host 127.0.0.1
```

4. Terminalde gösterilen adresi tarayıcıda aç. Daha önce arayüzde farklı bir model kaydettiysen Soru stüdyosunda istediğin modeli seç.
5. Ders çalış, üniteyi tamamla, üretilen soruları incele ve test çöz. Her gün `npm.cmd install` veya `ollama pull` tekrarlaman gerekmez; bağımlılıklar ya da model değişirse yeniden gerekebilir.

---

# İsteğe bağlı: modeli Windows'ta eğitmek

**Önceki 12 adım soru üretimi için yeterlidir.** Eğitim ayrı ve deneysel bir işlemdir. Aşağıdaki akış doğrudan Windows içindir; bu ortamda gerçek Windows/3080 Ti üzerinde test edilmedi. Sürücü, CUDA, Python paketleri, GPU belleği ve RAM uyumsuzlukları çıkabilir. Soruların doğruluğu veya modelin iyileşmesi garanti değildir.

## 13. En az 50 soruyu onayla

Eğitim için **en az 50 geçerli onaylı soru ve 5 farklı ünite** gerekir. Bu yalnızca programın teknik alt sınırıdır; güvenilir eğitim için çok daha fazla, dengeli ve tercihen alan uzmanı tarafından doğrulanmış soru gerekir. Taslaklar ve reddedilen sorular kullanılmaz. Yalnız modelin kendi ürettiği sorularla eğitim hataları pekiştirebilir.

Eğitimden önce Soru stüdyosunda **Üretimi durdur** seç. Başka bir PowerShell penceresinde çalışan modelleri gör:

```powershell
ollama ps
```

Örneğin `qwen2.5:7b` çalışıyorsa GPU belleğini boşaltmak için:

```powershell
ollama stop qwen2.5:7b
```

Farklı bir model çalışıyorsa onun tam adını yaz. Ollama uygulamasını tamamen kapatma; eğitim sonrası aktarım için servisin açık olması gerekir.

## 14. Python kur ve eğitim verisini hazırla

1. [python.org/downloads/windows](https://www.python.org/downloads/windows/) adresinden **64 bit Python 3.11** indir ve kur. Kurulumda Python'u PATH'e ekleme seçeneğini işaretle.
2. Yeni PowerShell aç; 6. adımdaki gibi proje klasörüne gir.
3. Python sürümünü kontrol et:

```powershell
py -3.11 --version
```

4. Veriyi hazırla:

```powershell
py -3.11 training\prepare.py --reviewer "Ad Soyad"
Get-Content .tempo-data\training\manifest.json
```

`Ad Soyad` yerine soruları gerçekten inceleyen kişinin adını yaz. Komut 50 soru / 5 ünite hatası verirse daha fazla farklı üniteden geçerli soru inceleyip onayla. Tekrarlanan veya dayanağı geçersiz olan kayıtlar elenebilir. Tekrar hazırlama aynı eğitim dosyalarını yeniden oluşturur; eski veri kümesini saklamak istiyorsan önce yedekle.

## 15. Eğitim ortamını kur

Proje klasöründeki PowerShell'de:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
```

CUDA destekli PyTorch için aşağıdaki Windows örneği CUDA 12.4 paketini kurar; uyumlu ve güncel NVIDIA sürücüsü gerekir:

```powershell
.\.venv\Scripts\python.exe -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124
.\.venv\Scripts\python.exe -m pip install -r training\requirements.txt
.\.venv\Scripts\python.exe -c "import torch; print('CUDA:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'bulunamadı')"
```

`CUDA: True` ve RTX 3080 Ti görünmeli. Görünmüyorsa sürücüyü ve [PyTorch kurulum seçeneklerini](https://pytorch.org/get-started/locally/) kontrol et; eğitime devam etme. `bitsandbytes` ve diğer paketlerin Windows/CUDA uyumu sürüme bağlıdır; başarılı kurulum gerçek eğitim başarısını garanti etmez.

## 16. Otomatik aktarım için araçları kur

1. [Git for Windows](https://git-scm.com/download/win) kur.
2. [CMake](https://cmake.org/download/) kur ve kurulumda komut satırından erişim/PATH seçeneğini aç.
3. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) kurulumunda **Desktop development with C++ / C++ ile masaüstü geliştirme** iş yükünü seç.
4. Yeni bir PowerShell aç; yeniden proje klasörüne gir. `git --version` ve `cmake --version` ile araçları kontrol et.
5. Aşağıdaki komutları proje klasöründen çalıştır:

```powershell
git clone https://github.com/ggml-org/llama.cpp.git "$env:USERPROFILE\llama.cpp"
cmake -S "$env:USERPROFILE\llama.cpp" -B "$env:USERPROFILE\llama.cpp\build"
cmake --build "$env:USERPROFILE\llama.cpp\build" --config Release --target llama-quantize
.\.venv\Scripts\python.exe -m pip install -r "$env:USERPROFILE\llama.cpp\requirements\requirements-convert_hf_to_gguf.txt"
Test-Path "$env:USERPROFILE\llama.cpp\convert_hf_to_gguf.py"
Test-Path "$env:USERPROFILE\llama.cpp\build\bin\Release\llama-quantize.exe"
ollama list
```

İki `Test-Path` sonucunun `True` olması ve `ollama list` komutunun bağlantı hatası vermemesi gerekir. `llama.cpp` klasörü zaten varsa üzerine klonlama; mevcut araçların uyumunu kontrol et. Derleyici bulunamadı hatasında C++ iş yükünün kurulu olduğunu kontrol et. Bu derleme aktarım için CPU üzerinde çalışır; eğitim için ayrı CUDA destekli PyTorch gerekir.

## 17. Eğitimi başlat ve Ollama'ya aktar

Proje klasöründeki PowerShell'de:

```powershell
.\.venv\Scripts\python.exe training\train_lora.py --llama-dir "$env:USERPROFILE\llama.cpp"
```

İlk çalıştırma Qwen2.5 3B taban modelini internetten indirebilir. Varsayılan LoRA ayarında yaklaşık **98.304 eğitilebilir parametre** beklenir; bu tam 100.000 değildir. Betik gerçek sayıyı ekrana yazar. Eğitim tamamlanırsa adaptörü birleştirip GGUF'a dönüştürmeyi ve Ollama'ya yeni bir model olarak aktarmayı dener.

Pencereyi işlem bitene kadar açık tut. Eğitim VRAM, aktarım ise ayrıca sistem RAM'i ve disk kullanır; 12 GB GPU belleğine sığacağı garanti değildir. Aktarım başarısız olsa bile eğitim tamamlanmışsa adaptör korunur. Sorunu düzelttikten sonra varsayılan adaptör için aktarımı tekrar deneyebilirsin:

```powershell
.\.venv\Scripts\python.exe training\ollama_export.py --adapter .tempo-data\adapter --llama-dir "$env:USERPROFILE\llama.cpp"
```

Mevcut adaptörün üzerine yazılmaz. İkinci eğitim için farklı bir klasör seç:

```powershell
.\.venv\Scripts\python.exe training\train_lora.py --llama-dir "$env:USERPROFILE\llama.cpp" --output .tempo-data\adapter-ikinci
```

## 18. Eğitilmiş modeli seç ve kontrol et

Aktarımın gerçekten başarılı olduğunu kontrol et:

```powershell
ollama list
```

Başarılıysa listede `tempo-trained:...` adlı yeni bir model görünür. Uygulamada **Soru stüdyosu → Durumu yenile → Yerel model seçimi** yolundan modeli seçip **Modeli kullan** düğmesine bas. Gerekirse önce üretimi durdur. Sonra **Sürekli üretimi başlat** ile devam et.

Yeni modelin sorularını da 10. adımda anlatıldığı gibi inceleyip onaylaman gerekir. Modelin daha iyi olduğunu varsayma. Varsayılan adaptörü taban modelle biçim ve alıntı bakımından karşılaştırmak istersen:

```powershell
.\.venv\Scripts\python.exe training\evaluate.py
```

Bu karşılaştırma cevap doğruluğunu veya sınav güçlüğünü ölçmez; sonuçları kaynaklarla ve mümkünse uzmanla ayrıca incele.

## 19. Dosyalar, yedek ve disk alanı

- Üretilen sorular ve onayları proje klasöründeki `.tempo-data\questions.json` dosyasındadır. `.tempo-data` Git'e gönderilmez; uygulama ve eğitim durmuşken klasörü ayrıca yedekle.
- Ders ilerlemesi tarayıcının yerel deposundadır. Tarayıcı verilerini temizlersen ilerleme kaybolabilir; `.tempo-data` yedeği bunu tek başına geri getirmez.
- Eğitim verileri `.tempo-data\training`, adaptör varsayılan olarak `.tempo-data\adapter` içindedir. Ollama modelleri ayrı bir konumda bulunabilir.
- Uygulamadaki **100 GB sınırı yaklaşık bir kontroldür, kesin Windows disk kotası değildir**. Harici Ollama modelleri, başka programlar ve işlemler toplam alanı artırabilir. Boş alanı Dosya Gezgini'nde ilgili sürücünün özelliklerinden kontrol et.

## Bilmen gerekenler

Bu sürümde 29 ünite için kısa anlatımlar ve çeşitli soru bankaları vardır. **5000 benzersiz soru, ünite başına 100 soru, kitapların tüm ayrıntıları ve uzman doğrulaması tamamlanmış değildir.** Kitap PDF'leri konu kaynağı olarak kullanılabilir; PDF sorularının tamamı interaktif teste aktarılmamıştır. Uygulama sınav başarısı veya cevap doğruluğu garantisi vermez.

Geliştirici kontrolleri:

```powershell
npm.cmd run build
npm.cmd run audit
node --test scripts/test-ollama.mjs scripts/test-memory.mjs
py -3.11 -m unittest discover -s training -p "test_*.py"
```

Anlatım veya soru kaynak kodları değiştirilirse `npm.cmd run contexts` çalıştırıp uygulama sunucusunu yeniden başlat. Bu komutlar gerçek model kalitesini, GPU eğitimini veya uzman doğruluğunu test etmez.
