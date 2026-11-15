#!/usr/bin/env python3
"""KİTAPTAN GENİŞLETİLMİŞ ÖZET  ->  src/bookSummary.json

Üretim planı her konu için 50 kolay + 50 orta + 50 zor soru ister ve soruları YALNIZCA konu
özetinden kurar. 11–26 cümlelik eski özetler 150 farklı soruya yetmez. Bu betik beş ders
kitabının PDF'lerini (public/books/*.pdf) okur ve her konu için, sınavda sorulmaya uygun
cümleleri kitaptan seçerek özeti büyütür.

  - Yalnızca kitabın GÖVDE METNİ okunur (yazı tipi ve punto ile ayrılır): tablolar, şekil
    yazıları, başlıklar, kenar kutuları, sayfa üst/alt bilgileri ve soru sayfaları alınmaz.
  - Cümleler kitaptan BİREBİR alınır; yalnızca "(Yazar, 2017)" türü atıflar çıkarılır ve satır
    sonu tirelemeleri birleştirilir. Yeni bilgi yazılmaz, yorum katılmaz.
  - Madde listeleri, yarım cümleler, soru cümleleri, "aşağıda / yukarıda / Tablo 2.1" gibi cümle
    dışına gönderme yapanlar ve kaynakça satırları alınmaz.
  - "Bu …", "Ayrıca …" gibi önceki cümleye yaslanan cümleler yalnızca aynı paragraftaki önceki
    cümle de seçildiyse alınır.
  - Seçim ünitenin bütün sayfalarına yayılır; birbirinin ya da eski özetin tekrarı olan cümle alınmaz.

Kullanım:
    pip install pymupdf
    python3 scripts/build-book-summary.py            # src/bookSummary.json yazılır
    npm run contexts                                 # server/contexts.json yenilenir
Seçenekler: --target 100 (konu başına hedef özet cümlesi), --check (dosya yazmadan rapor)
"""
import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path

try:
    import pymupdf
except ImportError as exc:  # pragma: no cover
    raise SystemExit('pymupdf gerekli: pip install pymupdf (yalnız özeti yeniden üretmek için gereklidir).') from exc

ROOT = Path(__file__).resolve().parents[1]
BOOK_INDEX = ROOT / 'src' / 'bookIndex.json'
CONTEXTS = ROOT / 'server' / 'contexts.json'
OUT = ROOT / 'src' / 'bookSummary.json'

DEFAULT_TARGET = 150          # konu başına hedef özet cümlesi (eski özet + kitaptan eklenenler)
BODY_FONT = 'AGaramondPro'    # kitapların gövde yazı tipi
BODY_SIZE = 11.0              # gövde metni puntosu
SUMMARY_SIZE = 10.0           # kitabın kendi "bölüm özeti" sayfalarındaki punto
MIN_SCORE = 2.0               # bundan düşük puanlı cümle özete alınmaz

UP = 'A-ZÇĞİÖŞÜÂÎÛ'
LOW = 'a-zçğıöşüâîû'
_TR_LOWER = str.maketrans({'I': 'ı', 'İ': 'i'})


def lower(text):
    return str(text or '').translate(_TR_LOWER).lower()


STOP = {'bir', 've', 'ile', 'için', 'gibi', 'olan', 'olarak', 'daha', 'kadar', 'ancak', 'fakat', 'veya', 'ya', 'da',
        'de', 'bu', 'şu', 'o', 'her', 'tüm', 'en', 'ise', 'çok', 'göre', 'bunun', 'olup', 'hem', 'ne', 'ki', 'mi',
        'ait', 'yer', 'vb', 'vd'}


def stems(text):
    words = re.sub(r'[^a-zçğıöşüâîû0-9]+', ' ', lower(text)).split()
    return [w[:6] for w in words if len(w) >= 3 and w not in STOP]


# ------------------------------------------------------------------ PDF okuma

def _line_text(line):
    return ''.join(span['text'] for span in line['spans']).replace('\t', ' ')


def _inline_compounds(doc, pages):
    """Satır içinde geçen tireli birleşikler ("teknik-taktik"): satır sonunda bölünmüşse tire korunur."""
    found = set()
    pattern = re.compile(rf'([{UP}{LOW}]{{2,}})-([{LOW}]{{2,}})')
    for pno in pages:
        for a, b in pattern.findall(doc[pno - 1].get_text('text')):
            found.add((lower(a), lower(b)))
    return found


def _join_lines(lines, compounds):
    out = ''
    for raw in lines:
        line = re.sub(r'\s+', ' ', raw).strip()
        if not line:
            continue
        if not out:
            out = line
            continue
        match = re.search(rf'([{UP}{LOW}]{{2,}})-$', out)
        head = re.match(rf'([{LOW}]+)', line)
        if match and head:
            # Satır sonu tirelemesi: "art-" + "tırmak" -> "arttırmak"; gerçek birleşikte tire kalır.
            if (lower(match.group(1)), head.group(1)) in compounds:
                out += line
            else:
                out = out[:-1] + line
        else:
            out += ' ' + line
    return out


