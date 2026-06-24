#!/usr/bin/env bash
# k3s-studio 로컬 스택 중지. 포트로 점유 프로세스를 종료한다.
# Postgres 컨테이너는 기본 유지(데이터 보존). --db 옵션으로 함께 중지.
set -uo pipefail

echo "■ k3s-studio 로컬 스택 중지"
for p in 8000 9090 3000; do
  pids="$(lsof -ti tcp:$p 2>/dev/null)"
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null && echo "  ✓ :$p 종료 (pid $(echo $pids | tr '\n' ' '))"
  else
    echo "  - :$p 점유 프로세스 없음"
  fi
done

if [ "${1:-}" = "--db" ]; then
  docker stop mpk3s-postgres >/dev/null 2>&1 && echo "  ✓ Postgres 컨테이너 중지" || echo "  - Postgres 컨테이너 없음"
else
  echo "  · Postgres는 유지됨 (완전 중지: stop.sh --db)"
fi
