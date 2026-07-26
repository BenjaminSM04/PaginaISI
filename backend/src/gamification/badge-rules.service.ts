import { Injectable } from '@nestjs/common';
import {
  Badge,
  BadgeRuleType,
  Prisma,
  PublicationStatus,
  RegistrationStatus,
} from '@prisma/client';
import { AuditDatabase, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

export const BADGE_RULE_LABELS: Record<BadgeRuleType, string> = {
  ANSWERS_COUNT: 'respuestas publicadas',
  ACCEPTED_ANSWERS_COUNT: 'mejores respuestas',
  TOTAL_POINTS: 'puntos acumulados',
  APPROVED_PROJECTS_COUNT: 'proyectos aprobados',
  ATTENDED_EVENTS_COUNT: 'eventos completados',
  COMPLETED_MENTORSHIPS_COUNT: 'mentorías completadas',
  COMMUNITY_MEMBERSHIPS_COUNT: 'comunidades en las que participa',
};

export interface BadgeEvaluationResult {
  userId: string;
  evaluated: number;
  awarded: number;
  awards: Array<{
    badgeId: string;
    code: string;
    progressValue: number;
    targetValue: number;
    reason: string;
  }>;
}

interface EvaluatedBadge extends Pick<
  Badge,
  'id' | 'code' | 'name' | 'ruleType' | 'targetValue' | 'isRetroactive' | 'createdAt'
> {
  ruleType: BadgeRuleType;
  targetValue: number;
}

/**
 * Devuelve una explicación estable que se guarda junto a la asignación.
 * De este modo el perfil puede mostrar el motivo aun si la regla se modifica
 * posteriormente.
 */
export function badgeAwardReason(
  badge: Pick<Badge, 'name' | 'ruleType' | 'targetValue'>,
  progressValue: number,
): string {
  if (!badge.ruleType || !badge.targetValue) return `Insignia “${badge.name}” otorgada manualmente`;
  const label = BADGE_RULE_LABELS[badge.ruleType];
  return `Cumplió ${progressValue} de ${badge.targetValue} ${label}`;
}

@Injectable()
export class BadgeRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async progressForRule(
    db: AuditDatabase,
    userId: string,
    badge: EvaluatedBadge,
  ): Promise<number> {
    const cutoff = badge.isRetroactive ? undefined : badge.createdAt;

    switch (badge.ruleType) {
      case BadgeRuleType.ANSWERS_COUNT:
        return db.forumAnswer.count({
          where: { authorId: userId, ...(cutoff ? { createdAt: { gte: cutoff } } : {}) },
        });

      case BadgeRuleType.ACCEPTED_ANSWERS_COUNT:
        return db.forumAnswer.count({
          where: {
            authorId: userId,
            isAccepted: true,
            // No existe acceptedAt en el modelo actual; updatedAt es la marca
            // temporal que cambia cuando una respuesta pasa a ser aceptada.
            ...(cutoff ? { updatedAt: { gte: cutoff } } : {}),
          },
        });

      case BadgeRuleType.TOTAL_POINTS:
        if (!cutoff) {
          const profile = await db.profile.findUnique({
            where: { userId },
            select: { totalPoints: true },
          });
          return profile?.totalPoints ?? 0;
        }
        return (await db.pointsTransaction.aggregate({
          where: { userId, createdAt: { gte: cutoff } },
          _sum: { points: true },
        }))._sum.points ?? 0;

      case BadgeRuleType.APPROVED_PROJECTS_COUNT:
        return db.project.count({
          where: {
            ownerId: userId,
            status: PublicationStatus.APPROVED,
            ...(cutoff ? { publishedAt: { gte: cutoff } } : {}),
          },
        });

      case BadgeRuleType.ATTENDED_EVENTS_COUNT:
        return db.eventRegistration.count({
          where: {
            userId,
            status: RegistrationStatus.ATTENDED,
            ...(cutoff ? { event: { startsAt: { gte: cutoff } } } : {}),
          },
        });

      case BadgeRuleType.COMPLETED_MENTORSHIPS_COUNT: {
        const now = new Date();
        return db.mentorshipEnrollment.count({
          where: {
            userId,
            mentorship: {
              endsAt: {
                not: null,
                lte: now,
                ...(cutoff ? { gte: cutoff } : {}),
              },
            },
          },
        });
      }

      case BadgeRuleType.COMMUNITY_MEMBERSHIPS_COUNT:
        return db.communityMember.count({
          where: { userId, ...(cutoff ? { joinedAt: { gte: cutoff } } : {}) },
        });
    }
  }

  private async evaluateWithDatabase(
    db: AuditDatabase,
    userId: string,
    badgeId?: string,
  ): Promise<BadgeEvaluationResult> {
    const user = await db.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true },
    });
    if (!user) return { userId, evaluated: 0, awarded: 0, awards: [] };

    const badges = await db.badge.findMany({
      where: {
        isActive: true,
        ruleType: { not: null },
        targetValue: { not: null },
        ...(badgeId ? { id: badgeId } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }) as EvaluatedBadge[];
    if (!badges.length) return { userId, evaluated: 0, awarded: 0, awards: [] };

    const existing = new Set((await db.userBadge.findMany({
      where: { userId, badgeId: { in: badges.map((badge) => badge.id) } },
      select: { badgeId: true },
    })).map((entry) => entry.badgeId));

    const progressCache = new Map<string, number>();
    const awards: BadgeEvaluationResult['awards'] = [];
    for (const badge of badges) {
      if (existing.has(badge.id)) continue;
      // Las insignias con la misma regla y fecha de inicio reutilizan el conteo.
      const cacheKey = `${badge.ruleType}:${badge.isRetroactive ? 'all' : badge.createdAt.toISOString()}`;
      let progressValue = progressCache.get(cacheKey);
      if (progressValue === undefined) {
        progressValue = await this.progressForRule(db, userId, badge);
        progressCache.set(cacheKey, progressValue);
      }
      if (progressValue < badge.targetValue) continue;

      const reason = badgeAwardReason(badge, progressValue);
      const inserted = await db.userBadge.createMany({
        data: [{
          userId,
          badgeId: badge.id,
          progressValue,
          reasonSnapshot: reason,
        }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) continue;

      await this.audit.record(db, {
        action: 'BADGE_AWARDED_AUTO',
        entityType: 'USER_BADGE',
        entityId: `${userId}:${badge.id}`,
        after: {
          userId,
          badgeId: badge.id,
          badgeCode: badge.code,
          ruleType: badge.ruleType,
          targetValue: badge.targetValue,
          progressValue,
          reasonSnapshot: reason,
        },
      });
      awards.push({
        badgeId: badge.id,
        code: badge.code,
        progressValue,
        targetValue: badge.targetValue,
        reason,
      });
    }

    return {
      userId,
      evaluated: badges.length,
      awarded: awards.length,
      awards,
    };
  }

  /**
   * Evalúa todas las reglas activas para un usuario. La restricción única
   * (userId, badgeId) y createMany(skipDuplicates) hacen la operación segura
   * ante reintentos y carreras.
   */
  evaluateForUser(userId: string, badgeId?: string): Promise<BadgeEvaluationResult> {
    return this.prisma.$transaction((tx) => this.evaluateWithDatabase(tx, userId, badgeId));
  }

  /**
   * Recorre usuarios activos por lotes. Se usa únicamente cuando un
   * administrador activa una regla retroactiva o solicita reevaluarla.
   */
  async evaluateForAllUsers(badgeId: string) {
    let cursor: string | undefined;
    let evaluatedUsers = 0;
    let awarded = 0;

    do {
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!users.length) break;

      for (const user of users) {
        const result = await this.evaluateForUser(user.id, badgeId);
        evaluatedUsers += 1;
        awarded += result.awarded;
      }
      cursor = users.at(-1)?.id;
      if (users.length < 100) break;
    } while (cursor);

    return { badgeId, evaluatedUsers, awarded };
  }

  /**
   * Otorga una insignia preexistente sin convertirla en una regla automática.
   * También conserva el comportamiento histórico de las insignias de sistema.
   */
  async grantByCode(
    userId: string,
    code: string,
    reason: string,
    actor?: AuthUser | null,
  ): Promise<{ granted: boolean; already: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const [user, badge] = await Promise.all([
        tx.user.findUnique({ where: { id: userId }, select: { id: true } }),
        tx.badge.findUnique({ where: { code } }),
      ]);
      if (!user || !badge) return { granted: false, already: false };

      const inserted = await tx.userBadge.createMany({
        data: [{ userId, badgeId: badge.id, reasonSnapshot: reason }],
        skipDuplicates: true,
      });
      if (!inserted.count) return { granted: true, already: true };

      await this.audit.record(tx, {
        actor,
        action: actor ? 'BADGE_AWARDED_MANUAL' : 'BADGE_AWARDED_SYSTEM',
        entityType: 'USER_BADGE',
        entityId: `${userId}:${badge.id}`,
        after: { userId, badgeId: badge.id, badgeCode: code, reasonSnapshot: reason },
      });
      return { granted: true, already: false };
    });
  }
}
