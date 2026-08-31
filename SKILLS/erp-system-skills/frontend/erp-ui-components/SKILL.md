---
name: erp-ui-components
description: >
  Componentes de interfaz de usuario especializados para sistemas ERP. Cubre DataTables avanzadas con
  ordenamiento/filtros/paginación, formularios dinámicos multi-paso, dashboards con métricas KPI,
  filtros complejos y búsqueda facetada, bulk actions, modales de confirmación, wizards, y
  exportación de datos (PDF/Excel/CSV). Usa esta skill SIEMPRE que estés construyendo la UI de un
  módulo ERP, creando tablas de datos, formularios de captura, dashboards, o componentes interactivos
  empresariales. Se activa con "tabla de datos", "DataTable", "formulario", "dashboard", "KPI",
  "filtros", "exportar Excel", "exportar PDF", "wizard", "bulk action", "CRUD UI", "componente ERP",
  o cualquier referencia a componentes de interfaz para sistemas empresariales.
---

# ERP UI Components — React

Componentes profesionales de interfaz de usuario para sistemas ERP con React y TypeScript.

## DataTable Avanzada

El componente más importante de un ERP. Debe soportar ordenamiento, filtros, paginación, selección múltiple, acciones en lote, y exportación.

### Patrón de Implementación

```typescript
// hooks/useDataTable.ts — Hook reutilizable para cualquier tabla de datos
import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

interface UseDataTableParams<TFilter> {
  queryKey: string;
  fetchFn: (params: DataTableParams<TFilter>) => Promise<PaginatedResponse<any>>;
  defaultSort?: { field: string; order: 'asc' | 'desc' };
  defaultPageSize?: number;
}

export function useDataTable<TFilter>({
  queryKey,
  fetchFn,
  defaultSort = { field: 'createdAt', order: 'desc' },
  defaultPageSize = 20,
}: UseDataTableParams<TFilter>) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Estado sincronizado con URL (para deep linking)
  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || defaultPageSize;
  const sort = searchParams.get('sort') || defaultSort.field;
  const order = (searchParams.get('order') || defaultSort.order) as 'asc' | 'desc';
  const search = searchParams.get('search') || '';

  // Filters del URL
  const filters = Object.fromEntries(
    [...searchParams.entries()].filter(([key]) =>
      !['page', 'pageSize', 'sort', 'order', 'search'].includes(key)
    )
  ) as TFilter;

  // Query con TanStack Query
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [queryKey, { page, pageSize, sort, order, search, ...filters }],
    queryFn: () => fetchFn({ page, pageSize, sort, order, search, filters }),
    placeholderData: (prev) => prev, // Mantener datos anteriores mientras carga
  });

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!data) return;
    const allIds = new Set(data.items.map(item => item.id));
    setSelectedIds(prev => prev.size === allIds.size ? new Set() : allIds);
  }, [data]);

  // Actualizar URL al cambiar parámetros
  const updateParams = useCallback((updates: Record<string, string | undefined>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '') {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      return next;
    });
  }, [setSearchParams]);

  return {
    data: data?.items ?? [],
    pagination: data?.meta?.pagination,
    isLoading,
    isError,
    refetch,
    // Sorting
    sort, order,
    onSort: (field: string) => updateParams({
      sort: field,
      order: sort === field && order === 'asc' ? 'desc' : 'asc',
      page: '1',
    }),
    // Pagination
    page, pageSize,
    onPageChange: (p: number) => updateParams({ page: String(p) }),
    onPageSizeChange: (size: number) => updateParams({ pageSize: String(size), page: '1' }),
    // Search
    search,
    onSearch: (q: string) => updateParams({ search: q, page: '1' }),
    // Filters
    filters,
    onFilter: (key: string, value: string | undefined) => updateParams({ [key]: value, page: '1' }),
    onClearFilters: () => setSearchParams({}),
    // Selection
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection: () => setSelectedIds(new Set()),
    isAllSelected: data ? selectedIds.size === data.items.length : false,
  };
}
```

### Componente DataTable

