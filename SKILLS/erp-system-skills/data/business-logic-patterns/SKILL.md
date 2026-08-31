---
name: business-logic-patterns
description: >
  Patrones de lógica de negocio para sistemas ERP. Cubre cálculos de impuestos (IVA, ISR, retenciones),
  descuentos por volumen/cliente/promoción, gestión de inventario (FIFO, LIFO, promedio ponderado),
  validaciones de negocio complejas (crédito, stock mínimo, límites), flujos de aprobación
  configurables, cálculos financieros estándar (margen, utilidad, ROI), y numeración automática
  de documentos. Usa esta skill SIEMPRE que necesites implementar reglas de negocio, cálculos
  financieros, descuentos, impuestos, o flujos de negocio del ERP. Se activa con "cálculo de
  impuestos", "descuento", "IVA", "margen de utilidad", "precio", "facturación", "FIFO",
  "regla de negocio", "validación de negocio", "límite de crédito", "numeración automática",
  o cualquier referencia a lógica de negocio empresarial.
---

# Business Logic Patterns — Sistemas ERP

Patrones probados de lógica de negocio para operaciones empresariales.

## Cálculos de Impuestos

```typescript
// src/shared/domain/tax-calculator.ts

interface TaxConfig {
  rate: number;        // Porcentaje (e.g., 16 para 16%)
  name: string;        // "IVA", "ISR", etc.
  type: 'inclusive' | 'exclusive'; // ¿El precio ya incluye impuesto?
  applicableTo?: string[];  // Categorías a las que aplica
}

export class TaxCalculator {
  // Calcular impuesto sobre un monto (impuesto exclusivo - el más común)
  static calculateTax(amount: number, taxRate: number): TaxResult {
    const taxAmount = round(amount * (taxRate / 100), 2);
    return {
      subtotal: amount,
      taxRate,
      taxAmount,
      total: round(amount + taxAmount, 2),
    };
  }

  // Extraer impuesto de un precio que YA incluye impuesto
  static extractTax(totalWithTax: number, taxRate: number): TaxResult {
    const subtotal = round(totalWithTax / (1 + taxRate / 100), 2);
    const taxAmount = round(totalWithTax - subtotal, 2);
    return { subtotal, taxRate, taxAmount, total: totalWithTax };
  }

  // Calcular impuestos para una línea de pedido
  static calculateLineItemTax(item: {
    quantity: number;
    unitPrice: number;
    discount: number;  // Porcentaje de descuento
    taxRate: number;
  }): LineItemTax {
    const grossAmount = round(item.quantity * item.unitPrice, 2);
    const discountAmount = round(grossAmount * (item.discount / 100), 2);
    const taxableAmount = round(grossAmount - discountAmount, 2);
    const taxAmount = round(taxableAmount * (item.taxRate / 100), 2);
    const lineTotal = round(taxableAmount + taxAmount, 2);

    return {
      grossAmount,
      discountAmount,
      taxableAmount,
      taxAmount,
      lineTotal,
    };
  }

  // Calcular totales de una orden completa
  static calculateOrderTotals(items: OrderItem[], globalDiscount = 0): OrderTotals {
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const processedItems = items.map(item => {
      const lineCalc = this.calculateLineItemTax(item);
      subtotal += lineCalc.taxableAmount;
      totalTax += lineCalc.taxAmount;
      totalDiscount += lineCalc.discountAmount;
      return { ...item, ...lineCalc };
    });

    // Descuento global adicional (sobre el subtotal)
    const globalDiscountAmount = round(subtotal * (globalDiscount / 100), 2);
    const adjustedSubtotal = round(subtotal - globalDiscountAmount, 2);

    // Recalcular impuesto sobre el subtotal ajustado
    const adjustedTax = round(adjustedSubtotal * (items[0]?.taxRate ?? 16) / 100, 2);

    return {
      items: processedItems,
      subtotal: round(subtotal, 2),
      discountAmount: round(totalDiscount + globalDiscountAmount, 2),
      taxAmount: adjustedTax,
      total: round(adjustedSubtotal + adjustedTax, 2),
    };
  }
}

// Redondeo preciso (evitar errores de punto flotante)
function round(value: number, decimals: number): number {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}
```

## Sistema de Descuentos

