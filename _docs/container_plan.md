# Container 이미지 빌드 계획

## 개요

`apps/` 디렉토리의 두 애플리케이션(`mpk3s-api`, `mpk3s-ui`)을 Docker 컨테이너 이미지로 빌드하고,
기존 PostgreSQL 컨테이너와 함께 `docker-compose`로 통합 운영하기 위한 계획이다.

---

## 현황

| 구성 요소 | 현재 상태 |
|---|---|
| PostgreSQL 17 | `containers/docker-compose.yml`에 컨테이너화 완료 |
| mpk3s-api | Dockerfile 없음 — 이미지 미빌드 |
| mpk3s-ui | Dockerfile 없음 — 이미지 미빌드 |

---

## 앱별 빌드 정보

### mpk3s-api (Spring Boot)

| 항목 | 내용 |
|---|---|
| 언어 / 런타임 | Java 21 (Gradle 빌드) |
| 프레임워크 | Spring Boot 3.4.4 |
| 빌드 결과물 | `build/libs/mpk3s-api-0.1.0.jar` (fat JAR) |
| 서비스 포트 | 9090 |
| 런타임 환경변수 | `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `ENCRYPTION_KEY` |

### mpk3s-ui (Next.js)

| 항목 | 내용 |
|---|---|
| 언어 / 런타임 | Node.js LTS, TypeScript |
| 프레임워크 | Next.js 15.3, React 19 |
| 패키지 매니저 | pnpm |
| 빌드 결과물 | `.next/` (SSR 번들) |
| 서비스 포트 | 3000 |
| 런타임 환경변수 | `BACKEND_URL`, `HOSTNAME` |

---

## Dockerfile 설계

### `containers/api/Dockerfile` — mpk3s-api

멀티스테이지 빌드를 사용해 빌드 환경과 런타임 환경을 분리한다.

```dockerfile
# Stage 1: Build
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /workspace
COPY apps/mpk3s-api/ .
RUN ./gradlew build -x test --no-daemon

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /workspace/build/libs/mpk3s-api-*.jar app.jar

ENV DB_URL=jdbc:postgresql://postgres:5432/mpk3s
ENV DB_USERNAME=mpk3s
ENV DB_PASSWORD=mpk3s
ENV ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

EXPOSE 9090
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**포인트:**
- `eclipse-temurin:21-jre-alpine` 사용으로 이미지 경량화
- `-x test` 플래그로 테스트를 빌드에서 제외 (선택적 조정 가능)
- DB 연결 대상 기본값을 `localhost` → `postgres` (compose 서비스명) 으로 변경

---

### `containers/ui/Dockerfile` — mpk3s-ui

Next.js `standalone` 출력 모드를 활용해 런타임 의존성을 최소화한다.

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY apps/mpk3s-ui/package.json apps/mpk3s-ui/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/mpk3s-ui/ .
RUN pnpm build

# Stage 2: Runtime
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV BACKEND_URL=http://api:9090

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["pnpm", "start"]
```

**포인트:**
- `pnpm install --frozen-lockfile`으로 재현 가능한 의존성 설치 보장
- `BACKEND_URL` 기본값을 compose 서비스명 `api`로 설정
- `next.config.ts`의 하드코딩된 IP(`192.168.0.209`)를 환경변수로 교체 필요 (하단 참고)

---

## `next.config.ts` 수정 필요 사항

현재 API 백엔드 URL이 하드코딩되어 있어 컨테이너 환경에서 동작하지 않는다.

```ts
// 현재 (하드코딩)
rewrites: async () => [{
  source: '/api/:path*',
  destination: `http://192.168.0.209:9090/api/:path*`,
}]

// 변경 후 (환경변수)
rewrites: async () => [{
  source: '/api/:path*',
  destination: `${process.env.BACKEND_URL ?? 'http://localhost:9090'}/api/:path*`,
}]
```

---

## docker-compose.yml 통합 계획

`containers/docker-compose.yml`에 api, ui 서비스를 추가한다.

```yaml
services:
  postgres:
    # 기존 설정 유지
    image: postgres:17
    container_name: mpk3s-postgres
    environment:
      POSTGRES_DB: mpk3s
      POSTGRES_USER: mpk3s
      POSTGRES_PASSWORD: mpk3s
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mpk3s"]
      interval: 10s
      retries: 5
    restart: unless-stopped

  api:
    build:
      context: ..
      dockerfile: containers/api/Dockerfile
    container_name: mpk3s-api
    ports:
      - "9090:9090"
    environment:
      DB_URL: jdbc:postgresql://postgres:5432/mpk3s
      DB_USERNAME: mpk3s
      DB_PASSWORD: mpk3s
      ENCRYPTION_KEY: ${ENCRYPTION_KEY:-0000000000000000000000000000000000000000000000000000000000000000}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  ui:
    build:
      context: ..
      dockerfile: containers/ui/Dockerfile
    container_name: mpk3s-ui
    ports:
      - "3000:3000"
    environment:
      BACKEND_URL: http://api:9090
    depends_on:
      - api
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## 디렉토리 구조

```
containers/
├── docker-compose.yml        # 전체 스택 통합
├── api/
│   └── Dockerfile            # mpk3s-api 빌드
└── ui/
    └── Dockerfile            # mpk3s-ui 빌드
```

---

## .dockerignore 파일

빌드 컨텍스트 크기를 줄이기 위해 각 앱에 `.dockerignore`를 추가한다.

**`apps/mpk3s-api/.dockerignore`:**
```
build/
.gradle/
*.class
*.jar
```

**`apps/mpk3s-ui/.dockerignore`:**
```
node_modules/
.next/
.env.local
*.log
```

---

## 구현 순서

1. `next.config.ts` 환경변수 처리로 수정
2. `containers/api/Dockerfile` 작성
3. `containers/ui/Dockerfile` 작성
4. `.dockerignore` 파일 추가 (api, ui 각각)
5. `containers/docker-compose.yml`에 api, ui 서비스 추가
6. 로컬에서 `docker compose up --build` 통합 테스트

---

## 이슈 및 고려 사항

| 이슈 | 내용 |
|---|---|
| `next.config.ts` 하드코딩 IP | 컨테이너 환경 사용을 위해 환경변수로 교체 필수 |
| Gradle 빌드 캐시 | 멀티스테이지에서 Gradle 캐시 레이어 최적화로 재빌드 시간 단축 가능 |
| `ENCRYPTION_KEY` 보안 | 프로덕션 배포 시 `.env` 파일 또는 시크릿 관리 도구 사용 권장 |
| Next.js standalone 모드 | `next.config.ts`에 `output: 'standalone'` 추가 시 이미지 크기 추가 최소화 가능 |