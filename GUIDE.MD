# k3s-studio AI 제어 테스트 가이드

브랜치: `feat/with-ai`

AI(Claude Code 또는 Open WebUI + Ollama)를 통해 k3s-studio의 모든 기능을 자연어로 제어할 수 있습니다.

---

## 실행 중인 서버

| 서비스 | 포트 | 설명 |
|--------|------|------|
| k3s-studio-api | :9090 | Spring Boot REST API |
| k3s-studio-ui | :3000 | Next.js 웹 UI |
| MCP HTTP Bridge | :3001 | AI tool 호출 진입점 |

---

## 테스트 방법 A — curl로 직접 호출

MCP HTTP Bridge에 직접 curl로 도구를 호출합니다.

### 도구 목록 조회
```bash
curl -s http://localhost:3001/tools | python3 -m json.tool | grep '"name"'
```
44개 도구가 나오면 정상입니다.

### 클러스터 목록
```bash
curl -s -X POST http://localhost:3001/tools/list_clusters \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 특정 클러스터 상세 조회
```bash
curl -s -X POST http://localhost:3001/tools/get_cluster \
  -H "Content-Type: application/json" \
  -d '{"name": "YOUR_CLUSTER_NAME"}'
```

### 클러스터 노드 목록
```bash
curl -s -X POST http://localhost:3001/tools/get_cluster_nodes \
  -H "Content-Type: application/json" \
  -d '{"name": "YOUR_CLUSTER_NAME"}'
```

### 클러스터 정지
```bash
curl -s -X POST http://localhost:3001/tools/stop_cluster \
  -H "Content-Type: application/json" \
  -d '{"name": "YOUR_CLUSTER_NAME"}'
```

### 클러스터 재시작
```bash
curl -s -X POST http://localhost:3001/tools/restart_cluster \
  -H "Content-Type: application/json" \
  -d '{"name": "YOUR_CLUSTER_NAME"}'
```

### 클러스터 일시정지 (suspend)
```bash
curl -s -X POST http://localhost:3001/tools/suspend_cluster \
  -H "Content-Type: application/json" \
  -d '{"name": "YOUR_CLUSTER_NAME"}'
```

### kubeconfig 다운로드
```bash
curl -s -X POST http://localhost:3001/tools/get_kubeconfig \
  -H "Content-Type: application/json" \
  -d '{"name": "YOUR_CLUSTER_NAME"}'
```

---

## 테스트 방법 B — Claude Code에서 자연어로

Claude Code의 MCP 설정에 k3s-studio가 등록되어 있으면 바로 사용 가능합니다.

예시 프롬프트:
- "k3s 클러스터 목록 보여줘"
- "dev-cluster의 pod 목록 보여줘"
- "dev-cluster를 정지해줘"
- "dev-cluster에 worker 2개 추가해줘"
- "dev-cluster의 default 네임스페이스 deployment 목록 보여줘"
- "dev-cluster kubeconfig 줘"

---

## 테스트 방법 C — Open WebUI (Private AI)

k3s 클러스터에 AI 스택이 배포된 경우 사용합니다.

### 1. AI 스택 배포 (최초 1회)
```bash
curl -s -X POST http://localhost:3001/tools/deploy_ai_stack \
  -H "Content-Type: application/json" \
  -d '{"clusterName": "YOUR_CLUSTER_NAME", "ollamaMemoryLimit": "4Gi"}'
```

### 2. Open WebUI 접속 URL 확인
```bash
curl -s -X POST http://localhost:3001/tools/get_ai_assistant_url \
  -H "Content-Type: application/json" \
  -d '{"clusterName": "YOUR_CLUSTER_NAME"}'
```

### 3. Open WebUI Tool 등록
브라우저에서 Open WebUI 접속 후:
1. 우상단 프로필 → **Settings** → **Tools**
2. **+** 버튼 클릭
3. URL 입력: `http://k3s-studio-mcp-bridge:3001`
4. 저장

### 4. 모델 pull
```bash
curl -s -X POST http://localhost:3001/tools/pull_ollama_model \
  -H "Content-Type: application/json" \
  -d '{"clusterName": "YOUR_CLUSTER_NAME", "model": "qwen2.5-coder:3b"}'
```
pull은 백그라운드로 실행됩니다. 완료 여부는 `list_ollama_models`로 확인:
```bash
curl -s -X POST http://localhost:3001/tools/list_ollama_models \
  -H "Content-Type: application/json" \
  -d '{"clusterName": "YOUR_CLUSTER_NAME"}'
```

---

## 전체 도구 목록 (44개)

