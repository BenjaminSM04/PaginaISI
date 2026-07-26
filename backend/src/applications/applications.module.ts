import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Prisma, RoleName } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { paginate } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

const APPLICATION_ICON_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Admite rutas internas absolutas y HTTPS externo. Rechaza esquemas activos
 * (javascript/data), URLs con credenciales, protocol-relative y barras
 * invertidas que los navegadores pueden reinterpretar como un host.
 */
export function normalizeSafeApplicationUrl(value: string): string | null {
  const url = value.trim();
  if (
    !url
    || url.length > 2_048
    || /[\u0000-\u001F\u007F\\]/.test(url)
    || /%(?:2f|5c)/i.test(url)
  ) return null;
  if (url.startsWith('/') && !url.startsWith('//')) {
    try {
      const parsed = new URL(url, 'https://portal.isi.invalid');
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function publicApplicationWhere(user: AuthUser | null): Prisma.InstitutionalApplicationWhereInput {
  return {
    isActive: true,
    OR: [
      { visibleRoles: { equals: [] } },
      ...(user?.roles?.length ? [{ visibleRoles: { hasSome: user.roles } }] : []),
    ],
  };
}

export class CreateApplicationDto {
  @ApiProperty() @IsString() @MaxLength(80) @Matches(/\S/) name: string;
  @ApiProperty() @IsString() @MaxLength(500) @Matches(/\S/) description: string;
  @ApiPropertyOptional({ example: 'external-link' })
  @IsOptional() @IsString() @MaxLength(40) @Matches(APPLICATION_ICON_PATTERN) icon?: string;
  @ApiProperty({ example: 'https://biblioteca.example.edu' })
  @IsString() @MaxLength(2_048) @Matches(/\S/) url: string;
  @ApiProperty() @IsString() @MaxLength(60) @Matches(/\S/) category: string;
  @ApiPropertyOptional({ minimum: -10_000, maximum: 10_000 })
  @IsOptional() @IsInt() @Min(-10_000) @Max(10_000) sortOrder?: number;
  @ApiPropertyOptional({ enum: RoleName, isArray: true, description: 'Vacío significa visible para todos' })
  @IsOptional() @IsArray() @ArrayMaxSize(4) @ArrayUnique() @IsEnum(RoleName, { each: true })
  visibleRoles?: RoleName[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() openInNewTab?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateApplicationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) @Matches(/\S/) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(/\S/) description?: string;
  @ApiPropertyOptional({ example: 'external-link' })
  @IsOptional() @IsString() @MaxLength(40) @Matches(APPLICATION_ICON_PATTERN) icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2_048) @Matches(/\S/) url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) @Matches(/\S/) category?: string;
  @ApiPropertyOptional({ minimum: -10_000, maximum: 10_000 })
  @IsOptional() @IsInt() @Min(-10_000) @Max(10_000) sortOrder?: number;
  @ApiPropertyOptional({ enum: RoleName, isArray: true, description: 'Vacío significa visible para todos' })
  @IsOptional() @IsArray() @ArrayMaxSize(4) @ArrayUnique() @IsEnum(RoleName, { each: true })
  visibleRoles?: RoleName[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() openInNewTab?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListApplicationsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) category?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional() @IsIn(['true', 'false']) isActive?: 'true' | 'false';
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listVisible(user: AuthUser | null) {
    return this.prisma.institutionalApplication.findMany({
      where: publicApplicationWhere(user),
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listAdmin(query: ListApplicationsDto) {
    const { take, skip, page } = paginate(query.page, query.limit);
    const term = query.search?.trim();
    const where: Prisma.InstitutionalApplicationWhereInput = {
      ...(query.category?.trim()
        ? { category: { equals: query.category.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive === 'true' }),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
              { category: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.institutionalApplication.count({ where }),
      this.prisma.institutionalApplication.findMany({
        where,
        take,
        skip,
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return {
      items,
      total,
      page,
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  private normalizedData(dto: CreateApplicationDto | UpdateApplicationDto) {
    const url = dto.url === undefined ? undefined : normalizeSafeApplicationUrl(dto.url);
    if (dto.url !== undefined && !url) {
      throw new BadRequestException('La URL debe ser una ruta interna válida o una URL HTTPS sin credenciales');
    }
    return {
      ...dto,
      ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
      ...(dto.description === undefined ? {} : { description: dto.description.trim() }),
      ...(dto.category === undefined ? {} : { category: dto.category.trim() }),
      ...(dto.icon === undefined ? {} : { icon: dto.icon.trim().toLowerCase() }),
      ...(url === undefined ? {} : { url }),
    };
  }

  create(actor: AuthUser, dto: CreateApplicationDto) {
    const data = this.normalizedData(dto) as Prisma.InstitutionalApplicationCreateInput;
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.institutionalApplication.create({ data });
      await this.audit.record(tx, {
        actor,
        action: 'APPLICATION_CREATED',
        entityType: 'INSTITUTIONAL_APPLICATION',
        entityId: application.id,
        after: application,
      });
      return application;
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateApplicationDto) {
    const before = await this.prisma.institutionalApplication.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Aplicación no encontrada');
    const data = this.normalizedData(dto);
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.institutionalApplication.update({ where: { id }, data });
      await this.audit.record(tx, {
        actor,
        action: before.isActive && !application.isActive
          ? 'APPLICATION_DEACTIVATED'
          : 'APPLICATION_UPDATED',
        entityType: 'INSTITUTIONAL_APPLICATION',
        entityId: id,
        before,
        after: application,
      });
      return application;
    });
  }

  async remove(actor: AuthUser, id: string) {
    const before = await this.prisma.institutionalApplication.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Aplicación no encontrada');
    await this.prisma.$transaction(async (tx) => {
      await tx.institutionalApplication.delete({ where: { id } });
      await this.audit.record(tx, {
        actor,
        action: 'APPLICATION_DELETED',
        entityType: 'INSTITUTIONAL_APPLICATION',
        entityId: id,
        before,
      });
    });
    return { deleted: true };
  }
}

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Aplicaciones activas visibles para el visitante o los roles del usuario autenticado',
  })
  list(@CurrentUser() user: AuthUser | null) {
    return this.applications.listVisible(user);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleName.ADMIN)
@Controller('admin/applications')
export class AdminApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Listar aplicaciones institucionales' })
  list(@Query() query: ListApplicationsDto) {
    return this.applications.listAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Crear una aplicación institucional' })
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateApplicationDto) {
    return this.applications.create(actor, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Editar, ordenar o activar/desactivar una aplicación' })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applications.update(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Eliminar una aplicación institucional' })
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.applications.remove(actor, id);
  }
}

@Module({
  providers: [ApplicationsService],
  controllers: [ApplicationsController, AdminApplicationsController],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
