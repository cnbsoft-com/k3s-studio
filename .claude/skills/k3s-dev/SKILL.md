---
name: k3s-dev
description: k3s-studio 로컬 풀스택(Postgres + rapid-mlx 모델 서버 + Spring Boot API + Next.js UI)을 한 번에 기동/중지한다. "로컬 서버 띄워줘", "전체 서비스 실행", "스택 올려줘/내려줘" 같은 요청에 사용.
---

# k3s-studio 로컬 스택 실행

로컬 개발 풀스택을 멱등성 있게 기동한다. 이미 떠 있는 서비스는 건너뛴다.

## 기동

`start.sh`를 **백그라운드로** 실행하고(모델 최초 다운로드 시 수 분 소요), 출력의 URL을 사용자에게 보고한다.

```bash
.claude/skills/k3s-dev/start.sh
```

기동 순서: Postgres(:5433) → rapid-mlx(:8000) → API(:9090) → UI(:3000) → AI 설정을 로컬 서버로 정렬.

- 모델 변경: `K3S_AI_MODEL=qwen3.5-9b-4bit .claude/skills/k3s-dev/start.sh`
- 로그: `${TMPDIR:-/tmp}/k3s-studio-dev/{model,api,ui}.log`
- UI는 현재 머신 LAN IP(`ipconfig getifaddr en0`)로 바인딩된다.

## 중지

```bash
.claude/skills/k3s-dev/stop.sh        # API/UI/모델 종료, Postgres 유지
.claude/skills/k3s-dev/stop.sh --db   # Postgres 컨테이너까지 중지
```

## 동작 메모

- AI 연동 설정은 DB 테이블 `ai_model_config`에 저장된다. start.sh가 활성 행을 로컬 rapid-mlx(`http://127.0.0.1:8000`)로 맞추고, 기존 LAN 프로파일은 비활성으로 보존한다.
- `next.config.ts`의 API rewrite는 `BACKEND_URL` 환경변수를 따른다(start.sh가 `http://localhost:9090` 주입).
- Postgres는 `docker compose`가 자격증명 헬퍼 부재로 pull 실패할 수 있어, 기존 컨테이너가 있으면 `docker start`로 띄운다.

## 검증

```bash
curl -s localhost:9090/api/ai/config           # 활성 설정
curl -s localhost:8000/v1/models               # 모델 서버
curl -sN -X POST localhost:9090/api/ai/chat -H 'Content-Type: application/json' -d '{"message":"ping"}'
```
