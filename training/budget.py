"""Conservative project storage checks. For a strict hard cap use a filesystem quota."""
import json, os, shutil
from pathlib import Path

LIMIT_BYTES=100_000_000_000  # 100 GB in decimal, not 100 GiB
ROOT=Path(__file__).resolve().parents[1]
DATA=Path(os.environ.get('TEMPO_DATA_DIR',str(ROOT/'.tempo-data'))).expanduser().resolve()
LEDGER=DATA/'ollama-created.json'

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
