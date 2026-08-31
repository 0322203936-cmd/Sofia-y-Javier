---
name: api-design
description: >
  Guía profesional de diseño de APIs RESTful para sistemas ERP. Cubre convenciones de rutas, versionamiento,
  paginación estándar, manejo de errores con códigos HTTP, filtros y ordenamiento, rate limiting, CORS,
  documentación OpenAPI/Swagger, y patrones de respuesta consistentes. Usa esta skill SIEMPRE que estés
  diseñando endpoints, definiendo rutas de API, configurando respuestas HTTP, implementando paginación,
  o documentando APIs. Se activa con "endpoint", "API REST", "rutas", "Swagger", "OpenAPI", "paginación",
  "error HTTP", "status code", "rate limit", "CORS", o cualquier referencia al diseño de interfaces HTTP.
---

# API Design — RESTful APIs para ERP

Estándar profesional para diseñar APIs consistentes, predecibles y bien documentadas.

## Convenciones de URLs

### Estructura Base

```
https://api.example.com/v1/{module}/{resource}
```

### Reglas

1. **Plural para colecciones**: `/products`, `/orders`, no `/product`
2. **kebab-case**: `/purchase-orders`, `/stock-movements`
3. **Sustantivos, no verbos**: `/orders` (no `/getOrders`)
4. **Anidamiento máximo 2 niveles**: `/orders/{id}/items`
5. **Acciones custom con verbos al final**: `/orders/{id}/confirm`, `/orders/{id}/cancel`

### Endpoints Estándar por Recurso

```
# CRUD estándar
GET    /v1/inventory/products          → Listar productos (con filtros y paginación)
GET    /v1/inventory/products/:id      → Obtener un producto
POST   /v1/inventory/products          → Crear producto
PATCH  /v1/inventory/products/:id      → Actualizar producto parcial
PUT    /v1/inventory/products/:id      → Reemplazar producto completo
DELETE /v1/inventory/products/:id      → Eliminar producto (soft delete)

# Recursos anidados
GET    /v1/sales/orders/:id/items      → Items de una orden
POST   /v1/sales/orders/:id/items      → Agregar item a orden

# Acciones de negocio (verbos como sufijo)
POST   /v1/sales/orders/:id/confirm    → Confirmar orden
POST   /v1/sales/orders/:id/cancel     → Cancelar orden
POST   /v1/sales/orders/:id/invoice    → Generar factura

# Búsqueda global
GET    /v1/search?q=laptop&modules=inventory,sales

# Exportaciones
GET    /v1/inventory/products/export?format=xlsx&filters[category]=electronics
```

### Agrupación por Módulo

```
/v1/auth/...           → Autenticación y sesiones
/v1/inventory/...      → Productos, categorías, stock, almacenes
/v1/sales/...          → Órdenes, facturas, cotizaciones, clientes
/v1/purchasing/...     → Órdenes de compra, proveedores, recepciones
/v1/hr/...             → Empleados, departamentos, nómina
/v1/accounting/...     → Cuentas, asientos, periodos fiscales
/v1/reports/...        → Reportes y dashboards
/v1/settings/...       → Configuración del sistema
```

## Formato de Respuesta Estándar

### Respuesta Exitosa — Un recurso

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "sku": "LAPTOP-001",
    "name": "MacBook Pro 16\"",
    "unitPrice": 2499.99,
    "currentStock": 45,
    "category": {
      "id": "cat-001",
      "name": "Electrónica"
    },
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-03-20T14:22:00Z"
  }
}
```

### Respuesta Exitosa — Lista con paginación

```json
{
  "success": true,
  "data": [
    { "id": "...", "name": "..." },
    { "id": "...", "name": "..." }
  ],
  "meta": {
    "pagination": {
      "total": 1250,
      "page": 3,
      "pageSize": 20,
      "totalPages": 63,
      "hasNextPage": true,
      "hasPreviousPage": true
    },
    "filters": {
      "category": "electronics",
      "isActive": true
    },
    "sort": {
      "field": "createdAt",
      "order": "desc"
    }
  }
}
```

### Respuesta de Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos proporcionados no son válidos",
    "details": [
      {
        "field": "unitPrice",
        "message": "El precio debe ser mayor a 0",
        "code": "INVALID_VALUE"
      },
      {
        "field": "sku",
        "message": "El SKU ya existe en el sistema",
        "code": "DUPLICATE_VALUE"
      }
    ],
    "requestId": "req_abc123xyz"
  }
}
```

## Códigos HTTP Estándar

