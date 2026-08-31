---
name: audit-trail
description: >
  Sistema completo de auditoría y trazabilidad para ERP empresariales. Cubre registro automático de
  todas las acciones del sistema (quién, qué, cuándo, dónde), historial de cambios por entidad con
  diff de valores, compliance regulatorio, consultas de auditoría eficientes, y retención de datos.
  Usa esta skill SIEMPRE que necesites implementar auditoría, registrar cambios, crear historial de
  modificaciones, o cumplir con requisitos de trazabilidad. Se activa con "auditoría", "audit",
  "historial de cambios", "trazabilidad", "quién modificó", "log de actividad", "compliance",
  "registro de acciones", o cualquier referencia a auditoría y seguimiento de cambios.
---

# Audit Trail — Sistemas ERP

Sistema de auditoría completo para trazabilidad de todas las operaciones del sistema.

## Principio Fundamental

> En un ERP, **cada acción de negocio debe ser rastreable**: quién la hizo, cuándo, qué cambió, y desde dónde.

## Middleware de Auditoría Automática

```typescript
// src/shared/infrastructure/middleware/audit.middleware.ts
import { PrismaService } from '../database/prisma.service';

export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    action: AuditAction;
    module: string;
    entityType: string;
    entityId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        module: params.module,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.parse(JSON.stringify(params.oldValues)) : undefined,
        newValues: params.newValues ? JSON.parse(JSON.stringify(params.newValues)) : undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }

  // Diff automático entre valores anteriores y nuevos
  computeDiff(oldValues: Record<string, unknown>, newValues: Record<string, unknown>): ChangeDiff[] {
    const changes: ChangeDiff[] = [];

    for (const key of new Set([...Object.keys(oldValues), ...Object.keys(newValues)])) {
      const oldVal = oldValues[key];
      const newVal = newValues[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field: key, oldValue: oldVal, newValue: newVal });
      }
    }

    return changes;
  }
}

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' |
  'EXPORT' | 'IMPORT' | 'APPROVE' | 'REJECT' | 'STATUS_CHANGE' |
  'STOCK_ADJUSTMENT' | 'PRICE_CHANGE' | 'PAYMENT';
```

## Prisma Middleware para Auditoría Automática

```typescript
// Interceptar TODAS las operaciones de escritura automáticamente
export function setupAuditMiddleware(prisma: PrismaService, auditService: AuditService) {
  // Modelos que requieren auditoría
  const auditedModels = [
    'Product', 'Order', 'Invoice', 'Customer', 'Supplier',
    'PurchaseOrder', 'Employee', 'User', 'Role',
  ];

  // Módulo por modelo
  const moduleMap: Record<string, string> = {
    Product: 'inventory', Order: 'sales', Invoice: 'sales',
    Customer: 'crm', Supplier: 'purchasing', PurchaseOrder: 'purchasing',
    Employee: 'hr', User: 'auth', Role: 'auth',
  };

  prisma.$use(async (params, next) => {
    if (!auditedModels.includes(params.model ?? '')) {
      return next(params);
    }

    const model = params.model!;
    const module = moduleMap[model] ?? 'system';

    // CREAR
    if (params.action === 'create') {
      const result = await next(params);
      await auditService.log({
        userId: getCurrentUserId(),
        action: 'CREATE',
        module,
        entityType: model.toLowerCase(),
        entityId: result.id,
        newValues: sanitizeForAudit(result),
        ipAddress: getCurrentIpAddress(),
      });
      return result;
    }

    // ACTUALIZAR
    if (params.action === 'update') {
      // Capturar valores anteriores ANTES del update
      const oldRecord = await prisma[model.charAt(0).toLowerCase() + model.slice(1)]
        .findUnique({ where: params.args.where });

      const result = await next(params);

      if (oldRecord) {
        const changes = auditService.computeDiff(
          sanitizeForAudit(oldRecord),
          sanitizeForAudit(result),
        );

        if (changes.length > 0) {
          await auditService.log({
            userId: getCurrentUserId(),
            action: 'UPDATE',
            module,
            entityType: model.toLowerCase(),
            entityId: result.id,
            oldValues: Object.fromEntries(changes.map(c => [c.field, c.oldValue])),
            newValues: Object.fromEntries(changes.map(c => [c.field, c.newValue])),
            ipAddress: getCurrentIpAddress(),
          });
        }
      }

      return result;
    }

    // ELIMINAR (soft delete)
    if (params.action === 'delete') {
      const oldRecord = await prisma[model.charAt(0).toLowerCase() + model.slice(1)]
        .findUnique({ where: params.args.where });

      const result = await next(params);

      if (oldRecord) {
        await auditService.log({
          userId: getCurrentUserId(),
          action: 'DELETE',
          module,
          entityType: model.toLowerCase(),
          entityId: oldRecord.id,
          oldValues: sanitizeForAudit(oldRecord),
          ipAddress: getCurrentIpAddress(),
        });
      }

      return result;
    }

    return next(params);
  });
}

// Excluir campos sensibles del log de auditoría
function sanitizeForAudit(record: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['passwordHash', 'token', 'refreshToken', 'mfaSecret'];
  const sanitized = { ...record };
  for (const field of sensitiveFields) {
    if (field in sanitized) sanitized[field] = '[REDACTED]';
  }
  return sanitized;
}
```