```typescript
// src/modules/sales/domain/discount-engine.ts

interface DiscountRule {
  type: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
  value: number;
  condition: DiscountCondition;
  priority: number;       // Mayor prioridad = se aplica primero
  stackable: boolean;     // ¿Se puede combinar con otros descuentos?
  maxDiscount?: number;   // Límite máximo de descuento
}

interface DiscountCondition {
  type: 'always' | 'min_quantity' | 'min_amount' | 'customer_type' |
    'date_range' | 'product_category' | 'coupon';
  params: Record<string, unknown>;
}

export class DiscountEngine {
  // Calcular el mejor descuento aplicable
  static calculateBestDiscount(
    lineItem: { productId: string; quantity: number; unitPrice: number; categoryId: string },
    customer: { type: string; creditTier: string },
    availableRules: DiscountRule[],
  ): AppliedDiscount {
    // Filtrar reglas que aplican a este contexto
    const applicableRules = availableRules
      .filter(rule => this.evaluateCondition(rule.condition, lineItem, customer))
      .sort((a, b) => b.priority - a.priority);

    if (applicableRules.length === 0) return { percentage: 0, amount: 0 };

    // Encontrar stackable y non-stackable rules
    const nonStackable = applicableRules.filter(r => !r.stackable);
    const stackable = applicableRules.filter(r => r.stackable);

    // El mayor descuento non-stackable
    const bestNonStackable = nonStackable.length > 0
      ? this.applyRule(nonStackable[0], lineItem)
      : { percentage: 0, amount: 0 };

    // Sumar todos los stackable
    const totalStackable = stackable.reduce((sum, rule) => {
      const discount = this.applyRule(rule, lineItem);
      return {
        percentage: sum.percentage + discount.percentage,
        amount: sum.amount + discount.amount,
      };
    }, { percentage: 0, amount: 0 });

    // Usar el que dé mayor descuento
    const grossAmount = lineItem.quantity * lineItem.unitPrice;
    const nonStackableAmount = grossAmount * (bestNonStackable.percentage / 100);
    const stackableAmount = grossAmount * (totalStackable.percentage / 100);

    return nonStackableAmount >= stackableAmount ? bestNonStackable : totalStackable;
  }

  private static evaluateCondition(
    condition: DiscountCondition,
    item: { quantity: number; unitPrice: number; categoryId: string },
    customer: { type: string },
  ): boolean {
    switch (condition.type) {
      case 'always': return true;
      case 'min_quantity': return item.quantity >= (condition.params.minQuantity as number);
      case 'min_amount': return item.quantity * item.unitPrice >= (condition.params.minAmount as number);
      case 'customer_type': return customer.type === condition.params.customerType;
      case 'product_category': return item.categoryId === condition.params.categoryId;
      case 'date_range': {
        const now = new Date();
        return now >= new Date(condition.params.from as string) &&
               now <= new Date(condition.params.to as string);
      }
      default: return false;
    }
  }
}
```

## Numeración Automática de Documentos

```typescript
// src/shared/domain/sequence-generator.ts

export class SequenceGenerator {
  constructor(private readonly prisma: PrismaService) {}

  // Generar siguiente número (thread-safe con lock de BD)
  async next(module: string): Promise<string> {
    // Usar transacción con lock para evitar duplicados en concurrencia
    return this.prisma.$transaction(async (tx) => {
      const sequence = await tx.numberSequence.findUnique({
        where: { module },
      });

      if (!sequence) throw new Error(`Secuencia no configurada para módulo: ${module}`);

      const nextNumber = sequence.currentNumber + 1;

      // Verificar si debe resetear (nuevo año, nuevo mes, etc.)
      const shouldReset = this.shouldReset(sequence);
      const actualNumber = shouldReset ? 1 : nextNumber;

      await tx.numberSequence.update({
        where: { module },
        data: { currentNumber: actualNumber },
      });

      // Formatear: FAC-2025-000042
      const paddedNumber = String(actualNumber).padStart(sequence.padLength, '0');
      const yearSuffix = new Date().getFullYear();

      return `${sequence.prefix}-${yearSuffix}-${paddedNumber}`;
    });
  }

  private shouldReset(sequence: NumberSequence): boolean {
    if (sequence.resetPeriod === 'yearly') {
      return new Date().getFullYear() !== sequence.lastResetAt?.getFullYear();
    }
    if (sequence.resetPeriod === 'monthly') {
      const now = new Date();
      return now.getMonth() !== sequence.lastResetAt?.getMonth() ||
             now.getFullYear() !== sequence.lastResetAt?.getFullYear();
    }
    return false;
  }
}

// Uso
const orderNumber = await sequenceGenerator.next('sales_order');
// → "OV-2025-000142"

const invoiceNumber = await sequenceGenerator.next('invoice');
// → "FAC-2025-000089"
```

