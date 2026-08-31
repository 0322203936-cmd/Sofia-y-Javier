---
name: erp-module-planner
description: >
  Planificador completo de módulos para sistemas ERP empresariales. Define entidades, relaciones,
  flujos de negocio, funcionalidades y checklist por cada módulo del ERP (Inventario, Ventas, Compras,
  Contabilidad, RRHH, CRM, Producción, POS). Usa esta skill SIEMPRE que necesites planificar un módulo
  del ERP, definir las entidades de una sección del sistema, crear el modelo de datos para un área de
  negocio, o cuando el usuario diga "planificar módulo", "qué tablas necesita", "entidades de ventas",
  "flujo de compras", "módulos del ERP", o cualquier referencia a la planificación funcional del sistema.
---

# ERP Module Planner

Guía exhaustiva para planificar cada módulo de un sistema ERP con entidades, relaciones, flujos y funcionalidades priorizadas.

## Filosofía de Planificación

1. **Domain-Driven** — Cada módulo mapea un bounded context de negocio
2. **MVP primero** — Implementa funcionalidades core antes de features avanzados
3. **Integración natural** — Los módulos se conectan via eventos, no dependencias duras
4. **Flexible** — Cada negocio es diferente, adapta según el contexto

## Módulos Core del ERP

### Orden de Implementación Recomendado

```
Fase 1 (MVP):    Auth → Inventario → Ventas → Clientes
Fase 2 (Growth): Compras → Proveedores → Contabilidad → Reportes
Fase 3 (Scale):  RRHH → CRM → Producción → POS
Fase 4 (Pro):    Configuración avanzada → Multi-sucursal → BI/Analytics
```

> Para el catálogo completo de módulos con entidades detalladas, consulta `references/modules-catalog.md`.

---

## Módulo: Inventario (inventory)

### Entidades Principales

| Entidad | Campos Clave | Relaciones |
|---------|-------------|------------|
| `Product` | id, sku, name, description, unitPrice, costPrice, currentStock, minimumStock, maximumStock, categoryId, brandId, unitOfMeasure, barcode, isActive | → Category, Brand, ProductVariant[], StockMovement[] |
| `Category` | id, name, slug, parentId, description, sortOrder, isActive | → Parent Category, Product[] |
| `Warehouse` | id, name, code, address, isDefault, isActive | → WarehouseStock[], StockTransfer[] |
| `WarehouseStock` | id, warehouseId, productId, quantity, reservedQuantity | → Warehouse, Product |
| `StockMovement` | id, productId, warehouseId, type (IN/OUT/ADJUSTMENT/TRANSFER), quantity, previousStock, newStock, reason, referenceType, referenceId, createdBy | → Product, Warehouse, User |
| `ProductVariant` | id, productId, sku, name, attributes (JSON), priceModifier, stock | → Product |
| `Brand` | id, name, slug, logoUrl, isActive | → Product[] |

### Flujos de Negocio

```
Entrada de Stock:
  Compra recibida → Crear StockMovement(IN) → Actualizar WarehouseStock → 
  Si stock > minimumStock → Desactivar alerta de bajo stock

Salida de Stock:
  Venta confirmada → Verificar disponibilidad → Crear StockMovement(OUT) → 
  Actualizar WarehouseStock → Si stock ≤ minimumStock → Disparar alerta

Transferencia entre Almacenes:
  Solicitud de transferencia → Verificar stock origen → 
  StockMovement(TRANSFER_OUT) en origen → StockMovement(TRANSFER_IN) en destino →
  Actualizar ambos WarehouseStock

Ajuste de Inventario:
  Conteo físico → Comparar con sistema → Crear StockMovement(ADJUSTMENT) →
  Registrar motivo → Actualizar stock → Log en auditoría
```

### Funcionalidades (Priorizadas)

- **P0 (Must)**: CRUD productos, categorías, control de stock, movimientos de stock
- **P1 (Should)**: Alertas de stock mínimo, búsqueda y filtros avanzados, código de barras
- **P2 (Could)**: Multi-almacén, transferencias, variantes de producto, lotes/seriales
- **P3 (Nice)**: Predicción de demanda, reorden automático, conteo cíclico

---

## Módulo: Ventas (sales)

### Entidades Principales

| Entidad | Campos Clave | Relaciones |
|---------|-------------|------------|
| `Order` | id, orderNumber, customerId, status (DRAFT/CONFIRMED/PROCESSING/SHIPPED/DELIVERED/CANCELLED), subtotal, taxAmount, discountAmount, total, notes, shippingAddress, createdBy | → Customer, OrderItem[], Payment[], Invoice |
| `OrderItem` | id, orderId, productId, productName, quantity, unitPrice, discount, taxRate, lineTotal | → Order, Product |
| `Invoice` | id, invoiceNumber, orderId, customerId, status (DRAFT/SENT/PAID/OVERDUE/CANCELLED), subtotal, taxAmount, total, dueDate, paidAt, paidAmount | → Order, Customer, Payment[] |
| `Quotation` | id, quoteNumber, customerId, validUntil, status, items (JSON), subtotal, total, convertedToOrderId | → Customer, Order |
| `PriceList` | id, name, currency, isDefault, validFrom, validTo | → PriceListItem[] |
| `PriceListItem` | id, priceListId, productId, price, minQuantity | → PriceList, Product |

### Flujos de Negocio