def _reading_order(blocks, page_width):
    """Blokları okuma sırasına koyar: tek sütunda yukarıdan aşağı; iki sütunlu bölümde önce sol, sonra sağ sütun."""
    mid = page_width / 2
    ordered, left, right = [], [], []
    for block in sorted(blocks, key=lambda b: (round(b['bbox'][1]), round(b['bbox'][0]))):
        x0, _, x1, _ = block['bbox']
        if x0 < mid - 20 and x1 > mid + 20:      # sayfayı boydan boya kaplayan blok
            ordered += left + right + [block]
            left, right = [], []
        elif (x0 + x1) / 2 < mid:
            left.append(block)
        else:
            right.append(block)
    return ordered + left + right


def _is_body_span(span, summary_page):
    size = round(span['size'], 1)
    return BODY_FONT in span['font'] and (size == BODY_SIZE or (summary_page and size == SUMMARY_SIZE))


def read_unit_paragraphs(doc, first_page, last_page, summary_pages):
    """Ünitenin gövde paragrafları: [{pages, text, summary, heading}] (okuma sırasıyla).

    heading: paragrafın hemen üstündeki (ya da satır başındaki) kalın başlık; yoksa ''.
    """
    pages = list(range(first_page, last_page + 1))
    compounds = _inline_compounds(doc, pages)
    paragraphs = []
    pending_heading = ''
    for pno in pages:
        page = doc[pno - 1]
        is_summary_page = pno in summary_pages
        # Sayfa üst/alt bilgisi (kitap adı, sayfa numarası) okunmaz.
        blocks = [b for b in page.get_text('dict')['blocks']
                  if b['type'] == 0 and b['bbox'][3] >= 62 and b['bbox'][1] <= page.rect.height - 62]
        for block in _reading_order(blocks, page.rect.width):
            body_chars = other_chars = 0
            other_text = ''
            lines = []
            bold_big = True
            for line in block['lines']:
                parts = []
                for span in line['spans']:
                    n = len(span['text'].strip())
                    if _is_body_span(span, is_summary_page):
                        body_chars += n
                        parts.append(span['text'])
                    else:
                        other_chars += n
                        other_text += span['text'] + ' '
                        if n and not ('Bold' in span['font'] and span['size'] >= 10.9):
                            bold_big = False
                lines.append(''.join(parts).replace('\t', ' '))
            total = body_chars + other_chars
            other_text = re.sub(r'\s+', ' ', other_text).strip()
            if total < 3:
                continue
            if body_chars / total < 0.85:
                # Gövde dışı blok: kalın ve kısa ise başlıktır, bir sonraki paragrafa etiket olur.
                if body_chars == 0 and bold_big and 3 <= len(other_text) <= 70 and not re.fullmatch(r'[\d\s.]+', other_text):
                    pending_heading = other_text
                elif total >= 25:
                    pending_heading = ''
                continue
            if total < 40:
                continue
            text = _join_lines(lines, compounds)
            if not text:
                continue
            # Satır başı başlık (aynı blokta kalın yazılmış): bu paragrafın başlığıdır.
            heading = other_text if (other_chars and bold_big and len(other_text) <= 70) else pending_heading
            pending_heading = ''
            is_summary = is_summary_page and any(round(span['size'], 1) == SUMMARY_SIZE for line in block['lines'] for span in line['spans'])
            previous = paragraphs[-1] if paragraphs else None
            # Sayfa/sütun sınırında bölünmüş paragraf: önceki cümle bitmemişse birleştir.
            if previous and not re.search(r'[.!?:…]["”)]?$', previous['text']) and re.match(rf'[{LOW}(]', text) \
                    and previous['summary'] == is_summary:
                previous['text'] = _join_lines([previous['text'], text], compounds)
            else:
                paragraphs.append({'pages': [pno], 'text': text, 'summary': is_summary, 'heading': heading})
    return paragraphs


# ------------------------------------------------------------------ cümle ayıklama

# "(Bompa ve Haff, 2015)", "(Günay vd., 2017; Bompa, 2011: 23)", "(akt. Sevim, 2010)" türü atıflar.
CITATION = re.compile(rf'\s*\((?:akt\.?\s*|bkz\.?\s*)?[{UP}][^()]{{1,160}}?,\s*(?:19|20)\d{{2}}[a-z]?(?:\s*[,:;][^()]{{0,140}})?\)')


def clean_text(text):
    text = str(text or '').replace('ﬁ', 'fi').replace('ﬂ', 'fl').replace('ﬀ', 'ff').replace('\u00ad', '')
    text = CITATION.sub('', text)
    text = re.sub(r'\s+([.,;])', r'\1', text)
    return re.sub(r'\s{2,}', ' ', text).strip()


