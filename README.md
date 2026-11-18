# Tempo — Antrenörlük temel eğitim çalışma alanı

Bu rehber **Windows 11 üzerinde, doğrudan kendi bilgisayarında** çalışmak içindir. Ubuntu veya WSL kurman gerekmez. İşlemleri sırayla yap: önce projeyi ve Ollama'yı çalıştır, ardından soruları incele. Model eğitimi isteğe bağlıdır ve sonraki adımlardadır.

> **SIFIR DÜĞME — İKİ MOTOR, KESİNTİSİZ:** Proje açıldığı andan itibaren **hiçbir düğmeye basman gerekmez** ve projede sürekli çalışan yalnızca **iki şey** vardır: **(1) kaliteli soru üretimi** — hedef 5 saniyede 1 soru, iki hakem denetimi ve 20.000 kayıtlık havuz bakımıyla birlikte; **(2) üretilmiş soruların kalitesinin sürekli artırılması** — onaylı havuz düzenli taranır, çıtanın altında kalan sorular çift hakem kapısından geçen yükseltilmiş sürümleriyle değiştirilir. Model çağrıları uygulama içindeki sınırlı kuyruktan geçer (varsayılan **4 paralel yuva**, 1–8 arası ayarlanabilir); kalite iyileştirme motoru modeli yalnızca üretim boştayken kullanır. İnternet araştırması, konuyu anlatım, ses gibi diğer her şey yalnızca senin açtığın sayfalarda çalışır; kesintisiz çalışan ek arka plan ajanı yoktur.

