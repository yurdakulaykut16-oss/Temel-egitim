#!/usr/bin/env python3
"""public/books/*.pdf dosyalarındaki 29 ünitenin gerçek 'neler öğrendik?' kitap içi
sorularını ve yanıt anahtarlarını temiz biçimde çıkarır -> server/book-style-questions.json.
"""
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
BOOK_INDEX = ROOT / 'src' / 'bookIndex.json'
CONTEXTS = ROOT / 'server' / 'contexts.json'
OUT = ROOT / 'server' / 'book-style-questions.json'

HYPHEN_FIX = re.compile(r'([A-Za-zÇĞIİÖŞÜçğıöşü]{2,})-\s*\n\s*([a-zçğıöşü]{1,}[A-Za-zÇĞIİÖŞÜçğıöşü]*)')
HEADER_NOISE = re.compile(
    r'^(?:neler\s+öğrendik\??|neler\s+öğrendik\s+yanıt\s+anahtarı|\d{1,3}|'
    r'(?:Hareket ve Antrenman|Spor ve Sağlık|Sporda Yönetim|Sporda Öğrenme|Sporda Psikososyal|Spor Tarihi|Spor Anatomisi|Genel Antrenman|Sporda Beslenme|Dopingle Mücadele|Beceri Öğrenimi|Motor Gelişim)[^\n]{0,75})$',
    re.IGNORECASE,
)


def extract_page_columns(page) -> str:
    w = page.rect.width or 560.0
    mid = w * 0.48
    blocks = [b for b in page.get_text('blocks') if b[6] == 0]
    left, right = [], []
    for x0, y0, x1, y1, raw, *_ in blocks:
        if y1 < 52 or y0 > 758:
            continue
        txt = HYPHEN_FIX.sub(r'\1\2', raw.replace('\r', '\n'))
        lines = [re.sub(r'\s+', ' ', ln).strip() for ln in txt.split('\n')]
        lines = [ln for ln in lines if ln and not HEADER_NOISE.match(ln)]
        if not lines:
            continue
        joined = '\n'.join(lines)
        if x0 < mid and (x1 - x0) < w * 0.62:
            left.append((y0, x0, joined))
        elif x0 >= mid and (x1 - x0) < w * 0.62:
            right.append((y0, x0, joined))
        else:
            left.append((y0, x0, joined))
    left.sort(key=lambda it: (it[0], it[1]))
    right.sort(key=lambda it: (it[0], it[1]))
    return '\n'.join([it[2] for it in left] + [it[2] for it in right])


def extract_test_text(doc, start_page_1based: int, end_page_1based: int) -> str:
    chunks = []
    for pno in range(start_page_1based, end_page_1based + 1):
        if pno < 1 or pno > len(doc):
            continue
        chunks.append(extract_page_columns(doc[pno - 1]))
    return '\n'.join(chunks)


def parse_answer_key(text: str) -> dict[int, tuple[str, str]]:
    answers: dict[int, tuple[str, str]] = {}
    flat = re.sub(r'\s+', ' ', text)
    for m in re.finditer(r'(?:^|\s)(\d{1,2})\.\s*([A-E])\b\s*(?:Yanıtınız\s+yanlış\s+ise\s+[“"]([^”"]+)[”"])?', flat):
        qnum = int(m.group(1))
        letter = m.group(2).upper()
        topic_hint = (m.group(3) or '').strip()
        if 1 <= qnum <= 20 and qnum not in answers:
            answers[qnum] = (letter, topic_hint)
    return answers


def clean_tail_noise(s: str) -> str:
    s = re.sub(r'\s+(?:Yanıtınız\s+yanlış\s+ise|Araştır\s+Yanıt|neler\s+öğrendik|\d{1,2}\.\s*[A-E]\s+Yanıtınız)[\s\S]*$', '', s, flags=re.IGNORECASE)
    s = re.sub(r'([A-Za-zÇĞIİÖŞÜçğıöşü]{2,})-\s+([a-zçğıöşü]{1,})', r'\1\2', s)
    return re.sub(r'\s+', ' ', s).strip()


