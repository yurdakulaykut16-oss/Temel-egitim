#!/usr/bin/env python3
"""Compare baseline and adapter on held-out units across format, distractor quality, and solver accuracy."""
import argparse, gc, json, os, re, time
from datetime import datetime, timezone
from pathlib import Path
from budget import DATA, SUPPORTED_BASES, require_headroom

BANNED_OPTION_PATTERN = re.compile(
    r'\b(yukarıdakilerin hepsi|aşağıdakilerin hepsi|yukarıda sayılan tüm maddeler|sayılanların tümü|her ikisi de|hiçbiri|tümü birden|hepsi doğrudur)\b',
    re.IGNORECASE,
)
PLACEHOLDER_OR_INJECT_PATTERN = re.compile(
    r'(?:<script|<\/system>|ignore (?:all )?previous|__proto__|globalThis|lorem ipsum|\bcoming soon\b|seçenek\s*[a-d]\s*buraya|^\.{2,}$)',
    re.IGNORECASE,
)

def norm(s):
    return ' '.join(re.sub(r'[^\w\s]', ' ', s.casefold()).split())

def check_output(text, lesson, existing):
    result = {'json': False, 'fields': False, 'choices': False, 'evidence': False, 'exact_novel': False,
              'option_hygiene': False, 'length_balance': False, 'trap_shield': False, 'error': ''}
    try:
        obj = json.loads(text)
        if not isinstance(obj, dict):
            raise ValueError('JSON nesnesi değil')
        result['json'] = True
        keys = ('question', 'answer', 'explanation', 'evidence', 'topic')
        result['fields'] = all(isinstance(obj.get(k), str) and bool(obj[k].strip()) for k in keys)
        opts = obj.get('options')
        result['choices'] = (
            isinstance(opts, list) and len(opts) == 4
            and all(isinstance(x, str) and x.strip() for x in opts)
            and len({norm(x) for x in opts}) == 4
            and obj.get('answer') in opts
        )
        if isinstance(obj.get('evidence'), str):
            result['evidence'] = len(norm(obj['evidence'])) >= 15 and norm(obj['evidence']) in norm(lesson)
        if isinstance(obj.get('question'), str) and obj['question'].strip():
            result['exact_novel'] = norm(obj['question']) not in existing
        if result['choices']:
            result['option_hygiene'] = not any(BANNED_OPTION_PATTERN.search(o) for o in opts)
            all_fields = ' '.join([str(obj.get('question', '')), str(obj.get('evidence', '')), *[str(o) for o in opts]])
            result['trap_shield'] = not PLACEHOLDER_OR_INJECT_PATTERN.search(all_fields) and not any(
                PLACEHOLDER_OR_INJECT_PATTERN.search(str(o).strip()) for o in opts
            )
            wrong = [o for o in opts if o != obj['answer']]
            avg_wrong = sum(len(o.strip()) for o in wrong) / max(1, len(wrong))
            ans_len = len(obj['answer'].strip())
            result['length_balance'] = not (ans_len >= 36 and avg_wrong > 0 and (ans_len / avg_wrong) >= 2.6)
        result['question'] = obj.get('question', '')
    except (ValueError, TypeError) as e:
        result['error'] = str(e)[:200]
    result['format_pass'] = all(result[k] for k in ('json', 'fields', 'choices', 'evidence', 'exact_novel'))
    result['quality_pass'] = result['format_pass'] and result['option_hygiene'] and result['length_balance'] and result['trap_shield']
    return result

def one_per_unit(rows):
    seen = set()
    out = []
    for row in rows:
        if row['unit_id'] not in seen:
            out.append(row)
            seen.add(row['unit_id'])
    return out

