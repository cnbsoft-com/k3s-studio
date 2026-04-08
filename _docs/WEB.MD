# WEB

## 실행 순서
```shell
# 1. DB 시작
cd web/backend/containers && docker compose up -d

# 2. DB 마이그레이션
cd web/backend/liquibase && ./gradlew update

# 3. 백엔드 실행
cd web/backend/app && ./gradlew bootRun

# 4. 프론트엔드 실행
cd web/frontend && pnpm install && pnpm dev
```