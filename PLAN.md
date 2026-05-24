<!-- /autoplan restore point: /Users/dino/.gstack/projects/cnbsoft-com-mpk3s/feature-add-cluster-host-autoplan-restore-20260524-155050.md -->
<!-- /autoplan restore point: /Users/dino/.gstack/projects/cnbsoft-com-k3s-studio/feature-add-cluster-host-autoplan-restore-20260524-142809.md -->
# Plan: K3s-Studio k8s 리소스 관리

Branch: feature/add-cluster-host
Task: 클러스터별 k8s 기본 리소스 조회 + manifest 등록/유지보수

---

## 배경

K3s-Studio는 현재 Multipass VM 수준의 제어(start/stop/restart)와 클러스터 생성까지 지원한다.
다음 단계는 VM 안에서 실행 중인 k3s(Kubernetes)를 직접 다루는 것:
- namespace / service / pod / deployment / configmap 조회
- YAML manifest 입력 → `kubectl apply` → 상태 확인

---

## 현재 구조 요약

- `MultipassExecutor.execMultipass(String... args)` — `multipass {args}` 실행
- `multipass exec {nodeName} -- {cmd}` — VM 내부 명령 실행
- `SshMultipassExecutor` — SSH 원격 서버에서 위 두 패턴 동일하게 실행
- `MultipassService.saveKubeconfig(name, content)` — `~/.kube/config-{name}` 에 저장
- kubeconfig 서버 URL = VM 내부 IP (외부에서 직접 접근 불가)

---

## 안 A: kubectl exec via Multipass exec (Minimal)

### 아이디어

기존 `MultipassExecutor.execMultipass("exec", masterNode, "--", "kubectl", ...)` 패턴 그대로.
모든 k8s 조회/적용을 VM 내부 kubectl에 위임한다.

### 백엔드

```java
// K8sService
public JsonNode getResources(String clusterName, String resource, String namespace)
        throws IOException, InterruptedException {
    String[] cmd = namespace.equals("all")
        ? new String[]{"exec", clusterName+"-master", "--", "kubectl", "get", resource, "-A", "-o", "json"}
        : new String[]{"exec", clusterName+"-master", "--", "kubectl", "get", resource, "-n", namespace, "-o", "json"};
    String json = serviceFor(cluster).executor.execMultipass(cmd);
    return objectMapper.readTree(json);
}

public void applyManifest(String clusterName, String yaml) throws IOException, InterruptedException {
    // base64 인코딩으로 따옴표/개행 문제 회피
    String encoded = Base64.getEncoder().encodeToString(yaml.getBytes(StandardCharsets.UTF_8));
    serviceFor(cluster).executor.execMultipass(
        "exec", clusterName+"-master", "--",
        "bash", "-c", "echo " + encoded + " | base64 -d | kubectl apply -f -"
    );
}
```

API 엔드포인트:
```
GET  /api/clusters/{name}/k8s/namespaces
GET  /api/clusters/{name}/k8s/pods?namespace={ns}
GET  /api/clusters/{name}/k8s/services?namespace={ns}
GET  /api/clusters/{name}/k8s/deployments?namespace={ns}
POST /api/clusters/{name}/k8s/apply        (body: { yaml: string })
POST /api/clusters/{name}/k8s/delete       (body: { yaml: string })
```

### 평가

| 항목 | 내용 |
|---|---|
| 신규 의존성 | 없음 |
| 로컬 + 원격 지원 | 완전 (SSH executor 동일 패턴) |
| 속도 | 느림 (요청당 SSH 세션 + 프로세스 생성) |
| 기능 풍부도 | kubectl CLI 수준 |
| 구현 복잡도 | 낮음 |
| 코드 추가량 | ~200줄 |

---

## 안 B: Kubernetes Java Client (fabric8)

### 아이디어

`io.fabric8:kubernetes-client` 라이브러리로 k8s API 서버에 직접 연결.
저장된 kubeconfig (`~/.kube/config-{name}`) 파일로 클라이언트 생성.
로컬 클러스터는 바로 연결. SSH 원격 클러스터는 SSH 포트 포워딩 터널을 자동 생성.

### 백엔드

```java
// KubernetesClientFactory
public KubernetesClient clientFor(Cluster cluster) {
    Path kubeconfigPath = Path.of(kubeconfigDir, "config-" + cluster.getName());
    Config config = Config.fromKubeconfig(Files.readString(kubeconfigPath));
    if (!cluster.getServerLocal()) {
        int localPort = tunnelManager.openTunnel(cluster.getId(), serverHost, 6443);
        config = new ConfigBuilder(config)
            .withMasterUrl("https://localhost:" + localPort)
            .withTrustCerts(true)
            .build();
    }
    return new KubernetesClientBuilder().withConfig(config).build();
}
```

```java
// K8sService
public List<PodResponse> getPods(String clusterName, String namespace) {
    KubernetesClient client = clientFactory.clientFor(cluster);
    PodList list = "all".equals(namespace)
        ? client.pods().inAnyNamespace().list()
        : client.pods().inNamespace(namespace).list();
    return list.getItems().stream().map(PodResponse::from).toList();
}

public void applyManifest(String clusterName, String yaml) {
    KubernetesClient client = clientFactory.clientFor(cluster);
    client.load(new ByteArrayInputStream(yaml.getBytes())).serverSideApply();
}
```

