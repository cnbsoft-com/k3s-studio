# k3s-studio 구현 이력

---

## v1: K8s Manifest 조회 + Template 라이브러리 — 완료

**커밋:** `4c80966`, `a7e530d` (main)
**완료일:** 2026-05-24

- 리소스 행 클릭 → 읽기전용 YAML 패널 (4상태: 초기/로딩/에러/성공)
- 서버 메타데이터 자동 제거 (managedFields, uid, ownerReferences 등)
- ManifestTemplate 라이브러리: 클러스터별 저장/불러오기/삭제, 중복 시 409

---

## v2: Apply 히스토리 + k8s API 타임아웃 — 완료

**커밋:** `4129b2d` (main)
**완료일:** 2026-05-24

- #6 Apply/Delete 실행 이력 DB 저장 + UI 히스토리 목록 (클릭 시 편집기 복원)
- #7 KubernetesClientFactory 로컬/원격 모두 requestTimeout 30초 적용

---

## v3: Pod 로그 조회 + 리소스 확장 + hardware 수정 — 완료

**커밋:** `da8a36c`, `ff0d4d6`, `16c365f` (main)
**완료일:** 2026-05-24

- Pod 선택 시 YAML/로그 탭 전환, tail 100줄 on-demand 조회
- K8s 리소스 타입 확장: StatefulSets, Ingresses, Secrets (Secrets data → `<secret>` 마스킹)
- #4 멀티패스 hardware 수정: Stopped 노드에서 CPU/메모리/디스크 변경 (`multipass set`)
