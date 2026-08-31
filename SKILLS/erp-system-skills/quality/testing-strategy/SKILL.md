---
name: testing-strategy
description: >
  Estrategia completa de testing para sistemas ERP con TypeScript. Cubre la pirámide de testing
  (Unit, Integration, E2E), testing de APIs con Vitest + Supertest, testing de componentes con
  Testing Library, mocking de servicios y repositorios, fixtures y factories para datos de prueba,
  y cobertura de código. Usa esta skill SIEMPRE que necesites escribir tests, configurar testing,
  crear mocks, generar datos de prueba, o definir la estrategia de QA. Se activa con "test",
  "testing", "unit test", "integración", "e2e", "Vitest", "Jest", "mock", "factory", "fixture",
  "cobertura", "TDD", "Testing Library", o cualquier referencia a pruebas de software.
---

# Testing Strategy — Sistemas ERP

Estrategia profesional de testing para aplicaciones empresariales con alta confiabilidad.

## Pirámide de Testing

```
        /  E2E Tests  \        ← Pocos, lentos, alto valor (flujos críticos)
       / Integration   \       ← Moderados (API endpoints, BD)
      /   Unit Tests    \      ← Muchos, rápidos (lógica de negocio)
     /___________________\
```

| Tipo | Qué testea | Herramientas | Cantidad |
|------|-----------|--------------|----------|
| Unit | Entidades, use cases, utils | Vitest | ~70% |
| Integration | Controllers + BD real | Vitest + Supertest + TestContainers | ~20% |
| E2E | Flujos de usuario completos | Playwright | ~10% |

## Configuración de Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/modules/**/*.ts'],
      exclude: ['**/*.dto.ts', '**/*.routes.ts', '**/index.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
  },
});
```

## Unit Tests — Domain Layer

Testea la lógica de negocio pura, sin dependencias externas.

```typescript
// tests/unit/modules/inventory/domain/product.entity.test.ts
import { describe, it, expect } from 'vitest';
import { Product } from '@/modules/inventory/domain/entities/product.entity';

describe('Product Entity', () => {
  describe('create', () => {
    it('should create a valid product', () => {
      const result = Product.create({
        sku: 'LAPTOP-001',
        name: 'MacBook Pro',
        unitPrice: 2499.99,
        categoryId: 'cat-123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('MacBook Pro');
      expect(result.value.sku.value).toBe('LAPTOP-001');
      expect(result.value.isActive).toBe(true);
    });

    it('should fail with empty name', () => {
      const result = Product.create({
        sku: 'TEST-001', name: '', unitPrice: 10, categoryId: 'cat-123',
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('name');
    });

    it('should fail with negative price', () => {
      const result = Product.create({
        sku: 'TEST-001', name: 'Test', unitPrice: -5, categoryId: 'cat-123',
      });
      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('price');
    });
  });

  describe('adjustStock', () => {
    it('should increase stock', () => {
      const product = createTestProduct({ currentStock: 10 });
      const result = product.adjustStock(5, 'Purchase');

      expect(result.isSuccess).toBe(true);
      expect(product.currentStock).toBe(15);
    });

    it('should decrease stock', () => {
      const product = createTestProduct({ currentStock: 10 });
      const result = product.adjustStock(-3, 'Sale');

      expect(result.isSuccess).toBe(true);
      expect(product.currentStock).toBe(7);
    });

    it('should fail when insufficient stock', () => {
      const product = createTestProduct({ currentStock: 5 });
      const result = product.adjustStock(-10, 'Sale');

      expect(result.isFailure).toBe(true);
      expect(result.error).toContain('Insufficient');
    });

    it('should emit domain event on stock adjustment', () => {
      const product = createTestProduct({ currentStock: 10 });
      product.adjustStock(5, 'Purchase');

      expect(product.domainEvents).toHaveLength(1);
      expect(product.domainEvents[0].eventName).toBe('inventory.stock.adjusted');
    });
  });

  describe('isLowStock', () => {
    it('should return true when stock is at minimum', () => {
      const product = createTestProduct({ currentStock: 5, minimumStock: 5 });
      expect(product.isLowStock()).toBe(true);
    });

    it('should return true when stock is below minimum', () => {
      const product = createTestProduct({ currentStock: 2, minimumStock: 5 });
      expect(product.isLowStock()).toBe(true);
    });

    it('should return false when stock is above minimum', () => {
      const product = createTestProduct({ currentStock: 10, minimumStock: 5 });
      expect(product.isLowStock()).toBe(false);
    });
  });
});
```

### Unit Test — Use Case

```typescript
// tests/unit/modules/inventory/application/create-product.use-case.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateProductUseCase } from '@/modules/inventory/application/use-cases/create-product.use-case';

describe('CreateProductUseCase', () => {
  let useCase: CreateProductUseCase;
  let mockProductRepo: MockProductRepository;
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockProductRepo = {
      findBySku: vi.fn(),
      save: vi.fn(),
    };
    mockEventBus = { publishAll: vi.fn() };
    useCase = new CreateProductUseCase(mockProductRepo, mockEventBus);
  });

  it('should create a product successfully', async () => {
    mockProductRepo.findBySku.mockResolvedValue(null); // SKU no existe

    const result = await useCase.execute({
      sku: 'NEW-001',
      name: 'New Product',
      unitPrice: 29.99,
      categoryId: 'cat-123',
    });

    expect(result.isSuccess).toBe(true);
    expect(mockProductRepo.save).toHaveBeenCalledOnce();
    expect(mockEventBus.publishAll).toHaveBeenCalledOnce();
  });

  it('should fail when SKU already exists', async () => {
    mockProductRepo.findBySku.mockResolvedValue(createTestProduct()); // SKU ya existe

    const result = await useCase.execute({
      sku: 'EXISTING-001',
      name: 'Product',
      unitPrice: 10,
      categoryId: 'cat-123',
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('already exists');
    expect(mockProductRepo.save).not.toHaveBeenCalled();
  });
});
```

## Integration Tests — API Endpoints

```typescript
// tests/integration/inventory/products.api.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { PrismaClient } from '@prisma/client';
import { createTestUser, generateAuthToken } from '@tests/helpers/auth';

describe('Products API', () => {
  let app: Express.Application;
  let prisma: PrismaClient;
  let authToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
    app = await createApp({ prisma });
    const user = await createTestUser(prisma, { role: 'admin' });
    authToken = generateAuthToken(user);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Limpiar tablas antes de cada test
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
  });

  describe('POST /v1/inventory/products', () => {
    it('should create a product', async () => {
      const category = await prisma.category.create({
        data: { name: 'Electronics', slug: 'electronics' },
      });

      const response = await request(app)
        .post('/v1/inventory/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sku: 'TEST-001',
          name: 'Test Product',
          unitPrice: 29.99,
          categoryId: category.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sku).toBe('TEST-001');

      // Verificar en BD
      const product = await prisma.product.findUnique({ where: { sku: 'TEST-001' } });
      expect(product).toBeTruthy();
      expect(product!.name).toBe('Test Product');
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .post('/v1/inventory/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '' }); // Missing required fields

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .post('/v1/inventory/products')
        .send({ sku: 'TEST', name: 'Test', unitPrice: 10, categoryId: 'cat-1' });

      expect(response.status).toBe(401);
    });

    it('should return 409 for duplicate SKU', async () => {
      const category = await prisma.category.create({
        data: { name: 'Cat', slug: 'cat' },
      });
      await prisma.product.create({
        data: { sku: 'DUP-001', name: 'Existing', unitPrice: 10, costPrice: 5, categoryId: category.id },
      });

      const response = await request(app)
        .post('/v1/inventory/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sku: 'DUP-001', name: 'New', unitPrice: 20, categoryId: category.id });

      expect(response.status).toBe(409);
    });
  });

  describe('GET /v1/inventory/products', () => {
    it('should return paginated products', async () => {
      // Seed 25 products
      const category = await prisma.category.create({ data: { name: 'Cat', slug: 'cat' } });
      await prisma.product.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          sku: `PROD-${String(i).padStart(3, '0')}`,
          name: `Product ${i}`,
          unitPrice: 10 + i,
          costPrice: 5,
          categoryId: category.id,
        })),
      });

      const response = await request(app)
        .get('/v1/inventory/products?page=1&pageSize=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.meta.pagination.total).toBe(25);
      expect(response.body.meta.pagination.totalPages).toBe(3);
    });

    it('should filter by search term', async () => {
      const category = await prisma.category.create({ data: { name: 'Cat', slug: 'cat2' } });
      await prisma.product.createMany({
        data: [
          { sku: 'LP-001', name: 'Laptop Dell', unitPrice: 800, costPrice: 500, categoryId: category.id },
          { sku: 'MS-001', name: 'Mouse Logitech', unitPrice: 25, costPrice: 10, categoryId: category.id },
        ],
      });

      const response = await request(app)
        .get('/v1/inventory/products?search=laptop')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Laptop Dell');
    });
  });
});
```

## Test Factories

```typescript
// tests/helpers/factories.ts
import { faker } from '@faker-js/faker';