### 평가

| 항목 | 내용 |
|---|---|
| 신규 의존성 | io.fabric8:kubernetes-client (~25MB) |
| 로컬 지원 | 즉시 (kubeconfig 이미 저장됨) |
| 원격 지원 | SSH 터널 구현 필요 (중간 복잡도) |
| 속도 | 빠름 (HTTP/2 연결 풀링) |
| 기능 풍부도 | WATCH/실시간 상태, 타입 안전 POJO |
| 구현 복잡도 | 중간 |
| 코드 추가량 | ~500줄 + 터널 관리 |

---

## 안 C: kubectl 바이너리 on Spring Boot Host

### 아이디어

Spring Boot 실행 머신에 `kubectl` 설치.
저장된 kubeconfig + `KUBECONFIG` 환경변수로 직접 ProcessBuilder 실행.
로컬 클러스터는 kubeconfig의 서버 URL이 VM 내부 IP → Spring Boot 머신에서 Multipass 네트워크 경유로 직접 접근 가능.
원격 클러스터는 kubeconfig 서버 URL을 SSH 포트 포워딩 주소로 패치.

### 백엔드

```java
// K8sService
public JsonNode getResources(Cluster cluster, String resource, String namespace) throws Exception {
    String kubeconfigPath = resolveKubeconfig(cluster); // 원격이면 포트포워딩 패치
    List<String> cmd = new ArrayList<>(Arrays.asList("kubectl", "get", resource, "-o", "json"));
    if ("all".equals(namespace)) cmd.add("-A");
    else { cmd.add("-n"); cmd.add(namespace); }
    ProcessBuilder pb = new ProcessBuilder(cmd);
    pb.environment().put("KUBECONFIG", kubeconfigPath);
    Process proc = pb.start();
    return objectMapper.readTree(proc.getInputStream());
}

public void applyManifest(Cluster cluster, String yaml) throws Exception {
    String kubeconfigPath = resolveKubeconfig(cluster);
    ProcessBuilder pb = new ProcessBuilder("kubectl", "apply", "-f", "-");
    pb.environment().put("KUBECONFIG", kubeconfigPath);
    Process proc = pb.start();
    proc.getOutputStream().write(yaml.getBytes(StandardCharsets.UTF_8));
    proc.getOutputStream().close();
    proc.waitFor();
}
```

### 평가

| 항목 | 내용 |
|---|---|
| 신규 의존성 | kubectl 바이너리 (OS 패키지, 런타임 전제) |
| 로컬 지원 | 즉시 (Multipass 브릿지 네트워크 경유) |
| 원격 지원 | kubeconfig URL 패치 + SSH 포트 포워딩 |
| 속도 | 중간 (로컬 프로세스, SSH 없음) |
| 기능 풍부도 | kubectl CLI 수준 (dry-run, diff 등 무료) |
| 구현 복잡도 | 중간 (kubeconfig 패치 로직) |
| 코드 추가량 | ~300줄 |

---

## 공통 프론트엔드 (안 무관)

### 클러스터 상세 → K8s 탭

```
[클러스터 정보] [노드] [K8s ← 신규]
```

```
Namespace: [all ▼]     리소스: [Pods] [Services] [Deployments] [ConfigMaps]

┌─────────────────────────────────────────────────────────┐
│ NAME              NAMESPACE    STATUS   READY   AGE      │
│ coredns-xxx       kube-system  Running  1/1     2d       │
│ ...                                                      │
└─────────────────────────────────────────────────────────┘

▶ Manifest 편집기
┌──────────────────────────────────────────────────────────┐
│ apiVersion: apps/v1                                      │
│ kind: Deployment                                         │
│ metadata:                                                │
│   name: my-app                                           │
└──────────────────────────────────────────────────────────┘
[Apply]  [Delete]
```

### 신규 컴포넌트

- `K8sResourceTable` — 리소스 종류별 테이블
- `ManifestEditor` — textarea (추후 CodeMirror 업그레이드 가능)
- `NamespaceSelector` — GET /k8s/namespaces 결과로 채움

### api.ts 신규 함수

```typescript
export const getK8sNamespaces = (name: string) =>
  api.get<string[]>(`/clusters/${name}/k8s/namespaces`).then(r => r.data);
export const getK8sPods = (name: string, namespace: string) =>
  api.get(`/clusters/${name}/k8s/pods`, { params: { namespace } }).then(r => r.data);
export const getK8sServices = (name: string, namespace: string) =>
  api.get(`/clusters/${name}/k8s/services`, { params: { namespace } }).then(r => r.data);
export const getK8sDeployments = (name: string, namespace: string) =>
  api.get(`/clusters/${name}/k8s/deployments`, { params: { namespace } }).then(r => r.data);
export const applyManifest = (name: string, yaml: string) =>
  api.post(`/clusters/${name}/k8s/apply`, { yaml });
export const deleteManifest = (name: string, yaml: string) =>
  api.post(`/clusters/${name}/k8s/delete`, { yaml });
```

