#!/usr/bin/env bash
# k3s-studio 로컬 풀스택 기동: Postgres + rapid-mlx + API + UI
# 멱등성: 이미 떠 있는 서비스는 건너뛴다. 환경변수로 모델/포트 override 가능.
#   K3S_AI_MODEL (기본 qwen3-coder-30b-4bit), K3S_AI_PORT (기본 8000)
set -uo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null)"
[ -z "${ROOT:-}" ] && { echo "✗ git repo root를 찾을 수 없습니다"; exit 1; }

MODEL="${K3S_AI_MODEL:-qwen3-coder-30b-4bit}"
MODEL_PORT="${K3S_AI_PORT:-8000}"
API_PORT=9090
UI_PORT=3000
PG_CONTAINER=mpk3s-postgres
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
LOG_DIR="${TMPDIR:-/tmp}/k3s-studio-dev"
mkdir -p "$LOG_DIR"

up()       { curl -sf -o /dev/null --max-time 2 "$1" 2>/dev/null; }
wait_for() { local url=$1 name=$2 tries=${3:-60} i
  for ((i=1;i<=tries;i++)); do up "$url" && { echo "  ✓ $name ready"; return 0; }; sleep 2; done
  echo "  ✗ $name 준비 실패 (timeout) — 로그 확인: $LOG_DIR"; return 1; }

echo "▶ k3s-studio 로컬 스택 기동  (IP=$LAN_IP, model=$MODEL)"
echo "  로그 디렉터리: $LOG_DIR"

# 1) Postgres ----------------------------------------------------------------
echo "[1/5] Postgres (:5433)"
if docker exec "$PG_CONTAINER" pg_isready -U mpk3s -d mpk3s >/dev/null 2>&1; then
  echo "  ✓ 이미 실행 중"
elif docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  docker start "$PG_CONTAINER" >/dev/null && echo "  → 기존 컨테이너 start"
else
  ( cd "$ROOT/containers" && docker compose up -d postgres ) && echo "  → docker compose up"
fi
for i in {1..20}; do docker exec "$PG_CONTAINER" pg_isready -U mpk3s -d mpk3s >/dev/null 2>&1 && break; sleep 1.5; done

# 2) rapid-mlx 모델 서버 -----------------------------------------------------
echo "[2/5] rapid-mlx ($MODEL :$MODEL_PORT)"
if curl -sf --max-time 2 "http://127.0.0.1:$MODEL_PORT/v1/models" 2>/dev/null | grep -q "\"$MODEL\""; then
  echo "  ✓ 이미 실행 중 ($MODEL)"
else
  if up "http://127.0.0.1:$MODEL_PORT/v1/models"; then
    echo "  ! :$MODEL_PORT 에 다른 모델이 떠 있음 → 교체"
    lsof -ti "tcp:$MODEL_PORT" 2>/dev/null | xargs kill 2>/dev/null; sleep 2
  fi
  [ -x "$ROOT/ai/.venv/bin/rapid-mlx" ] || { echo "  → venv 구성"; "$ROOT/ai/setup.sh"; }
  nohup "$ROOT/ai/serve.sh" "$MODEL" "$MODEL_PORT" >"$LOG_DIR/model.log" 2>&1 &
  echo "  → 기동 중 (모델 최초 실행 시 다운로드, log: $LOG_DIR/model.log)"
fi

# 3) API (Spring Boot) -------------------------------------------------------
echo "[3/5] API (:$API_PORT)"
if up "http://127.0.0.1:$API_PORT/actuator/health"; then
  echo "  ✓ 이미 실행 중"
else
  nohup bash -c "cd '$ROOT/apps/k3s-studio-api' && ./gradlew bootRun" >"$LOG_DIR/api.log" 2>&1 &
  echo "  → bootRun 기동 중 (log: $LOG_DIR/api.log)"
fi

# 4) UI (Next.js) ------------------------------------------------------------
echo "[4/5] UI (http://$LAN_IP:$UI_PORT)"
if up "http://127.0.0.1:$UI_PORT" || up "http://$LAN_IP:$UI_PORT"; then
  echo "  ✓ 이미 실행 중"
else
  [ -d "$ROOT/apps/k3s-studio-ui/node_modules" ] || ( cd "$ROOT/apps/k3s-studio-ui" && npm install )
  nohup bash -c "cd '$ROOT/apps/k3s-studio-ui' && BACKEND_URL=http://localhost:$API_PORT node_modules/.bin/next dev -H 0.0.0.0 -p $UI_PORT" >"$LOG_DIR/ui.log" 2>&1 &
  echo "  → next dev 기동 중 (log: $LOG_DIR/ui.log)"
fi

# 준비 대기 ------------------------------------------------------------------
echo "[*] 준비 대기..."
wait_for "http://127.0.0.1:$MODEL_PORT/v1/models"        "model" 150
wait_for "http://127.0.0.1:$API_PORT/actuator/health"    "API"   120
wait_for "http://$LAN_IP:$UI_PORT"                       "UI"    60

# 5) AI 설정을 로컬 서버로 (활성 행 1개 유지, 기존 LAN 행은 비활성 보존) ------
echo "[5/5] AI 설정 → 로컬 rapid-mlx"
docker exec -i "$PG_CONTAINER" psql -U mpk3s -d mpk3s >/dev/null 2>&1 <<SQL
UPDATE ai_model_config SET active=false WHERE active=true;
INSERT INTO ai_model_config (name, model_url, model_name, active)
SELECT '$MODEL (local rapid-mlx)', 'http://127.0.0.1:$MODEL_PORT', '$MODEL', true
WHERE NOT EXISTS (SELECT 1 FROM ai_model_config WHERE model_url='http://127.0.0.1:$MODEL_PORT');
UPDATE ai_model_config SET active=true, model_name='$MODEL', name='$MODEL (local rapid-mlx)'
WHERE model_url='http://127.0.0.1:$MODEL_PORT';
SQL
echo "  ✓ 활성 프로파일 = http://127.0.0.1:$MODEL_PORT ($MODEL)"

echo ""
echo "✅ 완료"
echo "   UI    : http://localhost:$UI_PORT  (LAN: http://$LAN_IP:$UI_PORT)"
echo "   API   : http://127.0.0.1:$API_PORT"
echo "   모델  : http://127.0.0.1:$MODEL_PORT  (/v1/models)"
echo "   중지  : $ROOT/.claude/skills/k3s-dev/stop.sh"
