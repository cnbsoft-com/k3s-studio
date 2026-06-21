<!-- /autoplan restore point: /Users/dino/.gstack/projects/cnbsoft-com-mpk3s/feat-ai-chat-improvements-autoplan-restore-20260528-003055.md -->
# k3s-studio 오픈소스 배포 계획

**목표:** k3s-studio를 공개 오픈소스 프로젝트로 GitHub에 배포한다.
개발자가 README를 읽고 15분 안에 로컬에서 실행할 수 있어야 한다.

**현재 상태 요약:**
- 코어 기능 완성 (클러스터 생성, K8s 리소스 관리, AI 관리자, MCP Server)
- MIT 라이선스 존재
- README 존재 (한/영 혼용)
- CI/CD 없음, 커뮤니티 인프라 없음

---

## Phase 1: 보안 및 민감정보 정리 (배포 차단 이슈)

### 1-1. 내부 IP 하드코딩 제거
- `apps/k3s-studio-api/src/main/resources-prod/application-allowedorigins.yml`
  - `192.168.0.209` → 환경변수 `${ALLOWED_ORIGINS:http://localhost:3000}` 로 교체
- `GUIDE.MD` — 내부 개발 가이드, `.gitignore`에 추가 또는 제거

### 1-2. resources-local git 추적 해제
- `apps/k3s-studio-api/src/main/resources-local/` — 로컬 설정이 git에 추적 중
- `.gitignore`에 `**/resources-local/` 추가
- 대신 `resources-local-example/` 폴더로 샘플 제공

### 1-3. 환경변수 기본값 가이드화
- `application.yml`의 `ENCRYPTION_KEY` 기본값이 0으로 하드코딩됨
  - 경고 로그 추가: "기본 암호화 키 사용 중 — 프로덕션에서는 변경 필요"
- `.env.example` 파일 제공 (API, UI 각각)

### 1-4. PRIVATE_K3_STUDIO.MD 처리
- 내부 기획 문서 — `.gitignore`에 추가 (공개 배포 시 불필요)

---

## Phase 2: 개발자 경험 (TTHW 15분 이하)

### 2-1. 원클릭 로컬 실행
현재: DB → API → UI 3단계 수동 실행
목표: `docker compose up` 또는 `make dev` 한 줄

**방법 A: All-in-one docker-compose (권장)**
```
containers/docker-compose.dev.yml:
  - postgresql:17
  - k3s-studio-api (JAR 빌드 포함)
  - k3s-studio-ui (npm dev)
```

**방법 B: Makefile**
```makefile
dev:   # DB up + gradlew bootRun + npm dev 병렬 실행
build: # JAR + npm build
```

### 2-2. .env.example 파일
`apps/k3s-studio-api/.env.example`:
```
DB_URL=jdbc:postgresql://localhost:5433/mpk3s
DB_USERNAME=mpk3s
DB_PASSWORD=mpk3s
ENCRYPTION_KEY=<generate: openssl rand -hex 32>
ALLOWED_ORIGINS=http://localhost:3000
```

`apps/k3s-studio-ui/.env.example`:
```
HOSTNAME=0.0.0.0
NEXT_PUBLIC_API_URL=http://localhost:9090
```

### 2-3. 설치 전제조건 자동 체크
`install.sh` 개선:
- Multipass 버전 체크
- Java 21+ 체크
- Node.js 20+ 체크
- Docker 체크
- 미설치 항목 안내 메시지 출력

### 2-4. 에러 메시지 개선
현재 이슈: SSH 실패 시 `exit=1` 만 출력됨 (이미 수정됨)
추가 개선:
- DB 연결 실패 시 명확한 안내 ("docker compose up 먼저 실행하세요")
- Multipass 미설치 시 명확한 안내

---

## Phase 3: 문서화

### 3-1. README.md 재작성 (영어 우선)
현재: 한국어 + 영어 혼용
목표: 영어 메인 README + 한국어 README_KO.md (선택)

**구조:**
```markdown
# k3s-studio
[뱃지 행: license, stars, CI, platform]
[30초 GIF 데모]

## What is this?
[한 문단 설명]

## Quick Start (5 steps)
## Features
## Architecture
## Configuration
## Contributing
## License
```

### 3-2. CONTRIBUTING.md
```markdown
# Contributing to k3s-studio
- Issues: 버그 리포트, 기능 요청
- PRs: fork → branch → PR
- 개발 환경 설정 (Phase 2 내용 참조)
- 커밋 컨벤션 (feat/fix/docs/chore)
- 코드 스타일 (Java: Google Style, TS: ESLint)
```

