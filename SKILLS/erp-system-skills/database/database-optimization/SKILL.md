---
name: database-optimization
description: >
  Técnicas avanzadas de optimización de bases de datos PostgreSQL para sistemas ERP de alto rendimiento.
  Cubre índices compuestos, análisis de queries con EXPLAIN, particionamiento, caché con Redis, connection
  pooling, gestión de transacciones y estrategias de consultas eficientes. Usa esta skill SIEMPRE que
  necesites optimizar consultas lentas, mejorar el rendimiento de la base de datos, implementar caché,
  configurar connection pooling, o resolver problemas de performance. Se activa con "query lenta",
  "optimizar consultas", "índices", "EXPLAIN", "Redis cache", "connection pool", "performance de BD",
  "N+1 queries", o cualquier referencia a optimización de base de datos.
---

# Database Optimization — PostgreSQL para ERP

Guía avanzada de optimización de base de datos para sistemas empresariales con alto volumen de operaciones.

## Estrategia de Índices

### Reglas de Oro

1. **Siempre indexa Foreign Keys** — Prisma no lo hace automáticamente
2. **Indexa columnas de filtro frecuente** — status, isActive, createdAt
3. **Índices compuestos > múltiples índices simples** — cuando se filtran juntos
4. **El orden de columnas importa** — La columna más selectiva primero

### Índices Esenciales para ERP

```sql
-- Productos: búsqueda y filtros
CREATE INDEX idx_products_category_active ON products (category_id, is_active);
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);  -- Full-text search

-- Órdenes: filtros por estado y fecha
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX idx_orders_customer_status ON orders (customer_id, status);

-- Stock movements: auditoría y reportes
CREATE INDEX idx_stock_movements_product_date ON stock_movements (product_id, created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements (reference_type, reference_id);

-- Auditoría: consultas frecuentes
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_date ON audit_logs (user_id, created_at DESC);

-- Facturas: vencimientos
CREATE INDEX idx_invoices_due_status ON invoices (due_date, status) WHERE status IN ('SENT', 'OVERDUE');
```

### Índices Parciales (Partial Indexes)
Solo indexan filas que cumplen una condición. Ideales para ERP donde la mayoría de consultas filtran por estado activo:

```sql
-- Solo indexa productos activos (90% de las consultas)
CREATE INDEX idx_products_active_search ON products (name, sku)
  WHERE is_active = true AND deleted_at IS NULL;

-- Solo facturas pendientes (las más consultadas)
CREATE INDEX idx_invoices_pending ON invoices (due_date, customer_id)
  WHERE status IN ('SENT', 'OVERDUE') AND deleted_at IS NULL;
```

## Análisis de Queries con EXPLAIN

### Cómo leer EXPLAIN ANALYZE

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.*, c.name as customer_name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'CONFIRMED'
  AND o.created_at >= NOW() - INTERVAL '30 days'
ORDER BY o.created_at DESC
LIMIT 20;
```

### Señales de Alerta

| Señal | Significado | Solución |
|-------|-------------|----------|
| `Seq Scan` en tabla grande | Escaneo completo de tabla | Agregar índice |
| `Nested Loop` con tabla grande | Joins ineficientes | Verificar índices en FK |
| `Sort` con mucha memoria | Ordenamiento sin índice | Crear índice con el orden correcto |
| `Buffers: shared read` alto | Muchas lecturas de disco | Más RAM o mejor índice |
| `Rows Removed by Filter` alto | Índice no selectivo | Índice compuesto o parcial |

### Implementación en Prisma

```typescript
// Middleware para log de queries lentas
prisma.$use(async (params, next) => {
  const start = performance.now();
  const result = await next(params);
  const duration = performance.now() - start;

  if (duration > 200) { // Más de 200ms = query lenta
    logger.warn('Slow query detected', {
      model: params.model,
      action: params.action,
      args: JSON.stringify(params.args),
      duration: `${duration.toFixed(2)}ms`,
    });
  }

  return result;
});
```

## Resolver el Problema N+1

El error más común en aplicaciones con ORM. Ocurre cuando cargas una lista y luego haces una query adicional por cada elemento.

```typescript
// ❌ MALO — N+1 queries
const orders = await prisma.order.findMany({ where: { status: 'CONFIRMED' } });
for (const order of orders) {
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  // 1 query por la lista + N queries por los items
}

// ✅ BUENO — 1 query con include
const orders = await prisma.order.findMany({
  where: { status: 'CONFIRMED' },
  include: {
    items: { include: { product: { select: { id: true, name: true, sku: true } } } },
    customer: { select: { id: true, name: true, email: true } },
  },
});

// ✅ TAMBIÉN BUENO — 2 queries separadas si el include es demasiado grande
const orders = await prisma.order.findMany({ where: { status: 'CONFIRMED' } });
const orderIds = orders.map(o => o.id);
const items = await prisma.orderItem.findMany({
  where: { orderId: { in: orderIds } },
  include: { product: true },
});
// Agrupar items por orderId en memoria (mucho más rápido que N queries)
const itemsByOrder = Map.groupBy(items, i => i.orderId);
```

## Caché con Redis

### Estrategia de Caché para ERP

```typescript
import Redis from 'ioredis';

class CacheService {
  private redis: Redis;
  private defaultTTL = 300; // 5 minutos

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  // Patrón Cache-Aside (más común para ERP)
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    // 1. Intentar cache
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    // 2. Si no hay cache, buscar en BD
    const data = await fetcher();