> **Önce GitHub sürümünü kontrol et:** Depo adresi [github.com/yurdakulaykut16-oss/Temel-egitim](https://github.com/yurdakulaykut16-oss/Temel-egitim). Bu rehberde anlatılan güncel dosyalar, GitHub'da yer aldıkları daldan indirilmelidir. Arena'daki değişiklikler kendiliğinden GitHub'a aktarılmaz. GitHub'da seçili dalda `package.json`, `src`, `server`, `training` ve `public/books` yoksa o sürüm bu uygulamanın tamamı değildir. Çalışma dalı `arena/41dcbbc1-temel-egitim` GitHub'a gönderilmediyse o daldan indirme yapılamaz.

## 1. Projeyi GitHub'dan indir

1. Tarayıcıda [proje sayfasını](https://github.com/yurdakulaykut16-oss/Temel-egitim) aç.
2. Sol üstteki dal seçme düğmesinden güncel uygulamanın bulunduğu dalı seç. Bu çalışma oturumunun dalı `arena/41dcbbc1-temel-egitim` adını taşır; yalnız GitHub'a gönderilmişse listede görünür. Değişiklikler sonradan `main` dalına alınmışsa güncel `main` da kullanılabilir.
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

## 4. İndirmen gereken TÜM modeller ve nasıl indirilir?

Uygulama içinde **5 ana yapay zekâ rolü** vardır: **Üretici Öğretmen**, **1. Hakem**, **Bağımsız 2. Hakem**, **Evrim Mimarı (JARVIS)** ve **Qwen Code (Zorluk & Sistem Geliştiricisi)**. İyi haber: **proje açıldığı anda kurulu modelleri otomatik algılayıp tüm rollere kendisi yerleştirir** ve eksik uzman profillerini (`tempo-ogretmen:latest`, `tempo-hakem:latest`, `tempo-mimar:latest`, `tempo-qwen-coder:latest`) **açılışta bir kez kendiliğinden oluşturur** — bunları elle indirmene gerek yoktur.

Aşağıdaki komutları **tek tek** PowerShell'de çalıştır. Hepsini indirmen şart değil; kendine uygun **bir set** yeterlidir. (İnternet hızına göre her model 1-10 GB arası sürer.)

### Seçenek A — RTX 3080 Ti / 12 GB VRAM · Önerilen Tam Set (En Yüksek Kalite + Hız)

```powershell
# 1) Ana üretici & evrim beyni — Qwen3 14B (~9 GB, Türkçe kalitesi çok yüksek)
ollama pull qwen3:14b

# 2) Bağımsız 2. hakem — Google Gemma 3 12B (farklı aileden gerçek ikinci görüş, ~8 GB)
ollama pull gemma3:12b

# 3) Qwen Code rolü — zorluk motoru & kalite kuralları (~9 GB)
ollama pull qwen2.5-coder:14b
```

### Seçenek B — 8 GB VRAM / Daha hızlı üretim (önerilen hafif set)

```powershell
ollama pull qwen3:8b
ollama pull gemma3:4b
ollama pull qwen2.5-coder:7b
```

### Seçenek C — Ekstrem hız (~0.5-1 sn/soru) · Minimum VRAM (~7.8 GB)

```powershell
ollama pull qwen3:4b
ollama pull gemma3:4b
ollama pull qwen2.5-coder:3b
```

### Seçenek D — Kodlama konseyi TAM YIĞIN (opsiyonel · otomatik kurulum da var)

Proje açılışında Ollama bağlıysa şu 6 kodlayıcı **eksikse kendiliğinden indirilir** (`TEMPO_NO_AUTO_PULL=1` ile kapatılabilir):

```powershell
ollama pull qwen2.5-coder:1.5b
ollama pull qwen2.5-coder:3b
ollama pull qwen2.5-coder:7b
ollama pull qwen3-coder:7b
ollama pull qwen3:4b
ollama pull qwen3:8b
```

Daha geniş konsey istersen (her biri Ayrı indir; toplam ~120 GB — 3080 Ti 12 GB için gerekmez):

```powershell
ollama pull qwen3:14b; ollama pull qwen3-coder:14b; ollama pull qwen3-coder:30b-a3b
ollama pull deepseek-r1:8b; ollama pull deepseek-r1:14b
ollama pull deepseek-coder-v2:lite; ollama pull deepseek-coder-v2:16b
ollama pull starcoder2:7b; ollama pull starcoder2:15b
ollama pull granite-code:8b; ollama pull opencoder:8b; ollama pull olympiccoder:7b
ollama pull codegemma:7b; ollama pull codestral:7b; ollama pull phi4:14b
ollama pull yi-coder:9b; ollama pull aya-expanse:8b; ollama pull command-r7b:latest
ollama pull devstral:24b; ollama pull cogito:14b
```

### Seçenek E — Bulut modeller (0-API, Ollama hesabınla · opsiyonel)

Araştırma botu ve Kayserili koç gibi bazı botlar isteğe bağlı olarak bulut modellerini kullanabilir (başka site/anahtar yok). Ollama aboneliğin varsa:

```powershell
ollama pull kimi-k3.1-pro:cloud
ollama pull glm-5.3-flash:cloud
ollama pull deepseek-v4.1-flash:cloud
```

Yoksa uygulama tamamen yerel modellerle çalışmaya devam eder; hiçbir şey indirmene gerek yoktur.

### Seçenek F — Harici Qwen Code CLI (opsiyonel)

```powershell
npm.cmd install -g @qwen-code/qwen-code
qwen --version
```

Kuruluysa **Soru stüdyosu → JARVIS & Qwen Code → Qwen Code Motoru** kısmından `Qwen Code CLI` seçebilirsin (kurulu değilse sistem otomatik olarak Ollama'daki Qwen Coder modelini kullanır).

### Seçenek G — Yerel eğitim (isteğe bağlı) için taban modeller

Bunları Ollama değil **Hugging Face**'ten indirir (eğitim adımlarında otomatik iner): `Qwen/Qwen3-8B`, `Qwen/Qwen2.5-7B-Instruct`, `Qwen/Qwen3-4B`, `google/gemma-3-4b-it`, `Qwen/Qwen2.5-3B-Instruct`. Ayrıntılar 13-18. adımlarda.

### Kurulumu doğrula

```powershell
ollama list
```

Listede indirdiğin modeller görünmeli. Uygulama açılışında **Durumu yenile**'ye veya hiçbir şeye basmadan bekledikten sonra modellerin otomatik atandığını göreceksin.

> **Not:** Tek bir model bile indirsen (örneğin sadece `qwen3:8b`) uygulama açılışta durmaz; üretici ve iki hakem rolünü o modele verir ve stüdyoda "bağımsız ikinci hakem yok" uyarısı gösterir. Gerçek bağımsız denetim için **farklı aileden ikinci bir model** (`gemma3:4b`) kurman yeterlidir; uygulama onu kendiliğinden 2. hakem yapar. Kadro seçimi her zaman kurulu modellere göre yapılır: kurulu olmayan bir model yüzünden üretim beklemez.

### 4.1 Hız ve süre ayarları (soru üretimi neden duruyordu, şimdi nasıl çalışıyor)

Önceki sürümde stüdyo saatlerce açık kalsa bile **tek soru üretmeyebiliyordu**. Sebep model kalitesi değil, çağrı düzeniydi:

| Eski davranış | Sonuç | Şimdi |
| --- | --- | --- |
| Soru başına **25 sn mutlak tavan** (üretici + 2 hakem + kuyruk bekleme dahil) | Gerçek ekran kartında bir soru 30–90 sn sürer; her deneme çöpe gidiyordu | Tavan **model çağrısı başına** uygulanır (varsayılan 120 sn, 5 sn–15 dk arası ayarlanır). Model yüklenmesi bu süreye sayılmaz |
| `keep_alive=0` | Model **her çağrıdan sonra** VRAM'den atılıp yeniden yükleniyordu | Model 30 dk bellekte kalır (`TEMPO_OLLAMA_KEEP_ALIVE`) |
| `num_ctx` her çağrıda prompt uzunluğuna göre değişiyordu | Ollama bağlam boyutu değişince modeli **yeniden yükler** | `num_ctx` sabittir (4096, `TEMPO_NUM_CTX`); model bir kez yüklenir |
| 13.000 karakterlik üretici promptu | Bağlam penceresine sığmayan kısım sessizce kesiliyordu | Prompt bağlam bütçesine göre kurulur; kaynak metin her zaman tam ve en sonda yer alır |
| 4 paralel hat + iki hakem aynı anda | Ollama model başına tek istek işlediği için yalnızca kuyruk uzuyordu | Varsayılan 2 hat; modeller VRAM'e birlikte sığmıyorsa otomatik **dalga düzeni** (aşağıda) |
| Rol modeli kurulu değilse üretim **sessizce** bekliyordu | Ekranda hiçbir açıklama yoktu | Kadro kurulu modellerden otomatik seçilir; engel varsa stüdyoda ve terminalde nedeni yazar |
| Küçük biçim hataları (cevap "B", şık "A) …", kanıtta bir kelime farkı) | Doğru soru reddediliyordu | Model çağrısı yapmadan onarılır; içerik kontrolleri aynen korunur |

**Model kadrosu otomatik seçilir.** Uygulama `ollama list` çıktısına ve ekran kartı belleğine bakar; üretici ve 1. hakem için kurulu en yetenekli genel amaçlı modeli, 2. hakem için **farklı aileden** ve onunla birlikte VRAM'e sığan modeli seçer. Kod, embedding ve görüntü modelleri soru yazımında kullanılmaz. Stüdyodaki **Model kadrosu** kutusundan profili (`Hızlı` / `Dengeli` / `Kalite`) değiştirebilir, bir rolü elle sabitleyebilir (📌) ya da **Otomatik seçime dön** diyebilirsin.

12 GB ekran kartı (RTX 3080 Ti) için önerilen ve test edilen kadro:

```powershell
ollama pull qwen3:8b
ollama pull gemma3:4b
```

İkisi birlikte yaklaşık 10 GB VRAM kullanır ve hiç model takası yapılmaz. Daha büyük tek bir model (ör. 14B) üretimi yavaşlatır ve ikinci hakemle birlikte belleğe sığmaz; 12 GB'ta önerilmez.

**Boşa giden işi kesen hız kuralları (kalite kuralları aynı).** Her soru yine iki bağımsız hakemden, kaynak ve tek doğru cevap denetimlerinden geçer; değişen yalnızca sonucu artık değiştiremeyecek işin yapılmamasıdır:

- **Sorular arasında bekleme yok.** Bir soru bittiği anda sıradaki başlar (eskiden başlatmalar arasında 2 sn ve 0,2 sn'lik yoklama vardı).
- **Boştaki model öne alınır.** Üretici model yazarken 2. hakemin küçük modeli boş durmaz; kendi işini hemen alır.
- **Biri reddettiyse diğer hakem beklenmez.** Soru iki onay olmadan alınmadığı için bir hakem reddedince diğerinin çağrısı iptal edilir (sıradaysa hiç başlamaz).
- **Tekrar soru yarıda kesilir.** Üretici soru kökünü yazar yazmaz kök havuzla karşılaştırılır; kök zaten kayıtlı bir soruyla aynıysa (ya da aynı ünitede %78 ve üzeri benziyorsa) şıkların ve açıklamanın yazılması beklenmez. Karar kuralı, tam taslağa uygulananla aynıdır.

Ölçmek için: `npm run bench` (simülatörle; `BENCH_REJECT=0.3`, `BENCH_DUP=0.3`, `BENCH_VRAM=10` seçenekleri dosyanın başında anlatılır). Simülatör sayıları ekran kartı hızı değildir; düzenleyicinin ne kadar zaman kaybettirdiğini gösterir.

**Modeller bellekte birlikte kalamıyorsa: dalga düzeni (ayar gerekmez).** Tarayıcı, oyun ya da başka bir program ekran kartı belleğini kullanıyorsa (veya Ollama aynı anda tek model tutacak şekilde ayarlıysa) üretici ile 2. hakem birbirini bellekten atar ve her model değişimi 5–10 sn'lik bir yeniden yükleme demektir. Uygulama bunu Ollama'nın bildirdiği yükleme sürelerinden **kendisi anlar** ve dalga düzenine geçer:

- 4 soru birlikte hazırlanır (`TEMPO_SWAP_WAVE`): önce dördü de yazılır ve 1. hakemden geçer, sonra 2. hakem dördüne birlikte bakar.
- Model soru başına iki kez değil, **dalga başına bir kez** değişir; iki farklı model aynı anda Ollama'ya gönderilmez.
- Her soru yine iki hakemden geçer; kalite kuralları aynıdır.
- Bellek boşalıp modeller yeniden birlikte kalabildiğinde uygulama kendiliğinden normal düzene döner.

Stüdyoda bu durum uyarı olarak değil, “🌊 Dalga düzeni” bilgisi olarak görünür; yapman gereken bir şey yoktur.

**Ollama ayarları kendiliğinden yapılır.** `npm run dev` (ve `baslat.bat`) her açılışta `scripts/ensure-ollama.mjs` betiğini çalıştırır; elle `setx` yazman ya da Ollama'yı yeniden başlatman gerekmez:

| Durum | Betiğin yaptığı |
| --- | --- |
| `OLLAMA_MAX_LOADED_MODELS` `1` yapılmış | `2` olarak kaydeder (üretici ile 2. hakem birbirini bellekten atmasın) |
| `OLLAMA_NUM_PARALLEL` `1` değil ya da hiç ayarlanmamış | `1` olarak kaydeder (bağlam belleği katlanıp VRAM'i taşırmasın) |
| Yukarıdakilerden biri değişti ve Ollama çalışıyor | Ollama'yı **bir kez** yeniden başlatır; sonraki açılışlarda dokunmaz |
| Ollama çalışmıyor | Doğru ayarlarla arka planda başlatır |
| Soru yazabilecek hiç model yok | `qwen3:8b` ve `gemma3:4b` modellerini indirir |

Ayarlar doğruysa betik hiçbir şeyi değiştirmez ve bir saniyeden kısa sürer. Bu davranışı kapatmak için `TEMPO_MANAGE_OLLAMA=0`, yalnızca model indirmeyi kapatmak için `TEMPO_AUTO_PULL=0` kullan. Uzak bir Ollama adresi (`OLLAMA_BASE_URL`) kullanıyorsan betik devreye girmez.

> Betik Ollama'yı yeniden başlattığında sistem tepsisindeki Ollama simgesi kaybolabilir; Ollama arka planda çalışmaya devam eder ve bilgisayarı yeniden başlattığında simge geri gelir.

**Üretimi izlemek.** `npm run dev` terminalinde artık her soru için bir satır görürsün:

```
[tempo] Model kadrosu: üretici=qwen3:8b · 1. hakem=qwen3:8b · 2. hakem=gemma3:4b · bağlam=4096 · bellekte tutma=30m
[tempo] ✓ 2-3 onaylandı (orta, 41.2 sn) — Antrenman yükünün temel bileşenleri…
[tempo] ✗ 0-1 altyapı hatası (model_timeout): qwen3:8b 120 sn içinde yanıtı tamamlayamadı…
```

Stüdyoda **Son onaylanan soru**, **Deneme / zaman aşımı / altyapı hatası** sayaçları ve **Son olaylar** listesi aynı bilgiyi verir. Reddedilen soruları da terminalde görmek için `TEMPO_VERBOSE=1`, hiç satır istemiyorsan `TEMPO_QUIET=1` kullan.

Ortam değişkenleriyle ince ayar:

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `OLLAMA_MODEL` | otomatik | Üretici modeli sabitler (boşsa kurulu modellerden seçilir) |
| `OLLAMA_VERIFIER_MODEL` | otomatik | 1. hakem modelini sabitler |
| `OLLAMA_JUDGE2_MODEL` | otomatik | 2. hakem modelini sabitler |
| `TEMPO_LINEUP_PROFILE` | `dengeli` | Otomatik kadro profili: `hizli`, `dengeli`, `kalite` |
| `TEMPO_VRAM_GB` | algılanır | Ekran kartı belleği (GB); algılanamazsa 12 kabul edilir |
| `OLLAMA_AUTO_TIMEOUT_MS` | `120000` | **Tek model çağrısının** süre tavanı (5000–900000 ms). Stüdyodan saniye olarak da ayarlanır |
| `TEMPO_FIRST_TOKEN_TIMEOUT_MS` | `300000` | Model yüklenmesi dahil ilk yanıt parçası için beklenen en uzun süre |
| `TEMPO_NUM_CTX` | `4096` | Sabit bağlam penceresi (token). Büyütmek VRAM kullanımını artırır |
| `TEMPO_OLLAMA_KEEP_ALIVE` | `30m` | Modelin çağrılar arasında bellekte tutulma süresi |
| `TEMPO_AUTO_CONCURRENCY` | `2` | Aynı anda hazırlanan soru sayısı (1–8) |
| `TEMPO_QUESTION_INTERVAL_MS` | boş | Boşken: sağlıklı akışta sorular arasında beklenmez; yalnızca model çağrısı yapamadan anında düşen denemelerden sonra 2 sn beklenir. Sayı verilirse her soru başlatması arasında o kadar ms beklenir (bilinçli yavaşlatma) |
| `TEMPO_EARLY_STOP` | `1` | `0`: kökü tekrar olan taslağın yazımını yarıda kesme özelliğini kapatır |
| `TEMPO_SWAP_WAVE` | `4` | Dalga düzeninde birlikte hazırlanan soru sayısı (1–8). Modeller bellekte birlikte kalabiliyorsa kullanılmaz |
| `TEMPO_SWAP_MODE` | açık | `0` yapılırsa dalga düzeni kapatılır (modeller sığmıyorsa tek hat, sırayla) |
| `TEMPO_DISABLE_AUTOLOOP` | `0` | `1` yapılınca arka plan soru üretimi hiç başlamaz |
| `TEMPO_PARAGRAPH_QUESTION_RATIO` | `0.12` | Paragraf (parçaya dayalı) soruların sıklığı; `0` yapılınca hiç üretilmez |
| `TEMPO_VERBOSE` / `TEMPO_QUIET` | `0` | Terminal günlüğünü ayrıntılandırır / kapatır |
| `TEMPO_MANAGE_OLLAMA` | `1` | `0` yapılınca açılışta Ollama ayarlarına ve sürecine dokunulmaz |
| `TEMPO_AUTO_PULL` | `1` | `0` yapılınca eksik model kendiliğinden indirilmez |
| `TEMPO_PLAN` | `1` | Sıralı üretim planı (aşağıda §4.1.1). `0` yapılınca eski dengeli dolaşıma dönülür |
| `TEMPO_PLAN_QUOTA` | `50` | Bir turda her bölüme yazılacak soru sayısı |
| `TEMPO_PLAN_PASSES` | `40` | Tur sayısı (1–200; varsayılan havuz sınırıyla 50'lik kotada en çok 42). 1. tur dengeli, sonraki turlarda kolay azalır |
| `TEMPO_POOL_CAPACITY` | `65000` | Onaylı soru havuzunun üst sınırı (5.000–200.000). Plan toplamı bu sınırın %95'ini geçemez; daha çok tur istiyorsan önce bunu büyüt |
| `TEMPO_EXAM_STYLE` | `1` | `0` yapılınca soru yazan modele "sınav tarzı örneği" (gönderdiğin örnek / çıkmış sorular ve kitap soruları) gösterilmez |
| `TEMPO_WEB_SUMMARY` | `1` | `0` yapılınca internetten derlenen ek anlatım ve ders notları (benzersor notları, gönderdiğin görseller, video özeti) kullanılmaz; sorular yalnızca kitap cümlelerinden kurulur |
| `TEMPO_PLAN_STUCK_LIMIT` | `25` | Bir adımda üst üste bu kadar deneme soru çıkarmazsa adım atlanır |
| `TEMPO_SUMMARY_WINDOW_CHARS` | `2400` | İsteme konan özet bölümünün uzunluğu (1200–6000). Özetin tamamı değil, odak/kanıt cümlesinin çevresi verilir |

**Sorun giderme**

| Stüdyoda / terminalde görülen | Anlamı ve çözüm |
| --- | --- |
| "Ollama'ya ulaşılamıyor" | Ollama çalışmıyor. `ollama serve` ya da Ollama uygulamasını aç; uygulama kendiliğinden yeniden bağlanır |
| "Ollama'da kurulu model yok" | Yukarıdaki iki `ollama pull` komutunu çalıştır |
| `model_timeout` sık tekrarlanıyor | Model ekran kartına sığmayıp işlemciye taşıyor olabilir: `ollama ps` çıktısında `100% GPU` yazmalı. Yazmıyorsa daha küçük kadro seç (`Hızlı` profil) ya da süre tavanını yükselt |
| “🌊 Dalga düzeni” yazıyor | Modeller ekran kartı belleğinde birlikte kalamıyor; uygulama soruları gruplar hâlinde hazırlayıp modeli dalga başına bir kez değiştiriyor. Yapılacak bir şey yok. Daha hızlı üretim için belleği kullanan diğer programları (oyun, tarayıcıdaki video) kapatabilir ya da **Hızlı** profile (tek model) geçebilirsin |
| Onay oranı çok düşük | Terminalde `TEMPO_VERBOSE=1` ile ret gerekçelerine bak; stüdyodaki **Reddedilenler** sekmesi hakem gerekçelerini gösterir |

### 4.1.1 Üretim planı: sorular hangi sırayla gelir?

Otomatik üretim rastgele dolaşmaz; sabit bir plan izler. Kitapların **bölümleri ve konu başlıkları her kitabın "İçindekiler" sayfalarından** (PDF'in 5–7. sayfaları) alınır: 5 kitap, 29 bölüm, 436 konu ve alt konu başlığı (gövdede geçen 276 ara başlıkla birlikte 712). 1. kitabın 1. bölümünden başlanır, her bölüme **50 soru** yazılır ve sıradaki bölüme geçilir; 29 bölüm bitince tur biter.

**Zorluk karışımı tura göre değişir.** 1. turda her bölümde kolay, orta ve zor eşittir; sonraki turlarda kolay giderek azalır, 6. turdan sonra hiç kolay yazılmaz; kalan sorular yarı yarıya orta ve zordur.

| Tur | Bölüm başına 50 soru | Tur sonunda bölüm başına toplam (kolay / orta / zor) |
|---|---|---|
| 1. tur | 17 kolay + 17 orta + 16 zor | 17 / 17 / 16 |
| 2. tur | 10 kolay + 20 orta + 20 zor | 27 / 37 / 36 |
| 3. tur | 6 kolay + 22 orta + 22 zor | 33 / 59 / 58 |
| 4. tur | 4 kolay + 23 orta + 23 zor | **37 / 82 / 81** |

Varsayılan hedef, kitapta listelenen 29 ünitenin her biri için **200 soru**: 4 tur × 50 soru; toplam **5.800 soru**. Planın sırası, tur başına soru dağılımı ve diğer çalışma kuralları PR #18’deki sistemle aynıdır. Önceden onaylanmış sorular silinmez; mevcut sayılar hedefe sayılır. Hedefe ulaşan ünite için yeni plan sorusu üretilmez. `TEMPO_PLAN_QUOTA` ve `TEMPO_PLAN_PASSES` ile özel ayarlar yapılabilir; toplam hedef havuz kapasitesinin %95’ini aşmaz.

> **Süre:** Dakikada 1 onaylı soruyla sıfırdan 5.800 soruya ulaşmak yaklaşık 4 gün kesintisiz çalışma gerektirir. Üretimi istediğin an durdurabilirsin.


- **İki bölüm aynı anda, yarım bırakmadan:** Bölümler "Aynı anda hazırlanan soru" ayarı kadar (varsayılan 2) gruplar hâlinde işlenir: 1. ve 2. bölüm birlikte başlar. Biri o turdaki 50 sorusuna ulaşınca boşalan hat 3. bölüme geçmez, **eksik kalan bölüme yardım eder**; ikisi de dolunca 3. ve 4. bölüm başlar. Ayarı 1 yaparsan bölümler teker teker dolar. Modeller ekran kartına birlikte sığmıyorsa kendiliğinden tek hatta inilir.
- **Kota kesindir:** hiçbir bölüm bir zorlukta plandaki toplamı (37 / 82 / 81) aşmaz; iki hat aynı bölümde çalışırken bile fazladan soru kaydedilmez.
- **Sorular kitabın sayfalarından ve konu başlıklarından kurulur.** Her soruda bölüm anlatımının en az soru sorulmuş cümlesi odak olarak verilir; odaklar bölümün sayfalarına ve konularına yayılarak seçilir. Kanıt cümlesi bölüm anlatımında geçmeyen soru reddedilir. **Soru kartında sorunun konu başlığı ve kitap sayfası yazar** (ör. "Antrenmanla İlgili Temel Kavramlar › Performans · kitap s. 12"); modele verilen istemde de konu başlığı bulunur.
- **Anlatım kitaptan derlenir.** Elle yazılmış kısa özete kitap PDF'lerinin o bölüme ait sayfalarından **birebir alınmış** tanım, sınıflama, ilke, açıklama ve örnek cümleleri eklenir (toplam 6.104 kitap cümlesi; bölüm başına hedef 600). Her cümlenin hangi konu başlığının altında geçtiği kayıtlıdır (`src/bookSummary.json`, başlıklar `src/bookToc.json`). Kitabın kendi test sayfaları ve cevap anahtarları alınmaz. Gövde metni az olan bölümler hedefin çok altındadır: *Ölçme ve değerlendirme (0-6)* 67, *Dopingle mücadele* 97, *Beceri öğrenimi* 115 cümle; en uzunu *Egzersiz fizyolojisi* 547 cümledir. Bütün bölümlerde (ek anlatımlarla birlikte) toplam 7.158 cümle vardır.
- **İnternetten derlenen ek anlatım.** Her bölüme, konusuyla ilgili Türkçe kaynaklardan (federasyon ve bakanlık yayınları, üniversite ders notları, TÜBİTAK Ansiklopedi vb.) derlenmiş ek cümleler eklenir: 121 grupta 714 cümle (`src/webSummary.json`). Cümleler kaynaktan kopyalanmamış, kaynağın anlattığı bilgi yeniden yazılmıştır; her grubun kaynak adresi kayıtlıdır. Bu cümlelere dayanan soruda kitap sayfası yerine **"internet kaynağı"** bağlantısı görünür. Kitap dışı bilgi istemiyorsan `TEMPO_WEB_SUMMARY=0` ile kapat. Yeni kaynak eklemek için dosyaya `{ "topic", "sourceTitle", "source", "sentences": [...] }` grubu ekleyip `npm run contexts` çalıştır.
- **Ders notları, görseller ve video özeti.** Aynı dosyada üç ek kaynak daha vardır; hepsi kendi cümlelerimizle yazılmış ve **kendi bölümüne** yerleştirilmiştir:
  - *benzersor "Antrenörlük 1. Kademe Ders Notları 2026"* (konu 1.1–5.9, tamamı): temel kavramlar, antrenman ilkeleri, yüklenme ve süperkompensasyon, kuvvet, sürat, dayanıklılık, esneklik, koordinasyon, planlama, yetenek seçimi, anatomi, hücre ve dokular, iskelet, kas, dolaşım-solunum, sinir sistemi ve homeostazis, enerji metabolizması, beslenme, yaralanmalar, doping, öğrenme-öğretme, bilişsel gelişim, motor gelişim dönemleri, temel hareket becerileri, öğretim yöntemleri, iletişim ve geri bildirim, pedagojik ilkeler, ölçme-değerlendirme, motivasyon, kaygı ve stres, hedef belirleme, zihinsel antrenman, etik ve fair play, sporun toplumsal işlevleri, şiddet ve holiganizm, çocuk koruma ve istismar, olimpizm, Türk spor teşkilatı, federasyonlar ve IOC, yönetim fonksiyonları, liderlik tarzları, iletişim, antrenör eğitim zinciri, spor hukuku ve disiplin, pazarlama ve sponsorluk, tesis ve organizasyon. Bu sorularda "internet kaynağı" bağlantısı görünür.
  - *Gönderilen ders notu görselleri* (Hareket 1. ünite slaytları ve "en önemli konular" listeleri): spor tanımları, LTAD aşamaları ve yaş aralıkları, DMSP evreleri, sürantrenmanın etkileri ve önlenmesi, kas lifi tipleri, VO₂max, RICE, geri bildirim türleri, transfer, öğretim yöntemleri, atıf kuramı. Bu gruplar `"kind": "ders-notu"` taşır, adresleri yoktur; soru kartında **"ders notu: …"** yazar.
  - *Video özeti* (1. Kademe Temel Antrenörlük Eğitimi): antrenman ilkeleri, biyomotor sınıflamalar, koordinatif yetenekler, birim antrenmanın dört bölümü, yetenek ve yaş kavramları.
  - "En önemli konular" listesindeki bazı başlıklar (atıf kuramı, komut yöntemi, grup bütünlüğü, 220 − yaş, öğrenmenin transferi) 1. kademe kitaplarında geçmez; bunlar genel alan bilgisinden kısa cümlelerle yazıldı. **Kitapla ya da kendi notlarınla karşılaştırıp yanlış bulduğun cümleyi dosyadan sil**, ardından `npm run contexts`.
- **Sınav tarzı örnekleri ("bu sınavda sorular nasıl soruluyor").** Soru yazan modele her üretimde seçilen soru tipine uyan bir örnek gösterilir; yalnızca biçimini örnek alması, bilgiyi konu anlatımından alması ve örneği kopyalamaması istenir. Kitaplık; `src/examSamples.json` içindeki kaynaklı/kullanıcı örneklerini, `server/user-exam-examples.json` içindeki kullanıcının paylaştığı 100 antrenman bilimi soru kökü-cevap örneğini ve kitapların kendi "Neler Öğrendik?" sorularını içerir. Kullanıcının güvenilir olarak belirttiği 100 örnek konu bölümlerine eşleştirilir ve aynı bölümde soru üretirken cevapları içerik referansı olarak kullanılır; başka bölümde yalnızca biçim örneğidir. Örnek soru kopyalanmaz; kolayda doğrudan, ortada ilişkilendirme/karşılaştırma, zorda uygulama/çok adımlı akıl yürütme biçimine uyarlanır. Kitap temelli kanıt ve tek-doğru kalite kapıları korunur; örnekler sabit soru bankasına otomatik eklenmez. Sorular kök kalıbına göre ailelere ayrılır (`server/exam-style.mjs`): uzun tanım → terim, durum → kavram, olumsuz kök, sayı / yaş aralığı, boşluk doldurma, kısa ve net. Önce uygun örnek aynı bölümden, yoksa aynı kitaptan, o da yoksa başka kitaptan seçilir; örnekler döndürülür. Kapatmak için `TEMPO_EXAM_STYLE=0`.
  - **Kaynaklı yeni örnek eklemek:** `src/examSamples.json` içine `{ "id", "unitId", "origin", "style", "question", "options5", "options", "answer", "explanation" }` ekle, `npm run contexts` çalıştır. Bu yoldan eklenen doğrulanmış örnekler sabit soru bankasına ve stil kitaplığına girer. Güvenilir kullanıcı örneği eklemek için `server/user-exam-examples.json` dosyasına `id`, `unitId`, `question`, `answer` alanları ekle; aynı bölümde cevap içerik referansı, başka bölümlerde soru biçimi örneği olur ve kayıtlar Test merkezi soru bankasına yazılmaz. Uygulama sınavdaki gibi **beş şıkla (A–E)** çalışır.
  - Gönderdiğin sorular şu bölümlere kondu: *denge tanımı* → Koordinatif özellikler; *baskın enerji sistemi* → Spor fizyolojisi; *2024 çıkmış soru (teknik antrenman)* → Antrenmanı oluşturan ögeler. Çıkmış sorunun cevap anahtarı gönderilmedi; cevap kitaba göre **Fiziksel antrenman** olarak işaretlendi (`answerVerified: false`). Yalnızca açıklaması gönderilen üç sorunun (atıf kuramı, geri bildirim, örgütleme) kökü açıklamadan **yeniden yazıldı** (`reconstructed: true`).
- **Aynı bilgi, farklı soru biçimi.** Bir cümleden daha önce soru yazıldıysa bu kez **kullanılmamış bir soru tipi ve açısı** seçilir; modele o cümleden yazılmış önceki soru kökleri gösterilir ve "aynı bilgiyi başka biçimde sor" denir. Soru tipleri: kavram, vaka, karşılaştırma, neden-sonuç, istisna, uygulama, en iyi seçim, **tanımdan terim, boşluk doldurma, doğru yargı, ilginç bilgi, durumdan kavrama ("hangisi baskındır / önceliklidir"), kısa ve net (çıkmış soru tarzı)** ve paragraf. Tipi farklı olan iki soru aynı cevabı paylaşabilir; kökü gerçekten benzeyen ya da şıklarının çoğu aynı olan soru yine reddedilir (§4.3).
- **Modele anlatımın tamamı değil ilgili bölümü gösterilir.** Bölüm anlatımı (8–68 bin karakter) modelin bağlam penceresine sığmaz; soru yazarına odak cümlenin, hakemlere kanıt cümlesinin çevresindeki ~2.400 karakterlik kesintisiz bölüm verilir (`TEMPO_SUMMARY_WINDOW_CHARS`). Kanıt denetimi ise anlatımın tamamına bakar.
- Hakemler bir soruyu hedeften farklı zorlukta bulursa (ör. kolay hedeflenmişken "orta") ve o bölümün o zorluktaki kotası dolmamışsa soru o zorlukla kaydedilir ve o zorluğun payına sayılır; kota doluysa reddedilir.
- **Bir bölümden istenen sayıda farklı soru çıkmayabilir** (özellikle cümlesi az olan bölümlerde: 67 cümleden 100 farklı soru beklenmemeli; turlar ilerledikçe "benzer soru zaten kayıtlı" retleri artar). Bir bölümün bir zorluğunda üst üste 25 deneme soru çıkarmazsa o zorluk **atlanır**; bölümün diğer zorlukları ve sıradaki bölümler sürer, atlananlar stüdyoda "Atlanan adımlar" olarak gösterilir ve diğer her şey bitince yeniden denenir. Atlananlar `.tempo-data/production-plan.json` dosyasında tutulur (silersen hepsi baştan denenir).
- **Anlatımı yeniden üretmek** (kitap PDF'i ya da seçim kuralları değiştiyse): `pip install pymupdf` ardından `npm run summary`. Betik (`scripts/build-book-summary.py`) içindekiler sayfalarını okur, başlıkları gövdede bulur ve yalnızca gövde yazı tipindeki paragrafları alır; tablo, şekil yazısı, kaynakça, etkinlik yönergesi, soru cümlesi ve başka cümleye gönderme yapan ("bu, bunlar…") cümleleri almaz. `python3 scripts/build-book-summary.py --check --toc` içindekilerden okunan başlıkları listeler.
- Daha önce üretilmiş onaylı sorular kotalara sayılır.
- **Onaylı sorular havuz bakımında toplu reddedilmez.** Eski sürümde arka plandaki "Otonom Kurul" bakımı, hakemlerin 1–5'lik kalite puanını 0–100'lük bir eşikle karşılaştırdığı için havuz 15 soruyu geçtikten sonra onaylı soruların 10'u dışında hepsini "reddedildi"ye çeviriyordu (plan da aynı bölümleri baştan dolduruyordu). Eşik artık hakem ölçeğindedir; bu hatayla reddedilmiş ve hâlâ kayıtlı olan sorular (reddedilenlerin son 250'si saklanır) ilk havuz bakımında, kotayı aşmamak koşuluyla yeniden onaylı yapılır.
- Stüdyodaki **Üretim planı** kutusu biten tur sayısını, sıradaki turların kolay / orta / zor karışımını, çalışılan bölümleri, her bölümün zorluk ilerlemesini ve bütün bölümlerdeki zorluk toplamlarını gösterir; terminalde `[tempo] Plan: …` satırları yazılır.


### 4.1.2 Şık sayısı: 4 ya da 5 (A–E)

Bir soru **4 ya da 5 şıklı** olabilir; 5 şık zorunlu değildir. Şık sayısı tek yerden yönetilir: `server/option-count.mjs` (`MIN_OPTION_COUNT = 4`, `OPTION_COUNT = 5`).

- **Yeni üretilen soru 4 ya da 5 şıklı olabilir.** Model hangisini yazarsa o kabul edilir; 3 ya da 6 şıklı taslak "biçim" hatasıyla geri çevrilir ve yeniden yazdırılır. Şıkların hepsi birbirinden farklı olmalıdır.
- **4 ve 5 şıklı sorular eşittir.** İkisi de üretim planına sayılır, tekrar denetimine girer ve Test merkezinde çözülür; 4 şıklı diye puanı kırılan, silinen ya da 5 şıkka çevrilmeye zorlanan soru yoktur. Önceki sürümle üretilmiş 4 şıklı soruların **plana yeniden sayılır**.
- Aynı sorunun yalnızca bir şık eklenmiş hâli yeni soru sayılmaz (tekrar olarak reddedilir).
- Uygulamayla gelen hazır içerik (sabit soru bankası, kitap soruları, benzer sorular, VKİ alıştırmaları) 5 şıklıdır. `GET /api/ollama/status` yanıtındaki `optionFormat` alanı havuzda kaç sorunun 4, kaç sorunun 5 şıklı olduğunu gösterir.
- **Joker** ("✂️ İki Şık Ele") iki yanlış şıkkı eler; geriye doğru cevapla birlikte iki ya da üç şık kalır.
- Sabit sorulardaki (357 soru) ve VKİ alıştırmalarındaki **beşinci şık sonradan eklendi**: her soruya, diğer şıklarla aynı kavram ailesinden bir yanlış seçenek yazıldı. Kitabın kendi "Neler Öğrendik?" sorularında (290) ve gönderdiğin örnek sorularda ise sınavdaki / kitaptaki asıl 5 şık kullanılır. Eklenen bir şıkkın yanlışlıkla ikinci doğru cevap olduğunu görürsen ilgili satırı `src/` altındaki soru dosyasında düzelt (biçim: `soru|doğru|yanlış1|yanlış2|yanlış3|yanlış4|açıklama`), ardından `npm run audit` ve `npm run contexts`.

### 4.2 Soru ve çeldirici kalitesi

Her soruda beş şık da **aynı kavram ailesinden**, birbirine yakın uzunlukta ve "az kalsın doğru" niteliğinde olur. Model bu kuralı her üretimde açıkça alır; ayrıca üç ayrı kapıdan geçer:

1. **Yerel psikometri denetimi:** alakasız/komik dolgu şık ("Tahkim kurulu", "Bürokrasi", "İhmal" gibi), "hepsi/hiçbiri" kalıpları, birbirinin kopyası ya da birbirini kapsayan şıklar, cevabı ele veren uzun/kısa şık, kök sızıntısı ve şık uzunluk asimetrisi otomatik olarak reddedilir.
2. **İki bağımsız hakem:** her iki hakem de şıkların aynı kavram ailesinden ve makul olduğunu onaylamazsa (`distractorPlausible`) soru kaydedilmez.
3. **Öz-düzeltme:** şık kalitesi yüzünden elenen taslak çöpe gitmez; modele eleştiri geri beslenip şıklar aynı kavram ailesinden yeniden yazdırılır (tur başına bir deneme).

Soru tipleri arasında klasik çeldirici kalıpları da vardır: *hangisi yanlıştır/söylenemez*, *hangisi ... dışında kalır*, *en uygun/en kapsamlı yaklaşım hangisidir* (`en_iyi_secim`); bu kalıplarda beş şık da makul görünür, yalnızca biri tam doğrudur.

### 4.3 Birbirinin aynısı / tıpatıp benzeri soru olmasın

Havuzda iki soru asla aynı kalıbın tekrarı olmasın diye üç katman çalışır:

1. **Üretim öncesi (prompt):** modele son 18 sorunun kökü, son 16 doğru cevap ve son çeldiriciler verilir; "bunlara benzer bir soru kurma" kuralı açıkça yazılır. Ek olarak **kavram kapsama yönlendirmesi** yapılır: ünitenin kitap anahtar kavramlarından hangilerinin az sorulduğu hesaplanır ve model o turda az işlenmiş kavrama yönlendirilir, yeterince sorulmuş kavramlardan kaçınması istenir.
2. **Üretim sonrası (sıkı tekrar kapısı):** yeni taslak; soru kökü benzerliği, **şık takımı örtüşmesi** ve **doğru cevap** birlikte değerlendirilerek havuzdaki ve kitap bankasındaki tüm sorularla karşılaştırılır. Aynı soru, kökü %78'in üzerinde benzer olan soru, **beş şıkkı da aynı olan** soru, aynı cevabı paylaşıp kökü %62'nin üzerinde örtüşen soru, aynı cevabı ve şıklarının çoğunu paylaşan soru reddedilir. **Aynı bilginin farklı biçimde sorulmasına izin vardır:** iki sorunun tipi farklıysa (ör. biri tanım, diğeri vaka ya da boşluk doldurma) aynı cevap tek başına tekrar sayılmaz; bu durumda ret için kökün %70'in üzerinde benzemesi ya da beş şıktan dördünün aynı olması gerekir. Böylece yalnızca kökü/birkaç sözcüğü değiştirilmiş "aynı sorunun kopyası" havuza giremez.
3. **Havuz botu (sürekli ayıklama):** `PoolCuratorBot` her taramada yakın tekrarları siler; benzerlik yalnızca köke değil, şık takımına ve doğru cevaba da bakılarak ölçülür (aynı cevabı paylaşan sorularda eşik daha esnektir).
4. **Kitabın kendi soruları da havuza dahil:** tekrar karşılaştırması artık yalnızca üretilen havuza ve sabit bankaya değil, kitapların kendi resmî "Neler Öğrendik?" sorularına karşı da yapılır. Yani yapay zekâ, kitaptaki bir sorunun kopyasını üretemez.

Sabit soru bankasının kendisi de temiz: `npm run contexts` çalıştırıldığında banka yeniden kurulurken aynı kalıptan en fazla 2 soru bırakılır, kök benzerliği yüksek ve aynı cevabı paylaşan tekrarlar ayıklanır. Bu temizlik, ünitedeki 100 adet "X kg ve Y m için VKİ kaçtır?" sorusunu da **farklı kalıplarda (değer bulma, sınıf belirleme, aralık seçme, ters hesaplama) ve farklı vücut ağırlığı sınıflarını kapsayan 18 alıştırmaya** indirger.

### 4.4 Paragraf (parçaya dayalı) sorular

Sınavda uzun köklü/parçaya dayalı soru çıkma ihtimaline karşı havuza seyrek olarak **paragraf soruları** da girer (varsayılan: her ~8 soruda bir, `TEMPO_PARAGRAPH_QUESTION_RATIO` ile ayarlanır, `0` yapılınca kapanır):

- Paragraf, konu anlatımından **birebir (kelimesi kelimesine)** alınır; cümlelerin en az %70'i kaynakta aynen geçmek zorundadır, aksi hâlde soru reddedilir. Yani paragraf uydurma değil, kitabın kendi metnidir.
- Soru kökü parçaya gönderme yapar ("Bu parçaya göre ...", "Parçada vurgulanan ...", "Bu parçadan hangi yargıya ulaşılabilir?") ve parça okunmadan yanıtlanamaz.
- Bütün şıklar parçayla ilişkilidir: doğru şık parçadaki bilginin doğru yorumu, çeldiriciler parçada geçmeyen ama ünitenin başka yerlerinde duran ifadelerdir.
- Test ekranında ve AI stüdyosunda paragraf alıntı bloğu olarak gösterilir; soru tipi etiketi **Paragraf (Parçaya Dayalı)**'dır.

**Not:** Antrenörlük Temel Eğitimi sınavının resmî soruları paylaşılmadığı için paragraf tipinin sınavda çıkıp çıkmadığı kamuya açık kaynaklardan doğrulanamaz; bu yüzden bu tip varsayılan olarak seyrek üretilir ve tek tıkla kapatılabilir.

### 4.5 Kitaptan üretim: resmî kitap soruları, paralelleri ve kaynak sınırı

**1) Kitabın kendi soruları birebir havuzda.** 5 resmî ders kitabının her ünitesinin sonundaki "Neler Öğrendik?" değerlendirme soruları PDF'lerden otomatik çıkarılır:

```powershell
npm run books:questions   # -> server/book-style-questions.json  (29 ünite x 10 = 290 soru)
```

Her soruda kitabın kendi 5 şıkkı, doğru cevap harfi ve "yanlışsa şu konuyu tekrar oku" ipucu bulunur. Test merkezindeki **Kitaptan "Neler Öğrendik?" + TVGFBF** sınavı ve karma testler bu soruları kullanır.

**2) Aynı bilgiyi ölçen "kitap paraleli" sorular.** Kitap sorusunu ezberlemek yetmesin diye, her kitap sorusundan **aynı kavramı ve kitabın kendi çeldiricilerini kullanan, ama kökü yeniden yazılmış** bir paralel soru üretilir:

```powershell
npm run parallels         # -> server/book-parallel-questions.json (259 paralel)
```

Yeniden yazım kuralları (`server/book-parallel-engine.mjs`): olumsuz kökler anlamı koruyarak yeniden kurulur ("... değildir?" → "... kapsamında yer almaz?"), kalıp ve eş anlamlı sözcük değişimi yapılır, şık sırası karıştırılır. Üretilen paralel, kaynak sorunun **kopyası olamaz**; ayrıca aynı testte hem kitap sorusu hem onun paraleli çıkmaz.

**3) Üretim kitabı okuyarak yapılır.** Üretici modele her turda, o ünitenin gerçek kitap pasajı (sayfa numarası ve alt bölüm başlığıyla) verilir; ayrıca prompt'ta **KİTAP SORUSU ÖRNEĞİ** bloğu yer alır: ünitenin en az işlenmiş resmî kitap sorusu gösterilip "aynısını yazma ama aynı kavram ailesinden, aynı sınav tadında kur" denir.

**4) Konu anlatım özetlerinde olmayan hiçbir şey sorulmaz (kaynak temellendirme).** `server/summary-grounding.mjs`, her soruyu iki kaynağa göre ölçer:

| Kaynak | Dosya |
|---|---|
| Konu anlatım özeti | `server/contexts.json` (ünite anlatımı + genişletmeler + kitap notları) |
| Kitabın o ünitesindeki gerçek pasajlar | `server/book-passages.json` |

Puan = `0.4 x doğru cevabın kapsanması + 0.6 x soru kökünün kapsanması`. Eşik **%55** (`TEMPO_SUMMARY_GROUNDING_MIN` ile değiştirilebilir).

- **Yapay zekâ üretiminde sert kapı:** eşiğin altında kalan taslak doğrudan reddedilir ("Soru konu anlatım özetinde ve kitap pasajlarında yeterince karşılığı olmayan kavramlar içeriyor..."). Alakasız/uydurma deneme soruları ölçekte 0.00–0.52 alır, yani tamamı elenir.
- **Hazır havuzda etiketleme:** statik banka, kitap soruları ve paraleller de puanlanır (`npm run contexts` + `npm run parallels`), `src/groundingIndex.json` dosyasına yazılır.
- **Test merkezinde tek anahtar:** "**Konu anlatım özetlerimde olmayan soru çıkmasın**" anahtarı açıkken (varsayılan) kaynak dışı işaretlenen sorular hiçbir teste girmez. Şu anda 894 sorudan yalnızca **8'i** kaynak dışıdır (günlük Türkçeyle yazılmış senaryo soruları); anahtarı kapatırsan bunlar da gelir.
- Paragraf sorularında parçanın kendisi de ölçüme katılır (zaten kaynaktan birebir alındığı için).

### 4.6 Yanlış yaptığın soru değiştirilerek, rastgele tekrar karşına çıkar

Hata defterine düşen soru bir daha **birebir** sorulmaz; `src/questionVariants.ts` onu yeniden yazar:

- **Aynı bilgi, farklı lafız:** doğru cevap ve ünitenin/kitabın kendi çeldiricileri korunur, yalnızca soru kökü değişir ve **şık sırası karıştırılır** (şık yerinin ezberlenmesi boşa çıkar).
- **Her yanlışta yeni yazım:** varyant, hata sayısıyla tohumlanır; yani aynı soruyu 2. kez yanlış yaptığında farklı bir kalıpla karşına gelir.
- **Rastgele serpiştirme:** "Hata Defterimden Çöz"ü beklemen gerekmez; karma/tekrar testlerinde havuza **rastgele konumlara** enjekte edilir (test uzunluğunun en fazla %20'si, en çok 4 soru).
- **Doğru yapınca orijinal hata kapanır:** varyantı doğru yanıtladığında, varyantın türediği asıl hata kaydı "ustalaşmış" sayılır; asıl soruyu tekrar görmezsin.
- Yerel model açıksa `/api/ollama/rephrase` uç noktası kökü **modelle** yeniden yazar; model yoksa aynı deterministik motor devreye girer (sonuç her zaman aynı kalır).

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

## 7. Projeyi başlat (Sıfır Tıklamayla Otomatik Başlar)

**En kolay yol (Windows):** proje klasöründeki **`baslat.bat`** dosyasına çift tıkla. Sırayla güncellemeyi alır (`git pull`), paketleri kurar, Ollama ayarlarını düzeltip Ollama'yı hazırlar, eksik önerilen modeli indirir ve uygulamayı açar. Komut yazman gerekmez.

Projeyi GitHub'dan **ZIP olarak indirdiysen** de aynı dosya çalışır: `baslat.bat` ilk açılışta klasörü kendiliğinden GitHub deposuna bağlar ve sonraki açılışlarda güncellemeyi alır (Git kurulu olmalı: <https://git-scm.com/download/win>). Bu sırada proje dosyaları son sürümle değiştirilir; ürettiğin sorular ve ayarlar (`.tempo-data`), `node_modules` ve `.runtime` korunur. ZIP klasöründe elle `git pull` yazarsan `fatal: not a git repository` hatası alırsın; bunun yerine `baslat.bat` kullan. Otomatik güncellemeyi kapatmak için `TEMPO_AUTO_UPDATE=0`.

Elle başlatmak istersen aynı proje PowerShell penceresinde sırayla:

```powershell
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1
```

*(Başlangıç modelini el ile zorlamak istersen öncesinde `$env:OLLAMA_MODEL="qwen3:14b"` yazabilirsin; yazmasan bile sistem Ollama'da ne kuruluysa otomatik seçer.)*

`npm.cmd install` ilk seferde paketleri indirir. Son komuttan sonra terminalde `http://localhost:5173/` gibi bir adres görünür. Windows'ta Chrome veya Edge açıp **terminalde yazan adresi** gir.

Bu PowerShell penceresi açık kalmalı. Kapatırsan uygulama durur; durdurmak için **Ctrl + C** kullanabilirsin. Ollama uygulaması da açık olmalı. Bu yerel sunucuyu internete açma; kullanıcı yetkilendirmesi yoktur.

**Önemli — Açıldığı Anda İki Motor Çalışır (Sıralı Model Kuyruğu):**
Proje başladığı saniyeden itibaren **hiçbir düğmeye basman gerekmez** ve projede sürekli çalışan yalnızca iki şey vardır:

1. **Motor 1 — Sürekli Kaliteli Soru Üretimi (her zaman önceliklidir):** Tarayıcı sekmesini kapatsan bile sunucu ve Ollama açık kaldığı sürece soru üretimi durmaz; hız, modelin ve ekran kartının hızına bağlıdır (8B sınıfı modelle 12 GB kartta soru başına kabaca 30–90 sn beklenir). Her turda tek soru üretilir; kitaptan ilgili pasaj, tek-doğru ön kontrolü, iki ardışık hakem, çeldirici kalite kapısı, gerekirse öz-düzeltme ve `kolay`/`orta`/`zor` dengesi uygulanır. Kalite, hızdan önce gelir: iki hakem onaylamadıkça soru havuza girmez.
2. **Motor 2 — Sürekli Kalite İyileştirme (hiç durmaz):** Onaylı havuzdaki sorular düzenli olarak 0-API puanlamasından geçer (hakem puanı, sınav potansiyeli, çeldirici dengesi, kanıt derinliği, benzerlik cezası). Ortalama çıtanın (74/100) altında kalan sorular tek tek yeniden yazılır; yeni sürüm ancak **iki bağımsız hakemin** onayından ve en az **+4 puan** iyileşme kapısından geçerse eski sürümün yerine geçer ve bu sırada soru kimliği ile oluşturulma tarihi korunur. Motor 2 model çağrılarını **yalnızca üretim boştayken** yapar — üretim hiçbir zaman iyileştirme için beklemez; havuz 20.000'e ulaştığında en zayıf soruları ayıklayıp yer açma görevini de dördüncü turda bir kez üstlenir.
3. **Havuz 65.000 ile sınırlı** (`TEMPO_POOL_CAPACITY` ile değişir): Onaylı soru sayısı sınıra ulaşınca küratör bot en zayıf ve birbirine benzeyen soruları ayıklayıp havuzu sınırın %92,5'ine (~60.125) indirir; üretim devam eder. Toplam kayıt sayısı da sınırı geçmez.
4. **Modeller kontrollü paralel çalışır:** Tüm model çağrıları (Motor 1 ve Motor 2) uygulama içindeki sınırlı kuyruktan geçer; aynı anda en fazla `TEMPO_AUTO_CONCURRENCY` (varsayılan **2**, 1–8 arası) model çağrısı çalışır. Her üretim hattı kendi tam çift-hakem doğrulamasından geçer; Motor 2'nin çağrıları üretim boştayken sıraya girer.
5. **Model kurulumu açılışta yalnızca bir kez yapılır:** Ollama'daki modeller taranır; Üretici, 1. Hakem, 2. Hakem ve Evrim rolleri otomatik atanır. Eksik uzman profiller (`tempo-ogretmen`, `tempo-hakem`, `tempo-mimar`, `tempo-qwen-coder` ve gerekirse `tempo-osym-uzmani`, `tempo-celdirici-muhendisi` vb.) açılışta bir kez oluşturulur. Bundan sonra projede **kesintisiz çalışan üçüncü bir ajan yoktur**.
6. **İki motoru Soru stüdyosunda izle:** Uygulamadaki **Soru stüdyosu** sayfasının en üstünde iki motor kartı bulunur: Motor 1 (üretilen/onaylanan soru, havuz doluluğu, onay oranı, hız, zorluk dağılımı) ve Motor 2 (ortalama kalite puanı vs 74 hedefi, taranan/iyileştirilen soru sayısı, son iyileştirilen sorular). Hiçbir düğmeye basmadan ikisi de canlı akar.

## 8. Modelleri ve rolleri kontrol et (isteğe bağlı)

Modeller proje açılışında otomatik atanır, ancak farklı bir model denemek istersen:

1. Uygulamada **Soru stüdyosu**na gir.
2. **Üretici model**, **Denetçi (1. hakem)**, **2. hakem (bağımsız)**, **3. AI Öz-Evrim** ve **JARVIS Qwen Code** alanlarından dilediğin modeli seçebilirsin.
3. **Ollama bağlantısı yok** yazıyorsa Windows'ta Ollama uygulamasının açık olduğunu ve PowerShell'de `ollama list` komutunun çalıştığını kontrol et.
4. Ortam değişkenleriyle de varsayılanları belirleyebilirsin:
   - `OLLAMA_MODEL` (üretici), `OLLAMA_VERIFIER_MODEL` (1. hakem), `OLLAMA_JUDGE2_MODEL` (2. hakem), `OLLAMA_EVOLVER_MODEL` (mimar), `OLLAMA_CODER_MODEL` (Qwen Coder)
   - `TEMPO_QWEN_CLI_BIN` (özel `qwen` CLI yolu), `TEMPO_WEB_RESEARCH=0` (internet araştırmasını kapatmak istersen), `LLAMA_CPP_DIR` (`llama.cpp` konumu)

## 9. İki Motorun Arkasındaki Mimarisi — Üretim & Sürekli Kalite İyileştirme

Bu sürümde yapay zekâlar 5 kitabın tamamından (824 sayfa, ~2 milyon karakter, **1.021 konu pasajı**) beslenir. Proje açık olduğu sürece kesintisiz çalışan yalnızca **Motor 1 (sürekli kaliteli soru üretimi)** ve **Motor 2 (üretilmiş soruların sürekli kalite iyileştirmesi)**'dir. Aşağıdaki bileşenler bu iki motoru ve senin test çözme/çalışma akışını besler; bunların hiçbiri arka planda gizlice ve kesintisiz koşmaz — ilgili ekranı açtığında veya bir düğmeye bastığında çalışır:

1. Kesintisiz Üretim Hattı (Motor 1 — Asla Durmaz):**
   - Sorular **tek tek** (`batchPerCall: 1`) üretilir; ilgili kitap pasajı, tek-doğru ön kontrolü, iki ardışık hakem ve gerekirse öz-düzeltmeden geçer. Model çağrıları ortak kuyrukta sıraya girer, böylece modeller çakışmaz.
   - **Soru üretimi asla duraklatılmaz.** Havuz sınırına (varsayılan 65.000) ulaşsa dahi en düşük puanlı/tekrar sorular ayıklanarak kesintisiz yeni soru üretimi sürer.
2. İnternet Araştırması & Sınav Tahmini (talep üzerine — `server/research-agent.mjs`):**
   - Araştırmacı ajan, **JARVIS'e "ünite X'i araştır" dediğinde** (veya ilgili API çağrıldığında) 29 ünite içinden sıradakini seçerek **Türkçe Vikipedi + DuckDuckGo web araması** üzerinden ilgili ders kavramlarını ve sınav vurgularını tarar (ağ yoksa hata vermeden kitap pasajları üzerinde derin örüntü analizine döner). Bu araştırma arka planda kesintisiz koşmaz; sonucu `.tempo-data/ai-brain/research-memory.json` dosyasına yazılır ve **sonraki tüm soru üretimlerine** rehberlik eder.
   - Taradığı veriler + resmi kitap metni üzerinden **sınavda çıkabilecek soruları akıl yürüterek tahmin eder** (`examHypotheses`), sınavlarda en çok karıştırılan tuzak kavram çiftlerini (`confusionPairs`) çıkarır ve `.tempo-data/ai-brain/research-memory.json` üzerinden doğrudan soru üreticisine yön verir.
   - *Güvenlik ilkesi:* Araştırma yalnızca "hangi kavramın ve tuzağın sorulacağı" konusunda akıl yürütür; sorunun **kanıt alıntısı (`evidence`) her zaman %100 resmi ders kitabından** alınmak zorundadır.
3. Gelişim Seviyesine Göre Dinamik Kalite Ayarı (`computeAdaptiveQuality`):**
   - Yapay zekâ deneyim, araştırma ve Qwen Code inovasyonu kazandıkça (**Seviye 1 → Seviye 4 · Usta Sınav Mimarı**), beklediği minimum kalite çıtası ve vaka/analiz derinliği kendiliğinden yükselir.
4. Qwen Code Sürekli İnovasyonu & `kolay` / `orta` / `zor` Koruması:**
5. Çok Yanlış Yönlendirmesi & Anlatım/Kodlama Yenileme (`server/lesson-engine.mjs`):**
   - Bir konuda üst üste hata yaptığında uygulama seni anında o konuyu biraz daha okumaya veya **konu anlatımını sesli dinlemeye** yönlendirir.
   - Hâlâ akılda kalmıyorsa **"Aklımda Kalmıyor: Kodlamaları & Anlatımı Değiştir"** (tek tıkla) eski kodlamaları tamamen yasaklayıp yepyeni bir benzetme/akrostiş/hikâye tarzıyla dersi baştan kurgular.
6. "Ya Çıkarsa?" %100 Pasaj Kapsamı ve `5 × 20 = 100` Sınav Provası:**
   - Sınavda 5 kitabın her birinden 20'şer toplam 100 soru geleceği için yapay zekâ "az önemli" saysa bile hiçbir kitap bölümü atlanmaz: her ünitede `everyCornerDetails` ("Ya Çıkarsa?" köşeleri), sıfır kör nokta pasaj önceliği ve Test Merkezinde **5 × 20 = 100 Soru Tam Sınav** + **"Ya Çıkarsa?" Kör Nokta Testi** bulunur.
7. Çoklu Ücretsiz Ses Stüdyosu (`server/voice-studio.mjs`, `src/VoiceStudio.tsx`):**
   - **64'ten fazla tamamen ücretsiz ses** (yerel VoiceStudio köprüsü, Speechify, OpenAI ve ElevenLabs ücretsiz katmanları dâhil) tek katalogda toplanır; konu anlatımı, sorular ve Kayserili koç tepkileri bu seslerle seslendirilir.
   - **Diyalog karakter ses kadrosu** (Koç, Kayserili, Hamam Böceği Böcü, Ada, Can ve Anlatıcı) her role ayrı bir ses atar; ses dosyaları sunucudan `audio/mpeg` akışıyla uygulama içinde oynatılır (**başka siteye veya sayfaya yönlendirme yapmaz**).
   - Tamamı **0-API** prensibiyle çalışır: harici anahtar veya abonelik gerekmez (`zeroApiRequired`, `noApiKeyPrompts`).
8. Hyper-150x Meta-Geliştirici Bot — ApexArchitect v3 (`server/apex-architect.mjs`, `server/jarvis-core.mjs`, `server/sandbox-evolver.mjs`):**
   - İstek üzerine çalıştırıldığında projedeki **tüm 8 botu** (`Üretici`, `Hakem Konseyi`, `20k+ Havuz Botu`, `LessonEngine`, `ResearchAgent`, `Kayseri Koçu`, `Qwen Code Sandbox`, `Turbo Kalite Kilidi`) canlı MR taramasından geçirir, kök nedenleri ve pasaj/hata darboğazlarını tespit eder.
   - **Adli Eleştirmen × 3 Adaylı Turnuva Mimarı × Self-Repair (Kendini Onaran Kural) × 8-Tuzak Adversarial F1 Stres Testçisi** kuruluyla birden fazla rakip stratejiyi yarıştırır, bozuk kuralı otomatik tamir eder, önceki turun gerçek etkisini ölçüp `winningPlaybook` altın defterine yazar ve canlı `hyperParams` (`temperatureOffset`, `batchSizeHint`, `priorityPassageUnits`, `reframePriorityUnits`, `curatorMinScoreHint`) ile tüm proje botlarını fiilen yöneterek Zekâ Çarpanını **25x → 150x–500x** bandına tırmandırır (`kolay/orta/zor` üçlü kademesi korunur).
   - Qwen Code (`qwen2.5-coder` / `qwen3-coder` veya harici `qwen` CLI), sorulardaki **`kolay` / `orta` / `zor` 3 kademeli zorluk sistemini ASLA silmeden** her seviyenin direktiflerini geliştirir ve izole `node:vm` kum havuzunda `evaluateDifficultyFit` / `evaluateCandidate` kuralları yazar (`SandboxEvolver` üçlü zorluk sisteminin silinmesini yazılımsal kapıyla engeller).
   - Uygulama koduna yönelik güvenli önerileri `.tempo-data/ai-brain/jarvis-memory.json` → `codeProposals` kuyruğunda toplar; canlı kaynak kodu asla bozmaz.
9. Katman 1 + Katman 2 Öğrenme (`server/jarvis-core.mjs`, `training/auto_train_cycle.py`):**
   - **Katman 1 (Anlık Koçluk — 0 ek VRAM):** Hakem retlerinden öğrenilen dersleri (`avoidLessons`) ve başarı desenlerini (`goldenPatterns`) anında sonraki üretim promptlarına işler; bu, Motor 1'in olağan çalışma biçimidir.
   - **Katman 2 (LoRA + DPO Ağırlık Eğitimi & Hot-Swap):** Eğitim, bu rehberin 13–18. adımlarında (İsteğe bağlı) **senin başlattığın** bir işlemdir; proje açılır açılmaz kendiliğinden GPU eğitimi başlatmaz. Yeni model held-out testlerde tabandan iyiyse `tempo-jarvis:vN` olarak Ollama'ya aktarılıp sıcak geçişle devreye alınabilir (beğenilmezse tek tıkla önceki modele dönülebilir).
10. Çift-Cevap Kalkanı:**
   - 2 şıkkın birden doğru sayılabildiği tüm sorular 0 ms ön-kontrol + bağımsız hakemlerin `dualAnswerRisk` kalkanıyla elenir; hiçbir soru bu kapıdan geçmeden havuza giremez.
11. Soru Havuzu Tarama ve Kalite Yenileme Botu (`server/pool-curator.mjs`):**
   - `PoolCuratorBot`, Motor 2'nin 0-API taraması ve Motor 1'in havuz-sınırı koruması tarafından kullanılır; ayrıca istek üzerine elle çalıştırılabilir. Havuzdaki soruları 0–100 bileşik kalite puanıyla (hakem puanı, `examPotential` sınavda çıkma potansiyeli, 5 soru açısı zenginliği, çeldirici uzunluk dengesi, açıklama/kanıt derinliği ve Jaccard benzerlik cezası) tarar ve raporlar.
   - Havuzdaki onaylı soru sayısı **havuz sınırını (varsayılan 65.000) geçtiğinde**, ünite ve `kolay`/`orta`/`zor` tabanını koruyarak en kalitesiz ve yakın tekrar soruları otomatik temizler (sınırın %92,5'ine indirir), yerlerini daha yüksek sınav potansiyelli taze sorularla doldurmak üzere üretim önceliklerini günceller ve elenenleri DPO öğrenme izine aktarır.
12. 100/100 Full Doğru Hedefli 5 Farklı Soru Açısı (`QUESTION_ANGLES`):**
   - `kolay`, `orta` ve `zor` seviyelerinin tamamı yüksek kaliteli ve sınavda çıkma potansiyeli (`examPotential: 1–5`) yüksek sorulardan oluşur.
   - Bir kavram 5 farklı açıdan sorulabiliyorsa (`1. Doğrudan Tanım`, `2. Ters Köşe / İstisna`, `3. Saha Vakası`, `4. Karşılaştırmalı Tuzak`, `5. Şaşırtıcı Bağlam`) yapay zekâ hepsini dengeli döndürerek öğrenciyi şaşırtıcı varyasyonlara da hazırlar.
13. Süre ve Performansa Göre Şekillenen Uzun, Tekrarlı, Püf Noktalı & Kodlamalı Ünite Anlatımları (`server/lesson-engine.mjs`):**
   - Derslerim ekranı önce kısa ezber özetini gösterir (bkz. 11. bölüm). Altındaki **Uzun anlatım** kutusunda derin bölümler, zihin çıpaları, akılda kalıcı **kodlamalar/akrostişler**, klasik tuzak uyarıları, **"1 Kavram — 5 Farklı Soru Açısı" haritası**, yankılı tekrar kutuları ve anında kontrol soruları içerir.
   - Test çözerken sistem her soruda harcadığın **süreyi (saniye ve dakika)** ve doğruluk/seri performansını otomatik kaydedip `/api/ollama/student-state` üzerinden kaydeder; `LessonEngine` bu verilere bakarak (örneğin yavaş kaldığın veya hata yaptığın ünitelere hızlandırıcı kodlama/tuzak uyarıları ekleyerek) ünite konu anlatımlarını bu sinyallerle güçlendirir.

## 10. Otonom Yapay Zekâ Kalite Kurulu (Senin Onaylaman veya Reddetmen Gerekmez)

Bu sürümde **havuzdaki soruları tek tek onaylaman ya da reddetmen gerekmez**; onay ve eleme kararlarını yapay zekâlar kendi aralarında yürütür ve Motor 2 reddedilmemesi gereken zayıf soruları yeniden yazar:

1. Üretilen her soru önce **0 ms Çeldirici & Örtüşme Kalkanı**ndan ve **SandboxEvolver** JS kurallarından geçer.
2. Ardından **iki bağımsız yapay zekâ hakemi** soruyu kitaba bakarak çözer; tek doğru cevap, kanıt ve zorluk etiketinde tam birleşen ve JARVIS adaptif kalite çıtasını aşan sorular **`AI Konseyi Onayladı`** statüsüyle anında sitedeki testlere açılır.
3. Çift cevap riski taşıyan, kanıtsız veya kalite çıtasının altında kalan sorular otomatik **`AI Otomatik Eledi`** sekmesine ayrılır ve DPO tercih çifti (`rejected-traces.jsonl`) olarak modelleri daha da güçlendirmek için kullanılır.
4. **Soru stüdyosu** sayfasından dilediğin zaman AI Konseyi'nin onayladığı ve otomatik elediği soruları, hakem gerekçelerini, web araştırma tahminlerini ve JARVIS canlı günlüğünü izleyebilirsin.

## 11. Dersi oku, yarın hatırla (ezber özeti ve Tekrar yolu)

**Ders sayfası (Derslerim → bir ünite)** artık tek bir şey gösterir: kitaptaki **her başlığın** kısa, ezberlenecek özeti.

- Ünite 3–8 ana konuya ayrılır; konuya tıklayınca açılır. Her alt başlığın altında 1–3 kısa cümle, varsa kitaptaki madde listesi ve "Dikkat" kutuları vardır. `s.47` gibi sayfa numarasına basınca kitabın o sayfası açılır.
- **Kendini sına** düğmesi içerikleri gizler; önce kendin hatırlarsın, sonra gösterirsin. **Bu konuyu dinle** konuyu seslendirir.
- Uzun anlatım, kodlamalar, kitap soruları ve PDF kaybolmadı; sayfanın altında kapalı kutular hâlinde durur (istersen açarsın).
- Özet doğrudan kitap PDF'lerinden çıkarılır (`npm run briefs`). Kitaptaki 712 başlığın tamamının özette bulunduğu her çalıştırmada otomatik sınanır (`scripts/test-unit-briefs.mjs`). Cümleler kitaptan aynen alınır; kitaptaki yazım hataları da aynen gelir.

**Kalıcı ezber her zaman açıktır.** Ayrıca bir şeyi açman gerekmez:

1. Derste bir konuyu açıp yaklaşık 20 saniye okuduğunda o konu kendiliğinden tekrar planına girer ve **ertesi gün** karşına çıkar. **Okudum, tamamla** dersen ünitenin bütün konuları plana girer.
2. Tekrar zamanı gelen konu sayısı sol menüde **Tekrar yolu**nun yanında, ana sayfada ve ünite sayfasında görünür.
3. **Tekrar yolu**nda kart sana ana konuyu ve alt başlıklarını ipucu olarak verir. Nota bakmadan anlat, sonra **Özeti göster** (Boşluk tuşu) de.
4. Hatırladıysan **Hatırladım** (2), eksikse **Tekrar etmeliyim** (1) seç. Hatırlanan konu 3, 7, 14, 30, 60, 120, 240, sonra yaklaşık 365 gün arayla yeniden gelir. Eksik kalan konu 10 dakika sonra tekrar sorulur ve merdiven baştan başlar. Testte yapılan yanlış, o ünitenin planlı konularını hemen sıraya alır.

Tekrar planı bu tarayıcıda saklanır; bildirim gönderilmez, tarih uygulamayı açtığında kontrol edilir. Plan bir öneridir, kalıcı öğrenme garantisi değildir. Eski sürümde "tamamlandı" işaretlediğin ünitelerin konuları da karta dönüşür ve ünitenin eski tekrar tarihini izler.

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

> **Elle başlatılır:** SFT + DPO veri seti bu adımda hazırladığın elle komutla (veya `POST /api/ollama/prepare-training` çağrısıyla) `.tempo-data/training` klasörüne yazılır; proje açılır açılmaz kendiliğinden eğitim başlatmaz.

1. [python.org/downloads/windows](https://www.python.org/downloads/windows/) adresinden **64 bit Python 3.11** indir ve kur. Kurulumda Python'u PATH'e ekleme seçeneğini işaretle.
2. Yeni PowerShell aç; 6. adımdaki gibi proje klasörüne gir.
3. Python sürümünü kontrol et:

```powershell
py -3.11 --version
```

4. Veriyi hazırla (çok görevli SFT: soru üretici + hakem/çözücü + kitap bilgisi + DPO tercih çiftleri):

```powershell
py -3.11 training\prepare.py --multitask --dpo
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

## 17. Eğitimi başlat (QLoRA / DoRA / DPO) ve Ollama'ya aktar

Proje klasöründeki PowerShell'de güçlü **pro** (r=16 rsLoRA, tüm lineer katmanlar) adaptörüyle RTX 3080 Ti (12 GB) için önerilen eğitim komutları:

```powershell
# Seçenek A — Yüksek kaliteli 8B Qwen3 modeli (önerilen, 12 GB VRAM uyumlu):
.\.venv\Scripts\python.exe training\train_lora.py --base Qwen/Qwen3-8B --adapter-size pro --llama-dir "$env:USERPROFILE\llama.cpp"

# Seçenek B — 7B Qwen2.5 veya hafif 3B/4B modeller:
.\.venv\Scripts\python.exe training\train_lora.py --base Qwen/Qwen2.5-7B-Instruct --adapter-size pro --llama-dir "$env:USERPROFILE\llama.cpp"

# İsteğe bağlı 2. aşama — Onaylı vs Reddedilen sorulardan DPO Tercih Eğitimi:
.\.venv\Scripts\python.exe training\train_dpo.py --sft-adapter .tempo-data\adapter
.\.venv\Scripts\python.exe training\ollama_export.py --adapter .tempo-data\adapter-dpo --llama-dir "$env:USERPROFILE\llama.cpp"
```

Desteklenen taban modeller: `Qwen/Qwen3-8B`, `Qwen/Qwen2.5-7B-Instruct`, `Qwen/Qwen3-4B`, `google/gemma-3-4b-it`, `Qwen/Qwen2.5-3B-Instruct` (ayrıca `--allow-custom-base`). `--adapter-size` seçenekleri: `compact` (~98K param, sadece 3B), `standard` (r=8), `pro` (r=16 rsLoRA tüm katmanlar — varsayılan), `dora` (DoRA r=16 tüm katmanlar). Eğitim tamamlanırsa adaptörü birleştirip GGUF'a dönüştürmeyi ve Ollama'ya yeni bir model olarak aktarmayı dener.

Pencereyi işlem bitene kadar açık tut. Eğitim VRAM, aktarım ise ayrıca sistem RAM'i ve disk kullanır. Aktarım başarısız olsa bile eğitim tamamlanmışsa adaptör korunur. Sorunu düzelttikten sonra aktarımı tekrar deneyebilirsin:

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

Başarılıysa listede `tempo-trained:...` adlı yeni bir model görünür. Uygulamada **Soru stüdyosu → Durumu yenile → Üretici model** yolundan modeli seçip **Modeli kullan** düğmesine bas.

Eğitilmiş adaptörü taban modelle biçim, çeldirici dengesi, uzunluk sızıntısı ve çözücü doğruluğu bakımından karşılaştırmak için:

```powershell
.\.venv\Scripts\python.exe training\evaluate.py --eval-solver
```

## 19. Dosyalar, yedek ve disk alanı

- Üretilen sorular ve onayları proje klasöründeki `.tempo-data\questions.json` dosyasındadır. `.tempo-data` Git'e gönderilmez; uygulama ve eğitim durmuşken klasörü ayrıca yedekle.
- Ders ilerlemesi tarayıcının yerel deposundadır. Tarayıcı verilerini temizlersen ilerleme kaybolabilir; `.tempo-data` yedeği bunu tek başına geri getirmez.
- Eğitim verileri `.tempo-data\training`, adaptör varsayılan olarak `.tempo-data\adapter` içindedir. Ollama modelleri ayrı bir konumda bulunabilir.
- Uygulamadaki **100 GB sınırı yaklaşık bir kontroldür, kesin Windows disk kotası değildir**. Harici Ollama modelleri, başka programlar ve işlemler toplam alanı artırabilir. Boş alanı Dosya Gezgini'nde ilgili sürücünün özelliklerinden kontrol et.

## Bilmen gerekenler

Bu sürümde 29 ünite için kısa anlatımlar ve çeşitli soru bankaları vardır. **5000 benzersiz soru, ünite başına 200 soru, kitapların tüm ayrıntıları ve uzman doğrulaması tamamlanmış değildir.** Kitap PDF'leri konu kaynağı olarak kullanılabilir; PDF sorularının tamamı interaktif teste aktarılmamıştır. Uygulama sınav başarısı veya cevap doğruluğu garantisi vermez.

## 20. Yeni özellikler (Kayserili Koç, +15500% Hyper-155x+ & Kalite Kilitli Turbo Mod)

- **Dengeli kalite modu (tek mod):** Soru üretimi daima kalite hattından geçer: 1 soru/çağrı, kitaptan ilgili pasaj, tek-doğru ve kaynak kanıtı kontrolü, iki ardışık hakem, gerekirse öz-düzeltme, `kolay`/`orta`/`zor` dengesi. Tüm model çağrıları tek kuyrukta sıraya girer (eşzamanlılık 1), böylece **iki model aynı anda çalışmaz** ve sistem yükü düşük kalır. Havuz 20.000 kayıtla sınırlıdır.
- **Kayserili Sert-Komedi Şık Tepkisi (`/api/ollama/kayseri-react`):** Test sırasında bir şıkka basıldığında süre ve seriye göre anında Kayserili şiveli/sert-komedi (ve tek tıkla `Temiz Klasik` geçişli + `Sesli Oku` destekli) koç tepkisi, net bilgi ve önemli terim gösterilir.
- **+%15500 (`Hyper-155x+`) Qwen Code & ApexArchitect:** İstek üzerine çalıştırıldığında 8 alt-sistemi (üretici, hakem, küratör, ders motoru, araştırmacı, Kayseri koçu, Qwen Code sandbox ve Turbo kalite kilidi) 16 tuzaklı stres testi ve 4 adaylı turnuvayla değerlendirip geliştirir.

Geliştirici kontrolleri:

```powershell
npm.cmd run build
npm.cmd run audit
node --test scripts/test-*.mjs
py -3.11 -m unittest discover -s training -p "test_*.py"
```

Anlatım veya soru kaynak kodları değiştirilirse `npm.cmd run contexts` çalıştırıp uygulama sunucusunu yeniden başlat. Bu komutlar gerçek model kalitesini, GPU eğitimini veya uzman doğruluğunu test etmez.
