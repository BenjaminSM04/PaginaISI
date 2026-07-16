import { Injectable, Logger } from '@nestjs/common';
import { PointCategory, PointReason, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CATEGORY_FIELD: Record<PointCategory, 'devPoints' | 'researchPoints' | 'communityPoints'> = {
  DEV: 'devPoints',
  RESEARCH: 'researchPoints',
  COMMUNITY: 'communityPoints',
};

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Acredita puntos según la regla configurada. Idempotente por (userId, reason, sourceType, sourceId)
   * y respeta el límite diario de la regla. Todo punto queda como transacción auditable.
   */
  async award(userId: string, reason: PointReason, sourceType?: string, sourceId?: string): Promise<boolean> {
    const rule = await this.prisma.pointRule.findUnique({ where: { reason } });
    if (!rule || !rule.isActive || rule.points === 0) return false;

    if (rule.dailyLimit) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayCount = await this.prisma.pointsTransaction.count({
        where: { userId, reason, createdAt: { gte: startOfDay } },
      });
      if (todayCount >= rule.dailyLimit) return false;
    }

    const field = CATEGORY_FIELD[rule.category];
    try {
      await this.prisma.$transaction([
        this.prisma.pointsTransaction.create({
          data: {
            userId,
            reason,
            category: rule.category,
            points: rule.points,
            sourceType: sourceType ?? null,
            sourceId: sourceId ?? null,
          },
        }),
        this.prisma.profile.update({
          where: { userId },
          data: { [field]: { increment: rule.points }, totalPoints: { increment: rule.points } },
        }),
      ]);
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return false; // ya acreditado por este mismo hecho
      }
      this.logger.error(`Error acreditando puntos: ${e}`);
      return false;
    }
  }

  /** Otorga una insignia si el usuario aún no la tiene. */
  async grantBadge(userId: string, code: string): Promise<boolean> {
    const badge = await this.prisma.badge.findUnique({ where: { code } });
    if (!badge) return false;
    try {
      await this.prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
      return true;
    } catch {
      return false;
    }
  }

  /** Insignias automáticas tras aprobar un proyecto. */
  async onProjectApproved(ownerId: string, projectId: string) {
    await this.award(ownerId, 'PROYECTO_APROBADO', 'PROJECT', projectId);
    const count = await this.prisma.project.count({ where: { ownerId, status: 'APPROVED' } });
    if (count >= 1) await this.grantBadge(ownerId, 'PRIMER_PROYECTO');
    if (count >= 2) await this.grantBadge(ownerId, 'DEV_CONTRIBUTOR');
  }

  /** Insignias automáticas tras aprobar un artículo. */
  async onArticleApproved(ownerId: string, articleId: string) {
    await this.award(ownerId, 'ARTICULO_APROBADO', 'ARTICLE', articleId);
    const count = await this.prisma.article.count({ where: { ownerId, status: 'APPROVED' } });
    if (count >= 1) await this.grantBadge(ownerId, 'PRIMER_ARTICULO');
    if (count >= 2) await this.grantBadge(ownerId, 'INVESTIGADOR_JUNIOR');
  }

  async onAnswerCreated(authorId: string, answerId: string) {
    await this.award(authorId, 'RESPUESTA_PUBLICADA', 'ANSWER', answerId);
    const count = await this.prisma.forumAnswer.count({ where: { authorId } });
    if (count >= 1) await this.grantBadge(authorId, 'PRIMERA_RESPUESTA');
  }

  async onAnswerAccepted(authorId: string, answerId: string) {
    await this.award(authorId, 'RESPUESTA_ACEPTADA', 'ANSWER', answerId);
    await this.grantBadge(authorId, 'RESPUESTA_ACEPTADA');
  }

  async onCommunityJoined(userId: string, communityId: string) {
    await this.award(userId, 'UNIRSE_COMUNIDAD', 'COMMUNITY', communityId);
    const count = await this.prisma.communityMember.count({ where: { userId } });
    if (count >= 3) await this.grantBadge(userId, 'COMUNIDAD_ACTIVA');
  }
}
