# k3s-studio AI 관리 테스트 가이드

## 실행 중인 서버

| 서비스 | 주소 | 설명 |
|--------|------|------|
| k3s-studio-ui | http://192.168.0.209:3000 | Next.js 웹 UI |
| k3s-studio-api | http://192.168.0.209:9090 | Spring Boot REST API |

---

## 1단계 — AI 모델 설정

브라우저에서 **http://192.168.0.209:3000/settings/ai** 접속

| 항목 | Ollama (로컬) | OpenAI |
|------|--------------|--------|
| Model API URL | `http://localhost:11434` | `https://api.openai.com` |
| Model Name | `qwen2.5-coder:7b` (또는 설치된 모델) | `gpt-4o` |
| API Key | 비워두기 | sk-... |

저장 후 **연결 테스트** 버튼으로 확인.

> API Key는 sessionStorage에만 저장됩니다. 브라우저 탭을 닫으면 사라집니다.

---

## 2단계 — AI 관리 채팅

**http://192.168.0.209:3000/ai** 접속

### 사용 가능한 명령 예시

```
서버 목록 보여줘
클러스터 목록 보여줘
default 네임스페이스 파드 목록
my-cluster 클러스터의 kube-system 네임스페이스 파드 보여줘
my-cluster 클러스터에서 nginx 파드 로그 50줄 보여줘
my-cluster 클러스터에 다음 YAML 적용해줘: [YAML 내용]
```

### 내장 도구 (자동 선택됨)

| 도구 | 설명 |
|------|------|
| `list_servers` | 등록된 서버 목록 |
| `list_clusters` | k3s 클러스터 목록 |
| `list_namespaces` | 클러스터 네임스페이스 목록 |
| `list_pods` | 파드 목록 (네임스페이스 지정) |
| `get_pod_logs` | 파드 로그 (최대 200줄) |
| `apply_manifest` | YAML 매니페스트 적용 |
| `delete_manifest` | YAML 매니페스트 삭제 |

---

## 3단계 — API 직접 테스트 (curl)

### AI 설정 조회
```bash
curl -s http://localhost:9090/api/ai/config
```

### AI 설정 저장
```bash
curl -s -X PUT http://localhost:9090/api/ai/config \
  -H "Content-Type: application/json" \
  -d '{"modelUrl":"http://localhost:11434","modelName":"qwen2.5-coder:7b"}'
```

### 채팅 스트리밍 (SSE)
```bash
curl -s -N -X POST "http://localhost:9090/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"서버 목록 보여줘"}'
```

### 대화 목록 조회
```bash
curl -s http://localhost:9090/api/ai/conversations
```

---

## 로그 확인

```bash
# API 서버 로그
tail -f /tmp/k3s-api.log

# UI 서버 로그
tail -f /tmp/k3s-ui.log
```

## 서버 종료

```bash
kill $(lsof -ti:9090)   # API
kill $(lsof -ti:3000)   # UI
```
