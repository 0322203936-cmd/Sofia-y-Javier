---
name: background-jobs-automation
description: >
  Sistema completo de trabajos en segundo plano, automatizaciones y workflows para ERP. Cubre colas
  de trabajo con BullMQ/Redis, tareas programadas (cron jobs), procesamiento asíncrono de reportes,
  notificaciones automáticas (email, webhooks, SMS), flujos de aprobación configurables y
  automatización de procesos de negocio. Usa esta skill SIEMPRE que necesites procesar algo en
  background, programar tareas recurrentes, enviar emails automáticos, implementar notificaciones,
  crear flujos de aprobación, o automatizar cualquier proceso del ERP. Se activa con "background job",
  "cola", "queue", "cron", "tarea programada", "email automático", "notificación", "webhook",
  "aprobación", "workflow", "automatización", o cualquier referencia a procesos asíncronos.
---

# Background Jobs & Automation — Sistemas ERP

Sistema robusto de procesamiento asíncrono y automatización de procesos de negocio.

## Stack de Background Jobs

| Componente | Tecnología | Propósito |
|-----------|-----------|-----------|
| Cola de trabajo | BullMQ + Redis | Procesamiento asíncrono confiable |
| Programación | node-cron / BullMQ repeat | Tareas recurrentes |
| Email | Resend / Nodemailer | Notificaciones por correo |
| Eventos | EventEmitter / Redis Pub/Sub | Comunicación entre módulos |

## Configuración de BullMQ

```typescript
// src/shared/infrastructure/queue/queue.service.ts
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

// Crear colas por tipo de trabajo
export const emailQueue = new Queue('email', { connection });
export const reportQueue = new Queue('reports', { connection });
export const notificationQueue = new Queue('notifications', { connection });
export const stockAlertQueue = new Queue('stock-alerts', { connection });
export const invoiceQueue = new Queue('invoices', { connection });

// Configuración de reintentos por defecto
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000 },  // Mantener últimos 1000 completados
  removeOnFail: { count: 5000 },       // Mantener últimos 5000 fallidos
};
```

## Workers (Procesadores)

### Worker de Email

```typescript
// src/shared/infrastructure/queue/workers/email.worker.ts
import { Worker, Job } from 'bullmq';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const emailWorker = new Worker('email', async (job: Job) => {
  const { to, subject, template, data } = job.data;

  logger.info('Processing email job', { jobId: job.id, to, template });

  const html = await renderEmailTemplate(template, data);

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });

  logger.info('Email sent successfully', { jobId: job.id, to });
}, {
  connection,
  concurrency: 5, // Procesar hasta 5 emails simultáneamente
  limiter: { max: 50, duration: 60_000 }, // Máximo 50 emails por minuto
});

emailWorker.on('failed', (job, err) => {
  logger.error('Email job failed', { jobId: job?.id, error: err.message, to: job?.data.to });
});
```

### Worker de Reportes

```typescript
const reportWorker = new Worker('reports', async (job: Job) => {
  const { reportType, filters, userId, format } = job.data;

  // Actualizar progreso
  await job.updateProgress(10);

  // Generar datos del reporte
  const data = await generateReportData(reportType, filters);
  await job.updateProgress(50);

  // Generar archivo (PDF, Excel, etc.)
  const file = await formatReport(data, format);
  await job.updateProgress(80);

  // Guardar archivo
  const fileUrl = await storageService.upload(file, `reports/${job.id}.${format}`);
  await job.updateProgress(100);

  // Notificar al usuario que el reporte está listo
  await notificationQueue.add('report-ready', {
    userId,
    title: 'Reporte listo',
    message: `Tu reporte "${reportType}" está listo para descargar`,
    data: { fileUrl, reportType },
  });

  return { fileUrl };
}, {
  connection,
  concurrency: 2, // Los reportes son pesados, limitar concurrencia
});
```

## Tareas Programadas (Cron Jobs)

