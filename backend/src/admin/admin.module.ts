import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseEnumPipe, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { BadgeRuleType, PointReason, Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { paginate } from '../common/utils';
import {
  convertRasterToBadgeIcon, isSafeBadgeIcon, MAX_BADGE_ICON_LENGTH, MAX_BADGE_SOURCE_SIZE, UnsafeBadgeIconError,
} from './badge-icon-converter';
import { AuditService } from '../audit/audit.service';
import { BadgeRulesService } from '../gamification/badge-rules.service';

const BADGE_RASTER_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

export class UpdateUserRolesDto {
  @ApiProperty({ enum: RoleName, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsEnum(RoleName, { each: true })
  roles: RoleName[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePointRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(-1000) @Max(1000) points?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000) dailyLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) label?: string;
}

export class UpsertBadgeDto {
  @ApiProperty() @IsString() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/) code: string;
  @ApiProperty() @IsString() @MaxLength(60) @Matches(/\S/) name: string;
  @ApiProperty() @IsString() @MaxLength(200) @Matches(/\S/) description: string;
  @ApiPropertyOptional({ description: 'Clave Lucide permitida o SVG generado por /admin/badges/convert-icon' })
  @IsOptional() @IsString() @MaxLength(MAX_BADGE_ICON_LENGTH) icon?: string;
  @ApiPropertyOptional({ example: '#0C447C' })
  @IsOptional() @IsString() @MaxLength(7) @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string;
  @ApiPropertyOptional({ enum: BadgeRuleType, nullable: true })
  @IsOptional() @IsEnum(BadgeRuleType) ruleType?: BadgeRuleType | null;
  @ApiPropertyOptional({ minimum: 1, maximum: 1_000_000, nullable: true })
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) targetValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRetroactive?: boolean;
}

