---
name: reporting-engine
description: >
  Motor de reportes dinámicos para sistemas ERP. Cubre generación de reportes PDF y Excel,
  dashboards con métricas KPI en tiempo real, filtros por rango de fechas/sucursal/usuario,
  gráficos interactivos, exportación masiva y reportes programados. Usa esta skill SIEMPRE que
  necesites generar reportes, crear dashboards analíticos, exportar datos formateados, o
  implementar métricas de negocio. Se activa con "reporte", "PDF", "Excel", "dashboard",
  "KPI", "métricas", "gráfico", "chart", "estadísticas", "analítica", "exportar reporte",
  o cualquier referencia a reportes y visualización de datos empresariales.
---

# Reporting Engine — Sistemas ERP

Motor profesional de reportes y analítica para aplicaciones empresariales.

## Arquitectura de Reportes

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  API Reporte │───▶│  Report      │───▶│  Formato     │
│  (request)   │    │  Service     │    │  (PDF/XLSX)  │
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │
                    ┌──────┴───────┐
                    │  Query       │
                    │  Builder     │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │  PostgreSQL  │
                    │  (datos)     │
                    └──────────────┘
```

### Para reportes pesados → Background Job con notificación
### Para reportes ligeros → Respuesta directa en el request

## Reportes Predefinidos del ERP

| Reporte | Módulo | Frecuencia | Formato |
|---------|--------|------------|---------|
| Ventas del período | Ventas | Diario/Semanal/Mensual | PDF, Excel |
| Inventario valorizado | Inventario | Semanal | Excel |
| Estado de cuenta clientes | CRM | Mensual | PDF |
| Productos más vendidos | Ventas | Semanal | Excel |
| Movimientos de stock | Inventario | Diario | Excel |
| Facturación pendiente | Contabilidad | Semanal | PDF |
| Antigüedad de saldos | Contabilidad | Mensual | PDF |
| Compras por proveedor | Compras | Mensual | Excel |
| Asistencia de empleados | RRHH | Quincenal | Excel |
| Utilidad bruta | Contabilidad | Mensual | PDF |

## Servicio de Reportes

```typescript
// src/modules/reports/application/report.service.ts

interface ReportRequest {
  type: string;
  filters: {
    dateFrom?: Date;
    dateTo?: Date;
    branchId?: string;
    categoryId?: string;
    customerId?: string;
    status?: string;
  };
  format: 'pdf' | 'xlsx' | 'csv';
  userId: string;
}

