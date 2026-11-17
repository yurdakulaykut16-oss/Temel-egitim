#!/usr/bin/env python3
"""EZBER ÖZETİ  ->  src/unitBriefs.json

Ders sayfasındaki konu anlatımı uzun ve dağınıktı. Bu betik beş kitabın PDF'lerinden (public/books/*.pdf)
her ünite için KISA ve EKSİKSİZ bir ezber özeti çıkarır:

  - Kitabın o ünitedeki HER başlığı (içindekilerdeki ana konu ve alt konular + gövdedeki alt başlıklar)
    özette yer alır; hiçbir başlık atlanmaz (scripts/test-unit-briefs.mjs bunu doğrular).
  - Her başlık için kitaptan 1-3 "ezberlik" cümle seçilir: tanım ("… denir", "… dır"), sınıflama
    ("… ikiye ayrılır") ve sayı/isim içeren kısa cümleler öne alınır.
  - Başlığın altındaki madde listeleri (•) kısa maddeler olarak ayrıca verilir.
  - Kitaptaki "dikkat" kutuları (yazarın özellikle vurguladığı cümleler) ilgili başlığa eklenir.
  - Cümleler kitaptan BİREBİR alınır; yalnızca atıflar çıkarılır. Yeni bilgi yazılmaz.

Kullanım:
    pip install pymupdf
    python3 scripts/build-unit-briefs.py            # src/unitBriefs.json yazılır
    python3 scripts/build-unit-briefs.py --check    # dosya yazmadan rapor
"""
import argparse
import importlib.util
import json
import re
from pathlib import Path

try:
    import pymupdf
except ImportError as exc:  # pragma: no cover
    raise SystemExit('pymupdf gerekli: pip install pymupdf (yalnız özeti yeniden üretmek için gereklidir).') from exc

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src' / 'unitBriefs.json'

# Kitap okuma kuralları (gövde yazı tipi, başlık eşleme, cümle bölme) özet betiğiyle ortaktır.
_spec = importlib.util.spec_from_file_location('book_summary', ROOT / 'scripts' / 'build-book-summary.py')
bbs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bbs)

MAX_POINT = 230          # bir ezber cümlesinin en fazla uzunluğu (karakter)
MAX_ITEM = 150           # bir liste maddesinin en fazla uzunluğu
MAX_ITEMS = 10
MAX_ITEMS_STORED = 80   # başlık başına saklanan en çok madde (arayüz ilk MAX_ITEMS'ı açık gösterir)
# "Genel dayanıklılık: …" / "Koordinatif faktör; …" gibi terim + tanım cümlesi
LABELLED = re.compile(r'^([A-ZÇĞİÖŞÜ][^:;.!?()]{2,45})[:;]\s+\S')           # başlık başına en fazla liste maddesi
NOTE_FONT_SIZE = 10.0    # "dikkat" kutularının puntosu


# Bilgi taşımayan geçiş cümleleri ("Bu bölümde … ele alınacaktır", "… üzerinde durmak gerekmektedir").
FILLER = re.compile(
    r'\b(?:bu bölümde|bu ünitede|bu başlık altında|bu kısımda|verilmeye çalışıl\w*|ele alınacak\w*|incelenecek\w*|'
    r'değinilecek\w*|açıklanacak\w*|bahsedilecek\w*|anlatılacak\w*|üzerinde (?:ayrıca )?durmak|daha iyi anlaşılabilmesi|'
    r'göz atmak|bakmak (?:gerek|yararlı)\w*|aşağıda (?:verilmiştir|sunulmuştur|açıklanmıştır)|şu şekilde (?:sıralanabilir|özetlenebilir)|'
    r'kitabın bütünü|sık karşımıza çık\w*|(?:araştırma|çalışma|tanım)\w* yapılmıştır|farklı tanımlar|pek çok tanım|birçok tanım)')