export class UpdateBadgeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) @Matches(/\S/) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Matches(/\S/) description?: string;
  @ApiPropertyOptional({ description: 'Clave Lucide permitida o SVG generado por /admin/badges/convert-icon' })
  @IsOptional() @IsString() @MaxLength(MAX_BADGE_ICON_LENGTH) icon?: string;
  @ApiPropertyOptional({ example: '#0C447C', nullable: true })
  @IsOptional() @IsString() @MaxLength(7) @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string | null;
  @ApiPropertyOptional({ enum: BadgeRuleType, nullable: true })
  @IsOptional() @IsEnum(BadgeRuleType) ruleType?: BadgeRuleType | null;
  @ApiPropertyOptional({ minimum: 1, maximum: 1_000_000, nullable: true })
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) targetValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRetroactive?: boolean;
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly badgeRules: BadgeRulesService,
  ) {}

  async dashboard() {
    const [users, projects, pendingProjects, articles, pendingArticles, questions, events, communities, pendingReports, news] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.project.count({ where: { status: 'APPROVED' } }),
        this.prisma.project.count({ where: { status: 'PENDING' } }),
        this.prisma.article.count({ where: { status: 'APPROVED' } }),
        this.prisma.article.count({ where: { status: 'PENDING' } }),
        this.prisma.forumQuestion.count(),
        this.prisma.event.count(),
        this.prisma.community.count({ where: { isActive: true } }),
        this.prisma.report.count({ where: { status: 'PENDING' } }),
        this.prisma.news.count(),
      ]);
    const recentTransactions = await this.prisma.pointsTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { user: { select: { username: true, profile: { select: { fullName: true } } } } },
    });
    return {
      counts: { users, projects, pendingProjects, articles, pendingArticles, questions, events, communities, pendingReports, news },
      recentTransactions,
    };
  }

  async listUsers(search?: string, page?: number, limit?: number) {
    const { take, skip } = paginate(page, limit);
    const where: any = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { profile: { fullName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, username: true, isActive: true, createdAt: true,
          roles: { include: { role: true } },
          profile: { select: { fullName: true, semester: true, totalPoints: true, avatarUrl: true } },
        },
      }),
    ]);
    return { total, items: items.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name) })) };
  }

  async updateUser(actorId: string, id: string, dto: UpdateUserRolesDto) {
    return this.prisma.$transaction(async (tx) => {
      // Serializa cambios de roles para que dos administradores no puedan
      // eliminar simultáneamente al último administrador activo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(71100911)`;
      const user = await tx.user.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      const currentlyAdmin = user.roles.some((entry) => entry.role.name === 'ADMIN');
      const removesAdmin = currentlyAdmin && !dto.roles.includes('ADMIN');
      const deactivatesAdmin = currentlyAdmin && dto.isActive === false;
      if (actorId === id && (removesAdmin || dto.isActive === false)) {
        throw new BadRequestException('No puedes quitarte el rol administrador ni desactivar tu propia cuenta');
      }
      if (removesAdmin || deactivatesAdmin) {
        const otherActiveAdmins = await tx.user.count({
          where: { id: { not: id }, isActive: true, roles: { some: { role: { name: 'ADMIN' } } } },
        });
        if (otherActiveAdmins === 0) throw new BadRequestException('Debe permanecer al menos un administrador activo');
      }

      const roles = [];
      for (const name of dto.roles) {
        roles.push(await tx.role.upsert({ where: { name }, create: { name }, update: {} }));
      }
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
      if (dto.isActive !== undefined) {
        await tx.user.update({
          where: { id },
          data: dto.isActive
            ? { isActive: true }
            : { isActive: false, securityVersion: { increment: 1 }, refreshTokenHash: null },
        });
        if (!dto.isActive) {
          await tx.refreshSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
      return { ok: true };
    });
  }

  listApprovals() {
    return this.prisma.approvalRequest.findMany({
      where: { decision: null },
      orderBy: { createdAt: 'asc' },
      include: {
        requester: { select: { username: true, profile: { select: { fullName: true } } } },
        reviewer: { select: { username: true, profile: { select: { fullName: true } } } },
      },
    });
  }

  updatePointRule(actor: AuthUser, reason: PointReason, dto: UpdatePointRuleDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.pointRule.findUnique({ where: { reason } });
      if (!before) throw new NotFoundException('Regla de puntos no encontrada');
      const after = await tx.pointRule.update({ where: { reason }, data: dto });
      await this.audit.record(tx, {
        actor,
        action: 'POINT_RULE_UPDATED',
        entityType: 'POINT_RULE',
        entityId: after.id,
        before,
        after,
      });
      return after;
    });
  }

  private assertBadgeConfiguration(ruleType: BadgeRuleType | null, targetValue: number | null) {
    if ((ruleType === null) !== (targetValue === null)) {
      throw new BadRequestException('El tipo de regla y el valor objetivo deben definirse o eliminarse juntos');
    }
    if (targetValue !== null && targetValue < 1) {
      throw new BadRequestException('El valor objetivo debe ser mayor que cero');
    }
  }

  async listBadges(search?: string, page?: number, limit?: number) {
    const { take, skip } = paginate(page, limit);
    const term = search?.trim().slice(0, 100);
    const where: Prisma.BadgeWhereInput = term
      ? {
          OR: [
            { code: { contains: term, mode: 'insensitive' } },
            { name: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.badge.count({ where }),
      this.prisma.badge.findMany({
        where,
        take,
        skip,
        orderBy: [{ createdAt: 'desc' }, { code: 'asc' }],
        include: { _count: { select: { users: true } } },
      }),
    ]);
    return {
      items,
      total,
      page: Math.max(1, Number(page) || 1),
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async upsertBadge(actor: AuthUser, dto: UpsertBadgeDto) {
    if (dto.icon !== undefined && !isSafeBadgeIcon(dto.icon)) {
      throw new BadRequestException('Icono no permitido. Usa el catálogo o el conversor seguro');
    }
    const before = await this.prisma.badge.findUnique({ where: { code: dto.code } });
    const ruleType = dto.ruleType === undefined ? before?.ruleType ?? null : dto.ruleType;
    const targetValue = dto.targetValue === undefined ? before?.targetValue ?? null : dto.targetValue;
    this.assertBadgeConfiguration(ruleType, targetValue);

    const after = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.badge.upsert({
        where: { code: dto.code },
        create: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          icon: dto.icon ?? 'award',
          color: dto.color,
          ruleType,
          targetValue,
          isActive: dto.isActive ?? true,
          isRetroactive: dto.isRetroactive ?? false,
        },
        update: {
          name: dto.name,
          description: dto.description,
          icon: dto.icon,
          color: dto.color,
          ruleType,
          targetValue,
          isActive: dto.isActive,
          isRetroactive: dto.isRetroactive,
        },
      });
      await this.audit.record(tx, {
        actor,
        action: before ? 'BADGE_UPDATED' : 'BADGE_CREATED',
        entityType: 'BADGE',
        entityId: saved.id,
        before: before ?? undefined,
        after: saved,
      });
      return saved;
    });

    const ruleChanged = !before
      || before.ruleType !== after.ruleType
      || before.targetValue !== after.targetValue
      || before.isActive !== after.isActive
      || before.isRetroactive !== after.isRetroactive;
    const retroactiveEvaluation = ruleChanged
      && after.isActive
      && after.isRetroactive
      && after.ruleType
      ? await this.badgeRules.evaluateForAllUsers(after.id)
      : undefined;
    return { ...after, ...(retroactiveEvaluation ? { retroactiveEvaluation } : {}) };
  }

  async updateBadge(actor: AuthUser, id: string, dto: UpdateBadgeDto) {
    const before = await this.prisma.badge.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Insignia no encontrada');
    if (dto.icon !== undefined && !isSafeBadgeIcon(dto.icon)) {
      throw new BadRequestException('Icono no permitido. Usa el catálogo o el conversor seguro');
    }
    const ruleType = dto.ruleType === undefined ? before.ruleType : dto.ruleType;
    const targetValue = dto.targetValue === undefined ? before.targetValue : dto.targetValue;
    this.assertBadgeConfiguration(ruleType, targetValue);

    const after = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.badge.update({
        where: { id },
        data: { ...dto, ruleType, targetValue },
      });
      await this.audit.record(tx, {
        actor,
        action: 'BADGE_UPDATED',
        entityType: 'BADGE',
        entityId: id,
        before,
        after: saved,
      });
      return saved;
    });

    const ruleChanged = before.ruleType !== after.ruleType
      || before.targetValue !== after.targetValue
      || before.isActive !== after.isActive
      || before.isRetroactive !== after.isRetroactive;
    const retroactiveEvaluation = ruleChanged
      && after.isActive
      && after.isRetroactive
      && after.ruleType
      ? await this.badgeRules.evaluateForAllUsers(after.id)
      : undefined;
    return { ...after, ...(retroactiveEvaluation ? { retroactiveEvaluation } : {}) };
  }

  async deleteBadge(actor: AuthUser, id: string) {
    const badge = await this.prisma.badge.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!badge) throw new NotFoundException('Insignia no encontrada');
    if (badge._count.users > 0) {
      throw new BadRequestException('La insignia ya fue otorgada; desactívala para conservar el historial');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.badge.delete({ where: { id } });
      await this.audit.record(tx, {
        actor,
        action: 'BADGE_DELETED',
        entityType: 'BADGE',
        entityId: id,
        before: badge,
      });
    });
    return { deleted: true };
  }

  async evaluateBadge(actor: AuthUser, id: string) {
    const badge = await this.prisma.badge.findUnique({ where: { id } });
    if (!badge) throw new NotFoundException('Insignia no encontrada');
    if (!badge.isActive || !badge.ruleType || !badge.targetValue) {
      throw new BadRequestException('La insignia debe tener una regla activa para evaluarse');
    }
    const result = await this.badgeRules.evaluateForAllUsers(id);
    await this.audit.recordDirect({
      actor,
      action: 'BADGE_RULE_REEVALUATED',
      entityType: 'BADGE',
      entityId: id,
      metadata: result,
    });
    return result;
  }

  async convertBadgeIcon(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Imagen requerida (campo "file")');
    try {
      return await convertRasterToBadgeIcon(file.buffer, file.mimetype);
    } catch (error) {
      if (error instanceof UnsafeBadgeIconError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  async grantBadge(actor: AuthUser, username: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    const badge = await this.prisma.badge.findUnique({ where: { code } });
    if (!user || !badge) throw new NotFoundException('Usuario o insignia no encontrada');
    return this.badgeRules.grantByCode(
      user.id,
      code,
      `Insignia “${badge.name}” asignada manualmente por @${actor.username}`,
      actor,
    );
  }
}

@ApiTags('admin')
@Roles('ADMIN')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService, private audit: AuditService) {}

  @Get('dashboard')
  @ApiOperation({ summary: '[Admin] Métricas generales y actividad reciente' })
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('audit')
  @ApiOperation({ summary: '[Admin] Auditoría unificada del sistema y de proyectos' })
  auditLog(@Query() query: any) {
    return this.audit.list(query);
  }

  @Get('users')
  @ApiOperation({ summary: '[Admin] Gestión de usuarios' })
  users(@Query('search') search?: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.admin.listUsers(search, page, limit);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: '[Admin] Cambiar roles o activar/desactivar usuario' })
  updateUser(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserRolesDto) {
    return this.admin.updateUser(actor.id, id, dto);
  }

  @Get('approvals')
  @ApiOperation({ summary: '[Admin] Solicitudes de aprobación abiertas' })
  approvals() {
    return this.admin.listApprovals();
  }

  @Patch('points/rules/:reason')
  @ApiOperation({ summary: '[Admin] Editar regla de puntos' })
  updateRule(
    @CurrentUser() actor: AuthUser,
    @Param('reason', new ParseEnumPipe(PointReason)) reason: PointReason,
    @Body() dto: UpdatePointRuleDto,
  ) {
    return this.admin.updatePointRule(actor, reason, dto);
  }

  @Get('badges')
  @ApiOperation({ summary: '[Admin] Listar y configurar insignias' })
  badges(@Query('search') search?: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.admin.listBadges(search, page, limit);
  }

  @Post('badges')
  @ApiOperation({ summary: '[Admin] Crear/editar insignia' })
  upsertBadge(@CurrentUser() actor: AuthUser, @Body() dto: UpsertBadgeDto) {
    return this.admin.upsertBadge(actor, dto);
  }

  @Patch('badges/:id')
  @ApiOperation({ summary: '[Admin] Editar configuración de una insignia' })
  updateBadge(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateBadgeDto) {
    return this.admin.updateBadge(actor, id, dto);
  }

  @Delete('badges/:id')
  @ApiOperation({ summary: '[Admin] Eliminar una insignia nunca otorgada' })
  deleteBadge(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.admin.deleteBadge(actor, id);
  }

  @Post('badges/:id/evaluate')
  @ApiOperation({ summary: '[Admin] Reevaluar una regla de insignia para usuarios activos' })
  evaluateBadge(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.admin.evaluateBadge(actor, id);
  }

  @Post('badges/convert-icon')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_BADGE_SOURCE_SIZE, files: 1, fields: 0, parts: 2 },
    fileFilter: (_request, file, callback) => {
      if (!BADGE_RASTER_MIMES.includes(file.mimetype)) {
        callback(new BadRequestException('Solo se aceptan imágenes PNG, JPEG o WebP'), false);
        return;
      }
      callback(null, true);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: '[Admin] Convertir un raster pequeño en un SVG seguro para insignia' })
  convertIcon(@UploadedFile() file?: Express.Multer.File) {
    return this.admin.convertBadgeIcon(file);
  }

  @Post('badges/:code/grant/:username')
  @ApiOperation({ summary: '[Admin] Otorgar insignia manualmente' })
  grant(@CurrentUser() actor: AuthUser, @Param('code') code: string, @Param('username') username: string) {
    return this.admin.grantBadge(actor, username, code);
  }
}

@Module({
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
