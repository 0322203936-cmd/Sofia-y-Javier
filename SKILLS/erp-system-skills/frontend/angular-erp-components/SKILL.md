---
name: angular-erp-components
description: >
  Componentes de interfaz de usuario especializados para sistemas ERP con Angular 17+. Cubre
  DataTables avanzadas con Angular Material CDK, formularios reactivos multi-paso con validación,
  dashboards con métricas KPI, pipes personalizados para moneda/fecha/estado, directivas reutilizables,
  exportación de datos, dialogs de confirmación y standalone components. Usa esta skill SIEMPRE que
  estés construyendo la UI de un ERP con Angular, creando tablas de datos, formularios, dashboards,
  o componentes empresariales. Se activa con "Angular", "Angular Material", "componente Angular",
  "tabla Angular", "formulario reactivo", "reactive forms", "mat-table", "pipe", "directiva",
  "standalone component", "Angular ERP", o cualquier referencia a componentes Angular empresariales.
---

# Angular ERP Components — Angular 17+

Componentes profesionales para sistemas ERP con Angular standalone components, signals y Angular Material.

## Principios

1. **Standalone components** — Sin NgModules, cada componente se importa directamente
2. **Signals first** — Usar Angular Signals para estado reactivo local
3. **OnPush everywhere** — ChangeDetection.OnPush en todos los componentes
4. **Typed forms** — Formularios fuertemente tipados con `FormGroup<T>`

## DataTable Avanzada

### Servicio Reutilizable de DataTable

```typescript
// shared/services/data-table.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

export interface DataTableState<TFilter = Record<string, string>> {
  page: number;
  pageSize: number;
  sort: string;
  order: 'asc' | 'desc';
  search: string;
  filters: TFilter;
  selectedIds: Set<string>;
}

export function createDataTableState<TFilter>(defaults?: Partial<DataTableState<TFilter>>): DataTableState<TFilter> {
  return {
    page: 1,
    pageSize: 20,
    sort: 'createdAt',
    order: 'desc',
    search: '',
    filters: {} as TFilter,
    selectedIds: new Set(),
    ...defaults,
  };
}

// Hook-like pattern con signals
export class DataTableController<T, TFilter = Record<string, string>> {
  private _state = signal(createDataTableState<TFilter>());

  readonly state = this._state.asReadonly();
  readonly page = computed(() => this._state().page);
  readonly pageSize = computed(() => this._state().pageSize);
  readonly sort = computed(() => this._state().sort);
  readonly order = computed(() => this._state().order);
  readonly search = computed(() => this._state().search);
  readonly selectedIds = computed(() => this._state().selectedIds);
  readonly selectedCount = computed(() => this._state().selectedIds.size);

  // Actualizar estado
  setPage(page: number) {
    this._state.update(s => ({ ...s, page }));
  }

  setPageSize(pageSize: number) {
    this._state.update(s => ({ ...s, pageSize, page: 1 }));
  }

  setSort(field: string) {
    this._state.update(s => ({
      ...s,
      sort: field,
      order: s.sort === field && s.order === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  }

  setSearch(search: string) {
    this._state.update(s => ({ ...s, search, page: 1 }));
  }

  setFilter(key: keyof TFilter, value: string | undefined) {
    this._state.update(s => {
      const filters = { ...s.filters };
      if (value === undefined || value === '') {
        delete (filters as any)[key];
      } else {
        (filters as any)[key] = value;
      }
      return { ...s, filters, page: 1 };
    });
  }

  clearFilters() {
    this._state.update(s => ({ ...s, filters: {} as TFilter, search: '', page: 1 }));
  }

  toggleSelect(id: string) {
    this._state.update(s => {
      const selected = new Set(s.selectedIds);
      selected.has(id) ? selected.delete(id) : selected.add(id);
      return { ...s, selectedIds: selected };
    });
  }

  selectAll(ids: string[]) {
    this._state.update(s => {
      const allSelected = ids.every(id => s.selectedIds.has(id));
      return { ...s, selectedIds: allSelected ? new Set() : new Set(ids) };
    });
  }

  clearSelection() {
    this._state.update(s => ({ ...s, selectedIds: new Set() }));
  }

  // Construir HttpParams para el API
  toHttpParams(): HttpParams {
    const s = this._state();
    let params = new HttpParams()
      .set('page', s.page)
      .set('pageSize', s.pageSize)
      .set('sort', s.sort)
      .set('order', s.order);

    if (s.search) params = params.set('search', s.search);

    for (const [key, value] of Object.entries(s.filters as Record<string, string>)) {
      if (value) params = params.set(key, value);
    }

    return params;
  }
}
```

