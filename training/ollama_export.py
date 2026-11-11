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
from budget import DATA, SUPPORTED_BASES, require_headroom, register_model

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
    root = Path(llama_dir).expanduser().resolve()
    converter = root/'convert_hf_to_gguf.py'
    paths = [root/'build/bin/llama-quantize', root/'build/bin/llama-quantize.exe', root/'build/bin/Release/llama-quantize.exe']
    quantizer = next((p for p in paths if p.is_file()), None)
    if not converter.is_file() or not quantizer:
        raise ValueError('llama.cpp dönüştürme betiği veya derlenmiş llama-quantize bulunamadı.')
    ollama = shutil.which('ollama')
    if not ollama:
        raise ValueError('ollama komutu PATH içinde bulunamadı.')
    listed = run([ollama, 'list'], capture=True).stdout
    existing = {line.split()[0] for line in listed.splitlines()[1:] if line.strip()}
    aliases = {name, name+':latest'} if ':' not in name else {name}
    if aliases & existing:
        raise ValueError(f'Ollama modeli zaten var: {name}. Üzerine yazılmayacak.')
    return {'converter': converter, 'quantizer': quantizer, 'ollama': ollama}

def build_modelfile_text(fusion_profile='standard'):
    if fusion_profile == 'nexus_titan':
        return (
            'FROM ./model.gguf\n'
            'PARAMETER temperature 0.42\n'
            'PARAMETER top_p 0.91\n'
            'PARAMETER top_k 48\n'
            'PARAMETER repeat_penalty 1.09\n'
            'PARAMETER num_ctx 8192\n'
            'SYSTEM """Sen Tempo-Nexus-Titan-100x birleşik yapay zekâ modelisin. Ollama yerel modelleri, disk üzerindeki harici GGUF/LoRA ağırlıkları ve GitHub açık kaynak modellerinin bilgisiyle sürekli kendini eğitir; Türkiye Antrenörlük Temel Eğitimi sorularını %100 doğru üretir ve arayüz (src/) dahil tüm projeyi geliştirirsin."""\n'
        )
    return (
        'FROM ./model.gguf\n'
        'PARAMETER temperature 0.58\n'
        'PARAMETER top_p 0.9\n'
        'PARAMETER repeat_penalty 1.09\n'
        'PARAMETER num_ctx 8192\n'
        'SYSTEM """Sen Türkiye Antrenörlük Temel Eğitimi alanında uzman bir yapay zekâ öğretmeni ve 96-tuzak soru denetçisisin. Yalnızca verilen kaynak metne dayanarak yüksek kaliteli JSON çıktısı üretirsin."""\n'
    )


def export(adapter_dir, tools, name, workdir, *, allow_custom_base=False, fusion_profile='standard'):
    adapter = Path(adapter_dir).expanduser().resolve()
    if not (adapter/'adapter_config.json').is_file() or not (adapter/'adapter_model.safetensors').is_file():
        raise ValueError('Eğitilmiş adapter_config.json ve adapter_model.safetensors bulunamadı.')
    meta = adapter/'training-metadata.json'
    if not meta.is_file():
        raise ValueError('Taban model bilgisini doğrulayan training-metadata.json yok.')
    metadata = json.loads(meta.read_text(encoding='utf-8'))
    config = json.loads((adapter/'adapter_config.json').read_text(encoding='utf-8'))
    base_name = metadata.get('base')
    if not base_name or base_name != config.get('base_model_name_or_path'):
        raise ValueError('Adaptörün taban modeli eğitim meta verisiyle eşleşmiyor; işlem durduruldu.')
    is_custom = allow_custom_base or bool(metadata.get('allow_custom_base'))
    if base_name not in SUPPORTED_BASES and not is_custom:
        raise ValueError(f'100 GB alan planı desteklenmeyen taban model için geçerli değil: {base_name}.')
    headroom = SUPPORTED_BASES.get(base_name, {'merge': 18_000_000_000, 'gguf': 18_000_000_000, 'quant': 7_000_000_000})

    work = Path(workdir).expanduser().resolve()
    if not adapter.is_relative_to(DATA) or not work.is_relative_to(DATA):
        raise ValueError(f'100 GB hesabı için adaptör ve aktarım klasörü {DATA} altında olmalı.')
    work.mkdir(parents=True, exist_ok=False)
    merged = work/'merged'
    fp16 = work/'model-f16.gguf'
    quantized = work/'model.gguf'
    merge_script = Path(__file__).resolve().parent/'merge_adapter.py'
    require_headroom(headroom['merge'], 'Taban modelle birleştirme')
    run([sys.executable, merge_script, '--adapter', adapter, '--output', merged])
    require_headroom(headroom['gguf'], 'GGUF dönüşümü')
    run([sys.executable, tools['converter'], merged, '--outfile', fp16, '--outtype', 'f16'])
    require_headroom(headroom['quant'], 'Nicemleme')
    run([tools['quantizer'], fp16, quantized, 'Q4_K_M'])
    if not quantized.is_file() or quantized.stat().st_size == 0:
        raise ValueError('Nicemlenmiş GGUF dosyası oluşturulmadı.')
    require_headroom(quantized.stat().st_size, 'Ollama model kopyası')
    modelfile = work/'Modelfile'
    modelfile.write_text(build_modelfile_text(fusion_profile), encoding='utf-8')
    preflight_result = preflight(tools['converter'].parent, name)
    register_model(name, quantized.stat().st_size)
    run([preflight_result['ollama'], 'create', name, '-f', modelfile], cwd=work)
    listing = run([preflight_result['ollama'], 'list'], capture=True).stdout
    if not any(line.split()[0] in {name, name+':latest'} for line in listing.splitlines()[1:] if line.strip()):
        raise RuntimeError('Ollama create tamamlandı ancak model listede doğrulanamadı.')
    shutil.rmtree(merged)
    fp16.unlink()
    report = {'model': name, 'base': base_name, 'adapter': str(adapter), 'gguf': str(quantized),
              'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'notice': 'İçe aktarma doğrulandı; model kalitesi, eğitim yararı ve soru doğruluğu ayrıca değerlendirilmelidir.'}
    (work/'export-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report

def main():
    parser = argparse.ArgumentParser(description='Mevcut eğitilmiş adaptörü Ollama için birleştir ve aktar.')
    parser.add_argument('--adapter', default='.tempo-data/adapter')
    parser.add_argument('--llama-dir', default=os.environ.get('LLAMA_CPP_DIR'))
    parser.add_argument('--name', default=None)
    parser.add_argument('--output-root', default='.tempo-data/exports')
    parser.add_argument('--allow-custom-base', action='store_true')
    parser.add_argument('--fusion-profile', choices=['standard', 'nexus_titan'], default='standard')
    args = parser.parse_args()
    name = args.name or generated_name()
    try:
        tools = preflight(args.llama_dir, name)
        result = export(args.adapter, tools, name, Path(args.output_root)/name.replace(':', '-'), allow_custom_base=args.allow_custom_base, fusion_profile=args.fusion_profile)
    except (ValueError, OSError, subprocess.SubprocessError, RuntimeError) as e:
        print(f'Ollama aktarımı başarısız: {e}\nAdaptör silinmedi; sorunu giderip ollama_export.py ile tekrar dene.', file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print('Uygulamada kullanmak için Soru stüdyosunda model listesini yenile ve bu modeli seç.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
