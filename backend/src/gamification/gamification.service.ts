import { Injectable, Logger } from '@nestjs/common';
import { PointCategory, PointReason, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BadgeRulesService } from './badge-rules.service';

const CATEGORY_FIELD: Record<PointCategory, 'devPoints' | 'researchPoints' | 'communityPoints'> = {
  DEV: 'devPoints',
  RESEARCH: 'researchPoints',
  COMMUNITY: 'communityPoints',
};

export interface PointAwardResult {
  awarded: boolean;
  points: number;
  configuredPoints: number;
  category: PointCategory | null;
  transactionId?: string;
}

export interface BestAnswerPointReassignment {
  questionId: string;
  assignmentId: string;
  previous?: { userId: string; answerId: string } | null;
  next: { userId: string; answerId: string };
}

export interface BestAnswerPointResult {
  awardedPoints: number;
  revokedPoints: number;
  configuredPoints: number;
  ledgerEntries: number;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    private prisma: PrismaService,
    private readonly badgeRules: BadgeRulesService,
  ) {}

  /**
   * Variante transaccional para que una acción de dominio y sus puntos se
   * confirmen o reviertan juntos. El resultado expone los puntos realmente
   * acreditados, no el valor asumido por la interfaz.
   */
  async awardInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    reason: PointReason,
    sourceType: string,
    sourceId: string,
  ): Promise<PointAwardResult> {
    const rule = await tx.pointRule.findUnique({ where: { reason } });
    if (!rule || !rule.isActive || rule.points === 0) {
      return {
        awarded: false,
        points: 0,
        configuredPoints: rule?.points ?? 0,
        category: rule?.category ?? null,
      };
    }

    const existing = await tx.pointsTransaction.findFirst({
      where: { userId, reason, sourceType, sourceId },
      select: { id: true },
    });
    if (existing) {
      return {
        awarded: false,
        points: 0,
        configuredPoints: rule.points,
        category: rule.category,
      };
    }

    if (rule.dailyLimit) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayCount = await tx.pointsTransaction.count({
        where: { userId, reason, points: { gt: 0 }, createdAt: { gte: startOfDay } },
      });
      if (todayCount >= rule.dailyLimit) {
        return {
          awarded: false,
          points: 0,
          configuredPoints: rule.points,
          category: rule.category,
        };
      }
    }

    const transaction = await tx.pointsTransaction.create({
      data: {
        userId,
        reason,
        category: rule.category,
        points: rule.points,
        sourceType,
        sourceId,
      },
      select: { id: true },
    });
    const field = CATEGORY_FIELD[rule.category];
    await tx.profile.update({
      where: { userId },
      data: { [field]: { increment: rule.points }, totalPoints: { increment: rule.points } },
    });
    return {
      awarded: true,
      points: rule.points,
      configuredPoints: rule.points,
      category: rule.category,
      transactionId: transaction.id,
    };
  }

  /**
   * Acredita puntos según la regla configurada. Idempotente por (userId, reason, sourceType, sourceId)
   * y respeta el límite diario de la regla. Todo punto queda como transacción auditable.
   */
  async awardWithResult(
    userId: string,
    reason: PointReason,
    sourceType?: string,
    sourceId?: string,
  ): Promise<PointAwardResult> {
    let result: PointAwardResult = {
      awarded: false,
      points: 0,
      configuredPoints: 0,
      category: null,
    };
    try {
      result = await this.prisma.$transaction(
        (tx) => this.awardInTransaction(tx, userId, reason, sourceType ?? 'SYSTEM', sourceId ?? reason),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2002' || e.code === 'P2034'))) {
        this.logger.error(`Error acreditando puntos: ${e}`);
      }
    }
    // La condición de una insignia puede depender del evento de dominio aunque
    // la regla de puntos esté inactiva o el ledger ya contenga la recompensa.
    await this.evaluateBadgesForUser(userId);
    return result;
  }

  async award(userId: string, reason: PointReason, sourceType?: string, sourceId?: string): Promise<boolean> {
    return (await this.awardWithResult(userId, reason, sourceType, sourceId)).awarded;
  }

  /**
   * Traslada la recompensa de una mejor respuesta sin borrar historia. Se
   * calculan saldos por categoría a partir del ledger y se escriben ajustes
   * compensatorios explícitos; repetir cambios nunca acumula dos recompensas
   * activas para una misma pregunta.
   */
  async reassignBestAnswerInTransaction(
    tx: Prisma.TransactionClient,
    input: BestAnswerPointReassignment,
  ): Promise<BestAnswerPointResult> {
    const rule = await tx.pointRule.findUnique({ where: { reason: PointReason.RESPUESTA_ACEPTADA } });
    const identities = [
      ...(input.previous ? [input.previous] : []),
      input.next,
    ];
    const rows = await tx.pointsTransaction.findMany({
      where: {
        reason: PointReason.RESPUESTA_ACEPTADA,
        OR: identities.map(({ userId, answerId }) => ({ userId, sourceId: answerId })),
      },
      select: { userId: true, sourceId: true, category: true, points: true },
    });

    const balance = (userId: string, answerId: string, category: PointCategory) => rows
      .filter((row) => row.userId === userId && row.sourceId === answerId && row.category === category)
      .reduce((total, row) => total + row.points, 0);
    const categories = Object.values(PointCategory);
    const adjustments: Array<{
      userId: string;
      answerId: string;
      category: PointCategory;
      points: number;
      kind: 'REVERSAL' | 'ASSIGNMENT';
    }> = [];

    if (input.previous) {
      for (const category of categories) {
        const current = balance(input.previous.userId, input.previous.answerId, category);
        if (current !== 0) {
          adjustments.push({
            ...input.previous,
            category,
            points: -current,
            kind: 'REVERSAL',
          });
        }
      }
    }

    const configuredPoints = rule?.isActive ? rule.points : 0;
    for (const category of categories) {
      const current = balance(input.next.userId, input.next.answerId, category);
      const expected = rule?.isActive && category === rule.category ? rule.points : 0;
      const delta = expected - current;
      if (delta !== 0) {
        adjustments.push({
          ...input.next,
          category,
          points: delta,
          kind: 'ASSIGNMENT',
        });
      }
    }

    for (const adjustment of adjustments) {
      await tx.pointsTransaction.create({
        data: {
          userId: adjustment.userId,
          reason: PointReason.RESPUESTA_ACEPTADA,
          category: adjustment.category,
          points: adjustment.points,
          sourceType: `FORUM_BEST_ANSWER_${adjustment.kind}:${input.assignmentId}:${adjustment.category}`,
          sourceId: adjustment.answerId,
          note: adjustment.kind === 'REVERSAL'
            ? `Reversión por cambio de mejor respuesta en la pregunta ${input.questionId}`
            : `Asignación de mejor respuesta en la pregunta ${input.questionId}`,
        },
      });
      const field = CATEGORY_FIELD[adjustment.category];
      await tx.profile.update({
        where: { userId: adjustment.userId },
        data: {
          [field]: { increment: adjustment.points },
          totalPoints: { increment: adjustment.points },
        },
      });
    }

    return {
      awardedPoints: adjustments
        .filter((entry) => entry.kind === 'ASSIGNMENT' && entry.points > 0)
        .reduce((total, entry) => total + entry.points, 0),
      revokedPoints: adjustments
        .filter((entry) => entry.kind === 'REVERSAL' && entry.points < 0)
        .reduce((total, entry) => total - entry.points, 0),
      configuredPoints,
      ledgerEntries: adjustments.length,
    };
  }

  /** Otorga una insignia si el usuario aún no la tiene. */
  async grantBadge(userId: string, code: string, reason = 'Insignia otorgada por una acción del sistema'): Promise<boolean> {
    const result = await this.badgeRules.grantByCode(userId, code, reason);
    return result.granted;
  }

  /**
   * Punto de integración para eventos que no conceden puntos, por ejemplo
   * marcar asistencia. Los módulos de dominio pueden invocarlo tras confirmar
   * su transacción.
   */
  async evaluateBadgesForUser(userId: string) {
    if (!this.badgeRules) return { userId, evaluated: 0, awarded: 0, awards: [] };
    try {
      return await this.badgeRules.evaluateForUser(userId);
    } catch (error) {
      // Una insignia complementa el evento de dominio: un fallo temporal en su
      // evaluación se registra, pero no debe revertir una acción ya confirmada.
      this.logger.error(`Error evaluando insignias automáticas para ${userId}: ${error}`);
      return { userId, evaluated: 0, awarded: 0, awards: [] };
    }
  }

  /** Insignias automáticas tras aprobar un proyecto. */
  async onProjectApproved(ownerId: string, projectId: string) {
    await this.award(ownerId, 'PROYECTO_APROBADO', 'PROJECT', projectId);
    const count = await this.prisma.project.count({ where: { ownerId, status: 'APPROVED' } });
    if (count >= 1) await this.grantBadge(ownerId, 'PRIMER_PROYECTO', 'Primer proyecto aprobado');
    if (count >= 2) await this.grantBadge(ownerId, 'DEV_CONTRIBUTOR', 'Dos proyectos aprobados');
  }

  /** Insignias automáticas tras aprobar un artículo. */
  async onArticleApproved(ownerId: string, articleId: string) {
    await this.award(ownerId, 'ARTICULO_APROBADO', 'ARTICLE', articleId);
    const count = await this.prisma.article.count({ where: { ownerId, status: 'APPROVED' } });
    if (count >= 1) await this.grantBadge(ownerId, 'PRIMER_ARTICULO', 'Primer artículo aprobado');
    if (count >= 2) await this.grantBadge(ownerId, 'INVESTIGADOR_JUNIOR', 'Dos artículos aprobados');
  }

  async onAnswerCreated(authorId: string, answerId: string) {
    await this.award(authorId, 'RESPUESTA_PUBLICADA', 'ANSWER', answerId);
    const count = await this.prisma.forumAnswer.count({ where: { authorId } });
    if (count >= 1) await this.grantBadge(authorId, 'PRIMERA_RESPUESTA', 'Primera respuesta publicada');
  }

  async onAnswerAccepted(authorId: string, answerId: string) {
    await this.award(authorId, 'RESPUESTA_ACEPTADA', 'ANSWER', answerId);
    await this.grantBadge(authorId, 'RESPUESTA_ACEPTADA', 'Una respuesta fue elegida como mejor respuesta');
  }

  async onBestAnswerSelected(authorId: string) {
    await this.evaluateBadgesForUser(authorId);
    await this.grantBadge(authorId, 'RESPUESTA_ACEPTADA', 'Una respuesta fue elegida como mejor respuesta');
  }

  async onCommunityJoined(userId: string, communityId: string) {
    const reward = await this.awardWithResult(userId, 'UNIRSE_COMUNIDAD', 'COMMUNITY', communityId);
    const count = await this.prisma.communityMember.count({ where: { userId } });
    if (count >= 3) await this.grantBadge(userId, 'COMUNIDAD_ACTIVA', 'Participación en tres comunidades');
    return reward;
  }
}