| Código | Uso en ERP | Cuándo |
|--------|------------|--------|
| `200` | OK | GET exitoso, PATCH exitoso |
| `201` | Created | POST exitoso (recurso creado) |
| `204` | No Content | DELETE exitoso |
| `400` | Bad Request | Validación fallida, datos incorrectos |
| `401` | Unauthorized | No autenticado, token expirado |
| `403` | Forbidden | Sin permisos para esta acción |
| `404` | Not Found | Recurso no existe |
| `409` | Conflict | Duplicado (SKU ya existe), conflicto de versión |
| `422` | Unprocessable | Regla de negocio violada (stock insuficiente, crédito excedido) |
| `429` | Too Many Requests | Rate limit excedido |
| `500` | Internal Error | Error inesperado del servidor |

### Códigos de Error de Negocio

```typescript
export const BusinessErrors = {
  // Inventario
  INSUFFICIENT_STOCK: { status: 422, code: 'INSUFFICIENT_STOCK' },
  PRODUCT_INACTIVE: { status: 422, code: 'PRODUCT_INACTIVE' },
  SKU_ALREADY_EXISTS: { status: 409, code: 'SKU_ALREADY_EXISTS' },

  // Ventas
  ORDER_ALREADY_CONFIRMED: { status: 422, code: 'ORDER_ALREADY_CONFIRMED' },
  CREDIT_LIMIT_EXCEEDED: { status: 422, code: 'CREDIT_LIMIT_EXCEEDED' },
  CUSTOMER_INACTIVE: { status: 422, code: 'CUSTOMER_INACTIVE' },

  // General
  RESOURCE_NOT_FOUND: { status: 404, code: 'RESOURCE_NOT_FOUND' },
  VALIDATION_ERROR: { status: 400, code: 'VALIDATION_ERROR' },
  UNAUTHORIZED: { status: 401, code: 'UNAUTHORIZED' },
  FORBIDDEN: { status: 403, code: 'FORBIDDEN' },
} as const;
```

## Query Parameters para Filtros

### Convención de Filtros

```
GET /v1/inventory/products
  ?search=laptop                          # Búsqueda general (nombre, SKU)
  &category=electronics                   # Filtro exacto
  &isActive=true                          # Filtro booleano
  &priceMin=100&priceMax=5000            # Rango numérico
  &createdAfter=2025-01-01               # Rango de fecha
  &createdBefore=2025-12-31
  &sort=unitPrice                         # Campo de ordenamiento
  &order=asc                              # Dirección (asc/desc)
  &page=1                                 # Página actual
  &pageSize=20                            # Tamaño de página (máx 100)
```

### Implementación del Parser de Query

```typescript
import { z } from 'zod';

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const ProductFiltersSchema = PaginationSchema.extend({
  search: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
});

// En el controller
app.get('/v1/inventory/products', async (req, res) => {
  const filters = ProductFiltersSchema.parse(req.query);
  const result = await productService.findAll(filters);
  res.json({ success: true, data: result.items, meta: { pagination: result.pagination } });
});
```

## Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Rate limit global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000,                 // 1000 requests por ventana
  standardHeaders: true,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes' } },
});

// Rate limit para login (más estricto)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Demasiados intentos de login' } },
});

// Rate limit para exportaciones (costosas)
const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
});

app.use('/v1/', globalLimiter);
app.use('/v1/auth/login', loginLimiter);
app.use('/v1/*/export', exportLimiter);
```

## Versionamiento

Usa prefijo en la URL (`/v1/`, `/v2/`). Es el más explícito y fácil de mantener.

```typescript
import { Router } from 'express';

const v1Router = Router();
v1Router.use('/inventory', inventoryRoutes);
v1Router.use('/sales', salesRoutes);

const v2Router = Router();
v2Router.use('/inventory', inventoryRoutesV2); // Versión actualizada

app.use('/v1', v1Router);
app.use('/v2', v2Router);
```

### Regla de Compatibilidad
- **Cambios no-breaking**: agregar campos opcionales, nuevos endpoints → no necesitan nueva versión
- **Cambios breaking**: eliminar campos, cambiar tipos, reestructurar respuestas → nueva versión

## CORS

```typescript
import cors from 'cors';

app.use(cors({
  origin: [
    process.env.FRONTEND_URL,           // https://erp.company.com
    'http://localhost:3000',             // Desarrollo local
  ],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,                     // Para cookies de sesión
  maxAge: 86400,                         // Cache preflight 24h
}));
```

## Documentación OpenAPI

```typescript
// Con swagger-jsdoc + swagger-ui-express
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ERP API',
      version: '1.0.0',
      description: 'API del Sistema ERP',
    },
    servers: [
      { url: '/v1', description: 'API v1' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/modules/*/infrastructure/routes/*.ts'],
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```
