# PLAN — AI Agent 대화 파인튜닝 파이프라인

> 목표: AI Agent와의 대화(특히 **성공한 도구 호출 시퀀스 / 사용자 교정·피드백 / 클러스터·환경 상태**)를 모아
> 로컬 모델을 파인튜닝하여 **도구 호출 신뢰도와 confirm 행동**을 개선한다.

---

## 0. 핵심 통찰 (먼저 읽을 것)

### 통찰 1 — 지금 구조로는 학습 데이터가 사라진다
`AiService.streamChat`는 스트리밍 중 메모리의 `messages` 리스트에 구조화된 `tool_calls`(이름·인자)와
도구 결과를 담지만, **DB에는 최종 텍스트(`fullResponse`)만** 저장한다(`Message.content`).
파인튜닝의 핵심인 "질문 → 정확한 tool 호출 → 결과 → 답변" 구조가 보존되지 않는다.
→ **수집 계층 신설이 1번 작업.**

### 통찰 2 — 파인튜닝은 "행동/포맷"을 가르치지 "사실"을 외우게 하면 안 된다
클러스터/환경 상태를 가중치에 학습시키면 상태가 바뀌는 순간 환각이 된다.
환경 상태는 **프롬프트 컨텍스트(입력)** 로 넣어 "이 상태일 때 이렇게 행동한다"를 배우게 해야 한다.
즉 "클러스터/환경 상태"는 학습 라벨이 아니라 **샘플의 입력 컨텍스트**로 다룬다.

---

## 1. 전체 아키텍처 (5단계 플라이휠)

```
[1 수집] → [2 큐레이션·라벨] → [3 데이터셋 빌드] → [4 학습·평가] → [5 배포] ↺
```

### 1단계. 수집 (Capture) — Spring 측, 신규
신규 엔티티 `AgentTrace`로 어시스턴트 턴마다 **구조화된 전체 payload**를 저장.

| 필드 | 내용 |
|------|------|
| `conversationId`, `turnIndex` | 대화·턴 식별 |
| `modelName`, `toolSchemaHash` | 어떤 모델/도구 스키마로 생성됐는지 (드리프트 추적) |
| `messagesJson` | system + history + user + assistant(tool_calls) + tool 결과 전체 배열 |
| `envSnapshotJson` | 당시 서버/클러스터 목록·상태 (입력 컨텍스트용) |
| `finishReason`, `roundCount` | 품질 진단용 |
| **outcome** (사후 채움) | `confirmed` / `cancelled` / `toolError` / `userCorrectedNext` / `userRating(👍/👎)` |

훅 위치:
- `streamChat` 종료 시 `messages` 스냅샷을 직렬화해 저장 (이미 존재하는 리스트라 변경 최소).
- `confirmPending` / `cancelPending`에서 해당 trace의 outcome 갱신.

### 2단계. 큐레이션 & 자동 라벨 (공짜 신호 활용)
이미 코드에 **무료 라벨 신호**가 존재한다:

| 신호 | 의미 |
|------|------|
| `confirmPending` 호출됨 | 사용자가 제안 작업 **승인** → 긍정 (옳은 도구·인자 제안) |
| `cancelPending` 호출됨 | **거부** → 부정 |
| 도구 결과에 `"오류:"` 없음 | 도구 호출 성공 |
| 직후 사용자 메시지가 교정 패턴("아니 그게 아니라") | 부정 |

추가 권장:
- 채팅 UI(`ai/page.tsx`)에 **👍/👎 + "학습 제외" 토글** (가장 고품질 신호).
- **관리자 리뷰 화면**: 샘플을 accept/reject/edit 후에만 데이터셋 진입 (human-in-the-loop 게이트).
- 원칙: 파인튜닝은 **양보다 질**.

### 3단계. 데이터셋 빌드 (오프라인 스크립트)
- accept된 trace → **tool-calling chat 포맷 JSONL** (OpenAI function-calling / 모델 chat template).
  손실은 **assistant 턴에만** (system/user/tool 마스킹).