def main():
    ap = argparse.ArgumentParser(description='Eğitimde görülmeyen ünitelerde taban/adaptör biçim, kalite ve çözücü doğruluk karşılaştırması')
    ap.add_argument('--data', default=str(DATA/'training'))
    ap.add_argument('--adapter', default=str(DATA/'adapter'))
    ap.add_argument('--max-new-tokens', type=int, default=640)
    ap.add_argument('--eval-solver', action='store_true', help='Held-out ünite sorularında çözücü doğruluk oranını (%) da ölç.')
    args = ap.parse_args()
    data = Path(args.data)
    adapter = Path(args.adapter).resolve()
    if not adapter.is_relative_to(DATA):
        ap.error(f'Adaptör {DATA} altında olmalı.')
    try:
        train = [json.loads(x) for x in (data/'train.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
        val = [json.loads(x) for x in (data/'eval.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
        meta = json.loads((adapter/'training-metadata.json').read_text(encoding='utf-8'))
        cfg = json.loads((adapter/'adapter_config.json').read_text(encoding='utf-8'))
        bank = json.loads((Path(__file__).resolve().parents[1]/'server/question-bank.json').read_text(encoding='utf-8'))
        is_custom = bool(meta.get('allow_custom_base'))
        if meta['base'] != cfg['base_model_name_or_path'] or (meta['base'] not in SUPPORTED_BASES and not is_custom):
            raise ValueError('Taban model/adaptör eşleşmiyor.')
        if not train or not val or {r['unit_id'] for r in train} & {r['unit_id'] for r in val}:
            raise ValueError('Veri kümeleri boş veya ünite sızıntısı var.')
        require_headroom(500_000_000, 'Değerlendirme')
    except (OSError, ValueError, KeyError, TypeError) as e:
        ap.error(str(e))
    os.environ['HF_HOME'] = str(DATA/'huggingface')
    os.environ['HF_HUB_CACHE'] = str(DATA/'huggingface'/'hub')
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from peft import PeftModel
    except ImportError as e:
        ap.error(f'Bağımlılık eksik: {e}')
    if not torch.cuda.is_available():
        ap.error('CUDA GPU bulunamadı.')

    use_bf16 = torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if use_bf16 else torch.float16
    tokenizer = AutoTokenizer.from_pretrained(meta['base'])
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
    gen_val = [r for r in val if r.get('task', 'generator') == 'generator'] or val
    tests = one_per_unit(gen_val)
    solver_rows = [r for r in val if r.get('task') == 'judge'][:15] if args.eval_solver else []

    results = {}
    solver_scores = {}
    known = {norm(q['question']) for q in bank}
    for label in ('base', 'adapter'):
        quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=dtype, bnb_4bit_use_double_quant=True)
        model = AutoModelForCausalLM.from_pretrained(meta['base'], quantization_config=quant, device_map={'': 0}, torch_dtype=dtype)
        if label == 'adapter':
            model = PeftModel.from_pretrained(model, str(adapter))
        model.eval()
        entries = []
        local_seen = set(known)
        for row in tests:
            messages = row['messages'][:2]
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = tokenizer(prompt, return_tensors='pt', add_special_tokens=False).to('cuda')
            start = time.monotonic()
            with torch.no_grad():
                generated = model.generate(**inputs, do_sample=False, max_new_tokens=args.max_new_tokens, pad_token_id=tokenizer.pad_token_id)
            raw = tokenizer.decode(generated[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True).strip()
            lesson = messages[1]['content'].split('KONU ANLATIMI:\n', 1)[-1]
            report = check_output(raw, lesson, local_seen)
            if isinstance(report.get('question'), str):
                local_seen.add(norm(report['question']))
            entries.append({'unit_id': row['unit_id'], 'seconds': round(time.monotonic()-start, 2), 'checks': report, 'output': raw})
        results[label] = entries

        if solver_rows:
            correct = 0
            for srow in solver_rows:
                prompt = tokenizer.apply_chat_template(srow['messages'][:2], tokenize=False, add_generation_prompt=True)
                inputs = tokenizer(prompt, return_tensors='pt', add_special_tokens=False).to('cuda')
                with torch.no_grad():
                    generated = model.generate(**inputs, do_sample=False, max_new_tokens=400, pad_token_id=tokenizer.pad_token_id)
                raw = tokenizer.decode(generated[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True).strip()
                try:
                    pred = json.loads(raw).get('answer', '')
                    gold = json.loads(srow['messages'][2]['content']).get('answer', '')
                    if norm(pred) == norm(gold):
                        correct += 1
                except Exception:
                    pass
            solver_scores[label] = {'total': len(solver_rows), 'correct': correct, 'accuracy_pct': round(100 * correct / len(solver_rows), 1)}

        del model
        gc.collect()
        torch.cuda.empty_cache()

    report = {
        'base_model': meta['base'],
        'held_out_units': [r['unit_id'] for r in tests],
        'samples_per_unit': 1,
        'results': results,
        'solver_accuracy': solver_scores,
        'limitations': 'Biçim, alıntı, çeldirici dengesi ve istenirse çözücü doğruluğunu ölçer; yine de uzman incelemesi önerilir.'
    }
    report['counts'] = {
        name: {
            'total': len(entries),
            'format_pass': sum(e['checks']['format_pass'] for e in entries),
            'quality_pass': sum(e['checks']['quality_pass'] for e in entries),
        }
        for name, entries in results.items()
    }
    target = DATA/'evaluations'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    target.mkdir(parents=True, exist_ok=False)
    (target/'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'counts': report['counts'], 'solver_accuracy': solver_scores}, ensure_ascii=False, indent=2))
    print('Rapor:', target/'comparison.json')

if __name__ == '__main__':
    main()
