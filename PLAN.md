<!-- /autoplan restore point: /Users/dino/.gstack/projects/cnbsoft-com-mpk3s/main-autoplan-restore-20260524-200341.md -->
# Plan: K8s Object Manifest 조회 + DB 기반 Manifest 관리

Branch: main
Task: (1) k8s 리소스 선택 시 YAML manifest 출력, (2) DB로 manifest 저장/관리

---

## 배경

현재 K3s-Studio는 k8s 리소스(pod/service/deployment/configmap)를 테이블로 조회하고, ManifestEditor에서 직접 YAML을 입력해 apply/delete할 수 있다.

두 가지 기능이 추가로 필요하다:
1. **Object 선택 → Manifest 표시**: 테이블 행을 클릭하면 해당 리소스의 현재 YAML을 조회해 보여준다. (kubectl get pod X -o yaml과 동일)
2. **DB Manifest 관리**: 작성/사용한 manifest를 DB에 저장하고 목록에서 불러와 재사용한다.

---

## 현재 구조 요약

- `K8sService` — fabric8 KubernetesClient로 5종 리소스 조회, manifest apply/delete
- `K8sController` — GET /k8s/{type}?namespace=, POST /k8s/apply, POST /k8s/delete
- `KubernetesClientFactory` — cluster별 KubernetesClient 캐싱 + SSH 터널
- `K8sResourceTable` — 리소스 타입별 테이블 (행 클릭 기능 없음)
- `ManifestEditor` — textarea + Apply/Delete 버튼 (stateless, DB 저장 없음)

---

## 기능 1: Object 선택 → Manifest YAML 조회

### 백엔드

```java
// K8sController
GET /api/clusters/{name}/k8s/pods/{namespace}/{resourceName}/manifest
GET /api/clusters/{name}/k8s/services/{namespace}/{resourceName}/manifest
GET /api/clusters/{name}/k8s/deployments/{namespace}/{resourceName}/manifest
GET /api/clusters/{name}/k8s/configmaps/{namespace}/{resourceName}/manifest

// K8sService
public String getResourceManifest(String clusterName, String resourceType,
                                   String namespace, String resourceName) throws IOException {
    KubernetesClient client = client(clusterName);
    HasMetadata resource = switch (resourceType) {
        case "pods"        -> client.pods().inNamespace(namespace).withName(resourceName).get();
        case "services"    -> client.services().inNamespace(namespace).withName(resourceName).get();
        case "deployments" -> client.apps().deployments().inNamespace(namespace).withName(resourceName).get();
        case "configmaps"  -> client.configMaps().inNamespace(namespace).withName(resourceName).get();
        default -> throw new IllegalArgumentException("Unknown resource type: " + resourceType);
    };
    if (resource == null) throw new IllegalArgumentException(resourceType + " not found: " + resourceName);
    return Serialization.asYaml(resource);
}
```

응답: `{ yaml: string }` (200), 없으면 400

### 프론트엔드

- `K8sResourceTable` 행에 `onClick` 핸들러 추가
- 클릭 시 선택 row 하이라이트 + `onSelect(resourceType, namespace, name)` 콜백
- `page.tsx` 에서 선택된 리소스 state 관리 → GET manifest API 호출
- 결과 YAML을 `ManifestEditor`의 textarea에 채워 넣음 (편집 후 Apply/Delete 가능)
- 로딩 중 spinner, 에러 시 toast

---

## 기능 2: DB Manifest 관리

### 목표

사용자가 작성한 YAML manifest를 이름 붙여 저장하고, 나중에 목록에서 불러와 재사용한다.
"나만의 kubectl apply 북마크" 개념.

### DB 테이블

