---
name: error-handling-logging
description: >
  Sistema completo de manejo de errores y logging para ERP empresariales. Cubre error handling
  global en backend y frontend, error boundaries en React, logging estructurado con Pino,
  clasificación de errores (operacionales vs programáticos), retry patterns, monitoreo con Sentry,
  health endpoints, y alertas automáticas. Usa esta skill SIEMPRE que necesites manejar errores,
  configurar logging, implementar monitoreo, o mejorar la observabilidad del sistema. Se activa
  con "error", "error handling", "logging", "Sentry", "monitoreo", "retry", "error boundary",
  "crash", "exception", "alerta", o cualquier referencia a manejo de errores y observabilidad.
---

# Error Handling & Logging — Sistemas ERP

Sistema robusto de manejo de errores, logging y observabilidad para aplicaciones empresariales.

## Clasificación de Errores

| Tipo | Ejemplo | Cómo manejar |
|------|---------|--------------|
| **Operacional** | Validación fallida, recurso no encontrado, timeout | Return error al cliente con mensaje útil |
| **Programático** | TypeError, null reference, error de lógica | Log + alerta + 500 genérico al cliente |
| **De negocio** | Stock insuficiente, crédito excedido | Return 422 con código y mensaje específico |
| **De infraestructura** | BD caída, Redis no disponible | Retry + fallback + alerta |

## Error Classes

```typescript
// src/shared/domain/errors.ts

// Base para todos los errores de la aplicación
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly isOperational: boolean = true;

  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 — Datos inválidos
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string, public readonly fieldErrors?: FieldError[]) {
    super(message, fieldErrors);
  }
}

// 401 — No autenticado
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';
}

// 403 — Sin permisos
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
}

// 404 — No encontrado
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(resource: string, id?: string) {
    super(id ? `${resource} con ID ${id} no encontrado` : `${resource} no encontrado`);
  }
}

// 409 — Conflicto (duplicado)
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
}

// 422 — Error de negocio
export class BusinessError extends AppError {
  readonly statusCode = 422;

  constructor(
    public readonly code: string,
    message: string,
    details?: unknown,
  ) {
    super(message, details);
  }
}

// Errores de negocio específicos del ERP
export class InsufficientStockError extends BusinessError {
  constructor(productId: string, available: number, requested: number) {
    super(
      'INSUFFICIENT_STOCK',
      `Stock insuficiente. Disponible: ${available}, solicitado: ${requested}`,
      { productId, available, requested },
    );
  }
}

export class CreditLimitExceededError extends BusinessError {
  constructor(customerId: string, limit: number, currentBalance: number) {
    super(
      'CREDIT_LIMIT_EXCEEDED',
      `Límite de crédito excedido. Límite: ${limit}, saldo actual: ${currentBalance}`,
      { customerId, limit, currentBalance },
    );
  }
}
```

## Global Error Handler

```typescript
// src/shared/infrastructure/middleware/error-handler.middleware.ts
import { logger } from '../services/logger.service';

export function globalErrorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  // Error operacional conocido (AppError)
  if (err instanceof AppError) {
    // Solo loguear como warning (errores esperados)
    logger.warn('Operational error', {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      requestId: req.id,
      url: req.originalUrl,
      method: req.method,
      userId: req.user?.userId,
    });

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.id,
      },
    });
  }

  // Error de Zod (validación)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: err.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
        requestId: req.id,
      },
    });
  }

  // Error de Prisma
  if (err.code === 'P2002') { // Unique constraint
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'El registro ya existe',
        requestId: req.id,
      },
    });
  }

  // Error inesperado (programático) — NUNCA exponer detalles al cliente
  logger.error('Unexpected error', {
    error: err.message,
    stack: err.stack,
    requestId: req.id,
    url: req.originalUrl,
    method: req.method,
    userId: req.user?.userId,
    body: req.body,
  });

  // Reportar a Sentry
  Sentry?.captureException(err, { extra: { requestId: req.id, userId: req.user?.userId } });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ha ocurrido un error interno. Por favor intenta de nuevo.',
      requestId: req.id,
    },
  });
}
```