def parse_questions(text: str) -> list[dict]:
    # Yanıt anahtarı veya Araştır bölümünü soru metninden tamamen kes
    for stop_pat in [r'\bAraştır\s+Yanıt\b', r'\bneler\s+öğrendik\s+yanıt\s+anahtarı\b', r'\b1\.\s*[A-E]\s+Yanıtınız\b', r'\bYanıtınız\s+yanlış\s+ise\b']:
        m_stop = re.search(stop_pat, text, re.IGNORECASE)
        if m_stop:
            text = text[:m_stop.start()]

    lines = [re.sub(r'\s+', ' ', ln).strip() for ln in text.split('\n') if ln.strip()]
    q_blocks = []
    current_num = None
    buf = []
    for ln in lines:
        m = re.match(r'^(\d{1,2})(?:\s+(.+))?$', ln)
        if m and 1 <= int(m.group(1)) <= 15 and not re.match(r'^[A-E]\.', ln):
            num = int(m.group(1))
            if (current_num is None and num == 1) or (current_num is not None and num == current_num + 1):
                if current_num is not None and buf:
                    q_blocks.append((current_num, '\n'.join(buf)))
                current_num = num
                buf = [m.group(2).strip()] if m.group(2) else []
                continue
        if current_num is not None:
            buf.append(ln)
    if current_num is not None and buf:
        q_blocks.append((current_num, '\n'.join(buf)))

    parsed = []
    for num, raw_block in q_blocks:
        flat = re.sub(r'\s+', ' ', raw_block).strip()
        opt_splits = list(re.finditer(r'(?:^|\s)([A-E])[\.\)]\s*', flat))
        letters_wanted = ['A', 'B', 'C', 'D', 'E']
        picked = []
        search_from = 0
        for ltr in letters_wanted:
            found = None
            for m in opt_splits:
                if m.group(1) == ltr and m.start() >= search_from:
                    found = m
                    break
            if found:
                picked.append((ltr, found))
                search_from = found.end()
        if len(picked) < 4:
            continue
        stem = clean_tail_noise(flat[:picked[0][1].start()])
        # Tek harfli düşen baş harf onarımı (nadir PDF drop-cap artığı varsa)
        if stem and stem[0].islower() and stem.startswith('as '):
            stem = 'K' + stem
        opts = {}
        for i, (ltr, m) in enumerate(picked):
            end_pos = picked[i + 1][1].start() if i + 1 < len(picked) else len(flat)
            val = clean_tail_noise(flat[m.end():end_pos])
            if val:
                opts[ltr] = val
        if len(stem) >= 12 and len(opts) >= 4:
            parsed.append({'number': num, 'question': stem, 'optionsByLetter': opts})
    return parsed


def main():
    book_index = json.loads(BOOK_INDEX.read_text(encoding='utf-8'))
    contexts = {c['id']: c for c in json.loads(CONTEXTS.read_text(encoding='utf-8'))}

    all_items = []
    per_unit_counts = {}

    for bi, book in enumerate(book_index):
        pdf_path = ROOT / 'public' / book['file'].lstrip('/')
        doc = pymupdf.open(pdf_path)
        for ui, u in enumerate(book['units']):
            uid = f'{bi}-{ui}'
            ctx = contexts[uid]
            tp = int(u['testPage'])
            ap = int(u.get('answerPage') or (tp + 1))
            next_unit_page = int(book['units'][ui + 1]['page']) if ui + 1 < len(book['units']) else len(doc) + 1
            q_end = min(ap, next_unit_page - 1) if ap >= tp else min(tp + 1, next_unit_page - 1)
            q_text = extract_test_text(doc, tp, max(tp, q_end))
            a_text = extract_test_text(doc, ap, min(ap + 1, next_unit_page - 1))

            parsed_qs = parse_questions(q_text)
            ans_map = parse_answer_key(a_text)

            unit_added = 0
            for q in parsed_qs:
                qno = q['number']
                if qno not in ans_map:
                    continue
                ans_letter, topic_hint = ans_map[qno]
                opts_map = q['optionsByLetter']
                if ans_letter not in opts_map:
                    continue
                correct_text = opts_map[ans_letter]
                wrong_texts = [v for k, v in opts_map.items() if k != ans_letter and v]
                if not correct_text or len(wrong_texts) < 3:
                    continue
                # E şıkkı dışındaki 4 seçenekten (doğru cevap + ilk 3 çeldirici) temiz 4-şıklı yapı oluştur
                all_items.append({
                    'id': f'book-{uid}-{qno}',
                    'unitId': uid,
                    'book': ctx['book'],
                    'unit': ctx['unit'],
                    'topic': topic_hint or ctx['unit'],
                    'question': q['question'],
                    'options5': [opts_map[k] for k in ['A', 'B', 'C', 'D', 'E'] if k in opts_map],
                    'options': [correct_text, *wrong_texts[:3]],
                    'answer': correct_text,
                    'answerLetter': ans_letter,
                    'testPage': tp,
                    'answerPage': ap,
                    'source': 'textbook_official_neler_ogrendik'
                })
                unit_added += 1
            per_unit_counts[uid] = unit_added

    payload = {
        'version': 2,
        'totalQuestions': len(all_items),
        'unitsCovered': sum(1 for v in per_unit_counts.values() if v > 0),
        'perUnitCounts': per_unit_counts,
        'questions': all_items
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Extracted {len(all_items)} real textbook questions across {payload["unitsCovered"]}/29 units -> {OUT}')


if __name__ == '__main__':
    main()
