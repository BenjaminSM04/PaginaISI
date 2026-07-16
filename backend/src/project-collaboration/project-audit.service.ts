import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

export interface ProjectAuditRequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface RecordProjectAuditInput {
  projectId: string;
  actor: AuthUser;
  action: string;
  entityType: 'PROJECT' | 'MEMBERS' | 'MILESTONE' | 'GALLERY' | 'NEWS' | string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  request?: ProjectAuditRequestContext;
  rollbackOfId?: string;
}

type AuditDatabase = Prisma.TransactionClient | PrismaService;

export function projectAuditRequestContext(request: Request): ProjectAuditRequestContext {
  return {
    ip: request.ip?.slice(0, 80) || null,
    userAgent: request.get('user-agent')?.slice(0, 300) || null,
  };
}

export function projectAuditSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function projectAuditSnapshotsEqual(left: unknown, right: unknown) {
  const stable = (value: any): any => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stable(value[key]);
        return result;
      }, {} as Record<string, unknown>);
    }
    return value;
  };
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

@Injectable()
export class ProjectAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inserta la evidencia dentro de la misma transacción que hizo el cambio. */
  async record(db: AuditDatabase, input: RecordProjectAuditInput) {
    const recentEdits = await db.projectAuditLog.count({
      where: {
        projectId: input.projectId,
        actorId: input.actor.id,
        createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
    });
    const riskSignals: string[] = [];
    if (recentEdits >= 19) riskSignals.push('HIGH_FREQUENCY');
    if (['PROJECT_ARCHIVED', 'ROLLBACK'].includes(input.action)) riskSignals.push('PRIVILEGED_ACTION');

    return db.projectAuditLog.create({
      data: {
        projectId: input.projectId,
        actorId: input.actor.id,
        actorEmailSnapshot: input.actor.email,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? undefined : projectAuditSnapshot(input.before),
        after: input.after === undefined ? undefined : projectAuditSnapshot(input.after),
        rollbackOfId: input.rollbackOfId,
        delivery: { create: {} },
        metadata: projectAuditSnapshot({
          ...(input.metadata ?? {}),
          request: input.request ?? { ip: null, userAgent: null },
          actorRoles: input.actor.roles,
          security: { editsInLastFiveMinutes: recentEdits + 1, riskSignals },
        }),
      },
    });
  }

  async recordDirect(input: RecordProjectAuditInput) {
    return this.prisma.$transaction((tx) => this.record(tx, input));
  }
}