### 3-3. CODE_OF_CONDUCT.md
- Contributor Covenant v2.1 (표준 채택)

### 3-4. SECURITY.md
```markdown
# Security Policy
- 지원 버전
- 취약점 신고: GitHub Security Advisories 사용
- 공개 전 90일 책임 공개 원칙
```

### 3-5. 아키텍처 문서
`docs/ARCHITECTURE.md`:
- 컴포넌트 다이어그램 (현재 UML 활용)
- API 흐름 설명
- DB 스키마 개요

---

## Phase 4: 커뮤니티 인프라

### 4-1. GitHub Issue Templates (.github/ISSUE_TEMPLATE/)
```
bug_report.md:
  - 재현 단계
  - 기대 동작 vs 실제 동작
  - 환경 (OS, Multipass 버전, Java 버전)

feature_request.md:
  - 문제 설명
  - 제안 해결책
  - 대안
```

### 4-2. PR Template (.github/PULL_REQUEST_TEMPLATE.md)
```markdown
## 변경 사항
## 테스트
## 스크린샷 (UI 변경 시)
## 체크리스트
```

### 4-3. GitHub Discussions 활성화
- 카테고리: Announcements, Q&A, Ideas, Show and tell

### 4-4. README 뱃지 보강
- `[![CI](GitHub Actions badge)]`
- `[![Docker](Docker Hub badge)]` (Phase 6 이후)
- `[![GitHub Stars]()]`

---

## Phase 5: CI/CD (GitHub Actions)

### 5-1. .github/workflows/ci.yml
트리거: `push`, `pull_request` → `main`

```yaml
jobs:
  api-test:
    - Java 21 setup
    - ./gradlew test (단위 테스트)
    - ./gradlew build -x test (JAR 빌드)

  ui-lint:
    - Node 20 setup
    - npm ci
    - npm run lint
    - npm run build
```

### 5-2. .github/workflows/release.yml
트리거: `push` → `v*` tag

```yaml
jobs:
  build-and-push:
    - Docker 이미지 빌드 (API)
    - Docker Hub 또는 GHCR 푸시
    - GitHub Release 생성 (자동 release notes)
```

### 5-3. 코드 품질 (선택)
- GitHub Code Scanning (CodeQL)
- Dependabot 설정 (.github/dependabot.yml)

---

## Phase 6: 패키징

### 6-1. Docker 이미지 (API)
`apps/k3s-studio-api/Dockerfile`:
```dockerfile
FROM eclipse-temurin:21-jre-alpine
COPY build/libs/*.jar app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
```
이미지: `ghcr.io/cnbsoft-com/k3s-studio-api:latest`

### 6-2. All-in-one docker-compose
`docker-compose.yml` (프로젝트 루트):
```yaml
services:
  db: postgres:17
  api: k3s-studio-api (DB 의존)
  ui: k3s-studio-ui (API 의존)
```

주의: Multipass 명령은 호스트 OS에서만 실행 가능 — API를 Docker로 실행 시
`/var/run/multipass_socket` 마운트 또는 API를 네이티브 실행 유지 필요

### 6-3. 배포 모드 문서화
| 모드 | API | UI | DB |
|------|-----|----|----|
| 개발 | 네이티브 (`./gradlew bootRun`) | 네이티브 (`npm dev`) | Docker |
| 프로덕션 | Docker | Docker | Docker/외부 |

---

## Phase 7: 런치

### 7-1. 런치 전 체크리스트
- [ ] Phase 1~6 완료
- [ ] README에 GIF 데모 삽입
- [ ] `git clone → make dev` 15분 이내 확인
- [ ] 내부 IP, 개인정보 코드베이스 전체 스캔
- [ ] GitHub repository를 Public으로 전환

### 7-2. 배포 채널 (우선순위 순)
1. **Hacker News "Show HN"** — 기술 커뮤니티 최고 노출
2. **Reddit r/kubernetes** — 타겟 정확
3. **Reddit r/selfhosted** — K3s 사용자층
4. **X (Twitter)** — #kubernetes #k3s #homelab 해시태그

### 7-3. 런치 포스트 초안
```
Show HN: k3s-studio — Web UI + AI Manager for Multipass K3s clusters

Built this after getting tired of running kubectl commands to manage
my local k3s clusters. Features:
- 1-click cluster creation (master + workers via Multipass)
- K8s resource editor with YAML apply/delete
- AI manager (Ollama/OpenAI) for natural language cluster control
- MCP server for Claude Desktop integration

Built with: Spring Boot 3.4, Next.js 15, fabric8 client
GitHub: [url]
```

---

## 구현 순서 및 예상 시간

