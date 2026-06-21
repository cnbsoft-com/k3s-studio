<!-- /autoplan restore point: /Users/dino/.gstack/projects/cnbsoft-com-mpk3s/feat-ai-chat-improvements-autoplan-restore-20260528-002648.md -->
# AI Chat 기능 개선 계획

Branch: `feat/ai-chat-improvements`
Date: 2026-05-28
Author: IK-YONG CHOI

## 배경 / 문제

현재 AI Chat(v4 내장 AI 에이전트)은 핵심 기능을 동작시키는 수준이다. 하지만 YC 지원서와 실제 enterprise 데모에서 "완전한 K8s 생명주기 AI 제어"를 주장하려면 다음 두 가지가 반드시 필요하다:
1. **실제 토큰 단위 스트리밍** — 현재 모델 응답이 완료된 뒤 한 번에 전송됨. 체감 응답속도가 느림.
2. **클러스터 생명주기 도구** — start_cluster / stop_cluster / create_cluster 없이 "AI로 K8s 생명주기 제어"를 피치할 수 없음.

추가로 UX 마찰 3가지가 제품 완성도를 낮추고 있다:
- 대화 제목이 자동으로 생성되지 않음 (현재: `#3 5/28` 형식)
- 스트리밍 중 취소 불가 — 긴 응답 시 사용자가 기다려야 함
- 모바일에서 사이드바가 완전히 숨겨짐 (hidden md:flex)

## 현재 상태 파악

### 현재 도구 목록 (12개)
`list_servers`, `list_clusters`, `list_namespaces`, `list_pods`, `list_services`,
`list_deployments`, `list_statefulsets`, `get_resource_manifest`, `list_nodes`,
`get_pod_logs`, `apply_manifest`, `delete_manifest`

### 현재 스트리밍 방식
AiService.java가 LLM API를 `stream: false`(기본값)로 호출하고, 전체 응답 텍스트를
하나의 SSE 이벤트로 전송함. 토큰 단위 출력이 아님.

### 기존 코드에서 재사용 가능한 것
- `ClusterService.createCluster()` — 클러스터 생성 비동기 job
- `ClusterService.startNode() / stopNode()` — 노드 시작/정지
- `ClusterRepository.findByName()` — 클러스터 조회
- `K8sService.getConfigMaps/getIngresses` — 이미 구현됨

## 목표 (이 브랜치 완료 기준)

| # | 기능 | 효과 |
|---|------|------|
| P1 | True SSE token streaming | 체감 응답속도 3~5배 향상, YC 데모 UX |
| P2 | start/stop/create_cluster 도구 | "완전한 K8s 생명주기 AI 제어" 주장 가능 |
| P3 | Auto-title conversations | 첫 메시지 앞 25자로 대화 제목 자동 설정 |
| P4 | Stop streaming 버튼 | 스트리밍 중 즉시 취소 |
| P5 | 추가 K8s 도구 4개 | list_configmaps, list_ingresses, scale_deployment, restart_deployment |
| P6 | UX 소개 | 메시지 복사 버튼, 모바일 사이드바 Drawer |

## 구현 세부 계획

### P1: True Token Streaming

**문제:** `AiService.java:151`의 `callModel()`이 동기 REST 호출로 전체 응답을 받아 한 번에 전송.

**구현 방법:**
```java
// callModel → streamModel로 교체
// RestClient.ResponseSpec을 InputStream으로 받아 줄 단위 파싱
// 각 청크: data: {"choices":[{"delta":{"content":"hello"}}]}
// choices[0].delta.content를 SseEmitter로 즉시 전송

requestBody.put("stream", true);
client.post().uri("/chat/completions")
    .body(requestBody)
    .exchange((req, res) -> {
        try (var stream = res.bodyTo(InputStream.class)) {
            // BufferedReader로 줄 단위 읽기
            // "data: [DONE]"까지 파싱
        }
    });
```

**주의사항:**
- tool_calls가 있을 때 delta.tool_calls가 여러 청크에 걸쳐 누적됨
- finish_reason이 "tool_calls"인 청크까지 tool_calls 버퍼링 후 처리
- 텍스트 청크는 즉시 `emitter.send()` 전송

영향 파일: `AiService.java` — `callModel`, `streamChat` 루프 전체 재작성

### P2: Cluster Lifecycle Tools

