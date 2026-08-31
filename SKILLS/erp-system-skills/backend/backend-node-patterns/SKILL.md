---
name: backend-node-patterns
description: >
  Patrones profesionales de desarrollo backend con Node.js y TypeScript para sistemas ERP.
  Cubre Express/NestJS middleware pipeline, dependency injection, validación con Zod, DTOs y
  transformadores, logging estructurado, health checks, graceful shutdown y patrones de servicios.
  Usa esta skill SIEMPRE que estés escribiendo lógica de backend, configurando middleware,
  implementando servicios, validando datos de entrada, o estructurando la capa de servidor.
  Se activa con "middleware", "servicio", "controller", "validación Zod", "DTO", "logging",
  "health check", "graceful shutdown", "dependency injection", "Express", "NestJS", o cualquier
  referencia al desarrollo backend con Node.js.
---

# Backend Node.js Patterns — Sistemas ERP

Patrones de desarrollo backend robustos y escalables para aplicaciones empresariales con Node.js y TypeScript.

## Bootstrap de la Aplicación

```typescript
// src/server.ts
import { createApp } from './app';
import { envConfig } from '@shared/infrastructure/config/env.config';
import { logger } from '@shared/infrastructure/services/logger.service';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';

async function bootstrap() {
  const prisma = new PrismaService();

  // Verificar conexión a BD antes de iniciar
  await prisma.$connect();
  logger.info('Database connected');

  const app = await createApp({ prisma });
  const port = envConfig.PORT;

  const server = app.listen(port, () => {
    logger.info(`Server running on port ${port}`, {
      env: envConfig.NODE_ENV,
      version: envConfig.APP_VERSION,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Server shut down complete');
      process.exit(0);
    });

    // Forzar cierre después de 30 segundos
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

## Configuración con Variables de Entorno

```typescript
// src/shared/infrastructure/config/env.config.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_VERSION: z.string().default('0.0.0'),

  // Base de datos
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Storage
  STORAGE_BUCKET: z.string().optional(),

  // Frontend
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
});

// Validar al iniciar — falla temprano si falta config
const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const envConfig = parsed.data;
export type EnvConfig = z.infer<typeof EnvSchema>;
```

## Middleware Pipeline

El orden de los middleware es crucial. Sigue esta secuencia:

```typescript
// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

export async function createApp({ prisma }: AppDependencies) {
  const app = express();

  // ─── 1. Seguridad ───
  app.use(helmet());
  app.use(cors({ origin: envConfig.FRONTEND_URL, credentials: true }));

  // ─── 2. Parsing ───
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(compression());

  // ─── 3. Request ID y Logging ───
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // ─── 4. Rate Limiting ───
  app.use(globalRateLimiter);

  // ─── 5. Health Check (antes de auth) ───
  app.get('/health', healthCheckHandler(prisma));
  app.get('/ready', readinessHandler(prisma));

  // ─── 6. Rutas de la API ───
  app.use('/v1/auth', authRoutes(prisma));
  app.use('/v1/inventory', authMiddleware, inventoryRoutes(prisma));
  app.use('/v1/sales', authMiddleware, salesRoutes(prisma));
  // ... más módulos

  // ─── 7. Documentación API ───
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // ─── 8. Error Handling (siempre al final) ───
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}
```

### Middleware de Request ID

```typescript
// Cada request tiene un ID único para tracing
import { randomUUID } from 'crypto';

