---
name: database-design
description: >
  Guía completa para diseño de bases de datos relacionales en sistemas ERP. Cubre normalización,
  convenciones de nombres, tipos de datos, índices, migraciones versionadas con Prisma, seeders y
  datos iniciales. Usa esta skill SIEMPRE que estés diseñando un esquema de base de datos, creando
  tablas, definiendo relaciones entre entidades, escribiendo migraciones, o generando datos seed.
  Se activa cuando el usuario mencione "base de datos", "esquema", "tabla", "migración", "modelo",
  "relaciones", "Prisma schema", "foreign key", "normalización", "seed", o cualquier referencia
  al diseño de la capa de persistencia.
---

# Database Design — Sistemas ERP

Guía profesional para diseñar esquemas de bases de datos robustos, eficientes y mantenibles para aplicaciones empresariales.

## Convenciones de Nombres

### Tablas
- **snake_case** en plural: `products`, `purchase_orders`, `order_items`
- Tablas de relación N:M: combina ambas tablas: `product_categories`, `user_roles`
- Prefijos por módulo (opcional pero recomendado en sistemas grandes): `inv_products`, `sales_orders`

### Columnas
- **snake_case**: `unit_price`, `created_at`, `is_active`
- Foreign keys: `{tabla_singular}_id` → `customer_id`, `warehouse_id`
- Booleanos: prefijo `is_` o `has_` → `is_active`, `has_variants`, `is_default`
- Timestamps: sufijo `_at` → `created_at`, `updated_at`, `deleted_at`, `paid_at`
- Montos de dinero: sufijo descriptivo → `unit_price`, `total_amount`, `tax_amount`

### Índices
- `idx_{tabla}_{columnas}` → `idx_products_sku`, `idx_orders_customer_id_status`
- Unique: `unq_{tabla}_{columnas}` → `unq_products_sku`

## Campos Estándar (toda tabla debe tener)

```sql
-- Prisma schema equivalente
model Product {
  id          String    @id @default(uuid())    // UUID, nunca auto-increment en ERP
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")      // Soft delete
  createdBy   String?   @map("created_by")      // Quién creó el registro
  updatedBy   String?   @map("updated_by")      // Quién lo modificó

  @@map("products")
}
```

### ¿Por qué UUID y no auto-increment?
- **Seguridad**: No expone información secuencial (no puedes adivinar cuántos registros hay)
- **Distribución**: Funciona en multi-base de datos y microservicios sin colisiones
- **Offline**: Se puede generar sin conexión a BD
- **Merge**: Facilita importación de datos y migraciones

### ¿Por qué Soft Delete?
En un ERP, **nunca se elimina data de negocio**. Un producto puede estar inactivo, un cliente dado de baja, pero sus registros históricos (facturas, movimientos) deben permanecer intactos para auditoría y contabilidad.

```typescript
// Prisma middleware para soft delete automático
prisma.$use(async (params, next) => {
  // Interceptar deletes y convertirlos a updates
  if (params.action === 'delete') {
    params.action = 'update';
    params.args.data = { deletedAt: new Date() };
  }
  if (params.action === 'deleteMany') {
    params.action = 'updateMany';
    if (params.args.data) {
      params.args.data.deletedAt = new Date();
    } else {
      params.args.data = { deletedAt: new Date() };
    }
  }

  // Filtrar soft-deleted en todas las consultas
  if (params.action === 'findMany' || params.action === 'findFirst' || params.action === 'count') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    if (params.args.where.deletedAt === undefined) {
      params.args.where.deletedAt = null;
    }
  }

  return next(params);
});
```

## Esquema Prisma de Referencia

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearch"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ──────────────────────────────────────────────────
// MÓDULO: AUTH & SISTEMA
// ──────────────────────────────────────────────────

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String    @map("password_hash")
  firstName    String    @map("first_name")
  lastName     String    @map("last_name")
  avatar       String?
  isActive     Boolean   @default(true) @map("is_active")
  mfaEnabled   Boolean   @default(false) @map("mfa_enabled")
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  deletedAt    DateTime? @map("deleted_at")

  roles      UserRole[]
  sessions   Session[]
  auditLogs  AuditLog[]

  @@map("users")
}

