import {
  Body, Controller, Get, Global, Injectable, Logger, Module, NotFoundException, Param, Patch, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { NotificationType, Prisma } from '@prisma/client';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AllowUnverified, CurrentUser, AuthUser } from '../common/decorators';
import { paginate } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

export class NotificationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ enum: ['all', 'unread'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'unread'])
  filter?: 'all' | 'unread';
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contentReview?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forumActivity?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() eventRegistrations?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mentorships?: boolean;
}

export interface SendNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  dedupeKey?: string | null;
}

type PreferenceKey = 'contentReview' | 'forumActivity' | 'eventRegistrations' | 'mentorships';

export function preferenceKeyForType(type: NotificationType): PreferenceKey | null {
  if (type === 'CONTENT_REVIEW') return 'contentReview';
  if (type === 'FORUM_ANSWER' || type === 'FORUM_ACCEPTED') return 'forumActivity';
  if (type === 'EVENT_REGISTRATION') return 'eventRegistrations';
  if (type === 'MENTORSHIP_ENROLLMENT') return 'mentorships';
  return null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: NotificationQueryDto) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const where = query.filter === 'unread' ? { userId, readAt: null } : { userId };
    const [total, unreadCount, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true,
        },
      }),
    ]);
    return { items, total, unreadCount, page, limit: take, pages: Math.ceil(total / take) };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, readAt: true },
    });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    if (notification.readAt) return notification;
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
      select: { id: true, readAt: true },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async preferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: {
        contentReview: true,
        forumActivity: true,
        eventRegistrations: true,
        mentorships: true,
        updatedAt: true,
      },
    });
  }

  async updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    const data = {
      contentReview: dto.contentReview,
      forumActivity: dto.forumActivity,
      eventRegistrations: dto.eventRegistrations,
      mentorships: dto.mentorships,
    };
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: {
        contentReview: true,
        forumActivity: true,
        eventRegistrations: true,
        mentorships: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Entrega persistente de mejor esfuerzo: una falla de notificaciones no revierte
   * la acción de dominio que el usuario acaba de completar.
   */
  async send(input: SendNotificationInput) {
    try {
      const preferenceKey = preferenceKeyForType(input.type);
      if (preferenceKey) {
        const preferences = await this.prisma.notificationPreference.findUnique({
          where: { userId: input.userId },
          select: { [preferenceKey]: true },
        });
        if (preferences && !preferences[preferenceKey]) return null;
      }

      const href = input.href && /^\/(?!\/)/.test(input.href) ? input.href.slice(0, 500) : null;
      const data: Prisma.NotificationUncheckedCreateInput = {
        userId: input.userId,
        type: input.type,
        title: input.title.trim().slice(0, 180),
        body: input.body?.trim().slice(0, 600) || null,
        href,
        dedupeKey: input.dedupeKey?.trim().slice(0, 180) || null,
      };

      if (data.dedupeKey) {
        return await this.prisma.notification.upsert({
          where: { userId_dedupeKey: { userId: input.userId, dedupeKey: data.dedupeKey } },
          create: data,
          update: {},
        });
      }
      return await this.prisma.notification.create({ data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.warn(`No se pudo persistir una notificación (${input.type}): ${message}`);
      return null;
    }
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@AllowUnverified()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mis notificaciones paginadas' })
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Conteo de mis notificaciones no leídas' })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Mis preferencias de notificaciones' })
  preferences(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Actualizar mis preferencias de notificaciones' })
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notifications.updatePreferences(user.id, dto);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas mis notificaciones como leídas' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar una notificación propia como leída' })
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}

@Global()
@Module({
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
