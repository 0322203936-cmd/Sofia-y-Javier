---
name: data-import-export
description: >
  Sistema de importación y exportación masiva de datos para ERP. Cubre importación desde Excel/CSV
  con validación fila por fila, mapeo de columnas, transformación de datos, reporte de errores
  detallado, exportación con formatos personalizados, y procesamiento batch. Usa esta skill
  SIEMPRE que necesites importar datos masivos, cargar catálogos desde archivos, exportar datos
  formateados, o migrar datos entre sistemas. Se activa con "importar", "import", "cargar datos",
  "subir Excel", "CSV", "carga masiva", "migración de datos", "mapeo de columnas",
  o cualquier referencia a importación o exportación de datos.
---

# Data Import/Export — Sistemas ERP

Sistema robusto de importación y exportación masiva de datos con validación y manejo de errores.

## Flujo de Importación

```
Upload archivo → Parsear → Validar estructura →
Validar cada fila → Previsualizar errores →
Confirmar → Procesar en batch → Reporte final
```

## API de Importación

```typescript
// src/modules/import-export/application/import.service.ts
import * as XLSX from 'xlsx';
import { z } from 'zod';

export class ImportService {
  // ─── Paso 1: Parsear y Previsualizar ───
  async preview(file: Buffer, config: ImportConfig): Promise<ImportPreview> {
    const workbook = XLSX.read(file, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rawData.length === 0) {
      return { success: false, error: 'El archivo está vacío', rows: [] };
    }

    if (rawData.length > 10000) {
      return { success: false, error: 'Máximo 10,000 filas por importación', rows: [] };
    }

    // Detectar columnas del archivo
    const fileColumns = Object.keys(rawData[0]);

    // Validar cada fila
    const rows: ImportRow[] = rawData.map((row, index) => {
      const mapped = this.mapColumns(row, config.columnMapping);
      const validation = this.validateRow(mapped, config.schema, index);
      return {
        rowNumber: index + 2, // +2 porque Excel empieza en 1 y tiene header
        original: row,
        mapped,
        isValid: validation.isValid,
        errors: validation.errors,
      };
    });

    const validCount = rows.filter(r => r.isValid).length;
    const errorCount = rows.filter(r => !r.isValid).length;

    return {
      success: true,
      totalRows: rows.length,
      validRows: validCount,
      errorRows: errorCount,
      fileColumns,
      preview: rows.slice(0, 20), // Primeras 20 filas para preview
      errors: rows.filter(r => !r.isValid).slice(0, 100), // Primeros 100 errores
    };
  }

  // ─── Paso 2: Ejecutar Importación ───
  async execute(file: Buffer, config: ImportConfig, userId: string): Promise<ImportResult> {
    const workbook = XLSX.read(file, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const results: ImportRowResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Procesar en batches de 100
    const batchSize = 100;
    for (let i = 0; i < rawData.length; i += batchSize) {
      const batch = rawData.slice(i, i + batchSize);

      await this.prisma.$transaction(async (tx) => {
        for (let j = 0; j < batch.length; j++) {
          const rowNumber = i + j + 2;
          const row = batch[j];

          try {
            const mapped = this.mapColumns(row, config.columnMapping);
            const validation = this.validateRow(mapped, config.schema, rowNumber);

            if (!validation.isValid) {
              results.push({ rowNumber, status: 'error', errors: validation.errors });
              errorCount++;
              continue;
            }

            // Verificar duplicados
            if (config.uniqueField) {
              const existing = await tx[config.model].findFirst({
                where: { [config.uniqueField]: mapped[config.uniqueField] },
              });
              if (existing) {
                if (config.onDuplicate === 'skip') {
                  results.push({ rowNumber, status: 'skipped', reason: 'Duplicado' });
                  skippedCount++;
                  continue;
                }
                if (config.onDuplicate === 'update') {
                  await tx[config.model].update({ where: { id: existing.id }, data: mapped });
                  results.push({ rowNumber, status: 'updated' });
                  successCount++;
                  continue;
                }
              }
            }

            // Crear registro
            await tx[config.model].create({ data: { ...mapped, createdBy: userId } });
            results.push({ rowNumber, status: 'created' });
            successCount++;

          } catch (error) {
            results.push({ rowNumber, status: 'error', errors: [{ field: 'general', message: error.message }] });
            errorCount++;
          }
        }
      });
    }

    // Generar reporte de importación
    const report = {
      timestamp: new Date(),
      totalRows: rawData.length,
      created: successCount,
      errors: errorCount,
      skipped: skippedCount,
      results,
      userId,
    };

    // Guardar log de importación
    await this.importLogRepo.create(report);

    return report;
  }

  // ─── Mapeo de Columnas ───
  private mapColumns(row: Record<string, unknown>, mapping: ColumnMapping): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    for (const [targetField, sourceColumn] of Object.entries(mapping)) {
      let value = row[sourceColumn];

      // Transformaciones comunes
      if (typeof value === 'string') value = value.trim();
      if (value === '' || value === undefined) value = null;

      mapped[targetField] = value;
    }
    return mapped;
  }

  // ─── Validación por Fila ───
  private validateRow(data: Record<string, unknown>, schema: z.ZodSchema, rowNumber: number) {
    const result = schema.safeParse(data);
    if (result.success) {
      return { isValid: true, errors: [] };
    }
    return {
      isValid: false,
      errors: result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        rowNumber,
      })),
    };
  }
}
```

