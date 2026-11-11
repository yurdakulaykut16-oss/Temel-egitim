# Tempo — Antrenörlük temel eğitim çalışma alanı

Bu rehber **Windows 11 üzerinde, doğrudan kendi bilgisayarında** çalışmak içindir. Ubuntu veya WSL kurman gerekmez. İşlemleri sırayla yap: önce projeyi ve Ollama'yı çalıştır, ardından soruları incele. Model eğitimi isteğe bağlıdır ve sonraki adımlardadır.

> **SIFIR DÜĞME — TAM OTONOM:** Proje açıldığı andan itibaren **hiçbir düğmeye basman gerekmez**. Soru üretimi, hakem denetimi, havuz temizliği, 100-AI Konseyi kalibrasyonu, TVGFBF taraması, hassasiyet denetimi, GitHub 260k+ emilimi, 8-katman seviye atlama, Nexus-Titan tam proje geliştirme, arayüz evrimi, SFT+DPO veri seti hazırlığı, LoRA+DPO ağırlık eğitimi ve model kurulumu — **hepsi arka planda kendiliğinden çalışır.** Turbo mod tek moddur; kapatılmaz.

> **Önce GitHub sürümünü kontrol et:** Depo adresi [github.com/yurdakulaykut16-oss/Temel-egitim](https://github.com/yurdakulaykut16-oss/Temel-egitim). Bu rehberde anlatılan güncel dosyalar, GitHub'da yer aldıkları daldan indirilmelidir. Arena'daki değişiklikler kendiliğinden GitHub'a aktarılmaz. GitHub'da seçili dalda `package.json`, `src`, `server`, `training` ve `public/books` yoksa o sürüm bu uygulamanın tamamı değildir. Çalışma dalı `arena/b582fa34-temel-egitim` GitHub'a gönderilmediyse o daldan indirme yapılamaz.

## 1. Projeyi GitHub'dan indir

1. Tarayıcıda [proje sayfasını](https://github.com/yurdakulaykut16-oss/Temel-egitim) aç.
2. Sol üstteki dal seçme düğmesinden güncel uygulamanın bulunduğu dalı seç. Bu çalışma oturumunun dalı `arena/b582fa34-temel-egitim` adını taşır; yalnız GitHub'a gönderilmişse listede görünür. Değişiklikler sonradan `main` dalına alınmışsa güncel `main` da kullanılabilir.
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

Uygulama içinde **5 ana yapay zekâ rolü** vardır: **Üretici Öğretmen**, **1. Hakem**, **Bağımsız 2. Hakem**, **Evrim Mimarı (JARVIS)** ve **Qwen Code (Zorluk & Sistem Geliştiricisi)**. İyi haber: **proje açıldığı anda kurulu modelleri otomatik algılayıp tüm rollere kendisi yerleştirir** ve eksik uzman profillerini (`tempo-ogretmen:latest`, `tempo-hakem:latest`, `tempo-mimar:latest`, `tempo-qwen-coder:latest`) ile birleşik model `tempo-nexus-titan:latest`'i **kendiliğinden oluşturur** — bunları elle indirmene gerek yoktur.

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

### Seçenek E — Bulut video modelleri (0-API, Ollama hesabınla · opsiyonel)

Video yönetmeni yalnızca **Kimi ve Ollama** modelleriyle çalışır (başka site/anahtar yok). Ollama aboneliğin varsa:

```powershell
ollama pull kimi-k3.1-pro:cloud
ollama pull glm-5.3-flash:cloud
ollama pull deepseek-v4.1-flash:cloud
```

Yoksa uygulama yerel 0-API MP4 boru hattıyla üretimine devam eder; hiçbir şey indirmene gerek yoktur.

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

> **Not:** Tek bir model bile indirsen (örneğin sadece `qwen3:8b`) uygulama açılışta durmaz; tüm rolleri otomatik o modele yerleştirir ve arka planda `tempo-ogretmen`, `tempo-hakem`, `tempo-mimar`, `tempo-qwen-coder` uzman profillerini + `tempo-nexus-titan:latest` birleşik modelini kendiliğinden oluşturur. Gerçek bağımsız denetim için **2. hakem olarak farklı bir model ailesi** (`gemma3:12b` / `gemma3:4b`) bulundurman önerilir.

### 4.1 Soru üretim hızını en yükseğe çıkar (Turbo motor · ~1 sn/soru)

Proje varsayılan olarak **yalnızca Turbo modda** çalışır (8 soru/çağrı, kuyruklu boru hattı, toplu kör hakem, kalite kilidi). En yüksek hız için bir kez PowerShell'de Ollama'yı şu ortam değişkenleriyle başlat:

```powershell
# Kalıcı olsun (yeni PowerShell pencereleri için):
setx OLLAMA_FLASH_ATTENTION "1"
setx OLLAMA_KV_CACHE_TYPE "q8_0"
setx OLLAMA_MAX_LOADED_MODELS "3"
setx OLLAMA_NUM_PARALLEL "6"
# Ollama'yı kapatıp yeniden aç
```

*(Alternatif, o pencere için geçici: `$env:OLLAMA_FLASH_ATTENTION="1"; $env:OLLAMA_NUM_PARALLEL="6"`.)*

- RTX 3080 Ti 12 GB'de **Seçenek A** ile ~1 sn/soru; **Seçenek C** ile ~0.5 sn/soru mümkündür.
- `OLLAMA_NUM_PARALLEL` değerini GPU belleğin taşarsa 4'e düşür (14B modelde 6 idealdir).
- Uygulamadaki **Eşzamanlı yuva** ayarı varsayılan **6**'ya yükseltilmiştir; 12 GB'de 14B kullanıyorsan aradaki üretimin kaynamaması için 4'e de düşürebilirsin (Arayüzde "Uygula" düğmesi).
- `keep_alive=-1` olduğundan modeller VRAM'de sabit kalır (her soruda yeniden yükleme yoktur).
- Daha büyük `num_batch` (512) ve GPU'ya tam offload (`num_gpu=99`) Turbo profilde otomatik uygulanır.

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

Aynı proje PowerShell penceresinde sırayla:

```powershell
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1
```

*(Başlangıç modelini el ile zorlamak istersen öncesinde `$env:OLLAMA_MODEL="qwen3:14b"` yazabilirsin; yazmasan bile sistem Ollama'da ne kuruluysa otomatik seçer.)*

`npm.cmd install` ilk seferde paketleri indirir. Son komuttan sonra terminalde `http://localhost:5173/` gibi bir adres görünür. Windows'ta Chrome veya Edge açıp **terminalde yazan adresi** gir.

Bu PowerShell penceresi açık kalmalı. Kapatırsan uygulama durur; durdurmak için **Ctrl + C** kullanabilirsin. Ollama uygulaması da açık olmalı. Bu yerel sunucuyu internete açma; kullanıcı yetkilendirmesi yoktur.

**Önemli — Açıldığı Anda Tam Otonom Çalışır (Turbo Mod):**
Proje başladığı saniyeden itibaren **hiçbir düğmeye basman gerekmez**:
1. **Otomatik Rol Kurulumu:** Ollama'daki modelleri tarar; Üretici, 1. Hakem, 2. Hakem, Evrim Mimarı ve Qwen Coder rollerini otomatik doldurur; eksik uzman modelleri (`tempo-ogretmen`, `tempo-hakem`, `tempo-mimar`, `tempo-qwen-coder`) ve `tempo-nexus-titan:latest` birleşik modelini kendisi kurar; eksik güçlü açık kaynak kodlayıcıları (6'lı hafif istif) açılışta kendiliğinden indirir.
2. **Kesintisiz Soru Üretimi:** Tarayıcı sekmesini kapatsan bile sunucu ve Ollama açık kaldığı sürece **soru üretimi hiçbir zaman durmaz** (arka plan eğitimi veya araştırması sırasında bile kesilmez). Turbo mod tek moddur: 8 soru/çağrı, kuyruklu boru hattı, toplu kör hakem, kalite kilidi — kapatılmaz.
3. **Sürekli Arka Plan Araştırması & Eğitimi:** Bir yapay zekâ grubu sürekli soru üretip denetlerken, koç yapay zekâlar internetten ders konularını araştırır, sınavda çıkabilecek soruları akıl yürüterek tahmin eder, diğer yapay zekâları sürekli eğitir ve soruları senin yerine kendi kendine onaylar veya eler.
4. **Otomatik Çalışan Koç Katmanı (proje açılışından itibaren hiç durmaz):**
   - 5-Ajan TVGFBF & Kitap İçi "neler öğrendik?" taraması + 29-ünite **hassasiyet (psikometri) denetimi** (her ~30 sn),
   - **100 Yapay Zekâ Konseyi**: havuzun tamamını kendiliğinden çözer/etiketler (her ~45 sn) + **Qwen Code ile 100-AI evrimi** (her ~90 sn),
   - **260k+ GitHub Proje Mega-Emilim** (her ~6 sn) + **Tüm Botlar Hyper-Evrimi** (64-Katman MoE, her ~14 sn),
   - **Nexus-Titan**: sürekli füzyon & arayüz evrimi (her ~8 sn) + **TÜM PROJEYİ & Arayüzü geliştirme** (her ~4 dk) + `tempo-nexus-titan:latest` Ollama modeli oluşturma/güncelleme (her ~5 dk) + doğrulanmış önerileri **100/100 kapısından geçirip projeye otomatik uygulama** (her ~2 dk, otomatik rollback korumalı),
   - **Tüm Proje 8-Katman Seviye Atlama** (her ~75 sn; her adım 100-yollu doğrulama kapısından geçer),
   - **Qwen 100-yöntem turnuvası**, **GitHub/internet prototip laboratuvarı** (100/100 kapılı otomatik projeye ekleme), **havuz küratörü**, **konu anlatımı/video motorları**, **RAG & Aider bağlam yenileme**, **Axolotl/LLaMA-Factory senkronizasyonu** — hepsi arka planda kesintisiz çalışır.
5. **Otomatik SFT + DPO Veri Seti Hazırlığı:** 50 onaylı soruya ulaşıldığında proje açılışından itibaren `training/prepare.py --multitask --dpo` kendiliğinden çalışır ve her +25 onaylı soruda `.tempo-data/training` klasörünü günceller. Donanım hazırsa LoRA+DPO ağırlık eğitimi de üretimi durdurmadan kendiliğinden başlar.

## 8. Modelleri ve rolleri kontrol et (isteğe bağlı)

Modeller proje açılışında otomatik atanır, ancak farklı bir model denemek istersen:

1. Uygulamada **Soru stüdyosu**na gir.
2. **Üretici model**, **Denetçi (1. hakem)**, **2. hakem (bağımsız)**, **3. AI Öz-Evrim** ve **JARVIS Qwen Code** alanlarından dilediğin modeli seçebilirsin.
3. **Ollama bağlantısı yok** yazıyorsa Windows'ta Ollama uygulamasının açık olduğunu ve PowerShell'de `ollama list` komutunun çalıştığını kontrol et.
4. Ortam değişkenleriyle de varsayılanları belirleyebilirsin:
   - `OLLAMA_MODEL` (üretici), `OLLAMA_VERIFIER_MODEL` (1. hakem), `OLLAMA_JUDGE2_MODEL` (2. hakem), `OLLAMA_EVOLVER_MODEL` (mimar), `OLLAMA_CODER_MODEL` (Qwen Coder)
   - `TEMPO_QWEN_CLI_BIN` (özel `qwen` CLI yolu), `TEMPO_WEB_RESEARCH=0` (internet araştırmasını kapatmak istersen), `LLAMA_CPP_DIR` (`llama.cpp` konumu)

## 9. Tam Otonom JARVIS Mimarisi — Kesintisiz Üretim, İnternet Araştırması & Sürekli Öz-Eğitim

Bu sürümde yapay zekâlar 5 kitabın tamamından (824 sayfa, ~2 milyon karakter, **1.021 konu pasajı**) beslenir ve proje açık olduğu sürece **bir yapay zekâ grubu diğer yapay zekâları hiç durmadan eğitir**:

1. **Kesintisiz Üretim Hattı (Asla Durmaz):**
   - Sorular Turbo modda **8'li paketler** (`batchPerCall: 8`) ve **toplu kör hakem** ile ~1 sn/soru temposunda üretilir.
   - Arka planda ağırlık eğitimi, web araştırması veya Qwen Code inovasyonu çalışırken bile **soru üretimi asla duraklatılmaz** (`pausedForTraining = false`). Havuz 25.000 sınırına ulaşsa dahi en düşük puanlı/eski sorular rotasyonla yenilenerek kesintisiz yeni soru üretimi sürer.
2. **Arka Planda Sürekli İnternet Araştırması & Sınav Tahmini (`server/research-agent.mjs`):**
   - Araştırmacı ajan proje boyunca 29 üniteyi sırayla gezerek **Türkçe Vikipedi + DuckDuckGo web araması** üzerinden ilgili ders kavramlarını ve sınav vurgularını tarar (ağ yoksa hata vermeden kitap pasajları üzerinde derin örüntü analizine döner).
   - Taradığı veriler + resmi kitap metni üzerinden **sınavda çıkabilecek soruları akıl yürüterek tahmin eder** (`examHypotheses`), sınavlarda en çok karıştırılan tuzak kavram çiftlerini (`confusionPairs`) çıkarır ve `.tempo-data/ai-brain/research-memory.json` üzerinden doğrudan soru üreticisine yön verir.
   - *Güvenlik ilkesi:* Araştırma yalnızca "hangi kavramın ve tuzağın sorulacağı" konusunda akıl yürütür; sorunun **kanıt alıntısı (`evidence`) her zaman %100 resmi ders kitabından** alınmak zorundadır.
3. **Gelişim Seviyesine Göre Dinamik Kalite Ayarı (`computeAdaptiveQuality`):**
   - Yapay zekâ deneyim, araştırma ve Qwen Code inovasyonu kazandıkça (**Seviye 1 → Seviye 4 · Usta Sınav Mimarı**), beklediği minimum kalite çıtası ve vaka/analiz derinliği kendiliğinden yükselir.
4. **Qwen Code Sürekli İnovasyonu & `kolay` / `orta` / `zor` Koruması:**
5. **Çok Yanlış Yönlendirmesi & Anlatım/Kodlama Yenileme (`server/lesson-engine.mjs`):**
   - Bir konuda üst üste hata yaptığında uygulama seni anında o konuyu biraz daha okumaya veya **3D Diyaloglu Videosunu** izlemeye yönlendirir.
   - Hâlâ akılda kalmıyorsa **"Aklımda Kalmıyor: Kodlamaları & Anlatımı Değiştir"** (hem otomatik arka plan hem tek tıkla manuel) eski kodlamaları tamamen yasaklayıp yepyeni bir benzetme/akrostiş/hikâye tarzıyla dersi baştan kurgular.
6. **"Ya Çıkarsa?" %100 Pasaj Kapsamı ve `5 × 20 = 100` Sınav Provası:**
   - Sınavda 5 kitabın her birinden 20'şer toplam 100 soru geleceği için yapay zekâ "az önemli" saysa bile hiçbir kitap bölümü atlanmaz: her ünitede `everyCornerDetails` ("Ya Çıkarsa?" köşeleri), sıfır kör nokta pasaj önceliği ve Test Merkezinde **5 × 20 = 100 Soru Tam Sınav** + **"Ya Çıkarsa?" Kör Nokta Testi** bulunur.
7. **Gömülü MP4 Video Oynatıcı, 3D Morpa Kampüs Sahnesi & Google Flow Köprüsü (`server/mp4-renderer.mjs`, `server/video-director.mjs`, `src/VideoLessonStage.tsx`):**
   - Arka plandaki AI Yönetmeni üniteler için **Koç Yapay Zekâ, Sporcu Ada ve Tuzakçı Can** arasında geçen durum tabanlı (`İlk Keşif`, `Hata Kurtarma`, `Ya Çıkarsa?`, `Hızlı Tekrar`) 3D diyaloglu videoları otomatik **gerçek H.264/AAC `.mp4` dosyalarına** dönüştürüp `.tempo-data/ai-brain/videos/{unitId}.mp4` olarak kaydeder ve `GET /api/ollama/videos/mp4` (HTTP `Range` 206 destekli) üzerinden **doğrudan uygulama içine gömülü `<video controls>` oynatıcısında** açar (**başka siteye veya sayfaya yönlendirme yapmaz**).
   - İstersen tek tıkla **Three.js 3D Etkileşimli Sahne**ye geçebilir, 3D sahneyi kaydedip sunucuda `.mp4`'e çevirerek doğrudan sayfaya gömebilir veya opsiyonel `GOOGLE_FLOW_API_KEY` ile üretilen Google Flow / Gemini Veo MP4 çıktısını da sayfa içine çekip gömebilirsin.
8. **Hyper-150x Meta-Geliştirici Bot — ApexArchitect v3 (`server/apex-architect.mjs`, `server/jarvis-core.mjs`, `server/sandbox-evolver.mjs`):**
   - Projedeki **tüm 6 botu** (`Üretici`, `Hakem Konseyi`, `20k+ Havuz Botu`, `LessonEngine`, `VideoDirector`, `ResearchAgent`) her döngüde canlı MR taramasından geçirir, kök nedenleri ve pasaj/hata darboğazlarını tespit eder.
   - **Adli Eleştirmen × 3 Adaylı Turnuva Mimarı × Self-Repair (Kendini Onaran Kural) × 8-Tuzak Adversarial F1 Stres Testçisi** kuruluyla birden fazla rakip stratejiyi yarıştırır, bozuk kuralı otomatik tamir eder, önceki turun gerçek etkisini ölçüp `winningPlaybook` altın defterine yazar ve canlı `hyperParams` (`temperatureOffset`, `batchSizeHint`, `priorityPassageUnits`, `reframePriorityUnits`, `curatorMinScoreHint`) ile tüm proje botlarını fiilen yöneterek Zekâ Çarpanını **25x → 150x–500x** bandına tırmandırır (`kolay/orta/zor` üçlü kademesi korunur).
   - Qwen Code (`qwen2.5-coder` / `qwen3-coder` veya harici `qwen` CLI), sorulardaki **`kolay` / `orta` / `zor` 3 kademeli zorluk sistemini ASLA silmeden** her seviyenin direktiflerini geliştirir ve izole `node:vm` kum havuzunda `evaluateDifficultyFit` / `evaluateCandidate` kuralları yazar (`SandboxEvolver` üçlü zorluk sisteminin silinmesini yazılımsal kapıyla engeller).
   - Uygulama koduna yönelik güvenli önerileri `.tempo-data/ai-brain/jarvis-memory.json` → `codeProposals` kuyruğunda toplar; canlı kaynak kodu asla bozmaz.
5. **Katman 1 + Katman 2 Sürekli Eğitim (`server/jarvis-core.mjs`, `training/auto_train_cycle.py`):**
   - **Katman 1 (Anlık Koçluk — 0 ek VRAM):** Hakem retlerinden öğrenilen dersleri (`avoidLessons`) ve başarı desenlerini (`goldenPatterns`) anında sonraki üretim promptlarına işler.
   - **Katman 2 (Otonom LoRA + DPO Ağırlık Eğitimi & Hot-Swap):** Her +100 yeni onaylı soruda (ve GPU + CUDA + `llama.cpp` hazırsa) `prepare.py → train_lora.py → train_dpo.py → evaluate.py` akışını çalıştırır; yeni model held-out testlerde tabandan iyiyse `tempo-jarvis:vN` olarak Ollama'ya aktarılıp sıcak geçişle devreye alınır (beğenilmezse tek tıkla önceki modele dönülebilir).
6. **Çoklu Çalışma Materyali & Çift-Cevap Kalkanı:**
   - Sorulara ek olarak **Bilgi Kartları (Flashcard)**, **1-e-1 Kavram Eşleştirme** ve **Tekrar Egzersizleri** üretilir; 2 şıkkın birden doğru sayılabildiği tüm sorular 0 ms ön-kontrol + bağımsız hakemlerin `dualAnswerRisk` kalkanıyla elenir.
7. **20.000+ Soru Havuzu Tarama ve Kalite Yenileme Botu (`server/pool-curator.mjs`):**
   - `PoolCuratorBot` havuzdaki tüm soruları 0–100 bileşik kalite puanıyla (hakem puanı, `examPotential` sınavda çıkma potansiyeli, araştırma hipotezi uyumu, 5 soru açısı zenginliği, çeldirici uzunluk dengesi, açıklama/kanıt derinliği ve Jaccard benzerlik cezası) sürekli tarar ve raporlar.
   - Havuzdaki onaylı soru sayısı **20.000'i geçtiğinde**, ünite ve `kolay`/`orta`/`zor` tabanını koruyarak en kalitesiz ve yakın tekrar soruları otomatik temizler (~18.500'e indirir), yerlerini daha yüksek sınav potansiyelli taze sorularla doldurmak üzere üretim önceliklerini günceller ve elenenleri DPO öğrenme izine aktarır.
8. **100/100 Full Doğru Hedefli 5 Farklı Soru Açısı (`QUESTION_ANGLES`):**
   - `kolay`, `orta` ve `zor` seviyelerinin tamamı yüksek kaliteli ve sınavda çıkma potansiyeli (`examPotential: 1–5`) yüksek sorulardan oluşur.
   - Bir kavram 5 farklı açıdan sorulabiliyorsa (`1. Doğrudan Tanım`, `2. Ters Köşe / İstisna`, `3. Saha Vakası`, `4. Karşılaştırmalı Tuzak`, `5. Şaşırtıcı Bağlam`) yapay zekâ hepsini dengeli döndürerek öğrenciyi şaşırtıcı varyasyonlara da hazırlar.
9. **Süre ve Performansa Göre Şekillenen Uzun, Tekrarlı, Püf Noktalı & Kodlamalı Ünite Anlatımları (`server/lesson-engine.mjs`):**
   - Derslerim ekranındaki konu anlatımları hızlıca biten kısa özetler değil; derin bölümler, zihin çıpaları, akılda kalıcı **kodlamalar/akrostişler**, klasik tuzak uyarıları, **"1 Kavram — 5 Farklı Soru Açısı" haritası**, yankılı tekrar kutuları ve anında kontrol soruları içerir.
   - Test çözerken sistem her soruda harcadığın **süreyi (saniye ve dakika)** ve doğruluk/seri performansını otomatik kaydedip `/api/ollama/student-state` üzerinden yapay zekâya aktarır; `LessonEngine` bu verilere bakarak (örneğin yavaş kaldığın veya hata yaptığın ünitelere hızlandırıcı kodlama/tuzak uyarıları ekleyerek) ünite konu anlatımlarını arka planda sürekli evrimleştirir.

## 10. Otonom Yapay Zekâ Kalite Kurulu (Senin Onaylaman veya Reddetmen Gerekmez)

Bu sürümde **AI havuzundaki soruları tek tek onaylaman ya da reddetmen gerekmez**. Proje boyunca tüm onay ve eleme kararlarını yapay zekâlar kendi aralarında yürütür:

1. Üretilen her soru önce **0 ms Çeldirici & Örtüşme Kalkanı**ndan ve **SandboxEvolver** JS kurallarından geçer.
2. Ardından **iki bağımsız yapay zekâ hakemi** soruyu kitaba bakarak çözer; tek doğru cevap, kanıt ve zorluk etiketinde tam birleşen ve JARVIS adaptif kalite çıtasını aşan sorular **`AI Konseyi Onayladı`** statüsüyle anında sitedeki testlere açılır.
3. Çift cevap riski taşıyan, kanıtsız veya kalite çıtasının altında kalan sorular otomatik **`AI Otomatik Eledi`** sekmesine ayrılır ve DPO tercih çifti (`rejected-traces.jsonl`) olarak modelleri daha da güçlendirmek için kullanılır.
4. **Soru stüdyosu** sayfasından dilediğin zaman AI Konseyi'nin onayladığı ve otomatik elediği soruları, hakem gerekçelerini, web araştırma tahminlerini ve JARVIS canlı günlüğünü izleyebilirsin.

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

> **Otomatik:** 50 onaylı soru eşiği geçildiğinde proje, SFT + DPO veri setini **açılışta ve her +25 onaylı soruda kendiliğinden** `.tempo-data/training` klasörüne hazırlar; aşağıdaki elle komut yalnızca zorlamak/yeniden üretmek istersen gerekir (eski düğme kaldırıldı, tamamen arka plan işidir).

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

Bu sürümde 29 ünite için kısa anlatımlar ve çeşitli soru bankaları vardır. **5000 benzersiz soru, ünite başına 100 soru, kitapların tüm ayrıntıları ve uzman doğrulaması tamamlanmış değildir.** Kitap PDF'leri konu kaynağı olarak kullanılabilir; PDF sorularının tamamı interaktif teste aktarılmamıştır. Uygulama sınav başarısı veya cevap doğruluğu garantisi vermez.

## 20. Yeni özellikler (Kayserili Koç, Sorusuz TikTok Akışı, +15500% Hyper-155x+ & Kalite Kilitli Turbo Mod)

- **Kalite Kilitli Turbo Mod (Tek Mod):** Proje daima `turbo` modda çalışır (`batchPerCall: 8`, kuyruklu boru hattı, toplu denetim, `turboQualityLock: true`). Başka profil/mod yoktur; Turbo kalite kilidi `selfCorrection`, çift-cevap blokajı, kitap kanıtı ve `kolay`/`orta`/`zor` seviyelerini asla gevşetmez. Soru üretim hızı ~0.5-1 sn/soru'dur; daha da hızlandırmak için 4.1 adımındaki `OLLAMA_NUM_PARALLEL` ve `OLLAMA_FLASH_ATTENTION` ayarlarını uygula.
- **Kayserili Sert-Komedi Şık Tepkisi (`/api/ollama/kayseri-react`):** Test sırasında bir şıkka basıldığında süre ve seriye göre anında Kayserili şiveli/sert-komedi (ve tek tıkla `Temiz Klasik` geçişli + `Sesli Oku` destekli) koç tepkisi, net bilgi ve önemli terim gösterilir.
- **Sorusuz TikTok Dikey Karışık Akış (`TikTok Akışı` & `/api/ollama/videos/feed`):** 29 ünitenin tamamı dolana kadar arka planda sürekli gömülü `.mp4` üretilir. TikTok akışı soru sormaz; doğrudan sınavda çıkacak net cevabı, önemli kelime/terimleri ve Kayserili/Hamam Böceği Böcü komedi diyaloglarını karışık ünitelerden dikey kaydırmayla oynatır.
- **+%15500 (`Hyper-155x+`) Qwen Code & ApexArchitect:** 10 alt-sistemi (üretici, hakem, küratör, ders motoru, video yönetmeni, araştırmacı, Kayseri koçu, TikTok akışı, Qwen Code sandbox ve Turbo kalite kilidi) 16 tuzaklı stres testi ve 4 adaylı turnuvayla sürekli geliştirir.

Geliştirici kontrolleri:

```powershell
npm.cmd run build
npm.cmd run audit
node --test scripts/test-*.mjs
py -3.11 -m unittest discover -s training -p "test_*.py"
```

Anlatım veya soru kaynak kodları değiştirilirse `npm.cmd run contexts` çalıştırıp uygulama sunucusunu yeniden başlat. Bu komutlar gerçek model kalitesini, GPU eğitimini veya uzman doğruluğunu test etmez.
