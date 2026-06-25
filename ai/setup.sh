#!/usr/bin/env bash
# venv 생성 + 의존성 설치를 한 번에 수행한다.
# 사용: ./ai/setup.sh  (프로젝트 루트 또는 어디서든)
set -euo pipefail

AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$AI_DIR/.venv"

if [ ! -d "$VENV" ]; then
  echo "==> venv 생성: $VENV"
  python3 -m venv "$VENV"
fi

echo "==> 의존성 설치"
"$VENV/bin/python" -m pip install --upgrade pip -q
"$VENV/bin/python" -m pip install -r "$AI_DIR/requirements.txt"

echo "==> 완료. 활성화: source $VENV/bin/activate"
