#!/usr/bin/env python3
"""Load the original base in FP16 on CPU, merge its PEFT adapter, save safetensors."""
import argparse, json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--adapter',required=True);ap.add_argument('--output',required=True);args=ap.parse_args()
    import torch
    from transformers import AutoModelForCausalLM,AutoTokenizer
    from peft import PeftModel
    adapter=Path(args.adapter);metadata=json.loads((adapter/'training-metadata.json').read_text(encoding='utf-8'))
    config=json.loads((adapter/'adapter_config.json').read_text(encoding='utf-8'))
    base=metadata['base']
    if base!=config.get('base_model_name_or_path'):raise ValueError('Eğitilen taban model eşleşmiyor.')
    output=Path(args.output)
    if output.exists():raise FileExistsError(f'Hedef zaten var: {output}')
    print(f'Orijinal taban model CPU belleğine yükleniyor: {base}. RAM ve disk kullanımı yüksek olabilir.',flush=True)
    model=AutoModelForCausalLM.from_pretrained(base,torch_dtype=torch.float16,low_cpu_mem_usage=True,device_map={'':'cpu'})
    model=PeftModel.from_pretrained(model,str(adapter)).merge_and_unload()
    model.save_pretrained(str(output),safe_serialization=True,max_shard_size='5GB')
    tokenizer=AutoTokenizer.from_pretrained(str(adapter));tokenizer.save_pretrained(str(output))
    print('Birleştirilmiş ağırlıklar:',output,flush=True)
if __name__=='__main__':main()
