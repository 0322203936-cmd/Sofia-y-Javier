# Catálogo Completo de Módulos ERP

## Tabla de Contenidos

1. [Configuración del Sistema](#configuración-del-sistema)
2. [Punto de Venta (POS)](#punto-de-venta-pos)
3. [Producción / Manufactura](#producción--manufactura)
4. [Multi-Sucursal](#multi-sucursal)
5. [Notificaciones](#notificaciones)
6. [Integraciones Externas](#integraciones-externas)

---

## Configuración del Sistema

### Entidades

| Entidad | Campos | Propósito |
|---------|--------|-----------|
| `Company` | id, name, legalName, taxId, logo, address, phone, email, website, currency, timezone, fiscalYearStart | Datos de la empresa |
| `Branch` | id, companyId, name, code, address, phone, isHeadquarters, isActive | Sucursales |
| `NumberSequence` | id, module, prefix, currentNumber, padLength, resetPeriod | Numeración automática (FAC-0001, OC-0001) |
| `Currency` | id, code, name, symbol, exchangeRate, isDefault | Multi-moneda |
| `UnitOfMeasure` | id, name, abbreviation, category (WEIGHT/LENGTH/VOLUME/UNIT), conversionFactor, baseUnitId | Unidades de medida |
| `SystemConfig` | id, key, value, type, module, label, description | Config dinámica del sistema |

### Funcionalidades
- Configuración de empresa y sucursales
- Secuencias de numeración automática por módulo
- Multi-moneda con tasas de cambio
- Unidades de medida con conversiones
- Configuración dinámica sin re-deploy

---

## Punto de Venta (POS)

### Entidades

| Entidad | Campos | Propósito |
|---------|--------|-----------|
| `POSTerminal` | id, name, branchId, cashierId, status (OPEN/CLOSED), openingBalance | Terminal de venta |
| `POSSession` | id, terminalId, userId, openedAt, closedAt, openingCash, closingCash, expectedCash, difference, status | Sesión de caja |
| `POSSale` | id, sessionId, saleNumber, customerId, items, subtotal, taxAmount, discountAmount, total, paymentMethod, status | Venta rápida |
| `CashMovement` | id, sessionId, type (CASH_IN/CASH_OUT/SALE/REFUND), amount, reason, reference | Movimiento de caja |

### Funcionalidades
- Interfaz de cobro rápida con búsqueda de productos
- Lectura de código de barras
- Múltiples métodos de pago (efectivo, tarjeta, mixto)
- Apertura y cierre de caja con cuadre
- Impresión de tickets
- Modo offline con sincronización

---

## Producción / Manufactura

### Entidades

| Entidad | Campos | Propósito |
|---------|--------|-----------|
| `BillOfMaterials` | id, productId, version, items, yield, isActive | Lista de materiales |
| `BOMItem` | id, bomId, materialProductId, quantity, unitOfMeasure, scrapRate | Material requerido |
| `WorkOrder` | id, woNumber, productId, bomId, quantity, scheduledStart, scheduledEnd, actualStart, actualEnd, status (PLANNED/IN_PROGRESS/COMPLETED/CANCELLED) | Orden de producción |
| `WorkCenter` | id, name, capacity, costPerHour, efficiency | Centro de trabajo |
| `RoutingStep` | id, workOrderId, workCenterId, sequence, operation, estimatedTime, actualTime, status | Paso de producción |

### Flujos
```
Planificación → Verificar materiales (BOM) → Reservar stock →
Crear Orden de Trabajo → Asignar a Centro de Trabajo →
Ejecutar pasos de ruta → Reportar producción →
Ingresar producto terminado → Actualizar inventario
```

---

## Multi-Sucursal

### Consideraciones
- Cada sucursal tiene su propio inventario (`WarehouseStock` por branch)
- Las ventas se registran por sucursal
- Los empleados pertenecen a una sucursal
- Las transferencias entre sucursales generan documentos de envío/recepción
- Los reportes se pueden filtrar por sucursal o consolidar
- Los permisos pueden restringir acceso por sucursal

### Patrón de Implementación
```typescript
// Middleware que inyecta el branchId del usuario actual
const branchScope = (req, res, next) => {
  req.branchId = req.user.currentBranchId;
  next();
};

// Todas las queries se filtran automáticamente
const products = await productRepository.findAll({
  ...filters,
  warehouseId: req.user.defaultWarehouseId,
});
```

---

## Notificaciones

### Entidades

| Entidad | Campos | Propósito |
|---------|--------|-----------|
| `Notification` | id, userId, type, title, message, data (JSON), readAt, channel (IN_APP/EMAIL/SMS/PUSH), sentAt | Notificación al usuario |
| `NotificationTemplate` | id, code, subject, bodyTemplate, channel, variables | Plantilla de notificación |
| `NotificationPreference` | id, userId, notificationType, channels (JSON), isEnabled | Preferencias del usuario |

### Eventos que generan notificaciones
- Stock bajo mínimo → Notificar al encargado de compras
- Orden de compra aprobada → Notificar al proveedor por email
- Factura vencida → Notificar al cliente y al área de cobranza
- Solicitud de vacaciones → Notificar al manager para aprobación
- Nuevo pedido → Notificar al área de despacho

---

## Integraciones Externas

### APIs Comunes para ERP

| Integración | Propósito | Prioridad |
|-------------|-----------|-----------|
| Facturación Electrónica (SAT/AFIP/SUNAT) | Timbrado fiscal, CFDI | Alta (si aplica por país) |
| Pasarela de pago (Stripe/MercadoPago) | Cobros online | Media |
| Servicio de email (SendGrid/Resend) | Notificaciones por correo | Alta |
| Servicio de SMS (Twilio) | Notificaciones urgentes | Baja |
| Maps API (Google/Mapbox) | Geocoding de direcciones | Baja |
| Cloud Storage (S3/GCS) | Almacenamiento de archivos | Alta |
| Analytics (Mixpanel/Amplitude) | Métricas de uso | Baja |

### Patrón de Integración
```typescript
// Todas las integraciones externas deben:
// 1. Tener un adaptador con interface
// 2. Manejar reintentos
// 3. Loguear todas las llamadas
// 4. Tener un fallback o modo degradado

interface EmailService {
  send(to: string, template: string, data: Record<string, unknown>): Promise<Result<void>>;
}

class ResendEmailService implements EmailService {
  async send(to, template, data) {
    return retryWithBackoff(async () => {
      const response = await this.client.emails.send({ to, template, data });
      this.logger.info('Email sent', { to, template, messageId: response.id });
      return Result.ok();
    }, { maxRetries: 3 });
  }
}
```
