#!/usr/bin/env bash
# rapid-mlx OpenAI 호환 API 서버를 실행한다.
# 사용: ./ai/serve.sh [모델] [포트]
#   예: ./ai/serve.sh qwen3.5-4b-4bit 8000
set -euo pipefail

AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL="${1:-qwen3.5-4b-4bit}"
PORT="${2:-8000}"

echo "==> rapid-mlx serve  model=$MODEL  port=$PORT"
exec "$AI_DIR/.venv/bin/rapid-mlx" serve "$MODEL" --host 0.0.0.0 --port "$PORT"
