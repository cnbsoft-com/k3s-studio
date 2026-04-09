# mpk3s 원격 서버 관리 기획서

## 개요

현재 PLAN.MD의 Web Application은 백엔드와 동일한 머신(localhost)의 Multipass만 제어한다.
이 문서는 **여러 원격 서버**의 Multipass + K3s 클러스터를 단일 Web UI에서 통합 관리하는 방안을 정의한다.

---

## 핵심 개념 변경

### 기존 구조
```
Web UI → Backend → [localhost Multipass]
```

### 변경 구조
```
Web UI → Backend (Orchestrator) ──SSH──▶ [Server A: Multipass]
                                 ──SSH──▶ [Server B: Multipass]
                                 ──SSH──▶ [Server C: Multipass]
                               (localhost)▶ [Local Multipass]
```

- **Server(서버)**: Multipass가 설치된 머신 한 대. localhost도 Server의 한 종류.
- **Cluster**: 특정 Server 위에서 동작하는 K3s 클러스터.
- 관계: `Server 1 : N Cluster`

---

## 연결 전략: SSH 방식

원격 서버에 별도 Agent를 배포하지 않고, **SSH로 원격 `multipass` 명령을 직접 실행**한다.

| 항목 | 내용 |
|------|------|
| 라이브러리 | Apache MINA SSHD (Java) |
| 인증 | SSH Private Key (DB에 암호화 저장) 또는 패스워드 |
| 명령 실행 | `ssh user@host multipass ls --format json` |
| 스트리밍 | SSH ChannelExec OutputStream → SseEmitter pipe |
| localhost | `ProcessBuilder`로 직접 실행 (SSH 불필요) |

### 장점
- 원격 서버에 추가 소프트웨어 설치 불필요 (Multipass만 있으면 됨)
- 기존 `MultipassService` 구조를 최소 변경으로 확장 가능

### 보안
- SSH Private Key: AES-256-GCM으로 암호화 후 DB 저장
- 암호화 키: 환경변수 `ENCRYPTION_KEY`로 주입 (`.env`)
- 대안: 서버 등록 시 key pair 신규 생성, public key를 원격 서버에 등록하도록 안내

---

## 데이터베이스 스키마 변경

### 신규: `servers`

```sql
CREATE TABLE servers (
    id           BIGSERIAL     PRIMARY KEY,
    name         VARCHAR(100)  NOT NULL UNIQUE,    -- 사용자 지정 레이블
    host         VARCHAR(255)  NOT NULL,           -- IP 또는 hostname
    port         INT           NOT NULL DEFAULT 22,
    username     VARCHAR(100)  NOT NULL,
    private_key  TEXT,                             -- AES-256 암호화된 PEM
    is_local     BOOLEAN       NOT NULL DEFAULT FALSE,  -- localhost 여부
    status       VARCHAR(50)   NOT NULL DEFAULT 'UNKNOWN',  -- CONNECTED | UNREACHABLE | UNKNOWN
    last_seen_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- localhost 기본 레코드 (애플리케이션 초기화 시 자동 삽입)
INSERT INTO servers (name, host, port, username, is_local, status)
VALUES ('local', 'localhost', 22, '', TRUE, 'CONNECTED');
```

### 변경: `clusters`

```sql
ALTER TABLE clusters
    ADD COLUMN server_id BIGINT NOT NULL REFERENCES servers(id),
    DROP CONSTRAINT clusters_name_key,
    ADD CONSTRAINT clusters_name_server_unique UNIQUE (server_id, name);
    -- 같은 이름의 클러스터가 다른 서버에는 존재 가능
```

### 변경: `jobs`

```sql
ALTER TABLE jobs
    ADD COLUMN server_id BIGINT REFERENCES servers(id);
```

---

## 백엔드 구조 변경

### MultipassExecutor 인터페이스 분리

```
multipass/
├── MultipassExecutor.java          # 인터페이스
├── LocalMultipassExecutor.java     # ProcessBuilder 기반
├── SshMultipassExecutor.java       # Apache MINA SSHD 기반
└── MultipassExecutorFactory.java   # serverId → executor 반환
```

```java
public interface MultipassExecutor {
    String execute(String... args) throws MultipassException;
    InputStream executeStream(String... args) throws MultipassException;
}

// Factory: serverId로 적절한 executor 선택
public class MultipassExecutorFactory {
    public MultipassExecutor get(Long serverId) {
        Server server = serverRepository.findById(serverId).orElseThrow();
        return server.isLocal()
            ? new LocalMultipassExecutor()
            : new SshMultipassExecutor(server, encryptionService);
    }
}
```