export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfGenerator: PDFGenerator,
    private readonly excelGenerator: ExcelGenerator,
    private readonly reportQueue: Queue,
  ) {}

  async generate(request: ReportRequest): Promise<Result<ReportResult>> {
    // 1. Obtener datos según tipo de reporte
    const data = await this.fetchReportData(request.type, request.filters);

    // 2. Si el reporte es grande, procesarlo en background
    if (data.length > 5000) {
      const jobId = await this.reportQueue.add('generate-report', request);
      return Result.ok({ status: 'processing', jobId, message: 'El reporte se generará en segundo plano' });
    }

    // 3. Generar archivo
    const file = await this.formatReport(data, request);

    return Result.ok({ status: 'ready', fileUrl: file.url, fileName: file.name });
  }

  private async fetchReportData(type: string, filters: ReportFilters) {
    switch (type) {
      case 'sales-summary':
        return this.getSalesSummary(filters);
      case 'inventory-valuation':
        return this.getInventoryValuation(filters);
      case 'customer-statement':
        return this.getCustomerStatement(filters);
      case 'top-products':
        return this.getTopProducts(filters);
      default:
        throw new NotFoundError('Tipo de reporte no encontrado');
    }
  }

  // ─── Ejemplo: Reporte de Ventas ───
  private async getSalesSummary(filters: ReportFilters) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ['CONFIRMED', 'DELIVERED'] },
        createdAt: {
          gte: filters.dateFrom ?? subDays(new Date(), 30),
          lte: filters.dateTo ?? new Date(),
        },
        ...(filters.branchId && { branchId: filters.branchId }),
      },
      include: {
        customer: { select: { name: true, customerNumber: true } },
        items: { include: { product: { select: { name: true, sku: true, categoryId: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calcular métricas
    const summary = {
      totalSales: orders.reduce((sum, o) => sum + Number(o.total), 0),
      totalOrders: orders.length,
      averageOrderValue: orders.length > 0
        ? orders.reduce((sum, o) => sum + Number(o.total), 0) / orders.length
        : 0,
      byDay: this.groupByDay(orders),
      byCustomer: this.groupByCustomer(orders),
      byProduct: this.groupByProduct(orders),
      topProducts: this.getTopN(orders, 10),
    };

    return { orders, summary };
  }
}
```

## Generación de PDF

```typescript
// src/modules/reports/infrastructure/pdf-generator.ts
import PDFDocument from 'pdfkit';

export class PDFGenerator {
  async generateSalesReport(data: SalesReportData): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // ─── Header ───
      doc.fontSize(20).font('Helvetica-Bold').text('Reporte de Ventas', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#666')
        .text(`Período: ${format(data.dateFrom, 'dd/MM/yyyy')} - ${format(data.dateTo, 'dd/MM/yyyy')}`, { align: 'center' });
      doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, { align: 'center' });
      doc.moveDown(1);

      // ─── KPIs ───
      const kpiY = doc.y;
      this.drawKPIBox(doc, 50, kpiY, 'Total Ventas', formatCurrency(data.summary.totalSales));
      this.drawKPIBox(doc, 200, kpiY, 'Órdenes', String(data.summary.totalOrders));
      this.drawKPIBox(doc, 350, kpiY, 'Ticket Promedio', formatCurrency(data.summary.averageOrderValue));
      doc.moveDown(4);

      // ─── Tabla de Detalle ───
      this.drawTable(doc, {
        headers: ['Fecha', 'Orden', 'Cliente', 'Items', 'Total'],
        widths: [80, 80, 150, 50, 80],
        rows: data.orders.map(o => [
          format(o.createdAt, 'dd/MM/yyyy'),
          o.orderNumber,
          o.customer.name,
          String(o.items.length),
          formatCurrency(o.total),
        ]),
      });

      // ─── Footer ───
      doc.fontSize(8).fillColor('#999')
        .text('Sistema ERP — Reporte generado automáticamente', 50, doc.page.height - 50, { align: 'center' });

      doc.end();
    });
  }

  private drawKPIBox(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string) {
    doc.save();
    doc.roundedRect(x, y, 140, 60, 5).fillAndStroke('#f8f9fa', '#e5e7eb');
    doc.fillColor('#666').fontSize(9).text(label, x + 10, y + 10, { width: 120 });
    doc.fillColor('#111').fontSize(16).font('Helvetica-Bold').text(value, x + 10, y + 30, { width: 120 });
    doc.font('Helvetica');
    doc.restore();
  }

  private drawTable(doc: PDFKit.PDFDocument, config: TableConfig) {
    const startX = 50;
    let y = doc.y;

    // Header row
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151');
    config.headers.forEach((header, i) => {
      const x = startX + config.widths.slice(0, i).reduce((s, w) => s + w, 0);
      doc.text(header, x, y, { width: config.widths[i] });
    });

    y += 20;
    doc.moveTo(startX, y).lineTo(startX + config.widths.reduce((s, w) => s + w, 0), y).stroke('#d1d5db');
    y += 5;

    // Data rows
    doc.font('Helvetica').fontSize(8).fillColor('#4b5563');
    for (const row of config.rows) {
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }

      row.forEach((cell, i) => {
        const x = startX + config.widths.slice(0, i).reduce((s, w) => s + w, 0);
        doc.text(cell, x, y, { width: config.widths[i] });
      });
      y += 18;
    }
  }
}
```

## Generación de Excel

```typescript
// src/modules/reports/infrastructure/excel-generator.ts
import ExcelJS from 'exceljs';

