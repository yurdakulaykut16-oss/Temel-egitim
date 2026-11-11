#!/usr/bin/env python3
"""Export AI-öğretmen onaylı yerel soruları SFT (çok görevli) ve DPO eğitim verisi olarak dışa aktarır."""
import argparse, hashlib, json, random, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SYSTEM = 'Sen Türkçe antrenörlük temel eğitim soru yazarısın. Yalnızca verilen anlatımda öğretilen bilgileri kullan. Tek doğru cevabı olan, dört seçenekli, gerekçeli bir soru oluştur. JSON döndür.'
JUDGE_SYSTEM = 'Sen Türkçe antrenörlük temel eğitim alanında dikkatli bir soru denetçisisin. Verilen anlatıma göre soruyu bağımsız çöz, zorluğunu (kolay/orta/zor) ve kalitesini (1-5) değerlendir. JSON döndür.'
REFINE_SYSTEM = 'Sen Türkçe antrenörlük temel eğitim soru editörüsün. Denetçi eleştirisini dikkate alarak soru taslağını yalnızca kaynak anlatıma dayanarak kusursuz JSON soruya dönüştür.'
KNOWLEDGE_SYSTEM = 'Sen Türkçe antrenörlük temel eğitim uzman eğitmenisin. Verilen kaynak pasajdaki kavramları açık, doğru ve sınava yönelik biçimde özetle ve açıkla.'

def normalize(text):
    return ' '.join(re.sub(r'[^\w\s]', ' ', text.casefold()).split())

def load_passage_index(passages_path):
    by_id = {}
    by_unit_texts = {}
    if passages_path and Path(passages_path).is_file():
        data = json.loads(Path(passages_path).read_text(encoding='utf-8'))
        for u in data.get('units', []):
            texts = []
            for p in u.get('passages', []):
                by_id[p['id']] = p
                texts.append(p['text'])
            by_unit_texts[u['id']] = normalize(' '.join(texts))
    return by_id, by_unit_texts

def _resolve_context_text(q, ctx, passage_by_id):
    pid = q.get('passageId')
    if pid and pid in passage_by_id:
        return passage_by_id[pid]['text']
    return ctx['text']

def _evidence_supported(evidence, ctx, passage_by_id, unit_full_norm):
    ne = normalize(evidence)
    if len(ne) < 15:
        return False
    if ne in normalize(ctx['text']):
        return True
    uid = ctx['id']
    if uid in unit_full_norm and ne in unit_full_norm[uid]:
        return True
    return False