## Validaciones de Negocio

```typescript
// src/modules/sales/domain/order-validator.ts

export class OrderValidator {
  static async validate(
    order: CreateOrderDTO,
    customer: Customer,
    products: Product[],
  ): Promise<Result<void>> {
    const errors: string[] = [];

    // 1. Cliente activo
    if (!customer.isActive) {
      errors.push(`El cliente ${customer.name} está inactivo`);
    }

    // 2. Verificar límite de crédito
    if (customer.creditLimit) {
      const orderTotal = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      const newBalance = Number(customer.currentBalance) + orderTotal;
      if (newBalance > Number(customer.creditLimit)) {
        errors.push(
          `Límite de crédito excedido. Límite: ${formatCurrency(customer.creditLimit)}, ` +
          `Saldo actual: ${formatCurrency(customer.currentBalance)}, ` +
          `Monto orden: ${formatCurrency(orderTotal)}`
        );
      }
    }

    // 3. Verificar stock de cada producto
    for (const item of order.items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        errors.push(`Producto ${item.productId} no encontrado`);
        continue;
      }
      if (!product.isActive) {
        errors.push(`El producto "${product.name}" está inactivo`);
        continue;
      }
      if (product.currentStock < item.quantity) {
        errors.push(
          `Stock insuficiente para "${product.name}". ` +
          `Disponible: ${product.currentStock}, Solicitado: ${item.quantity}`
        );
      }
    }

    // 4. Monto mínimo de orden
    const MIN_ORDER_AMOUNT = 1;
    const total = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    if (total < MIN_ORDER_AMOUNT) {
      errors.push(`El monto mínimo de orden es ${formatCurrency(MIN_ORDER_AMOUNT)}`);
    }

    // 5. Cantidad máxima de items
    if (order.items.length > 100) {
      errors.push('Máximo 100 líneas por orden');
    }

    if (errors.length > 0) {
      return Result.fail(errors.join('. '));
    }
    return Result.ok();
  }
}
```

## Cálculos Financieros

Para fórmulas detalladas, consulta `references/financial-formulas.md`.

```typescript
// Margen de utilidad bruta
function grossMargin(revenue: number, costOfGoods: number): number {
  if (revenue === 0) return 0;
  return round(((revenue - costOfGoods) / revenue) * 100, 2);
}

// Markup (sobre el costo)
function markup(costPrice: number, sellingPrice: number): number {
  if (costPrice === 0) return 0;
  return round(((sellingPrice - costPrice) / costPrice) * 100, 2);
}

// Punto de equilibrio (Break-even)
function breakEvenUnits(fixedCosts: number, pricePerUnit: number, variableCostPerUnit: number): number {
  const contribution = pricePerUnit - variableCostPerUnit;
  if (contribution <= 0) return Infinity;
  return Math.ceil(fixedCosts / contribution);
}

// Días de inventario (Days of Inventory)
function daysOfInventory(averageInventory: number, costOfGoodsSold: number, period = 365): number {
  if (costOfGoodsSold === 0) return 0;
  return round((averageInventory / costOfGoodsSold) * period, 1);
}

// Rotación de inventario
function inventoryTurnover(costOfGoodsSold: number, averageInventory: number): number {
  if (averageInventory === 0) return 0;
  return round(costOfGoodsSold / averageInventory, 2);
}
```

## Anti-patrones de Lógica de Negocio

| ❌ Anti-patrón | ✅ Correcto |
|---|---|
| `float` para dinero | `Decimal` con redondeo explícito |
| Calcular impuesto solo al final | Calcular por línea, sumar totales |
| Descuento como número mágico | Motor de descuentos configurable |
| Validar solo en frontend | Validar en domain layer (backend) |
| Hardcode de tasas de impuesto | Tabla `tax_rates` configurable |
| Numeración secuencial simple | Secuencias con lock transaccional |
| Un solo try/catch para todo | Result pattern por cada validación |
