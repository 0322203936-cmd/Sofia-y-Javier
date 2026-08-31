---
name: responsive-layout-system
description: >
  Sistema de layouts responsivos para dashboards y aplicaciones ERP. Cubre sidebar colapsable con
  navegación multi-nivel, header con búsqueda global y notificaciones, breadcrumbs dinámicos,
  tabs con rutas, CSS Grid/Flexbox para layouts de dashboard, sistema de design tokens, tema
  claro/oscuro, y responsive design para tablets y móviles. Usa esta skill SIEMPRE que estés
  construyendo el layout principal de la aplicación, la navegación, el sidebar, o implementando
  temas y design tokens. Se activa con "layout", "sidebar", "navegación", "breadcrumbs",
  "tema oscuro", "dark mode", "design tokens", "responsive", "header", "navbar", "menu lateral",
  o cualquier referencia a la estructura visual de la aplicación.
---

# Responsive Layout System — ERP

Sistema de layouts profesional para aplicaciones empresariales con React y CSS moderno.

## Estructura del Layout Principal

```
┌─────────────────────────────────────────────────┐
│ Header (búsqueda global, notificaciones, user)  │
├──────────┬──────────────────────────────────────┤
│          │ Breadcrumbs: Home > Inventario > ...  │
│  Side-   ├──────────────────────────────────────┤
│  bar     │                                       │
│          │           Main Content                │
│  (nav    │                                       │
│  multi-  │       (Page Component)                │
│  nivel)  │                                       │
│          │                                       │
│  [<<]    │                                       │
└──────────┴──────────────────────────────────────┘
```

## Design Tokens

```css
/* styles/tokens.css — Variables CSS del sistema de diseño */
:root {
  /* ─── Colors ─── */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;

  --color-success-500: #22c55e;
  --color-warning-500: #f59e0b;
  --color-danger-500: #ef4444;

  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;
  --color-gray-950: #030712;

  /* ─── Semantic Colors (Light Theme) ─── */
  --bg-primary: #ffffff;
  --bg-secondary: var(--color-gray-50);
  --bg-tertiary: var(--color-gray-100);
  --bg-sidebar: var(--color-gray-900);
  --bg-hover: var(--color-gray-100);
  --bg-selected: var(--color-primary-50);

  --text-primary: var(--color-gray-900);
  --text-secondary: var(--color-gray-600);
  --text-tertiary: var(--color-gray-400);
  --text-inverse: #ffffff;
  --text-link: var(--color-primary-600);

  --border-primary: var(--color-gray-200);
  --border-focus: var(--color-primary-500);

  /* ─── Spacing ─── */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */

  /* ─── Typography ─── */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;

  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* ─── Layout ─── */
  --sidebar-width: 260px;
  --sidebar-collapsed-width: 64px;
  --header-height: 56px;
  --content-max-width: 1400px;

  /* ─── Shadows ─── */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* ─── Borders ─── */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* ─── Transitions ─── */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;
}

/* ─── Dark Theme ─── */
[data-theme="dark"] {
  --bg-primary: var(--color-gray-900);
  --bg-secondary: var(--color-gray-800);
  --bg-tertiary: var(--color-gray-700);
  --bg-sidebar: var(--color-gray-950);
  --bg-hover: var(--color-gray-700);
  --bg-selected: rgba(59, 130, 246, 0.15);

  --text-primary: var(--color-gray-100);
  --text-secondary: var(--color-gray-400);
  --text-tertiary: var(--color-gray-500);

  --border-primary: var(--color-gray-700);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
}
```

## Layout Principal

```tsx
// layouts/AppLayout.tsx
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Breadcrumbs } from './Breadcrumbs';
import { useUIStore } from '@/stores/ui.store';

export function AppLayout() {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar />
      <div className="app-main">
        <Header />
        <div className="app-content">
          <Breadcrumbs />
          <main className="page-content">
            <Outlet /> {/* Aquí se renderiza la página actual */}
          </main>
        </div>
      </div>
    </div>
  );
}
```

```css
/* styles/layout.css */
.app-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-secondary);
}

.app-main {
  flex: 1;
  margin-left: var(--sidebar-width);
  transition: margin-left var(--transition-normal);
  display: flex;
  flex-direction: column;
}

.sidebar-collapsed .app-main {
  margin-left: var(--sidebar-collapsed-width);
}

.app-content {
  flex: 1;
  padding: var(--space-6);
  max-width: var(--content-max-width);
}

.page-content {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-primary);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
}

/* Responsive */
@media (max-width: 1024px) {
  .app-main {
    margin-left: 0;
  }

  .sidebar {
    position: fixed;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform var(--transition-normal);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 40;
  }
}

@media (max-width: 640px) {
  .app-content {
    padding: var(--space-3);
  }

  .page-content {
    padding: var(--space-4);
    border-radius: var(--radius-md);
  }
}
```

## Sidebar con Navegación Multi-Nivel