### Componente DataTable

```typescript
// shared/components/data-table/data-table.component.ts
import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatProgressBarModule } from '@angular/material/progress-bar';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  cell?: (row: T) => string;
  templateRef?: string; // Para columnas con template custom
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [
    CommonModule, MatTableModule, MatCheckboxModule,
    MatPaginatorModule, MatSortModule, MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Bulk Actions -->
    @if (selectedCount() > 0 && bulkActions().length > 0) {
      <div class="bulk-actions-bar">
        <span>{{ selectedCount() }} seleccionados</span>
        @for (action of bulkActions(); track action.key) {
          <button mat-stroked-button [color]="action.color ?? 'primary'"
            (click)="action.handler([...selectedIds()])">
            {{ action.label }}
          </button>
        }
        <button mat-button (click)="clearSelection.emit()">Deseleccionar</button>
      </div>
    }

    <!-- Loading Bar -->
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <!-- Table -->
    <div class="table-container">
      <table mat-table [dataSource]="data()" matSort
        (matSortChange)="sortChange.emit($event)">

        <!-- Checkbox Column -->
        @if (selectable()) {
          <ng-container matColumnDef="select">
            <th mat-header-cell *matHeaderCellDef>
              <mat-checkbox
                [checked]="isAllSelected()"
                [indeterminate]="selectedCount() > 0 && !isAllSelected()"
                (change)="selectAll.emit()">
              </mat-checkbox>
            </th>
            <td mat-cell *matCellDef="let row">
              <mat-checkbox
                [checked]="selectedIds().has(row.id)"
                (change)="toggleSelect.emit(row.id)"
                (click)="$event.stopPropagation()">
              </mat-checkbox>
            </td>
          </ng-container>
        }

        <!-- Dynamic Columns -->
        @for (col of columns(); track col.key) {
          <ng-container [matColumnDef]="col.key">
            <th mat-header-cell *matHeaderCellDef
              [mat-sort-header]="col.sortable ? col.key : ''"
              [disabled]="!col.sortable"
              [style.width]="col.width">
              {{ col.header }}
            </th>
            <td mat-cell *matCellDef="let row">
              <ng-container *ngTemplateOutlet="
                cellTemplates()[col.key] || defaultCell;
                context: { $implicit: row, column: col }
              " />
              <ng-template #defaultCell>
                {{ col.cell ? col.cell(row) : row[col.key] }}
              </ng-template>
            </td>
          </ng-container>
        }

        <tr mat-header-row *matHeaderRowDef="displayedColumns()" />
        <tr mat-row *matRowDef="let row; columns: displayedColumns()"
          [class.selected]="selectedIds().has(row.id)"
          [class.clickable]="!!rowClick.observed"
          (click)="rowClick.emit(row)" />
      </table>

      <!-- Empty State -->
      @if (!loading() && data().length === 0) {
        <div class="empty-state">
          <p>{{ emptyMessage() }}</p>
        </div>
      }
    </div>

    <!-- Paginator -->
    @if (totalItems() > 0) {
      <mat-paginator
        [length]="totalItems()"
        [pageIndex]="page() - 1"
        [pageSize]="pageSize()"
        [pageSizeOptions]="[10, 20, 50, 100]"
        (page)="pageChange.emit($event)"
        showFirstLastButtons />
    }
  `,
})
export class DataTableComponent<T extends { id: string }> {
  // Inputs
  columns = input.required<ColumnDef<T>[]>();
  data = input.required<T[]>();
  loading = input(false);
  totalItems = input(0);
  page = input(1);
  pageSize = input(20);
  selectable = input(false);
  selectedIds = input<Set<string>>(new Set());
  emptyMessage = input('No hay datos para mostrar');
  bulkActions = input<BulkAction[]>([]);
  cellTemplates = input<Record<string, any>>({});

  // Outputs
  sortChange = output<Sort>();
  pageChange = output<PageEvent>();
  rowClick = output<T>();
  toggleSelect = output<string>();
  selectAll = output<void>();
  clearSelection = output<void>();

  // Computed
  displayedColumns = computed(() => {
    const cols = this.columns().map(c => c.key);
    return this.selectable() ? ['select', ...cols] : cols;
  });