## Configuración de Importación por Entidad

```typescript
// Importar Productos
const productImportConfig: ImportConfig = {
  model: 'product',
  schema: z.object({
    sku: z.string().min(1, 'SKU requerido'),
    name: z.string().min(2, 'Nombre requerido (mín. 2 caracteres)'),
    unitPrice: z.coerce.number().positive('Precio debe ser positivo'),
    costPrice: z.coerce.number().min(0).optional().default(0),
    currentStock: z.coerce.number().int().min(0).optional().default(0),
    minimumStock: z.coerce.number().int().min(0).optional().default(0),
    categoryName: z.string().optional(), // Se resuelve a categoryId
    barcode: z.string().optional(),
  }),
  columnMapping: {
    sku: 'SKU',                   // Columna del Excel → campo del sistema
    name: 'Nombre del Producto',
    unitPrice: 'Precio',
    costPrice: 'Costo',
    currentStock: 'Stock Actual',
    minimumStock: 'Stock Mínimo',
    categoryName: 'Categoría',
    barcode: 'Código de Barras',
  },
  uniqueField: 'sku',
  onDuplicate: 'update', // 'skip' | 'update' | 'error'
};

// Importar Clientes
const customerImportConfig: ImportConfig = {
  model: 'customer',
  schema: z.object({
    name: z.string().min(2),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    taxId: z.string().optional(),
    type: z.enum(['INDIVIDUAL', 'COMPANY']).default('INDIVIDUAL'),
  }),
  columnMapping: {
    name: 'Nombre / Razón Social',
    email: 'Email',
    phone: 'Teléfono',
    taxId: 'RFC / CUIT / RUT',
    type: 'Tipo (Individual/Empresa)',
  },
  uniqueField: 'email',
  onDuplicate: 'skip',
};
```

## Plantillas de Importación

```typescript
// Generar plantilla Excel vacía con headers y validaciones
async generateTemplate(entityType: string): Promise<Buffer> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Datos');
  const instructionsSheet = workbook.addWorksheet('Instrucciones');

  const config = this.getImportConfig(entityType);

  // Headers con formato
  const headers = Object.values(config.columnMapping);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } };
  });

  // Fila de ejemplo
  sheet.addRow(this.getExampleRow(entityType));

  // Instrucciones
  instructionsSheet.addRow(['Campo', 'Requerido', 'Tipo', 'Ejemplo']);
  Object.entries(config.schema.shape).forEach(([field, schema]) => {
    instructionsSheet.addRow([
      config.columnMapping[field] ?? field,
      schema.isOptional() ? 'No' : 'Sí',
      this.getFieldType(schema),
      this.getFieldExample(field),
    ]);
  });

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}
```

## Endpoints

```typescript
// POST /v1/import/preview — Previsualizar importación
router.post('/preview',
  requirePermission('settings', 'create'),
  upload.single('file'), // multer middleware
  importController.preview,
);

// POST /v1/import/execute — Ejecutar importación
router.post('/execute',
  requirePermission('settings', 'create'),
  upload.single('file'),
  importController.execute,
);

// GET /v1/import/template/:entity — Descargar plantilla
router.get('/template/:entity',
  importController.downloadTemplate,
);

// GET /v1/import/history — Historial de importaciones
router.get('/history',
  requirePermission('settings', 'read'),
  importController.history,
);
```

## Frontend — Componente de Importación

```tsx
function ImportDialog({ entityType, onComplete }: ImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'result'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  return (
    <Dialog>
      {step === 'upload' && (
        <div className="import-upload">
          <h3>Importar {entityType}</h3>
          <a href={`/v1/import/template/${entityType}`} className="link">
            📥 Descargar plantilla Excel
          </a>
          <FileDropzone accept=".xlsx,.csv" onDrop={handleFileUpload} />
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="import-preview">
          <div className="preview-stats">
            <span className="stat success">✅ {preview.validRows} válidas</span>
            <span className="stat error">❌ {preview.errorRows} con errores</span>
            <span className="stat total">📊 {preview.totalRows} total</span>
          </div>

          {preview.errorRows > 0 && (
            <div className="error-list">
              <h4>Errores encontrados:</h4>
              {preview.errors.map(row => (
                <div key={row.rowNumber} className="error-row">
                  <strong>Fila {row.rowNumber}:</strong>
                  {row.errors.map(e => `${e.field}: ${e.message}`).join(', ')}
                </div>
              ))}
            </div>
          )}

          <div className="preview-actions">
            <button onClick={() => setStep('upload')}>← Volver</button>
            <button onClick={handleExecute} disabled={preview.validRows === 0}
              className="btn-primary">
              Importar {preview.validRows} registros
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
```