---

## 열린 질문

1. **원격 서버 접근**: 안 B/C 모두 SSH 포트 포워딩 필요. 안 A는 불필요. 원격 서버 클러스터를 v1에서 지원해야 하는가?
2. **manifest 저장**: apply한 manifest를 DB에 저장해 목록/버전 관리를 해야 하는가? 아니면 stateless apply-only로?
3. **리소스 범위**: namespace/pod/service/deployment/configmap 5종이면 충분한가?
4. **실시간 상태**: Pod Running/Pending/Failed 상태 변화를 실시간으로 보여야 하는가? (안 A는 폴링만 가능)

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | 안 A 선택 (kubectl exec via multipass exec) | Mechanical | P3+P5 | 신규 의존성 없음, 원격 서버 SSH executor로 자동 지원, v1 요구사항 완전 충족 | 안 B(fabric8 over-engineering), 안 C(배포 의존성) |
| 2 | CEO | manifest DB 저장 v1 제외 | Mechanical | P3 | stateless apply-only로 시작, 버전관리 필요성 검증 후 추가 | manifest 히스토리 테이블 |
| 3 | CEO | 실시간 Watch v1 제외 | Mechanical | P3 | 30초 폴링으로 충분, 요구사항에 없음. 필요 시 K8sService 인터페이스 유지하며 fabric8 교체 가능 | SSE/WebSocket |
| 4 | Eng | manifest 전달: base64 echo 파이프 | Mechanical | P5 | SshMultipassExecutor stdin 미지원, base64는 안전 문자 집합(주입 불가) | heredoc(구분자 충돌 위험) |
| 5 | Eng | kubectl 에러 → HTTP 400 반환 | Mechanical | P1 | 사용자가 YAML 오류 내용 알아야 함. stderr 메시지 response body에 포함 | 500 일괄처리 |
| 6 | Gate | **안 B 최종 선택** (user) | User Decision | — | 실시간 Watch, 타입 안전 POJO, 향후 로그 스트리밍/port-forward 확장 고려 | 안 A, 안 C |

---

## 확정 구현 계획: 안 B (Kubernetes Java Client — fabric8)

### Status: APPROVED

### 핵심 설계 결정

1. **로컬 클러스터**: kubeconfig(`~/.kube/config-{name}`) 직접 사용. Multipass 브릿지 네트워크(192.168.64.x)는 macOS 호스트에서 직접 라우팅됨.
2. **원격 클러스터**: SSH 포트 포워딩 터널 자동 생성. k8s API 서버(6443) → localhost:{localPort}로 포워딩. kubeconfig masterUrl을 localhost:{localPort}로 교체.
3. **manifest apply**: `client.load(yamlInputStream).serverSideApply()`
4. **리소스 범위 v1**: namespace, pod, service, deployment, configmap (5종)
5. **manifest 저장**: stateless (v1 미저장)

### 백엔드 구현 태스크

- [ ] **T1** `build.gradle.kts`에 `io.fabric8:kubernetes-client:7.x` 추가
- [ ] **T2** `SshTunnelManager` 신규 클래스 — SSH 포트 포워딩 터널 생성/재사용/해제
- [ ] **T3** `KubernetesClientFactory` 신규 클래스 — cluster별 KubernetesClient 생성 + 캐싱
- [ ] **T4** `K8sService` 신규 클래스 — namespace/pod/service/deployment/configmap 조회, manifest apply/delete
- [ ] **T5** `K8sController` 신규 클래스 — 6개 엔드포인트
- [ ] **T6** `GlobalExceptionHandler`에 k8s 관련 예외 처리 추가

### 프론트엔드 구현 태스크

- [ ] **T7** `api.ts` — k8s 관련 타입 + 6개 API 함수
- [ ] **T8** `K8sResourceTable` 컴포넌트 — 리소스별 테이블
- [ ] **T9** `ManifestEditor` 컴포넌트 — textarea + Apply/Delete 버튼
- [ ] **T10** `NamespaceSelector` 컴포넌트 — namespace 드롭다운
- [ ] **T11** `clusters/[name]/page.tsx` — K8s 탭 추가

### API 엔드포인트 (확정)

```
GET  /api/clusters/{name}/k8s/namespaces
GET  /api/clusters/{name}/k8s/pods?namespace={ns}
GET  /api/clusters/{name}/k8s/services?namespace={ns}
GET  /api/clusters/{name}/k8s/deployments?namespace={ns}
GET  /api/clusters/{name}/k8s/configmaps?namespace={ns}
POST /api/clusters/{name}/k8s/apply   { yaml: string } → 204
POST /api/clusters/{name}/k8s/delete  { yaml: string } → 204
```

### 열린 질문 (v1 기본값)

- 원격 서버 SSH 터널 라이프사이클: 요청당 생성 vs 클러스터당 persistent → **persistent (클러스터당 1개, 클러스터 삭제 시 해제)**
- kubeconfig 없는 클러스터 → 조회 시 `503 kubeconfig not available` 반환
- 실시간 Watch: v2에서 SSE endpoint로 추가
