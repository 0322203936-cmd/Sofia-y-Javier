# Fórmulas Financieras para ERP

Referencia rápida de fórmulas de cálculo financiero, contable e inventario.

## Tabla de Contenidos

1. [Márgenes y Utilidad](#márgenes-y-utilidad)
2. [Inventario](#inventario)
3. [Cuentas por Cobrar](#cuentas-por-cobrar)
4. [Impuestos Comunes por País](#impuestos-comunes-por-país)

---

## Márgenes y Utilidad

| Fórmula | Cálculo | Ejemplo |
|---------|---------|---------|
| **Margen Bruto** | `(Ventas - Costo) / Ventas × 100` | (1000 - 600) / 1000 = 40% |
| **Markup** | `(Precio - Costo) / Costo × 100` | (1000 - 600) / 600 = 66.7% |
| **Utilidad Neta** | `Ingresos - Gastos Totales` | 1000 - 850 = 150 |
| **Margen Neto** | `Utilidad Neta / Ingresos × 100` | 150 / 1000 = 15% |
| **Precio desde Margen** | `Costo / (1 - Margen/100)` | 600 / (1 - 0.40) = 1000 |
| **Precio desde Markup** | `Costo × (1 + Markup/100)` | 600 × (1 + 0.667) = 1000 |
| **Break-Even (unidades)** | `Costos Fijos / (Precio - Costo Variable)` | 10000 / (50 - 30) = 500 uds |
| **ROI** | `(Ganancia - Inversión) / Inversión × 100` | (15000 - 10000) / 10000 = 50% |

## Inventario

| Fórmula | Cálculo | Uso |
|---------|---------|-----|
| **Rotación** | `Costo Ventas / Inventario Promedio` | Mayor = mejor eficiencia |
| **Días de Inventario** | `(Inventario Promedio / Costo Ventas) × 365` | Días para vender todo |
| **Inventario Promedio** | `(Inv. Inicial + Inv. Final) / 2` | Base para rotación |
| **Punto de Reorden** | `(Demanda Diaria × Lead Time) + Stock Seguridad` | Cuándo reordenar |
| **EOQ** | `√(2 × Demanda × Costo Pedido / Costo Almacenaje)` | Cantidad óptima |
| **Stock de Seguridad** | `Z × σ × √(Lead Time)` | Buffer para variabilidad |

### Métodos de Valuación de Inventario

| Método | Descripción | Cuándo usar |
|--------|-------------|-------------|
| **FIFO** | Primeras en entrar, primeras en salir | Productos perecederos |
| **LIFO** | Últimas en entrar, primeras en salir | Beneficio fiscal (si aplica) |
| **Promedio Ponderado** | Costo promedio de todas las unidades | General, más simple |

```typescript
// Promedio Ponderado
function weightedAverageCost(currentStock: number, currentCost: number, newQty: number, newCost: number): number {
  const totalValue = (currentStock * currentCost) + (newQty * newCost);
  const totalQty = currentStock + newQty;
  return totalQty > 0 ? round(totalValue / totalQty, 4) : 0;
}
```

## Cuentas por Cobrar

| Fórmula | Cálculo |
|---------|---------|
| **DSO (Days Sales Outstanding)** | `(Cuentas por Cobrar / Ventas a Crédito) × Días` |
| **Antigüedad de Saldos** | Agrupar deuda por rangos: 0-30, 31-60, 61-90, 90+ días |
| **Tasa de Morosidad** | `Deuda Vencida / Total Cuentas por Cobrar × 100` |

## Impuestos Comunes por País

| País | Impuesto | Tasa | Tipo |
|------|----------|------|------|
| 🇲🇽 México | IVA | 16% | Sobre ventas |
| 🇲🇽 México | IVA (frontera) | 8% | Zona fronteriza |
| 🇲🇽 México | ISR (retención) | Variable | Sobre ingresos |
| 🇦🇷 Argentina | IVA | 21% | General |
| 🇦🇷 Argentina | IVA (reducido) | 10.5% | Algunos bienes |
| 🇨🇴 Colombia | IVA | 19% | General |
| 🇨🇱 Chile | IVA | 19% | General |
| 🇵🇪 Perú | IGV | 18% | General |
| 🇪🇸 España | IVA | 21% | General |
| 🇪🇸 España | IVA (reducido) | 10% | Alimentos, transporte |
| 🇺🇸 EE.UU. | Sales Tax | 0-10%+ | Varía por estado |

> **Importante**: Las tasas de impuesto deben ser **configurables** en el sistema, nunca hardcodeadas. Usa la tabla `tax_rates` para almacenarlas y poder modificarlas sin cambios de código.
