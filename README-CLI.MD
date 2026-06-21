# mpk3s - Multipass K3s Cluster Manager 🦖

[![License](https://img.shields.io/github/license/cnbsoft-com/k3s-helper)](https://github.com/cnbsoft-com/k3s-helper/blob/main/LICENSE)
[![Version](https://img.shields.io/github/v/release/cnbsoft-com/k3s-helper)](https://github.com/cnbsoft-com/k3s-helper/releases)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Language](https://img.shields.io/badge/language-shell-brightgreen)

> **AA Master's choice for rapid K8s infrastructure.**
> 로컬 환경에서 Multipass를 기반으로 K3s 클러스터를 광속으로 구축하고 관리하기 위한 통합 CLI 도구입니다. (An integrated CLI tool for rapidly building and managing K3s clusters on a local environment based on Multipass.)
>
> K3s에 대한 더 자세한 정보는 [공식 웹사이트](https://k3s.io)를 참조하십시오. (For more detailed information about K3s, please refer to the official website: [https://k3s.io](https://k3s.io))

## 📖 Table of Contents (목차)
- [🌟 Motivation (만든 계기)](#-motivation-만든-계기)
- [⚠️ WARNING](#️-warning-for-development-and-testing-only)
- [🚀 Key Features](#-key-features)
- [🛠 Prerequisites](#-prerequisites)
- [🍺 Installation via Homebrew](#-installation-via-homebrew-upcoming)
- [🚀 Direct Installation (One-liner)](#-direct-installation-one-liner)
- [💻 Usage](#usage)
- [📂 Project Structure](#-project-structure)
- [🗺️ Roadmap (향후 계획)](#️-roadmap-향후-계획)
- [📄 License](#-license)

## 🌟 Motivation (만든 계기)

애플 실리콘(M1/M2/M3/M4) 맥 환경에서 쿠버네티스를 공부하기 위해 로컬 환경을 구성하는 일은 매우 험난했습니다. (Setting up a local Kubernetes environment on Apple Silicon Macs for learning was a challenging journey.) 겨우 성공하더라도 재구성할 때마다 다시 실패하는 일이 잦았습니다. (Even after succeeding, I often faced failures whenever I tried to rebuild the cluster.)

그러던 중 [K3s](https://k3s.io)와 [Multipass](https://multipass.run)를 알게 되었고, 이 훌륭한 도구들 덕분에 구성 자체의 어려움을 해결할 수 있었습니다. 이 자리를 빌려 **K3s와 Multipass 팀, 그리고 개발자 커뮤니티에 깊은 감사**를 표합니다. (Then, I discovered K3s and Multipass, and thanks to these excellent tools, I was able to overcome the initial difficulties. I would like to take this opportunity to express my deep gratitude to the K3s and Multipass teams and the developer community.)

저는 이 프로젝트들을 통해 얻은 도움을 커뮤니티에 다시 보답하고자 합니다. (I wish to give back to the community that has helped me so much through these projects.) 빈번한 테스트를 위해 반복되는 번거로운 인프라 구축 과정을 자동화하여, 다른 개발자분들도 오직 설계와 학습에만 집중할 수 있도록 돕기 위해 **`mpk3s`**를 공개하게 되었습니다. (By automating the repetitive and tedious infrastructure setup for frequent testing, I released `mpk3s` to help other developers focus solely on architecture and learning.)

아직 초기 버전이라 미흡한 점이 많지만, 앞으로 틈틈이 유용한 기능들을 계속해서 추가해 나갈 예정입니다. (While still in its early stages and potentially lacking in some areas, I plan to continue adding useful features whenever possible.)

## ⚠️ WARNING: For Development and Testing Only

**This project is strictly intended for local development and testing environments.**
It is NOT designed or recommended for production use. The simplified security configurations and automated setups are optimized for developer productivity, not for high-availability or hardened production infrastructure.

## 🚀 Key Features

- **통합 CLI: (Integrated CLI:)** 모든 기능을 `mpk3s` 명령어 하나로 제어합니다. (Control all features with a single `mpk3s` command.)
- **자동 프로비저닝: (Automated Provisioning:)** Master와 다수의 Worker 노드를 사양에 맞춰 자동 생성 및 구성합니다. (Automatically create and configure Master and multiple Worker nodes according to specifications.)
- **멀티 클러스터 관리: (Multi-cluster Management:)** 여러 클러스터의 `kubeconfig`를 독립적으로 관리하고 환경 변수를 자동 최적화합니다. (Independently manage `kubeconfig` for multiple clusters and automatically optimize environment variables.)
- **보안 및 확장: (Security & Scalability:)** 외부 접속을 위한 TLS SAN 설정 및 동적 워커 노드 추가/삭제를 지원합니다. (Supports TLS SAN configuration for external access and dynamic addition/deletion of worker nodes.)

## 🛠 Prerequisites

- **macOS**
- **Multipass** installed ([https://multipass.run](https://multipass.run))
- **curl** (for K3s installation)

## 🍺 Installation via Homebrew (Upcoming)

```bash
brew tap cnbsoft-com/tap
brew install mpk3s
```

## 🚀 Direct Installation (One-liner)

`brew tap` 없이 한 줄의 명령어로 즉시 설치할 수 있습니다. (Install immediately with a single command without `brew tap`.)

```bash
curl -fsSL https://raw.githubusercontent.com/cnbsoft-com/k3s-helper/main/install.sh | sh
```

## Usage

### 1. 초기화 (Initialize)
멀티 클러스터 관리를 위한 kubeconfig 설정 스크립트를 생성합니다. (Generate a kubeconfig configuration script for multi-cluster management.)
```bash
mpk3s init
# 'source ~/.kube-config.sh' 명령을 .zshrc 등에 추가하세요. (Add the 'source ~/.kube-config.sh' command to your .zshrc, etc.)
```

### 2. 클러스터 생성 (Generate)
대화형 모드로 이름, 이미지, 사양을 선택하여 클러스터를 생성합니다. (Create a cluster by selecting name, image, and specs in interactive mode.)
```bash
mpk3s generate
```

### 3. 클러스터 관리 (Cluster Management)
```bash
mpk3s list        # 모든 클러스터 목록 확인 (ls 가능) (List all clusters - 'ls' also available)
mpk3s add         # 기존 클러스터에 워커 노드 추가 (Add worker nodes to an existing cluster)
mpk3s tls         # 마스터 노드에 TLS SAN 설정 추가 (Add TLS SAN configuration to the master node)
```

### 4. 노드 및 클러스터 삭제 (Deletion)
```bash
mpk3s delworker   # 특정 워커 노드 삭제 (Delete a specific worker node)
mpk3s delcluster  # 클러스터 전체 및 관련 설정 파일 완벽 삭제 (Complete deletion of the entire cluster and related configuration files)
```

## 📂 Project Structure

```text
k3s-helper/
├── bin/          # mpk3s 메인 실행 파일 (mpk3s main executable file)
├── libs/         # 핵심 기능을 담당하는 모듈화된 스크립트 (Modularized scripts for core features)
└── dev-logs/     # 일자별 개발 기록 및 결정 사항 (Daily development logs and decisions)
```

## 🗺️ Roadmap (향후 계획)

앞으로 다음과 같은 기능들을 추가하여 도구의 완성도를 높여갈 예정입니다. (I plan to enhance the tool's completeness by adding the following features in the future.)

1. **Multipass 사양 변경 기능: (Multipass Spec Customization:)**
  - CPU 코어 수, 메모리 용량, 디스크 사이즈를 자유롭게 지정하는 기능 (Ability to customize CPU cores, memory capacity, and disk size.)
2. **마운트 기능: (Mount Support:)**
  - 호스트와 VM 간의 디렉토리 공유를 위한 마운트 기능 추가 (Add mount support for directory sharing between the host and VMs.)

## 📄 License
This project is licensed under the **MIT License**.

---
*Note: English translations in this document were generated with the assistance of Dino (AI Assistant).*
*Developed with 🦖 by IK-YONG CHOI (AA Master)*
