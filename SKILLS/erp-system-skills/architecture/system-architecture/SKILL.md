---
name: system-architecture
description: >
  Guía completa de arquitectura de software para sistemas ERP y aplicaciones empresariales.
  Define la estructura de carpetas, patrones arquitectónicos (Clean Architecture, Hexagonal, Modular Monolith),
  capas de la aplicación, y decisiones técnicas fundamentales. Usa esta skill SIEMPRE que estés iniciando
  un nuevo proyecto, definiendo la estructura de un sistema, creando la base de un ERP, o tomando decisiones
  arquitectónicas como monolito vs microservicios, separación de capas, o diseño de dominios. También
  se activa cuando el usuario mencione "arquitectura", "estructura del proyecto", "organización de carpetas",
  "capas", "clean architecture", "hexagonal", o "diseño del sistema".
---

# System Architecture — Sistemas ERP Empresariales

Guía definitiva para estructurar proyectos ERP con arquitectura limpia, escalable y mantenible.

## Principios Fundamentales

1. **Separación de responsabilidades** — Cada capa tiene un propósito claro
2. **Dependency Inversion** — Las capas internas no conocen las externas
3. **Domain-first** — El dominio de negocio dicta la estructura, no el framework
4. **Testabilidad** — Cada capa se puede testear de forma aislada
5. **Escalabilidad progresiva** — Empieza monolito modular, escala a microservicios si es necesario

## Arquitectura Recomendada: Modular Monolith con Clean Architecture

Para un ERP, la mejor estrategia es un **monolito modular** que puede evolucionar a microservicios. Cada módulo (ventas, inventario, RRHH) es independiente pero comparte la misma base de datos y deployment.

### Estructura de Proyecto Estándar

```
project-root/
├── src/
│   ├── modules/                    # Módulos de negocio (el corazón del ERP)
│   │   ├── inventory/
│   │   │   ├── domain/             # Entidades, value objects, reglas de negocio
│   │   │   │   ├── entities/
│   │   │   │   │   ├── product.entity.ts
│   │   │   │   │   └── warehouse.entity.ts
│   │   │   │   ├── value-objects/
│   │   │   │   │   ├── sku.vo.ts
│   │   │   │   │   └── quantity.vo.ts
│   │   │   │   ├── events/
│   │   │   │   │   └── stock-updated.event.ts
│   │   │   │   └── repositories/
│   │   │   │       └── product.repository.ts    # Interface (puerto)
│   │   │   ├── application/        # Casos de uso / servicios de aplicación
│   │   │   │   ├── use-cases/
│   │   │   │   │   ├── create-product.use-case.ts
│   │   │   │   │   ├── update-stock.use-case.ts
│   │   │   │   │   └── transfer-stock.use-case.ts
│   │   │   │   ├── dtos/
│   │   │   │   │   ├── create-product.dto.ts
│   │   │   │   │   └── product-response.dto.ts
│   │   │   │   └── mappers/
│   │   │   │       └── product.mapper.ts
│   │   │   ├── infrastructure/     # Implementaciones concretas (adaptadores)
│   │   │   │   ├── repositories/
│   │   │   │   │   └── prisma-product.repository.ts
│   │   │   │   ├── controllers/
│   │   │   │   │   └── product.controller.ts
│   │   │   │   └── routes/
│   │   │   │       └── inventory.routes.ts
│   │   │   └── index.ts            # Barrel export del módulo
│   │   ├── sales/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   └── infrastructure/
│   │   ├── purchasing/
│   │   ├── accounting/
│   │   ├── hr/
│   │   └── crm/
│   │
│   ├── shared/                     # Código compartido entre módulos
│   │   ├── domain/
│   │   │   ├── base.entity.ts      # Clase base con id, timestamps
│   │   │   ├── result.ts           # Patrón Result para error handling
│   │   │   └── domain-event.ts     # Base class para eventos
│   │   ├── application/
│   │   │   ├── use-case.ts         # Interface base UseCase<Input, Output>
│   │   │   └── pagination.dto.ts
│   │   ├── infrastructure/
│   │   │   ├── database/
│   │   │   │   ├── prisma.service.ts
│   │   │   │   └── transaction.manager.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── error-handler.middleware.ts
│   │   │   │   └── request-logger.middleware.ts
│   │   │   ├── services/
│   │   │   │   ├── email.service.ts
│   │   │   │   ├── cache.service.ts
│   │   │   │   └── file-storage.service.ts
│   │   │   └── config/
│   │   │       ├── env.config.ts
│   │   │       └── app.config.ts
│   │   └── utils/
│   │       ├── date.utils.ts
│   │       ├── money.utils.ts
│   │       └── string.utils.ts
│   │
│   ├── app.ts                      # Bootstrap de la aplicación
│   └── server.ts                   # Entry point
│
├── prisma/
│   ├── schema.prisma               # Esquema de la BD
│   ├── migrations/                 # Migraciones versionadas
│   └── seed.ts                     # Datos iniciales
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── docs/
│   ├── api/                        # Documentación OpenAPI
│   └── architecture/               # Diagramas y decisiones
│
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── tsconfig.json
├── package.json
└── README.md
```

