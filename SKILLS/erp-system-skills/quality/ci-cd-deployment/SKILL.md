---
name: ci-cd-deployment
description: >
  Pipeline completo de CI/CD y deployment para sistemas ERP. Cubre GitHub Actions workflows,
  Docker y Docker Compose para desarrollo y producción, estrategias de deployment (blue-green, canary),
  gestión de variables de entorno y secrets, multi-stage builds, health checks en containers,
  y automatización del proceso de release. Usa esta skill SIEMPRE que necesites configurar CI/CD,
  crear Dockerfiles, docker-compose, GitHub Actions, o planificar el deployment de la aplicación.
  Se activa con "CI/CD", "GitHub Actions", "Docker", "Dockerfile", "docker-compose", "deploy",
  "pipeline", "build", "release", "staging", "producción", "contenedor", o cualquier referencia
  a integración continua, entrega continua o deployment.
---

# CI/CD & Deployment — Sistemas ERP

Pipeline completo de integración y entrega continua para aplicaciones empresariales.

## Docker — Desarrollo

```yaml
# docker-compose.yml — Entorno de desarrollo completo
services:
  # Base de datos PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: erp_user
      POSTGRES_PASSWORD: erp_password
      POSTGRES_DB: erp_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U erp_user -d erp_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Redis (cache + queues)
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  # API Backend
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.dev
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://erp_user:erp_password@postgres:5432/erp_dev
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev-secret-key-change-in-production-32chars
      PORT: 4000
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: npm run dev

  # BullMQ Dashboard (monitoreo de colas)
  bull-board:
    image: deadly0/bull-board
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
    ports:
      - "3100:3000"
    depends_on:
      - redis

volumes:
  postgres_data:
  redis_data:
```

### Dockerfile de Desarrollo

```dockerfile
# docker/Dockerfile.dev
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate

EXPOSE 4000

CMD ["npm", "run", "dev"]
```

## Docker — Producción

```dockerfile
# docker/Dockerfile
# ─── Stage 1: Dependencies ───
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false

# ─── Stage 2: Build ───
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Stage 3: Production ───
FROM node:20-alpine AS production
WORKDIR /app

# Seguridad: no ejecutar como root
RUN addgroup -g 1001 -S nodejs && adduser -S erp -u 1001
USER erp

# Solo copiar lo necesario
COPY --from=build --chown=erp:nodejs /app/dist ./dist
COPY --from=build --chown=erp:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=erp:nodejs /app/prisma ./prisma
COPY --from=build --chown=erp:nodejs /app/package.json ./

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
```

## GitHub Actions — CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ─── Lint & Type Check ───
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  # ─── Unit Tests ───
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run test:unit -- --reporter=junit --outputFile=test-results.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: unit-test-results
          path: test-results.xml

  # ─── Integration Tests ───
  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_pass
          POSTGRES_DB: erp_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    env:
      DATABASE_URL: postgresql://test_user:test_pass@localhost:5432/erp_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-secret-key-for-ci-32-characters
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run test:integration

  # ─── Build Docker Image ───
  build:
    needs: [lint, test-unit, test-integration]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## GitHub Actions — Deploy

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types: [completed]
    branches: [main]

jobs:
  deploy-staging:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to Staging
        run: |
          echo "Deploying ${{ github.sha }} to staging..."
          # Tu lógica de deploy aquí (SSH, kubectl, etc.)

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://erp.company.com
    steps:
      - name: Deploy to Production
        run: |
          echo "Deploying ${{ github.sha }} to production..."

      - name: Run DB Migrations
        run: |
          npx prisma migrate deploy

      - name: Health Check
        run: |
          for i in {1..10}; do
            if curl -sf https://erp.company.com/health; then
              echo "Health check passed!"
              exit 0
            fi
            echo "Waiting for health check... ($i/10)"
            sleep 5
          done
          echo "Health check failed!"
          exit 1

      - name: Notify on Success
        if: success()
        run: echo "Deploy successful!"

      - name: Rollback on Failure
        if: failure()
        run: echo "Deploy failed, rolling back..."
```

## Variables de Entorno

```bash
# .env.example — Template para desarrolladores
# Copiar como .env y ajustar valores

# ─── App ───
NODE_ENV=development
PORT=4000
APP_VERSION=0.1.0

# ─── Database ───
DATABASE_URL=postgresql://erp_user:erp_password@localhost:5432/erp_dev

# ─── Redis ───
REDIS_URL=redis://localhost:6379

# ─── Auth ───
JWT_SECRET=your-secret-key-min-32-chars-long-change-me
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── Email ───
RESEND_API_KEY=
EMAIL_FROM=noreply@company.com

# ─── Monitoring ───
SENTRY_DSN=
LOG_LEVEL=debug

# ─── Frontend ───
FRONTEND_URL=http://localhost:3000
```

## Checklist de Deploy

- [ ] Tests pasan al 100% (unit + integration)
- [ ] Docker image se construye exitosamente
- [ ] Migraciones de BD ejecutan sin error
- [ ] Variables de entorno configuradas
- [ ] Health check responde `200`
- [ ] Secrets actualizados (JWT_SECRET, API keys)
- [ ] SSL/TLS configurado (HTTPS)
- [ ] Backups de BD programados
- [ ] Logging y monitoreo activos
- [ ] Rollback plan documentado