    // 3. Guardar en cache
    await this.redis.setex(key, ttl ?? this.defaultTTL, JSON.stringify(data));

    return data;
  }

  // Invalidar cache cuando se modifica el dato
  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Invalidación por tags (más eficiente)
  async invalidateByTag(tag: string): Promise<void> {
    await this.invalidate(`*:${tag}:*`);
  }
}

// Uso en un servicio
class ProductService {
  async findById(id: string): Promise<Product | null> {
    return this.cache.getOrSet(
      `product:${id}`,
      () => this.productRepository.findById(id),
      600, // 10 minutos para productos (cambian poco)
    );
  }

  async update(id: string, data: UpdateProductDTO): Promise<Product> {
    const product = await this.productRepository.update(id, data);
    // Invalidar todos los caches relacionados con este producto
    await this.cache.invalidate(`product:${id}`);
    await this.cache.invalidateByTag('product-list'); // Listas que incluyen este producto
    return product;
  }
}
```

### Qué Cachear en un ERP

| Dato | TTL | Razón |
|------|-----|-------|
| Catálogo de productos | 10 min | Cambia poco, se consulta mucho |
| Configuración del sistema | 30 min | Casi nunca cambia |
| Permisos del usuario | 5 min | Crítico pero cambia poco |
| Tasas de impuesto | 1 hora | Cambian raramente |
| Dashboard KPIs | 2 min | Necesitan estar relativamente frescos |
| Listas de precios | 15 min | Se consultan frecuentemente |

### Qué NO Cachear

- **Stock actual** — Debe ser siempre real-time (consulta directa a BD)
- **Saldos de clientes** — Datos financieros críticos
- **Sesiones activas** — Usa Redis directamente como store, no como cache
- **Datos en proceso de edición** — Race conditions

## Connection Pooling

### Configuración con PgBouncer

```yaml
# docker-compose.yml
services:
  pgbouncer:
    image: bitnami/pgbouncer:latest
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      POSTGRESQL_USERNAME: ${DB_USER}
      POSTGRESQL_PASSWORD: ${DB_PASS}
      POSTGRESQL_DATABASE: ${DB_NAME}
      PGBOUNCER_POOL_MODE: transaction    # Recomendado para ERP
      PGBOUNCER_DEFAULT_POOL_SIZE: 20
      PGBOUNCER_MAX_CLIENT_CONN: 200
      PGBOUNCER_MIN_POOL_SIZE: 5
    ports:
      - "6432:6432"
```

### Prisma con Connection Pool

```
# .env
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/erp_db?pgbouncer=true&connection_limit=10"
```

## Transacciones

### Reglas para Transacciones en ERP

```typescript
// Las operaciones financieras y de stock SIEMPRE en transacción
async function createOrder(dto: CreateOrderDTO): Promise<Order> {
  return prisma.$transaction(async (tx) => {
    // 1. Crear la orden
    const order = await tx.order.create({ data: { ... } });

    // 2. Crear los items
    await tx.orderItem.createMany({ data: dto.items.map(item => ({ ... })) });

    // 3. Descontar stock (DENTRO de la misma transacción)
    for (const item of dto.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.currentStock < item.quantity) {
        throw new Error(`Stock insuficiente para ${product?.name}`);
        // La transacción hace rollback automático
      }
      await tx.product.update({
        where: { id: item.productId },
        data: { currentStock: { decrement: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          warehouseId: dto.warehouseId,
          type: 'OUT',
          quantity: -item.quantity,
          previousStock: product.currentStock,
          newStock: product.currentStock - item.quantity,
          reason: `Order ${order.orderNumber}`,
          referenceType: 'ORDER',
          referenceId: order.id,
        },
      });
    }

    // 4. Actualizar saldo del cliente
    await tx.customer.update({
      where: { id: dto.customerId },
      data: { currentBalance: { increment: order.total } },
    });

    return order;
  }, {
    maxWait: 5000,     // Máximo 5s esperando conexión
    timeout: 10000,    // Máximo 10s de ejecución
    isolationLevel: 'Serializable', // Para operaciones financieras
  });
}
```

## Paginación Eficiente

### Cursor-based Pagination (recomendada para listas largas)

```typescript
async function findProducts(params: {
  cursor?: string;
  limit: number;
  search?: string;
}) {
  const products = await prisma.product.findMany({
    take: params.limit + 1, // +1 para saber si hay más
    ...(params.cursor && {
      cursor: { id: params.cursor },
      skip: 1, // Saltar el cursor actual
    }),
    where: {
      isActive: true,
      deletedAt: null,
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { sku: { contains: params.search, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = products.length > params.limit;
  const items = hasMore ? products.slice(0, -1) : products;

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
    hasMore,
  };
}
```

## Anti-patrones de Performance

| ❌ Anti-patrón | ✅ Correcto | Impacto |
|---|---|---|
| `SELECT *` | `select: { id, name, sku }` | Reduce transferencia de datos |
| N+1 queries | `include` o batch queries | De N+1 queries a 1-2 |
| Sin paginación | Cursor-based pagination | Previene timeouts |
| Count en tabla de millones | Usar HyperLogLog o cache | Count es O(n) en PostgreSQL |
| Transacciones de larga duración | Transacciones cortas y focalizadas | Evita deadlocks |
| Queries en loops | Batch operations (`createMany`, `IN`) | Reduce round-trips |
