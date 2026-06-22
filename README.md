# K3s-Studio — Multipass K3s Cluster Manager

[![License](https://img.shields.io/github/license/cnbsoft-com/k3s-studio)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Language](https://img.shields.io/badge/language-Java%20%2F%20TypeScript-blue)

Multipass 기반 K3s 클러스터를 자연어와 Web UI로 통합 관리하는 플랫폼입니다.
명령어 기반을 선호하시는 분들은 [mpk3s-cli](README-CLI.MD) 문서를 참고하세요.
---

## Features

- **Web UI & Dashboard** — 클러스터/서버/노드 상태 실시간 모니터링 및 제어
- **멀티 호스트** — 로컬 Multipass 및 원격 SSH 서버의 Multipass 인스턴스 통합 관리
- **자동 프로비저닝** — Master + Worker 노드 사양 지정 후 원클릭 생성
- **K8s 리소스 관리** — Pod/Service/Deployment 등 Manifest 편집·Apply·Delete
- **AI 관리자** — OpenAI-compatible API(Ollama, OpenAI 등)로 자연어 클러스터 제어
- **MCP Server** — Claude Desktop에서 k3s-studio 전체 기능을 도구로 호출
- **SSE 실시간 스트리밍** — 클러스터 생성·AI 응답 모두 스트리밍으로 확인

---

## Project Structure

```
k3s-studio/
├── apps/
│   ├── k3s-studio-api/   # Spring Boot 3.4 REST API (포트 9090)
│   ├── k3s-studio-ui/    # Next.js 15 Web UI (포트 3000)
│   └── k3s-studio-mcp/   # MCP Server (Claude Desktop 연동)
├── containers/           # PostgreSQL 17 + Liquibase Docker Compose
│   └── liquibase-data/   # Liquibase DB 스키마 changelog (XML)
└── bin/                  # CLI 실행 스크립트
```

---

## Quick Start

### 전제 조건

- macOS (Multipass 실행 환경)
- [Multipass](https://multipass.run) 설치
- Docker (PostgreSQL 실행용)
- Java 21+, Node.js 20+

### 1. 데이터베이스

```bash
docker compose -f containers/docker-compose.yml up -d
```

PostgreSQL 17이 포트 5433에서 실행됩니다.

### 2. 백엔드 API

```bash
cd apps/k3s-studio-api
./gradlew bootRun
# http://localhost:9090
```

### 3. Web UI

```bash
cd apps/k3s-studio-ui
npm install
npm run dev
# http://localhost:3000
```

---

## AI 관리자

Web UI 사이드바의 **AI 관리** 메뉴에서 자연어로 k3s-studio를 제어합니다.

### 설정

`/settings/ai` 에서 모델 URL과 이름을 입력합니다.

| 제공자 | Model API URL | 모델 이름 예시 |
|--------|--------------|----------------|
| Ollama (로컬) | `http://localhost:11434` | `qwen2.5-coder:7b` |
| OpenAI | `https://api.openai.com` | `gpt-4o` |
| 기타 OpenAI 호환 | 해당 URL | 해당 모델명 |

### 내장 도구

| 도구 | 설명 |
|------|------|
| `list_servers` | 등록된 서버 목록 |
| `list_clusters` | k3s 클러스터 목록 |
| `list_namespaces` | 클러스터 네임스페이스 목록 |
| `list_pods` | 파드 목록 |
| `get_pod_logs` | 파드 로그 (최대 200줄) |
| `apply_manifest` | YAML 매니페스트 적용 |
| `delete_manifest` | YAML 매니페스트 삭제 |

---

## MCP Server (Claude Desktop)

Claude Desktop에서 k3s-studio API를 직접 도구로 호출합니다.

```bash
cd apps/k3s-studio-mcp
npm install && npm run build
```

`~/Library/Application Support/Claude/claude_desktop_config.json`:

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

---

## Roadmap

진행 중인 기능 제안은 [GitHub Issues](https://github.com/cnbsoft-com/k3s-studio/issues)에서 추적합니다.

- [ ] 마운트 기능 (호스트 ↔ VM 디렉토리 공유) — [#16](https://github.com/cnbsoft-com/k3s-studio/issues/16)
- [ ] kubeconfig 클립보드 복사 — [#17](https://github.com/cnbsoft-com/k3s-studio/issues/17)

---

## License

MIT License — [LICENSE](LICENSE)

---

*Developed by IK-YONG CHOI*