기존 `MultipassService`는 `MultipassExecutor`를 주입받아 동작 → **서버 종류에 무관하게 동일한 비즈니스 로직 재사용**.

### Multipass 설치 전략

서버 등록 후 연결 테스트 단계에서 `multipass version` 명령으로 설치 여부를 자동 감지한다.
미설치 시 UI에서 설치 버튼을 노출하고, 클릭 시 SSE 로그와 함께 설치를 진행한다.

#### OS 감지 및 설치 명령

```java
public class MultipassInstaller {

    // 1단계: OS 판별
    // ssh → "uname -s" + "cat /etc/os-release"
    public OsType detectOs(SshMultipassExecutor ssh) {
        String uname = ssh.executeRaw("uname -s");        // Linux / Darwin
        String osRelease = ssh.executeRaw("cat /etc/os-release 2>/dev/null || true");
        // ID=ubuntu / ID=debian / ID=fedora / ID=arch ...
    }

    // 2단계: OS별 설치 명령 선택
    public List<String> installCommands(OsType os) {
        return switch (os) {
            case UBUNTU, DEBIAN -> List.of(
                "sudo snap install multipass"
            );
            case FEDORA, RHEL, CENTOS -> List.of(
                "sudo snap install snapd",
                "sudo systemctl enable --now snapd",
                "sudo snap install multipass"
            );
            case ARCH -> List.of(
                "sudo pacman -Sy --noconfirm multipass"
            );
            case MACOS -> List.of(
                "brew install multipass"       // 원격 macOS 서버 대응
            );
            default -> throw new UnsupportedOsException(os);
        };
    }
}
```

#### 설치 흐름

```
POST /api/servers/{id}/multipass/install
  → Job 생성 (type: INSTALL_MULTIPASS)
  → @Async 실행:
      1. OS 감지 (uname, /etc/os-release)
      2. snap 설치 가능 여부 확인
      3. OS별 설치 명령 순차 실행 → 각 줄 로그 append
      4. 완료: multipass version 확인 → 성공/실패 판정
  → SSE /api/jobs/{jobId}/stream 로 실시간 출력
```

#### snap 없는 환경 처리

Ubuntu/Debian이지만 snap이 없는 경우(예: 일부 minimal 이미지):

```bash
sudo apt-get update -y
sudo apt-get install -y snapd
sudo systemctl enable --now snapd
sudo snap install multipass
```

로그 중 `snapd` 설치 단계가 자동으로 포함된다.

### 서버 연결 상태 관리

```java
@Scheduled(fixedDelay = 60_000)   // 60초마다
public void checkAllServers() {
    serverRepository.findAll().forEach(server -> {
        boolean ok = pingServer(server);
        server.setStatus(ok ? "CONNECTED" : "UNREACHABLE");
        server.setLastSeenAt(ok ? Instant.now() : server.getLastSeenAt());
        serverRepository.save(server);
    });
}
```

---

## API 설계 추가

### Servers

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/servers` | 서버 목록 (상태 포함) |
| POST | `/api/servers` | 서버 등록 |
| GET | `/api/servers/{id}` | 서버 상세 |
| PUT | `/api/servers/{id}` | 서버 수정 |
| DELETE | `/api/servers/{id}` | 서버 삭제 |
| POST | `/api/servers/{id}/test` | 연결 테스트 (즉시 응답) |
| GET | `/api/servers/{id}/multipass` | Multipass 설치 여부 + 버전 확인 |
| POST | `/api/servers/{id}/multipass/install` | Multipass 설치 (jobId 반환, SSE 스트리밍) |
| GET | `/api/servers/{id}/images` | 해당 서버의 Ubuntu 이미지 목록 |

### Clusters (변경)

기존 API는 유지하되 `serverId` 쿼리 파라미터 추가:

| Method | Path | 변경 내용 |
|--------|------|---------|
| GET | `/api/clusters?serverId={id}` | 특정 서버의 클러스터 목록 |
| POST | `/api/clusters` | 요청 바디에 `serverId` 추가 |
| 나머지 | 기존과 동일 | `{name}`은 server-scoped |

---

## 프론트엔드 구조 변경

### 라우팅

```
/                              # Dashboard: 전체 서버 + 클러스터 현황
/servers                       # 서버 관리 목록
/servers/new                   # 서버 등록
/servers/[id]                  # 서버 상세 (해당 서버의 클러스터 목록)
/servers/[id]/clusters/new     # 클러스터 생성 (서버 고정)
/servers/[id]/clusters/[name]  # 클러스터 상세
```

### Dashboard 변경

```
┌─────────────────────────────────────────────────┐
│  전체 요약: 서버 3대 / 클러스터 12개 / Running 10 │
├────────────────┬────────────────┬────────────────┤
│ Server A       │ Server B       │ Server C       │
│ ● CONNECTED    │ ● CONNECTED    │ ✕ UNREACHABLE  │
│ 192.168.1.10   │ 10.0.0.5       │ remote.host    │
│ 클러스터 4개   │ 클러스터 3개   │ 클러스터 5개   │
│ [바로가기]     │ [바로가기]     │ [바로가기]     │
└────────────────┴────────────────┴────────────────┘
```

### 서버 등록 폼 (`/servers/new`)

3단계 멀티스텝 폼:

```
1. 서버 정보
   - 레이블 이름 (예: production-01)
   - Host (IP 또는 도메인)
   - SSH Port (기본 22)
   - Username

