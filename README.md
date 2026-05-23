# K3s-Studio - Multipass K3s Cluster Manager 🦖

[![License](https://img.shields.io/github/license/cnbsoft-com/k3s-helper)](https://github.com/cnbsoft-com/k3s-helper/blob/main/LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Language](https://img.shields.io/badge/language-Java%20%2F%20TypeScript-blue)

> **The ultimate GUI & CLI for rapid K8s infrastructure.**
> K3s-Studio는 Multipass 기반의 K3s 클러스터를 관리하기 위한 통합 플랫폼입니다. 강력한 CLI 도구와 직관적인 Web UI를 통해 Kubernetes 클러스터를 광속으로 구축하고 관리할 수 있습니다.

---

## 🚀 Quick Start (서버 실행 방법)

### 1. 전제 조건 (Prerequisites)
- **macOS** (Multipass 실행 환경)
- **Multipass** 설치 필수 ([https://multipass.run](https://multipass.run))
- **Docker & Docker Compose** (데이터베이스 실행용)
- **Java 21+**, **Node.js 20+**, **pnpm** 설치

### 2. 데이터베이스 실행 (Database)
프로젝트 루트에서 다음 명령어를 실행하여 PostgreSQL 17을 시작합니다.
```bash
docker compose -f containers/docker-compose.yml up -d
```

### 3. 백엔드 서버 실행 (Backend API)
`apps/mpk3s-api` 디렉토리로 이동하여 Spring Boot 서버를 실행합니다. (기본 포트: 9090)
```bash
cd apps/mpk3s-api
./gradlew bootRun
```

### 4. 프론트엔드 서버 실행 (Web UI)
`apps/mpk3s-ui` 디렉토리로 이동하여 Next.js 개발 서버를 실행합니다. (기본 포트: 3000)
```bash
cd apps/mpk3s-ui
pnpm install
pnpm dev
```
브라우저에서 `http://localhost:3000`에 접속하여 클러스터를 관리하세요.
백엔드 API는 `http://localhost:9090`에서 실행됩니다.

---

## 🚀 Key Features

- **Web UI & Dashboard**: 직관적인 GUI를 통해 클러스터 상태를 실시간으로 모니터링하고 제어합니다.
- **멀티 호스트 지원**: 로컬 Multipass뿐만 아니라 원격 서버(SSH)의 Multipass 노드도 관리할 수 있습니다.
- **자동 프로비저닝**: Master와 다수의 Worker 노드를 사양에 맞춰 자동 생성 및 구성합니다.
- **비동기 작업 관리**: 장시간 소요되는 클러스터 생성 과정을 SSE(Server-Sent Events)를 통해 실시간 로그로 확인합니다.
- **통합 CLI**: GUI 없이 터미널에서도 모든 기능을 `K3s-Studio` 명령어 하나로 제어할 수 있습니다.

## 📂 Project Structure

```text
k3s-helper/
├── apps/
│   ├── mpk3s-api/    # Spring Boot 기반 REST API 서버
│   └── mpk3s-ui/     # Next.js (App Router) 기반 Web 프론트엔드
├── bin/              # K3s-Studio CLI 실행 파일
├── data-manager/     # Liquibase 기반 DB 스키마 관리
├── containers/       # PostgreSQL Docker Compose 설정
└── _docs/            # 프로젝트 설계 및 기획 문서
```

## 💻 CLI Usage

기존 CLI 도구도 계속해서 사용할 수 있습니다.

### 1. 초기화 (Initialize)
```bash
K3s-Studio init
# 'source ~/.kube-config.sh' 명령을 .zshrc 등에 추가하세요.
```

### 2. 클러스터 생성 및 관리
```bash
K3s-Studio generate    # 대화형 클러스터 생성
K3s-Studio list        # 모든 클러스터 목록 확인
K3s-Studio add         # 워커 노드 추가
K3s-Studio delcluster  # 클러스터 삭제
```

## 🗺️ Roadmap (향후 계획)

1. **원격 호스트 Multipass 제어**: 여러 대의 물리 서버에 흩어진 Multipass 인스턴스를 하나의 대시보드에서 통합 관리.
2. **Cluster 호스트 등록 GUI**: UI에서 간편하게 원격 서버를 등록하고 상태를 체크하는 기능.
3. **K3s 컴포넌트 세부 설정**: Traefik, Metrics Server 등 컴포넌트의 커스텀 설정 지원.

## 📄 License
This project is licensed under the **MIT License**.

---
*Developed with 🦖 by IK-YONG CHOI (AA Master)*
