# k3s-studio Private AI 연계 기획

> 완전한 private 환경(오프라인)에서 Ollama + Open WebUI로 k3s-studio를 AI로 제어한다.

## 목표

인터넷 없는 환경에서 로컬 LLM(Ollama)과 대화해 k3s 클러스터를 자연어로 제어.
Claude Desktop 없이도 동일한 AI 제어 경험을 제공.

## 전체 아키텍처

```
사용자 (브라우저)
    │
    ▼
Open WebUI (k3s Pod) ─── Ollama API ───▶ Ollama (k3s Pod)
    │                                         │
    │ Function Call 결과 요청                  │ Function Call 생성
    ▼                                         │
k3s-studio MCP Bridge (HTTP Service) ◀────────┘
    │  /tools, /tools/{name}
    ▼
k3s-studio-api (:9090)
    │
    ▼
Multipass VMs / Kubernetes API
```

## 신규 컴포넌트

### 1. `apps/k3s-studio-mcp-bridge/` (신규)

기존 MCP tool 정의를 **OpenAI function calling 형식 HTTP API**로 노출.
Open WebUI의 Tool/Function 기능이 이 서비스를 호출.

```
GET  /tools              → OpenAI function schema 목록
POST /tools/{toolName}   → tool 실행 → k3s-studio-api 호출 → 결과
```

스택: Node.js + Express, 기존 `apps/k3s-studio-mcp/` 코드 재활용.

### 2. k3s AI Stack YAML 매니페스트

k3s에 배포할 Ollama + Open WebUI Kubernetes manifest.
k3s-studio UI의 "AI 어시스턴트 배포" 버튼이 이 YAML을 적용.

**컴포넌트:**
- `Namespace`: `ai-system`
- `Deployment`: ollama (ollama/ollama:latest)
- `Deployment`: open-webui (ghcr.io/open-webui/open-webui:main)
- `Service`: ollama (ClusterIP :11434)
- `Service`: open-webui (NodePort :8080)
- `PersistentVolumeClaim`: ollama-models (모델 저장, 10Gi~)

### 3. k3s-studio UI 변경

**클러스터 상세 페이지에 "AI 어시스턴트" 섹션 추가:**
- "AI 어시스턴트 배포" 버튼 → 폼(모델 선택, PVC 크기) → YAML 적용
- 배포 완료 후 Open WebUI URL 링크 표시
- 모델 목록 조회 / pull / 삭제 패널 (선택)

### 4. MCP Tools 확장 (`apps/k3s-studio-mcp/`)

```typescript
list_ollama_models    // Ollama에 pull된 모델 목록
pull_ollama_model     // 새 모델 pull (streaming)
deploy_open_webui     // Ollama + Open WebUI k3s 배포
get_ai_assistant_url  // Open WebUI URL 조회
```

## 구현 결정사항 (Engineering Review 2026-05-25)

### 아키텍처 결정
- **MCP Bridge**: 별도 서비스 아님 — 기존 `apps/k3s-studio-mcp/`에 HTTP 모드 추가 (`MCP_MODE=http` 환경변수)
- **Bridge → API 연결**: `hostNetwork: true` 또는 `K3S_STUDIO_API_URL=http://<nodeIP>:9090` 환경변수
- **Open WebUI PVC**: `open-webui-data` 1Gi 추가 (SQLite, Tool 등록, 채팅 이력 보존)
- **Ollama Resource Limits**: `requests: memory 2Gi` / `limits: memory 4Gi` (3b 기준, UI에서 조정 가능)
- **Tool 등록**: Open WebUI Settings → Tools에서 수동 등록 (가이드 문서 제공)
- **MCP 모드 전환**: `MCP_MODE=stdio|http` 환경변수로 분기
- **pull_ollama_model**: 비동기 fire-and-forget, 완료 확인은 `list_ollama_models`로 수행
- **Ollama timeout**: `client.ts`와 별도로 Ollama 전용 axios 인스턴스 생성 (timeout=300_000ms)

