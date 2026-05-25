# k3s-studio MCP Server

Claude Desktop 등 MCP 호환 AI에서 자연어로 k3s 클러스터를 제어합니다.

## 설치 및 빌드

```bash
cd apps/k3s-studio-mcp
npm install
npm run build
```

## Claude Desktop 연결

`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "k3s-studio": {
      "command": "node",
      "args": ["/path/to/k3s-studio/apps/k3s-studio-mcp/dist/index.js"],
      "env": {
        "K3S_STUDIO_API_URL": "http://localhost:9090"
      }
    }
  }
}
```

설정 후 Claude Desktop 재시작.

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `K3S_STUDIO_API_URL` | `http://localhost:8080` | k3s-studio API 주소 |
| `K3S_STUDIO_API_KEY` | (없음) | API Key 헤더 (선택) |

## 사용 가능한 Tools

### 서버 관리

| Tool | 설명 | 파라미터 |
|------|------|----------|
| `list_servers` | 등록된 서버 목록 조회 | 없음 |
| `get_job_status` | 비동기 Job 진행 상태 조회 | `jobId` |

### 클러스터 관리

| Tool | 설명 | 파라미터 |
|------|------|----------|
| `list_clusters` | 클러스터 목록 + 상태 조회 | `serverId?` |
| `get_cluster` | 클러스터 상세 정보 | `name` |
| `create_cluster` | 클러스터 생성 (비동기, 완료 대기) | `name`, `masterSpec?`, `workerCount?`, `workerSpec?`, `ubuntuImage?`, `serverId?` |
| `delete_cluster` | ⚠️ 클러스터 영구 삭제 | `name` |
| `start_cluster` | 클러스터 시작 | `name` |
| `stop_cluster` | 클러스터 중지 | `name` |

### 노드 관리

| Tool | 설명 | 파라미터 |
|------|------|----------|
| `get_cluster_nodes` | VM 노드 목록 + IP/상태 | `name` |
| `add_workers` | 워커 노드 추가 (비동기) | `name`, `count`, `spec?` |
| `delete_worker` | ⚠️ 워커 노드 삭제 | `name`, `workerName` |

### Kubernetes 리소스

| Tool | 설명 | 파라미터 |
|------|------|----------|
| `list_k8s_pods` | Pod 목록 | `name`, `namespace?` |
| `list_k8s_deployments` | Deployment 목록 | `name`, `namespace?` |
| `list_k8s_services` | Service 목록 | `name`, `namespace?` |
| `get_pod_logs` | Pod 로그 조회 | `name`, `namespace`, `pod`, `lines?` |
| `apply_manifest` | YAML manifest 적용 (kubectl apply) | `name`, `yaml` |
| `delete_manifest` | YAML manifest 삭제 (kubectl delete) | `name`, `yaml` |

## 비동기 처리

`create_cluster`, `delete_cluster`, `add_workers`, `delete_worker`는 장시간 작업입니다.
MCP 서버가 Job 완료까지 자동으로 polling(3초 간격, 최대 10분)하므로
Claude는 작업 완료 후 결과를 받습니다.

## 사용 예시

```
"k3s 클러스터 목록 보여줘"
"staging 클러스터 small spec으로 만들어줘"
"demo-cluster worker 2개 추가해줘"
"demo-cluster의 kube-system pod 목록 보여줘"
"demo-cluster에 아래 manifest 적용해줘: [YAML]"
```
