---
name: state-management-erp
description: >
  Gestión de estado avanzada para aplicaciones ERP complejas con React. Cubre Zustand para estado
  global, TanStack Query para server state con cache inteligente, React Hook Form para formularios
  complejos, sincronización optimista, real-time updates con WebSockets/SSE, y patrones de
  invalidación de cache. Usa esta skill SIEMPRE que necesites manejar estado en la aplicación
  frontend, implementar cache de datos del servidor, manejar formularios complejos, o integrar
  actualizaciones en tiempo real. Se activa con "estado", "state management", "Zustand", "React Query",
  "TanStack Query", "cache", "optimistic update", "WebSocket", "real-time", "formulario complejo",
  "react-hook-form", o cualquier referencia a gestión de estado en frontend.
---

# State Management — ERP con React

Arquitectura de gestión de estado profesional para aplicaciones empresariales complejas.

## Arquitectura de Estado

```
┌───────────────────────────────────────────────┐
│                 Frontend State                 │
├──────────────────┬────────────────────────────┤
│  Client State    │      Server State          │
│  (Zustand)       │      (TanStack Query)      │
├──────────────────┼────────────────────────────┤
│ • UI state       │ • Products, Orders, etc.   │
│ • Theme/sidebar  │ • Pagination, filters      │
│ • User prefs     │ • Cache + invalidation     │
│ • Modal state    │ • Background refetch       │
│ • Notifications  │ • Optimistic updates       │
└──────────────────┴────────────────────────────┘
```

### Regla de Oro
- **Server state** (datos del API): **TanStack Query**
- **Client state** (UI local): **Zustand**
- **Form state**: **React Hook Form**

## TanStack Query — Server State

### Configuración Global

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,         // 30s antes de considerar datos stale
      gcTime: 5 * 60_000,       // 5 min en cache antes de garbage collect
      retry: 2,
      refetchOnWindowFocus: true, // Refrescar al volver a la pestaña
      refetchOnReconnect: true,
      placeholderData: (prev) => prev, // Mantener datos previos mientras carga
    },
    mutations: {
      retry: 1,
    },
  },
});
```

### Query Keys Organizadas

```typescript
// lib/query-keys.ts — Keys centralizadas para evitar typos e inconsistencias

export const queryKeys = {
  // Inventario
  products: {
    all: ['products'] as const,
    lists: () => [...queryKeys.products.all, 'list'] as const,
    list: (filters: ProductFilters) => [...queryKeys.products.lists(), filters] as const,
    details: () => [...queryKeys.products.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.products.details(), id] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: () => [...queryKeys.categories.all, 'list'] as const,
  },

  // Ventas
  orders: {
    all: ['orders'] as const,
    lists: () => [...queryKeys.orders.all, 'list'] as const,
    list: (filters: OrderFilters) => [...queryKeys.orders.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.orders.all, 'detail', id] as const,
  },

  // Clientes
  customers: {
    all: ['customers'] as const,
    list: (filters: CustomerFilters) => [...queryKeys.customers.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.customers.all, 'detail', id] as const,
  },

  // Dashboard
  dashboard: {
    kpis: () => ['dashboard', 'kpis'] as const,
    salesChart: (period: string) => ['dashboard', 'sales-chart', period] as const,
  },
} as const;
```

### Hooks de Datos Tipados

```typescript
// hooks/api/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { productApi } from '@/lib/api/product.api';

// Lista de productos con filtros
export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: queryKeys.products.list(filters),
    queryFn: () => productApi.findAll(filters),
  });
}

// Detalle de un producto
export function useProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => productApi.findById(id),
    enabled: !!id, // No ejecutar si no hay id
  });
}

// Crear producto con invalidación de cache
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: productApi.create,
    onSuccess: () => {
      // Invalidar todas las listas de productos (con cualquier filtro)
      queryClient.invalidateQueries({ queryKey: queryKeys.products.lists() });
      // Invalidar dashboard KPIs
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.kpis() });
    },
  });
}

// Actualizar con optimistic update
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductDTO }) =>
      productApi.update(id, data),

    // Optimistic update: actualizar UI inmediatamente, revertir si falla
    onMutate: async ({ id, data }) => {
      // Cancelar queries en vuelo
      await queryClient.cancelQueries({ queryKey: queryKeys.products.detail(id) });

      // Snapshot del valor actual
      const previousProduct = queryClient.getQueryData(queryKeys.products.detail(id));

      // Actualizar optimistamente
      queryClient.setQueryData(queryKeys.products.detail(id), (old: Product) => ({
        ...old,
        ...data,
      }));

      return { previousProduct };
    },

    onError: (_err, { id }, context) => {
      // Revertir al valor anterior si falla
      if (context?.previousProduct) {
        queryClient.setQueryData(queryKeys.products.detail(id), context.previousProduct);
      }
    },

    onSettled: (_data, _err, { id }) => {
      // Siempre re-fetch para tener el dato real
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.lists() });
    },
  });
}

