import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { EnvironmentVariables } from '../config/environment';
import { NotificationsService } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';

const WORK_INTERVAL_MS = 5_000;
const STALE_PROCESSING_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class ProjectAuditDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectAuditDeliveryWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onModuleInit() {
    void this.recoverAndDrain();
    this.timer = setInterval(() => void this.drain(), WORK_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async recoverAndDrain() {
    try {
      await this.prisma.projectAuditDelivery.updateMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
        },
        data: { status: 'PENDING', nextAttemptAt: new Date() },
      });
      await this.drain();
    } catch (error) {
      this.logger.warn(`No se pudo recuperar el outbox de auditoría: ${this.errorMessage(error)}`);
    }
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      // También se recupera periódicamente: una excepción durante el propio
      // reintento no debe dejar una fila bloqueada hasta el próximo reinicio.
      await this.prisma.projectAuditDelivery.updateMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
        },
        data: { status: 'PENDING', nextAttemptAt: new Date() },
      });
      const candidates = await this.prisma.projectAuditDelivery.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: 10,
        select: { id: true },
      });

      for (const candidate of candidates) {
        const claim = await this.prisma.projectAuditDelivery.updateMany({
          where: { id: candidate.id, status: 'PENDING' },
          data: { status: 'PROCESSING', attempts: { increment: 1 } },
        });
        if (claim.count !== 1) continue;

        try {
          await this.deliver(candidate.id);
        } catch (error) {
          await this.reschedule(candidate.id, error);
        }
      }
    } catch (error) {
      this.logger.warn(`Falló el procesamiento del outbox de auditoría: ${this.errorMessage(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async deliver(deliveryId: string) {
    const delivery = await this.prisma.projectAuditDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        auditLog: {
          include: {
            project: {
              select: {
                id: true,
                title: true,
                owner: { select: { id: true, email: true, isActive: true } },
              },
            },
          },
        },
      },
    });
    if (!delivery || delivery.status !== 'PROCESSING') return;

    const admins = await this.prisma.user.findMany({
      where: {
        isActive: true,
        emailVerifiedAt: { not: null },
        roles: { some: { role: { name: 'ADMIN' } } },
      },
      select: { id: true, email: true },
    });
    const recipients = new Map<string, { id: string; email: string }>();
    if (delivery.auditLog.project.owner.isActive) {
      recipients.set(delivery.auditLog.project.owner.id, delivery.auditLog.project.owner);
    }
    for (const admin of admins) recipients.set(admin.id, admin);
    recipients.delete(delivery.auditLog.actorId);

    const href = `/proyectos/gestionar/${delivery.auditLog.projectId}?tab=history&audit=${delivery.auditLog.id}`;
    const internalResults = await Promise.all([...recipients.values()].map((recipient) => this.notifications.send({
      userId: recipient.id,
      type: 'SYSTEM',
      title: `Cambio registrado en ${delivery.auditLog.project.title}`,
      body: `${delivery.auditLog.actorEmailSnapshot} realizó ${delivery.auditLog.action}.`,
      href,
      dedupeKey: `project-audit-alert:${delivery.auditLog.id}`,
    })));
    if (internalResults.some((result) => result === null)) {
      throw new Error('No se pudo persistir uno o más avisos internos de auditoría');
    }

    const webhookUrl = this.config.get('SECURITY_ALERT_WEBHOOK_URL', { infer: true });
    const webhookSecret = this.config.get('SECURITY_ALERT_WEBHOOK_SECRET', { infer: true });
    const recipientEmails = [...recipients.values()].map((recipient) => recipient.email);
    if (!webhookUrl || !webhookSecret || recipientEmails.length === 0) {
      await this.prisma.projectAuditDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SKIPPED',
          sentAt: new Date(),
          lastError: webhookUrl ? 'No hay destinatarios distintos del actor' : 'Webhook de seguridad no configurado; aviso interno entregado',
        },
      });
      return;
    }

    const payload = JSON.stringify({
      id: delivery.id,
      type: 'PROJECT_AUDIT_ALERT',
      to: recipientEmails,
      audit: {
        id: delivery.auditLog.id,
        projectId: delivery.auditLog.projectId,
        projectTitle: delivery.auditLog.project.title,
        action: delivery.auditLog.action,
        entityType: delivery.auditLog.entityType,
        actorEmail: delivery.auditLog.actorEmailSnapshot,
        occurredAt: delivery.auditLog.createdAt.toISOString(),
        href,
      },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`).digest('hex');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-isi-timestamp': timestamp,
        'x-isi-signature': `sha256=${signature}`,
        'idempotency-key': delivery.id,
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Webhook respondió HTTP ${response.status}`);

    await this.prisma.projectAuditDelivery.update({
      where: { id: delivery.id },
      data: { status: 'SENT', sentAt: new Date(), lastError: null },
    });
  }

  private async reschedule(deliveryId: string, error: unknown) {
    const current = await this.prisma.projectAuditDelivery.findUnique({
      where: { id: deliveryId },
      select: { attempts: true },
    });
    if (!current) return;
    const exhausted = current.attempts >= MAX_ATTEMPTS;
    const retryDelay = Math.min(30_000 * (2 ** Math.max(current.attempts - 1, 0)), 30 * 60_000);
    await this.prisma.projectAuditDelivery.update({
      where: { id: deliveryId },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        nextAttemptAt: new Date(Date.now() + retryDelay),
        lastError: this.errorMessage(error).slice(0, 500),
      },
    });
    this.logger.warn(`Alerta ${deliveryId} no entregada (intento ${current.attempts}/${MAX_ATTEMPTS})`);
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