export class ExcelGenerator {
  async generateSalesReport(data: SalesReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ERP System';
    workbook.created = new Date();

    // ─── Hoja: Resumen ───
    const summarySheet = workbook.addWorksheet('Resumen', {
      properties: { tabColor: { argb: '3B82F6' } },
    });

    summarySheet.mergeCells('A1:E1');
    const title = summarySheet.getCell('A1');
    title.value = 'Reporte de Ventas';
    title.font = { size: 16, bold: true, color: { argb: '1F2937' } };

    // KPIs
    summarySheet.getCell('A3').value = 'Total Ventas';
    summarySheet.getCell('B3').value = data.summary.totalSales;
    summarySheet.getCell('B3').numFmt = '$#,##0.00';
    summarySheet.getCell('A4').value = 'Total Órdenes';
    summarySheet.getCell('B4').value = data.summary.totalOrders;

    // ─── Hoja: Detalle ───
    const detailSheet = workbook.addWorksheet('Detalle de Ventas');

    // Headers con estilo
    const headers = ['Fecha', 'Orden', 'Cliente', 'Producto', 'Cantidad', 'Precio Unit.', 'Subtotal', 'Total'];
    const headerRow = detailSheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3B82F6' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: '1D4ED8' } },
      };
    });

    // Datos
    for (const order of data.orders) {
      for (const item of order.items) {
        detailSheet.addRow([
          format(order.createdAt, 'dd/MM/yyyy'),
          order.orderNumber,
          order.customer.name,
          item.product.name,
          item.quantity,
          Number(item.unitPrice),
          Number(item.lineTotal),
          Number(order.total),
        ]);
      }
    }

    // Formato de columnas
    detailSheet.getColumn(6).numFmt = '$#,##0.00'; // Precio
    detailSheet.getColumn(7).numFmt = '$#,##0.00'; // Subtotal
    detailSheet.getColumn(8).numFmt = '$#,##0.00'; // Total

    // Auto-width
    detailSheet.columns.forEach((col) => {
      col.width = Math.max(12, ...(col.values?.map(v => String(v ?? '').length) ?? [12]));
    });

    // Filtros automáticos
    detailSheet.autoFilter = { from: 'A1', to: `H${data.orders.length + 1}` };

    // Congelar header
    detailSheet.views = [{ state: 'frozen', ySplit: 1 }];

    return workbook.xlsx.writeBuffer() as Promise<Buffer>;
  }
}
```

## Endpoints de Reportes

```typescript
// src/modules/reports/infrastructure/routes/report.routes.ts
router.get('/sales/summary',
  requirePermission('reports', 'read', 'sales'),
  validate(ReportFiltersSchema, 'query'),
  reportController.salesSummary,
);

router.get('/inventory/valuation',
  requirePermission('reports', 'read', 'inventory'),
  validate(ReportFiltersSchema, 'query'),
  reportController.inventoryValuation,
);

router.get('/sales/export',
  requirePermission('reports', 'export', 'sales'),
  validate(ExportSchema, 'query'),
  reportController.exportSales,
);

// Dashboard KPIs (endpoint optimizado, cacheado)
router.get('/dashboard/kpis',
  reportController.dashboardKPIs,
);
```

## Dashboard KPIs — Queries Optimizadas

```typescript
async getDashboardKPIs() {
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(new Date());
  const prevMonthStart = startOfMonth(subMonths(new Date(), 1));

  const [
    monthlySales, prevMonthlySales,
    todayOrders, lowStockCount,
    pendingInvoices, topProducts,
  ] = await Promise.all([
    // Ventas del mes actual
    this.prisma.order.aggregate({
      _sum: { total: true }, _count: true,
      where: { status: { in: ['CONFIRMED', 'DELIVERED'] }, createdAt: { gte: monthStart } },
    }),
    // Ventas del mes anterior (para comparación)
    this.prisma.order.aggregate({
      _sum: { total: true },
      where: { status: { in: ['CONFIRMED', 'DELIVERED'] }, createdAt: { gte: prevMonthStart, lt: monthStart } },
    }),
    // Órdenes de hoy
    this.prisma.order.count({ where: { createdAt: { gte: today } } }),
    // Productos con stock bajo
    this.prisma.$queryRaw`
      SELECT COUNT(*) FROM products
      WHERE current_stock <= minimum_stock AND is_active = true AND deleted_at IS NULL
    `,
    // Facturas pendientes
    this.prisma.invoice.aggregate({
      _sum: { total: true }, _count: true,
      where: { status: { in: ['SENT', 'OVERDUE'] } },
    }),
    // Top 5 productos más vendidos (este mes)
    this.prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      _sum: { quantity: true, lineTotal: true },
      where: { order: { createdAt: { gte: monthStart }, status: { in: ['CONFIRMED', 'DELIVERED'] } } },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 5,
    }),
  ]);

  return {
    monthlySales: Number(monthlySales._sum.total ?? 0),
    monthlyOrders: monthlySales._count,
    prevMonthlySales: Number(prevMonthlySales._sum.total ?? 0),
    todayOrders,
    lowStockCount: Number(lowStockCount[0]?.count ?? 0),
    pendingInvoicesAmount: Number(pendingInvoices._sum.total ?? 0),
    pendingInvoicesCount: pendingInvoices._count,
    topProducts: topProducts.map(p => ({
      name: p.productName,
      totalSold: Number(p._sum.quantity),
      totalRevenue: Number(p._sum.lineTotal),
    })),
  };
}
```