  selectedCount = computed(() => this.selectedIds().size);
  isAllSelected = computed(() => {
    const data = this.data();
    return data.length > 0 && data.every(row => this.selectedIds().has(row.id));
  });
}
```

### Uso — Lista de Productos

```typescript
// modules/inventory/pages/product-list/product-list.component.ts
@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [DataTableComponent, MatButtonModule, MatInputModule, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <h1>Productos</h1>
      <button mat-raised-button color="primary" routerLink="new">
        + Nuevo Producto
      </button>
    </div>

    <!-- Filtros -->
    <div class="filters-bar">
      <mat-form-field appearance="outline">
        <mat-label>Buscar</mat-label>
        <input matInput [value]="table.search()"
          (input)="table.setSearch($any($event.target).value)"
          placeholder="SKU, nombre..." />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Categoría</mat-label>
        <mat-select (selectionChange)="table.setFilter('category', $event.value)">
          <mat-option value="">Todas</mat-option>
          @for (cat of categories(); track cat.id) {
            <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    <app-data-table
      [columns]="columns"
      [data]="products().items"
      [loading]="isLoading()"
      [totalItems]="products().total"
      [page]="table.page()"
      [pageSize]="table.pageSize()"
      [selectable]="true"
      [selectedIds]="table.selectedIds()"
      [bulkActions]="bulkActions"
      (sortChange)="table.setSort($event.active)"
      (pageChange)="table.setPage($event.pageIndex + 1)"
      (rowClick)="onRowClick($event)"
      (toggleSelect)="table.toggleSelect($event)"
      (selectAll)="table.selectAll(productIds())"
      (clearSelection)="table.clearSelection()"
    />
  `,
})
export class ProductListComponent {
  private productService = inject(ProductService);
  private router = inject(Router);

  table = new DataTableController<Product>();

  // Datos reactivos
  products = toSignal(
    toObservable(this.table.state).pipe(
      debounceTime(300),
      switchMap(state => this.productService.findAll(this.table.toHttpParams())),
    ),
    { initialValue: { items: [], total: 0 } },
  );

  categories = toSignal(inject(CategoryService).findAll(), { initialValue: [] });
  isLoading = signal(false);
  productIds = computed(() => this.products().items.map(p => p.id));

  columns: ColumnDef<Product>[] = [
    { key: 'sku', header: 'SKU', sortable: true, width: '120px' },
    { key: 'name', header: 'Producto', sortable: true },
    { key: 'unitPrice', header: 'Precio', sortable: true, width: '100px',
      cell: (row) => formatCurrency(row.unitPrice) },
    { key: 'currentStock', header: 'Stock', sortable: true, width: '90px' },
    { key: 'isActive', header: 'Estado', width: '80px' },
  ];

  bulkActions: BulkAction[] = [
    { key: 'delete', label: 'Eliminar', color: 'warn',
      handler: (ids) => this.bulkDelete(ids) },
    { key: 'export', label: 'Exportar', color: 'primary',
      handler: (ids) => this.exportSelected(ids) },
  ];

  onRowClick(product: Product) {
    this.router.navigate(['/inventory/products', product.id]);
  }
}
```

## Formularios Reactivos Tipados

```typescript
// modules/inventory/pages/product-form/product-form.component.ts
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

interface ProductForm {
  sku: FormControl<string>;
  name: FormControl<string>;
  description: FormControl<string>;
  unitPrice: FormControl<number>;
  costPrice: FormControl<number>;
  minimumStock: FormControl<number>;
  categoryId: FormControl<string>;
  unitOfMeasure: FormControl<string>;
}

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, CommonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form-grid">
      <mat-form-field appearance="outline">
        <mat-label>SKU</mat-label>
        <input matInput formControlName="sku" placeholder="Ej: PROD-001" />
        @if (form.controls.sku.hasError('required')) {
          <mat-error>SKU es requerido</mat-error>
        }
        @if (form.controls.sku.hasError('pattern')) {
          <mat-error>Solo letras mayúsculas, números y guiones</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Nombre</mat-label>
        <input matInput formControlName="name" />
        @if (form.controls.name.hasError('required')) {
          <mat-error>Nombre es requerido</mat-error>
        }
        @if (form.controls.name.hasError('minlength')) {
          <mat-error>Mínimo 2 caracteres</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Precio Unitario</mat-label>
        <input matInput type="number" formControlName="unitPrice" />
        <span matTextPrefix>$&nbsp;</span>
        @if (form.controls.unitPrice.hasError('min')) {
          <mat-error>El precio debe ser mayor a 0</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Categoría</mat-label>
        <mat-select formControlName="categoryId">
          @for (cat of categories(); track cat.id) {
            <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div class="form-actions">
        <button mat-button type="button" (click)="onCancel()">Cancelar</button>
        <button mat-raised-button color="primary" type="submit"
          [disabled]="form.invalid || saving()">
          {{ saving() ? 'Guardando...' : (isEdit() ? 'Actualizar' : 'Crear') }}
        </button>
      </div>
    </form>
  `,
})
export class ProductFormComponent {
  private fb = inject(FormBuilder);

