---
name: angular-state-signals
description: >
  Gestión de estado avanzada para aplicaciones ERP con Angular 17+ usando Signals, RxJS y HttpClient.
  Cubre stores con signals, servicios de datos con HttpClient e interceptors, cache inteligente con
  shareReplay, autenticación con interceptors funcionales, real-time updates con SSE, optimistic updates,
  y patrón resource para data fetching. Usa esta skill SIEMPRE que necesites manejar estado en Angular,
  crear servicios de datos, configurar interceptors HTTP, implementar cache, o integrar real-time.
  Se activa con "Angular signals", "signal store", "NgRx", "RxJS", "HttpClient", "interceptor",
  "cache Angular", "state management Angular", "observable", "toSignal", "resource",
  o cualquier referencia a gestión de estado en Angular.
---

# Angular State & Signals — ERP

Arquitectura de gestión de estado profesional para aplicaciones empresariales con Angular 17+ Signals.

## Arquitectura de Estado

```
┌────────────────────────────────────────────────┐
│                  Angular State                  │
├────────────────────┬───────────────────────────┤
│  UI State          │     Server State          │
│  (Signal Stores)   │     (Services + RxJS)     │
├────────────────────┼───────────────────────────┤
│ • Sidebar open     │ • Products, Orders        │
│ • Theme            │ • HttpClient + cache      │
│ • Selected tab     │ • shareReplay, refresh    │
│ • Modal state      │ • Interceptors            │
└────────────────────┴───────────────────────────┘
```

## Signal Stores — Estado del Cliente

```typescript
// shared/stores/ui.store.ts
import { Injectable, signal, computed, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UIStore {
  // State
  private _sidebarCollapsed = signal(this.loadFromStorage('sidebarCollapsed', false));
  private _theme = signal<'light' | 'dark' | 'system'>(this.loadFromStorage('theme', 'system'));
  private _currentModule = signal<string | null>(null);
  private _breadcrumbs = signal<Array<{ label: string; path?: string }>>([]);

  // Public signals (readonly)
  readonly sidebarCollapsed = this._sidebarCollapsed.asReadonly();
  readonly theme = this._theme.asReadonly();
  readonly currentModule = this._currentModule.asReadonly();
  readonly breadcrumbs = this._breadcrumbs.asReadonly();

  // Computed
  readonly effectiveTheme = computed(() => {
    const theme = this._theme();
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  });

  constructor() {
    // Persistir cambios automáticamente
    effect(() => {
      localStorage.setItem('erp-sidebar', JSON.stringify(this._sidebarCollapsed()));
    });
    effect(() => {
      const theme = this.effectiveTheme();
      document.documentElement.setAttribute('data-theme', theme);
    });
  }

  // Actions
  toggleSidebar() { this._sidebarCollapsed.update(v => !v); }
  setTheme(theme: 'light' | 'dark' | 'system') { this._theme.set(theme); }
  setCurrentModule(module: string) { this._currentModule.set(module); }
  setBreadcrumbs(items: Array<{ label: string; path?: string }>) { this._breadcrumbs.set(items); }

  private loadFromStorage<T>(key: string, defaultValue: T): T {
    try {
      const stored = localStorage.getItem(`erp-${key}`);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  }
}
```

### Auth Store

```typescript
// shared/stores/auth.store.ts
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private _user = signal<User | null>(this.loadUser());
  private _tokens = signal<TokenPair | null>(this.loadTokens());
  private _permissions = signal<Permission[]>(this.loadPermissions());

  readonly user = this._user.asReadonly();
  readonly tokens = this._tokens.asReadonly();
  readonly permissions = this._permissions.asReadonly();
  readonly isAuthenticated = computed(() => !!this._user() && !!this._tokens());
  readonly fullName = computed(() => {
    const u = this._user();
    return u ? `${u.firstName} ${u.lastName}` : '';
  });

  login(response: AuthResponse) {
    this._user.set(response.user);
    this._tokens.set(response.tokens);
    this._permissions.set(response.permissions);
    this.persistToStorage();
  }

  logout() {
    this._user.set(null);
    this._tokens.set(null);
    this._permissions.set([]);
    localStorage.removeItem('erp-auth');
  }

  updateTokens(tokens: TokenPair) {
    this._tokens.set(tokens);
    this.persistToStorage();
  }

  hasPermission(module: string, action: string, resource?: string): boolean {
    const user = this._user();
    if (user?.roles?.includes('admin')) return true;
    return this._permissions().some(p =>
      p.module === module && p.action === action &&
      (resource ? p.resource === resource : true)
    );
  }

  hasRole(role: string): boolean {
    return this._user()?.roles?.includes(role) ?? false;
  }

  private persistToStorage() {
    localStorage.setItem('erp-auth', JSON.stringify({
      user: this._user(),
      tokens: this._tokens(),
      permissions: this._permissions(),
    }));
  }

  private loadUser(): User | null {
    return this.loadFromStorage()?.user ?? null;
  }

  private loadTokens(): TokenPair | null {
    return this.loadFromStorage()?.tokens ?? null;
  }

  private loadPermissions(): Permission[] {
    return this.loadFromStorage()?.permissions ?? [];
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem('erp-auth');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}
```

