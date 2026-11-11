#!/usr/bin/env python3
"""Optional, local-only QLoRA/DoRA training. Supports 3B-8B models on NVIDIA 12GB+ GPUs."""
import argparse, json, os, gc, subprocess, sys, tempfile
from ollama_export import preflight, generated_name
from budget import DATA, SUPPORTED_BASES, base_headroom, require_headroom
from pathlib import Path

ALL_LINEAR = ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj']

def adapter_options(mode):
    common = {'bias': 'none', 'task_type': 'CAUSAL_LM'}
    if mode == 'compact':
        # Qwen2.5-3B: 24 q_proj layers * rank 1 * (2048 + 2048) = 98,304 trainable weights.
        return {**common, 'r': 1, 'lora_alpha': 2, 'lora_dropout': 0.05, 'target_modules': ['q_proj'],
                'layers_to_transform': list(range(24)), 'layers_pattern': 'layers'}
    if mode == 'pro':
        return {**common, 'r': 16, 'lora_alpha': 32, 'lora_dropout': 0.05, 'use_rslora': True,
                'target_modules': ALL_LINEAR}
    if mode == 'dora':
        return {**common, 'r': 16, 'lora_alpha': 32, 'lora_dropout': 0.05, 'use_dora': True,
                'target_modules': ALL_LINEAR}
    if mode == 'ultra':
        return {**common, 'r': 32, 'lora_alpha': 64, 'lora_dropout': 0.05, 'use_rslora': True,
                'target_modules': ALL_LINEAR}
    if mode == 'mega':
        return {**common, 'r': 64, 'lora_alpha': 128, 'lora_dropout': 0.05, 'use_dora': True,
                'target_modules': ALL_LINEAR}
    if mode == 'omega':
        return {**common, 'r': 128, 'lora_alpha': 256, 'lora_dropout': 0.03, 'use_dora': True, 'use_rslora': True,
                'target_modules': ALL_LINEAR}
    if mode == 'singularity':
        return {**common, 'r': 256, 'lora_alpha': 512, 'lora_dropout': 0.02, 'use_dora': True, 'use_rslora': True,
                'target_modules': ALL_LINEAR}
    return {**common, 'r': 8, 'lora_alpha': 16, 'lora_dropout': 0.05, 'target_modules': ['q_proj', 'k_proj', 'v_proj', 'o_proj']}

def validate_trainable(count, mode):
    if count <= 0:
        raise ValueError('Eğitilebilir adaptör parametresi bulunamadı.')
    if mode == 'compact' and not 90_000 <= count <= 110_000:
        raise ValueError(f'Kompakt adaptör beklenen ~100 bin aralığında değil: {count:,}. Model mimarisini kontrol et.')