```tsx
// components/DataTable/DataTable.tsx
interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading: boolean;
  pagination?: PaginationMeta;
  sort?: string;
  order?: 'asc' | 'desc';
  selectedIds?: Set<string>;
  onSort?: (field: string) => void;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  onSelect?: (id: string) => void;
  onSelectAll?: () => void;
  isAllSelected?: boolean;
  emptyMessage?: string;
  bulkActions?: BulkAction[];
}

export function DataTable<T extends { id: string }>({
  columns, data, isLoading, pagination, sort, order,
  selectedIds, onSort, onPageChange, onRowClick,
  onSelect, onSelectAll, isAllSelected, emptyMessage,
  bulkActions,
}: DataTableProps<T>) {
  return (
    <div className="data-table-wrapper">
      {/* Bulk Actions Bar */}
      {selectedIds && selectedIds.size > 0 && bulkActions && (
        <div className="bulk-actions-bar">
          <span>{selectedIds.size} seleccionados</span>
          {bulkActions.map(action => (
            <button key={action.key} onClick={() => action.onExecute([...selectedIds])}
              className={`btn btn-sm ${action.variant ?? 'default'}`}>
              {action.icon} {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <table className="data-table">
        <thead>
          <tr>
            {onSelect && (
              <th className="checkbox-col">
                <input type="checkbox" checked={isAllSelected} onChange={onSelectAll} />
              </th>
            )}
            {columns.map(col => (
              <th key={col.key} style={{ width: col.width }}
                className={col.sortable ? 'sortable' : ''}
                onClick={() => col.sortable && onSort?.(col.key)}>
                {col.header}
                {sort === col.key && (
                  <span className="sort-indicator">{order === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={columns.length + (onSelect ? 1 : 0)}>
              <div className="table-skeleton">Cargando...</div>
            </td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={columns.length + (onSelect ? 1 : 0)}>
              <div className="empty-state">{emptyMessage ?? 'No hay datos'}</div>
            </td></tr>
          ) : data.map(row => (
            <tr key={row.id}
              className={`${selectedIds?.has(row.id) ? 'selected' : ''} ${onRowClick ? 'clickable' : ''}`}
              onClick={() => onRowClick?.(row)}>
              {onSelect && (
                <td className="checkbox-col" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds?.has(row.id)} onChange={() => onSelect(row.id)} />
                </td>
              )}
              {columns.map(col => (
                <td key={col.key}>
                  {col.render ? col.render(row) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {pagination && (
        <div className="table-pagination">
          <span>{pagination.total} registros</span>
          <div className="pagination-controls">
            <button disabled={!pagination.hasPreviousPage}
              onClick={() => onPageChange?.(pagination.page - 1)}>← Anterior</button>
            <span>Página {pagination.page} de {pagination.totalPages}</span>
            <button disabled={!pagination.hasNextPage}
              onClick={() => onPageChange?.(pagination.page + 1)}>Siguiente →</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Uso — Lista de Productos

```tsx
// pages/inventory/ProductList.tsx
const productColumns: Column<Product>[] = [
  { key: 'sku', header: 'SKU', sortable: true, width: '120px' },
  { key: 'name', header: 'Producto', sortable: true,
    render: (row) => (
      <div className="product-cell">
        {row.imageUrl && <img src={row.imageUrl} alt="" className="product-thumb" />}
        <div>
          <span className="product-name">{row.name}</span>
          <span className="product-category">{row.category.name}</span>
        </div>
      </div>
    ),
  },
  { key: 'unitPrice', header: 'Precio', sortable: true, width: '100px',
    render: (row) => formatCurrency(row.unitPrice),
  },
  { key: 'currentStock', header: 'Stock', sortable: true, width: '100px',
    render: (row) => (
      <span className={`stock-badge ${row.currentStock <= row.minimumStock ? 'low' : 'ok'}`}>
        {row.currentStock}
      </span>
    ),
  },
  { key: 'isActive', header: 'Estado', width: '80px',
    render: (row) => <StatusBadge active={row.isActive} />,
  },
  { key: 'actions', header: '', width: '60px',
    render: (row) => <RowActions id={row.id} onEdit={handleEdit} onDelete={handleDelete} />,
  },
];
```

## Formularios Dinámicos

### Hook para Formularios con Validación

```typescript
// Usa react-hook-form + zod para formularios ERP
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function ProductForm({ product, onSubmit }: ProductFormProps) {
  const form = useForm<CreateProductDTO>({
    resolver: zodResolver(CreateProductSchema),
    defaultValues: product ?? {
      sku: '', name: '', description: '',
      unitPrice: 0, costPrice: 0,
      minimumStock: 0, unitOfMeasure: 'UNIT',
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="form-grid">
      <FormField label="SKU" error={form.formState.errors.sku?.message} required>
        <input {...form.register('sku')} placeholder="Ej: PROD-001" />
      </FormField>

      <FormField label="Nombre" error={form.formState.errors.name?.message} required>
        <input {...form.register('name')} placeholder="Nombre del producto" />
      </FormField>

      <FormField label="Precio Unitario" error={form.formState.errors.unitPrice?.message} required>
        <CurrencyInput control={form.control} name="unitPrice" />
      </FormField>

      <FormField label="Categoría" error={form.formState.errors.categoryId?.message} required>
        <AsyncSelect
          control={form.control}
          name="categoryId"
          loadOptions={fetchCategories}
          placeholder="Seleccionar categoría"
        />
      </FormField>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
```

## Dashboard con KPIs

```tsx
// components/Dashboard/KPICard.tsx
interface KPICardProps {
  title: string;
  value: string | number;
  previousValue?: number;
  format?: 'currency' | 'number' | 'percentage';
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

function KPICard({ title, value, previousValue, format, icon, trend, color }: KPICardProps) {
  const formattedValue = format === 'currency' ? formatCurrency(value)
    : format === 'percentage' ? `${value}%`
    : formatNumber(value);

  const change = previousValue
    ? (((value as number) - previousValue) / previousValue * 100).toFixed(1)
    : null;

  return (
    <div className="kpi-card" style={{ '--accent': color }}>
      <div className="kpi-header">
        <span className="kpi-icon">{icon}</span>
        <span className="kpi-title">{title}</span>
      </div>
      <div className="kpi-value">{formattedValue}</div>
      {change && (
        <div className={`kpi-trend ${trend}`}>
          {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}
          {change}% vs periodo anterior
        </div>
      )}
    </div>
  );
}

// Uso en Dashboard
function SalesDashboard() {
  const { data: kpis } = useQuery({ queryKey: ['dashboard-kpis'], queryFn: fetchDashboardKPIs });

  return (
    <div className="dashboard">
      <div className="kpi-grid">
        <KPICard title="Ventas del Mes" value={kpis.monthlySales} format="currency"
          previousValue={kpis.previousMonthlySales} trend="up" icon="💰" color="#10b981" />
        <KPICard title="Órdenes Activas" value={kpis.activeOrders} format="number"
          icon="📦" color="#3b82f6" />
        <KPICard title="Productos Bajo Stock" value={kpis.lowStockCount} format="number"
          icon="⚠️" color="#f59e0b" trend="down" />
        <KPICard title="Facturas Pendientes" value={kpis.pendingInvoices} format="currency"
          icon="📄" color="#ef4444" />
      </div>

      <div className="dashboard-charts">
        <SalesChart data={kpis.salesByMonth} />
        <TopProductsChart data={kpis.topProducts} />
      </div>
    </div>
  );
}
```

## Exportación de Datos

```typescript
// utils/export.ts
export async function exportToExcel(data: any[], columns: ExportColumn[], filename: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(
    data.map(row => Object.fromEntries(
      columns.map(col => [col.header, col.format ? col.format(row[col.key]) : row[col.key]])
    ))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export async function exportToCSV(data: any[], columns: ExportColumn[], filename: string) {
  const header = columns.map(c => c.header).join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const val = col.format ? col.format(row[col.key]) : row[col.key];
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  downloadFile(csv, `${filename}.csv`, 'text/csv');
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

## Patrones de UI ERP

### Status Badges

```tsx
const STATUS_CONFIG = {
  DRAFT:      { label: 'Borrador',    color: '#6b7280', bg: '#f3f4f6' },
  CONFIRMED:  { label: 'Confirmado',  color: '#2563eb', bg: '#dbeafe' },
  PROCESSING: { label: 'Procesando',  color: '#d97706', bg: '#fef3c7' },
  SHIPPED:    { label: 'Enviado',     color: '#7c3aed', bg: '#ede9fe' },
  DELIVERED:  { label: 'Entregado',   color: '#059669', bg: '#d1fae5' },
  CANCELLED:  { label: 'Cancelado',   color: '#dc2626', bg: '#fee2e2' },
  PAID:       { label: 'Pagado',      color: '#059669', bg: '#d1fae5' },
  OVERDUE:    { label: 'Vencido',     color: '#dc2626', bg: '#fee2e2' },
} as const;

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span className="status-badge" style={{ color: config.color, backgroundColor: config.bg }}>
      {config.label}
    </span>
  );
}
```

### Confirmation Modal

```tsx
function useConfirmation() {
  const [state, setState] = useState<{ open: boolean; config: ConfirmConfig | null }>({
    open: false, config: null,
  });

  const confirm = useCallback((config: ConfirmConfig) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, config: { ...config, resolve } });
    });
  }, []);

  return { confirm, state, close: () => setState({ open: false, config: null }) };
}

// Uso
const { confirm } = useConfirmation();

async function handleDelete(id: string) {
  const confirmed = await confirm({
    title: '¿Eliminar producto?',
    message: 'Esta acción no se puede deshacer. El producto será desactivado.',
    confirmLabel: 'Sí, eliminar',
    cancelLabel: 'Cancelar',
    variant: 'danger',
  });

  if (confirmed) {
    await deleteProduct(id);
    toast.success('Producto eliminado');
    refetch();
  }
}

### 🧠 HUMAN-LIKE THINKING & EXPERT EXECUTION DIRECTIVES
- **STOP BEING GENERIC**: Never generate raw HTML tables with grey borders or bootstrap-like basic grids. Think like a top-tier Product Designer.
- **Aesthetics First**: Enforce Glassmorphism, deep SaaS color palettes, and flawless typography hierarchies (e.g. Inter/Outfit). If it looks like a tutorial, you failed.
- **Micro-interactions**: Everything must feel alive. Hover states, soft lifts, pulse animations on badges.
- **Optimistic UI**: Do not wait for server responses to update the UI. Assume success, revert on failure. Mask latency like a senior engineer.
- **Edge Cases**: Empty states must be beautiful illustrations or clear call-to-actions, never just "No data". Handle long text truncations and responsive overflow.```