```typescript
// src/shared/infrastructure/queue/scheduled-tasks.ts

export function setupScheduledTasks() {
  // ─── Cada hora: Verificar facturas vencidas ───
  invoiceQueue.add('check-overdue', {}, {
    repeat: { pattern: '0 * * * *' },   // Cada hora
    jobId: 'check-overdue-invoices',
  });

  // ─── Cada día a las 7am: Alertas de stock bajo ───
  stockAlertQueue.add('daily-stock-check', {}, {
    repeat: { pattern: '0 7 * * *' },   // 7:00 AM diario
    jobId: 'daily-stock-alerts',
  });

  // ─── Cada lunes a las 8am: Reporte semanal de ventas ───
  reportQueue.add('weekly-sales-report', {
    reportType: 'weekly-sales',
    format: 'pdf',
    sendTo: ['gerencia@company.com'],
  }, {
    repeat: { pattern: '0 8 * * 1' },   // Lunes 8:00 AM
    jobId: 'weekly-sales-report',
  });

  // ─── Último día del mes: Cierre mensual ───
  reportQueue.add('monthly-close', {}, {
    repeat: { pattern: '0 23 L * *' },   // Último día del mes, 11 PM
    jobId: 'monthly-close',
  });

  // ─── Cada 5 minutos: Sincronizar tasas de cambio ───
  reportQueue.add('sync-exchange-rates', {}, {
    repeat: { pattern: '*/5 * * * *' },
    jobId: 'sync-exchange-rates',
  });

  logger.info('Scheduled tasks configured');
}
```

### Worker de Stock Alerts

```typescript
const stockAlertWorker = new Worker('stock-alerts', async (job: Job) => {
  // Buscar todos los productos con stock bajo
  const lowStockProducts = await prisma.product.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      currentStock: { lte: prisma.product.fields.minimumStock },
    },
    include: { category: true },
    orderBy: { currentStock: 'asc' },
  });

  if (lowStockProducts.length === 0) return;

  logger.info(`Found ${lowStockProducts.length} products with low stock`);

  // Agrupar por categoría para mejor organización
  const byCategory = Map.groupBy(lowStockProducts, p => p.category.name);

  // Enviar notificación al encargado de compras
  const purchasingUsers = await getUsersByRole('warehouse');
  for (const user of purchasingUsers) {
    await emailQueue.add('send', {
      to: user.email,
      subject: `⚠️ Alerta: ${lowStockProducts.length} productos con stock bajo`,
      template: 'low-stock-alert',
      data: { products: lowStockProducts, byCategory, date: new Date() },
    });

    await notificationQueue.add('in-app', {
      userId: user.id,
      title: 'Stock bajo detectado',
      message: `${lowStockProducts.length} productos necesitan reabastecimiento`,
      type: 'warning',
    });
  }
}, { connection });
```

## Sistema de Notificaciones

### Servicio de Notificaciones

```typescript
// src/shared/infrastructure/services/notification.service.ts
export class NotificationService {
  constructor(
    private readonly notificationRepo: NotificationRepository,
    private readonly emailQueue: Queue,
    private readonly sseService: SSEService,
  ) {}

  async send(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    channels?: ('in_app' | 'email' | 'push')[];
  }) {
    const channels = params.channels ?? ['in_app'];

    // 1. Notificación in-app (siempre)
    if (channels.includes('in_app')) {
      const notification = await this.notificationRepo.create({
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        data: params.data,
        channel: 'IN_APP',
      });

      // Enviar en tiempo real via SSE (Server-Sent Events)
      this.sseService.sendToUser(params.userId, {
        type: 'notification',
        data: notification,
      });
    }

    // 2. Email (si está configurado)
    if (channels.includes('email')) {
      const user = await this.userRepo.findById(params.userId);
      if (user?.email) {
        await this.emailQueue.add('send', {
          to: user.email,
          subject: params.title,
          template: `notification-${params.type}`,
          data: { ...params.data, userName: user.firstName },
        });
      }
    }
  }

  // Obtener notificaciones no leídas
  async getUnread(userId: string): Promise<Notification[]> {
    return this.notificationRepo.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Marcar como leída
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    await this.notificationRepo.update(notificationId, {
      readAt: new Date(),
    });
  }

  // Marcar todas como leídas
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
```

### SSE para Notificaciones Real-Time