model Role {
  id          String   @id @default(uuid())
  name        String   @unique
  slug        String   @unique
  description String?
  isSystem    Boolean  @default(false) @map("is_system")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  users       UserRole[]
  permissions RolePermission[]

  @@map("roles")
}

model Permission {
  id       String @id @default(uuid())
  module   String // 'inventory', 'sales', etc.
  action   String // 'create', 'read', 'update', 'delete', 'export', 'approve'
  resource String // 'product', 'order', etc.

  roles RolePermission[]

  @@unique([module, action, resource])
  @@map("permissions")
}

model UserRole {
  userId String @map("user_id")
  roleId String @map("role_id")

  user User @relation(fields: [userId], references: [id])
  role Role @relation(fields: [roleId], references: [id])

  @@id([userId, roleId])
  @@map("user_roles")
}

model RolePermission {
  roleId       String @map("role_id")
  permissionId String @map("permission_id")

  role       Role       @relation(fields: [roleId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
  @@map("role_permissions")
}

// ──────────────────────────────────────────────────
// MÓDULO: INVENTARIO
// ──────────────────────────────────────────────────

model Product {
  id           String   @id @default(uuid())
  sku          String   @unique
  barcode      String?  @unique
  name         String
  description  String?  @db.Text
  unitPrice    Decimal  @map("unit_price") @db.Decimal(12, 2)
  costPrice    Decimal  @map("cost_price") @db.Decimal(12, 2)
  currentStock Int      @default(0) @map("current_stock")
  minimumStock Int      @default(0) @map("minimum_stock")
  maximumStock Int?     @map("maximum_stock")
  unitOfMeasure String  @default("UNIT") @map("unit_of_measure")
  imageUrl     String?  @map("image_url")
  isActive     Boolean  @default(true) @map("is_active")

  categoryId String   @map("category_id")
  brandId    String?  @map("brand_id")
  createdBy  String?  @map("created_by")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")
  deletedAt  DateTime? @map("deleted_at")

  category       Category        @relation(fields: [categoryId], references: [id])
  brand          Brand?          @relation(fields: [brandId], references: [id])
  stockMovements StockMovement[]
  orderItems     OrderItem[]
  warehouseStock WarehouseStock[]

  @@index([categoryId])
  @@index([brandId])
  @@index([name])
  @@index([isActive, categoryId])
  @@map("products")
}

model Category {
  id        String    @id @default(uuid())
  name      String
  slug      String    @unique
  parentId  String?   @map("parent_id")
  sortOrder Int       @default(0) @map("sort_order")
  isActive  Boolean   @default(true) @map("is_active")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  parent   Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children Category[] @relation("CategoryHierarchy")
  products Product[]

  @@map("categories")
}

model Brand {
  id        String   @id @default(uuid())
  name      String   @unique
  slug      String   @unique
  logoUrl   String?  @map("logo_url")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  products Product[]

  @@map("brands")
}

model Warehouse {
  id        String   @id @default(uuid())
  name      String
  code      String   @unique
  address   String?
  isDefault Boolean  @default(false) @map("is_default")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  stock          WarehouseStock[]
  stockMovements StockMovement[]

  @@map("warehouses")
}

model WarehouseStock {
  id               String @id @default(uuid())
  warehouseId      String @map("warehouse_id")
  productId        String @map("product_id")
  quantity         Int    @default(0)
  reservedQuantity Int    @default(0) @map("reserved_quantity")

  warehouse Warehouse @relation(fields: [warehouseId], references: [id])
  product   Product   @relation(fields: [productId], references: [id])

  @@unique([warehouseId, productId])
  @@map("warehouse_stocks")
}

model StockMovement {
  id            String   @id @default(uuid())
  productId     String   @map("product_id")
  warehouseId   String   @map("warehouse_id")
  type          String   // IN, OUT, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT
  quantity      Int
  previousStock Int      @map("previous_stock")
  newStock      Int      @map("new_stock")
  reason        String?
  referenceType String?  @map("reference_type") // ORDER, PURCHASE, ADJUSTMENT
  referenceId   String?  @map("reference_id")
  createdBy     String?  @map("created_by")
  createdAt     DateTime @default(now()) @map("created_at")

  product   Product   @relation(fields: [productId], references: [id])
  warehouse Warehouse @relation(fields: [warehouseId], references: [id])

  @@index([productId, createdAt])
  @@index([warehouseId, createdAt])
  @@index([referenceType, referenceId])
  @@map("stock_movements")
}

// ──────────────────────────────────────────────────
// MÓDULO: VENTAS
// ──────────────────────────────────────────────────

model Customer {
  id               String   @id @default(uuid())
  customerNumber   String   @unique @map("customer_number")
  type             String   @default("INDIVIDUAL") // INDIVIDUAL, COMPANY
  name             String
  email            String?
  phone            String?
  taxId            String?  @map("tax_id")
  creditLimit      Decimal? @map("credit_limit") @db.Decimal(12, 2)
  currentBalance   Decimal  @default(0) @map("current_balance") @db.Decimal(12, 2)
  paymentTermsDays Int      @default(0) @map("payment_terms_days")
  isActive         Boolean  @default(true) @map("is_active")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  deletedAt        DateTime? @map("deleted_at")

  orders   Order[]
  invoices Invoice[]

  @@index([name])
  @@index([email])
  @@map("customers")
}

model Order {
  id              String   @id @default(uuid())
  orderNumber     String   @unique @map("order_number")
  customerId      String   @map("customer_id")
  status          String   @default("DRAFT") // DRAFT, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED
  subtotal        Decimal  @db.Decimal(12, 2)
  taxAmount       Decimal  @map("tax_amount") @db.Decimal(12, 2)
  discountAmount  Decimal  @default(0) @map("discount_amount") @db.Decimal(12, 2)
  total           Decimal  @db.Decimal(12, 2)
  notes           String?  @db.Text
  shippingAddress String?  @map("shipping_address") @db.Text
  createdBy       String?  @map("created_by")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  customer Customer    @relation(fields: [customerId], references: [id])
  items    OrderItem[]
  invoices Invoice[]

  @@index([customerId])
  @@index([status])
  @@index([createdAt])
  @@map("orders")
}

model OrderItem {
  id          String  @id @default(uuid())
  orderId     String  @map("order_id")
  productId   String  @map("product_id")
  productName String  @map("product_name") // Snapshot del nombre al momento de la venta
  quantity    Int
  unitPrice   Decimal @map("unit_price") @db.Decimal(12, 2)
  discount    Decimal @default(0) @db.Decimal(5, 2)
  taxRate     Decimal @map("tax_rate") @db.Decimal(5, 2)
  lineTotal   Decimal @map("line_total") @db.Decimal(12, 2)

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id])

  @@map("order_items")
}

