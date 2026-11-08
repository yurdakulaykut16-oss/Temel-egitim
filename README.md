# Tempo — Antrenörlük temel eğitim çalışma alanı

Bu rehber **Windows 11 üzerinde, doğrudan kendi bilgisayarında** çalışmak içindir. Ubuntu veya WSL kurman gerekmez. İşlemleri sırayla yap: önce projeyi ve Ollama'yı çalıştır, ardından soruları incele. Model eğitimi isteğe bağlıdır ve sonraki adımlardadır.

> **Önce GitHub sürümünü kontrol et:** Depo adresi [github.com/yurdakulaykut16-oss/Temel-egitim](https://github.com/yurdakulaykut16-oss/Temel-egitim). Bu rehberde anlatılan güncel dosyalar, GitHub'da yer aldıkları daldan indirilmelidir. Arena'daki değişiklikler kendiliğinden GitHub'a aktarılmaz. GitHub'da seçili dalda `package.json`, `src`, `server`, `training` ve `public/books` yoksa o sürüm bu uygulamanın tamamı değildir. Çalışma dalı `arena/affea53d-temel-egitim` GitHub'a gönderilmediyse o daldan indirme yapılamaz.

## 1. Projeyi GitHub'dan indir

1. Tarayıcıda [proje sayfasını](https://github.com/yurdakulaykut16-oss/Temel-egitim) aç.
2. Sol üstteki dal seçme düğmesinden güncel uygulamanın bulunduğu dalı seç. Bu çalışma oturumunun dalı `arena/affea53d-temel-egitim` adını taşır; yalnız GitHub'a gönderilmişse listede görünür. Değişiklikler sonradan `main` dalına alınmışsa güncel `main` da kullanılabilir.
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

## 4. Soru üretecek "öğretmen" modeli indir

Aynı PowerShell penceresinde:

```powershell
ollama pull qwen3:14b
ollama list
```

İndirme tamamlanınca listede `qwen3:14b` görünmeli. Bu, projenin varsayılan üretici/denetçi modelidir: Qwen3 14B, boyutuna göre güçlü ve Qwen2.5 32B düzeyine yakın yanıt kalitesi sunan, "hibrit düşünme" moduna sahip görece yeni bir modeldir; Q4 nicemlemeyle yaklaşık 9 GB VRAM kullanır ve RTX 3080 Ti'nin 12 GB belleğine rahatça sığar. Yine de doğru cevap garantisi vermez; bu yüzden proje iki bağımsız hakemden oluşan bir denetim kullanır (bkz. Adım 9-10).

İki hakemin GERÇEKTEN bağımsız olması için 2. hakemin varsayılanı Qwen ailesinden DEĞİL, Google'ın **Gemma 3 12B** modelidir (Türkçe dahil 140'tan fazla dili resmi olarak destekler, soru üretmede üstün olması şart değildir — amacı yalnızca bağımsız bir "ikinci görüş" sunmaktır, ve Q4 nicemlemeyle ~8 GB VRAM kullanarak 12 GB'lık karta rahatça sığar). Bunu da aynı adımda indirmen önerilir:

```powershell
ollama pull gemma3:12b
ollama list
```

Bu modeli indirmezsen program yine çalışır, ama arayüzde 2. hakem "kurulu değil" görünür ve o model indirilene (veya Adım 8'de elle başka bir kurulu model seçilene) kadar kendi kendine üretim bekler. İnternet hızına göre indirmeler sürebilir ve disk alanı kullanır. Daha küçük bir kart kullanıyorsan `qwen2.5:7b` gibi daha hafif bir modeli üretici/denetçi için seçebilirsin; Adım 8'de istediğin zaman değiştirebilirsin. 2. hakem için de Gemma 3 12B yerine başka bir kurulu modeli (ör. `mistral-nemo:12b`) seçmekte serbestsin.

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
$env:OLLAMA_MODEL="qwen3:14b"
npm.cmd run dev -- --host 127.0.0.1
```

`npm.cmd install` ilk seferde paketleri indirir. Son komuttan sonra terminalde `http://localhost:5173/` gibi bir adres görünür. Windows'ta Chrome veya Edge açıp **terminalde yazan adresi** gir. 5173 doluysa farklı port gösterilebilir.

Bu PowerShell penceresi açık kalmalı. Kapatırsan uygulama durur; durdurmak için **Ctrl + C** kullanabilirsin. Ollama uygulaması da açık olmalı. Bu yerel sunucuyu internete açma; kullanıcı yetkilendirmesi yoktur.

**Önemli:** Soru üretimi artık bu PowerShell penceresinin (sunucunun) kendisinde, arka planda çalışır — tarayıcıda bir sekme açık tutman gerekmez. Tarayıcıyı yalnızca modeli seçmek, ilerlemeni görmek ve test çözmek için açarsın; onu kapatsan bile sunucu ve Ollama açık kaldığı sürece soru üretimi sürer.

## 8. Modeli uygulamada seç

1. Uygulamada **Soru stüdyosu**na gir.
2. **Durumu yenile** düğmesine bas.
3. **Yerel model seçimi** listesinden `qwen3:14b` seç ve **Modeli kullan** düğmesine bas — bu, soruları YAZAN (üretici) modeldir.
4. Aynı sayfada ayrıca iki bağımsız denetleyici seçicisi daha vardır: **Denetçi (1. hakem)** ve **2. hakem**. İstersen (indirdiysen) her biri için FARKLI bir model seç ve her birinin yanındaki **Modeli kullan** düğmesine ayrı ayrı bas — bkz. 9. madde, neden önerildiği için.
5. Bağlantı ve model durumunu kontrol et. Daha önce seçilmiş modeller kaydedildiyse terminaldeki varsayılanın yerine onlar kullanılabilir; gerekirse arayüzden tekrar seç.

**Ollama bağlantısı yok** yazıyorsa Windows'ta Ollama'nın açık olduğunu ve PowerShell'de `ollama list` komutunun çalıştığını kontrol et. **Model kurulu değil** yazıyorsa 4. adımdaki indirmeyi tamamla ve doğru modeli seç. **Denetçi (1. hakem)** hiç seçilmediyse otomatik olarak üretici modelle aynısına düşer. **2. hakem** hiç seçilmediyse, gerçek bağımsızlık için otomatik olarak Gemma 3 12B'ye düşmeye çalışır (bkz. Adım 4) — bu model kurulu değilse karşısında "kurulu değil" görürsün; ya `ollama pull gemma3:12b` ile indir ya da listeden kurulu başka bir modeli elle seç.

## 9. Yapay zekâ kendi kendine öğretmenlik yapsın — iki bağımsız hakem denetimi

Bu sürümde soru üretimi senin bir eğitmen veya uzman olmanı gerektirmez: bir model **soru yazarı** olur, bir de **denetçi + 1 ayrı hakem** olmak üzere İKİ AYRI model birbirinden habersizce **öğretmen/hakem** rolünü üstlenir; sorunun zorluğunu bu ikisinin ortak kararı belirler, ikisi de hemfikir olmazsa soru havuza girmez.

1. Model(ler) seçildikten sonra sunucu, **Soru stüdyosu** sayfasını hiç açmasan da kendi kendine çalışmaya başlar: 29 ünitenin tamamını dolaşır, her biri için özgün sorular yazar.
2. Üretim **gerçekten paralel**: sunucu, tek bir üniteyi bitirip sıradakine geçmek yerine, aynı anda birden fazla ünite için soru üretir (varsayılan 3, Soru stüdyosu sayfasından 1 ile 29 arasında ayarlanabilir). Bir soru onaylanır onaylanmaz, yapay bir bekleme olmadan hemen boşalan yuvaya yeni bir ünite alınır.
3. Yazılan her soru, havuza eklenmeden ÖNCE, cevabı ve gerekçeyi hiç GÖRMEYEN **İKİ bağımsız model** (denetçi + 1 ayrı hakem) tarafından AYNI ANDA, birbirinden habersiz olarak yeniden çözülür. Her biri kendi başına: tek doğru cevap var mı, cevap doğru mu, kaynakla destekleniyor mu, soru sınav kalitesinde mi ve **zorluğu ne** (kolay/orta/zor) değerlendirir.
   - **Hem doğrulukta hem zorlukta tam görüş birliği (2/2) şarttır**: yalnızca iki hakem olduğu için "çoğunluk" kavramı kullanılmaz — ikisi de aynı cevapta VE aynı zorlukta birleşmezse (biri farklı bir cevap/zorluk verirse, reddederse ya da kalite/kaynak kontrolünden geçiremezse) soru hiç kaydedilmez.
   - İki hakemin ayrı ayrı modeli, cevabı, zorluk kararı ve gerekçesi **Soru stüdyosu**'ndaki her soru kartında TEK TEK, hiçbirine indirgenmeden gösterilir.
4. Her ünite için sorular her zaman belirli bir sırayla üretilir: **önce 1 kolay, sonra 1 orta, sonra 1 zor**, sonra tekrar kolaydan başlayarak döner. İki hakemin ortak bulduğu zorluk, o andaki hedefle eşleşmezse (örn. hedef "kolay" iken ikisi de "zor" bulursa) soru kaydedilmez; kalıp bozulmasın diye farklı bir soru yeniden denenir.
5. Gerçek hız sabit bir sayı (ör. "her 2 saniyede bir") değildir ve olamaz: her soru **üç ayrı model geçişinden** (1 üretici + 2 paralel hakem) geçmek zorundadır, bu yüzden gerçek hız bilgisayarının ekran kartına ve seçtiğin modellere bağlıdır. İki hakem çağrısı aynı anda (paralel) gönderilir, ama **tek ekran kartlı bir bilgisayarda Ollama bunları muhtemelen sırayla işler** — bu durumda gerçek süre, tek-hakemli bir sürüme göre yaklaşık iki kat daha uzun sürebilir. Hız için bu kontrolleri azaltmak bilinçli olarak tercih edilmedi. Bunun yerine her denemeye bir **azami süre bütçesi** konur (varsayılan 5 saniye, Soru stüdyosu sayfasından 1-120 saniye arasında ayarlanabilir): bir ünitenin üretim + iki bağımsız kontrol adımı bu süreyi aşarsa deneme iptal edilir ve yuva hemen yeni bir denemeyle doldurulur. Yavaş bir ekran kartında varsayılan 5 saniye sık sık yetmeyebilir; üretim neredeyse hiç başarılı olmuyorsa bu süreyi yükselt.
6. Üretilen her soru **benzersizdir**: aynı metinle birebir aynı soru hiçbir zaman ikinci kez kaydedilmez, aynı ünite içinde anlamca çok yakın (kelime örtüşmesi yüksek) bir soru da reddedilir; model ayrıca o üniteye daha önce sorulmuş sorulardan haberdar edilip onları tekrarlamaması istenir.
7. Hem doğruluk hem zorluk kontrolü (ikisinde de tam görüş birliği) geçerse soru otomatik olarak **onaylanmış** sayılır ve hemen soru havuzuna girer — senin ayrıca "onaylaman" gerekmez. Herhangi bir koşul sağlanmazsa soru hiç kaydedilmez.
8. **Soru stüdyosu** sayfasında istersen ilerlemeyi (hangi ünitelerin şu an aynı anda üretildiğini) izleyebilir, **Kendi kendine üretimi durdur/başlat** düğmesiyle süreci duraklatabilir veya devam ettirebilir, aynı anda kaç ünite üretileceğini, deneme başına azami süreyi ve iki hakemin hangi modeller olacağını değiştirebilirsin.
9. Bir ünite okuyup **Okudum, tamamla** dediğinde, o ünite için zaten hazırlanmış onaylı sorular testlerine hemen dahil olur; aynı anda arka planda henüz çalışmadığın üniteler için de üretim sürmeye devam eder.

Sorular, PDF'nin tamamından değil uygulamadaki kısa ünite anlatımından üretilir. Tam görüş birliğinden geçemeyen taslaklar hiç kaydedilmez. Üretim zaman alabilir; bu otomatik denetim doğruluk garantisi değildir ve bağımsız bir uzman doğrulamasının yerini tutmaz — "kolay/orta/zor" etiketi de yapay zekâların öznel değerlendirmesidir, resmî bir zorluk ölçeği değildir. Gerçek bağımsızlık için 2. hakemin varsayılanı zaten üretici/denetçiden (Qwen) FARKLI bir model ailesidir (Gemma 3 12B, bkz. Adım 4); bu modeli indirmediysen veya elle aynı modeli ikisine de seçersen, bu artık gerçek bir bağımsız doğrulama değil, aynı modelin kendi kendine iki kez onayı anlamına gelir — gerçek bağımsızlık istiyorsan iki ayrı model indirip ayrı ayrı seçili tut. Eşzamanlılığı çok yükseğe veya süre bütçesini çok düşüğe ayarlamak zayıf bir ekran kartında üretimi neredeyse tamamen durdurabilir; deneyerek bilgisayarına uygun sayıları bul.

## 10. Yapay zekânın kararlarını izle (istersen veto et)

Kendin bir eğitmen olmak veya her soruyu tek tek onaylamak zorunda değilsin; bu sürümde o rolü iki bağımsız yapay zekâ hakemi üstlenir. Yine de son sözü sende bırakan bir güvenlik kapısı var:

1. **Soru stüdyosu** sayfasında aşağı kaydır, **Yapay zekâ öğretmenin kararları** başlığını bul.
2. **AI onayladı** sekmesinde, otomatik olarak onaylanan sorular ve her birinin yanında **iki hakemin ayrı ayrı** modeli, zorluk kararı ve gerekçesi görünür.
3. Bir soruyu okurken yanlış, belirsiz veya anlatım dışı bulursan **Reddet** düğmesine bas; o soru artık teste veya eğitime girmez ve **Reddedilen** sekmesine taşınır.
4. Fikrini değiştirirsen reddettiğin bir soruyu **Yeniden onayla** ile tekrar havuza katabilirsin.

Bu sürümde soru metnini uygulama içinden düzeltme özelliği yoktur. İki hakemin tam görüş birliği, bağımsız bir uzman doğrulaması değildir; sen de incelemek istersen her zaman reddetme hakkına sahipsin.

## 11. Tekrar yolunu kullan

1. Sol menüden **Tekrar yolu**na gir. Yalnız tamamladığın üniteler için hatırlama kartları açılır.
2. Karttaki konuyu nota bakmadan kendi cümlelerinle anlat; sonra **Notu göster** düğmesine bas.
3. Notla karşılaştır. Hatırladıysan **Hatırladım**, eksikse **Tekrar etmeliyim** seç.
4. Hatırlanan konular giderek büyüyen aralıklarla (1, 3, 7, 14, 30, 60, 120, 240, sonra yaklaşık her 365 günde bir) tekrar gösterilir; amaç bir kez öğrenilen bir şeyi kalıcı hâle getirip sessizce unutulmasını önlemektir. Eksik kalan konu 10 dakika sonra tekrar gösterilir. Testte yapılan yanlış, ilgili üniteyi hemen tekrar sırasına alır ve aralığı sıfırlar.
5. **Derse dön** veya **Ünite testini çöz** ile konuyu pekiştirebilirsin. Tekrar tarihi uygulamayı açtığında kontrol edilir; otomatik bildirim gönderilmez.

Bu sistem her ünitenin önemli notunu hatırlatır; kitabın tüm konularını ayrı ayrı ölçmez ve kalıcı öğrenme garantisi vermez. Tekrar planı bu tarayıcıda saklanır.

Bir üniteyi önceden okuyup tamamladıysan ama baştan tekrar okumak/çözmek istersen, ünite sayfasında **Üniteyi sıfırla, en baştan başla** düğmesini kullanabilirsin (yalnız o ünite okundu/tamamlandı işaretini, o üniteye ait test sonuçlarını ve Tekrar yolu kaydını siler; diğer ünitelerin ilerlemesine ve yapay zekânın ürettiği soru havuzuna dokunmaz). Bu düğme, ünite daha önce okunmuş veya en az bir kez test edilmişse görünür.

## 11A. Voice Studio ile dinle

1. Sol menüden **Sesli çalışma** aç. Voice Studio'da kitap ve ünite seç.
2. Varsa Windows'taki **Türkçe seslerden** birini seç ve hız ayarını belirle.
3. **Dinlemeye başla** düğmesine bas. **Duraklat**, **Devam et** ve **Durdur** düğmelerini kullanabilirsin.
4. Başka sayfaya geçince ses durur. Ses seçimi görünmüyorsa Windows konuşma ayarlarından Türkçe bir ses kurup tarayıcıyı yeniden başlat veya başka tarayıcı dene.

Voice Studio tarayıcı ve Windows'un sunduğu konuşma sentezini kullanır; ayrı bir yapay zekâ ses paketi kurulmaz ve MP3 dosyası oluşturmaz. Kaynaklarda eksik veya hatalı içerik seslendirmeyle düzelmez.

## 11B. Test çöz

Ünite sayfasında **Ünite testine geç** düğmesini kullan. **Test merkezi** bölümünden kitap ve karma testleri de açabilirsin. Testlerde yalnız tamamlanan ünitelerin uygun soruları kullanılır; yapay zekânın kendi kendine onayladığı sorular ek bir işlem gerekmeden havuza girmiş olur. Rastgele seçim nedeniyle bir soru her testte hemen görünmeyebilir. Bir üniteyi yanlış yaptıkça o ünite, art arda üç doğruya ulaşana kadar karma testlerde daha sık ve daha ağırlıklı çıkar; üç doğruya ulaştığında ağırlığı azalır, ama kalıcılığı Tekrar yolu'ndaki uzun vadeli program korur.

## 11C. Nasıl çalışmalı, hangi konulara ağırlık ver

Bu bölüm, "Antrenörlük Temel Eğitimi" sınavının genel formatı ve çalışma taktikleri hakkında internet üzerinden yapılan genel bir araştırmanın özetidir (uygulama içinde **Çalışma planım** sayfasında da aynı bilgiler kart hâlinde bulunur). **Bunlar resmî değildir, sayılar kaynağa göre değişebilir**; sınav tarihinden önce mutlaka Gençlik ve Spor Bakanlığı / Anadolu Üniversitesi'nin kendi duyurularından doğrula.

- **Sınav yapısı:** Uygulamadaki 5 kitapla eşleşen 5 modül (Hareket ve Antrenman Bilimleri, Spor ve Sağlık Bilimleri, Sporda Öğrenme ve Öğretme, Sporda Psikososyal Alanlar, Spor Yönetimi); her modülden 20, toplamda 100 soru.
- **Geçme barajı modül başınadır, genel ortalama değildir:** Her modülde bağımsız olarak en az %60 (20 soruda 12 doğru) gerekir. Bir modülü geçememek yalnız o modülü etkiler ve genelde bir "bütünleme" sınavında tekrar girilebilir; diğer modüllerden çok yüksek almak düşük modülü telafi etmez.
- **Yanlış, doğruyu götürmez:** Bildiğin kadarıyla işaretlemekten çekinme; boş bırakmakla yanlış yapmak arasında puan farkı yoktur (negatif puanlama yok).
- **Önce en zayıf olduğun modülü bul:** Baraj modül başına olduğu için en kritik modül, en zayıf olduğun modüldür. Uygulamadaki **Test merkezi**nden her kitap için ayrı deneme çöz, en düşük çıkan modülde fazladan zaman geçir (hedef: güvenlik payı için 20 soruda 15-16 doğru).
- **Bazı modüller daha teknik olma eğilimindedir:** Hareket ve Antrenman Bilimleri ile Spor ve Sağlık Bilimleri, anatomi/fizyoloji/antrenman terminolojisi içerdiğinden genelde daha zor bulunur; kart/özet çıkararak ve kavramları görselleştirerek (örn. "süper telafi" eğrisini çizerek) çalışmak ezbere göre daha kalıcı olabilir. Spor Yönetimi ve Sporda Psikososyal Alanlar genelde daha az teknik bulunur.
- **Konuyu başka birine (veya kendine) sesli anlat:** Bir konuyu notlara bakmadan kendi cümlelerinle anlatabilmek, gerçekten öğrenip öğrenmediğini en iyi gösteren testlerden biridir. Uygulamadaki **Tekrar yolu**, tam bunun için kart başına "önce anlat, sonra notu gör" akışını kullanır.
- **Son haftalarda süreyle (zamanlı) çalış:** Gerçek sınavda modül başına yaklaşık 1 dakika/soru düşer. Sınavdan 1-2 hafta önce **Test merkezi**nde 20 soruluk kitap testlerini zamanlayarak çözmek, gerçek temponu ölçmene yardımcı olur.
- **Yanlış yaptıkların listesini tut, sonda onları tekrar çöz:** Her şeyi baştan yeniden okumak yerine, özellikle yanlış yaptığın sorulara yakın zamanda tekrar dön; uygulama bunu zaten otomatik yapar (bkz. "11B. Test çöz" ve "11. Tekrar yolunu kullan" — yanlış yapılan ünite, üç doğruya ulaşana kadar karma testlerde daha sık ve ağırlıklı çıkar).
- **Erken başla:** Genel öneri, sınavdan 4-6 hafta önce düzenli çalışmaya başlamak ve kaynak metni (sadece özet değil) birkaç kez okumaktır; gerçek sınav ince ayrıntıları da sorabilir.

## 12. Her gün yeniden açarken

1. Windows'ta **Ollama** uygulamasını aç.
2. Proje klasörüne git ve adres çubuğuna `powershell` yazıp Enter'a bas.
3. Şunları çalıştır:

```powershell
$env:OLLAMA_MODEL="qwen3:14b"
npm.cmd run dev -- --host 127.0.0.1
```

4. Terminalde gösterilen adresi tarayıcıda aç. Daha önce arayüzde farklı bir model kaydettiysen Soru stüdyosunda istediğin modeli seç. Sunucu açılır açılmaz kendi kendine üretim de otomatik devam eder; ayrıca bir şey başlatman gerekmez.
5. Ders çalış, üniteyi tamamla; yapay zekânın arka planda zaten biriktirdiği onaylı soruları test çöz. Her gün `npm.cmd install` veya `ollama pull` tekrarlaman gerekmez; bağımlılıklar ya da model değişirse yeniden gerekebilir.

---

# İsteğe bağlı: modeli Windows'ta eğitmek

**Önceki 12 adım soru üretimi için yeterlidir.** Eğitim ayrı ve deneysel bir işlemdir. Aşağıdaki akış doğrudan Windows içindir; bu ortamda gerçek Windows/3080 Ti üzerinde test edilmedi. Sürücü, CUDA, Python paketleri, GPU belleği ve RAM uyumsuzlukları çıkabilir. Soruların doğruluğu veya modelin iyileşmesi garanti değildir.

## 13. En az 50 onaylı soru birikmesini bekle

Eğitim için **en az 50 geçerli onaylı soru ve 5 farklı ünite** gerekir. Yapay zekâ kendi kendine ürettiği her soruyu iki bağımsız hakemin denetiminden geçirip otomatik onayladığı için bu eşiğe genellikle ek bir işlem yapmadan, sunucuyu biraz süre açık bırakarak ulaşırsın. Bu sayı yalnızca programın teknik alt sınırıdır; daha güvenilir bir eğitim için çok daha fazla, dengeli ve tercihen bir insanın da göz attığı soru daha iyidir. Reddettiğin sorular kullanılmaz. Yalnız modelin kendi ürettiği sorularla eğitim, modelin kendi hatalarını da pekiştirebilir; bu yüzden Adım 10'daki inceleme ekranından ara sıra göz gezdirip tuhaf gördüklerini reddetmen önerilir.

Eğitimden önce Soru stüdyosunda **Kendi kendine üretimi durdur** seç. Başka bir PowerShell penceresinde çalışan modelleri gör:

```powershell
ollama ps
```

Örneğin `qwen3:14b` çalışıyorsa GPU belleğini boşaltmak için:

```powershell
ollama stop qwen3:14b
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
py -3.11 training\prepare.py
Get-Content .tempo-data\training\manifest.json
```

`--reviewer` artık zorunlu değil; belirtmezsen kayıtlar "AI öğretmen (iki bağımsız hakem konsensüsüyle otomatik doğrulama)" etiketiyle işaretlenir, çünkü onay varsayılan olarak yapay zekânın kendisinden gelir. Soruları sen de ayrıca gözden geçirdiysen kendi adını veya kodunu eklemek istersen `py -3.11 training\prepare.py --reviewer "Ad Soyad"` kullanabilirsin. Komut 50 soru / 5 ünite hatası verirse sunucuyu biraz daha açık bırakıp daha fazla üniteden onaylı soru birikmesini bekle. Tekrarlanan veya dayanağı geçersiz olan kayıtlar elenebilir. Tekrar hazırlama aynı eğitim dosyalarını yeniden oluşturur; eski veri kümesini saklamak istiyorsan önce yedekle.

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

Başarılıysa listede `tempo-trained:...` adlı yeni bir model görünür. Uygulamada **Soru stüdyosu → Durumu yenile → Yerel model seçimi** yolundan modeli seçip **Modeli kullan** düğmesine bas. Gerekirse önce **Kendi kendine üretimi durdur**, sonra **Kendi kendine üretimi başlat** ile devam et.

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
node --test scripts/test-ollama.mjs scripts/test-ollama-auto.mjs scripts/test-memory.mjs
py -3.11 -m unittest discover -s training -p "test_*.py"
```

Anlatım veya soru kaynak kodları değiştirilirse `npm.cmd run contexts` çalıştırıp uygulama sunucusunu yeniden başlat. Bu komutlar gerçek model kalitesini, GPU eğitimini veya uzman doğruluğunu test etmez.