| Phase | 작업 | 예상 시간 (CC) |
|-------|------|---------------|
| 1 | 보안 정리 | 30분 |
| 2 | DX 개선 (Makefile + .env.example) | 1시간 |
| 3 | 문서화 (README + CONTRIBUTING + SECURITY) | 2시간 |
| 4 | 커뮤니티 인프라 (templates) | 30분 |
| 5 | CI/CD (GitHub Actions) | 1시간 |
| 6 | Docker 패키징 | 1시간 |
| 7 | 런치 준비 | 1시간 |
| **합계** | | **약 7시간** |

---

## 결정 보류 항목 (사용자 판단 필요)

| 항목 | 옵션 A | 옵션 B |
|------|--------|--------|
| Docker 전략 | All-in-one docker-compose (Multipass 제약 있음) | API는 네이티브, DB만 Docker |
| README 언어 | 영어 메인 + 한국어 별도 | 영어/한국어 병기 |
| CI 플랫폼 | GitHub Actions (무료, 통합 쉬움) | 없음 (나중에 추가) |
| 패키지 배포 | GHCR (GitHub Container Registry) | Docker Hub |

---

*작성일: 2026-05-28 | 브랜치: feat/ai-chat-improvements*

---

## GSTACK REVIEW REPORT

### /autoplan 리뷰 실행 결과

- **실행 단계:** CEO → Eng → DX (UI scope 없음, Design 스킵)
- **Codex:** 바이너리 없음 → Claude subagent-only 모드 [subagent-only]
- **전체 결정:** 13개 자동결정, 2개 Taste 결정, 1개 User Challenge

---

### CEO 리뷰 요약

| # | 심각도 | 이슈 | 자동결정 |
|---|--------|------|----------|
| C1 | CRITICAL | "15분 설치" 전제 오류 — Multipass 설치 시간 미포함 | 수정 → Quick Start에 Multipass 설치 단계 명시 |
| C2 | HIGH | Phase 2/6 순서 역전 — Docker를 Phase 2로 당겨야 | 수정 → Phase 2에 통합 |
| C3 | HIGH | Multipass 단일 의존성 위험 — 기존 K3s 연결 지원 결정 필요 | **USER CHALLENGE** → 사용자 결정 필요 |
| C4 | HIGH | 경쟁 포지셔닝 누락 — "왜 k3s-studio인가" 없음 | 포함 → Phase 3 README에 "Why k3s-studio?" 섹션 추가 |
| C5 | MEDIUM | GIF 데모 제작 시간 예산 없음 | 포함 → Phase 6에 별도 태스크로 추가 |
| C6 | LOW | CODE_OF_CONDUCT, Discussions — 커뮤니티 0일 때 불필요 | 연기 → Phase 4에서 제거, 런치 후 추가 |

### Eng 리뷰 요약

| # | 심각도 | 이슈 | 자동결정 |
|---|--------|------|----------|
| E1 | CRITICAL | Docker API 전략 충돌 — macOS에서 Multipass 소켓 마운트 불가 | **USER CHALLENGE** → API 항상 네이티브 실행으로 확정 |
| E2 | HIGH | ENCRYPTION_KEY 기본값 올-제로 — fail-fast 처리 필요 | 포함 → 기본값 시 앱 구동 차단, 생성 명령 안내 |
| E3 | HIGH | resources-local git rm --cached 절차 누락 — .gitignore만으로는 추적 해제 안 됨 | 포함 → Phase 1에 git rm --cached 명령 명시 |
| E4 | MEDIUM | CI에 테스트 없음 → 의미없는 그린 배지 | 포함 → smoke test 1개 이상 추가를 Phase 5 요건으로 명시 |
| E5 | MEDIUM | Liquibase 언급 없음 — 기여자가 DB 마이그레이션 방식 모름 | 포함 → Phase 2 Quick Start에 "스키마는 Liquibase 자동 적용" 명시 |

### DX 리뷰 요약

| # | 심각도 | 이슈 | 자동결정 |
|---|--------|------|----------|
| D1 | CRITICAL | TTHW 실제 30분+ — Multipass 설치 미포함 | 수정 (C1과 동일, 중복) |
| D2 | HIGH | 사전 조건 체크가 API 시작 후 → 에러 메시지 없음 | 포함 → install.sh가 API 시작 전 실행되도록 |
| D3 | HIGH | Swagger UI + MCP 연결 스니펫 없음 | 포함 → README Quick Start에 추가 |
| D4 | MEDIUM | README에 차별점 없음 | 포함 (C4와 동일) |
| D5 | MEDIUM | 마법의 순간 경로 없음 — AI 명령 예제로 안내 | 포함 → Quick Start 마지막 단계에 AI 명령 예제 추가 |