FIGURE_REF = re.compile(r'\s*\((?:bkz\.?\s*)?(?:Resim|Şekil|Tablo|Grafik|Görsel)\s*[\d.]+[^)]*\)')


def tidy(text):
    text = bbs.clean_text(text)
    text = FIGURE_REF.sub('', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def shorten(text, limit):
    """Uzun maddeyi cümle / virgül sınırından keser."""
    text = text.strip()
    if len(text) <= limit:
        return text
    first = re.split(r'(?<=[.!?])\s+', text)[0]
    if 25 <= len(first) <= limit:
        return first
    cut = text[:limit]
    for mark in ('; ', ', ', ' '):
        pos = cut.rfind(mark)
        if pos >= limit * 0.55:
            return cut[:pos].rstrip(' ,;:') + '…'
    return cut.rstrip() + '…'


def split_bullets(text):
    """'giriş: • a • b' -> (düz metin, [maddeler])"""
    parts = re.split(r'\s*[•▪■●]\s*', text)
    prose = parts[0]
    items = [tidy(p).strip(' ,;') for p in parts[1:]]
    return prose, [p for p in items if len(p) >= 3]


def split_sentences(text):
    """-> [(cümle, numara)]  numara: cümlenin başındaki "1." / "a)" (yoksa None).

    Özet betiğindeki bölme kuralıyla aynıdır; farkı numarayı saklamasıdır. Böylece gerçek liste maddesi
    ("1. …  2. …") ile sıra sayısıyla başlayan cümle ("18. yüzyıl ortalarından itibaren …") ayrılabilir.
    """
    out = []
    pending = None
    protected = bbs.ABBREVIATION.sub(lambda m: m.group(0)[:-1] + '\u0001', str(text or ''))
    for piece in bbs.SENTENCE_SPLIT.split(protected):
        piece = piece.replace('\u0001', ' ').strip()
        if not piece:
            continue
        if bbs.ENUMERATOR.match(piece):
            pending = piece
            continue
        number = pending
        pending = None
        lead = re.match(r'^(\d{1,2}[.)]|[a-zçğıöşü]\))\s+', piece)
        if lead and number is None:
            number = lead.group(1)
            piece = piece[lead.end():]
        tail = re.search(r'(?:^|[\s,;])(\d{1,2}[.)])$', piece)
        if tail:
            pending = tail.group(1)
            piece = piece[:tail.start()].rstrip(' ,;')
        if piece:
            out.append((piece, number))
    return out


def is_real_list(numbers):
    """Numaralar gerçek bir liste mi? (1 ve 2 ya da a ve b birlikte görülmeli.)"""
    keys = {re.sub(r'[.)]', '', n) for n in numbers if n}
    return {'1', '2'} <= keys or {'a', 'b'} <= keys


def raw_after_heading(doc, page_no, title, stop_titles):
    """Gövde paragrafı bulunamayan başlık için: sayfadaki başlığın hemen altındaki metin."""
    if not page_no:
        return ''
    text = doc[page_no - 1].get_text()
    pattern = r'\s+'.join(re.escape(w) for w in title.split())
    match = re.search(pattern, text, flags=re.I)
    if not match:
        return ''
    rest = text[match.end():match.end() + 700]
    for other in stop_titles:
        other_pattern = r'\s+'.join(re.escape(w) for w in other.split()[:4])
        hit = re.search(other_pattern, rest, flags=re.I) if other_pattern else None
        if hit and hit.start() > 20:
            rest = rest[:hit.start()]
    rest = re.sub(r'-\s*\n\s*', '', rest)
    rest = tidy(rest.replace('\n', ' '))
    pieces = [p for p, _n in split_sentences(rest) if len(p) >= 12]
    out = ''
    for piece in pieces[:3]:
        if len(out) + len(piece) > MAX_POINT:
            break
        out = (out + ' ' + piece).strip()
    return out or shorten(rest, MAX_POINT) if len(rest) >= 25 else out


def read_notes(doc, first_page, last_page, summary_pages):
    """Kitaptaki "dikkat" kutuları: [(sayfa, y, metin)]. Kenar kutusundaki 10 punto gövde yazısı."""
    notes = []
    for pno in range(first_page, last_page + 1):
        if pno in summary_pages:
            continue
        page = doc[pno - 1]
        blocks = [b for b in page.get_text('dict')['blocks'] if b['type'] == 0]
        labels = []
        for b in blocks:
            text = ' '.join(s['text'] for line in b['lines'] for s in line['spans']).strip()
            if bbs.lower(text) == 'dikkat':
                labels.append(b['bbox'])
        if not labels:
            continue
        for b in blocks:
            spans = [s for line in b['lines'] for s in line['spans'] if s['text'].strip()]
            if not spans or not all(bbs.BODY_FONT in s['font'] and round(s['size'], 1) == NOTE_FONT_SIZE for s in spans):
                continue
            # Kutu, "dikkat" etiketinin hemen üstünde / yanında durur.
            if not any(abs(b['bbox'][3] - lab[1]) < 60 or abs(b['bbox'][1] - lab[3]) < 60 for lab in labels):
                continue
            lines = [''.join(s['text'] for s in line['spans']).replace('\t', ' ') for line in b['lines']]
            text = tidy(bbs._join_lines(lines, set()))
            if 30 <= len(text) <= 320:
                notes.append((pno, b['bbox'][1], text))
    return notes


def score(sentence, heading, kept, anaphoric, position=0):
    """position: cümlenin paragraf içindeki sırası (0 = ilk cümle)."""
    low = bbs.lower(sentence)
    value = 0.0
    names_heading = bbs.lower(heading) not in bbs.GENERIC_HEADINGS and bbs.starts_with_heading_term(heading, sentence)
    if bbs.CUE_DEFINITION.search(low):
        value += 3
    elif bbs.is_nominal_definition(sentence) and len(sentence) <= 210:
        # Öznesiz tanım ("… inceleyen alandır.") öznesini bir önceki cümleden alır; paragrafın ortasındaysa
        # başlığın tanımı sanılıp yanlış ezberlenebilir. Yalnızca paragrafın ilk cümlesiyse (özne = başlık) ödüllendirilir.
        value += 2.5 if (position == 0 or names_heading) else -1.5
    if position == 0:
        value += 0.5
    if bbs.CUE_STRUCTURE.search(low):
        value += 2
    if re.search(r'\b(?:olmak üzere|ikiye|üçe|dörde|beşe|altıya)\b', low):
        value += 1.5
    if bbs.CUE_CONCEPT.search(low):
        value += 1
    if re.search(r'\d', sentence):
        value += 1
    if names_heading:
        value += 2
    if sentence in kept:
        value += 1.5
    if len(sentence) <= 140:
        value += 1.5
    elif len(sentence) <= 190:
        value += 0.5
    elif len(sentence) > MAX_POINT:
        value -= 2.5
    if bbs.CUE_RESEARCH.search(low):
        value -= 1.5
    if bbs.PAST_NARRATIVE.search(low):
        value -= 1
    if anaphoric:
        value -= 3
    if FILLER.search(low):
        value -= 8
    return value


NOT_TERM_START = re.compile(
    r'^(örneğin|örnek|yine|toplumlar|bundan|bu|bunlar|bunun|buna|bununla|böylece|ancak|kısaca|diğer|yani|ayrıca|not|kaynak|haber|çoğu|özetle|sonuç|şöyle|'
    r'genel olarak|başka|ilk olarak|son olarak|dolayısıyla|çünkü|özellikle|aynı|her|tüm|bazı|birçok|burada|şekil|tablo|resim|'
    r'ankara|istanbul|i̇stanbul|izmir|i̇zmir|london|new york|champaign|philadelphia|baltimore|boston|oxford|cambridge)\b')
NOT_TERM_INSIDE = re.compile(r'\b(bir|da|de|ile|için|olarak|ise|gibi|kadar|göre|ya da|veya)\b|\d{4}|,')


def is_term(label):
    """'Terim: tanım' cümlesinin baş kısmı gerçekten bir kavram adı mı? (Bağlaç, örnek, kaynakça satırı değil.)"""
    label = label.strip()
    low = bbs.lower(label)
    if re.search(r'(ken|arak|erek|likle|lıkla|ince|ınca)$', low):
        return False   # "… uzanırken:", "… öncelikle:" kavram adı değildir
    return 1 <= len(label.split()) <= 4 and not NOT_TERM_START.search(low) and not NOT_TERM_INSIDE.search(low)


def build_section(paragraphs, heading, kept, has_children):
    """-> {points, list, listIntro}"""
    candidates = []   # (sıra, puan, cümle)
    fallback = []
    items = []
    labels = []       # "Terim: tanım" biçimindeki cümlelerin terimleri (hiçbir tür/kavram adsız kalmasın)
    intro = ''
    order = 0
    for par in paragraphs:
        prose, bullets = split_bullets(par['text'])
        pieces = split_sentences(tidy(prose))
        real_list = is_real_list([n for _p, n in pieces])
        last_sentence = ''
        for position, (raw, number) in enumerate(pieces):
            order += 1
            if number and real_list:
                # Numaralı liste maddesi ("1. …", "a) …").
                if 8 <= len(raw):
                    items.append(shorten(raw.rstrip('.;,'), MAX_ITEM))
                last_sentence = raw
                continue
            label = LABELLED.match(raw.strip())
            if label and is_term(label.group(1)):
                labels.append(label.group(1).strip())
            ok, text, anaphoric, _reason = bbs.assess_sentence(raw, 40)
            text = text.strip()
            if number:
                # Sıra sayısıyla başlayan cümle ("18. yüzyıl ortalarından itibaren …"): sayı cümlenin parçasıdır.
                text = f'{number} {text}'
                ok = 40 <= len(text) <= 300 and text.endswith('.')
                anaphoric = False
            last_sentence = text
            if ok:
                candidates.append((order, score(text, heading, kept, anaphoric, position), text))
            elif 40 <= len(text) <= 300 and re.match(rf'[{bbs.UP}]', text) and not text.endswith('?') and not text.endswith(':'):
                fallback.append((order, text))
        if bullets:
            if not intro and last_sentence.endswith(':') and len(last_sentence) <= 170:
                intro = last_sentence
            items.extend(shorten(b.rstrip('.;,'), MAX_ITEM) for b in bullets)
    usable = [c for c in candidates if len(c[2]) <= MAX_POINT] or candidates
    # Başlık ne kadar uzunsa o kadar cümle; alt başlıkları olan ana konuda ayrıntı altlardadır.
    count = 1 if len(usable) <= 6 else 2 if len(usable) <= 18 else 3
    if has_children or items:
        count = min(count, 2)
    ranked = sorted(usable, key=lambda c: (-c[1], c[0]))
    best = ranked[:1]
    # İlk cümle her durumda alınır (başlık boş kalmasın); diğerleri yalnızca gerçekten ezberlikse.
    best += [c for c in ranked[1:count] if c[1] >= 3]
    # Liste varsa ve en iyi cümle zayıfsa (geçiş cümlesi) yalnızca liste verilir.
    if items and best and best[0][1] < 1:
        best = []
    elif best and best[0][1] < -4 and fallback:
        best = []
    points = [c[2] for c in sorted(best)]
    if not points and not items:
        rest = [text for _o, text in fallback if not FILLER.search(bbs.lower(text))]
        if rest:
            points = [shorten(rest[0], MAX_POINT)]
        elif ranked:
            points = [ranked[0][2]]
    seen = set()
    unique_items = []
    for item in items:
        key = bbs.lower(item)
        if key not in seen and len(item) >= 3:
            seen.add(key)
            unique_items.append(item)
    out = {'points': points}
    if unique_items:
        # Kitaptaki maddelerin tamamı saklanır (en çok MAX_ITEMS_STORED); arayüz ilk MAX_ITEMS'ı gösterir,
        # kalanı "tümünü göster" ile açılır. Böylece liste kısa görünür ama hiçbir madde atılmaz.
        out['list'] = unique_items[:MAX_ITEMS_STORED]
        if len(unique_items) > MAX_ITEMS_STORED:
            out['listMore'] = len(unique_items) - MAX_ITEMS_STORED
        if intro:
            out['listIntro'] = intro
    # Başlıkta "Terim: tanım" kalıbıyla sayılan kavramlar: seçilen cümlelerde ve listede adı geçmeyen
    # varsa hepsi adlarıyla verilir (ör. dayanıklılık türlerinin dördü de).
    shown = bbs.lower(' '.join(points + unique_items))
    names = []
    for name in labels:
        if bbs.lower(name) not in [bbs.lower(n) for n in names]:
            names.append(name)
    if len(names) >= 2 and any(bbs.lower(n) not in shown for n in names):
        out['terms'] = names[:16]
    return out


def display_order(sections, first_seen):
    """Başlıkları kitap sırasıyla ve ana konu → alt konu → alt başlık ağacıyla sıralar."""
    children = {}
    for i, sec in enumerate(sections):
        if sec['level'] > 2 and sec.get('parent') is not None:
            children.setdefault(sec['parent'], []).append(i)
    key = lambda i: (first_seen.get(i, 10 ** 9), sections[i].get('page') or 10 ** 6, i)
    out = []

    def walk(i):
        out.append(i)
        for child in sorted(children.get(i, []), key=key):
            walk(child)
    for i, sec in enumerate(sections):
        if sec['level'] == 2:
            walk(i)
    # Ana konusu bulunamayan başlıklar (olağan dışı) sona eklenir; yine de atlanmaz.
    for i in sorted(range(len(sections)), key=key):
        if i not in out:
            out.append(i)
    return out, children


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='dosya yazmadan yalnızca rapor ver')
    args = parser.parse_args()

    books = json.loads(bbs.BOOK_INDEX.read_text(encoding='utf8'))
    summary = json.loads(bbs.OUT.read_text(encoding='utf8'))
    toc_saved = json.loads(bbs.TOC_OUT.read_text(encoding='utf8'))
    result = {}
    totals = {'sections': 0, 'points': 0, 'items': 0, 'notes': 0, 'chars': 0, 'empty': 0}
    for bi, book in enumerate(books):
        doc = pymupdf.open(ROOT / 'public' / book['file'].lstrip('/'))
        toc = bbs.read_toc(doc)
        for ui, unit in enumerate(book['units']):
            uid = f'{bi}-{ui}'
            summary_pages = set(unit.get('summaryPages') or [])
            last_page = max(summary_pages) if summary_pages else unit.get('testPage', unit['page'] + 1) - 1
            heads = []
            paragraphs = bbs.read_unit_paragraphs(doc, unit['page'], last_page, summary_pages, heads)
            sections = bbs.resolve_sections(toc.get(ui + 1, {'lines': []})['lines'], heads)
            bbs.assign_sections(paragraphs, sections)
            saved = toc_saved[uid]['sections']
            if [s['title'] for s in sections] != [s['title'] for s in saved]:
                raise SystemExit(f'{uid}: başlık listesi src/bookToc.json ile uyuşmuyor; önce "npm run summary" çalıştır.')
            kept = {s for group in summary.get(uid, []) for s in group['sentences']}
            by_section = {}
            first_seen = {}
            for order, par in enumerate(paragraphs):
                if par['summary'] or par['section'] < 0:
                    continue
                by_section.setdefault(par['section'], []).append(par)
                first_seen.setdefault(par['section'], order)
            order, children = display_order(sections, first_seen)
            # "dikkat" kutuları: aynı sayfada başlayan son başlığa (yoksa sayfadan önceki son başlığa) eklenir.
            notes = {}
            section_stems = {i: set(w for par in pars for w in bbs.stems(par['text'])) | set(bbs.stems(sections[i]['title']))
                             for i, pars in by_section.items()}
            for pno, _y, text in read_notes(doc, unit['page'], last_page, summary_pages):
                # Aday başlıklar: o sayfada başlayanlar + sayfadan önce başlayan son başlık. Kutu, kelimeleri en çok
                # örtüşen başlığa yazılır (kenar kutusu iki sütunlu sayfada sıradan bağımsız durur).
                before = [i for i in order if (sections[i].get('page') or 10 ** 6) < pno]
                same = [i for i in order if sections[i].get('page') == pno]
                pool = same + before[-1:]
                words = set(bbs.stems(text))
                target = max(pool, key=lambda i: (len(words & section_stems.get(i, set())), -pool.index(i)), default=None)
                if target is not None:
                    notes.setdefault(target, []).append(text)
            out_sections = []
            for i in order:
                sec = sections[i]
                brief = build_section(by_section.get(i, []), sec['title'], kept, bool(children.get(i)))
                entry = {'i': i, 'title': sec['title'], 'level': sec['level'], 'page': sec.get('page')}
                # Aynı cümle hem ezber cümlesi hem "dikkat" notu olarak iki kez yazılmaz.
                extra = [n for n in notes.get(i, []) if n not in brief['points']]
                entry.update(brief)
                if extra:
                    entry['notes'] = extra
                empty = not entry['points'] and not entry.get('list') and not entry.get('notes')
                if empty and not children.get(i):
                    # Gövde paragrafı eşleşmedi (başlık iki satıra bölünmüş, altında yalnızca kısa bir cümle var vb.):
                    # başlığın hemen altındaki metin doğrudan sayfadan okunur.
                    others = [s['title'] for j, s in enumerate(sections) if j != i]
                    raw = raw_after_heading(doc, sec.get('page'), sec['title'], others)
                    if raw:
                        entry['points'] = [raw]
                    else:
                        # Başlığın altında metin yok (hemen alt başlık / tablo geliyor): içerik sonraki başlıktadır.
                        position = order.index(i)
                        if position + 1 < len(order):
                            entry['next'] = sections[order[position + 1]]['title']
                        totals['empty'] += 1
                        print(f"  ! {uid} içeriği sonraki başlıkta: {sec['title']} (s.{sec.get('page')})")
                out_sections.append(entry)
                totals['sections'] += 1
                totals['points'] += len(entry['points'])
                totals['items'] += len(entry.get('list', []))
                totals['notes'] += len(entry.get('notes', []))
            chars = sum(len(' '.join(e['points'] + e.get('list', []) + e.get('notes', []))) for e in out_sections)
            totals['chars'] += chars
            result[uid] = {'title': toc_saved[uid]['title'], 'firstPage': unit['page'], 'sections': out_sections}
            print(f"{uid}  başlık {len(out_sections):2d}  cümle {sum(len(e['points']) for e in out_sections):3d}  "
                  f"madde {sum(len(e.get('list', [])) for e in out_sections):3d}  {chars:5d} karakter  {toc_saved[uid]['title'][:60]}")
    print(f"Toplam: {totals['sections']} başlık, {totals['points']} ezber cümlesi, {totals['items']} liste maddesi, "
          f"{totals['notes']} dikkat notu, {totals['chars']} karakter; içeriksiz alt başlık: {totals['empty']}.")
    if not args.check:
        # Ünite başına tek satır: dosya küçük kalır (tarayıcıya gider), fark (diff) yine ünite ünite okunur.
        lines = [f'{json.dumps(uid)}:{json.dumps(unit, ensure_ascii=False, separators=(",", ":"))}' for uid, unit in result.items()]
        OUT.write_text('{\n' + ',\n'.join(lines) + '\n}\n', encoding='utf8')
        print(f'Yazıldı: {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
