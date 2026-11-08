#!/usr/bin/env python3
"""Optional, local-only QLoRA training. Requires a supported NVIDIA CUDA environment."""
import argparse, json, os, gc, subprocess, sys, tempfile
from ollama_export import preflight, generated_name
from budget import DATA, require_headroom
from pathlib import Path

def adapter_options(mode):
    common={'bias':'none','task_type':'CAUSAL_LM'}
    if mode=='compact':
        # Qwen2.5-3B: 24 q_proj layers * rank 1 * (2048 + 2048) = 98,304 trainable weights.
        return {**common,'r':1,'lora_alpha':2,'lora_dropout':0.05,'target_modules':['q_proj'],
                'layers_to_transform':list(range(24)),'layers_pattern':'layers'}
    return {**common,'r':8,'lora_alpha':16,'lora_dropout':0.05,'target_modules':['q_proj','k_proj','v_proj','o_proj']}

def validate_trainable(count,mode):
    if count<=0:raise ValueError('Eğitilebilir adaptör parametresi bulunamadı.')
    if mode=='compact' and not 90_000<=count<=110_000:
        raise ValueError(f'Kompakt adaptör beklenen ~100 bin aralığında değil: {count:,}. Model mimarisini kontrol et.')

def main():
    parser=argparse.ArgumentParser(description='İnsan onaylı yerel soru verisiyle QLoRA eğitimi.')
    parser.add_argument('--data', default='.tempo-data/training')
    parser.add_argument('--output', default='.tempo-data/adapter')
    parser.add_argument('--base', default='Qwen/Qwen2.5-3B-Instruct')
    parser.add_argument('--max-length',type=int,default=2048)
    parser.add_argument('--epochs',type=float,default=2)
    parser.add_argument('--seed',type=int,default=42)
    parser.add_argument('--adapter-size',choices=['compact','standard'],default='compact',help='compact: yaklaşık 100 bin parametre; standard: daha büyük LoRA')
    parser.add_argument('--learning-rate',type=float,default=0.0001)
    parser.add_argument('--llama-dir',default=os.environ.get('LLAMA_CPP_DIR'),help='Derlenmiş llama.cpp klasörü')
    parser.add_argument('--ollama-name',default=None,help='Yeni Ollama adı; varsayılan benzersiz isimdir')
    parser.add_argument('--skip-ollama-import',action='store_true',help='Eğitim sonrası otomatik aktarımı kapat')
    args=parser.parse_args()
    data=Path(args.data)
    output=Path(args.output).expanduser().resolve()
    if not output.is_relative_to(DATA): parser.error(f'100 GB hesabı için çıktı klasörü {DATA} altında olmalı.')
    if args.base != 'Qwen/Qwen2.5-3B-Instruct': parser.error('100 GB alan hesabı şu anda yalnız varsayılan 3B taban modeli için hazırlanmıştır.')
    try:
        train=[json.loads(x) for x in (data/'train.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
        valid=[json.loads(x) for x in (data/'eval.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    except (OSError,ValueError) as e: parser.error(f'Önce training/prepare.py çalıştırılmalı: {e}')
    if not train or not valid or {x['unit_id'] for x in train}&{x['unit_id'] for x in valid}:
        parser.error('Boş veri veya eğitim/doğrulama üniteleri arasında sızıntı var.')
    if args.max_length < 512: parser.error('max-length en az 512 olmalı.')
    if (Path(args.output)/'adapter_config.json').exists(): parser.error('Çıktı klasöründe bir adaptör zaten var; üzerine yazmamak için --output ile yeni bir klasör seç.')
    target_name=args.ollama_name or generated_name()
    if not args.skip_ollama_import:
        try: preflight(args.llama_dir,target_name)
        except (ValueError,OSError,subprocess.SubprocessError) as e: parser.error(f'Eğitim öncesi Ollama aktarım kontrolü başarısız: {e}. Yalnız adaptör eğitmek için --skip-ollama-import kullan.')
    try: require_headroom(10_000_000_000,'Eğitim ve model önbelleği')
    except (ValueError,OSError) as e: parser.error(str(e))
    # Keep model downloads and temporary files inside the project budget.
    cache=DATA/'huggingface';temp=DATA/'tmp';cache.mkdir(parents=True,exist_ok=True);temp.mkdir(parents=True,exist_ok=True)
    os.environ['HF_HOME']=str(cache);os.environ['HF_HUB_CACHE']=str(cache/'hub');os.environ['TMPDIR']=str(temp);tempfile.tempdir=str(temp)
    try:
        import torch
        from datasets import Dataset
        from transformers import AutoTokenizer,AutoModelForCausalLM,BitsAndBytesConfig,Trainer,TrainingArguments,TrainerCallback
        from peft import LoraConfig,prepare_model_for_kbit_training,get_peft_model
    except ImportError as e: parser.error(f'Eğitim bağımlılıkları eksik: {e}. training/requirements.txt dosyasını ve CUDA uyumlu PyTorch kurulumunu kullan.')
    if not torch.cuda.is_available(): parser.error('CUDA GPU bulunamadı. Bu eğitim yalnız kullanıcının CUDA destekli bilgisayarında çalıştırılabilir.')
    print('GPU:',torch.cuda.get_device_name(0),'· modeli indirmek için Hugging Face erişimi gerekir.')
    tokenizer=AutoTokenizer.from_pretrained(args.base)
    if tokenizer.pad_token is None: tokenizer.pad_token=tokenizer.eos_token
    quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_compute_dtype=torch.float16,bnb_4bit_use_double_quant=True)
    model=AutoModelForCausalLM.from_pretrained(args.base,quantization_config=quant,device_map={'':0},torch_dtype=torch.float16)
    model.config.use_cache=False
    model=prepare_model_for_kbit_training(model)
    model=get_peft_model(model,LoraConfig(**adapter_options(args.adapter_size)))
    trainable=sum(p.numel() for p in model.parameters() if p.requires_grad)
    try: validate_trainable(trainable,args.adapter_size)
    except ValueError as e: parser.error(str(e))
    print(f'Eğitilebilir adaptör parametreleri: {trainable:,} (tip: {args.adapter_size}); bu sayı veya eğitim konu doğruluğu garantisi değildir.',flush=True)
    def encode(row):
        messages=row['messages']
        prefix=tokenizer.apply_chat_template(messages[:2],tokenize=False,add_generation_prompt=True)
        prompt_ids=tokenizer(prefix,add_special_tokens=False)['input_ids']
        target_ids=tokenizer(messages[2]['content'],add_special_tokens=False)['input_ids']+[tokenizer.eos_token_id]
        if len(target_ids)>=args.max_length: raise ValueError('Yanıt bağlam sınırına sığmıyor; max-length artırın.')
        # Never silently truncate the system instruction, lesson or answer.
        if len(prompt_ids)+len(target_ids)>args.max_length:
            raise ValueError(f'Örnek {row["unit_id"]} bağlam sınırını aşıyor ({len(prompt_ids)+len(target_ids)} > {args.max_length}). Daha büyük --max-length seç veya örneği gözden geçir; uzunluk VRAM kullanımını artırır.')
        return {'input_ids':prompt_ids+target_ids,'attention_mask':[1]*(len(prompt_ids)+len(target_ids)), 'labels':[-100]*len(prompt_ids)+target_ids}
    train_ds=Dataset.from_list(train).map(encode,remove_columns=list(train[0].keys()))
    eval_ds=Dataset.from_list(valid).map(encode,remove_columns=list(valid[0].keys()))
    def collate(batch):
        size=max(len(x['input_ids']) for x in batch)
        return {k:torch.tensor([x[k]+([tokenizer.pad_token_id if k=='input_ids' else -100 if k=='labels' else 0]*(size-len(x[k]))) for x in batch],dtype=torch.long) for k in ('input_ids','attention_mask','labels')}
    class BudgetCallback(TrainerCallback):
        def on_step_end(self,args,state,control,**kwargs):
            require_headroom(500_000_000,'Eğitim')
        def on_save(self,args,state,control,**kwargs):
            require_headroom(500_000_000,'Kontrol noktası')
    settings=TrainingArguments(output_dir=args.output,num_train_epochs=args.epochs,learning_rate=args.learning_rate,
        per_device_train_batch_size=1,per_device_eval_batch_size=1,gradient_accumulation_steps=8,
        gradient_checkpointing=True,fp16=True,logging_steps=5,eval_strategy='epoch',save_strategy='epoch',
        save_total_limit=2,load_best_model_at_end=True,metric_for_best_model='eval_loss',greater_is_better=False,
        warmup_ratio=0.05,weight_decay=0.01,max_grad_norm=0.5,seed=args.seed,data_seed=args.seed,report_to='none',remove_unused_columns=False)
    trainer=Trainer(model=model,args=settings,train_dataset=train_ds,eval_dataset=eval_ds,data_collator=collate,callbacks=[BudgetCallback()])
    trainer.train();metrics=trainer.evaluate();trainer.save_model(args.output);tokenizer.save_pretrained(args.output)
    Path(args.output,'training-metadata.json').write_text(json.dumps({'base':args.base,'metrics':metrics,'train':len(train),'eval':len(valid),'seed':args.seed,'epochs':args.epochs,'max_length':args.max_length,'adapter_size':args.adapter_size,'trainable_parameters':trainable},indent=2),encoding='utf-8')
    print('Adaptör kaydedildi:',args.output,'· değerlendirme:',metrics)
    print('Not: eval_loss uzman incelemesi veya konu doğruluğu değildir.')
    if not args.skip_ollama_import:
        del trainer, model
        gc.collect();torch.cuda.empty_cache()
        result=subprocess.run([sys.executable,str(Path(__file__).resolve().parent/'ollama_export.py'),'--adapter',args.output,'--llama-dir',args.llama_dir,'--name',target_name],check=False)
        if result.returncode:
            print('Eğitim tamamlandı ancak Ollama aktarımı başarısız. Adaptör korundu; yeniden denemek için training/ollama_export.py çalıştır.',file=sys.stderr)
            raise SystemExit(result.returncode)


if __name__=='__main__': main()