- **레닥션 필수**: kubeconfig 인증데이터·node-token·API 키·공인 IP 정규식 제거
  (kubeconfig 다운로드 작업의 base64 보호 패턴 재활용).
- **익명화**: 클러스터/서버 이름 → 플레이스홀더 치환해 특정 이름 과적합 방지.
- dedup(`list_pods` 폭주 방지), 클래스 밸런싱, train/val 분할.

### 4단계. 학습 + 평가 (M1 Max 51GB 활용)
- **스택**: `mlx-lm` **QLoRA** (Apple Silicon 네이티브). GPU박스 있으면 Unsloth/llama.cpp.
  작은 LoRA, 소수 epoch, 낮은 LR.
- **평가 하니스를 학습보다 먼저 만든다**: held-out "NL → 기대 tool 호출" 테스트셋.
  - 지표: 도구명 정확도 / 인자 JSON 유효성·일치 / **confirm 행동 정확도** / 환각·오호출률.
  - **게이트**: 베이스 모델 대비 eval에서 이겨야만 배포.
- 파국적 망각 방지: 일반 instruction 데이터 소량 혼합, 일반 능력도 eval.

### 5단계. 배포 + 플라이휠
- MLX adapter → fuse → **GGUF 변환 → `ollama create`(Modelfile)** → `AiModelConfig.modelName` 교체.
- **버전 관리/롤백**: 모델 태그 + trace에 생성 모델 버전 기록 → A/B·롤백 가능.
- 신규 trace 누적 N개마다 재학습 (`/schedule` cron 옵션).

---

## 2. 단계적 접근 (현실성)

파인튜닝은 **데이터 임계치**가 있다. 도구호출 신뢰도를 실제로 움직이려면 보통
**고품질·중복제거 300~1000+ 샘플**이 필요하고, 그 이하에선 few-shot/RAG가 ROI가 크다.

| Phase | 내용 | 가치 |
|-------|------|------|
| **0 (지금)** | 수집 + 라벨 계층 구축 | 방식 무관 필수, 되돌릴 수 있음, 후속 단계 해금 |
| **1** | 상위 trace로 few-shot 프롬프트 | 학습 없이 즉시 효과 |
| **2** | 데이터셋 ≥ 임계치 & eval 하니스 완성 후 첫 QLoRA | eval 게이트 통과 시만 배포 |
| **3** | 플라이휠 + 정기 재학습 | 지속 개선 |

→ **권장: Phase 0(수집·라벨)부터 시작.** 파인튜닝을 결정했더라도 데이터가 없으면 시작할 수 없고,
이 계층은 어떤 방식에도 공통이다.

---

## 3. 리스크 & 주의

- **도구 스키마 드리프트**: `delete_cluster` 추가 + 클러스터 생성 버그 3종 수정 이전의 trace는
  **버그 행동을 가르친다.** → `toolSchemaHash`로 버전 태깅, 현재 코드 이후 trace만 사용.
- 시크릿/PII 레닥션 누락 → 가중치에 비밀 각인 위험.
- 소량 데이터 과적합·망각.
- 베이스 모델 파인튜닝/재배포 라이선스 확인.

---

## 4. 코드 영향 지점

| 영역 | 작업 |
|------|------|
| 신규 엔티티 | `AgentTrace` + Repository |
| `AiService` | `streamChat` 종료 시 trace 저장, `confirmPending`/`cancelPending`에 outcome 갱신 |
| UI `ai/page.tsx` | 👍/👎 + 학습제외 토글, (선택) 관리자 리뷰 페이지 |
| 오프라인 | trace export → JSONL + 레닥션 스크립트, MLX 학습·eval 하니스 (Spring 앱 밖, 별도 디렉터리) |
| 설정 | `AiModelConfig.modelName` 재타겟 (+ 모델 버전 필드 선택) |

---

## 5. MVP 첫 슬라이스 (Phase 0)

1. `AgentTrace` 엔티티 + Repository
2. `streamChat` 종료 시 수집 훅
3. `confirmPending` / `cancelPending` outcome 연동
4. 채팅 UI 👍/👎 + 학습제외 토글

→ 이것만으로 학습 데이터가 쌓이기 시작한다.