SENTENCE_SPLIT = re.compile(rf'(?<=[.!?])\s+(?=[{UP}0-9“"(•])')


# Bu kısaltmalardan sonra cümle bitmez ("1904 St. Louis", "Prof. Dr. …", "vb. Nedenlerle").
ABBREVIATION = re.compile(r'(?<![\w])(?:St|Dr|Prof|Doç|Yrd|Mr|Mrs|Ms|No|Av|Sn|Alb|Org|Gen|Bkz|Krş|Örn|örn|vb|vs|vd|bkz|yy|ör|age|MÖ|MS|M\.Ö|M\.S)\.\s')
ENUMERATOR = re.compile(r'^(?:\d{1,2}[.)]|[a-zçğıöşü][.)]|[IVX]{1,4}[.)])$')


def split_book_sentences(text):
    """-> [(cümle, madde_mi)]  madde_mi: "1." / "a)" gibi bir numaranın ardından gelen liste maddesi."""
    out = []
    listed = False
    protected = ABBREVIATION.sub(lambda m: m.group(0)[:-1] + '\u0001', str(text or ''))
    for piece in SENTENCE_SPLIT.split(protected):
        piece = piece.replace('\u0001', ' ').strip()
        if not piece:
            continue
        if ENUMERATOR.match(piece):
            listed = True
            continue
        numbered = re.match(r'^(?:\d{1,2}[.)]|[a-zçğıöşü]\))\s+', piece)
        out.append((piece, listed or bool(numbered)))
        # "… oluşturur., 2." : parça bir madde numarasıyla bitiyorsa sonraki parça liste maddesidir.
        listed = bool(re.search(r'(?:^|[\s,;])\d{1,2}[.)]$', piece))
    return out


# server/production-plan.mjs içindeki splitSummarySentences ile AYNI kural (özet cümleleri
# çalışma anında bu kuralla bölünür; seçilen her cümle tek parça kalmalıdır).
SUMMARY_SPLIT = re.compile(r'(?<=[.!?])\s+(?![a-zçğıöşüâîû])')


def split_summary_sentences(summary):
    return [s.strip() for s in SUMMARY_SPLIT.split(str(summary or '')) if len(s.strip()) >= 25]


ANAPHORIC = re.compile(
    r'^(?:Bu|Bunlar|Bunların|Bunun|Bunu|Buna|Bunda|Bundan|Bununla|Bunlara|Bunlardan|Burada|Buradan|Böyle|Böylece|'
    r'Böylelikle|Böylesi|Ayrıca|Ancak|Fakat|Ama|Dolayısıyla|Örneğin|Çünkü|Öte|Diğer|Diğeri|Söz|Sözü|O|Onlar|Onların|'
    r'Onun|Aynı|Yani|Şu|Nitekim|Oysa|Özetle|Sonuç|Sonuçta|Kısaca|Kısacası|Görüldüğü|Yine|Benzer|İkinci|İkincisi|'
    r'Birincisi|Üçüncü|Üçüncüsü|Son|Daha|Hatta|Zira|Ve|İlk|İlki|Bahsedilen|Belirtilen|Aksi|Öyle|Öyleyse|Bazı|Bazen|'
    r'Ardından|Sonra|Sonrasında|İşte|Kaldı|Özellikle|Genellikle|Tersine|Aksine|Bilakis|Üstelik|Öncelikle|Yukarıda|'
    r'Aşağıda|Her iki|Bütün bu|Tüm bu|Ek olarak|Ne var ki|Bunun yanında|Bunun yanı sıra|Buna karşın|Buna rağmen|'
    r'Ne yazık ki|Kuşkusuz|Elbette|Tabii|Tam tersine|Başka bir|Bir başka|Bir diğer|Diğer bir|Ya da|Veya|Yahut|Hem de|'
    r'Kaldı ki|Öte yandan|Bir yandan|Diğer yandan|Diğer taraftan|İkisi|Her ikisi|Hepsi|Tümü|Bütün bunlar|Tüm bunlar|'
    r'Böyle bir|Gerçekten|Nihayet|Sonunda|Neticede|Kısacası|Görülüyor ki|Anlaşılacağı|Dolayısı ile|Bundan dolayı|'
    r'Bundan sonra|Bundan başka|Bunun için|Bunun sonucunda|Bunun yerine|Bunun dışında|Buna ek olarak|Buna bağlı|'
    r'Temel olarak|Temel fonksiyonları|Temel fonksiyonu|Temel görevi|Temel görevleri|Temel işlevi|Temel işlevleri|'
    r'Görevi|Görevleri|İşlevi|İşlevleri|Kadında|Erkekte|Kadınlarda|Erkeklerde|Tam tersi|Klasik bir örnek|'
    r'Başlangıçta|Başlangıçtaki|Öğrencisi|Öğrencileri|Eseri|Eserleri|Kendisi|Kendi|Zaman içinde|Köklerini|'
    r'Uygulama alanları|Geniş anlamda|Dar anlamda|En geç|En erken|Tek görüş)(?![\w])')
