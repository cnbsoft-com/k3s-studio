# k3s-studio 구현 이력

---

## v1: K8s Manifest 조회 + Template 라이브러리 — 완료

**커밋:** `4c80966`, `a7e530d` (main)
**완료일:** 2026-05-24

- 리소스 행 클릭 → 읽기전용 YAML 패널 (4상태: 초기/로딩/에러/성공)
- 서버 메타데이터 자동 제거 (managedFields, uid, ownerReferences 등)
- ManifestTemplate 라이브러리: 클러스터별 저장/불러오기/삭제, 중복 시 409

---

## v2: Apply 히스토리 + k8s API 타임아웃 — 완료

**커밋:** `4129b2d` (main)
**완료일:** 2026-05-24

- #6 Apply/Delete 실행 이력 DB 저장 + UI 히스토리 목록 (클릭 시 편집기 복원)
- #7 KubernetesClientFactory 로컬/원격 모두 requestTimeout 30초 적용

---

## v3: Pod 로그 조회 + 리소스 확장 + hardware 수정 — 완료

**커밋:** `da8a36c`, `ff0d4d6`, `16c365f` (main)
**완료일:** 2026-05-24

- Pod 선택 시 YAML/로그 탭 전환, tail 100줄 on-demand 조회
- K8s 리소스 타입 확장: StatefulSets, Ingresses, Secrets (Secrets data → `<secret>` 마스킹)
- #4 멀티패스 hardware 수정: Stopped 노드에서 CPU/메모리/디스크 변경 (`multipass set`)

---

## v4: AI 프롬프트 직접 관리 — 계획 중

<!-- /autoplan restore point: /Users/dino/.gstack/projects/cnbsoft-com-mpk3s/main-autoplan-restore-20260526-223733.md -->

**목표**: Ollama/OpenWebUI MCP 도구 제거 → k3s-studio를 AI 프롬프트로 직접 관리

### 전제 (Premises)

1. 제거 대상 = `tools/ai.ts` (Ollama 4개 도구) + `ollamaHttp` + HTTP 브리지 모드
   - 이유: Ollama를 클러스터에 "배포"하는 기능은 k3s-studio의 핵심이 아님
2. AI 관리 방식 = k3s-studio-ui 내 채팅 패널 + 커스텀 모델 (OpenAI 호환)
3. 모델 연결 = OpenAI 호환 API (Ollama 로컬, Claude API, OpenAI 등 URL+Key+모델명 설정)

### 변경 범위

#### 제거

| 파일 | 제거 내용 |
|------|-----------|
| `apps/k3s-studio-mcp/src/tools/ai.ts` | 전체 삭제 (4개 Ollama 도구) |
| `apps/k3s-studio-mcp/src/client.ts` | `ollamaHttp` axios 인스턴스, `OLLAMA_URL` env |
| `apps/k3s-studio-mcp/src/index.ts` | HTTP 브리지 모드 (express), `registerAiTools` |
| `apps/k3s-studio-mcp/package.json` | `express` 의존성 |

#### 추가 — k3s-studio-api (Spring Boot 3.4.4 / Java 21)

| 파일 | 내용 |
|------|------|
| `ai/AiModelConfig.java` | JPA 엔티티: model_url, model_name, api_key (암호화) |
| `ai/AiModelConfigRepository.java` | JpaRepository |
| `ai/AiService.java` | OpenAI 호환 API 호출 (function-calling), SseEmitter 스트리밍 |
| `ai/AiController.java` | `POST /api/ai/chat`, `GET /api/ai/config`, `PUT /api/ai/config` |

AI 도구 정의 (k3s-studio-api 기존 서비스 래핑):
- `list_servers`, `list_clusters`, `get_cluster_detail`
- `list_pods`, `get_pod_logs`, `apply_manifest`, `delete_resource`
- `list_nodes`, `list_jobs`

의존성 추가: **없음** — `RestClient` 사용 (Spring Boot 3.2+ 내장, `spring-boot-starter-web` 포함, WebClient/WebFlux 불필요)

> **CEO 결정**: API 키는 서버 DB에 저장하지 않음. 클라이언트(UI)에서 X-AI-Api-Key 헤더로 직접 전달. 서버는 model_url, model_name만 저장.