2. 인증
   - SSH Private Key 업로드 (.pem / .key) 또는 텍스트 붙여넣기
   - [연결 테스트] → SSH 접속 성공 여부 즉시 표시

3. Multipass 확인
   ┌─────────────────────────────────────┐
   │ ✓ Multipass 2.5.1 감지됨           │  → [등록 완료]
   └─────────────────────────────────────┘
   또는
   ┌─────────────────────────────────────┐
   │ ✕ Multipass 미설치                  │
   │ OS: Ubuntu 22.04 (snap 지원)        │
   │ [설치하고 등록] [설치 없이 등록]     │
   └─────────────────────────────────────┘

   "설치하고 등록" 클릭 시:
   - 서버를 먼저 저장 (status: INSTALLING_MULTIPASS)
   - SSE 로그 뷰어로 전환 → 실시간 설치 진행 출력
   - 완료 시 status: CONNECTED → 서버 상세 페이지로 이동
```

### 신규 컴포넌트

| 컴포넌트 | 용도 |
|----------|------|
| `server-card.tsx` | 서버 상태 카드 |
| `server-form.tsx` | 서버 등록/수정 폼 |
| `server-status-badge.tsx` | CONNECTED / UNREACHABLE / UNKNOWN 배지 |
| `ssh-key-input.tsx` | SSH 키 업로드 + 텍스트 입력 혼합 컴포넌트 |

---

## 보안 고려사항

| 위협 | 대응 |
|------|------|
| SSH Key DB 노출 | AES-256-GCM 암호화, 키는 환경변수 |
| SSH Key API 노출 | GET /api/servers/{id} 응답에서 private_key 필드 제외 |
| 임의 호스트 접근 | 서버 등록 시 화이트리스트 IP 범위 설정 옵션 |
| SSH 브루트포스 | 연결 테스트 API rate limiting |

---

## 개발 단계 추가 (기존 Phase 에 편입)

### Phase 1-B: 서버 관리 백엔드 (Phase 1 직후)
1. `servers` 테이블 Liquibase changelog 작성
2. `clusters.server_id` FK 추가 changelog 작성
3. `MultipassExecutor` 인터페이스 + Local/SSH 구현체
4. `ServerService` (등록, 연결 테스트, 상태 체크 스케줄러)
5. `ServerController` REST API
6. `EncryptionService` (AES-256-GCM)
7. `MultipassInstaller` (OS 감지 + 설치 명령 실행 + 로그 스트리밍)

### Phase 2-B: 서버 관리 프론트엔드 (Phase 2 직후)
1. 서버 관련 API 클라이언트 함수 추가
2. `/servers` 목록 페이지
3. `/servers/new` 3단계 멀티스텝 폼 (SSH 연결 테스트 → Multipass 감지 → 설치 또는 완료)
4. Multipass 설치 로그 뷰어 (SSE 연동, 기존 `job-log-viewer` 재사용)
5. 서버 카드에 Multipass 버전 / 미설치 경고 표시
6. Dashboard 서버 그룹 뷰
7. 클러스터 생성 시 서버 선택 단계 추가 (멀티스텝 폼 1단계 앞에 삽입)

---

## 사전 요구사항 추가

- 원격 서버: SSH 접근 가능 (Multipass는 미설치여도 자동 설치 가능)
- SSH 사용자가 `sudo` 권한 보유 (Multipass 설치 및 실행에 필요)
  - 설치 후에는 `multipass` 명령 자체는 sudo 불필요 (multipassd daemon이 권한 처리)
- 백엔드 서버에서 원격 서버 SSH 포트 접근 가능 (방화벽)
- 지원 OS: Ubuntu 18.04+, Debian 10+, Fedora 36+, Arch Linux, macOS 12+
  - snap 미지원 환경(Alpine, 일부 minimal 이미지)은 설치 불가 → UI에서 명시적 오류 표시