model Invoice {
  id            String    @id @default(uuid())
  invoiceNumber String    @unique @map("invoice_number")
  orderId       String?   @map("order_id")
  customerId    String    @map("customer_id")
  status        String    @default("DRAFT") // DRAFT, SENT, PAID, OVERDUE, CANCELLED
  subtotal      Decimal   @db.Decimal(12, 2)
  taxAmount     Decimal   @map("tax_amount") @db.Decimal(12, 2)
  total         Decimal   @db.Decimal(12, 2)
  dueDate       DateTime  @map("due_date")
  paidAt        DateTime? @map("paid_at")
  paidAmount    Decimal?  @map("paid_amount") @db.Decimal(12, 2)
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  order    Order?   @relation(fields: [orderId], references: [id])
  customer Customer @relation(fields: [customerId], references: [id])

  @@index([customerId])
  @@index([status])
  @@index([dueDate])
  @@map("invoices")
}

// ──────────────────────────────────────────────────
// MÓDULO: AUDITORÍA
// ──────────────────────────────────────────────────

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  @map("user_id")
  action     String   // CREATE, UPDATE, DELETE, LOGIN, LOGOUT, EXPORT
  module     String   // inventory, sales, etc.
  entityType String   @map("entity_type") // product, order, etc.
  entityId   String?  @map("entity_id")
  oldValues  Json?    @map("old_values")
  newValues  Json?    @map("new_values")
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  createdAt  DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([entityType, entityId])
  @@index([module, action])
  @@index([createdAt])
  @@map("audit_logs")
}