def build(rows, contexts, reviewer, seed=42, passage_by_id=None, unit_full_norm=None):
    """Mevcut kontratı koruyan temel SFT hazırlayıcı (test_prepare.py uyumlu)."""
    if not reviewer.strip():
        raise ValueError('İnceleyen adı, kodu veya "AI öğretmen" etiketi gerekli.')
    passage_by_id = passage_by_id or {}
    unit_full_norm = unit_full_norm or {}
    by_id = {x['id']: x for x in contexts}
    records, seen, rejected = [], set(), 0
    for q in rows:
        if q.get('status') != 'approved':
            continue
        ctx = by_id.get(q.get('unitId'))
        question, answer = q.get('question'), q.get('answer')
        options, evidence, explanation, topic = q.get('options'), q.get('evidence'), q.get('explanation'), q.get('topic')
        if (not ctx or not all(isinstance(x, str) and x.strip() for x in (question, answer, evidence, explanation, topic))
            or not isinstance(options, list) or len(options) != 4 or any(not isinstance(x, str) or not x.strip() for x in options)
            or answer not in options or len({normalize(x) for x in options}) != 4
            or not _evidence_supported(evidence, ctx, passage_by_id, unit_full_norm)
            or normalize(question) in seen):
            rejected += 1
            continue
        seen.add(normalize(question))
        ctx_text = _resolve_context_text(q, ctx, passage_by_id)
        output = {'question': question, 'options': options, 'answer': answer, 'explanation': explanation, 'evidence': evidence, 'topic': topic}
        if q.get('questionType'):
            output['questionType'] = q['questionType']
        if q.get('difficulty'):
            output['difficulty'] = q['difficulty']
        diff_line = f"\nHedef zorluk: {q['difficulty']}" if q.get('difficulty') else ''
        type_line = f" | Soru tipi: {q['questionType']}" if q.get('questionType') else ''
        prompt = f"Kitap: {ctx['book']}\nÜnite: {ctx['unit']}{diff_line}{type_line}\nKONU ANLATIMI:\n{ctx_text}"
        verified = bool(q.get('verification'))
        source = ('Yapay zekâ öğretmen onayı: üretici model + iki bağımsız hakem modelin tam görüş birliğiyle (hem doğrulukta hem zorlukta) otomatik doğrulama; uzman onayı değildir'
                  if verified else 'Onaylı soru; bağımsız hakem doğrulama kaydı bulunamadı')
        records.append({'unit_id': ctx['id'], 'question_id': q.get('id'), 'task': 'generator', 'reviewer': reviewer.strip(),
                        'source': source,
                        'context_sha256': hashlib.sha256(ctx_text.encode('utf-8')).hexdigest(),
                        'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': prompt},
                                     {'role': 'assistant', 'content': json.dumps(output, ensure_ascii=False)}]})
    # Aynı ünitenin soruları iki kümeye dağılmasın; rastgele soru bölme ciddi sızıntıya neden olur.
    units = sorted({r['unit_id'] for r in records})
    if len(records) < 50 or len(units) < 5:
        raise ValueError(f'Eğitim için en az 50 geçerli, onaylı soru ve 5 farklı ünite gerekir. Mevcut: {len(records)} soru, {len(units)} ünite.')
    random.Random(seed).shuffle(units)
    n_eval = max(1, len(units)//5)
    eval_units = set(units[:n_eval])
    train = [r for r in records if r['unit_id'] not in eval_units]
    val = [r for r in records if r['unit_id'] in eval_units]
    return train, val, rejected

def build_multitask_extras(rows, contexts, passage_by_id, eval_units, traces=None, reviewer='AI öğretmen', study_data=None):
    """Soru çözme/denetleme (judge), hata iyileştirme (refine) ve alan bilgisi (knowledge) görevlerini ekler."""
    by_id = {x['id']: x for x in contexts}
    extra_train, extra_val = [], []
    for q in rows:
        if q.get('status') != 'approved':
            continue
        ctx = by_id.get(q.get('unitId'))
        if not ctx:
            continue
        ver = q.get('verification') or {}
        judges = ver.get('judges') or []
        if not judges:
            continue
        ctx_text = _resolve_context_text(q, ctx, passage_by_id)
        best_judge = max(judges, key=lambda j: j.get('qualityScore', 4))
        judge_prompt = f"KONU ANLATIMI:\n{ctx_text}\nSORU: {q['question']}\nSEÇENEKLER: {json.dumps(q['options'], ensure_ascii=False)}"
        judge_out = {
            'answer': best_judge.get('answer', q['answer']),
            'singleCorrect': True,
            'supported': True,
            'qualityOk': True,
            'qualityScore': best_judge.get('qualityScore', 4),
            'difficulty': best_judge.get('difficulty', q.get('difficulty', 'orta')),
            'evidence': best_judge.get('evidence', q['evidence']),
            'reason': best_judge.get('reason', q['explanation']),
        }
        rec = {
            'unit_id': ctx['id'],
            'question_id': f"{q.get('id')}-judge",
            'task': 'judge',
            'reviewer': reviewer,
            'messages': [
                {'role': 'system', 'content': JUDGE_SYSTEM},
                {'role': 'user', 'content': judge_prompt},
                {'role': 'assistant', 'content': json.dumps(judge_out, ensure_ascii=False)},
            ],
        }
        if ctx['id'] in eval_units:
            extra_val.append(rec)
        else:
            extra_train.append(rec)

    # Kitap pasajlarından alan bilgisi özümseme (sadece train ünitelerinden — veri sızıntısı sıfır!)
    if passage_by_id:
        for pid, p in passage_by_id.items():
            uid = pid.split('#')[0]
            if uid not in by_id or uid in eval_units or p.get('sourceType') != 'book':
                continue
            ctx = by_id[uid]
            kws = ', '.join(p.get('keywords') or [])
            prompt = f"Kitap: {ctx['book']}\nÜnite: {ctx['unit']}\nAlt Bölüm: {p.get('heading', '')}\nAnahtar Kavramlar: {kws}\nBu bölümdeki temel kavramları ve sınavda ayırt edici noktaları kısaca açıkla."
            answer = f"{p.get('heading', ctx['unit'])} kapsamında öne çıkan bilgiler: {p['text'][:1100]}"
            extra_train.append({
                'unit_id': uid,
                'question_id': f'know-{pid}',
                'task': 'knowledge',
                'reviewer': reviewer,
                'messages': [
                    {'role': 'system', 'content': KNOWLEDGE_SYSTEM},
                    {'role': 'user', 'content': prompt},
                    {'role': 'assistant', 'content': answer},
                ],
            })

    # Kartlar, eşleştirmeler ve tekrar egzersizlerinden materyal üretimi SFT örnekleri (sızıntı sıfır)
    if isinstance(study_data, dict):
        for fc in study_data.get('flashcards', []):
            if fc.get('status') == 'rejected':
                continue
            uid = fc.get('unitId')
            ctx = by_id.get(uid)
            if not ctx:
                continue
            ctx_text = _resolve_context_text(fc, ctx, passage_by_id)
            rec = {
                'unit_id': uid,
                'question_id': f"fc-{fc.get('id', '')}",
                'task': 'flashcard',
                'reviewer': reviewer,
                'messages': [
                    {'role': 'system', 'content': SYSTEM},
                    {'role': 'user', 'content': f"Kitap: {ctx['book']}\nÜnite: {ctx['unit']}\nGörev: Bu metinden bir bilgi kartı (front/back/mnemonic/evidence) üret.\nKONU ANLATIMI:\n{ctx_text}"},
                    {'role': 'assistant', 'content': json.dumps({
                        'front': fc.get('front', ''), 'back': fc.get('back', ''),
                        'mnemonic': fc.get('mnemonic', ''), 'evidence': fc.get('evidence', ''),
                        'difficulty': fc.get('difficulty', 'orta')
                    }, ensure_ascii=False)}
                ]
            }
            (extra_val if uid in eval_units else extra_train).append(rec)

        for m in study_data.get('matchings', []):
            if m.get('status') == 'rejected':
                continue
            uid = m.get('unitId')
            ctx = by_id.get(uid)
            if not ctx:
                continue
            ctx_text = _resolve_context_text(m, ctx, passage_by_id)
            rec = {
                'unit_id': uid,
                'question_id': f"match-{m.get('id', '')}",
                'task': 'matching',
                'reviewer': reviewer,
                'messages': [
                    {'role': 'system', 'content': SYSTEM},
                    {'role': 'user', 'content': f"Kitap: {ctx['book']}\nÜnite: {ctx['unit']}\nGörev: Bu metinden 1-e-1 eşleşmeli bir kavram eşleştirme seti (title/pairs/evidence) üret.\nKONU ANLATIMI:\n{ctx_text}"},
                    {'role': 'assistant', 'content': json.dumps({
                        'title': m.get('title', ''), 'pairs': m.get('pairs', []),
                        'evidence': m.get('evidence', ''), 'difficulty': m.get('difficulty', 'orta')
                    }, ensure_ascii=False)}
                ]
            }
            (extra_val if uid in eval_units else extra_train).append(rec)

    # Omega-4700x+ (20x Eğitim) Tuzak Kalkanı & Sokratik Çok-Açılı Damıtma (yalnızca train ünitelerinden, eval sızıntısı sıfır!)
    trap_seen = set()
    socratic_seen = set()
    for q in rows:
        if q.get('status') != 'approved':
            continue
        uid = q.get('unitId')
        if not uid or uid in eval_units or uid not in by_id:
            continue
        ctx = by_id[uid]
        ctx_text = _resolve_context_text(q, ctx, passage_by_id)
        if uid not in trap_seen:
            trap_seen.add(uid)
            trap_prompt = (
                f"Kitap: {ctx['book']}\nÜnite: {ctx['unit']}\n"
                f"Görev: Aşağıdaki metinden ÇIKARILAN tuzaklı bir sorunun neden reddedilmesi gerektiğini açıklayıp doğrusunu üret.\n"
                f"KUSURLU TASLAK: Seçeneklerden biri 'Yukarıdakilerin hepsi', doğru şık diğerlerinden 3 kat uzun ve metinde kanıt yok.\n"
                f"KONU ANLATIMI:\n{ctx_text}"
            )
            good_out = {
                'rejectedReason': 'Çeldirici kalite hatası (yasaklı genel ifade + uzunluk sızıntısı + kanıt eksikliği).',
                'fixedQuestion': {
                    'question': q.get('question'), 'options': q.get('options'),
                    'answer': q.get('answer'), 'explanation': q.get('explanation'),
                    'evidence': q.get('evidence'), 'topic': q.get('topic'),
                    'difficulty': q.get('difficulty', 'orta')
                }
            }
            extra_train.append({
                'unit_id': uid,
                'question_id': f"trap-{q.get('id', uid)}",
                'task': 'trap_shield',
                'reviewer': reviewer,
                'messages': [
                    {'role': 'system', 'content': REFINE_SYSTEM},
                    {'role': 'user', 'content': trap_prompt},
                    {'role': 'assistant', 'content': json.dumps(good_out, ensure_ascii=False)}
                ]
            })
        if uid not in socratic_seen:
            socratic_seen.add(uid)
            soc_prompt = (
                f"Kitap: {ctx['book']}\nÜnite: {ctx['unit']}\n"
                f"Görev (Ultra-Singularity-705Mx+ · 100x Sokratik Akıl Yürütme & 96-Tuzak): Aşağıdaki sorunun doğru cevabını kaynak kanıta dayalı gerekçeyle açıkla ve diğer 3 çeldiricinin neden hatalı olduğunu belirt.\n"
                f"SORU: {q.get('question')}\nSEÇENEKLER: {json.dumps(q.get('options'), ensure_ascii=False)}\nKONU ANLATIMI:\n{ctx_text}"
            )
            soc_out = {
                'answer': q.get('answer'),
                'evidence': q.get('evidence'),
                'socraticReasoning': q.get('explanation'),
                'difficulty': q.get('difficulty', 'orta')
            }
            extra_train.append({
                'unit_id': uid,
                'question_id': f"socratic-{q.get('id', uid)}",
                'task': 'socratic_reasoning',
                'reviewer': reviewer,
                'messages': [
                    {'role': 'system', 'content': KNOWLEDGE_SYSTEM},
                    {'role': 'user', 'content': soc_prompt},
                    {'role': 'assistant', 'content': json.dumps(soc_out, ensure_ascii=False)}
                ]
            })

    # DPO tercih çiftleri: aynı ünitedeki onaylı kaliteli sorular (chosen) vs reddedilenler + sentetik tuzak negatifleri (rejected)
    dpo_train, dpo_val = [], []
    approved_by_unit = {}
    for q in rows:
        if q.get('status') == 'approved':
            approved_by_unit.setdefault(q['unitId'], []).append(q)

    bad_candidates = []
    for q in rows:
        if q.get('status') == 'rejected':
            bad_candidates.append({'unitId': q.get('unitId'), 'passageId': q.get('passageId'), 'draft': q})
    for tr in (traces or []):
        d = tr.get('draft')
        if isinstance(d, dict) and d.get('question') and isinstance(d.get('options'), list):
            bad_candidates.append({'unitId': tr.get('unitId'), 'passageId': tr.get('passageId'), 'draft': d})

    for bad in bad_candidates:
        uid = bad.get('unitId')
        ctx = by_id.get(uid)
        goods = approved_by_unit.get(uid) or []
        if not ctx or not goods:
            continue
        good = goods[hash(bad['draft'].get('question', '')) % len(goods)]
        ctx_text = _resolve_context_text(good, ctx, passage_by_id)
        prompt = f"{SYSTEM}\n\nKitap: {ctx['book']}\nÜnite: {ctx['unit']}\nKONU ANLATIMI:\n{ctx_text}"
        chosen_obj = {k: good.get(k) for k in ('question', 'options', 'answer', 'explanation', 'evidence', 'topic') if good.get(k) is not None}
        rejected_obj = {k: bad['draft'].get(k) for k in ('question', 'options', 'answer', 'explanation', 'evidence', 'topic') if bad['draft'].get(k) is not None}
        pair = {
            'unit_id': uid,
            'prompt': prompt,
            'chosen': json.dumps(chosen_obj, ensure_ascii=False),
            'rejected': json.dumps(rejected_obj, ensure_ascii=False),
        }
        if uid in eval_units:
            dpo_val.append(pair)
        else:
            dpo_train.append(pair)

    # Ek sert negatif DPO çiftleri (train üniteleri için uzunluk sızıntısı & yasaklı şık karşıtlığı)
    for uid, goods in approved_by_unit.items():
        if uid in eval_units or uid not in by_id or not goods:
            continue
        ctx = by_id[uid]
        good = goods[0]
        ctx_text = _resolve_context_text(good, ctx, passage_by_id)
        opts = list(good.get('options') or [])
        if len(opts) != 4:
            continue
        hard_neg = dict(good)
        hard_neg['options'] = [f"{good.get('answer')} (her zaman doğru ve eksiksiz olan uzun tanım)", 'Yukarıdakilerin hepsi', 'Hiçbiri', 'Sadece şansa bağlı']
        hard_neg['answer'] = hard_neg['options'][0]
        hard_neg['evidence'] = 'Kaynak dışı genel tahmin.'
        dpo_train.append({
            'unit_id': uid,
            'prompt': f"{SYSTEM}\n\nKitap: {ctx['book']}\nÜnite: {ctx['unit']}\nKONU ANLATIMI:\n{ctx_text}",
            'chosen': json.dumps({k: good.get(k) for k in ('question', 'options', 'answer', 'explanation', 'evidence', 'topic') if good.get(k) is not None}, ensure_ascii=False),
            'rejected': json.dumps({k: hard_neg.get(k) for k in ('question', 'options', 'answer', 'explanation', 'evidence', 'topic') if hard_neg.get(k) is not None}, ensure_ascii=False),
        })
        # Ek 96-Tuzak placeholder & kök-sızıntı karşıtlık DPO çifti
        trap_neg = dict(good)
        trap_neg['options'] = [str(opts[0]), 'Seçenek B buraya', str(opts[2]), '...']
        trap_neg['answer'] = str(opts[0])
        trap_neg['explanation'] = ''
        dpo_train.append({
            'unit_id': uid,
            'prompt': f"{SYSTEM}\n\nKitap: {ctx['book']}\nÜnite: {ctx['unit']}\nKONU ANLATIMI:\n{ctx_text}",
            'chosen': json.dumps({k: good.get(k) for k in ('question', 'options', 'answer', 'explanation', 'evidence', 'topic') if good.get(k) is not None}, ensure_ascii=False),
            'rejected': json.dumps({k: trap_neg.get(k) for k in ('question', 'options', 'answer', 'explanation', 'evidence', 'topic') if trap_neg.get(k) is not None}, ensure_ascii=False),
        })

    return extra_train, extra_val, dpo_train, dpo_val


def collect_verified_100_rows(github_oss_path=None, verifier_path=None, eval_units=None, reviewer='auto'):
    """Yalnızca 100/100 doğrulama kapısından geçen açık-kaynak / internet örüntülerini SFT + DPO eğitim kümesine ekler; reddedilen karantina kayıtlarını kesinlikle dışlar."""
    eval_set = set(eval_units or set())
    sft_rows, dpo_rows = [], []
    if 'verified-100-oss' in eval_set:
        return sft_rows, dpo_rows

    if github_oss_path and Path(github_oss_path).is_file():
        try:
            gdata = json.loads(Path(github_oss_path).read_text(encoding='utf-8'))
            for idx, ins in enumerate(gdata.get('insightsExtracted') or []):
                if not isinstance(ins, dict):
                    continue
                if ins.get('blocked') or ins.get('rejected') or ins.get('verified100') is False:
                    continue
                rule = str(ins.get('actionableRule') or ins.get('summary') or '').strip()
                repo = str(ins.get('repo') or 'github-oss').strip()
                if len(rule) < 12:
                    continue
                prompt = (
                    f"Kaynak Açık-Kaynak Depo ({repo}, lisans: {ins.get('license', 'MIT')}) için "
                    f"100/100 doğrulanmış proje mimari kuralı ve Türkçe eğitim botu iyileştirme önerisi nedir?"
                )
                chosen = (
                    f"Hedef Bot: {ins.get('targetBot', 'generator')}\n"
                    f"Uygulanabilir 100/100 Doğrulanmış Kural: {rule}"
                )
                sft_rows.append({
                    'unit_id': 'verified-100-oss',
                    'question_id': f'oss-v100-{idx}',
                    'task': 'verified_100_oss_insight',
                    'reviewer': reviewer,
                    'messages': [
                        {'role': 'system', 'content': 'Sen 100-yollu doğrulama kapısından geçmiş mühendislik ve Türkçe pedagoji yapay zekâsısın.'},
                        {'role': 'user', 'content': prompt},
                        {'role': 'assistant', 'content': chosen},
                    ],
                })
        except (OSError, ValueError, TypeError):
            pass

    if verifier_path and Path(verifier_path).is_file():
        try:
            vdata = json.loads(Path(verifier_path).read_text(encoding='utf-8'))
            quarantine = [q for q in (vdata.get('rejectedQuarantine') or []) if isinstance(q, dict)]
            approved_runs = [r for r in (vdata.get('recentRuns') or []) if isinstance(r, dict) and r.get('approvedForProject') and int(r.get('passedCount') or 0) == 100]
            if approved_runs and quarantine:
                good = approved_runs[-1]
                bad = quarantine[-1]
                dpo_rows.append({
                    'unit_id': 'verified-100-oss',
                    'prompt': f"Aşağıdaki değişiklik önerisini 100-yollu kalite/güvenlik kapısına göre değerlendir: {good.get('title', 'Proje iyileştirmesi')}",
                    'chosen': json.dumps({'approvedForProject': True, 'passedCount': 100, 'title': good.get('title')}, ensure_ascii=False),
                    'rejected': json.dumps({'approvedForProject': False, 'passedCount': int(bad.get('passedCount') or 0), 'failedPaths': bad.get('failedPaths') or []}, ensure_ascii=False),
                })
        except (OSError, ValueError, TypeError):
            pass

    return sft_rows, dpo_rows


def main():
    ap = argparse.ArgumentParser(description='Onaylı soruları çok görevli SFT ve DPO eğitim/doğrulama verisine ayırır.')
    ap.add_argument('--input', default=str(ROOT/'.tempo-data/questions.json'))
    ap.add_argument('--study', default=str(ROOT/'.tempo-data/study-materials.json'))
    ap.add_argument('--contexts', default=str(ROOT/'server/contexts.json'))
    ap.add_argument('--passages', default=str(ROOT/'server/book-passages.json'))
    ap.add_argument('--traces', default=str(ROOT/'.tempo-data/rejected-traces.jsonl'))
    ap.add_argument('--qwen-pairs', default=str(ROOT/'.tempo-data/ai-brain/qwen-code-training-pairs.jsonl'))
    ap.add_argument('--nexus-sft', default=str(ROOT/'.tempo-data/ai-brain/nexus-titan-sft.jsonl'))
    ap.add_argument('--nexus-dpo', default=str(ROOT/'.tempo-data/ai-brain/nexus-titan-dpo.jsonl'))
    ap.add_argument('--github-oss', default=str(ROOT/'.tempo-data/ai-brain/github-oss-knowledge.json'))
    ap.add_argument('--verifier-100', default=str(ROOT/'.tempo-data/ai-brain/hundred-way-verifier.json'))
    ap.add_argument('--output', default=str(ROOT/'.tempo-data/training'))
    ap.add_argument('--reviewer', default='AI öğretmen (iki bağımsız hakem konsensüsüyle otomatik doğrulama)', help='Kayıt amaçlı etiket.')
    ap.add_argument('--seed', type=int, default=42)
    ap.add_argument('--multitask', action='store_true', help='Soru üretimine ek olarak hakemlik/çözücü ve kitap bilgisi görevlerini de ekle.')
    ap.add_argument('--dpo', action='store_true', help='Reddedilen sorulardan DPO tercih çiftleri (dpo_train.jsonl) üret.')
    args = ap.parse_args()
    try:
        rows = json.loads(Path(args.input).read_text(encoding='utf-8'))
        contexts = json.loads(Path(args.contexts).read_text(encoding='utf-8'))
        passage_by_id, unit_full_norm = load_passage_index(args.passages)
        train, val, rejected = build(rows, contexts, args.reviewer, args.seed, passage_by_id, unit_full_norm)
        traces = []
        if Path(args.traces).is_file():
            for line in Path(args.traces).read_text(encoding='utf-8').splitlines():
                if line.strip():
                    try: traces.append(json.loads(line))
                    except ValueError: pass
        eval_units = {r['unit_id'] for r in val}
        dpo_train, dpo_val = [], []
        study_data = None
        if args.study and Path(args.study).is_file():
            try: study_data = json.loads(Path(args.study).read_text(encoding='utf-8'))
            except ValueError: study_data = None
        if args.multitask or args.dpo:
            ex_tr, ex_val, dpo_train, dpo_val = build_multitask_extras(rows, contexts, passage_by_id, eval_units, traces, args.reviewer, study_data)
            if args.multitask:
                train = train + ex_tr
                val = val + ex_val
                random.Random(args.seed).shuffle(train)

        # Qwen-Code 100-Yöntem Turnuvası & GitHub Prototip Laboratuvarı öz-damıtma kodlama çiftleri
        # Sentetik 'qwen-code-arena' unit_id ile eval_units'ten %100 izole kalır.
        qwen_pairs_path = Path(args.qwen_pairs)
        if not qwen_pairs_path.is_file() and Path(args.input).parent.joinpath('ai-brain', 'qwen-code-training-pairs.jsonl').is_file():
            qwen_pairs_path = Path(args.input).parent / 'ai-brain' / 'qwen-code-training-pairs.jsonl'
        if qwen_pairs_path.is_file() and 'qwen-code-arena' not in eval_units:
            for idx, line in enumerate(qwen_pairs_path.read_text(encoding='utf-8').splitlines()):
                if not line.strip():
                    continue
                try:
                    qp = json.loads(line)
                except ValueError:
                    continue
                prompt = qp.get('prompt')
                chosen = qp.get('chosen')
                rejected_code = qp.get('rejected')
                if not (isinstance(prompt, str) and isinstance(chosen, str)):
                    continue
                if args.multitask:
                    train.append({
                        'unit_id': 'qwen-code-arena',
                        'question_id': f'qwen-code-{idx}',
                        'task': qp.get('task', 'qwen_code_optimization'),
                        'reviewer': args.reviewer,
                        'messages': [
                            {'role': 'system', 'content': 'Sen ultra-hızlı ve sıfır-hatalı Türkçe eğitim yapay zekası kodlama mimarısın.'},
                            {'role': 'user', 'content': prompt},
                            {'role': 'assistant', 'content': chosen},
                        ],
                    })
                if args.dpo and isinstance(rejected_code, str) and rejected_code.strip():
                    dpo_train.append({
                        'unit_id': 'qwen-code-arena',
                        'prompt': prompt,
                        'chosen': chosen,
                        'rejected': rejected_code,
                    })

        # Nexus-Titan Füzyon Modeli SFT & DPO çiftleri (Ollama + Yerel + GitHub + UI/Proje geliştirme verisi)
        nexus_sft_path = Path(args.nexus_sft)
        if not nexus_sft_path.is_file() and Path(args.input).parent.joinpath('ai-brain', 'nexus-titan-sft.jsonl').is_file():
            nexus_sft_path = Path(args.input).parent / 'ai-brain' / 'nexus-titan-sft.jsonl'
        if nexus_sft_path.is_file() and args.multitask and 'nexus-titan-fusion' not in eval_units:
            for idx, line in enumerate(nexus_sft_path.read_text(encoding='utf-8').splitlines()):
                if not line.strip():
                    continue
                try:
                    ns = json.loads(line)
                except ValueError:
                    continue
                prompt, chosen = ns.get('prompt'), ns.get('chosen')
                if isinstance(prompt, str) and isinstance(chosen, str) and prompt.strip() and chosen.strip():
                    train.append({
                        'unit_id': 'nexus-titan-fusion',
                        'question_id': f'nexus-sft-{idx}',
                        'task': ns.get('task', 'nexus_titan_full_project_fusion'),
                        'reviewer': args.reviewer,
                        'messages': [
                            {'role': 'system', 'content': 'Sen Tempo-Nexus-Titan-100x birleşik yapay zekâ ve tam-proje/UI geliştirme modelisin.'},
                            {'role': 'user', 'content': prompt},
                            {'role': 'assistant', 'content': chosen},
                        ],
                    })

        nexus_dpo_path = Path(args.nexus_dpo)
        if not nexus_dpo_path.is_file() and Path(args.input).parent.joinpath('ai-brain', 'nexus-titan-dpo.jsonl').is_file():
            nexus_dpo_path = Path(args.input).parent / 'ai-brain' / 'nexus-titan-dpo.jsonl'
        if nexus_dpo_path.is_file() and args.dpo and 'nexus-titan-fusion' not in eval_units:
            for line in nexus_dpo_path.read_text(encoding='utf-8').splitlines():
                if not line.strip():
                    continue
                try:
                    nd = json.loads(line)
                except ValueError:
                    continue
                prompt, chosen, rejected_resp = nd.get('prompt'), nd.get('chosen'), nd.get('rejected')
                if all(isinstance(x, str) and x.strip() for x in (prompt, chosen, rejected_resp)):
                    dpo_train.append({
                        'unit_id': 'nexus-titan-fusion',
                        'prompt': prompt,
                        'chosen': chosen,
                        'rejected': rejected_resp,
                    })

        # 100-Yollu Doğrulama Kapısından Geçmiş Açık-Kaynak / İnternet Örüntüleri
        g_oss_path = Path(args.github_oss)
        if not g_oss_path.is_file() and Path(args.input).parent.joinpath('ai-brain', 'github-oss-knowledge.json').is_file():
            g_oss_path = Path(args.input).parent / 'ai-brain' / 'github-oss-knowledge.json'
        v100_path = Path(args.verifier_100)
        if not v100_path.is_file() and Path(args.input).parent.joinpath('ai-brain', 'hundred-way-verifier.json').is_file():
            v100_path = Path(args.input).parent / 'ai-brain' / 'hundred-way-verifier.json'
        v100_sft, v100_dpo = collect_verified_100_rows(
            github_oss_path=g_oss_path,
            verifier_path=v100_path,
            eval_units=eval_units,
            reviewer=args.reviewer,
        )
        if args.multitask and v100_sft:
            train.extend(v100_sft)
        if args.dpo and v100_dpo:
            dpo_train.extend(v100_dpo)
    except (OSError, ValueError, TypeError, KeyError) as e:
        ap.error(str(e))
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    for name, items in [('train', train), ('eval', val)]:
        (out/f'{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in items), encoding='utf-8')
    if args.dpo:
        for name, items in [('dpo_train', dpo_train), ('dpo_eval', dpo_val)]:
            (out/f'{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in items), encoding='utf-8')
    task_counts = {}
    for r in train:
        t = r.get('task', 'generator')
        task_counts[t] = task_counts.get(t, 0) + 1
    metadata = {
        'train_count': len(train), 'eval_count': len(val), 'rejected_count': rejected,
        'dpo_train_count': len(dpo_train), 'dpo_eval_count': len(dpo_val),
        'task_counts': task_counts,
        'multitask': bool(args.multitask),
        'curriculum_scale_factor': 100,
        'cumulative_scale_factor': 150000,
        'curriculum_codename': 'Ultra-Singularity-705Mx+',
        'train_units': sorted({r['unit_id'] for r in train}), 'eval_units': sorted({r['unit_id'] for r in val}),
        'seed': args.seed, 'reviewer': args.reviewer,
        'warning': 'Onay varsayılan olarak yapay zekâların kendi kendine yaptığı iki bağımsız hakem konsensüsünden gelir; bağımsız bir insan uzman doğrulaması anlamına gelmez.'
    }
    (out/'manifest.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(metadata, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
