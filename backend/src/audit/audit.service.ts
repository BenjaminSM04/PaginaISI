import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

export type AuditDatabase = Prisma.TransactionClient | PrismaService;

export interface RecordSystemAuditInput {
  actor?: AuthUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ListAuditInput {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  entityType?: string;
  source?: 'SYSTEM' | 'PROJECT' | 'ALL' | string;
}

export interface AuditActorSnapshot {
  actorIdSnapshot: string | null;
  actorUserId: string | null;
  actorNameSnapshot: string;
  actorUsernameSnapshot: string | null;
  actorEmailSnapshot: string | null;
  actorRolesSnapshot: Prisma.InputJsonValue;
}

const auditActorSelect = {
  id: true,
  email: true,
  username: true,
  profile: { select: { fullName: true } },
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

const listedActorSelect = {
  id: true,
  email: true,
  username: true,
  profile: { select: { fullName: true, avatarUrl: true } },
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

export function auditSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Resuelve todos los datos del actor en una sola consulta. `undefined` se usa
 * únicamente para dobles de prueba antiguos que no exponen el delegate User;
 * `null` significa que la búsqueda sí se ejecutó y el usuario ya no existe.
 */
export async function resolveAuditActor(
  db: AuditDatabase,
  actor?: AuthUser | null,
): Promise<AuditActorSnapshot> {
  if (!actor) {
    return {
      actorIdSnapshot: null,
      actorUserId: null,
      actorNameSnapshot: 'Sistema',
      actorUsernameSnapshot: null,
      actorEmailSnapshot: null,
      actorRolesSnapshot: [],
    };
  }

  const userDelegate = (db as any).user;
  const persisted = userDelegate?.findUnique
    ? await userDelegate.findUnique({
        where: { id: actor.id },
        select: auditActorSelect,
      }) as {
        id: string;
        email: string;
        username: string;
        profile: { fullName: string } | null;
        roles: { role: { name: string } }[];
      } | null
    : undefined;

  const roles = (
    persisted === undefined
      ? actor.roles
      : persisted?.roles.map((entry) => entry.role.name) ?? actor.roles
  ).slice().sort();
  const username = persisted === undefined ? actor.username : persisted?.username ?? actor.username;
  const email = persisted === undefined ? actor.email : persisted?.email ?? actor.email;
  const name = persisted?.profile?.fullName?.trim()
    || username?.trim()
    || email?.trim()
    || 'Usuario eliminado';

  return {
    actorIdSnapshot: actor.id,
    // Si la consulta real no encuentra la fila, no se intenta insertar una FK
    // inválida; los snapshots siguen preservando la identidad histórica.
    actorUserId: persisted === undefined ? actor.id : persisted?.id ?? null,
    actorNameSnapshot: name,
    actorUsernameSnapshot: username || null,
    actorEmailSnapshot: email || null,
    actorRolesSnapshot: auditSnapshot(roles),
  };
}

function listedActor(actor: any) {
  if (!actor) return null;
  return {
    id: actor.id,
    email: actor.email,
    username: actor.username,
    profile: actor.profile,
    roles: actor.roles.map((entry: any) => entry.role.name),
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(db: AuditDatabase, input: RecordSystemAuditInput) {
    const actor = await resolveAuditActor(db, input.actor);
    return db.systemAuditLog.create({
      data: {
        ...actor,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? undefined : auditSnapshot(input.before),
        after: input.after === undefined ? undefined : auditSnapshot(input.after),
        metadata: input.metadata === undefined ? undefined : auditSnapshot(input.metadata),
      },
    });
  }

  recordDirect(input: RecordSystemAuditInput) {
    return this.prisma.$transaction((tx) => this.record(tx, input));
  }

  /**
   * Combina ambas bitácoras sin resolver actores fila por fila. Cada origen se
   * consulta una sola vez con su relación de actor y luego se intercala en
   * memoria para conservar una paginación cronológica estable.
   */
  async list(input: ListAuditInput = {}) {
    const requestedLimit = Math.min(Number(input.limit) || 30, 50);
    const { take, skip, page } = paginate(input.page, requestedLimit);
    const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : '';
    const action = typeof input.action === 'string' ? input.action.trim().slice(0, 80) : '';
    const entityType = typeof input.entityType === 'string' ? input.entityType.trim().slice(0, 80) : '';
    const source = typeof input.source === 'string' ? input.source.trim().toUpperCase() : 'ALL';
    const includeSystem = source !== 'PROJECT';
    const includeProject = source !== 'SYSTEM';

    const systemWhere: Prisma.SystemAuditLogWhereInput = {};
    const projectWhere: Prisma.ProjectAuditLogWhereInput = {};
    if (action) {
      systemWhere.action = action;
      projectWhere.action = action;
    }
    if (entityType) {
      systemWhere.entityType = entityType;
      projectWhere.entityType = entityType;
    }
    if (search) {
      systemWhere.OR = [
        { actorNameSnapshot: { contains: search, mode: 'insensitive' } },
        { actorUsernameSnapshot: { contains: search, mode: 'insensitive' } },
        { actorEmailSnapshot: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
      projectWhere.OR = [
        { actorNameSnapshot: { contains: search, mode: 'insensitive' } },
        { actorUsernameSnapshot: { contains: search, mode: 'insensitive' } },
        { actorEmailSnapshot: { contains: search, mode: 'insensitive' } },
        { project: { title: { contains: search, mode: 'insensitive' } } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const windowSize = skip + take;
    const [systemTotal, projectTotal, systemRows, projectRows] = await Promise.all([
      includeSystem ? this.prisma.systemAuditLog.count({ where: systemWhere }) : Promise.resolve(0),
      includeProject ? this.prisma.projectAuditLog.count({ where: projectWhere }) : Promise.resolve(0),
      includeSystem
        ? this.prisma.systemAuditLog.findMany({
            where: systemWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: windowSize,
            include: { actor: { select: listedActorSelect } },
          })
        : Promise.resolve([]),
      includeProject
        ? this.prisma.projectAuditLog.findMany({
            where: projectWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: windowSize,
            include: {
              actor: { select: listedActorSelect },
              project: { select: { id: true, title: true, slug: true } },
              delivery: { select: { status: true, attempts: true, sentAt: true, lastError: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const systemItems = systemRows.map((row: any) => ({
      ...row,
      source: 'SYSTEM' as const,
      actor: listedActor(row.actor),
      actorDeleted: !!row.actorIdSnapshot && !row.actor,
      project: null,
    }));
    const projectItems = projectRows.map((row: any) => ({
      ...row,
      source: 'PROJECT' as const,
      actorIdSnapshot: row.actorId,
      actor: listedActor(row.actor),
      actorDeleted: !!row.actorId && !row.actor,
    }));
    const items = [...systemItems, ...projectItems]
      .sort((left, right) => {
        const byDate = right.createdAt.getTime() - left.createdAt.getTime();
        return byDate || right.id.localeCompare(left.id);
      })
      .slice(skip, skip + take);
    const total = systemTotal + projectTotal;

    return {
      items,
      total,
      page,
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }
}