// Eliminar producto
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: productApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.lists() });
    },
  });
}
```

## Zustand — Client State

### Store de UI Global

```typescript
// stores/ui.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Current module context
  currentModule: string | null;
  setCurrentModule: (module: string) => void;

  // Breadcrumbs
  breadcrumbs: Array<{ label: string; path?: string }>;
  setBreadcrumbs: (items: Array<{ label: string; path?: string }>) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      theme: 'system',
      setTheme: (theme) => set({ theme }),

      currentModule: null,
      setCurrentModule: (module) => set({ currentModule: module }),

      breadcrumbs: [],
      setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
    }),
    {
      name: 'erp-ui-preferences',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    },
  ),
);
```

### Store de Auth

```typescript
// stores/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  tokens: TokenPair | null;
  permissions: Permission[];
  isAuthenticated: boolean;

  login: (response: AuthResponse) => void;
  logout: () => void;
  updateTokens: (tokens: TokenPair) => void;

  // Permission helpers
  hasPermission: (module: string, action: string, resource?: string) => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      permissions: [],
      isAuthenticated: false,

      login: (response) => set({
        user: response.user,
        tokens: response.tokens,
        permissions: response.permissions,
        isAuthenticated: true,
      }),

      logout: () => {
        set({ user: null, tokens: null, permissions: [], isAuthenticated: false });
        queryClient.clear(); // Limpiar toda la cache
      },

      updateTokens: (tokens) => set({ tokens }),

      hasPermission: (module, action, resource) => {
        const { permissions, user } = get();
        if (user?.roles?.includes('admin')) return true;
        return permissions.some(p =>
          p.module === module && p.action === action &&
          (resource ? p.resource === resource : true)
        );
      },

      hasRole: (role) => get().user?.roles?.includes(role) ?? false,
    }),
    {
      name: 'erp-auth',
      partialize: (state) => ({
        tokens: state.tokens,
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
```

## Real-Time Updates con SSE

```typescript
// hooks/useSSE.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

export function useSSE() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();

  useEffect(() => {
    if (!tokens?.accessToken) return;

    const eventSource = new EventSource(
      `${API_URL}/v1/events?token=${tokens.accessToken}`
    );

    // Notificaciones en tiempo real
    eventSource.addEventListener('notification', (event) => {
      const notification = JSON.parse(event.data);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // Mostrar toast
      toast.info(notification.title, { description: notification.message });
    });

    // Actualizaciones de stock en tiempo real
    eventSource.addEventListener('stock-update', (event) => {
      const { productId } = JSON.parse(event.data);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(productId) });
    });

    // Nuevo pedido
    eventSource.addEventListener('new-order', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.kpis() });
    });

    eventSource.onerror = () => {
      // Reconectar automáticamente después de 5 segundos
      eventSource.close();
      setTimeout(() => useSSE(), 5000);
    };

    return () => eventSource.close();
  }, [tokens?.accessToken]);
}
```

## API Client con Interceptors

```typescript
// lib/api/client.ts
const apiClient = {
  async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const { tokens, updateTokens, logout } = useAuthStore.getState();

    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(tokens?.accessToken && { Authorization: `Bearer ${tokens.accessToken}` }),
        ...options.headers,
      },
    });

    // Token expirado → intentar refresh
    if (response.status === 401 && tokens?.refreshToken) {
      const refreshResponse = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (refreshResponse.ok) {
        const newTokens = await refreshResponse.json();
        updateTokens(newTokens.data);
        // Reintentar request original con nuevo token
        return this.request(url, options);
      } else {
        logout();
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    }

    const data = await response.json();
    if (!response.ok) throw new ApiError(data.error);
    return data.data;
  },

  get: <T>(url: string) => apiClient.request<T>(url),
  post: <T>(url: string, body: unknown) => apiClient.request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) => apiClient.request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(url: string) => apiClient.request<T>(url, { method: 'DELETE' }),
};
```

## Anti-patrones

| ❌ Anti-patrón | ✅ Correcto |
|---|---|
| `useState` para datos del servidor | TanStack Query con cache |
| Redux para todo | Zustand (client) + TanStack Query (server) |
| Fetch en `useEffect` manual | `useQuery` con key y staleTime |
| Cache manual con Map/localStorage | TanStack Query cache automático |
| Polling cada 5s para updates | SSE / WebSocket para real-time |
| Re-fetch toda la lista al editar un item | Optimistic update + invalidation selectiva |
| Props drilling 4+ niveles | Zustand store o Context |