## Capas de la Arquitectura

### 1. Domain Layer (Core)
La capa más interna. Contiene la lógica de negocio pura. **No tiene dependencias externas**.

```typescript
// src/modules/inventory/domain/entities/product.entity.ts
import { BaseEntity } from '@shared/domain/base.entity';
import { SKU } from '../value-objects/sku.vo';
import { Result } from '@shared/domain/result';

export class Product extends BaseEntity {
  private constructor(
    id: string,
    public readonly sku: SKU,
    public name: string,
    public description: string,
    public unitPrice: number,
    public currentStock: number,
    public minimumStock: number,
    public categoryId: string,
    public isActive: boolean,
  ) {
    super(id);
  }

  static create(props: CreateProductProps): Result<Product> {
    if (!props.name || props.name.trim().length < 2) {
      return Result.fail('Product name must be at least 2 characters');
    }
    if (props.unitPrice < 0) {
      return Result.fail('Unit price cannot be negative');
    }

    const sku = SKU.create(props.sku);
    if (sku.isFailure) return Result.fail(sku.error);

    return Result.ok(new Product(
      props.id ?? crypto.randomUUID(),
      sku.value,
      props.name.trim(),
      props.description ?? '',
      props.unitPrice,
      props.initialStock ?? 0,
      props.minimumStock ?? 0,
      props.categoryId,
      true,
    ));
  }

  adjustStock(quantity: number, reason: string): Result<void> {
    const newStock = this.currentStock + quantity;
    if (newStock < 0) {
      return Result.fail(`Insufficient stock. Current: ${this.currentStock}, requested: ${Math.abs(quantity)}`);
    }
    this.currentStock = newStock;
    this.addDomainEvent(new StockAdjustedEvent(this.id, quantity, reason, newStock));
    return Result.ok();
  }

  isLowStock(): boolean {
    return this.currentStock <= this.minimumStock;
  }

  deactivate(): void {
    this.isActive = false;
  }
}
```

### 2. Application Layer (Use Cases)
Orquesta el flujo de la aplicación. Depende del Domain, NO de Infrastructure.

```typescript
// src/modules/inventory/application/use-cases/create-product.use-case.ts
import { UseCase } from '@shared/application/use-case';
import { ProductRepository } from '../../domain/repositories/product.repository';
import { Product } from '../../domain/entities/product.entity';
import { CreateProductDTO } from '../dtos/create-product.dto';
import { ProductResponseDTO } from '../dtos/product-response.dto';
import { ProductMapper } from '../mappers/product.mapper';
import { Result } from '@shared/domain/result';

export class CreateProductUseCase implements UseCase<CreateProductDTO, ProductResponseDTO> {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: CreateProductDTO): Promise<Result<ProductResponseDTO>> {
    // 1. Verificar que el SKU no exista
    const existingProduct = await this.productRepository.findBySku(input.sku);
    if (existingProduct) {
      return Result.fail(`Product with SKU ${input.sku} already exists`);
    }

    // 2. Crear la entidad de dominio (validaciones incluidas)
    const productResult = Product.create(input);
    if (productResult.isFailure) {
      return Result.fail(productResult.error);
    }

    // 3. Persistir
    const product = productResult.value;
    await this.productRepository.save(product);

    // 4. Publicar eventos de dominio
    await this.eventBus.publishAll(product.domainEvents);

    // 5. Mapear a DTO de respuesta
    return Result.ok(ProductMapper.toResponse(product));
  }
}
```

### 3. Infrastructure Layer (Adaptadores)
Implementaciones concretas de las interfaces definidas en Domain/Application.

```typescript
// src/modules/inventory/infrastructure/repositories/prisma-product.repository.ts
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { ProductRepository } from '../../domain/repositories/product.repository';
import { Product } from '../../domain/entities/product.entity';
import { ProductMapper } from '../../application/mappers/product.mapper';

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(product: Product): Promise<void> {
    const data = ProductMapper.toPersistence(product);
    await this.prisma.product.upsert({
      where: { id: product.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<Product | null> {
    const raw = await this.prisma.product.findUnique({ where: { id } });
    if (!raw) return null;
    return ProductMapper.toDomain(raw);
  }

  async findBySku(sku: string): Promise<Product | null> {
    const raw = await this.prisma.product.findUnique({ where: { sku } });
    if (!raw) return null;
    return ProductMapper.toDomain(raw);
  }

  async findAll(filters: ProductFilters): Promise<PaginatedResult<Product>> {
    const where = this.buildWhereClause(filters);
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: filters.offset,
        take: filters.limit,
        orderBy: { [filters.sortBy]: filters.sortOrder },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map(ProductMapper.toDomain),
      total,
      page: Math.floor(filters.offset / filters.limit) + 1,
      pageSize: filters.limit,
    };
  }

  private buildWhereClause(filters: ProductFilters) {
    return {
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    };
  }
}
```

