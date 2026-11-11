#!/usr/bin/env python3
"""public/books/*.pdf dosyalarındaki 5 ders kitabının 29 ünitesini temiz pasajlara böler.

Çıktı: server/book-passages.json
Runtime'da Ollama sunucusu doğrudan bu JSON dosyasını okur; ek PDF bağımlılığı gerekmez.
"""
import json
import re
from pathlib import Path

try:
    import pymupdf
except ImportError as exc:
    raise SystemExit(
        'pymupdf gerekli: pip install pymupdf (yalnız PDF yenilemesi için gereklidir).'
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
BOOK_INDEX = ROOT / 'src' / 'bookIndex.json'
CONTEXTS = ROOT / 'server' / 'contexts.json'
OUT = ROOT / 'server' / 'book-passages.json'

HYPHEN_LINE = re.compile(r'([A-Za-zÇĞIİÖŞÜçğıöşü]{2,})-\s*\n\s*([a-zçğıöşü]{1,}[A-Za-zÇĞIİÖŞÜçğıöşü]*)')
MULTI_SPACE = re.compile(r'[ \t]+')
NOISE_LINES = re.compile(
    r'^(?:Araştır\s*\d*|İlişkilendir|Anlat/Paylaş|Yaşamla İlişkilendir|Öğrenme Çıktısı|Dikkat|İnternet)\s*$',
    re.IGNORECASE,
)


def clean_block_text(raw: str) -> str:
    text = raw.replace('\r', '\n').replace('\t', ' ')
    # Satır sonu Türkçe tirelemeleri birleştir (örn. "Tanımlar-\ndan" -> "Tanımlardan")
    text = HYPHEN_LINE.sub(r'\1\2', text)
    lines = []
    for line in text.split('\n'):
        stripped = MULTI_SPACE.sub(' ', line).strip()
        if not stripped or NOISE_LINES.match(stripped):
            continue
        lines.append(stripped)
    if not lines:
        return ''
    joined = ' '.join(lines)
    joined = MULTI_SPACE.sub(' ', joined).strip()
    return joined


def is_diagram_noise(text: str, x0: float, y0: float, x1: float, y1: float) -> bool:
    if not text:
        return True
    # Sayfa üst/alt bilgi ve tek başına sayfa numarası
    if y1 < 62 or y0 > 745:
        return True
    if text.isdigit() and len(text) <= 3:
        return True
    if re.fullmatch(r'(?:Bölüm\s+\d+|\d+\s+[A-ZÇĞIİÖŞÜ].{0,60})', text) and y0 < 95:
        return True
    # Sadece URL veya aspx yönlendirme kutuları
    if 'http://' in text or 'https://' in text or '.aspx' in text or 'adresini ziyaret' in text:
        return True
    # Çok kısa izole şekil etiketleri (tek satırda başlık olmayan mini kutucuklar)
    if len(text) < 25 and not text.endswith(('.', ':', '?', '!')) and (x1 - x0) < 160:
        return True
    if re.match(r'^(?:Şekil|Tablo|Grafik)\s+\d+\.\d+\b', text) and len(text) < 110:
        return True
    if re.match(r'^Kaynak\s*:', text) and len(text) < 90:
        return True
    return False


def extract_page_blocks(page) -> list[tuple[str, bool]]:
    """Sayfa bloklarını iki sütunlu okuma sırasına göre çıkarır."""
    width = page.rect.width or 560.0
    mid_x = width * 0.49
    raw_blocks = [b for b in page.get_text('blocks') if b[6] == 0]
    items = []
    for x0, y0, x1, y1, raw, *_ in raw_blocks:
        cleaned = clean_block_text(raw)
        if is_diagram_noise(cleaned, x0, y0, x1, y1):
            continue
        is_wide = (x1 - x0) > width * 0.54 and x0 < mid_x and x1 > mid_x + 40
        items.append((x0, y0, x1, y1, cleaned, is_wide))

    # Y ekseninde tam genişlikli (wide) bloklara göre yatay bantlara ayır,
    # her bant içinde önce sol sütun (yukarıdan aşağı), sonra sağ sütun (yukarıdan aşağı).
    items.sort(key=lambda it: (it[1], it[0]))
    ordered: list[tuple[str, bool]] = []
    left_col, right_col = [], []

    def flush_cols():
        left_col.sort(key=lambda it: it[1])
        right_col.sort(key=lambda it: it[1])
        for it in left_col:
            ordered.append((it[4], looks_like_heading(it[4])))
        for it in right_col:
            ordered.append((it[4], looks_like_heading(it[4])))
        left_col.clear()
        right_col.clear()

    for it in items:
        x0, y0, x1, y1, text, is_wide = it
        if is_wide:
            flush_cols()
            ordered.append((text, looks_like_heading(text)))
        elif x0 < mid_x:
            left_col.append(it)
        else:
            right_col.append(it)
    flush_cols()
    return ordered


def looks_like_heading(text: str) -> bool:
    if len(text) > 95 or len(text) < 4:
        return False
    if text.endswith(('.', '?', '!', ';', ',')):
        return False
    words = text.split()
    if len(words) > 12:
        return False
    # Başlık genelde büyük harfle başlar ve tüm cümle noktalaması içermez
    return text[0].isupper()


def chunk_unit(paragraphs: list[dict], target_min=1400, target_max=2300) -> list[dict]:
    chunks: list[dict] = []
    buf: list[str] = []
    pages: set[int] = set()
    current_heading = ''
    chunk_heading = ''
    buf_len = 0

    def flush():
        nonlocal buf, buf_len, pages, chunk_heading
        text = ' '.join(buf).strip()
        if len(text) >= 300:
            chunks.append({
                'heading': chunk_heading or current_heading or 'Konu Anlatımı',
                'pages': sorted(pages),
                'text': text,
            })
        buf = []
        buf_len = 0
        pages = set()
        chunk_heading = ''

    for p in paragraphs:
        txt = p['text']
        if p['is_heading']:
            current_heading = txt
            if buf_len >= target_min:
                flush()
            if not chunk_heading:
                chunk_heading = txt
            # Başlığı sonraki paragrafın başına bağlam olarak koy
            buf.append(txt + ':')
            buf_len += len(txt) + 2
            pages.add(p['page'])
            continue

        if buf_len + len(txt) > target_max and buf_len >= target_min:
            flush()
            chunk_heading = current_heading

        if not chunk_heading:
            chunk_heading = current_heading
        buf.append(txt)
        buf_len += len(txt) + 1
        pages.add(p['page'])

    flush()
    # Son parça çok kısaysa bir öncekine ekle
    if len(chunks) >= 2 and len(chunks[-1]['text']) < 550:
        last = chunks.pop()
        chunks[-1]['text'] = (chunks[-1]['text'] + ' ' + last['text']).strip()
        chunks[-1]['pages'] = sorted(set(chunks[-1]['pages']) | set(last['pages']))
    return chunks


def main():
    book_index = json.loads(BOOK_INDEX.read_text(encoding='utf-8'))
    contexts = json.loads(CONTEXTS.read_text(encoding='utf-8'))
    ctx_by_id = {c['id']: c for c in contexts}

    all_units = []
    total_passages = 0
    total_chars = 0

    for bi, book in enumerate(book_index):
        pdf_path = ROOT / 'public' / book['file'].lstrip('/')
        doc = pymupdf.open(pdf_path)
        units = book['units']
        for ui, u in enumerate(units):
            uid = f'{bi}-{ui}'
            ctx = ctx_by_id[uid]
            start_idx = max(0, u['page'] - 1)
            next_start = units[ui + 1]['page'] - 1 if ui + 1 < len(units) else len(doc)
            test_idx = max(start_idx, u['testPage'] - 1)
            body_end = min(next_start, test_idx)

            paragraphs = []
            for p_idx in range(start_idx, body_end):
                page_num = p_idx + 1
                for txt, is_head in extract_page_blocks(doc[p_idx]):
                    paragraphs.append({'page': page_num, 'text': txt, 'is_heading': is_head})

            book_chunks = chunk_unit(paragraphs)
            passages = [
                {
                    'id': f'{uid}#00',
                    'heading': 'Ünite Özeti ve Temel Kavramlar',
                    'pages': u.get('summaryPages', [u['page']]),
                    'keywords': u.get('keywords', []),
                    'sourceType': 'summary',
                    'text': ctx['text'],
                }
            ]
            for idx, ch in enumerate(book_chunks, start=1):
                matched_kw = [kw for kw in u.get('keywords', []) if kw.casefold() in ch['text'].casefold()]
                passages.append({
                    'id': f'{uid}#{idx:02d}',
                    'heading': ch['heading'],
                    'pages': ch['pages'],
                    'keywords': matched_kw or u.get('keywords', [])[:3],
                    'sourceType': 'book',
                    'text': ch['text'],
                })

            total_passages += len(passages)
            total_chars += sum(len(p['text']) for p in passages)
            all_units.append({
                'id': uid,
                'book': ctx['book'],
                'unit': ctx['unit'],
                'file': book['file'],
                'keywords': u.get('keywords', []),
                'summaryPages': u.get('summaryPages', []),
                'passages': passages,
            })

    payload = {
        'version': 1,
        'totalUnits': len(all_units),
        'totalPassages': total_passages,
        'totalChars': total_chars,
        'units': all_units,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Tamamlandı: {len(all_units)} ünite, {total_passages} pasaj, {total_chars:,} karakter -> {OUT}')


if __name__ == '__main__':
    main()