```sql
CREATE TABLE manifests (
    id          BIGSERIAL PRIMARY KEY,
    cluster_name VARCHAR(255),          -- null이면 범용(어느 클러스터에나 사용 가능)
    name        VARCHAR(255) NOT NULL,  -- 사용자가 붙이는 이름 (예: "nginx-deployment")
    description TEXT,
    yaml_content TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### API

```
GET  /api/manifests?clusterName={name}   → 목록 (클러스터 + 범용 모두 반환)
POST /api/manifests                      { clusterName?, name, description?, yaml }
PUT  /api/manifests/{id}                 { name, description?, yaml }
DELETE /api/manifests/{id}
```

### 프론트엔드

- ManifestEditor 옆에 "저장" 버튼 추가 → 이름 입력 dialog
- K8s 탭에 "저장된 Manifest" 드롭다운 / 목록 패널 추가
- 선택 시 ManifestEditor에 YAML 채워 넣음 → Apply 가능

---

## 열린 질문 (해소됨)

1. **기능 1 YAML 서버 메타데이터 제거** → 반드시 제거. managedFields/resourceVersion/uid/status/creationTimestamp 제거 후 반환. (CEO: CRITICAL)
2. **범용(null cluster) manifest** → 제거. 모든 manifest는 반드시 cluster와 연결. (CEO: HIGH)
3. **조회 → 저장 흐름** → 추가. 조회 YAML 패널에 "Template으로 저장" 버튼 추가. (CEO: HIGH)
4. **DB 개념 모델** → **Template 라이브러리** 선택. 자주 쓰는 YAML을 이름 붙여 저장/재사용. (D1 결정)
5. **조회 뷰 vs 편집 뷰 혼용** → 분리. 리소스 클릭 시 읽기전용 패널 표시, 편집기는 별도 유지.
6. **manifest 이름 중복** → 불허. Template 개념에서 같은 이름은 같은 것.
7. **apply 히스토리** → v2로 연기.
8. **manifests.cluster_name FK** → `cluster_name VARCHAR` 유지 (P3: 기존 패턴 일치, cluster rename은 현실에서 없음). (Eng 자동결정)
9. **T5 마이그레이션** → Flyway 없이 `spring.jpa.hibernate.ddl-auto: update`로 처리. (Eng 자동결정: P3)
10. **manifest API namespace=all 금지** → `namespace=all` 요청 시 400 반환. (Eng 자동결정: P5)
11. **404 처리** → `ResourceNotFoundException` 추가 → `@ControllerAdvice`에서 404 매핑. (Eng 자동결정: P1)
12. **UNIQUE 제약** → `(cluster_name, name)` 복합 UNIQUE — 같은 클러스터 내 이름 중복 불허. (Eng 자동결정: P5)
13. **k8s API 타임아웃** → `withRequestTimeout(Duration.ofSeconds(30))` 적용. (Eng 자동결정: P5)
14. **ConfigMap binaryData** → binaryData 있으면 해당 필드만 `<binary: N bytes>` 로 치환 후 반환. (Eng 자동결정: P1)

---

## UI 레이아웃 (Design Review 확정)

```
┌─────────────────────────────────────────────────────────┐
│ [NS 셀렉터]  [Pods|Services|Deployments|ConfigMaps]     │
├──────────────────────┬──────────────────────────────────┤
│  리소스 테이블       │  읽기전용 YAML 패널               │
│  (행 클릭 → 우측)   │  [초기: "행을 클릭하세요" 회색]  │
│  선택행: primary/10 │  [로딩: skeleton]                 │
│  border-l-2         │  [에러: 인라인 메시지+재시도]     │
│                      │  [성공: max-h-96 overflow-auto]  │
│                      │  [Template으로 저장] [편집기로↓] │
├──────────────────────┴──────────────────────────────────┤
│ Manifest 편집기                                          │
│ [Template에서 불러오기 ▾ (name+description 2줄)]        │
│ [textarea — controlled value/onChange]                  │
│ [Apply] [Delete]  [현재 내용을 Template 저장]           │
└─────────────────────────────────────────────────────────┘
```

- K8s 탭 활성 시 `max-w-6xl` (1152px), 비활성 시 `max-w-4xl`
- 타입/NS 변경 시 선택 row + 읽기전용 패널 초기화

### Template 저장 Dialog

- `name` input: 필수, max 100자, 중복 불허 → 409 시 인라인 에러 "이미 존재하는 이름입니다"
- `description` textarea: 선택, max 200자
- 삭제: 드롭다운 아이템 `×` 버튼 → confirm dialog

---

## 확정 구현 계획

### 백엔드 태스크

- [ ] **T1** `K8sService.getResourceManifest()` 구현 (fabric8 Serialization.asYaml)
- [ ] **T2** `K8sController`에 manifest 조회 엔드포인트 4개 추가
- [ ] **T3** `Manifest` 엔티티 + `ManifestRepository` (Spring Data JPA)
- [ ] **T4** `ManifestService` + `ManifestController` CRUD
- [ ] **T5** `Manifest` JPA Entity DDL로 테이블 자동 생성 (`ddl-auto: update`). `ResourceNotFoundException` + `@ControllerAdvice` 추가.

### 프론트엔드 태스크

- [ ] **T6** `K8sResourceTable` onSelect 콜백 + 행 클릭 → manifest 조회 연결
- [ ] **T7** `api.ts` — manifest 조회 API 함수 + Manifest CRUD 타입/함수
- [ ] **T8** `ManifestEditor` — 저장 버튼 + 저장된 manifest 로드 드롭다운
- [ ] **T9** `page.tsx` — 선택 state 관리, manifest 조회 useQuery 연결

### API 엔드포인트 (확정)

```
GET  /api/clusters/{name}/k8s/{type}/{namespace}/{resourceName}/manifest → { yaml: string }
GET  /api/manifests?clusterName={name}
POST /api/manifests                        { clusterName?, name, description?, yaml }
PUT  /api/manifests/{id}                   { name, description?, yaml }
DELETE /api/manifests/{id}
```

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | 조회 YAML에서 managedFields/resourceVersion/uid/status 제거 | Mechanical | P1+P5 | Apply 시 409/field-manager 충돌 방지. 필수 수정. | 그대로 노출(Apply 오류) |
| 2 | CEO | 범용(null cluster) manifest 제거 | Mechanical | P5 | cluster 없는 manifest는 drift 위험. 명시적 연결 필수. | 범용 허용 |
| 3 | CEO | 조회 → "Template으로 저장" 버튼 추가 | Mechanical | P1 | 조회-저장 흐름이 없으면 두 기능이 단절됨. | 수동 복붙 |
| 4 | CEO | DB 유지 (파일시스템 방식 기각) | Mechanical | P3 | 이미 JPA/PostgreSQL 인프라 존재. 재발명 불필요. | 로컬 파일시스템 |
| 5 | CEO | 조회 패널 읽기전용 분리, 편집기 별도 유지 | Mechanical | P5 | 동일 textarea 혼용 시 "현재 상태"와 "적용할 것" 혼동 | 단일 textarea |
| 6 | D1 | DB 개념 모델: Template 라이브러리 | Taste (User) | — | 사용자 선택. 단순하고 즉시 유용. Lens 대비 차별점 약하나 v1 완성 가능 | Recipe(복잡), Snapshot(중간복잡) |
| 7 | Eng | manifests.cluster_name: VARCHAR 유지 | Mechanical | P3 | cluster rename은 현실적으로 없음. 기존 API 패턴(clusterName param)과 일치. | cluster_id FK(JOIN 필요, 구현 복잡) |
| 8 | Eng | T5: ddl-auto:update 유지, Flyway 미도입 | Mechanical | P3 | 기존 인프라 활용, scope 최소화. 테이블 1개로 Flyway 도입은 과도. | Flyway baseline 도입 |
| 9 | Eng | namespace=all → 400 (manifest API) | Mechanical | P5 | manifest는 단일 리소스 조회. all은 의미 없음. 명시적 거부가 안전. | 허용(첫 번째 NS 사용) |
| 10 | Eng | ResourceNotFoundException → 404 | Mechanical | P1 | IllegalArgumentException → 400은 not-found와 의미 혼동. | 기존 400 유지 |
| 11 | Eng | UNIQUE(cluster_name, name) | Mechanical | P5 | Template명 중복 불허(CEO 결정 6번). DB 제약으로 강제. | 앱 레벨 검증만 |
| 12 | Eng | k8s API 30초 타임아웃 | Mechanical | P5 | SSH 터널 + k8s 지연 가능. 무한 대기 방지. | 타임아웃 없음 |
| 13 | Eng | ConfigMap binaryData → placeholder 치환 | Mechanical | P1 | 바이너리를 YAML에 포함하면 크기/인코딩 문제. 읽기전용 패널이므로 placeholder 충분. | 바이너리 포함(크기 문제) |