# Cümle içinde önceki cümleye gönderme ("bu görevlerin", "söz konusu yöntem", "bahsedilen").
BACK_REFERENCE = re.compile(r'\b(?:bu|bunlar|bunların|bunları|bunun|buna|bunu|bundan|şu|söz konusu|sözü geçen|bahsedilen|adı geçen|anılan|yukarıdaki)\b')

# Küçük harfe çevrilmiş cümlede aranır.
REJECT_LOWER = [re.compile(p) for p in [
    r'[?!…•■►◆●▪→*]', r'https?:|www\.|\.com|\.org|\.tr\b',
r'\b(?:tablo|şekil|resim|grafik|görsel|fotoğraf|çizelge|şema|harita)\s*\d',
    r'\b(?:tabloda|tablodaki|grafikte|grafikteki|resimde|resimdeki|görselde|görseldeki|şekildeki|çizelgede)\b',
    r'\bşekilde (?:görül|göster|veril|yer al|sunul|belirtil|özetlen)',
    r'\b(?:aşağıda|aşağıdaki|aşağıdakiler|yukarıda|yukarıdaki|şöyle|şunlar|şunlardır|şu şekilde|izleyen|ilerleyen|'
    r'önceki bölüm|sonraki bölüm|bu bölümde|bu ünitede|bu kitap|kitabın|kitapta|ünitede|bölümde|bölümün|ünitenin|'
    r'görüldüğü üzere|görüldüğü gibi|bakınız|bkz|adresinden|adresini|daha önce|önceden değinilen|değinildiği|'
    r'belirtildiği gibi|bahsedildiği|sözü edilen)\b',
    r'(?:ele alın(?:acak|mış|makta|ır)|anlatılacak|değinilecek|incelenecek|açıklanacak|üzerinde durulacak|yer verilecek|'
    r'bir örnektir|örnek olarak verilebilir|örnek verilebilir|örnek gösterilebilir|söylenebilir ki)',
    r'(?:açıklayabilme|sıralayabilme|tanımlayabilme|ayırt edebilme|ilişkilendirebilme|yorumlayabilme|listeleyebilme|'
    r'kavrayabilme|değerlendirebilme|özetleyebilme|karşılaştırabilme|öğrenme çıktı|anahtar sözcük|sıra sizde|'
    r'neler öğrendik|yanıt anahtarı|kaynakça|okuma parçası|araştırınız|tartışınız|inceleyiniz|düşününüz|'
    r'gözden geçiriniz|paylaşınız|karşılaştırınız|açıklayınız|yazınız|belirtiniz)',
    r'\b(?:hangisi|hangisidir|hangileri)\b',
    r'\b(?:isbn|doi|yayınları|yayıncılık|yayınevi|basımevi|matbaa|dergisi|journal|university|press|kitabevi|et al|ibid)\b',
    r'\b(?:ben|biz|bana|bize|benim|bizim|sen|siz|sizin|size|bence|bizce)\b',
    r'\d\s+\d\s+\d', r'["«»]',
]]
REJECT_RAW = [re.compile(p) for p in [
    rf'(?:^|\s)[{UP}]\.(?:\s|$)',            # "T. O." gibi ad baş harfleri (kaynakça / alıntı)
    r'\(\s*\)|\([^)]*$|^[^(]*\)',            # dengesiz parantez
    rf'\s[-–]\s[{UP}]',                      # "Kavram – Açıklama" biçimli tablo/liste kırıntısı
    rf'(?:\s[{UP}]{{4,}}){{2,}}',            # cümle içine yapışmış BÜYÜK HARF başlık
    rf'(?:\s[{UP}][{LOW}]+){{6,}}',          # uzun "Başlık Biçimi" zinciri
]]

# Türkçe bildirme cümlesi yüklemi (cümle yarım kalmış bir kırıntı olmasın).
PREDICATE = re.compile(r'(?:[dt][ıiuü]r|[ıiuüae]r|maz|mez|m[ıiuü]ş|[dt][ıiuü]|mal[ıi]|mel[ıi]|yor|l[ae]r)\.$')

CUE_DEFINITION = re.compile(
    r'\b(?:denir|denilir|denilmektedir|denmektedir|adı verilir|adı verilmektedir|adlandırılır|adlandırılmaktadır|'
    r'tanımlanır|tanımlanmaktadır|tanımlanabilir|tanımlanmıştır|ifade eder|ifade etmektedir|ifade edilir|'
    r'anlamına gelir|anlamına gelmektedir|olarak bilinir|olarak adlandır\w*|olarak tanımla\w*|olarak ifade \w+)')