> **Eng 결정 (핵심)**:
> - `RestClient`로 OpenAI 호환 API 호출 (WebClient 대신 — 의존성 없음)
> - AI 채팅 실행은 `@Async("aiTaskExecutor")` 전용 스레드풀 (기본 Tomcat 스레드 고갈 방지)
> - function-calling 루프 최대 10회 하드 제한
> - AI용 `get_pod_logs` tool: 최대 tail=200 서버 측 cap
> - `SseEmitter` 타임아웃 120초 (2분)
> - `Message.content`: `@Column(columnDefinition = "TEXT")`
> - `WebConfig.java`: `X-AI-Api-Key`를 `allowedHeaders`에 추가
> - 인증 없음 — 내부망 전용으로 스코프 한정 (v4)

#### 추가 — k3s-studio-ui (Next.js 15 / React 19)

| 파일 | 내용 |
|------|------|
| `app/ai/page.tsx` | AI 채팅 페이지 (스트리밍, tool-call 결과 렌더링) |
| `app/settings/ai/page.tsx` | AI 모델 설정 (URL, Key, 모델명) |
| `components/ai-chat.tsx` | 채팅 컴포넌트 (메시지 목록, 입력창) |
| `components/sidebar.tsx` | AI 아이콘 추가 |
| `lib/ai.ts` | POST /api/ai/chat 호출 함수 |

의존성 추가: **없음** — Vercel AI SDK 제거. 직접 fetch + ReadableStream으로 SSE 파싱 (프로토콜 불일치 방지, P5).

> **Design 결정들 (자동)**:
> - 레이아웃: `flex flex-col h-full overflow-hidden`, 메시지 `flex-1 overflow-y-auto`, 입력 `sticky bottom-0`
> - AI 미설정 시: 배너 + 설정 페이지 링크 표시 (채팅창 비활성화)
> - 툴 실행 중: "⚙ list_pods 실행 중..." 인라인 인디케이터
> - 결과 렌더링: 자연어 요약 + 접을 수 있는 데이터 테이블 (list 계열), 코드블록 (logs), 상태 배지 (apply/delete)
> - 시스템 프롬프트: k3s-studio 컨텍스트(서버 목록, 클러스터 목록) 자동 주입, 하드코딩
> - 위험 작업: 실행된 도구명+파라미터를 항상 메시지에 표시
> - API 키: `sessionStorage`에 저장 (새로고침 유지, 탭 닫으면 소멸)
> - 대화 목록: `/ai` 페이지 좌측 접을 수 있는 패널
> - 빈 채팅: 클릭 가능한 예시 프롬프트 3개 표시

### 아키텍처

```
사용자 (브라우저)
  │  자연어 프롬프트
  ▼
k3s-studio-ui (Next.js)
  │  POST /api/ai/chat (SSE 스트리밍)
  ▼
k3s-studio-api (Spring Boot)
  │  OpenAI 호환 API (function-calling)
  ▼
커스텀 모델 (Ollama 로컬 / OpenAI / Claude 등)
  │  tool_call 응답
  ▼
k3s-studio-api (tool 실행: ClusterService, K8sService 등)
  │  결과 → AI → 자연어 응답
  ▼
사용자 (스트리밍 응답)
```

#### 추가 — k3s-studio-api 대화 이력 (CEO 결정: 스코프 포함)

| 파일 | 내용 |
|------|------|
| `ai/Conversation.java` | JPA 엔티티: id, created_at |
| `ai/Message.java` | JPA 엔티티: conversation_id, role, content, created_at |
| `ai/ConversationRepository.java` / `MessageRepository.java` | JpaRepository |

엔드포인트 추가:
- `GET /api/ai/conversations` — 대화 목록
- `GET /api/ai/conversations/{id}/messages` — 특정 대화 메시지 목록
- `POST /api/ai/chat` — conversation_id 파라미터로 기존 대화 이어가기

### 지원 모델 최소 요건 (CEO 결정: 명시화)

function-calling을 지원하는 모델이어야 함. 검증된 조합:
- `gpt-4o-mini`, `gpt-4o` (OpenAI)
- `claude-3-5-haiku` (claude.ai API proxy)
- `qwen2.5:7b` 이상 (Ollama 로컬)

설정 UI에서 모델 연결 테스트 버튼 제공 (도구 호출 없는 hello 메시지로 검증).

### 스코프 외 (이번 버전)

- 멀티 클러스터 동시 작업
- 위험 작업 확인 프롬프트 (삭제 시 "정말로?" 처리)
- 대화 공유/내보내기

