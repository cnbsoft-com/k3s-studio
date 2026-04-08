# mpk3s Web Application 기획서

## 개요

mpk3s CLI를 통해 Multipass + K3s 기반 Kubernetes 클러스터를 관리하는 Web Application.
클러스터 CRUD 기능과 실시간 대시보드를 제공한다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 15 (App Router), pnpm, shadcn/ui, TailwindCSS, TypeScript |
| Backend | Spring Boot 3.4.x, Gradle 8.x, Java 21 |
| Database | PostgreSQL 17 |
| API 통신 | REST API + Server-Sent Events (SSE, 장시간 작업) |

---

## 프로젝트 구조

```
k3s-helper/
├── bin/
│   └── mpk3s                  # 기존 CLI
├── web/
│   ├── frontend/              # Next.js 앱
│   │   ├── app/
│   │   │   ├── page.tsx               # Dashboard
│   │   │   ├── clusters/
│   │   │   │   ├── new/page.tsx       # 클러스터 생성
│   │   │   │   └── [name]/page.tsx    # 클러스터 상세
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn 컴포넌트
│   │   │   ├── cluster-card.tsx
│   │   │   ├── cluster-form.tsx
│   │   │   ├── node-table.tsx
│   │   │   └── job-log-viewer.tsx
│   │   ├── lib/
│   │   │   └── api.ts                 # API 클라이언트
│   │   └── package.json
│   └── backend/
│       ├── containers/                # PostgreSQL Docker Compose
│       │   └── docker-compose.yml
│       ├── liquibase/                 # Liquibase Gradle 프로젝트
│       │   ├── src/main/resources/
│       │   │   └── db/changelog/      # 마이그레이션 changelogs
│       │   └── build.gradle
│       └── app/                       # Spring Boot 앱
│           ├── src/main/java/io/mpk3s/
│           │   ├── cluster/               # 클러스터 도메인
│           │   │   ├── ClusterController.java
│           │   │   ├── ClusterService.java
│           │   │   └── ClusterRepository.java
│           │   ├── job/                   # 비동기 작업 관리
│           │   │   ├── JobController.java
│           │   │   ├── JobService.java
│           │   │   └── JobRepository.java
│           │   ├── multipass/             # Multipass CLI 래퍼
│           │   │   └── MultipassService.java
│           │   └── Mpk3sApplication.java
│           ├── src/main/resources/
│           │   └── application.yml
│           └── build.gradle
└── PLAN.MD
```

---

## 기능 정의

### 1. Dashboard (`/`)
- 전체 클러스터 현황 요약 카드 (총 클러스터 수 / Running / Error)
- 클러스터 카드 목록: 이름, 상태 Badge, 마스터 스펙, 워커 수, 생성일
- 새 클러스터 생성 버튼
- 주기적 자동 갱신 (30초 polling)

### 2. 클러스터 생성 (`/clusters/new`)
5단계 멀티스텝 폼:
1. **기본 정보**: 클러스터 이름 (영문, 숫자, 하이픈)
2. **마스터 스펙**: Small(2c/2G/10G) / Medium(4c/4G/20G) / Large(8c/8G/40G) / Custom
3. **워커 노드**: 워커 수, 워커 스펙 선택
4. **이미지 & 컴포넌트**: Ubuntu 이미지 선택 + K3s 컴포넌트 토글 (traefik, flannel, servicelb, local-storage, metrics-server)
5. **확인**: 설정 요약 + 생성 버튼

생성 시작 후:
- SSE로 실시간 로그 출력
- 완료 시 상세 페이지로 이동

### 3. 클러스터 상세 (`/clusters/{name}`)
- 클러스터 정보 카드 (상태, 스펙, IP, 생성일)
- 노드 목록 테이블 (이름, 종류, 상태, CPU, 메모리, 디스크, 이미지)
- Actions:
  - 워커 노드 추가 (스펙 선택 → 비동기 생성)
  - 워커 노드 삭제 (다중 선택 → 확인 다이얼로그)
  - TLS SAN 설정 (도메인 입력)
  - kubeconfig 다운로드
  - 클러스터 삭제 (이름 재입력 확인)

### 4. 클러스터 삭제
- 삭제 전 클러스터 이름 재입력 확인 (실수 방지)
- 비동기 처리 + SSE 로그

---

## API 설계

### Clusters

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/clusters` | 클러스터 목록 |
| POST | `/api/clusters` | 클러스터 생성 (jobId 반환) |
| GET | `/api/clusters/{name}` | 클러스터 상세 |
| DELETE | `/api/clusters/{name}` | 클러스터 삭제 (jobId 반환) |
| GET | `/api/clusters/{name}/nodes` | 노드 목록 |
| POST | `/api/clusters/{name}/workers` | 워커 추가 (jobId 반환) |
| DELETE | `/api/clusters/{name}/workers/{worker}` | 워커 삭제 |
| POST | `/api/clusters/{name}/tls` | TLS SAN 설정 |
| GET | `/api/clusters/{name}/kubeconfig` | kubeconfig 파일 다운로드 |

### Jobs

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/jobs/{jobId}` | 작업 상태 조회 |
| GET | `/api/jobs/{jobId}/stream` | SSE - 실시간 로그 스트리밍 |