CUE_STRUCTURE = re.compile(
    r'\b(?:ayrılır|ayrılmaktadır|sınıflandırılır|sınıflandırılmaktadır|oluşur|oluşmaktadır|kapsar|kapsamaktadır|'
    r'içerir|içermektedir|incelenir|incelenmektedir|toplanır|toplanmaktadır|gruplandırılır|gruplanır)\b')
CUE_CONCEPT = re.compile(
    r'\b(?:amacı|amaç|hedefi|ilke|ilkesi|temel|özelliği|özellikleri|türü|türleri|aşama|aşaması|evre|evresi|dönem|'
    r'dönemi|yöntem|yöntemi|model|modeli|kuram|kuramı|yaklaşım|yaklaşımı|faktör|etken|işlevi|görevi|sorumlu|'
    r'gerekir|gereklidir|önemlidir|zorunludur|sağlar|geliştirir|artırır|azaltır|önler|belirler|etkiler)\b')
# Haber/anı anlatımı (görülen geçmiş zaman): ders bilgisi değil, okuma parçasıdır.
PAST_NARRATIVE = re.compile(r'(?:[dt][ıiuü]|[dt][ıiuü]l[ae]r)\.$')
GENERIC_HEADINGS = {'giriş', 'sonuç', 'özet', 'genel bilgiler', 'tanım', 'tanımlar', 'kavramlar', 'temel kavramlar', 'amaç',
                    'kapsam', 'değerlendirme', 'öneriler', 'tartışma', 'genel bakış', 'uygulama', 'örnek', 'örnekler'}


VERBAL_COPULA = re.compile(r'(?:makta|mekte|m[ıiuü]ş|[ae]cak|mal[ıi]|mel[ıi])[dt][ıiuü]r\.$')
ADJECTIVE_PREDICATE = re.compile(
    r'\b(?:vardır|yoktur|değildir|gereklidir|önemlidir|mümkündür|zorunludur|bağlıdır|aittir|farklıdır|benzerdir|fazladır|'
    r'azdır|yüksektir|düşüktür|etkilidir|ilgilidir|ilişkilidir|sorumludur|geçerlidir|yeterlidir|açıktır|gerekmektedir|'
    r'kaçınılmazdır|yaygındır|sınırlıdır|olasıdır|doğaldır|değerlidir|mevcuttur|söz konusudur)\.$')


def is_nominal_definition(sentence):
    """Ad yüklemiyle biten tanım cümlesi mi? ("… sağlayan sistemdir.", "… ayıran düzlemdir.")
    Böyle bir cümle başlığın altında özne almadan yazılır; öznesi başlıktır."""
    low = lower(sentence.strip())
    if not re.search(r'[dt][ıiuü]r\.$', low):
        return False
    return not VERBAL_COPULA.search(low) and not ADJECTIVE_PREDICATE.search(low)


def starts_with_heading_term(heading, sentence):
    """Cümle başlıktaki kavramla mı başlıyor? ("Organlar" + "Organlar, hücre ve dokuların …")
    Başlamıyorsa cümlenin öznesi büyük olasılıkla başlığın kendisidir ("Dolaşım Sistemi" +
    "Vücuttaki kanın dolaşımını sağlayan sistemdir.")."""
    head = {w[:5] for w in stems(heading)}
    first = [w[:5] for w in stems(sentence)[:2]]
    return any(w in head for w in first)


CUE_RESEARCH = re.compile(r'\b(?:araştırma|araştırmada|çalışmada|çalışmasında|bulunmuştur|saptanmıştır|rapor edilmiştir|bildirilmiştir|literatürde)\b')