### 성공 기준

- [ ] MCP `tools/ai.ts` 제거 후 `npm run build` 성공
- [ ] `/api/ai/config` PUT → GET 라운드트립 동작
- [ ] `/api/ai/chat`에 "서버 목록 보여줘" → `list_servers` 도구 호출 확인
- [ ] function-calling 10회 초과 시 에러 메시지 반환 확인
- [ ] 255자 초과 AI 응답이 DB에 저장되는지 확인 (TEXT 컬럼)
- [ ] k3s-studio-ui `/ai` 페이지에서 스트리밍 채팅 동작
- [ ] AiService 단위 테스트: WireMock으로 OpenAI mock → tool_call → stop 흐름 검증

---

---

## v5: AI K8s Object Management UX 개선 — 계획 중

<!-- /autoplan restore point: /Users/dino/.gstack/projects/cnbsoft-com-mpk3s/feat-ai-agent-manager-autoplan-restore-20260527-102411.md -->

**목표**: AI 채팅으로 pod, service, deployment 등 k8s 오브젝트 생성/삭제 시 불편함 해소

### 전제 (Premises)

1. AI 채팅 채널은 v4에서 완성됨 (SSE 스트리밍, 대화 이력, function-calling)
2. 불편함의 원인 = 도구 부족 + YAML 비가시성 + 텍스트 전용 응답
3. 서버 아키텍처 변경 없음 — 기존 K8sService 메서드 래핑 + 시스템 프롬프트 개선
4. 마크다운 렌더링은 프론트엔드 전용 변경 (서버 API 변경 없음)

### 현재 문제점 (Pain Points)

| # | 문제 | 결과 |
|---|------|------|
| 1 | `list_services`, `list_deployments` AI 도구 없음 | "서비스 목록 보여줘" 불가능 |
| 2 | AI가 `apply_manifest` 호출 시 YAML이 사용자에게 안 보임 | 무엇이 배포되는지 모름 |
| 3 | `delete_manifest` 확인 없이 즉시 실행 | 실수 방지 없음 |
| 4 | AI 응답이 평문 텍스트 | 목록/YAML 읽기 어려움 |
| 5 | AI "적용할까요?" 질문에 텍스트 입력 필요 | 확인 UX 불편 |

### 변경 범위

#### 1. Backend: AI 도구 확장 (AiService.java)

**executeTool + buildToolDefinitions에 추가:**

| 도구명 | 매핑 | 파라미터 |
|--------|------|----------|
| `list_services` | K8sService.getServices() | clusterName, namespace |
| `list_deployments` | K8sService.getDeployments() | clusterName, namespace |
| `list_statefulsets` | K8sService.getStatefulSets() | clusterName, namespace |
| `get_resource_manifest` | K8sService.getResourceManifest() | clusterName, resourceType, namespace, resourceName |

기존 K8sService 메서드를 그대로 래핑. 새 의존성 없음.

#### 2. Backend: Manifest 승인 흐름 (AiService + AiController)

**Premise Gate D1 결과: 서버 측 이벤트 강제 방식 채택 (B)**

AI가 `apply_manifest`/`delete_manifest`를 호출하면:
1. 즉시 실행 대신 `Map<Long, PendingOperation> pendingOps` (in-memory, conversationId 키)에 저장
2. SSE `event: preview` 전송: `{action: "apply"|"delete", yaml: "...", clusterName: "..."}`
3. SSE `event: done` 전송 후 SseEmitter 종료 (스트림 완료)
4. 프론트에서 "적용" 버튼 클릭 → `POST /api/ai/confirm/{conversationId}`
5. "취소" 버튼 클릭 → `POST /api/ai/cancel/{conversationId}`
6. confirm/cancel 엔드포인트: pending op 실행 또는 폐기 후 결과 반환 (REST, 비-SSE)

`PendingOperation` 레코드: `{String action, String yaml, String clusterName}`

재시작 시 pendingOps 소멸 허용 (내부망 전용, 단일 사용자).

**시스템 프롬프트에도 규칙 추가** (이중 안전장치):
- 목록 조회 결과는 마크다운 테이블 형식으로 응답

#### 3. Frontend: 마크다운 렌더링 (ai/page.tsx)

