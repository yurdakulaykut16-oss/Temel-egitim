#!/usr/bin/env bash
set -euo pipefail

QUERY="${1:-VO2max antrenman ilkeleri}"
HOST="${TEMPO_LOCALHOST:-http://127.0.0.1:5173}"
OUT_DIR=".tempo-data"
OUT_FILE="${OUT_DIR}/rag-context.md"

mkdir -p "$OUT_DIR"
curl -sS -X POST "${HOST}/api/ollama/rag/aider-context" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"${QUERY//\"/\\\"}\", \"topK\": 8, \"writeFile\": true}" > "${OUT_DIR}/rag-aider-meta.json"

if command -v aider >/dev/null 2>&1; then
  exec aider --config .aider.conf.yml --read "${OUT_FILE}" --message "$QUERY"
else
  echo "RAG baglami yazildi: ${OUT_FILE}"
  echo "Calistirmak icin: pip install aider-chat && aider --config .aider.conf.yml --read ${OUT_FILE} --message \"$QUERY\""
fi
