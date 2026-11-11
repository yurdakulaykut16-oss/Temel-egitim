#!/usr/bin/env bash
set -euo pipefail

# RTX 3080 Ti (12GB/16GB VRAM) + 16GB RAM için <1sn Sıfır-Swap Ollama + Vite Başlatıcı
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0
export OLLAMA_MAX_LOADED_MODELS=3
export OLLAMA_NUM_PARALLEL=4
export OLLAMA_KEEP_ALIVE=-1

VRAM_MB=12288
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_LINE="$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits | head -n1 || true)"
  if [[ -n "$GPU_LINE" ]]; then
    GPU_NAME="$(echo "$GPU_LINE" | cut -d',' -f1 | xargs)"
    VRAM_MB="$(echo "$GPU_LINE" | cut -d',' -f2 | xargs)"
    echo "Tespit edilen GPU: $GPU_NAME (${VRAM_MB} MB VRAM)"
  fi
fi

CODER_MODEL="qwen2.5-coder:3b"
if (( VRAM_MB >= 15000 )); then
  CODER_MODEL="qwen2.5-coder:7b"
fi

if command -v ollama >/dev/null 2>&1; then
  if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "Ollama Flash Attention + Q8 KV Cache ayarlarıyla başlatılıyor..."
    nohup ollama serve >/tmp/ollama-3080ti.log 2>&1 &
    sleep 3
  fi
  for M in "qwen3:8b" "gemma3:4b" "$CODER_MODEL"; do
    echo "Model kontrol/indirme: $M"
    ollama pull "$M"
  done
  if [[ "${1:-}" == "--with-coder-council" ]]; then
    for CM in "qwen2.5-coder:1.5b" "qwen2.5-coder:7b" "qwen3-coder:7b" "qwen3:4b" "deepseek-r1:8b" "deepseek-r1:14b" "qwen2.5-coder:14b" "qwen3-coder:14b" "deepseek-coder-v2:lite" "starcoder2:7b" "granite-code:8b" "opencoder:8b" "olympiccoder:7b" "codegemma:7b" "codestral:7b" "phi4:14b" "yi-coder:9b" "aya-expanse:8b"; do
      echo "Proje Geliştirici Konsey açık kaynak modeli indiriliyor: $CM"
      ollama pull "$CM"
    done
  fi
else
  echo "Uyarı: ollama CLI bulunamadı; sadece web/0-API yerel AI takımı başlatılıyor."
fi

echo "Tüm RTX 3080 Ti takımı <1sn VRAM modunda başlatılıyor..."
exec npm run dev