## Patrón Result para Error Handling

Nunca uses `throw` para errores de negocio. Usa el patrón `Result`:

```typescript
// src/shared/domain/result.ts
export class Result<T> {
  private constructor(
    public readonly isSuccess: boolean,
    public readonly error: string | null,
    private readonly _value: T | null,
  ) {}

  get value(): T {
    if (!this.isSuccess) throw new Error('Cannot access value of a failed result');
    return this._value as T;
  }

  get isFailure(): boolean {
    return !this.isSuccess;
  }

  static ok<U>(value?: U): Result<U> {
    return new Result<U>(true, null, value ?? (undefined as U));
  }

  static fail<U>(error: string): Result<U> {
    return new Result<U>(false, error, null);
  }

  static combine(results: Result<unknown>[]): Result<void> {
    const failed = results.find(r => r.isFailure);
    if (failed) return Result.fail(failed.error!);
    return Result.ok();
  }
}
```

## Comunicación entre Módulos

Los módulos se comunican a través de **eventos de dominio**, nunca por importación directa:

```typescript
// src/shared/domain/domain-event.ts
export abstract class DomainEvent {
  public readonly occurredOn: Date = new Date();
  public readonly eventId: string = crypto.randomUUID();
  abstract get eventName(): string;
}

// src/modules/sales/domain/events/order-placed.event.ts
export class OrderPlacedEvent extends DomainEvent {
  get eventName() { return 'sales.order.placed'; }

  constructor(
    public readonly orderId: string,
    public readonly items: Array<{ productId: string; quantity: number }>,
    public readonly customerId: string,
  ) {
    super();
  }
}

// El módulo de Inventario escucha este evento para descontar stock
// src/modules/inventory/application/handlers/on-order-placed.handler.ts
export class OnOrderPlacedHandler {
  constructor(private readonly updateStockUseCase: UpdateStockUseCase) {}

  async handle(event: OrderPlacedEvent): Promise<void> {
    for (const item of event.items) {
      await this.updateStockUseCase.execute({
        productId: item.productId,
        quantity: -item.quantity,
        reason: `Order ${event.orderId}`,
      });
    }
  }
}
```

## Anti-patrones a Evitar

| ❌ Anti-patrón | ✅ Correcto | Por qué |
|---|---|---|
| Lógica de negocio en controllers | Lógica en domain/use-cases | Los controllers solo deben parsear request y formatear response |
| `throw new Error()` para validaciones | `return Result.fail()` | Los throws rompen el flujo y son impredecibles |
| Importar módulo directamente de otro | Comunicar via eventos de dominio | Acoplamiento débil permite escalar a microservicios |
| Un solo archivo `routes.ts` gigante | Routes por módulo, composición en app.ts | Mantenibilidad y navegación |
| ORM queries en use cases | Repository pattern con interfaces | Testabilidad y desacoplamiento del ORM |
| `.env` directo con `process.env` | Config service con validación Zod | Falla temprano si falta config, tipado seguro |

## Decisiones Técnicas Clave

### ¿Monolito o Microservicios?
**Siempre empieza con monolito modular.** Si cada módulo tiene boundaries claros, extraer a microservicio después es trivial. Empezar con microservicios en un ERP es overengineering prematuro.

### ¿SQL o NoSQL?
**SQL (PostgreSQL).** Un ERP es altamente relacional. Las transacciones ACID son críticas para operaciones financieras y de inventario. PostgreSQL soporta JSON para datos semi-estructurados cuando se necesiten.

### ¿REST o GraphQL?
**REST para operaciones CRUD estándar.** GraphQL añade complejidad innecesaria al inicio. Si necesitas queries muy flexibles desde el frontend, considera GraphQL más adelante solo para el módulo de reportes.

### ¿TypeScript estricto?
**Sí, siempre.** En un ERP los tipos previenen errores costosos. Configura `strict: true` en `tsconfig.json`.

### 🧠 HUMAN-LIKE THINKING & EXPERT EXECUTION DIRECTIVES
- **STOP BEING GENERIC**: Do not build a "todo list" architecture for an ERP. Think like a Principal Software Engineer designing for 10 years of scale.
- **Domain-Driven Mastery**: The folder structure must scream the business purpose (Sales, HR, Inventory), not the technical pattern (Controllers, Models, Views).
- **Scalability by Design**: Decouple modules heavily. A bug in the HR module must NEVER bring down the Sales module. Use events to communicate.
- **Preemptive Edge-Case Handling**: Think about database locks, transactional integrity, and idempotency from day 1. 
- **Legacy Proofing**: Build code that a team of 50 developers could navigate without confusion. Enforce strict boundaries.