---

### Cross-Phase 테마

**테마 1: Multipass 제약 명확화** — CEO + Eng + DX 3개 단계 모두 독립적으로 발견.
API는 항상 호스트 네이티브 실행이어야 한다. Docker는 DB + UI만. 이것은 취향 문제가 아니라 기술 제약이다.

**테마 2: 경쟁 포지셔닝** — CEO + DX 2개 단계 발견.
"Multipass VM 라이프사이클 관리 + MCP/AI 통합"이 핵심 차별점. README 첫 단락에 명시 필수.

---

### Taste 결정 (사용자 판단)

**T1: README 언어 전략**
- 옵션 A: 영어 메인 README + README_KO.md 별도
- 옵션 B: 영어/한국어 병기 (현재 방식)
- 추천: A (국제 오픈소스 표준, HN 타겟 영어권)

**T2: CODE_OF_CONDUCT / GitHub Discussions 포함 여부**
- 옵션 A: 런치 시 포함 (표준 오픈소스 패키지)
- 옵션 B: 런치 후 트래픽 생기면 추가
- 추천: B (지금은 집중력 낭비, P3 Pragmatic)

---

### User Challenge (양 모델 동의 — 사용자 결정 필요)

**UC1: Docker API 전략**

당신이 계획한 것: "All-in-one docker-compose (권장)" — Phase 2에서 옵션 A로 표시됨

양 모델 추천: **API는 반드시 호스트 네이티브 실행** (옵션 B)

이유: macOS에서 Multipass는 `/var/run/multipass_socket`이 아닌 TCP gRPC로 통신한다. Docker 컨테이너 내부에서 호스트 Multipass에 접근하는 신뢰할 수 있는 방법이 없다. Docker Compose 올인원은 **Multipass 기능이 작동하지 않는** 상태로 배포된다.

실제 아키텍처:
- DB: Docker
- UI: Docker (또는 npm dev)
- API: 호스트 네이티브 (./gradlew bootRun) — 변경 불가

우리가 틀렸을 경우 비용: Docker API가 실제로 작동하는 방법이 있다면, "API 네이티브 필수" 문서가 기여자를 잘못 안내한다. (가능성 낮음)

**기본값: 당신의 원래 방향(All-in-one)이 유지됩니다. 변경하려면 명시적으로 답변하세요.**

---

### Decision Audit Trail

| # | Phase | 결정 | 분류 | 원칙 | 이유 |
|---|-------|------|------|------|------|
| 1 | CEO | Phase 4 CODE_OF_CONDUCT 연기 | Mechanical | P3 Pragmatic | 커뮤니티 0인 시점에서 불필요 |
| 2 | CEO | Phase 4 Discussions 연기 | Mechanical | P3 Pragmatic | 런치 후 추가 충분 |
| 3 | CEO | "Why k3s-studio?" README 섹션 추가 | Mechanical | P1 Completeness | 경쟁 비교 없이 설치 결정 불가 |
| 4 | CEO | GIF 데모 Phase 6 태스크 추가 | Mechanical | P1 Completeness | 런치 전 시각 증거 필수 |
| 5 | CEO | 기존 K3s 연결 지원 — 지금 결정 불필요 | Mechanical | P3 Pragmatic | 현재 스코프 외, TODOS로 연기 |
| 6 | Eng | ENCRYPTION_KEY fail-fast 추가 | Mechanical | P1 Completeness | 보안 위험, 명확한 수정 존재 |
| 7 | Eng | git rm --cached 절차 Phase 1에 추가 | Mechanical | P5 Explicit | .gitignore만으로는 부족, 구체적 명령 필요 |
| 8 | Eng | CI smoke test 요건 명시 | Mechanical | P1 Completeness | 의미없는 그린 배지 방지 |
| 9 | Eng | Liquibase 자동 적용 Phase 2에 명시 | Mechanical | P5 Explicit | 기여자 온보딩 필수 정보 |
| 10 | DX | install.sh 사전 조건 체크 → API 시작 전 실행 | Mechanical | P5 Explicit | 첫 에러가 명확한 안내 없으면 이탈 |
| 11 | DX | Swagger UI + MCP 스니펫 README에 추가 | Mechanical | P1 Completeness | 핵심 차별점 디스커버러빌리티 |
| 12 | DX | Quick Start 마지막 AI 명령 예제 추가 | Mechanical | P1 Completeness | 마법의 순간까지 경로 명확화 |
| 13 | DX | Multipass 설치를 Quick Start Step 0으로 격상 | Mechanical | P5 Explicit | 첫 번째 전제조건이 가장 먼저 와야 |