export function createTestProduct(overrides: Partial<ProductProps> = {}): Product {
  return Product.create({
    sku: overrides.sku ?? faker.string.alphanumeric(8).toUpperCase(),
    name: overrides.name ?? faker.commerce.productName(),
    description: overrides.description ?? faker.commerce.productDescription(),
    unitPrice: overrides.unitPrice ?? faker.number.float({ min: 1, max: 1000, fractionDigits: 2 }),
    costPrice: overrides.costPrice ?? faker.number.float({ min: 0.5, max: 500, fractionDigits: 2 }),
    currentStock: overrides.currentStock ?? faker.number.int({ min: 0, max: 100 }),
    minimumStock: overrides.minimumStock ?? 5,
    categoryId: overrides.categoryId ?? faker.string.uuid(),
    ...overrides,
  }).value;
}

export function createTestOrder(overrides: Partial<OrderProps> = {}) {
  return {
    orderNumber: overrides.orderNumber ?? `ORD-${faker.string.numeric(6)}`,
    customerId: overrides.customerId ?? faker.string.uuid(),
    status: overrides.status ?? 'DRAFT',
    items: overrides.items ?? [
      {
        productId: faker.string.uuid(),
        productName: faker.commerce.productName(),
        quantity: faker.number.int({ min: 1, max: 10 }),
        unitPrice: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
        taxRate: 16,
      },
    ],
    ...overrides,
  };
}
```

## Scripts de Testing

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --reporter=junit --outputFile=test-results.xml"
  }
}
```

## Qué Testear (y Qué No)

| ✅ Testear | ❌ No testear |
|-----------|-------------|
| Entidades de dominio (validaciones, lógica) | Getters/setters simples |
| Use cases (flujo de orquestación) | Código del framework (Express, Prisma) |
| Validaciones de DTOs (Zod schemas) | Tipos de TypeScript |
| Endpoints de API (request → response) | CSS/estilos |
| Cálculos financieros (impuestos, totales) | Librerías de terceros |
| Flujos críticos E2E (login, compra) | Cada componente UI trivial |