**추가 도구:**
```java
case "start_cluster" -> {
    String name = requireString(args, "clusterName");
    Cluster cluster = clusterRepository.findByName(name)
        .orElseThrow(() -> new IllegalArgumentException("클러스터 없음: " + name));
    // 각 노드 startNode 호출 (동기, 타임아웃 주의)
    // "클러스터 name 시작 완료" 반환
}
case "stop_cluster" -> {
    String name = requireString(args, "clusterName");
    // 각 노드 stopNode 호출
}
case "create_cluster" -> {
    // args: clusterName(필수), masters(기본1), workers(기본0), cpu(기본2), memory(기본2048), disk(기본20)
    // ClusterRequest 빌드 후 clusterService.createCluster()
    // 비동기 job ID 반환: "클러스터 생성 시작됨 (job: uuid)"
}
```

시스템 프롬프트에 클러스터 생성/시작/정지 규칙 추가:
- create_cluster 시 기본값 명시
- start/stop은 실행 전 사용자에게 의도 재확인 불필요 (apply_manifest와 달리 인프라 수준이라 preview 없음)

영향 파일: `AiService.java` (executeTool, buildToolDefinitions, buildSystemPrompt)
의존 추가: `ClusterService`, `ClusterRepository` — @RequiredArgsConstructor로 inject

### P3: Auto-title Conversations

**구현 (방법 A — 단순):**
```java
// streamChat에서 Conversation 저장 직후
if (conversation.getTitle() == null) {
    String autoTitle = userMessage.length() > 25
        ? userMessage.substring(0, 25) + "..."
        : userMessage;
    conversation.setTitle(autoTitle);
    conversationRepository.save(conversation);
}
```

방법 B(LLM 미니 호출)는 API 비용 추가 및 지연 발생으로 제외.

영향 파일: `AiService.java:streamChat` 상단

### P4: Stop Streaming

**프론트엔드:**
```typescript
// ai.ts: streamChat에 signal 파라미터 추가
export async function streamChat(
  message: string,
  apiKey: string | null,
  conversationId: number | null,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal  // 추가
): Promise<void> {
  const res = await fetch(url, { method: "POST", headers, body, signal });
  // AbortError 시 callbacks.onError 호출하지 않고 조용히 종료
}
```

```tsx
// page.tsx: AbortController 추가
const abortRef = useRef<AbortController | null>(null);

// 스트리밍 중 취소 버튼
{streaming && (
  <button onClick={() => abortRef.current?.abort()}>
    <Square className="w-4 h-4" /> 중단
  </button>
)}
```

백엔드: 클라이언트 연결 끊김 시 SseEmitter가 IOException을 발생시킴 — 기존 catch 블록으로 처리됨 (별도 abort 엔드포인트 불필요).

영향 파일: `ai.ts`, `page.tsx`

### P5: 추가 K8s 도구 (4개)

기존 K8sService 메서드 직접 노출:
- `list_configmaps(clusterName, namespace)` — `K8sService.getConfigMaps()` 존재
- `list_ingresses(clusterName, namespace)` — `K8sService.getIngresses()` 존재
- `scale_deployment(clusterName, namespace, deploymentName, replicas)` — K8sService에 신규 추가 필요
- `restart_deployment(clusterName, namespace, deploymentName)` — rollout restart (annotation: kubectl.kubernetes.io/restartedAt)

K8sService에 신규 메서드:
```java
public void scaleDeployment(String clusterName, String namespace, String name, int replicas) {
    // fabric8 client로 scale
}
public void restartDeployment(String clusterName, String namespace, String name) {
    // patch annotation: kubectl.kubernetes.io/restartedAt = now
}
```

영향 파일: `K8sService.java` (2개 신규), `AiService.java` (4개 tool 추가)

### P6: UX 소개

**메시지 복사 버튼:**
```tsx
// assistant 메시지에 hover 시 복사 버튼
<button
  onClick={() => navigator.clipboard.writeText(msg.content)}
  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent"
>
  <Copy className="w-3.5 h-3.5" />
</button>
```

**모바일 사이드바 Drawer:**
- 현재 `hidden md:flex` → 모바일에서 `MenuIcon` 버튼 추가
- 클릭 시 absolute overlay drawer (shadcn Sheet 없이 Tailwind로 구현)

영향 파일: `page.tsx`

## 완료 기준

- [ ] 스트리밍 시 토큰이 청크 단위로 나타남 (전체 응답 기다리지 않음)
- [ ] "k3s-studio 클러스터 시작해줘" → AI가 start_cluster 도구 호출
- [ ] "k3s-studio 클러스터 만들어줘" → AI가 create_cluster 도구 호출
- [ ] 새 대화 시작 후 첫 메시지 전송 → 사이드바에 자동 제목 표시
- [ ] 스트리밍 중 "중단" 버튼 클릭 → 스트리밍 즉시 중단
- [ ] configmaps, ingresses 조회 명령 동작
- [ ] scale_deployment(nginx, 3) 동작
- [ ] 메시지 복사 버튼 동작
- [ ] 모바일에서 사이드바 접근 가능