- `react-markdown` + `remark-gfm` 의존성 추가 (`apps/k3s-studio-ui`)
- AI 메시지 렌더링: `whitespace-pre-wrap` div → `<ReactMarkdown>` 컴포넌트로 교체
- 마크다운 테이블: `remark-gfm` 플러그인으로 렌더링
- 코드블록: pre/code 스타일링 (배경색, monospace, 복사 없음)

#### 4. Frontend: Manifest 미리보기 카드 (ai/page.tsx + lib/ai.ts)

**Design Phase 결정 반영 (D-v5-4~9)**

`ChatStreamCallbacks`에 `onPreview` 추가:
```typescript
onPreview: (action: "apply" | "delete", yaml: string, clusterName: string) => void
```

`ai/page.tsx` 상태 추가:
```typescript
const [pendingPreview, setPendingPreview] = useState<{action, yaml, cluster} | null>(null)
const [previewStatus, setPreviewStatus] = useState<"pending" | "loading" | "done" | "error" | null>(null)
```

미리보기 카드 스펙:
- **위치**: 메시지 스트림 끝에 독립 블록 (`messages` 배열 외부, `activeTool` 표시와 유사)
- **너비**: `w-full` (메시지 버블 `max-w-[80%]` 아님)
- **헤더**: 액션 요약 (`클러스터 X에 nginx-deployment를 [적용|삭제]할까요?`) + 버튼 상단 배치
- **버튼**: apply → "적용" (파란색), delete → "삭제 확인" (빨간색) / 취소는 항상 "취소"
- **테두리**: apply=`border-blue-400`, delete=`border-red-400`
- **YAML 영역**: `max-h-64 overflow-y-auto bg-muted rounded text-xs font-mono p-3`
- **버튼 클릭 후**: 비활성화 + 로딩 스피너 → 완료 시 "✓ 적용됨" / "✗ 실패: {error}" 메시지로 교체
- **대화 전환 시**: `useEffect([activeConversationId])` → pending 있으면 cancel POST + `setPendingPreview(null)`

`lib/ai.ts` 신규 함수:
```typescript
confirmManifest(conversationId: number): Promise<{message: string}>  // POST /api/ai/confirm/{id}
cancelManifest(conversationId: number): Promise<void>                 // POST /api/ai/cancel/{id}
```

`lib/ai.ts` `streamChat` 수정: SSE `event: preview` → `callbacks.onPreview(action, yaml, clusterName)`

### 아키텍처

```
Browser                  AiService (@Async)           K8s Cluster
  │ POST /chat               │                            │
  │─────────────────────────►│                            │
  │                          │ AI calls apply_manifest    │
  │   event: preview (YAML)  │ pendingOps.put(convId, op) │
  │◄─────────────────────────│ emit preview → emit done   │
  │                          │ emitter.complete()         │
  │ POST /confirm/{convId}   │                            │
  │─────────────────────────►│                            │
  │                          │ op = pendingOps.remove()   │
  │                          │ k8sService.applyManifest()─►│
  │   200 {message}          │◄───────────────────────────│
  │◄─────────────────────────│                            │
```

기존 v4 SSE 스트리밍 아키텍처 유지. 새 도구는 executeTool switch + buildToolDefinitions에 추가.  
프론트엔드는 메시지 렌더링 레이어 교체 + preview 카드 신규 추가.

### Error & Rescue Registry

| 오류 시나리오 | 발생 지점 | 영향 | 해결 |
|---|---|---|---|
| AI가 잘못된 YAML 생성 | apply_manifest 호출 전 | Preview 카드에서 사용자 취소 가능 | Preview 도입으로 완화 |
| conversationId pending 없음 | POST /confirm | 404 반환 | 컨트롤러에서 `pendingOps.get()` null 체크 |
| K8s apply/delete 실패 | confirm 실행 중 | 500 + `{error}` 반환 | UI에서 error 상태 표시 |
| confirm 이중 클릭 (race) | 프론트/백 동시 | remove() 원자적 → 두 번째는 404 | ConcurrentHashMap + remove 선행 |
| 대화 전환 시 pending 잔존 | 프론트 state 변경 | cancel POST 자동 발송 | useEffect로 처리 |
| SSE 120초 타임아웃 초과 | 긴 AI 응답 | stream 종료 → 재요청 필요 | 기존 제한 그대로 (v5 스코프 외) |
| args.get("clusterName") null | executeTool 신규 도구 | NPE 또는 잘못된 클러스터 | `getOrDefault` + null 체크 |

