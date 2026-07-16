import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseEnumPipe, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PointReason, Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { paginate } from '../common/utils';
import {
  convertRasterToBadgeIcon, isSafeBadgeIcon, MAX_BADGE_ICON_LENGTH, MAX_BADGE_SOURCE_SIZE, UnsafeBadgeIconError,
} from './badge-icon-converter';

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
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

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
    const user = await this.prisma.user.findUnique({
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
      const otherActiveAdmins = await this.prisma.user.count({
        where: { id: { not: id }, isActive: true, roles: { some: { role: { name: 'ADMIN' } } } },
      });
      if (otherActiveAdmins === 0) throw new BadRequestException('Debe permanecer al menos un administrador activo');
    }

    await this.prisma.$transaction(async (tx) => {
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
    });
    return { ok: true };
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

  updatePointRule(reason: PointReason, dto: UpdatePointRuleDto) {
    return this.prisma.pointRule.update({ where: { reason }, data: dto });
  }

  upsertBadge(dto: UpsertBadgeDto) {
    if (dto.icon !== undefined && !isSafeBadgeIcon(dto.icon)) {
      throw new BadRequestException('Icono no permitido. Usa el catálogo o el conversor seguro');
    }
    return this.prisma.badge.upsert({
      where: { code: dto.code },
      create: { ...dto, icon: dto.icon ?? 'award' },
      update: { name: dto.name, description: dto.description, icon: dto.icon, color: dto.color },
    });
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

  async grantBadge(username: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    const badge = await this.prisma.badge.findUnique({ where: { code } });
    if (!user || !badge) throw new NotFoundException('Usuario o insignia no encontrada');
    try {
      await this.prisma.userBadge.create({ data: { userId: user.id, badgeId: badge.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { granted: true, already: true };
      }
      throw error;
    }
    return { granted: true };
  }
}

@ApiTags('admin')
@Roles('ADMIN')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: '[Admin] Métricas generales y actividad reciente' })
  dashboard() {
    return this.admin.dashboard();
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
  updateRule(@Param('reason', new ParseEnumPipe(PointReason)) reason: PointReason, @Body() dto: UpdatePointRuleDto) {
    return this.admin.updatePointRule(reason, dto);
  }

  @Post('badges')
  @ApiOperation({ summary: '[Admin] Crear/editar insignia' })
  upsertBadge(@Body() dto: UpsertBadgeDto) {
    return this.admin.upsertBadge(dto);
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
  grant(@Param('code') code: string, @Param('username') username: string) {
    return this.admin.grantBadge(username, code);
  }
}

@Module({
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
