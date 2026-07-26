import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { BadgeRuleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BadgeRulesService } from './badge-rules.service';

const BADGE_EVALUATION_INTERVAL_MS = 15 * 60 * 1_000;
const BADGE_EVALUATION_BATCH_SIZE = 200;
const BADGE_EVALUATION_CONCURRENCY = 10;

/**
 * Las mentorías pasan a COMPLETED por reloj (endsAt), no por un comando. Este
 * worker cubre ese único evento temporal; las demás reglas se evalúan desde
 * sus servicios de dominio. La asignación sigue siendo idempotente, por lo que
 * ejecutar varias instancias es seguro.
 */
@Injectable()
export class BadgeRulesWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BadgeRulesWorker.name);
  private timer?: NodeJS.Timeout;
  private lastSuccessfulRun?: Date;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly badgeRules: BadgeRulesService,
  ) {}

  onApplicationBootstrap() {
    void this.runNow();
    this.timer = setInterval(() => void this.runNow(), BADGE_EVALUATION_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runNow() {
    if (this.running) return { skipped: true, evaluatedUsers: 0 };
    this.running = true;
    const startedAt = new Date();
    try {
      const configured = await this.prisma.badge.count({
        where: {
          isActive: true,
          ruleType: BadgeRuleType.COMPLETED_MENTORSHIPS_COUNT,
          targetValue: { not: null },
        },
      });
      if (!configured) {
        this.lastSuccessfulRun = startedAt;
        return { skipped: false, evaluatedUsers: 0 };
      }

      let evaluatedUsers = 0;
      let skip = 0;
      for (;;) {
        const enrollments = await this.prisma.mentorshipEnrollment.findMany({
          where: {
            mentorship: {
              endsAt: {
                not: null,
                lte: startedAt,
                ...(this.lastSuccessfulRun ? { gt: this.lastSuccessfulRun } : {}),
              },
            },
            user: { isActive: true },
          },
          distinct: ['userId'],
          orderBy: { userId: 'asc' },
          take: BADGE_EVALUATION_BATCH_SIZE,
          skip,
          select: { userId: true },
        });
        for (let offset = 0; offset < enrollments.length; offset += BADGE_EVALUATION_CONCURRENCY) {
          await Promise.all(
            enrollments
              .slice(offset, offset + BADGE_EVALUATION_CONCURRENCY)
              .map((enrollment) => this.badgeRules.evaluateForUser(enrollment.userId)),
          );
        }
        evaluatedUsers += enrollments.length;
        if (enrollments.length < BADGE_EVALUATION_BATCH_SIZE) break;
        skip += BADGE_EVALUATION_BATCH_SIZE;
      }
      this.lastSuccessfulRun = startedAt;
      return { skipped: false, evaluatedUsers };
    } catch (error) {
      // No avanzar la ventana permite reintentar el mismo intervalo.
      this.logger.error(`No se pudieron evaluar mentorías completadas: ${error}`);
      return { skipped: false, evaluatedUsers: 0, failed: true };
    } finally {
      this.running = false;
    }
  }
}