def assess_sentence(raw, min_chars=60):
    """Cümle özete alınabilir mi?  -> (ok, text, anaphoric, reason)"""
    text = re.sub(r'\s+', ' ', raw).strip()
    if len(text) < min_chars:
        return False, text, False, 'kısa'
    if len(text) > 300:
        return False, text, False, 'uzun'
    if not re.match(rf'[{UP}][{LOW}]', text):
        return False, text, False, 'başlangıç'
    low = lower(text)
    # İki nokta: yalnızca "Terim: tanım cümlesi." biçimi kabul edilir (liste girişi / tablo kırıntısı değil).
    if ':' in text:
        match = re.match(rf'^([^:]{{2,60}}): ([{UP}][^:]{{40,}})$', text)
        if not match or len(match.group(1).split()) > 6 or PREDICATE.search(lower(match.group(1)) + '.'):
            return False, text, False, 'iki nokta'
        # "Aşama: …", "Etkinlik 2: …" gibi sıra etiketleri kavram değildir.
        if re.match(r'^(?:aşama|etkinlik|adım|örnek|madde|basamak|evre|soru|durum|not|uyarı|dikkat|kaynak|oyun|hafta|gün|seviye|düzey)\s*[\divx.]*$', lower(match.group(1))):
            return False, text, False, 'sıra etiketi'
    for pattern in REJECT_LOWER:
        if pattern.search(low):
            return False, text, False, 'yasak:' + pattern.pattern[:24]
    for pattern in REJECT_RAW:
        if pattern.search(text):
            return False, text, False, 'yasak:' + pattern.pattern[:24]
    # Tırnak: yalnızca kısa terim tırnakları (“sinaps”) kabul edilir; konuşma/alıntı cümlesi alınmaz.
    if text.count('“') != text.count('”') or re.search(r'“[^”]{41,}”', text) or re.search(r'”[^“]*”|“[^”]*“', text):
        return False, text, False, 'tırnak'
    if not PREDICATE.search(low):
        return False, text, False, 'yüklem'
    words = text.split(' ')
    if len(words) < 6:
        return False, text, False, 'az kelime'
    if any(len(w) > 32 for w in words):
        return False, text, False, 'bitişik kelime'
    letters = len(re.findall(rf'[{UP}{LOW}]', text))
    if letters / len(text) < 0.74:
        return False, text, False, 'harf oranı'
    if len(split_summary_sentences(text)) != 1 or len(split_summary_sentences(text + ' Sonraki cümle burada başlar ve biter.')) != 2:
        return False, text, False, 'bölünme'
    return True, text, bool(ANAPHORIC.match(text) or BACK_REFERENCE.search(low)), ''


def score_sentence(text, keyword_stems, salience, from_book_summary):
    low = lower(text)
    st = stems(text)
    uniq = set(st)
    score = 0.0
    hits = sum(1 for parts in keyword_stems if all(p in uniq for p in parts))
    score += min(3, hits) * 1.5
    if CUE_DEFINITION.search(low):
        score += 3
    if CUE_STRUCTURE.search(low):
        score += 2
    if CUE_CONCEPT.search(low):
        score += 1
    if re.search(r'\d', text):
        score += 1
    if from_book_summary:
        score += 2.5
    if st:
        score += min(3.0, sum(salience.get(w, 0.0) for w in st) / len(st))
    if len(text) > 240:
        score -= 1
    if CUE_RESEARCH.search(low):
        score -= 1.5
    if PAST_NARRATIVE.search(low):
        score -= 2
    return score


def jaccard(a, b):
    inter = len(a & b)
    union = len(a) + len(b) - inter
    return inter / union if union else 0.0


# Etiket yalnızca ölçüm/test yönergesi cümlelerine eklenir ("Öğrenci …", "Katılımcı …", "ölçülür").
# Kendi öznesi olan cümleye başlık eklemek yanlış bir bilgi cümlesi üretebilir.
PROTOCOL_STEP = re.compile(r'(?:^|\s)(?:öğrenci|katılımcı|deneme|ölçüm|ölçül|testi?\b|test sonu|süre kayd|kaydedil)')

LABEL_STOP = re.compile(
    r'^(?:aşama|etkinlik|adım|örnek|örneğin|madde|basamak|evre|soru|durum|not|uyarı|dikkat|kaynak|oyun|hafta|gün|'
    r'seviye|düzey|kavramlar|gerekli malzemeler|malzemeler|amaç|sonuç|özet|yani|şöyle|bunlar|şunlar)\b')


def paragraph_label(first_sentence):
    """Paragrafı açan "Terim: …" etiketini döndürür (yoksa '')."""
    match = re.match(r'^([^:.;!?]{3,45}):\s+\S', first_sentence)
    if not match:
        return ''
    label = match.group(1).strip()
    words = label.split()
    if len(words) > 5 or not label[0].isupper() or re.match(r'^[\d*•\-]', label):
        return ''
    low = lower(label)
    if LABEL_STOP.match(low) or PREDICATE.search(low + '.') or re.search(r'\b(?:ve|ile|için|gibi|olarak|göre)$', low):
        return ''
    return label


ACTIVITY_INLINE = re.compile(r'(?:Etkinlik(?:ler)?|Oyun)\s*\d+\s*:')
ACTIVITY_PARAGRAPH = re.compile(
    r'^(?:Etkinlik(?:ler)?\s*\d+|Oyun\s*\d+|Kavramlar|Beceri Teması|[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ \-]{0,40}OYUNU?|OYUN)\s*:')