### 테스트 계획

| 코드 경로 | 테스트 유형 | 파일 |
|---|---|---|
| `executeTool("apply_manifest")` → pending 저장, 즉시 실행 안 함 | Unit | AiServiceTest.java |
| `POST /confirm` K8s 성공 → 200 {message} | Integration | AiControllerTest.java |
| `POST /confirm` K8s 실패 → 500 {error} | Integration | AiControllerTest.java |
| `POST /confirm` 두 번 호출 → 404 | Integration | AiControllerTest.java |
| ConcurrentHashMap 동시 confirm → 한 번만 실행 | Concurrency | AiServiceConcurrencyTest.java |
| `event: preview` SSE 파싱 → `onPreview` 콜백 발동 | Frontend unit | ai.test.ts |
| `previewReady` 상태 true 후 버튼 활성화 | Frontend unit | AiPage.test.tsx |

### 스코프 외 (이번 버전)

- YAML 편집 가능한 미리보기 모달 (서버 상태 pause/resume 필요 — v6)
- apply 전/후 리소스 diff 보기
- 멀티 클러스터 동시 배포

### 성공 기준

- [ ] "nginx 서비스 목록 보여줘" → AI가 `list_services` 호출, 마크다운 테이블 응답
- [ ] "nginx deployment 3개 만들어줘" → AI가 YAML 코드블록 표시 + "적용할까요?" 질문
- [ ] "네" 버튼 클릭 → `apply_manifest` 호출, 배포 완료 응답
- [ ] "nginx deployment 삭제해줘" → AI가 삭제 대상 표시 + 확인 후 삭제
- [ ] `list_deployments` 결과가 마크다운 테이블로 렌더링됨

---

---

## v6: AI로 okteto/hello-world 배포 + HTTP 접근 — 계획 중

<!-- /autoplan restore point: /Users/dino/.gstack/projects/cnbsoft-com-mpk3s/feat-ai-agent-manager-autoplan-restore-20260527-173150.md -->

**목표**: AI에게 `okteto/hello-world:okteto` 이미지의 서비스를 만들어달라고 하면 생성되고, 실제로 HTTP 요청을 보낼 수 있는 URL을 AI가 보고하는 기능

### 전제 (Premises)

1. v5 순차 승인 흐름 유지 (D1=A) — Deployment 먼저 confirm, 그 다음 Service confirm
2. NodePort 방식 사용 — k3s 로컬 환경에 LoadBalancer/Ingress Controller 불필요
3. `list_nodes` 도구 추가 (D2=A) — AI가 자율적으로 호출해 URL 조합
4. 서버 코드만 변경 — UI 변경 없음 (v5 미리보기 카드 그대로 사용)

### 변경 범위

#### 1. K8sService.java — `getNodes` 메서드 추가 + `toServiceResponse` nodePort 포함

**추가:**
```java
public List<Map<String, Object>> getNodes(String clusterName) throws IOException {
    // nodes().list() → name, status(Ready/NotReady), internalIP, externalIP 반환
}
```

**수정:**
```java
// toServiceResponse: NodePort 타입이면 ports에 "(nodePort: XXXXX)" 포함
```

#### 2. AiService.java — `list_nodes` 도구 + 시스템 프롬프트

**executeTool 추가:**
```java
case "list_nodes" -> {
    String cluster = requireString(args, "clusterName");
    yield objectMapper.writeValueAsString(k8sService.getNodes(cluster));
}
```

**buildToolDefinitions 추가:**
- `list_nodes(clusterName)` — "클러스터 노드 목록 및 IP 주소 조회"

**시스템 프롬프트 추가:**
```
NodePort 서비스를 생성한 후에는 반드시:
1. list_services로 할당된 nodePort를 확인하세요.
2. list_nodes로 노드 InternalIP를 확인하세요.
3. 접근 가능한 URL http://{InternalIP}:{nodePort}를 사용자에게 알려주세요.
```

### 성공 기준

