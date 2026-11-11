"""Conservative project storage checks. For a strict hard cap use a filesystem quota."""
import json, os, shutil
from pathlib import Path

LIMIT_BYTES=100_000_000_000  # 100 GB in decimal, not 100 GiB
ROOT=Path(__file__).resolve().parents[1]
DATA=Path(os.environ.get('TEMPO_DATA_DIR',str(ROOT/'.tempo-data'))).expanduser().resolve()
LEDGER=DATA/'ollama-created.json'

SUPPORTED_BASES={
    'Qwen/Qwen2.5-3B-Instruct':{'train':10_000_000_000,'merge':8_000_000_000,'gguf':8_000_000_000,'quant':3_000_000_000},
    'Qwen/Qwen3-4B':{'train':12_000_000_000,'merge':10_000_000_000,'gguf':10_000_000_000,'quant':4_000_000_000},
    'google/gemma-3-4b-it':{'train':12_000_000_000,'merge':10_000_000_000,'gguf':10_000_000_000,'quant':4_000_000_000},
    'Qwen/Qwen2.5-7B-Instruct':{'train':18_000_000_000,'merge':16_000_000_000,'gguf':16_000_000_000,'quant':6_000_000_000},
    'Qwen/Qwen3-8B':{'train':20_000_000_000,'merge':18_000_000_000,'gguf':18_000_000_000,'quant':7_000_000_000},
    'Qwen/Qwen3-14B':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'Qwen/Qwen2.5-14B-Instruct':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'google/gemma-3-12b-it':{'train':26_000_000_000,'merge':22_000_000_000,'gguf':20_000_000_000,'quant':9_000_000_000},
    'google/gemma-3-27b-it':{'train':42_000_000_000,'merge':36_000_000_000,'gguf':32_000_000_000,'quant':16_000_000_000},
    'Qwen/Qwen3-32B':{'train':46_000_000_000,'merge':38_000_000_000,'gguf':34_000_000_000,'quant':18_000_000_000},
    'Qwen/Qwen2.5-32B-Instruct':{'train':46_000_000_000,'merge':38_000_000_000,'gguf':34_000_000_000,'quant':18_000_000_000},
    'Qwen/Qwen2.5-Coder-1.5B-Instruct':{'train':7_000_000_000,'merge':6_000_000_000,'gguf':6_000_000_000,'quant':2_000_000_000},
    'Qwen/Qwen2.5-Coder-3B-Instruct':{'train':10_000_000_000,'merge':8_000_000_000,'gguf':8_000_000_000,'quant':3_000_000_000},
    'Qwen/Qwen2.5-Coder-7B-Instruct':{'train':18_000_000_000,'merge':16_000_000_000,'gguf':16_000_000_000,'quant':6_000_000_000},
    'Qwen/Qwen3-Coder-7B-Instruct':{'train':18_000_000_000,'merge':16_000_000_000,'gguf':16_000_000_000,'quant':6_000_000_000},
    'Qwen/Qwen3-Coder-14B-Instruct':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'Qwen/Qwen2.5-Coder-14B-Instruct':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'Qwen/Qwen2.5-Coder-32B-Instruct':{'train':46_000_000_000,'merge':38_000_000_000,'gguf':34_000_000_000,'quant':18_000_000_000},
    'Qwen/Qwen3-Coder-30B-A3B-Instruct':{'train':44_000_000_000,'merge':36_000_000_000,'gguf':32_000_000_000,'quant':17_000_000_000},
    'Qwen/QwQ-32B':{'train':46_000_000_000,'merge':38_000_000_000,'gguf':34_000_000_000,'quant':18_000_000_000},
    'deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'deepseek-ai/DeepSeek-Coder-V2-Instruct':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B':{'train':18_000_000_000,'merge':16_000_000_000,'gguf':16_000_000_000,'quant':6_000_000_000},
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B':{'train':46_000_000_000,'merge':38_000_000_000,'gguf':34_000_000_000,'quant':18_000_000_000},
    'deepseek-ai/DeepSeek-R1-Distill-Llama-70B':{'train':72_000_000_000,'merge':56_000_000_000,'gguf':48_000_000_000,'quant':38_000_000_000},
    'microsoft/phi-4':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'meta-llama/Llama-3.3-70B-Instruct':{'train':72_000_000_000,'merge':56_000_000_000,'gguf':48_000_000_000,'quant':38_000_000_000},
    'bigcode/starcoder2-7b':{'train':18_000_000_000,'merge':16_000_000_000,'gguf':16_000_000_000,'quant':6_000_000_000},
    'bigcode/starcoder2-15b':{'train':28_000_000_000,'merge':24_000_000_000,'gguf':22_000_000_000,'quant':10_000_000_000},
    'mistralai/Codestral-7B':{'train':18_000_000_000,'merge':16_000_000_000,'gguf':16_000_000_000,'quant':6_000_000_000},
    'mistralai/Codestral-22B-v0.1':{'train':38_000_000_000,'merge':32_000_000_000,'gguf':28_000_000_000,'quant':14_000_000_000},
    'mistralai/Devstral-Small-2505':{'train':38_000_000_000,'merge':32_000_000_000,'gguf':28_000_000_000,'quant':15_000_000_000},
    'ibm-granite/granite-8b-code-instruct':{'train':20_000_000_000,'merge':18_000_000_000,'gguf':18_000_000_000,'quant':7_000_000_000},
    'ibm-granite/granite-20b-code-instruct':{'train':36_000_000_000,'merge':30_000_000_000,'gguf':26_000_000_000,'quant':13_000_000_000},
    '01-ai/Yi-Coder-9B-Chat':{'train':22_000_000_000,'merge':18_000_000_000,'gguf':18_000_000_000,'quant':8_000_000_000},
    'google/codegemma-7b-it':{'train':18_000_000_000,'merge':16_000_000_000,'gguf':16_000_000_000,'quant':6_000_000_000},
    'infly/OpenCoder-8B-Instruct':{'train':20_000_000_000,'merge':18_000_000_000,'gguf':18_000_000_000,'quant':7_000_000_000},
    'open-r1/OlympicCoder-7B':{'train':18_000_000_000,'merge':16_000_000_000,'gguf':16_000_000_000,'quant':6_000_000_000},
    'open-r1/OlympicCoder-32B':{'train':46_000_000_000,'merge':38_000_000_000,'gguf':34_000_000_000,'quant':18_000_000_000},
    'CohereForAI/aya-expanse-8b':{'train':20_000_000_000,'merge':18_000_000_000,'gguf':18_000_000_000,'quant':7_000_000_000},
    'CohereForAI/c4ai-command-r7b-12-2024':{'train':20_000_000_000,'merge':18_000_000_000,'gguf':18_000_000_000,'quant':7_000_000_000},
    'codellama/CodeLlama-34b-Instruct-hf':{'train':48_000_000_000,'merge':40_000_000_000,'gguf':36_000_000_000,'quant':19_000_000_000},
    'Qwen/Qwen2.5-72B-Instruct':{'train':72_000_000_000,'merge':56_000_000_000,'gguf':48_000_000_000,'quant':38_000_000_000},
}