def build_unit_summary(paragraphs, existing_summary, keywords, target=DEFAULT_TARGET, label_steps=False):
    """-> [{pages, sentences}] kitap sırasıyla."""
    existing = split_summary_sentences(existing_summary)
    want = max(0, target - len(existing))
    keyword_stems = [k for k in (stems(k) for k in keywords or []) if k]

    rows_by_par = []
    for par in paragraphs:
        rows = []
        # Uygulama yönergeleri ("Etkinlik 2: Çocuklar dörderli gruplar oluşturur…", "PAS OYUNU: …")
        # sınav bilgisi değil, antrenman tarifidir; paragrafın tamamı atlanır.
        if ACTIVITY_PARAGRAPH.match(par['text'].lstrip()):
            rows_by_par.append(rows)
            continue
        # Paragraf ortasında başlayan yönerge ("Kavramlar: … Etkinlik 2: …"): yönergeden sonrası alınmaz.
        inline = ACTIVITY_INLINE.search(par['text'])
        if inline:
            par = {**par, 'text': par['text'][:inline.start()]}
        heading = re.sub(r'[\s:.]+$', '', par.get('heading') or '')
        labelled = bool(heading) and lower(heading) not in GENERIC_HEADINGS and len(heading) <= 60 and len(heading.split()) <= 6
        subjectless = False
        pieces = split_book_sentences(clean_text(par['text']))
        # "Dikey sıçrama: Öğrenci sıçrama matının üzerinde … bekler. Hızlı şekilde dizlerini bükerek …"
        # Paragraf bir terimle açılıyorsa sonraki cümlelerin konusu da o terimdir (test yönergesi,
        # yapı tarifi). Terim cümlenin başına yazılır; yoksa cümle tek başına neyi anlattığını söylemez.
        par_label = paragraph_label(pieces[0][0]) if pieces else ''
        for index, (raw, listed) in enumerate(pieces):
            if listed:
                rows.append({'ok': False, 'text': raw, 'anaphoric': False, 'reason': 'liste maddesi'})
                continue
            follows_heading = False
            min_chars = 60
            if label_steps and par_label and index > 0 and ':' not in raw and PROTOCOL_STEP.search(lower(raw)) and not starts_with_heading_term(par_label, raw):
                ok, text, anaphoric, reason = assess_sentence(f'{par_label}: {raw}', 45)
                rows.append({'ok': ok, 'text': text, 'anaphoric': False, 'reason': reason, 'labelled': True})
                continue
            if labelled and ':' not in raw and not starts_with_heading_term(heading, raw):
                if index == 0 and not is_nominal_definition(raw):
                    pass                     # kendi öznesi olan olağan cümle: başlık eklenmez
                elif index == 0:
                    # Başlığın hemen altındaki tanım: "Sagittal Düzlem" + "Vücudu … ayıran düzlemdir."
                    # Kitaptaki başlık cümlenin öznesidir; cümle tek başına anlaşılsın diye başa yazılır.
                    raw = f'{heading}: {raw}'
                    subjectless = True
                    min_chars = 40
                elif subjectless:
                    follows_heading = True   # özne hâlâ başlık olabilir: yalnızca önceki cümleyle birlikte alınır
                    min_chars = 45
            ok, text, anaphoric, reason = assess_sentence(raw, min_chars)
            if index == 0 and subjectless:
                anaphoric = False            # "bu sistemde …" başa yazılan başlığı gösterir; cümle kendi başına anlaşılır
            rows.append({'ok': ok, 'text': text, 'anaphoric': anaphoric or follows_heading, 'reason': reason})
        rows_by_par.append(rows)

    freq = Counter()
    total = 0
    for rows in rows_by_par:
        for row in rows:
            if row['ok']:
                total += 1
                freq.update(set(stems(row['text'])))
    salience = {w: (math.log2(1 + n) if 2 <= n <= total * 0.35 else 0.0) for w, n in freq.items()}
    for par, rows in zip(paragraphs, rows_by_par):
        for row in rows:
            if row['ok']:
                row['score'] = score_sentence(row['text'], keyword_stems, salience, par['summary'])
                if row.get('labelled'):
                    row['score'] += 1.5      # terimi belli, kendi başına anlaşılır cümle

    chosen_sets = [set(stems(s)) for s in existing]

    def is_duplicate(tokens):
        return len(tokens) < 4 or any(jaccard(tokens, other) >= 0.55 for other in chosen_sets)

    selected = [set() for _ in rows_by_par]
    count = 0

    def try_select(pi, si):
        nonlocal count
        rows = rows_by_par[pi]
        row = rows[si]
        if not row['ok'] or si in selected[pi]:
            return False
        tokens = set(stems(row['text']))
        if is_duplicate(tokens):
            return False
        if row['anaphoric'] and (si - 1) not in selected[pi]:
            # Önceki cümle (aynı paragraf) seçili olmalı; gerekirse birlikte seçilir.
            if si == 0:
                return False
            prev = rows[si - 1]
            if not prev['ok'] or prev['anaphoric'] or count + 2 > want:
                return False
            prev_tokens = set(stems(prev['text']))
            if is_duplicate(prev_tokens) or jaccard(prev_tokens, tokens) >= 0.55:
                return False
            selected[pi].add(si - 1)
            chosen_sets.append(prev_tokens)
            count += 1
        selected[pi].add(si)
        chosen_sets.append(tokens)
        count += 1
        return True

    # Sayfa başına sıralı aday listesi: her turda her sayfadan en iyi bir cümle (yayılım).
    by_page = {}
    for pi, (par, rows) in enumerate(zip(paragraphs, rows_by_par)):
        for si, row in enumerate(rows):
            if row['ok']:
                by_page.setdefault(par['pages'][0], []).append((row['score'], pi, si))
    queues = [sorted(items, key=lambda x: -x[0]) for _, items in sorted(by_page.items())]
    # Yalnızca puanı yeterli cümleler alınır; gövde metni az olan ünitede hedefin altında kalınır
    # (dolgu cümlesiyle özeti şişirmek soru kalitesini düşürür).
    for min_score in (MIN_SCORE,):
        cursors = [0] * len(queues)
        progressed = True
        while count < want and progressed:
            progressed = False
            for qi, queue in enumerate(queues):
                if count >= want:
                    break
                while cursors[qi] < len(queue):
                    score, pi, si = queue[cursors[qi]]
                    cursors[qi] += 1
                    if score < min_score:
                        cursors[qi] = len(queue)
                        break
                    if try_select(pi, si):
                        progressed = True
                        break

    # Sayfa tabanı: gövde metni olan HER sayfadan en az bir cümle bulunsun (sorular kitabın bütün
    # sayfalarına yayılsın). Puan eşiği burada aranmaz; cümle yine bütün biçim süzgeçlerinden geçmiş
    # olmalıdır. Hedef sayı dolmuş olsa da eklenir.
    for (page, _), queue in zip(sorted(by_page.items()), queues):
        if any(si in selected[pi] for _, pi, si in queue):
            continue
        for score, pi, si in queue:
            want = count + 2
            if try_select(pi, si):
                break

    out = []
    for pi, par in enumerate(paragraphs):
        picks = [rows_by_par[pi][si]['text'] for si in sorted(selected[pi])]
        if not picks:
            continue
        pages = [par['pages'][0]]
        if out and out[-1]['pages'] == pages:
            out[-1]['sentences'].extend(picks)
        else:
            out.append({'pages': pages, 'sentences': picks})
    return out