## Consultas de Auditoría

```typescript
// src/modules/audit/application/audit-query.service.ts
export class AuditQueryService {
  // Historial de cambios de una entidad
  async getEntityHistory(entityType: string, entityId: string): Promise<AuditEntry[]> {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // Actividad de un usuario
  async getUserActivity(userId: string, dateRange?: DateRange): Promise<AuditEntry[]> {
    return this.prisma.auditLog.findMany({
      where: {
        userId,
        ...(dateRange && {
          createdAt: { gte: dateRange.from, lte: dateRange.to },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // Actividad por módulo
  async getModuleActivity(module: string, filters: AuditFilters): Promise<PaginatedResult<AuditEntry>> {
    const where = {
      module,
      ...(filters.action && { action: filters.action }),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.dateFrom && { createdAt: { gte: filters.dateFrom } }),
      ...(filters.dateTo && { createdAt: { lte: filters.dateTo } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: filters.offset,
        take: filters.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page: filters.page, pageSize: filters.limit };
  }

  // Cambios recientes en una entidad (para mostrar en el detalle)
  async getRecentChanges(entityType: string, entityId: string, limit = 5) {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType, entityId, action: { in: ['UPDATE', 'STATUS_CHANGE'] } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map(log => ({
      user: `${log.user?.firstName} ${log.user?.lastName}`,
      action: log.action,
      changes: log.oldValues && log.newValues
        ? this.auditService.computeDiff(log.oldValues as any, log.newValues as any)
        : [],
      timestamp: log.createdAt,
    }));
  }
}
```

## Componente UI — Timeline de Auditoría

```tsx
// components/AuditTimeline.tsx
function AuditTimeline({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['audit', entityType, entityId],
    queryFn: () => auditApi.getEntityHistory(entityType, entityId),
  });

  if (isLoading) return <Skeleton />;

  return (
    <div className="audit-timeline">
      <h3>Historial de Cambios</h3>
      {history?.map((entry) => (
        <div key={entry.id} className="timeline-item">
          <div className="timeline-dot" data-action={entry.action} />
          <div className="timeline-content">
            <div className="timeline-header">
              <strong>{entry.user?.firstName} {entry.user?.lastName}</strong>
              <span className="action-badge">{translateAction(entry.action)}</span>
              <time>{formatRelative(entry.createdAt)}</time>
            </div>
            {entry.oldValues && entry.newValues && (
              <div className="changes-diff">
                {computeDiff(entry.oldValues, entry.newValues).map(change => (
                  <div key={change.field} className="diff-row">
                    <span className="field-name">{translateField(change.field)}</span>
                    <span className="old-value">{formatValue(change.oldValue)}</span>
                    <span className="arrow">→</span>
                    <span className="new-value">{formatValue(change.newValue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Uso en página de detalle de producto
function ProductDetail({ id }: { id: string }) {
  return (
    <div className="product-detail">
      <ProductForm product={product} />
      {/* Tab de auditoría */}
      <Tabs>
        <Tab label="Información">...</Tab>
        <Tab label="Historial">
          <AuditTimeline entityType="product" entityId={id} />
        </Tab>
      </Tabs>
    </div>
  );
}
```

## Retención y Performance

```sql
-- Particionamiento por fecha para tablas de auditoría grandes
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ...
) PARTITION BY RANGE (created_at);

-- Particiones mensuales
CREATE TABLE audit_logs_2025_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Política de retención: archivar logs > 2 años
-- Job mensual que mueve a tabla de archivo o elimina
```

## Qué Auditar vs Qué No

| ✅ Auditar | ❌ No auditar |
|-----------|-------------|
| CRUD de entidades de negocio | Lecturas (GET) |
| Cambios de estado (orden confirmada) | Queries de búsqueda |
| Login/logout | Health checks |
| Cambios de permisos/roles | Sesiones de heartbeat |
| Exportaciones de datos | Cache hits/misses |
| Ajustes de stock | Logging de debug |
| Cambios de precios | Métricas de performance |
| Aprobaciones/rechazos | Tareas de sistema internas |