## Logging Estructurado

```typescript
// src/shared/infrastructure/services/logger.service.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'erp-api',
    version: process.env.APP_VERSION,
    env: process.env.NODE_ENV,
  },
  // Pretty print solo en desarrollo
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
  // Redactar datos sensibles automáticamente
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', 'token', 'refreshToken', 'creditCard'],
    censor: '[REDACTED]',
  },
});

// Child loggers para módulos
export const inventoryLogger = logger.child({ module: 'inventory' });
export const salesLogger = logger.child({ module: 'sales' });
export const authLogger = logger.child({ module: 'auth' });
```

### Niveles de Log — Cuándo Usar Cada Uno

| Nivel | Cuándo |
|-------|--------|
| `fatal` | La aplicación no puede continuar. Crash inminente |
| `error` | Error inesperado que requiere atención. Excepciones no manejadas |
| `warn` | Algo no está bien pero la operación continúa. Errores de negocio esperados |
| `info` | Eventos significativos del negocio. Acciones de usuario |
| `debug` | Información de debugging. Datos de queries, payloads |
| `trace` | Información extremadamente detallada. Solo en desarrollo |

## Error Boundaries — Frontend (React)

```tsx
// components/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Reportar a servicio de monitoreo
    console.error('UI Error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="error-fallback">
          <h2>Algo salió mal</h2>
          <p>Ha ocurrido un error inesperado. Por favor recarga la página.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Intentar de nuevo
          </button>
          <button onClick={() => window.location.reload()}>Recargar página</button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Uso: envolver cada módulo independientemente
function App() {
  return (
    <ErrorBoundary fallback={<FullPageError />}>
      <Layout>
        <ErrorBoundary fallback={<ModuleError />}>
          <Outlet />
        </ErrorBoundary>
      </Layout>
    </ErrorBoundary>
  );
}
```

## Retry Pattern

```typescript
// src/shared/utils/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; initialDelay?: number; maxDelay?: number } = {},
): Promise<T> {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5); // Add jitter

      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries}`, {
        delay: `${jitter.toFixed(0)}ms`,
        error: error.message,
      });

      await new Promise(resolve => setTimeout(resolve, jitter));
    }
  }

  throw new Error('Unreachable');
}

// Uso
const data = await retryWithBackoff(() => externalApi.fetchData(), { maxRetries: 3 });
```

## Monitoreo con Sentry

```typescript
// src/shared/infrastructure/monitoring/sentry.ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.APP_VERSION,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      Sentry.prismaIntegration(),
    ],
    // No reportar errores operacionales (son esperados)
    beforeSend(event) {
      if (event.extra?.isOperational) return null;
      return event;
    },
  });
}
```

## Checklist de Observabilidad

- [ ] Global error handler para errores 500
- [ ] Logging estructurado (JSON) con niveles correctos
- [ ] Request ID en cada log para tracing
- [ ] Datos sensibles redactados en logs
- [ ] Error boundaries en frontend (por módulo)
- [ ] Sentry (o similar) para errores en producción
- [ ] Health check endpoint (`/health`)
- [ ] Métricas de latencia por endpoint
- [ ] Alertas en errores 5xx y jobs fallidos
- [ ] Dashboard de logs accesible

### 🧠 HUMAN-LIKE THINKING & EXPERT EXECUTION DIRECTIVES
- **STOP BEING GENERIC**: Writing `console.log(error)` or returning `{ error: "Algo salió mal" }` is junior-level boilerplate. Think like an SRE (Site Reliability Engineer).
- **Graceful Degradation**: If a service fails, the whole app shouldn't crash. Fallback to cached data, disable specific buttons, and guide the user.
- **Actionable Errors**: Never show a raw technical error to a user. Translate DB constraint errors into "Este producto ya existe" instead of "P2002 Unique Constraint Failed".
- **Self-Healing Systems**: Implement Exponential Backoff and Retries for transient network errors before giving up.
- **Observability context**: A log without context is useless. Inject requestId, userId, and action context into every error automatically.