model Session {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  token     String   @unique
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent")
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([userId])
  @@map("sessions")
}
```

## Tipos de Datos — Guía Rápida

| Tipo de dato | Prisma | PostgreSQL | Usar para |
|-------------|--------|------------|-----------|
| ID | `String @id @default(uuid())` | `UUID` | Primary keys |
| Dinero | `Decimal @db.Decimal(12, 2)` | `NUMERIC(12,2)` | Precios, totales |
| Porcentaje | `Decimal @db.Decimal(5, 2)` | `NUMERIC(5,2)` | Tasas de impuesto, descuentos |
| Cantidad | `Int` | `INTEGER` | Stock, cantidades |
| Texto corto | `String` | `VARCHAR(255)` | Nombres, emails |
| Texto largo | `String @db.Text` | `TEXT` | Descripciones, notas |
| Fecha+hora | `DateTime` | `TIMESTAMPTZ` | Timestamps |
| Solo fecha | `DateTime @db.Date` | `DATE` | Fechas de vencimiento |
| Booleano | `Boolean` | `BOOLEAN` | Flags |
| JSON | `Json` | `JSONB` | Datos semi-estructurados |
| Enum | `String` con validación | `VARCHAR` | Status, tipos |

### ¿Por qué no usar ENUMs de PostgreSQL?
Los ENUMs de PostgreSQL son difíciles de modificar una vez creados (requieren migraciones complejas). Usa `String` con validación en la capa de aplicación. Es más flexible y portátil.

## Migraciones

### Flujo de Migraciones con Prisma

```bash
# 1. Modifica el schema.prisma
# 2. Genera la migración
npx prisma migrate dev --name add_barcode_to_products

# 3. En producción
npx prisma migrate deploy

# 4. Para ver el estado
npx prisma migrate status
```

### Reglas de Migraciones
1. **Una migración = un cambio lógico** — No mezcles cambios no relacionados
2. **Nombres descriptivos** — `add_barcode_to_products`, `create_invoices_table`
3. **Nunca edites migraciones ya aplicadas** — Crea una nueva
4. **Prueba rollbacks** — Ten un plan de reversión para cada migración
5. **Datos + esquema** — Si necesitas migrar datos, hazlo en la misma migración

## Seeders

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Roles y permisos del sistema
  const adminRole = await prisma.role.upsert({
    where: { slug: 'admin' },
    update: {},
    create: {
      name: 'Administrador',
      slug: 'admin',
      description: 'Acceso total al sistema',
      isSystem: true,
    },
  });

  // 2. Usuario administrador por defecto
  await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      passwordHash: await hash('admin123', 12),
      firstName: 'Admin',
      lastName: 'Sistema',
      isActive: true,
      roles: { create: { roleId: adminRole.id } },
    },
  });

  // 3. Categorías iniciales
  const categories = ['Electrónica', 'Alimentos', 'Ropa', 'Herramientas', 'Oficina'];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { slug: name.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: { name, slug: name.toLowerCase().replace(/\s+/g, '-') },
    });
  }

  // 4. Almacén principal
  await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: { name: 'Almacén Principal', code: 'MAIN', isDefault: true },
  });

  console.log('✅ Seed completed');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

## Anti-patrones

| ❌ Anti-patrón | ✅ Correcto | Razón |
|---|---|---|
| `FLOAT` para dinero | `DECIMAL(12,2)` | Errores de punto flotante en cálculos financieros |
| Auto-increment para PKs | UUID | Seguridad, distribución, offline-first |
| Hard delete | Soft delete (`deleted_at`) | Auditoría, integridad referencial, recuperación |
| Guardar archivos en BD | Guardar URL/path, archivo en storage | Performance, escalabilidad |
| JSON para todo | Columnas tipadas + JSON para datos opcionales | Consultas, índices, validación |
| Sin índices | Índices en FKs, columnas de filtro y búsqueda | Performance |
| Sin timestamps | `created_at` + `updated_at` en toda tabla | Auditoría y debugging |