### 필수 추가 항목 (Outside Voice 발견)
- `package.json`에 `express` + `@types/express` 추가 필요
- k8s YAML에 MCP Bridge용 `Service` 매니페스트 추가 필요 (Open WebUI → Bridge ClusterIP 접근)

## 구현 단계

### 1단계 — MVP (이번 주)
- [ ] `apps/k3s-studio-mcp/`에 HTTP 모드 추가 (`MCP_MODE=http` 분기, Express endpoint)
- [ ] `express` 의존성 추가 + `tools/ai.ts` 신규 AI 도구 4개 구현
- [ ] Ollama client 전용 axios 인스턴스 (timeout=300_000ms) 분리
- [ ] k8s YAML 작성: Ollama + Open WebUI Deployment + Service + PVC (3개: ollama-models, open-webui-data, MCP Bridge Service)
- [ ] k3s-studio UI에 "AI 어시스턴트 배포" 버튼 추가
- [ ] Qwen2.5-coder:3b end-to-end 테스트

### 2단계 — 완성
- [ ] Helm chart (`charts/k3s-ai-stack/`) 패키징
- [ ] 모델 관리 패널 (pull/delete UI)
- [ ] GPU 지원 (NVIDIA device plugin)
- [ ] Open WebUI SSO 연동
- [ ] MCP Bridge k8s Service를 ExternalName으로 마이그레이션

## DevOps 최적화 최소 사이즈 모델

k3s-studio 제어에는 **function calling + YAML/shell 이해** 두 가지가 필수.
DevOps 작업에 특화된 최소 사이즈 모델을 우선 사용해 RAM을 절약한다.

### 권장 모델 (DevOps 최적화 순)

| 모델 | 크기 | RAM | Function Calling | DevOps 적합도 | 비고 |
|------|------|-----|-----------------|--------------|------|
| `qwen2.5-coder:3b` | 3B | **2GB+** | ✅ | ⭐⭐⭐⭐⭐ | **1순위 — 최소 사이즈 + 코드 특화** |
| `qwen2.5-coder:7b` | 7B | 4GB+ | ✅ | ⭐⭐⭐⭐⭐ | 정확도 높음, 넉넉한 환경 권장 |
| `llama3.2:3b` | 3B | 2GB+ | ✅ | ⭐⭐⭐⭐ | 범용, 경량 |
| `granite-code:3b` | 3B | 2GB+ | ✅ | ⭐⭐⭐⭐ | IBM DevOps/엔터프라이즈 최적화 |
| `phi3.5-mini` | 3.8B | 3GB+ | ✅ | ⭐⭐⭐ | Microsoft, 추론 강점 |
| `qwen2.5:7b` | 7B | 4GB+ | ✅ | ⭐⭐⭐⭐ | 범용 균형 |
| `llama3.1:8b` | 8B | 5GB+ | ✅ | ⭐⭐⭐⭐ | Meta 최신 |
| `mistral:7b` | 7B | 4GB+ | 부분 | ⭐⭐⭐ | function call 불안정 |

> ⚠️ Function calling 미지원 모델(llama2, gemma2 등)은 k3s-studio 제어 불가.

### 최소 사양 환경 권장 구성

RAM이 4GB 이하인 노드에서는 `qwen2.5-coder:3b`를 기본으로 사용:

```bash
# Ollama에서 pull
ollama pull qwen2.5-coder:3b

# 확인
ollama list
```

**왜 qwen2.5-coder인가:**
- Kubernetes YAML, Helm chart, shell 스크립트 이해도가 일반 모델보다 높음
- 3B 사이즈임에도 function calling 신뢰도가 7B 범용 모델 수준
- `kubectl`, `helm`, `docker` 명령어 컨텍스트를 별도 프롬프트 없이 이해

### 하드웨어별 권장 모델

| 환경 | RAM | 권장 모델 |
|------|-----|----------|
| 초경량 (Raspberry Pi 5, 저사양 VM) | 4GB | `qwen2.5-coder:3b` |
| 일반 개발 환경 | 8GB | `qwen2.5-coder:7b` |
| 팀 서버 / 전용 노드 | 16GB+ | `qwen2.5-coder:14b` 또는 `llama3.1:70b` |

