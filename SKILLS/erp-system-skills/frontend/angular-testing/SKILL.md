---
name: angular-testing
description: >
  Estrategia de testing para aplicaciones Angular ERP. Cubre testing de componentes con TestBed y
  ComponentFixture, testing de servicios con HttpClientTestingModule, testing de guards e interceptors,
  Spectator para tests más limpios, harnesses de Angular Material, mocking de servicios y stores,
  y testing de formularios reactivos. Usa esta skill SIEMPRE que necesites escribir tests para
  componentes, servicios, guards o interceptors de Angular. Se activa con "test Angular", "TestBed",
  "ComponentFixture", "Spectator", "Jasmine", "Karma", "Angular testing", "harness", "mock service",
  "HttpClientTestingModule", o cualquier referencia a testing en Angular.
---

# Angular Testing — ERP

Estrategia profesional de testing para aplicaciones Angular empresariales.

## Configuración

### Vitest para Angular (moderno, rápido)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.module.ts', '**/index.ts'],
    },
  },
});
```

```typescript
// src/test-setup.ts
import '@analogjs/vite-plugin-angular/setup-zone';
import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
```

## Testing de Servicios

### Servicio de Datos (HttpClient)

```typescript
// modules/inventory/services/product.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ProductService } from './product.service';

describe('ProductService', () => {
  let service: ProductService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify(); // Verificar que no quedan requests pendientes
  });

  describe('findAll', () => {
    it('should return paginated products', () => {
      const mockResponse = {
        success: true,
        data: [
          { id: '1', sku: 'TEST-001', name: 'Product 1', unitPrice: 10 },
          { id: '2', sku: 'TEST-002', name: 'Product 2', unitPrice: 20 },
        ],
        meta: { pagination: { total: 2, page: 1, pageSize: 20, totalPages: 1 } },
      };

      service.findAll().subscribe(result => {
        expect(result.items).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.items[0].sku).toBe('TEST-001');
      });

      const req = httpMock.expectOne(r => r.url.includes('/products'));
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should pass query params', () => {
      const params = new HttpParams()
        .set('page', '2')
        .set('search', 'laptop');

      service.findAll(params).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('/products') &&
        r.params.get('page') === '2' &&
        r.params.get('search') === 'laptop'
      );
      req.flush({ success: true, data: [], meta: { pagination: { total: 0 } } });
    });
  });

  describe('create', () => {
    it('should create a product', () => {
      const newProduct = { sku: 'NEW-001', name: 'New Product', unitPrice: 29.99, categoryId: 'cat-1' };

      service.create(newProduct).subscribe(result => {
        expect(result.sku).toBe('NEW-001');
      });

      const req = httpMock.expectOne(r => r.url.includes('/products'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(newProduct);
      req.flush({ success: true, data: { id: '3', ...newProduct } });
    });
  });

  describe('delete', () => {
    it('should delete a product', () => {
      service.delete('product-1').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/products/product-1'));
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
```

### Auth Store

```typescript
// shared/stores/auth.store.spec.ts
describe('AuthStore', () => {
  let store: AuthStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(AuthStore);
  });

  it('should start unauthenticated', () => {
    expect(store.isAuthenticated()).toBe(false);
    expect(store.user()).toBeNull();
  });

  it('should login successfully', () => {
    store.login({
      user: { id: '1', email: 'test@test.com', firstName: 'Test', lastName: 'User' },
      tokens: { accessToken: 'abc', refreshToken: 'xyz', expiresIn: 900 },
      permissions: [{ module: 'inventory', action: 'read', resource: 'product' }],
    });

    expect(store.isAuthenticated()).toBe(true);
    expect(store.user()!.email).toBe('test@test.com');
    expect(store.fullName()).toBe('Test User');
  });

  it('should check permissions', () => {
    store.login({
      user: { id: '1', email: 'test@test.com', firstName: 'Test', lastName: 'User' },
      tokens: { accessToken: 'abc', refreshToken: 'xyz', expiresIn: 900 },
      permissions: [{ module: 'inventory', action: 'read', resource: 'product' }],
    });

    expect(store.hasPermission('inventory', 'read', 'product')).toBe(true);
    expect(store.hasPermission('inventory', 'delete', 'product')).toBe(false);
    expect(store.hasPermission('sales', 'read', 'order')).toBe(false);
  });

  it('should logout and clear state', () => {
    store.login({
      user: { id: '1', email: 'test@test.com', firstName: 'Test', lastName: 'User' },
      tokens: { accessToken: 'abc', refreshToken: 'xyz', expiresIn: 900 },
      permissions: [],
    });

    store.logout();

    expect(store.isAuthenticated()).toBe(false);
    expect(store.user()).toBeNull();
    expect(store.tokens()).toBeNull();
  });
});
```

## Testing de Componentes

### Componente con Inputs/Outputs

```typescript
// shared/components/status-badge/status-badge.component.spec.ts
describe('StatusBadgeComponent', () => {
  it('should render correct label and color', async () => {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'CONFIRMED');
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.badge');
    expect(badge.textContent.trim()).toBe('Confirmado');
    expect(badge.style.color).toBe('rgb(37, 99, 235)'); // #2563eb
    expect(badge.style.backgroundColor).toBe('rgb(219, 234, 254)'); // #dbeafe
  });

  it('should handle unknown status gracefully', () => {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'UNKNOWN');
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.badge');
    expect(badge.textContent.trim()).toBe('UNKNOWN');
  });
});
```

### Componente con Formulario

```typescript
// modules/inventory/pages/product-form/product-form.component.spec.ts
describe('ProductFormComponent', () => {
  let fixture: ComponentFixture<ProductFormComponent>;
  let component: ProductFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductFormComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('categories', [
      { id: 'cat-1', name: 'Electronics' },
      { id: 'cat-2', name: 'Clothing' },
    ]);
    fixture.detectChanges();
  });

  it('should create the form with all fields', () => {
    expect(component.form.contains('sku')).toBe(true);
    expect(component.form.contains('name')).toBe(true);
    expect(component.form.contains('unitPrice')).toBe(true);
    expect(component.form.contains('categoryId')).toBe(true);
  });

  it('should be invalid when empty', () => {
    expect(component.form.valid).toBe(false);
  });

  it('should validate SKU pattern', () => {
    component.form.controls.sku.setValue('invalid sku!');
    expect(component.form.controls.sku.hasError('pattern')).toBe(true);

    component.form.controls.sku.setValue('VALID-SKU-001');
    expect(component.form.controls.sku.hasError('pattern')).toBe(false);
  });

  it('should validate minimum price', () => {
    component.form.controls.unitPrice.setValue(-5);
    expect(component.form.controls.unitPrice.hasError('min')).toBe(true);

    component.form.controls.unitPrice.setValue(10);
    expect(component.form.controls.unitPrice.hasError('min')).toBe(false);
  });

  it('should emit formSubmit when valid', () => {
    const submitSpy = vi.fn();
    component.formSubmit.subscribe(submitSpy);

    // Fill valid data
    component.form.patchValue({
      sku: 'TEST-001',
      name: 'Test Product',
      unitPrice: 29.99,
      categoryId: 'cat-1',
    });

    component.onSubmit();

    expect(submitSpy).toHaveBeenCalledWith(expect.objectContaining({
      sku: 'TEST-001',
      name: 'Test Product',
      unitPrice: 29.99,
    }));
  });

  it('should not emit when form is invalid', () => {
    const submitSpy = vi.fn();
    component.formSubmit.subscribe(submitSpy);

    component.onSubmit();

    expect(submitSpy).not.toHaveBeenCalled();
    expect(component.form.controls.sku.touched).toBe(true); // Marca como touched
  });

  it('should pre-fill form when product input is set', () => {
    fixture.componentRef.setInput('product', {
      id: '1', sku: 'EXISTING-001', name: 'Existing Product',
      unitPrice: 50, costPrice: 25, minimumStock: 5,
      categoryId: 'cat-1', unitOfMeasure: 'UNIT',
    });
    fixture.detectChanges();

    expect(component.form.controls.name.value).toBe('Existing Product');
    expect(component.form.controls.unitPrice.value).toBe(50);
    expect(component.isEdit()).toBe(true);
  });
});
```

## Testing de Interceptors

```typescript
// shared/interceptors/auth.interceptor.spec.ts
describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let authStore: AuthStore;
  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    authStore = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpClient);
  });

  it('should add Authorization header when authenticated', () => {
    authStore.login({
      user: { id: '1', email: 'test@test.com', firstName: 'T', lastName: 'U' },
      tokens: { accessToken: 'my-token', refreshToken: 'refresh', expiresIn: 900 },
      permissions: [],
    });

    http.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
  });

  it('should NOT add header when not authenticated', () => {
    http.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBe(false);
  });
});
```

## Testing de Guards

```typescript
// shared/guards/permission.guard.spec.ts
describe('permissionGuard', () => {
  it('should allow access when user has permission', () => {
    const authStore = TestBed.inject(AuthStore);
    authStore.login({
      user: { id: '1', email: 'test@test.com', firstName: 'T', lastName: 'U' },
      tokens: { accessToken: 'abc', refreshToken: 'xyz', expiresIn: 900 },
      permissions: [{ module: 'inventory', action: 'read', resource: 'product' }],
    });

    const guard = permissionGuard('inventory', 'read');
    const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));

    expect(result).toBe(true);
  });

  it('should deny access when user lacks permission', () => {
    const authStore = TestBed.inject(AuthStore);
    authStore.login({
      user: { id: '1', email: 'test@test.com', firstName: 'T', lastName: 'U' },
      tokens: { accessToken: 'abc', refreshToken: 'xyz', expiresIn: 900 },
      permissions: [], // No permissions
    });

    const guard = permissionGuard('inventory', 'delete');
    const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));

    expect(result).toBe(false);
  });
});
```

## Testing de Pipes

```typescript
// shared/pipes/currency.pipe.spec.ts
describe('ErpCurrencyPipe', () => {
  const pipe = new ErpCurrencyPipe();

  it('should format currency in MXN', () => {
    expect(pipe.transform(1234.56)).toBe('$1,234.56');
  });

  it('should handle zero', () => {
    expect(pipe.transform(0)).toBe('$0.00');
  });

  it('should handle null', () => {
    expect(pipe.transform(null)).toBe('—');
  });

  it('should handle string numbers', () => {
    expect(pipe.transform('999.99')).toBe('$999.99');
  });
});
```

## Helpers de Testing

```typescript
// test-helpers/mock-providers.ts
export function mockAuthStore(overrides: Partial<AuthStore> = {}) {
  return {
    provide: AuthStore,
    useValue: {
      user: signal(null),
      tokens: signal(null),
      isAuthenticated: signal(false),
      hasPermission: () => true,
      hasRole: () => false,
      login: vi.fn(),
      logout: vi.fn(),
      ...overrides,
    },
  };
}

export function mockProductService(overrides: Partial<ProductService> = {}) {
  return {
    provide: ProductService,
    useValue: {
      findAll: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
      findById: vi.fn().mockReturnValue(of(null)),
      create: vi.fn().mockReturnValue(of({})),
      update: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of(undefined)),
      ...overrides,
    },
  };
}

// Uso en tests
TestBed.configureTestingModule({
  imports: [ProductListComponent],
  providers: [
    mockAuthStore({ isAuthenticated: signal(true) }),
    mockProductService({
      findAll: vi.fn().mockReturnValue(of({
        items: [{ id: '1', sku: 'TEST', name: 'Test Product' }],
        total: 1,
      })),
    }),
  ],
});
```

## Qué Testear en Angular

| ✅ Testear | ❌ No testear |
|-----------|-------------|
| Servicios con HttpClient (mock HTTP) | Angular Material internals |
| Stores (signal state + actions) | Framework lifecycle hooks |
| Formularios (validaciones, submit) | CSS/templates estáticos |
| Guards (permisos, redirect) | Routing config |
| Interceptors (auth, error) | Third-party libraries |
| Pipes (transformaciones) | Simple getters |
| Lógica de componentes complejos | Componentes wrapper triviales |