## 범위 외 (이번 브랜치 제외)

- Multi-user / tenant isolation (별도 브랜치)
- 대화 검색/필터 (다음 이터레이션)
- Auto-title 방법 B (LLM 요약 호출) — 방법 A로 충분
- deploy_ai_stack 도구 (별도 브랜치)
- 커스텀 system prompt UI
- 대화 export (markdown)

## 기술 위험

| 위험 | 완화 |
|------|------|
| stream:true + tool_calls 청크 누적 파싱 복잡 | finish_reason:"tool_calls" 청크까지 tool_calls 버퍼링 후 처리. 텍스트 청크만 즉시 전송 |
| ClusterService.startNode 비동기 — 타임아웃 가능 | tool 결과로 "시작 요청됨" 반환, 상태는 list_clusters로 확인 유도 |
| SseEmitter 연결 끊김 IOException | 기존 catch(Exception) 블록으로 처리되나 명시적 AbortException 처리 확인 필요 |
| K8sService.scaleDeployment fabric8 API | fabric8 ScalableResource.scale(replicas) — 이미 다른 곳에서 유사 패턴 사용됨 |

## 구현 순서 (의존 관계 고려)

1. P3 (Auto-title) — 가장 단순, 독립적
2. P4 (Stop streaming) — 프론트엔드만 변경, 독립적
3. P5 (추가 도구) — K8sService 신규 메서드 → AiService 도구 추가
4. P2 (Cluster lifecycle) — ClusterService inject → AiService 도구 추가
5. P1 (True streaming) — AiService 핵심 루프 재작성, 가장 복잡
6. P6 (UX) — page.tsx만 변경, 독립적 (P4와 병행 가능)

---

## GSTACK REVIEW REPORT

> Generated: 2026-05-28 | Phases: CEO + Design + Eng | gstack v1.48.0.0

### 자동 결정 (8개)

| # | Phase | 결정 | 원칙 |
|---|-------|------|------|
| A1 | CEO | P5 scale/restart → preview+confirm 패턴 적용 | 파괴적 ops는 HITL 필요 (apply_manifest와 일관성) |
| A2 | CEO | P6 UX polish → 유지, 최하위 우선순위 | 기능 먼저 ship |
| A3 | CEO | P3 Method A → 유지 (LLM 호출 없음) | 단순할수록 좋음 |
| A4 | Design | Stop 버튼 → Send 버튼 교체 (추가 아님) | 레이아웃 시프트 방지 |
| A5 | Design | Copy 피드백 → 아이콘 교체 (Toast 아님) | Toast 시스템 미존재 |
| A6 | Eng | SseEmitter timeout → 600s로 연장 | 긴 스트리밍 중단 방지 |
| A7 | Eng | startNode/stopNode 동기 차단 → @Async 래퍼로 처리 | SSE 스레드 차단 방지 |
| A8 | Eng | Abort 시 부분 메시지 버블 정리 로직 추가 | 빈 버블 UI 잔류 방지 |

### TASTE 결정 (1개)

| 결정 | 선택 | 이유 |
|------|------|------|
| P2 클러스터 lifecycle → preview+confirm | **추가** (CEO 권고 채택) | enterprise ISMS-P 4-eyes 원칙 준수. apply_manifest 패턴과 일관성. |

### Design 보완 사항 (계획에 반영)

- Mobile Drawer: `fixed inset-0 z-50` + backdrop div + `transition-transform duration-200`
- Stop 버튼: Send 버튼 위치에 교체 표시 (streaming=true 시)
- AbortError: `onError` 호출 안 함 — 별도 `onAbort` 콜백 또는 상태 직접 정리
- Copy 버튼: 모바일에서 항상 표시 (hover-only 미사용)
- Auto-title 레이아웃 시프트: 사이드바 아이템 `min-h-[28px]`

### P2 수정 계획 (preview+confirm 추가)

```java
case "start_cluster" -> {
    // preview 이벤트로 클러스터명 + 액션 전송
    // PendingOperation에 저장 → confirm/cancel 대기
    // apply_manifest와 동일 패턴
}
```

프론트엔드: 기존 preview 카드 재사용 (`action: "start_cluster"` 등 신규 액션 타입 추가)
