# K8s Manifest 조회 + Template 라이브러리 — 완료

**커밋:** `4c80966`, `a7e530d` (main)  
**완료일:** 2026-05-24

---

## 구현 내용

### 기능 1: 리소스 행 클릭 → 읽기전용 YAML 패널

- 테이블 행 클릭 시 우측 패널에 해당 리소스 YAML 표시
- 반환 YAML에서 서버 메타데이터 자동 제거: `managedFields`, `resourceVersion`, `uid`, `ownerReferences`, `creationTimestamp`, `status`
- ConfigMap `binaryData` → `<binary: ~N bytes>` placeholder 치환
- 4상태: 초기(안내 문구) / 로딩(skeleton) / 에러(재시도 버튼) / 성공(스크롤 가능 pre)
- "Template으로 저장" / "편집기로 ↓" 버튼

### 기능 2: ManifestTemplate 라이브러리

- YAML에 이름+설명을 붙여 클러스터별 저장/재사용
- ManifestEditor: Template 불러오기 드롭다운 + Template 저장 버튼 + × 삭제
- `(cluster_name, name)` UNIQUE 제약 — 중복 시 409

---

## 주요 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 서버 메타데이터 | 모두 제거 (ownerReferences 포함) | Apply 시 field-manager 충돌 방지 |
| cluster 연결 | 필수 (null 불허) | drift 위험 방지 |
| 읽기전용 패널 분리 | 편집기와 별도 | 현재 상태 vs 적용할 것 혼동 방지 |
| DB 개념 모델 | Template 라이브러리 | 사용자 선택 |
| 마이그레이션 | `ddl-auto: update` 유지 | Flyway 도입은 scope 초과 |
| FK | `cluster_name VARCHAR` | 기존 API 패턴 일치, rename 없음 |
| namespace=all | 400 반환 | 단일 리소스 조회에 all은 무의미 |

---

## API

```
GET  /api/clusters/{name}/k8s/{type}/{namespace}/{resourceName}/manifest → { yaml: string }
GET  /api/manifests?clusterName={name}
POST /api/manifests    { clusterName, name, description?, yamlContent }
PUT  /api/manifests/{id}
DELETE /api/manifests/{id}
```

---

## v2 연기 항목

- apply 히스토리
- k8s API 30초 타임아웃 (KubernetesClientFactory ConfigBuilder에 추가 필요)
