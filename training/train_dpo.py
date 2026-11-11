#!/usr/bin/env python3
"""Optional Direct Preference Optimization (DPO) stage using rejected vs approved question pairs."""
import argparse, json, os, tempfile
from pathlib import Path
from budget import DATA, base_headroom, require_headroom

def main():
    ap = argparse.ArgumentParser(description='Onaylı vs reddedilmiş soru çiftleriyle DPO tercih eğitimi (TRL / Axolotl / LLaMA-Factory).')
    ap.add_argument('--data', default='.tempo-data/training')
    ap.add_argument('--sft-adapter', default='.tempo-data/adapter', help='Üzerine DPO uygulanacak SFT adaptörü')
    ap.add_argument('--output', default='.tempo-data/adapter-dpo')
    ap.add_argument('--backend', choices=['trl', 'axolotl', 'llamafactory'], default='trl')
    ap.add_argument('--epochs', type=float, default=1.0)
    ap.add_argument('--beta', type=float, default=0.1)
    ap.add_argument('--learning-rate', type=float, default=5e-5)
    ap.add_argument('--allow-custom-base', action='store_true')
    ap.add_argument('--dry-run', action='store_true', help='Yalnızca DPO config ve veri setini hazırlar, eğitimi başlatmaz')
    args = ap.parse_args()

    if args.backend in ('axolotl', 'llamafactory'):
        import subprocess, sys
        _here = str(Path(__file__).resolve().parent)
        if _here not in sys.path:
            sys.path.insert(0, _here)
        from axolotl_llamafactory import export_datasets_and_configs
        hub_dir = Path(DATA) / 'training-hub'
        q_file = Path(DATA) / 'questions.json'
        questions = []
        if q_file.is_file():
            raw = json.loads(q_file.read_text(encoding='utf-8'))
            questions = raw.get('items', []) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
        res = export_datasets_and_configs(questions_list=questions, passages_list=[], out_dir=hub_dir, beta=args.beta)
        cfg = res['files']['axolotlDpoConfig'] if args.backend == 'axolotl' else res['files']['llamafactoryDpoConfig']
        cmd = [sys.executable, '-m', 'axolotl.cli.train', cfg] if args.backend == 'axolotl' else ['llamafactory-cli', 'train', cfg]
        print(f'DPO ({args.backend}) konfigürasyonu hazırlandı:', cfg)
        if args.dry_run:
            return
        proc = subprocess.run(cmd)
        raise SystemExit(proc.returncode)

    data = Path(args.data)
    sft_dir = Path(args.sft_adapter).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    if not output.is_relative_to(DATA):
        ap.error(f'100 GB hesabı için çıktı klasörü {DATA} altında olmalı.')
    if not (sft_dir/'training-metadata.json').is_file():
        ap.error('Önce SFT eğitimi tamamlanmalıdır (training/train_lora.py).')
    meta = json.loads((sft_dir/'training-metadata.json').read_text(encoding='utf-8'))
    base = meta['base']
    headroom = base_headroom(base, custom=args.allow_custom_base or bool(meta.get('allow_custom_base')))

    dpo_file = data/'dpo_train.jsonl'
    if not dpo_file.is_file():
        ap.error('dpo_train.jsonl bulunamadı. Önce `python training/prepare.py --multitask --dpo` çalıştır.')
    rows = [json.loads(x) for x in dpo_file.read_text(encoding='utf-8').splitlines() if x.strip()]
    if len(rows) < 10:
        ap.error(f'DPO için en az 10 tercih çifti gerekir (mevcut: {len(rows)}).')

    require_headroom(headroom['train'] // 2, 'DPO eğitimi')
    cache = DATA/'huggingface'
    temp = DATA/'tmp'
    cache.mkdir(parents=True, exist_ok=True)
    temp.mkdir(parents=True, exist_ok=True)
    os.environ['HF_HOME'] = str(cache)
    os.environ['HF_HUB_CACHE'] = str(cache/'hub')
    os.environ['TMPDIR'] = str(temp)
    tempfile.tempdir = str(temp)

    try:
        import torch
        from datasets import Dataset
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        from peft import PeftModel
        from trl import DPOConfig, DPOTrainer
    except ImportError as e:
        ap.error(f'DPO bağımlılığı eksik (pip install trl): {e}')
    if not torch.cuda.is_available():
        ap.error('CUDA GPU bulunamadı.')

    use_bf16 = torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if use_bf16 else torch.float16
    tokenizer = AutoTokenizer.from_pretrained(base)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=dtype, bnb_4bit_use_double_quant=True)
    base_model = AutoModelForCausalLM.from_pretrained(base, quantization_config=quant, device_map={'': 0}, torch_dtype=dtype)
    model = PeftModel.from_pretrained(base_model, str(sft_dir), is_trainable=True)

    train_ds = Dataset.from_list(rows)
    dpo_args = DPOConfig(
        output_dir=str(output),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=args.learning_rate,
        lr_scheduler_type='cosine',
        warmup_ratio=0.05,
        beta=args.beta,
        fp16=not use_bf16,
        bf16=use_bf16,
        optim='paged_adamw_8bit',
        gradient_checkpointing=True,
        logging_steps=5,
        save_strategy='epoch',
        report_to='none',
    )
    trainer = DPOTrainer(model=model, args=dpo_args, processing_class=tokenizer, train_dataset=train_ds)
    trainer.train()
    trainer.save_model(str(output))
    tokenizer.save_pretrained(str(output))
    (output/'training-metadata.json').write_text(json.dumps({
        'base': base, 'allow_custom_base': bool(args.allow_custom_base or meta.get('allow_custom_base')),
        'stage': 'dpo', 'upgrade_tier': 'Ultra-Singularity-100x', 'sft_parent': str(sft_dir), 'dpo_pairs': len(rows), 'beta': args.beta
    }, indent=2), encoding='utf-8')
    print('DPO adaptörü kaydedildi:', output)

if __name__ == '__main__':
    main()
