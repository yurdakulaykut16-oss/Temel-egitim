#!/usr/bin/env python3
"""Merge a trained adapter, convert to GGUF and register a fresh local Ollama model."""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from budget import DATA, require_headroom, register_model

NAME = re.compile(r'^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$')

def generated_name():
    return f"tempo-trained:{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"

def run(args, *, cwd=None, capture=False):
    return subprocess.run([str(x) for x in args], cwd=cwd, check=True, text=True,
                          capture_output=capture)

def preflight(llama_dir, name):
    if not NAME.fullmatch(name):
        raise ValueError('Model adı yalnız küçük harf, rakam, nokta, alt çizgi, tire ve isteğe bağlı :etiket içermeli.')
    if not llama_dir:
        raise ValueError('llama.cpp klasörü belirtilmedi. --llama-dir veya LLAMA_CPP_DIR ayarla.')
    root=Path(llama_dir).expanduser().resolve()
    converter=root/'convert_hf_to_gguf.py'
    paths=[root/'build/bin/llama-quantize',root/'build/bin/llama-quantize.exe',root/'build/bin/Release/llama-quantize.exe']
    quantizer=next((p for p in paths if p.is_file()),None)
    if not converter.is_file() or not quantizer:
        raise ValueError('llama.cpp dönüştürme betiği veya derlenmiş llama-quantize bulunamadı.')
    ollama=shutil.which('ollama')
    if not ollama: raise ValueError('ollama komutu PATH içinde bulunamadı.')
    listed=run([ollama,'list'],capture=True).stdout
    existing={line.split()[0] for line in listed.splitlines()[1:] if line.strip()}
    aliases={name, name+':latest'} if ':' not in name else {name}
    if aliases & existing: raise ValueError(f'Ollama modeli zaten var: {name}. Üzerine yazılmayacak.')
    return {'converter':converter,'quantizer':quantizer,'ollama':ollama}

def export(adapter_dir, tools, name, workdir):
    adapter=Path(adapter_dir).expanduser().resolve()
    if not (adapter/'adapter_config.json').is_file() or not (adapter/'adapter_model.safetensors').is_file():
        raise ValueError('Eğitilmiş adapter_config.json ve adapter_model.safetensors bulunamadı.')
    meta=adapter/'training-metadata.json'
    if not meta.is_file(): raise ValueError('Taban model bilgisini doğrulayan training-metadata.json yok.')
    metadata=json.loads(meta.read_text(encoding='utf-8'))
    config=json.loads((adapter/'adapter_config.json').read_text(encoding='utf-8'))
    if metadata.get('base')!='Qwen/Qwen2.5-3B-Instruct':
        raise ValueError('100 GB alan planı yalnız varsayılan 3B taban modeli için geçerlidir.')
    if not metadata.get('base') or metadata['base']!=config.get('base_model_name_or_path'):
        raise ValueError('Adaptörün taban modeli eğitim meta verisiyle eşleşmiyor; işlem durduruldu.')
    work=Path(workdir).expanduser().resolve()
    if not adapter.is_relative_to(DATA) or not work.is_relative_to(DATA):
        raise ValueError(f'100 GB hesabı için adaptör ve aktarım klasörü {DATA} altında olmalı.')
    # No overwrite or accidental mixing of two different training runs.
    work.mkdir(parents=True,exist_ok=False)
    merged=work/'merged'
    fp16=work/'model-f16.gguf'
    quantized=work/'model.gguf'
    merge_script=Path(__file__).resolve().parent/'merge_adapter.py'
    require_headroom(8_000_000_000,'Taban modelle birleştirme')
    run([sys.executable,merge_script,'--adapter',adapter,'--output',merged])
    require_headroom(8_000_000_000,'GGUF dönüşümü')
    run([sys.executable,tools['converter'],merged,'--outfile',fp16,'--outtype','f16'])
    require_headroom(3_000_000_000,'Nicemleme')
    run([tools['quantizer'],fp16,quantized,'Q4_K_M'])
    if not quantized.is_file() or quantized.stat().st_size==0:
        raise ValueError('Nicemlenmiş GGUF dosyası oluşturulmadı.')
    # The Ollama service may copy the file into its own model storage. Reserve that copy.
    require_headroom(quantized.stat().st_size,'Ollama model kopyası')
    # A relative path inside the unique work directory is safe even when its parent has spaces.
    modelfile=work/'Modelfile'
    modelfile.write_text('FROM ./model.gguf\n',encoding='utf-8')
    # Check again immediately before creation, to avoid replacing existing user models.
    preflight_result=preflight(tools['converter'].parent,name)
    # Reserve before creation: if the process crashes, do not lose accounting of a possibly imported model.
    register_model(name,quantized.stat().st_size)
    run([preflight_result['ollama'],'create',name,'-f',modelfile],cwd=work)
    listing=run([preflight_result['ollama'],'list'],capture=True).stdout
    if not any(line.split()[0] in {name,name+':latest'} for line in listing.splitlines()[1:] if line.strip()):
        raise RuntimeError('Ollama create tamamlandı ancak model listede doğrulanamadı.')
    # Remove only this run's large, disposable intermediates after verified import.
    shutil.rmtree(merged)
    fp16.unlink()
    report={'model':name,'base':metadata['base'],'adapter':str(adapter),'gguf':str(quantized),
            'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'notice':'İçe aktarma doğrulandı; model kalitesi, eğitim yararı ve soru doğruluğu ayrıca değerlendirilmelidir.'}
    (work/'export-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report

def main():
    parser=argparse.ArgumentParser(description='Mevcut eğitilmiş adaptörü Ollama için birleştir ve aktar.')
    parser.add_argument('--adapter',default='.tempo-data/adapter')
    parser.add_argument('--llama-dir',default=os.environ.get('LLAMA_CPP_DIR'))
    parser.add_argument('--name',default=None)
    parser.add_argument('--output-root',default='.tempo-data/exports')
    args=parser.parse_args()
    name=args.name or generated_name()
    try:
        tools=preflight(args.llama_dir,name)
        result=export(args.adapter,tools,name,Path(args.output_root)/name.replace(':','-'))
    except (ValueError,OSError,subprocess.SubprocessError,RuntimeError) as e:
        print(f'Ollama aktarımı başarısız: {e}\nAdaptör silinmedi; sorunu giderip ollama_export.py ile tekrar dene.',file=sys.stderr)
        return 1
    print(json.dumps(result,ensure_ascii=False,indent=2))
    print('Uygulamada kullanmak için Soru stüdyosunda model listesini yenile ve bu modeli seç. Önce örneklerle doğrula.')
    return 0

if __name__=='__main__':sys.exit(main())