### k3s-studio UI 모델 선택 기본값

"AI 어시스턴트 배포" 폼에서 노드 스펙을 감지해 자동 추천:
- 클러스터 노드 RAM < 8GB → `qwen2.5-coder:3b` 자동 선택
- 클러스터 노드 RAM ≥ 8GB → `qwen2.5-coder:7b` 자동 선택
- 사용자가 수동 변경 가능

## Open WebUI 설정 가이드

배포 후 Open WebUI에서:
1. Settings → Tools → 새 Tool 추가
2. URL: `http://k3s-studio-mcp-bridge:3001`
3. 모델 선택 → qwen2.5:7b
4. "클러스터 목록 보여줘" 입력 → `list_clusters` tool 자동 호출

## Claude Desktop과의 차이

| | Claude Desktop + MCP | Private AI (Ollama + Open WebUI) |
|--|---------------------|----------------------------------|
| 인터넷 필요 | ✅ 필요 | ❌ 불필요 |
| 모델 | Claude (Anthropic) | 로컬 모델 (Ollama) |
| AI 품질 | 높음 | 모델에 따라 다름 |
| 비용 | Claude 구독 | 무료 (하드웨어만) |
| 보안 | 데이터 외부 전송 | 완전 로컬 처리 |

## NOT in scope (명시적 제외)
- Open WebUI API 자동 Tool 등록 — API 불안정, 수동 가이드로 대체
- GPU 지원 (NVIDIA device plugin) — 2단계
- Helm chart — 2단계
- Open WebUI SSO 연동 — 2단계
- pull_ollama_model 진행 상태 스트리밍 — MCP 프로토콜 미지원
- MCP 서버 단위 테스트 — 사용자 결정으로 수동 E2E만

## What already exists (재활용 가능)
- `apps/k3s-studio-mcp/src/client.ts` — axios HTTP 클라이언트 (Ollama 전용 인스턴스만 추가)
- `apps/k3s-studio-mcp/src/tools/k8s.ts` — `apply_manifest` tool 재활용 (deploy_open_webui 기반)
- `apps/k3s-studio-mcp/src/polling.ts` — Job polling 유틸 (재사용 가능)
- k3s-studio-api `POST /api/clusters/{name}/k8s/apply` — YAML 적용 엔드포인트 이미 존재

## Failure Modes (Production)

| Codepath | 실패 시나리오 | Test | Error Handling | 사용자 경험 |
|----------|-------------|------|---------------|-----------|
| Bridge → k3s-studio-api | hostNetwork 설정 없이 Pod 기동 | 없음 | 없음 | **Silent fail** ⚠️ |
| pull_ollama_model | 디스크 부족으로 pull 실패 | 없음 | 없음 | **Silent fail** ⚠️ |
| Ollama inference | 7b 모델 CPU timeout (>300s) | 없음 | timeout 설정 분리 | Error 반환 |
| deploy_open_webui | 이미 배포된 상태에서 재호출 | 없음 | apply 멱등성 | 정상 (kubectl apply) |

**Critical gaps (silent failure)**: 2개 — Bridge 연결 실패, pull 에러 추적 불가

## 참고 자료

- [Ollama](https://ollama.ai)
- [Open WebUI](https://github.com/open-webui/open-webui)
- [Open WebUI Tools](https://docs.openwebui.com/features/plugin/tools/)
- [k3s-studio MCP](./apps/k3s-studio-mcp/MCP.md)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 8 issues, 2 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE VOICE:** Claude 서브에이전트 — Express 의존성 누락, MCP Bridge Service 매니페스트 누락, Ollama timeout 이슈 발견
- **UNRESOLVED:** 0 (모든 결정 완료)
- **VERDICT:** ENG CLEARED — 8개 이슈 모두 해결 방향 결정. 구현 시작 가능.