def base_headroom(base_name, custom=False):
    if base_name in SUPPORTED_BASES:
        return SUPPORTED_BASES[base_name]
    if custom:
        return {'train':24_000_000_000,'merge':20_000_000_000,'gguf':20_000_000_000,'quant':8_000_000_000}
    raise ValueError(f'Desteklenmeyen taban model: {base_name}. Desteklenenler: {", ".join(SUPPORTED_BASES)} (veya --allow-custom-base kullan).')

def local_bytes(path):
    total=0
    if not path.exists(): return 0
    for root,dirs,files in os.walk(path,followlinks=False):
        dirs[:]=[d for d in dirs if not (Path(root)/d).is_symlink()]
        for file in files:
            p=Path(root)/file
            try:
                if not p.is_symlink(): total+=p.stat().st_size
            except FileNotFoundError: pass
    return total

def usage():
    generated=local_bytes(DATA)
    books=local_bytes(ROOT/'public/books')
    models=0
    try:
        records=json.loads(LEDGER.read_text(encoding='utf-8'))
        if not isinstance(records,list): raise ValueError('Model kayıt defteri geçersiz.')
        models=sum(max(0,int(x['bytes'])) for x in records)
    except FileNotFoundError: pass
    return {'generated':generated,'books':books,'models_reserved':models,'total':generated+books+models,'limit':LIMIT_BYTES}

def require_headroom(reserve=0,stage='İşlem'):
    state=usage()
    if state['total']+reserve>LIMIT_BYTES:
        raise ValueError(f"{stage}: 100 GB sınırı için yeterli alan yok (hesaplanan {state['total']/1e9:.2f} GB, ayrılacak {reserve/1e9:.2f} GB). Hiçbir dosya silinmedi.")
    DATA.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(DATA).free<reserve:
        raise ValueError(f'{stage}: diskte en az {reserve/1e9:.2f} GB boş alan gerekli.')
    return state

def register_model(name, size):
    try: entries=json.loads(LEDGER.read_text(encoding='utf-8'))
    except FileNotFoundError: entries=[]
    entries.append({'model':name,'bytes':int(size)})
    DATA.mkdir(parents=True,exist_ok=True)
    tmp=LEDGER.with_suffix('.tmp');tmp.write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,LEDGER)