## Servicios de Datos con HttpClient

```typescript
// modules/inventory/services/product.service.ts
@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/v1/inventory/products`;

  // Refresh trigger para invalidar cache
  private refreshTrigger$ = new BehaviorSubject<void>(undefined);

  findAll(params?: HttpParams): Observable<PaginatedResponse<Product>> {
    return this.http.get<ApiResponse<Product[]>>(this.baseUrl, { params }).pipe(
      map(res => ({
        items: res.data,
        total: res.meta.pagination.total,
        page: res.meta.pagination.page,
        pageSize: res.meta.pagination.pageSize,
        totalPages: res.meta.pagination.totalPages,
      })),
    );
  }

  findById(id: string): Observable<Product> {
    return this.http.get<ApiResponse<Product>>(`${this.baseUrl}/${id}`).pipe(
      map(res => res.data),
    );
  }

  create(data: CreateProductDTO): Observable<Product> {
    return this.http.post<ApiResponse<Product>>(this.baseUrl, data).pipe(
      map(res => res.data),
      tap(() => this.refresh()),
    );
  }

  update(id: string, data: UpdateProductDTO): Observable<Product> {
    return this.http.patch<ApiResponse<Product>>(`${this.baseUrl}/${id}`, data).pipe(
      map(res => res.data),
      tap(() => this.refresh()),
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => this.refresh()),
    );
  }

  export(params: HttpParams, format: 'xlsx' | 'csv'): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export`, {
      params: params.set('format', format),
      responseType: 'blob',
    });
  }

  // Trigger para que los componentes se refresquen
  refresh() { this.refreshTrigger$.next(); }
  get onRefresh$() { return this.refreshTrigger$.asObservable(); }
}
```

## HTTP Interceptors (Funcionales — Angular 17+)

```typescript
// shared/interceptors/auth.interceptor.ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const tokens = authStore.tokens();

  // Agregar token a todas las requests
  if (tokens?.accessToken) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${tokens.accessToken}` },
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && tokens?.refreshToken) {
        // Intentar refresh
        return inject(HttpClient)
          .post<ApiResponse<TokenPair>>('/v1/auth/refresh', { refreshToken: tokens.refreshToken })
          .pipe(
            switchMap(response => {
              authStore.updateTokens(response.data);
              // Reintentar request original
              const retryReq = req.clone({
                setHeaders: { Authorization: `Bearer ${response.data.accessToken}` },
              });
              return next(retryReq);
            }),
            catchError(() => {
              authStore.logout();
              inject(Router).navigate(['/login']);
              return throwError(() => error);
            }),
          );
      }
      return throwError(() => error);
    }),
  );
};

// shared/interceptors/error.interceptor.ts
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        snackBar.open('Error de conexión. Verifica tu internet.', 'OK', { duration: 5000 });
      } else if (error.status >= 500) {
        snackBar.open('Error interno del servidor. Intenta de nuevo.', 'OK', { duration: 5000 });
      } else if (error.status === 403) {
        snackBar.open('No tienes permisos para esta acción.', 'OK', { duration: 4000 });
      }
      // Los errores 400/422 se manejan en cada componente
      return throwError(() => error);
    }),
  );
};