export function requestIdMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] ?? randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}
```

### Middleware de Logging

```typescript
export function requestLoggerMiddleware(req, res, next) {
  const start = performance.now();

  res.on('finish', () => {
    const duration = performance.now() - start;
    logger.info('HTTP Request', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration.toFixed(2)}ms`,
      userId: req.user?.id,
      ip: req.ip,
    });
  });

  next();
}
```

## Validación con Zod

### DTOs con Validación Automática

```typescript
// src/modules/inventory/application/dtos/create-product.dto.ts
import { z } from 'zod';

export const CreateProductSchema = z.object({
  sku: z.string()
    .min(3, 'SKU debe tener al menos 3 caracteres')
    .max(50)
    .regex(/^[A-Z0-9-]+$/, 'SKU solo permite letras mayúsculas, números y guiones'),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  unitPrice: z.number().positive('El precio debe ser mayor a 0'),
  costPrice: z.number().min(0).optional().default(0),
  minimumStock: z.number().int().min(0).optional().default(0),
  maximumStock: z.number().int().min(0).optional(),
  categoryId: z.string().uuid('ID de categoría inválido'),
  brandId: z.string().uuid().optional(),
  barcode: z.string().max(50).optional(),
  unitOfMeasure: z.enum(['UNIT', 'KG', 'LT', 'MT', 'BOX']).default('UNIT'),
});

export type CreateProductDTO = z.infer<typeof CreateProductSchema>;
```

### Middleware de Validación

```typescript
// src/shared/infrastructure/middleware/validate.middleware.ts
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req, res, next) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos de entrada inválidos',
            details: error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message,
              code: e.code,
            })),
          },
        });
      } else {
        next(error);
      }
    }
  };
}

// Uso en rutas
router.post('/', validate(CreateProductSchema), productController.create);
router.get('/', validate(ProductFiltersSchema, 'query'), productController.findAll);
```

## Patrón Controller → Service → Repository

### Controller (capa HTTP)

```typescript
// Solo parsea request, llama al service, y formatea response
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.productService.create(req.body, req.user.id);
      if (result.isFailure) {
        return res.status(422).json({
          success: false,
          error: { code: 'BUSINESS_ERROR', message: result.error },
        });
      }
      res.status(201).json({ success: true, data: result.value });
    } catch (error) {
      next(error);
    }
  };

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.productService.findAll(req.query);
      res.json({ success: true, data: result.items, meta: { pagination: result.pagination } });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await this.productService.findById(req.params.id);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Producto no encontrado' },
        });
      }
      res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  };
}
```

## Logging Estructurado

```typescript
// src/shared/infrastructure/services/logger.service.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  base: {
    service: 'erp-api',
    version: process.env.APP_VERSION,
    env: process.env.NODE_ENV,
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
  },
});

// Uso en el código
logger.info('Product created', { productId: product.id, sku: product.sku, userId });
logger.warn('Low stock alert', { productId, currentStock, minimumStock });
logger.error('Failed to process order', { orderId, error: err.message, stack: err.stack });
```

## Health Checks

```typescript
export function healthCheckHandler(prisma: PrismaService) {
  return async (req, res) => {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks: {
        database: 'unknown',
        redis: 'unknown',
      },
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.checks.database = 'healthy';
    } catch {
      checks.checks.database = 'unhealthy';
      checks.status = 'degraded';
    }

    const statusCode = checks.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(checks);
  };
}
```

## Dependency Injection Manual

```typescript
// src/modules/inventory/infrastructure/routes/inventory.routes.ts
import { Router } from 'express';

export function inventoryRoutes(prisma: PrismaService): Router {
  const router = Router();

  // Crear dependencias (composición manual, sin framework DI)
  const productRepository = new PrismaProductRepository(prisma);
  const eventBus = new InMemoryEventBus();
  const cacheService = new RedisCacheService();

  const createProductUseCase = new CreateProductUseCase(productRepository, eventBus);
  const findProductsUseCase = new FindProductsUseCase(productRepository, cacheService);
  const productService = new ProductService(createProductUseCase, findProductsUseCase);
  const productController = new ProductController(productService);

  // Rutas
  router.get('/', validate(ProductFiltersSchema, 'query'), productController.findAll);
  router.get('/:id', productController.findById);
  router.post('/', requirePermission('inventory', 'create'), validate(CreateProductSchema), productController.create);
  router.patch('/:id', requirePermission('inventory', 'update'), validate(UpdateProductSchema), productController.update);
  router.delete('/:id', requirePermission('inventory', 'delete'), productController.delete);

  return router;
}
```

## Anti-patrones

| ❌ Anti-patrón | ✅ Correcto | Razón |
|---|---|---|
| Lógica de negocio en controller | Lógica en service/use-case | Separación de responsabilidades |
| `try/catch` en cada controller | Error handler global | DRY, consistencia |
| `console.log` | Logger estructurado (pino) | Trazabilidad, niveles, JSON |
| `process.env.X` directo | Config validada con Zod | Falla temprano, tipado |
| `any` en TypeScript | Tipos estrictos | Seguridad de tipos |
| Sin request ID | UUID por request | Debugging, tracing |
| Kill abrupto del servidor | Graceful shutdown | No perder operaciones en vuelo |