def main():
    parser = argparse.ArgumentParser(description='Çok görevli yerel soru/hakem verisiyle QLoRA/DoRA eğitimi.')
    parser.add_argument('--data', default='.tempo-data/training')
    parser.add_argument('--output', default='.tempo-data/adapter')
    parser.add_argument('--base', default='Qwen/Qwen2.5-3B-Instruct',
                        help=f'Taban Hugging Face modeli. Önerilenler: {", ".join(SUPPORTED_BASES)}')
    parser.add_argument('--allow-custom-base', action='store_true', help='Listede olmayan özel Hugging Face modeline izin ver.')
    parser.add_argument('--max-length', type=int, default=3072)
    parser.add_argument('--epochs', type=float, default=3)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--adapter-size', choices=['compact', 'standard', 'pro', 'dora', 'ultra', 'mega', 'omega', 'singularity'], default='pro',
                        help='compact: ~98K param; standard: r=8; pro: r=16 rsLoRA; dora: DoRA r=16; ultra: r=32; mega: r=64 DoRA; omega: r=128 DoRA+rsLoRA; singularity: r=256 Ultra-Singularity 100x')
    parser.add_argument('--neftune-noise-alpha', type=float, default=5.0, help='NEFTune embedding gürültü katsayısı (0 = kapalı)')
    parser.add_argument('--learning-rate', type=float, default=0.0002)
    parser.add_argument('--llama-dir', default=os.environ.get('LLAMA_CPP_DIR'), help='Derlenmiş llama.cpp klasörü')
    parser.add_argument('--ollama-name', default=None, help='Yeni Ollama adı; varsayılan benzersiz isimdir')
    parser.add_argument('--skip-ollama-import', action='store_true', help='Eğitim sonrası otomatik aktarımı kapat')
    args = parser.parse_args()

    data = Path(args.data)
    output = Path(args.output).expanduser().resolve()
    if not output.is_relative_to(DATA):
        parser.error(f'100 GB hesabı için çıktı klasörü {DATA} altında olmalı.')
    try:
        headroom = base_headroom(args.base, custom=args.allow_custom_base)
    except ValueError as e:
        parser.error(str(e))
    if args.adapter_size == 'compact' and args.base != 'Qwen/Qwen2.5-3B-Instruct':
        parser.error('compact adaptör yalnız Qwen/Qwen2.5-3B-Instruct için tanımlıdır; 4B/7B/8B modeller için standard, pro veya dora seç.')

    try:
        train = [json.loads(x) for x in (data/'train.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
        valid = [json.loads(x) for x in (data/'eval.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    except (OSError, ValueError) as e:
        parser.error(f'Önce training/prepare.py çalıştırılmalı: {e}')
    if not train or not valid or {x['unit_id'] for x in train} & {x['unit_id'] for x in valid}:
        parser.error('Boş veri veya eğitim/doğrulama üniteleri arasında sızıntı var.')
    if args.max_length < 512:
        parser.error('max-length en az 512 olmalı.')
    if (Path(args.output)/'adapter_config.json').exists():
        parser.error('Çıktı klasöründe bir adaptör zaten var; üzerine yazmamak için --output ile yeni bir klasör seç.')
    target_name = args.ollama_name or generated_name()
    if not args.skip_ollama_import:
        try:
            preflight(args.llama_dir, target_name)
        except (ValueError, OSError, subprocess.SubprocessError) as e:
            parser.error(f'Eğitim öncesi Ollama aktarım kontrolü başarısız: {e}. Yalnız adaptör eğitmek için --skip-ollama-import kullan.')
    try:
        require_headroom(headroom['train'], 'Eğitim ve model önbelleği')
    except (ValueError, OSError) as e:
        parser.error(str(e))

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
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig, Trainer, TrainingArguments, TrainerCallback
        from peft import LoraConfig, prepare_model_for_kbit_training, get_peft_model
    except ImportError as e:
        parser.error(f'Eğitim bağımlılıkları eksik: {e}. training/requirements.txt dosyasını ve CUDA uyumlu PyTorch kurulumunu kullan.')
    if not torch.cuda.is_available():
        parser.error('CUDA GPU bulunamadı. Bu eğitim yalnız kullanıcının CUDA destekli bilgisayarında çalıştırılabilir.')

    use_bf16 = torch.cuda.is_bf16_supported()
    compute_dtype = torch.bfloat16 if use_bf16 else torch.float16
    print('GPU:', torch.cuda.get_device_name(0), f'· dtype={"bf16" if use_bf16 else "fp16"} · taban={args.base} · mod={args.adapter_size}')

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=compute_dtype, bnb_4bit_use_double_quant=True)
    model = AutoModelForCausalLM.from_pretrained(args.base, quantization_config=quant, device_map={'': 0}, torch_dtype=compute_dtype)
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)
    model = get_peft_model(model, LoraConfig(**adapter_options(args.adapter_size)))
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    try:
        validate_trainable(trainable, args.adapter_size)
    except ValueError as e:
        parser.error(str(e))
    print(f'Eğitilebilir adaptör parametreleri: {trainable:,} (tip: {args.adapter_size}).', flush=True)

    def encode(row):
        messages = row['messages']
        prefix = tokenizer.apply_chat_template(messages[:2], tokenize=False, add_generation_prompt=True)
        prompt_ids = tokenizer(prefix, add_special_tokens=False)['input_ids']
        target_ids = tokenizer(messages[2]['content'], add_special_tokens=False)['input_ids'] + [tokenizer.eos_token_id]
        if len(target_ids) >= args.max_length:
            raise ValueError('Yanıt bağlam sınırına sığmıyor; max-length artırın.')
        if len(prompt_ids) + len(target_ids) > args.max_length:
            raise ValueError(f'Örnek {row["unit_id"]} bağlam sınırını aşıyor ({len(prompt_ids)+len(target_ids)} > {args.max_length}). Daha büyük --max-length seç.')
        return {'input_ids': prompt_ids + target_ids, 'attention_mask': [1] * (len(prompt_ids) + len(target_ids)), 'labels': [-100] * len(prompt_ids) + target_ids}

    train_ds = Dataset.from_list(train).map(encode, remove_columns=list(train[0].keys()))
    eval_ds = Dataset.from_list(valid).map(encode, remove_columns=list(valid[0].keys()))

    def collate(batch):
        size = max(len(x['input_ids']) for x in batch)
        return {k: torch.tensor([x[k] + ([tokenizer.pad_token_id if k == 'input_ids' else -100 if k == 'labels' else 0] * (size - len(x[k]))) for x in batch], dtype=torch.long) for k in ('input_ids', 'attention_mask', 'labels')}

    class BudgetCallback(TrainerCallback):
        def on_step_end(self, args, state, control, **kwargs):
            require_headroom(500_000_000, 'Eğitim')
        def on_save(self, args, state, control, **kwargs):
            require_headroom(500_000_000, 'Kontrol noktası')

    settings = TrainingArguments(
        output_dir=args.output, num_train_epochs=args.epochs, learning_rate=args.learning_rate,
        lr_scheduler_type='cosine', optim='paged_adamw_8bit',
        per_device_train_batch_size=1, per_device_eval_batch_size=1, gradient_accumulation_steps=8,
        gradient_checkpointing=True, fp16=not use_bf16, bf16=use_bf16,
        logging_steps=5, eval_strategy='epoch', save_strategy='epoch',
        save_total_limit=2, load_best_model_at_end=True, metric_for_best_model='eval_loss', greater_is_better=False,
        warmup_ratio=0.05, weight_decay=0.01, max_grad_norm=0.5, seed=args.seed, data_seed=args.seed,
        **({'neftune_noise_alpha': args.neftune_noise_alpha} if args.neftune_noise_alpha > 0 else {}),
        report_to='none', remove_unused_columns=False
    )
    trainer = Trainer(model=model, args=settings, train_dataset=train_ds, eval_dataset=eval_ds, data_collator=collate, callbacks=[BudgetCallback()])
    trainer.train()
    metrics = trainer.evaluate()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    Path(args.output, 'training-metadata.json').write_text(json.dumps({
        'base': args.base, 'allow_custom_base': bool(args.allow_custom_base),
        'metrics': metrics, 'train': len(train), 'eval': len(valid),
        'seed': args.seed, 'epochs': args.epochs, 'max_length': args.max_length,
        'adapter_size': args.adapter_size, 'trainable_parameters': trainable
    }, indent=2), encoding='utf-8')
    print('Adaptör kaydedildi:', args.output, '· değerlendirme:', metrics)
    if not args.skip_ollama_import:
        del trainer, model
        gc.collect()
        torch.cuda.empty_cache()
        cmd = [sys.executable, str(Path(__file__).resolve().parent/'ollama_export.py'), '--adapter', args.output, '--llama-dir', args.llama_dir, '--name', target_name]
        if args.allow_custom_base:
            cmd.append('--allow-custom-base')
        result = subprocess.run(cmd, check=False)
        if result.returncode:
            print('Eğitim tamamlandı ancak Ollama aktarımı başarısız. Adaptör korundu; yeniden denemek için training/ollama_export.py çalıştır.', file=sys.stderr)
            raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