```tsx
// layouts/Sidebar.tsx
const navigationItems: NavItem[] = [
  { label: 'Dashboard', icon: '📊', path: '/dashboard' },
  {
    label: 'Inventario', icon: '📦', module: 'inventory',
    children: [
      { label: 'Productos', path: '/inventory/products' },
      { label: 'Categorías', path: '/inventory/categories' },
      { label: 'Almacenes', path: '/inventory/warehouses' },
      { label: 'Movimientos', path: '/inventory/movements' },
    ],
  },
  {
    label: 'Ventas', icon: '🛒', module: 'sales',
    children: [
      { label: 'Órdenes', path: '/sales/orders' },
      { label: 'Facturas', path: '/sales/invoices' },
      { label: 'Cotizaciones', path: '/sales/quotations' },
    ],
  },
  {
    label: 'Compras', icon: '🛍️', module: 'purchasing',
    children: [
      { label: 'Órdenes de Compra', path: '/purchasing/orders' },
      { label: 'Proveedores', path: '/purchasing/suppliers' },
      { label: 'Recepciones', path: '/purchasing/receipts' },
    ],
  },
  {
    label: 'Clientes', icon: '👥', module: 'crm',
    children: [
      { label: 'Lista de Clientes', path: '/crm/customers' },
      { label: 'Contactos', path: '/crm/contacts' },
    ],
  },
  {
    label: 'RRHH', icon: '🏢', module: 'hr',
    children: [
      { label: 'Empleados', path: '/hr/employees' },
      { label: 'Departamentos', path: '/hr/departments' },
      { label: 'Asistencia', path: '/hr/attendance' },
      { label: 'Nómina', path: '/hr/payroll' },
    ],
  },
  {
    label: 'Contabilidad', icon: '📒', module: 'accounting',
    children: [
      { label: 'Plan de Cuentas', path: '/accounting/accounts' },
      { label: 'Asientos', path: '/accounting/journal' },
    ],
  },
  {
    label: 'Reportes', icon: '📈', module: 'reports',
    children: [
      { label: 'Ventas', path: '/reports/sales' },
      { label: 'Inventario', path: '/reports/inventory' },
      { label: 'Financiero', path: '/reports/financial' },
    ],
  },
  { label: 'Configuración', icon: '⚙️', path: '/settings', module: 'settings' },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const location = useLocation();
  const { hasPermission } = useAuthStore();

  // Filtrar items por permisos del usuario
  const visibleItems = navigationItems.filter(item =>
    !item.module || hasPermission(item.module, 'read')
  );

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <img src="/logo.svg" alt="ERP" className="sidebar-logo" />
        {!sidebarCollapsed && <span className="sidebar-brand">Mi ERP</span>}
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map(item => (
          <NavItemComponent key={item.path ?? item.label}
            item={item} collapsed={sidebarCollapsed} currentPath={location.pathname} />
        ))}
      </nav>

      <button className="sidebar-toggle" onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}>
        {sidebarCollapsed ? '→' : '←'}
      </button>
    </aside>
  );
}
```

```css
/* styles/sidebar.css */
.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: var(--bg-sidebar);
  color: var(--text-inverse);
  display: flex;
  flex-direction: column;
  transition: width var(--transition-normal);
  z-index: 30;
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  min-height: var(--header-height);
}

.sidebar-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.sidebar-brand {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  white-space: nowrap;
}

.sidebar-nav {
  flex: 1;
  padding: var(--space-2) 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  font-size: var(--text-sm);
  border-radius: var(--radius-md);
  margin: 0 var(--space-2);
  transition: all var(--transition-fast);
  cursor: pointer;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.nav-item.active {
  background: var(--color-primary-600);
  color: #fff;
  font-weight: var(--font-medium);
}

.nav-item-icon {
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.nav-children {
  padding-left: var(--space-10);
  overflow: hidden;
  max-height: 0;
  transition: max-height var(--transition-normal);
}

.nav-children.expanded {
  max-height: 500px;
}

.sidebar-toggle {
  padding: var(--space-3);
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  transition: all var(--transition-fast);
}

.sidebar-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
```

## Header

```tsx
// layouts/Header.tsx
export function Header() {
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="app-header">
      <div className="header-search">
        <input type="search" placeholder="Buscar productos, órdenes, clientes..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="global-search" />
      </div>

      <div className="header-actions">
        <NotificationBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
```

## Theme Switcher

```typescript
// hooks/useTheme.ts
export function useTheme() {
  const { theme, setTheme } = useUIStore();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  return { theme, setTheme };
}
```

## Utility Classes

```css
/* styles/utilities.css */

/* Flexbox helpers */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: var(--space-2); }
.gap-4 { gap: var(--space-4); }
.gap-6 { gap: var(--space-6); }

/* Grid helpers */
.grid { display: grid; }
.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
.grid-cols-4 { grid-template-columns: repeat(4, 1fr); }

@media (max-width: 1024px) {
  .grid-cols-3, .grid-cols-4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .grid-cols-2, .grid-cols-3, .grid-cols-4 { grid-template-columns: 1fr; }
}

/* Page layout patterns */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
}

.page-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}

.page-actions {
  display: flex;
  gap: var(--space-3);
}

### 🧠 HUMAN-LIKE THINKING & EXPERT EXECUTION DIRECTIVES
- **STOP BEING GENERIC**: Never generate a stiff, blocky sidebar. Think like an Apple or Vercel UI engineer.
- **Liquid Layouts**: The layout must feel fluid. Collapsing a sidebar must be smooth with bezier curves. Content must reflow elegantly, not jump.
- **Hierarchy & Depth**: Use backdrop-filters (blur), subtle glows, and layered shadows (elevation) to separate the navigation from the content.
- **Contextual Awareness**: The layout isn't just CSS; it dictates UX. Anticipate how a user navigates. Submenus must be intuitive, breadcrumbs must reflect true state.
- **No Boilerplate**: Do not output generic CSS variables. Use deeply curated palettes that evoke a premium Enterprise feel.```