  product = input<Product | null>(null);
  categories = input.required<Category[]>();
  formSubmit = output<CreateProductDTO>();

  saving = signal(false);
  isEdit = computed(() => !!this.product());

  form: FormGroup<ProductForm> = this.fb.group({
    sku: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/^[A-Z0-9-]+$/),
    ]),
    name: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(200),
    ]),
    description: this.fb.nonNullable.control(''),
    unitPrice: this.fb.nonNullable.control(0, [Validators.required, Validators.min(0.01)]),
    costPrice: this.fb.nonNullable.control(0, [Validators.min(0)]),
    minimumStock: this.fb.nonNullable.control(0, [Validators.min(0)]),
    categoryId: this.fb.nonNullable.control('', [Validators.required]),
    unitOfMeasure: this.fb.nonNullable.control('UNIT'),
  });

  constructor() {
    // Precargar datos si es edición
    effect(() => {
      const product = this.product();
      if (product) {
        this.form.patchValue(product);
        this.form.controls.sku.disable(); // SKU no editable
      }
    });
  }

  onSubmit() {
    if (this.form.valid) {
      this.formSubmit.emit(this.form.getRawValue());
    } else {
      this.form.markAllAsTouched();
    }
  }
}
```

## Pipes Personalizados para ERP

```typescript
// shared/pipes/currency.pipe.ts
@Pipe({ name: 'erpCurrency', standalone: true })
export class ErpCurrencyPipe implements PipeTransform {
  transform(value: number | string | null, currency = 'MXN'): string {
    if (value === null || value === undefined) return '—';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(num);
  }
}

// shared/pipes/relative-time.pipe.ts
@Pipe({ name: 'relativeTime', standalone: true })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | Date): string {
    const date = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Justo ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `Hace ${diffDays} días`;
    return date.toLocaleDateString('es-MX');
  }
}

// shared/pipes/status-label.pipe.ts
@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  private labels: Record<string, string> = {
    DRAFT: 'Borrador', CONFIRMED: 'Confirmado', PROCESSING: 'Procesando',
    SHIPPED: 'Enviado', DELIVERED: 'Entregado', CANCELLED: 'Cancelado',
    PAID: 'Pagado', OVERDUE: 'Vencido', SENT: 'Enviada',
    ACTIVE: 'Activo', INACTIVE: 'Inactivo',
    PENDING: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado',
  };

  transform(value: string): string {
    return this.labels[value] ?? value;
  }
}
```

## Status Badge Component

```typescript
// shared/components/status-badge/status-badge.component.ts
@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [style.color]="config().color"
    [style.background-color]="config().bg">{{ status() | statusLabel }}</span>`,
  imports: [StatusLabelPipe],
  styles: [`.badge {
    display: inline-block; padding: 2px 10px; border-radius: 12px;
    font-size: 0.75rem; font-weight: 500; white-space: nowrap;
  }`],
})
export class StatusBadgeComponent {
  status = input.required<string>();

  private statusConfig: Record<string, { color: string; bg: string }> = {
    DRAFT: { color: '#6b7280', bg: '#f3f4f6' },
    CONFIRMED: { color: '#2563eb', bg: '#dbeafe' },
    PROCESSING: { color: '#d97706', bg: '#fef3c7' },
    DELIVERED: { color: '#059669', bg: '#d1fae5' },
    CANCELLED: { color: '#dc2626', bg: '#fee2e2' },
    PAID: { color: '#059669', bg: '#d1fae5' },
    OVERDUE: { color: '#dc2626', bg: '#fee2e2' },
  };

  config = computed(() =>
    this.statusConfig[this.status()] ?? { color: '#6b7280', bg: '#f3f4f6' }
  );
}
```

## Confirm Dialog Service

```typescript
// shared/services/confirm-dialog.service.ts
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private dialog = inject(MatDialog);

  confirm(config: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    color?: 'primary' | 'warn';
  }): Observable<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: config,
      disableClose: true,
    });
    return ref.afterClosed();
  }
}

// Uso
async deleteProduct(id: string) {
  const confirmed = await firstValueFrom(
    this.confirmDialog.confirm({
      title: '¿Eliminar producto?',
      message: 'Esta acción desactivará el producto. Los registros históricos se mantienen.',
      confirmLabel: 'Sí, eliminar',
      color: 'warn',
    })
  );

  if (confirmed) {
    await firstValueFrom(this.productService.delete(id));
    this.snackBar.open('Producto eliminado', 'OK', { duration: 3000 });
    this.loadProducts();
  }
}
```
