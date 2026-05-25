# k3s-studio MCP Server

Claude Desktop에서 자연어로 k3s 클러스터를 제어합니다.

> "staging 클러스터 만들어줘" → Multipass VM 생성 + K3s 설치 자동화

## 설치

```bash
cd apps/k3s-studio-mcp
npm install
npm run build
```

## Claude Desktop 설정

`~/Library/Application Support/Claude/claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "k3s-studio": {
      "command": "node",
      "args": ["/Users/dino/Projects/k3s-studio/apps/k3s-studio-mcp/dist/index.js"],
      "env": {
        "K3S_STUDIO_API_URL": "http://localhost:8080"
      }
    }
  }
}
```

k3s-studio API가 실행 중이어야 합니다 (`http://localhost:8080`).

## 사용 가능한 Tools

### 서버 / Job
| Tool | 설명 |
|------|------|
| `list_servers` | 등록된 서버 목록 |
| `get_job_status` | 비동기 Job 진행 상태 확인 |

### 클러스터
| Tool | 설명 |
|------|------|
| `list_clusters` | 클러스터 목록 + 상태 |
| `get_cluster` | 클러스터 상세 정보 |
| `create_cluster` | 클러스터 생성 (비동기, 완료 대기) |
| `delete_cluster` | ⚠️ 클러스터 삭제 |
| `start_cluster` | 클러스터 시작 |
| `stop_cluster` | 클러스터 중지 |

### 노드
| Tool | 설명 |
|------|------|
| `get_cluster_nodes` | VM 노드 목록 + IP |
| `add_workers` | 워커 노드 추가 |
| `delete_worker` | ⚠️ 워커 삭제 |

### Kubernetes
| Tool | 설명 |
|------|------|
| `list_k8s_pods` | Pod 목록 |
| `list_k8s_deployments` | Deployment 목록 |
| `list_k8s_services` | Service 목록 |
| `get_pod_logs` | Pod 로그 조회 |
| `apply_manifest` | YAML manifest 적용 |
| `delete_manifest` | YAML manifest 삭제 |

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `K3S_STUDIO_API_URL` | `http://localhost:8080` | k3s-studio API 주소 |
| `K3S_STUDIO_API_KEY` | (없음) | API Key 헤더 (선택) |