def base_summary(ctx):
    """Kitap eklemesi öncesindeki (elle yazılmış) özet."""
    text = ctx.get('text', '')
    base_chars = ctx.get('baseChars')
    return text[:base_chars] if isinstance(base_chars, int) else text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=int, default=DEFAULT_TARGET)
    parser.add_argument('--check', action='store_true', help='dosya yazmadan yalnızca rapor ver')
    args = parser.parse_args()

    books = json.loads(BOOK_INDEX.read_text(encoding='utf8'))
    contexts = {c['id']: c for c in json.loads(CONTEXTS.read_text(encoding='utf8'))}
    result = {}
    total_sentences = total_chars = 0
    for bi, book in enumerate(books):
        doc = pymupdf.open(ROOT / 'public' / book['file'].lstrip('/'))
        for ui, unit in enumerate(book['units']):
            uid = f'{bi}-{ui}'
            ctx = contexts[uid]
            summary_pages = set(unit.get('summaryPages') or [])
            last_page = max(summary_pages) if summary_pages else unit.get('testPage', unit['page'] + 1) - 1
            paragraphs = read_unit_paragraphs(doc, unit['page'], last_page, summary_pages)
            base = base_summary(ctx)
            groups = build_unit_summary(paragraphs, base, unit.get('keywords'), args.target)
            # Gövde metni az, ölçüm/test yönergesi çok olan ünite (ör. "Ölçme ve değerlendirme"): hedefin
            # altında kalındıysa yönerge cümleleri test adıyla birlikte ("Dikey sıçrama: …") alınır.
            want = args.target - len(split_summary_sentences(base))
            if sum(len(g['sentences']) for g in groups) < want:
                groups = build_unit_summary(paragraphs, base, unit.get('keywords'), args.target, label_steps=True)
            result[uid] = groups
            n = sum(len(g['sentences']) for g in groups)
            chars = sum(len(' '.join(g['sentences'])) for g in groups)
            total_sentences += n
            total_chars += chars
            base_n = len(split_summary_sentences(base))
            print(f"{uid}  s.{unit['page']}-{last_page}  eski özet {base_n:2d} + kitaptan {n:3d} = {base_n + n:3d} cümle  ({chars} karakter)  {ctx['unit']}")
    print(f'Toplam: kitaptan {total_sentences} cümle, {total_chars} karakter.')
    if not args.check:
        OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
        print(f'Yazıldı: {OUT.relative_to(ROOT)}  (ardından: npm run contexts)')


if __name__ == '__main__':
    main()