```
Flujo de Venta Completo:
  Cotización (opcional) → Orden de Venta → Confirmación → 
  Facturación → Despacho (descuento de inventario) → 
  Cobro → Entrega → Cierre

Descuentos:
  Descuento por cliente → Descuento por volumen → Descuento promocional →
  Calcular descuento más favorable → Aplicar a línea o total

Devolución:
  Solicitud → Aprobación → Recepción de producto →
  Ingreso a inventario → Nota de crédito o reembolso
```

---

## Módulo: Compras (purchasing)

### Entidades Principales

| Entidad | Campos Clave | Relaciones |
|---------|-------------|------------|
| `PurchaseOrder` | id, poNumber, supplierId, status (DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED), expectedDate, subtotal, taxAmount, total, notes, approvedBy | → Supplier, PurchaseOrderItem[], GoodsReceipt[] |
| `PurchaseOrderItem` | id, purchaseOrderId, productId, quantity, receivedQuantity, unitCost, lineTotal | → PurchaseOrder, Product |
| `Supplier` | id, name, contactName, email, phone, address, taxId, paymentTermsDays, rating, isActive | → PurchaseOrder[], SupplierProduct[] |
| `GoodsReceipt` | id, purchaseOrderId, receivedDate, receivedBy, notes, items | → PurchaseOrder |
| `SupplierProduct` | id, supplierId, productId, supplierSku, supplierPrice, leadTimeDays | → Supplier, Product |

---

## Módulo: Clientes & CRM (crm)

### Entidades Principales

| Entidad | Campos Clave | Relaciones |
|---------|-------------|------------|
| `Customer` | id, customerNumber, type (INDIVIDUAL/COMPANY), name, email, phone, taxId, creditLimit, currentBalance, paymentTermsDays, isActive | → Address[], Contact[], Order[], Invoice[] |
| `Contact` | id, customerId, name, email, phone, position, isPrimary | → Customer |
| `Address` | id, customerId, type (BILLING/SHIPPING), street, city, state, zipCode, country, isDefault | → Customer |
| `Interaction` | id, customerId, type (CALL/EMAIL/MEETING/NOTE), subject, description, scheduledAt, completedAt, assignedTo | → Customer, User |
| `Opportunity` | id, customerId, title, estimatedValue, probability, stage (LEAD/QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST), expectedCloseDate | → Customer |

---

## Módulo: Contabilidad (accounting)

### Entidades Principales

| Entidad | Campos Clave | Relaciones |
|---------|-------------|------------|
| `Account` | id, code, name, type (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE), parentId, isActive, balance | → Parent Account, JournalEntry[] |
| `JournalEntry` | id, entryNumber, date, description, referenceType, referenceId, status (DRAFT/POSTED/VOID), createdBy | → JournalEntryLine[] |
| `JournalEntryLine` | id, journalEntryId, accountId, debitAmount, creditAmount, description | → JournalEntry, Account |
| `FiscalYear` | id, name, startDate, endDate, isClosed | → FiscalPeriod[] |
| `FiscalPeriod` | id, fiscalYearId, name, startDate, endDate, isClosed | → FiscalYear |
| `TaxRate` | id, name, rate, type (VAT/SALES_TAX/WITHHOLDING), isDefault, isActive | |

---

## Módulo: RRHH (hr)

### Entidades Principales

| Entidad | Campos Clave | Relaciones |
|---------|-------------|------------|
| `Employee` | id, employeeNumber, userId, firstName, lastName, email, phone, hireDate, departmentId, positionId, managerId, salary, status (ACTIVE/ON_LEAVE/TERMINATED) | → Department, Position, Manager, Attendance[], Payroll[] |
| `Department` | id, name, code, managerId, parentId | → Employee[], Manager |
| `Position` | id, title, departmentId, salaryMin, salaryMax | → Department, Employee[] |
| `Attendance` | id, employeeId, date, checkIn, checkOut, hoursWorked, type (REGULAR/OVERTIME/HOLIDAY), status | → Employee |
| `LeaveRequest` | id, employeeId, type (VACATION/SICK/PERSONAL), startDate, endDate, status (PENDING/APPROVED/REJECTED), approvedBy, reason | → Employee |
| `Payroll` | id, employeeId, periodStart, periodEnd, baseSalary, overtime, deductions, bonuses, netPay, status | → Employee |

---

## Módulo: Autenticación y Sistema (auth)

### Entidades Principales

| Entidad | Campos Clave | Relaciones |
|---------|-------------|------------|
| `User` | id, email, passwordHash, firstName, lastName, avatar, isActive, lastLoginAt, mfaEnabled | → Role[], Session[], AuditLog[] |
| `Role` | id, name, slug, description, isSystem | → Permission[], User[] |
| `Permission` | id, module, action (CREATE/READ/UPDATE/DELETE/EXPORT/APPROVE), resource | → Role[] |
| `Session` | id, userId, token, ipAddress, userAgent, expiresAt | → User |
| `AuditLog` | id, userId, action, module, entityType, entityId, oldValues, newValues, ipAddress, timestamp | → User |
| `Setting` | id, key, value, type, module, description, isPublic | |

---

## Reglas de Planificación

### Para cada módulo nuevo:

1. **Identifica las entidades** — ¿Qué "cosas" maneja este módulo?
2. **Define las relaciones** — ¿Cómo se conectan entre sí y con otros módulos?
3. **Mapea los flujos** — ¿Cuáles son los procesos de negocio step-by-step?
4. **Prioriza funcionalidades** — P0 (imprescindible) → P3 (nice to have)
5. **Define las validaciones** — ¿Qué reglas de negocio aplican?
6. **Identifica eventos** — ¿Qué cosas pasan que otros módulos necesitan saber?
7. **Planifica la UI** — ¿Qué pantallas necesita el usuario?