### 서버 관리 (10개)
| 도구 | 설명 |
|------|------|
| `list_servers` | 등록된 원격 서버 목록 |
| `get_server` | 서버 상세 정보 |
| `register_server` | 새 원격 서버 등록 |
| `update_server` | 서버 연결 설정 수정 |
| `delete_server` | 서버 등록 삭제 |
| `test_server_connection` | SSH 연결 테스트 |
| `check_server_multipass` | Multipass 설치 여부 확인 |
| `install_multipass_on_server` | 원격 서버에 Multipass 설치 |
| `discover_server_clusters` | 서버의 미등록 클러스터 탐색 |
| `get_job_status` | 백그라운드 작업 상태 조회 |

### 클러스터 관리 (9개)
| 도구 | 설명 |
|------|------|
| `list_clusters` | 클러스터 목록 |
| `get_cluster` | 클러스터 상세 |
| `create_cluster` | 클러스터 생성 (5-15분) |
| `delete_cluster` | ⚠️ 클러스터 삭제 |
| `start_cluster` | 클러스터 시작 |
| `stop_cluster` | 클러스터 정지 |
| `restart_cluster` | 클러스터 재시작 |
| `suspend_cluster` | 클러스터 일시정지 |
| `get_kubeconfig` | kubeconfig 파일 조회 |

### 노드 관리 (8개)
| 도구 | 설명 |
|------|------|
| `get_cluster_nodes` | 노드 목록 (IP, 상태) |
| `add_workers` | worker 노드 추가 |
| `delete_worker` | ⚠️ worker 노드 삭제 |
| `start_node` | 특정 노드 시작 |
| `stop_node` | 특정 노드 정지 |
| `restart_node` | 특정 노드 재시작 |
| `suspend_node` | 특정 노드 일시정지 |
| `update_node_hardware` | 노드 CPU/메모리 변경 (정지 후 사용) |

### Kubernetes 리소스 (13개)
| 도구 | 설명 |
|------|------|
| `list_k8s_namespaces` | 네임스페이스 목록 |
| `list_k8s_pods` | Pod 목록 |
| `list_k8s_deployments` | Deployment 목록 |
| `list_k8s_services` | Service 목록 |
| `list_k8s_statefulsets` | StatefulSet 목록 |
| `list_k8s_ingresses` | Ingress 목록 |
| `list_k8s_secrets` | Secret 목록 (이름/타입만) |
| `list_k8s_configmaps` | ConfigMap 목록 |
| `get_pod_logs` | Pod 로그 조회 |
| `get_resource_manifest` | 리소스 YAML 조회 |
| `list_apply_history` | manifest 적용 이력 |
| `apply_manifest` | YAML manifest 적용 |
| `delete_manifest` | YAML manifest 삭제 |

### AI 스택 (4개)
| 도구 | 설명 |
|------|------|
| `deploy_ai_stack` | Ollama + Open WebUI 배포 |
| `get_ai_assistant_url` | Open WebUI 접속 URL |
| `list_ollama_models` | pull된 모델 목록 |
| `pull_ollama_model` | 모델 pull (백그라운드) |

---

## 신규 추가된 도구 빠른 검증 (curl)

```bash
BASE="http://localhost:3001/tools"
CLUSTER="YOUR_CLUSTER_NAME"

# 클러스터 제어
curl -s -X POST $BASE/restart_cluster  -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\"}"
curl -s -X POST $BASE/suspend_cluster  -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\"}"
curl -s -X POST $BASE/get_kubeconfig   -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\"}"

# 노드 제어
curl -s -X POST $BASE/stop_node        -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\",\"nodeName\":\"$CLUSTER-master\"}"
curl -s -X POST $BASE/start_node       -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\",\"nodeName\":\"$CLUSTER-master\"}"

# K8s 리소스
curl -s -X POST $BASE/list_k8s_namespaces  -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\"}"
curl -s -X POST $BASE/list_k8s_statefulsets -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\"}"
curl -s -X POST $BASE/list_k8s_ingresses   -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\"}"
curl -s -X POST $BASE/list_k8s_configmaps  -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\"}"
curl -s -X POST $BASE/list_apply_history   -H "Content-Type: application/json" -d "{\"name\":\"$CLUSTER\"}"

# 서버 관리
curl -s -X POST $BASE/list_servers -H "Content-Type: application/json" -d '{}'
```

`CLUSTER` 변수를 실제 클러스터 이름으로 교체하세요.

---

## 권장 테스트 모델 (Ollama)

| 모델 | RAM | Function Calling | 추천 |
|------|-----|-----------------|------|
| `qwen2.5-coder:3b` | 2GB | ✅ | ⭐ 기본값 |
| `qwen2.5-coder:7b` | 4GB | ✅ | 정확도 높음 |
| `llama3.2:3b` | 2GB | ✅ | 범용 경량 |

> Function calling 미지원 모델(llama2, gemma2 등)은 k3s-studio 제어 불가.