- [ ] "okteto/hello-world 서비스 만들어줘" → AI가 Deployment YAML 미리보기 제시
- [ ] Deployment confirm → AI가 Service YAML 미리보기 제시
- [ ] Service confirm → AI가 `list_nodes` + `list_services` 호출 후 `http://IP:PORT` URL 보고
- [ ] 해당 URL로 curl 요청 시 응답 반환 확인

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Finding 1 (Wrong problem framing) — 유지: 사용자가 MCP vs UI 채팅 패널 선택지에서 명시적으로 UI 채팅 패널을 선택함 | Mechanical | P6 Bias toward action | 사용자 선택이 이미 확정됨. CEO 리뷰의 재프레이밍 제안은 무시 | MCP stdio만 사용 |
| 2 | CEO | Finding 2 (function-calling 모델 가정) — 지원 모델 최소 요건을 설정 섹션에 명시 | Mechanical | P1 Completeness | 잘못된 모델로 연결 시 명확한 에러가 필요함 | 묵시적 가정 유지 |
| 3 | CEO | Finding 3 (API 키 서버 저장 보안) — API 키를 DB에 저장하지 않고 클라이언트(UI)에서 헤더로 직접 전달 | Mechanical | P5 Explicit over clever | 서버가 키를 보관하지 않으면 침해 시 피해 최소화. 단순하고 명확함 | DB 암호화 저장 |
| 4 | CEO | Finding 4 (Spring AI 과다 의존성) — Spring AI 스타터 제거, WebClient 직접 사용 | Mechanical | P5 Explicit over clever | 80-100줄로 동일 기능 구현. Spring AI는 디버깅이 어렵고 API가 불안정함 | spring-ai-openai-spring-boot-starter |
| 5 | CEO | Finding 5 (대화 이력 미저장) — 최소 대화 이력 추가: conversation_id + 메시지 목록 DB 저장 | Mechanical | P1 Completeness | 새로고침 시 맥락 소실은 즉각적인 UX 문제. 단순 테이블 2개로 해결 가능 | 세션 메모리만 |
| 6 | CEO | Finding 6 (차별점 없음) — 플랜에 사용 사례 설명 추가, 스코프 변경 없음 | Mechanical | P6 Bias toward action | k3s-studio는 개인 사용 도구. 시장 차별점보다 기능 완성이 우선 | 재설계 |
| 7 | Design | 채팅 레이아웃 구조 — `flex flex-col h-full` wrapper 명시 | Mechanical | P5 Explicit | 기존 main 레이아웃과 충돌 방지 | 기본 레이아웃 상속 |
| 8 | Design | Vercel AI SDK 제거 — direct fetch + ReadableStream 사용 | Mechanical | P5 Explicit | SseEmitter ↔ useChat 프로토콜 불일치 방지 | Vercel AI SDK |
| 9 | Design | API 키 sessionStorage 저장 | Mechanical | P3 Pragmatic | localStorage XSS 위험 최소화, 메모리보다 UX 개선 | localStorage, DB 저장 |
| 10 | Design | 대화 목록 — /ai 페이지 좌측 패널 | Mechanical | P5 Explicit | 사이드바에 넣으면 다른 페이지에서도 항상 보임 (불필요) | 사이드바 통합 |
| 11 | Design | 시스템 프롬프트 — k3s 컨텍스트 자동 주입, 하드코딩 v4 | Mechanical | P5 Explicit | 범용 AI 동작 방지. v5에서 커스터마이즈 가능 | 커스터마이즈 가능한 DB 저장 |
| 12 | Design | 위험 작업 — 도구명+파라미터 항상 표시 | Mechanical | P1 Completeness | 실행 결과 투명성. 삭제 확인 미구현이므로 최소 안전장치 | 확인 프롬프트 |
| 13 | Eng | WebClient → RestClient (Spring Boot 3.2+ 내장) | Mechanical | P5 Explicit | WebClient는 WebFlux 필요. RestClient는 기존 starter에 포함. 의존성 추가 없음 | spring-boot-starter-webflux |
| 14 | Eng | @Async("aiTaskExecutor") 전용 스레드풀 | Mechanical | P3 Pragmatic | JobService 패턴과 동일. 동시 요청 시 Tomcat 스레드 고갈 방지 | 동기 실행 |
| 15 | Eng | function-calling 루프 최대 10회 하드 제한 | Mechanical | P1 Completeness | 무한루프 방지. 10회 도달 시 에러 메시지 반환 | 무제한 |
| 16 | Eng | AI용 get_pod_logs tail 최대 200 cap | Mechanical | P1 Completeness | 128K 컨텍스트 창 초과 방지. AI가 더 큰 값 요청해도 200으로 강제 | 무제한 |
| 17 | Eng | SseEmitter 타임아웃 120초 | Mechanical | P3 Pragmatic | 30초 기본값은 Ollama 로컬 모델에서 타임아웃 위험 | 30초 기본값 |
| 18 | Eng | Message.content @Column(columnDefinition = "TEXT") | Mechanical | P1 Completeness | VARCHAR(255) 는 AI 응답 1건도 못 담음 | 기본값 255 |
| 19 | Eng | WebConfig allowedHeaders에 X-AI-Api-Key 추가 | Mechanical | P1 Completeness | 없으면 브라우저 preflight 실패 | 현행 헤더만 허용 |
| 20 | Eng | 인증 없음 — 내부망 전용 스코프 명시 | Mechanical | P6 Bias toward action | v4는 단일 사용자. 포트 노출 주의사항 플랜에 기록 | v4에서 인증 구현 |
| 21 | Eng | AiService WireMock 단위 테스트 추가 | Mechanical | P1 Completeness | function-calling 루프 회귀 방지 | 테스트 없음 |
| D-v5-1 | CEO | 삭제 확인: AI 프롬프트 대신 서버측 pending+confirm 패턴 강제 | Mechanical | P1, P5 | AI 프롬프트 무시 시 프로덕션 삭제 위험 | 시스템 프롬프트 의존 |
| D-v5-2 | CEO | 빠른응답 버튼: 한국어 패턴 감지 대신 event:preview SSE 수신 시 표시 | Mechanical | P5 | Ollama 영어 응답 시 패턴 감지 불가 | 한국어 ? 감지 |
| D-v5-3 | CEO | PendingOperation: in-memory ConcurrentHashMap (conversationId 키) | Mechanical | P5, P3 | DB 불필요, 재시작 소멸 허용 (내부망) | DB 저장 |
| D-v5-4 | Design | confirm 성공/실패 피드백: 카드 상태를 메시지로 교체 | Mechanical | P1 | 피드백 없으면 사용자 혼란 | 버튼 비활성화만 |
| D-v5-5 | Design | 대화 전환 시 자동 cancel POST + 카드 숨김 | Mechanical | P1, P5 | pending 잔존 시 데이터 불일치 | 방치 |
| D-v5-6 | Design | ChatStreamCallbacks에 onPreview 추가 | Mechanical | P1 | SSE preview 이벤트 처리 불가 | 누락 |
| D-v5-7 | Design | delete 액션 버튼: "삭제 확인" / apply: "적용" | Mechanical | P5 | "적용" 버튼이 삭제에도 나오면 혼동 | 동일 레이블 |
| D-v5-8 | Design | confirm REST 응답: {message} 200, {error} 5xx | Mechanical | P5 | 오류 처리 불가 | 미정의 |
| D-v5-9 | Design | YAML 카드: apply=파란 테두리, delete=빨간 테두리, max-h-64 | Mechanical | P5, P3 | 시각적 위험 수준 구분 | 미정의 |
| D-v5-10 | Eng | HashMap → ConcurrentHashMap | Mechanical | P1 | 동시 요청 data race 방지 | HashMap |
| D-v5-11 | Eng | confirm: pendingOps.remove() 선행 후 K8s 호출 (atomic) | Mechanical | P5 | 이중 실행 방지 | 실행 후 remove |
| D-v5-12 | Eng | confirm 인증: 내부망 단일 사용자 스코프 유지 (v4 결정 일관) | Mechanical | P6 | v6에서 처리. v4 결정 20 재확인 | 즉시 인증 추가 |
| D-v5-13 | Eng | K8s 실패 시 500+{error} 반환, UI에서 error 상태 표시 | Mechanical | P5 | 실패를 성공으로 표시하면 사고 | 200 항상 반환 |
| D-v5-14 | Eng | 신규 4개 도구에 null 체크: getOrDefault + null guard | Mechanical | P1 | NPE 또는 잘못된 클러스터 선택 | 미체크 |
| D-v5-15 | Eng | previewReady 상태: event:done 수신 후에만 버튼 활성화 | Mechanical | P1 | done 전 confirm 타이밍 이슈 | 즉시 활성화 |
| D-v5-16 | Eng | 한 응답에 apply+delete 두 툴콜: 첫 번째만 pending, 두 번째 skip | Mechanical | P3 | 두 번째 put이 첫 번째 덮어씀 | 덮어쓰기 허용 |