```typescript
// src/shared/infrastructure/services/sse.service.ts
export class SSEService {
  private connections = new Map<string, Response[]>();

  connect(userId: string, res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const userConns = this.connections.get(userId) ?? [];
    userConns.push(res);
    this.connections.set(userId, userConns);

    // Limpiar conexión al cerrar
    res.on('close', () => {
      const conns = this.connections.get(userId) ?? [];
      this.connections.set(userId, conns.filter(c => c !== res));
    });

    // Heartbeat cada 30 segundos para mantener la conexión
    const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 30_000);
    res.on('close', () => clearInterval(heartbeat));
  }

  sendToUser(userId: string, event: { type: string; data: unknown }) {
    const connections = this.connections.get(userId) ?? [];
    const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    connections.forEach(res => res.write(message));
  }
}
```

## Flujos de Aprobación

```typescript
// Sistema genérico de aprobaciones
export class ApprovalService {
  async requestApproval(params: {
    module: string;          // 'purchasing', 'hr'
    entityType: string;      // 'purchase_order', 'leave_request'
    entityId: string;
    requestedBy: string;
    approvers: string[];     // IDs de usuarios que pueden aprobar
    metadata?: Record<string, unknown>;
  }): Promise<ApprovalRequest> {
    const request = await this.approvalRepo.create({
      ...params,
      status: 'PENDING',
    });

    // Notificar a todos los aprobadores
    for (const approverId of params.approvers) {
      await this.notificationService.send({
        userId: approverId,
        type: 'approval_request',
        title: `Solicitud de aprobación: ${params.entityType}`,
        message: `Se requiere tu aprobación para ${params.entityType} #${params.entityId}`,
        data: { approvalId: request.id, module: params.module, entityId: params.entityId },
        channels: ['in_app', 'email'],
      });
    }

    return request;
  }

  async approve(approvalId: string, userId: string, comment?: string): Promise<void> {
    const request = await this.approvalRepo.findById(approvalId);
    if (!request) throw new Error('Solicitud no encontrada');
    if (request.status !== 'PENDING') throw new Error('La solicitud ya fue procesada');

    await this.approvalRepo.update(approvalId, {
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
      comment,
    });

    // Ejecutar la acción post-aprobación
    await this.executePostApproval(request);

    // Notificar al solicitante
    await this.notificationService.send({
      userId: request.requestedBy,
      type: 'approval_approved',
      title: 'Solicitud aprobada',
      message: `Tu solicitud de ${request.entityType} ha sido aprobada`,
      channels: ['in_app', 'email'],
    });
  }

  async reject(approvalId: string, userId: string, reason: string): Promise<void> {
    // Similar a approve pero con status REJECTED
    // ...
  }

  private async executePostApproval(request: ApprovalRequest) {
    switch (`${request.module}:${request.entityType}`) {
      case 'purchasing:purchase_order':
        // Cambiar estado de la OC a APPROVED, enviar al proveedor
        await this.purchaseOrderService.markApproved(request.entityId);
        break;
      case 'hr:leave_request':
        // Aprobar la solicitud de vacaciones
        await this.leaveService.markApproved(request.entityId);
        break;
    }
  }
}
```

## Dashboard de Jobs (Monitoreo)

```typescript
// Endpoint para monitorear colas (solo admin)
router.get('/admin/queues/status', requirePermission('admin', 'read'), async (req, res) => {
  const queues = [emailQueue, reportQueue, notificationQueue, stockAlertQueue];
  const status = await Promise.all(queues.map(async (queue) => ({
    name: queue.name,
    waiting: await queue.getWaitingCount(),
    active: await queue.getActiveCount(),
    completed: await queue.getCompletedCount(),
    failed: await queue.getFailedCount(),
    delayed: await queue.getDelayedCount(),
  })));

  res.json({ success: true, data: status });
});
```

## Anti-patrones

| ❌ Anti-patrón | ✅ Correcto |
|---|---|
| Enviar email en el request HTTP | Encolar y procesar async |
| Generar reporte PDF sincrónicamente | Job en background con progreso |
| Sin reintentos en jobs | Backoff exponencial (3 intentos) |
| Sin monitoreo de colas | Dashboard + alertas en jobs fallidos |
| Cron jobs sin lock | Usar BullMQ repeat (evita duplicados) |
| Notificaciones solo in-app | Multi-canal: in-app + email + push |