### Images

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/images` | 사용 가능한 Ubuntu 이미지 목록 |

---

## 데이터베이스 스키마

### clusters
```sql
CREATE TABLE clusters (
    id            BIGSERIAL     PRIMARY KEY,
    name          VARCHAR(100)  NOT NULL UNIQUE,
    status        VARCHAR(50)   NOT NULL,   -- CREATING | RUNNING | ERROR | DELETING
    master_spec   VARCHAR(50),              -- small | medium | large | custom
    master_cpus   INT,
    master_memory VARCHAR(10),
    master_disk   VARCHAR(10),
    worker_count  INT           DEFAULT 0,
    ubuntu_image  VARCHAR(100),
    options       JSONB,                    -- K3s 컴포넌트 옵션
    created_at    TIMESTAMPTZ   DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   DEFAULT NOW()
);
```

### jobs
```sql
CREATE TABLE jobs (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_name VARCHAR(100),
    type         VARCHAR(50)  NOT NULL,   -- CREATE_CLUSTER | ADD_WORKER | DELETE_WORKER | DELETE_CLUSTER | ADD_TLS
    status       VARCHAR(50)  NOT NULL,   -- PENDING | RUNNING | SUCCESS | FAILED
    log          TEXT,
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    finished_at  TIMESTAMPTZ
);
```

---

## 백엔드 핵심 구현

### Multipass CLI 통합 전략

mpk3s CLI는 완전 인터랙티브 방식이므로, 백엔드는 **Multipass CLI를 직접 호출**한다.
(bin/mpk3s 소스코드를 참조해 동일 로직을 Java로 재구현)

| 기능 | Multipass 명령 |
|------|---------------|
| 클러스터 목록 | `multipass ls --format json` |
| 클러스터 상세 | `multipass info {name} --format json` |
| VM 생성 | `multipass launch --name ... --cpus ... --memory ... --disk ... --cloud-init ...` |
| VM 삭제 | `multipass delete --purge {name}` |
| 이미지 목록 | `multipass find --format json` |

K3s 설치는 cloud-init YAML을 통해 Multipass launch 시 자동 실행.

### 비동기 작업 처리
- Spring `@Async` + `ThreadPoolTaskExecutor`로 장시간 작업 비동기 처리
- 작업 로그는 DB `jobs.log` 컬럼에 실시간 append
- `SseEmitter`로 클라이언트에 로그 스트리밍

### DB 마이그레이션
- Liquibase 사용, `src/main/resources/db/changelog/`

---

## 프론트엔드 핵심 구현

### shadcn/ui 활용 컴포넌트

| 컴포넌트 | 용도 |
|----------|------|
| `Card` | 클러스터 카드, 요약 통계 |
| `Table` | 노드 목록, 클러스터 목록 |
| `Badge` | 상태 표시 (Running / Creating / Error) |
| `Dialog` | 삭제 확인 모달 |
| `Form` + `Input` | 클러스터 생성 폼 |
| `Select` | 스펙, 이미지 선택 |
| `Switch` | K3s 컴포넌트 토글 |
| `ScrollArea` | 실시간 로그 뷰어 |
| `Skeleton` | 로딩 상태 |
| `Sonner` (Toast) | 작업 완료/실패 알림 |

### 상태 관리
- **Server State**: TanStack Query (React Query) — API 데이터 캐싱 + 자동 갱신
- **Form State**: React Hook Form + Zod 유효성 검사
- **SSE**: 브라우저 `EventSource` API

---

## 개발 단계

### Phase 1 - 백엔드 기반
1. `backend/containers` - PostgreSQL docker-compose 작성
2. `backend/liquibase` - Liquibase Gradle 프로젝트 초기화 및 changelog 작성
3. `backend/app` - Spring Boot 프로젝트 초기화 (Gradle, Java 21)
4. Multipass CLI 래퍼 서비스 구현
5. 클러스터 CRUD API 구현
6. 비동기 작업 + SSE 구현

### Phase 2 - 프론트엔드 기반
1. Next.js 프로젝트 초기화 (pnpm, shadcn/ui)
2. API 클라이언트 구현
3. Dashboard 페이지
4. 클러스터 생성 멀티스텝 폼
5. 클러스터 상세 페이지

### Phase 3 - 통합 및 개선
1. 실시간 로그 뷰어 (SSE 연동)
2. 에러 핸들링 & 사용자 피드백
3. kubeconfig 다운로드
4. 반응형 UI 마무리

---

## 사전 요구사항

- 백엔드 서버와 동일 머신에 **Multipass** 설치 필요
- **PostgreSQL 17** 서버 (Docker로 로컬 실행 가능)
- Java 21+, Node.js 20+, pnpm 설치