// app.config.ts — Registrar interceptors
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideRouter(routes),
    provideAnimations(),
  ],
};
```

## Real-Time con SSE

```typescript
// shared/services/sse.service.ts
@Injectable({ providedIn: 'root' })
export class SSEService {
  private authStore = inject(AuthStore);
  private eventSource: EventSource | null = null;

  private notifications$ = new Subject<Notification>();
  private stockUpdates$ = new Subject<{ productId: string }>();
  private orderUpdates$ = new Subject<void>();

  readonly notifications = this.notifications$.asObservable();
  readonly stockUpdates = this.stockUpdates$.asObservable();
  readonly orderUpdates = this.orderUpdates$.asObservable();

  connect() {
    const token = this.authStore.tokens()?.accessToken;
    if (!token) return;

    this.disconnect(); // Cerrar conexión anterior

    this.eventSource = new EventSource(
      `${environment.apiUrl}/v1/events?token=${token}`
    );

    this.eventSource.addEventListener('notification', (event: MessageEvent) => {
      this.notifications$.next(JSON.parse(event.data));
    });

    this.eventSource.addEventListener('stock-update', (event: MessageEvent) => {
      this.stockUpdates$.next(JSON.parse(event.data));
    });

    this.eventSource.addEventListener('new-order', () => {
      this.orderUpdates$.next();
    });

    this.eventSource.onerror = () => {
      this.disconnect();
      setTimeout(() => this.connect(), 5000); // Reconectar
    };
  }

  disconnect() {
    this.eventSource?.close();
    this.eventSource = null;
  }
}

// Uso en un componente
export class DashboardComponent implements OnInit, OnDestroy {
  private sse = inject(SSEService);
  private productService = inject(ProductService);

  ngOnInit() {
    // Refrescar datos cuando llega un stock update
    this.sse.stockUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ productId }) => {
      this.productService.refresh();
    });

    // Mostrar notificaciones en tiempo real
    this.sse.notifications.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(notification => {
      this.snackBar.open(notification.title, 'Ver', { duration: 5000 });
    });
  }
}
```

## Cache con shareReplay

```typescript
// Ejemplo de servicio con cache
@Injectable({ providedIn: 'root' })
export class CategoryService {
  private http = inject(HttpClient);
  private cache$: Observable<Category[]> | null = null;

  findAll(): Observable<Category[]> {
    if (!this.cache$) {
      this.cache$ = this.http.get<ApiResponse<Category[]>>('/v1/inventory/categories').pipe(
        map(res => res.data),
        shareReplay({ bufferSize: 1, refCount: true }),
        tap({ error: () => this.cache$ = null }), // Limpiar cache en error
      );

      // Invalidar cache después de 5 minutos
      setTimeout(() => this.cache$ = null, 5 * 60 * 1000);
    }
    return this.cache$;
  }

  invalidateCache() {
    this.cache$ = null;
  }
}
```

## Guards de Ruta

```typescript
// shared/guards/auth.guard.ts
export const authGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (authStore.isAuthenticated()) return true;

  router.navigate(['/login']);
  return false;
};

// shared/guards/permission.guard.ts
export const permissionGuard = (module: string, action: string): CanActivateFn => {
  return () => {
    const authStore = inject(AuthStore);
    const snackBar = inject(MatSnackBar);

    if (authStore.hasPermission(module, action)) return true;

    snackBar.open('No tienes permisos para acceder a esta sección', 'OK', { duration: 4000 });
    return false;
  };
};

// Uso en rutas
export const routes: Routes = [
  { path: '', component: AppLayoutComponent, canActivate: [authGuard], children: [
    { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component') },
    { path: 'inventory', canActivate: [permissionGuard('inventory', 'read')], children: [
      { path: 'products', loadComponent: () => import('./modules/inventory/pages/product-list/product-list.component') },
      { path: 'products/new', canActivate: [permissionGuard('inventory', 'create')],
        loadComponent: () => import('./modules/inventory/pages/product-form/product-form.component') },
      { path: 'products/:id', loadComponent: () => import('./modules/inventory/pages/product-detail/product-detail.component') },
    ]},
    { path: 'sales', canActivate: [permissionGuard('sales', 'read')], children: [
      // ... rutas de ventas
    ]},
  ]},
  { path: 'login', loadComponent: () => import('./pages/login/login.component') },
  { path: '**', redirectTo: 'dashboard' },
];
```
