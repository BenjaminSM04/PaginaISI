import { Module } from '@nestjs/common';
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags, OmitType, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';
import { NewsCategory, Prisma, PublicationStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { CurrentUser, Public, Roles, AuthUser } from '../common/decorators';
import { clean, paginate, uniqueSlug } from '../common/utils';
import { ProjectAccessService } from '../project-collaboration/project-access.service';
import {
  ProjectAuditService,
  projectAuditRequestContext,
  projectAuditSnapshotsEqual,
  ProjectAuditRequestContext,
} from '../project-collaboration/project-audit.service';

const WEB_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class CreateNewsDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(400)
  summary: string;

  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(50_000)
  content: string;

  @ApiProperty({ enum: NewsCategory })
  @IsEnum(NewsCategory)
  category: NewsCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  coverUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Slug de la comunidad asociada' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  communitySlug?: string;

  @ApiPropertyOptional({ description: 'Slug del evento asociado' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  eventSlug?: string;
}

export class UpdateNewsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(5) @MaxLength(160) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(10) @MaxLength(400) summary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(20) @MaxLength(50_000) content?: string;
  @ApiPropertyOptional({ enum: NewsCategory }) @IsOptional() @IsEnum(NewsCategory) category?: NewsCategory;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) coverUrl?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) communitySlug?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(140) eventSlug?: string | null;
  @ApiPropertyOptional({ enum: ['DRAFT', 'APPROVED', 'ARCHIVED'] }) @IsOptional() @IsIn(['DRAFT', 'APPROVED', 'ARCHIVED']) status?: PublicationStatus;
  @ApiPropertyOptional({ description: 'Obligatoria si la noticia está vinculada a un proyecto' }) @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
}

export class CreateProjectNewsDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(160) title: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(400) summary: string;
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(50_000) content: string;
  @ApiProperty({ enum: NewsCategory }) @IsEnum(NewsCategory) category: NewsCategory;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) coverUrl?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @ApiProperty({ description: 'Versión del proyecto leída por el cliente' }) @IsInt() @Min(1) expectedVersion: number;
}

export class UpdateProjectNewsDto extends PartialType(OmitType(CreateProjectNewsDto, ['expectedVersion'] as const)) {
  @ApiProperty({ description: 'Versión del proyecto leída por el cliente' }) @IsInt() @Min(1) expectedVersion: number;
}

export class ProjectNewsVersionDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion: number;
}

export class OptionalProjectNewsVersionDto {
  @ApiPropertyOptional({ description: 'Obligatoria si la noticia está vinculada a un proyecto' }) @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
}

const NEWS_INCLUDE = {
  author: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
  community: { select: { slug: true, name: true, accentColor: true } },
  event: { select: { slug: true, title: true, startsAt: true } },
  project: { select: { id: true, slug: true, title: true, version: true } },
} as const;

function newsAuditSnapshot(news: any) {
  return {
    id: news.id,
    projectId: news.projectId,
    authorId: news.authorId,
    slug: news.slug,
    title: news.title,
    summary: news.summary,
    content: news.content,
    category: news.category,
    coverUrl: news.coverUrl,
    tags: [...(news.tags ?? [])],
    status: news.status,
    publishedAt: news.publishedAt ? new Date(news.publishedAt).toISOString() : null,
    communityId: news.communityId,
    eventId: news.eventId,
  };
}

@Injectable()
export class NewsService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
    private projectAccess: ProjectAccessService,
    private projectAudit: ProjectAuditService,
  ) {}

  private async editableProject(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    projectId: string,
    expectedVersion?: number,
    requireVersion = true,
  ) {
    const { project, access } = await this.projectAccess.assertEditor(user, projectId, tx);
    if (requireVersion && expectedVersion === undefined) {
      throw new BadRequestException('expectedVersion es obligatorio para evitar sobrescribir cambios recientes');
    }
    if (expectedVersion !== undefined && expectedVersion !== project.version) {
      throw new ConflictException('La versión enviada ya no es la actual. Recarga el proyecto.');
    }
    const bumped = await tx.project.updateMany({
      where: { id: projectId, version: project.version },
      data: { version: { increment: 1 } },
    });
    if (bumped.count !== 1) {
      throw new ConflictException('El proyecto cambió mientras editabas. Recarga antes de guardar.');
    }
    return { project, access, version: project.version + 1 };
  }

  list(category?: NewsCategory, page?: number, limit?: number, includeAll = false, sort = 'recent') {
    const { take, skip } = paginate(page, limit);
    const where: any = includeAll ? {} : { status: 'APPROVED' };
    if (category) where.category = category;
    const orderBy: any = sort === 'top'
      ? [{ likesCount: 'desc' }, { publishedAt: 'desc' }]
      : { publishedAt: 'desc' };
    return this.prisma.$transaction([
      this.prisma.news.count({ where }),
      this.prisma.news.findMany({
        where,
        orderBy,
        take,
        skip,
        include: NEWS_INCLUDE,
      }),
    ]).then(([total, items]) => ({ total, items }));
  }

  async detail(slug: string, viewer?: AuthUser | null) {
    const news = await this.prisma.news.findUnique({
      where: { slug },
      include: NEWS_INCLUDE,
    });
    if (!news || news.status !== 'APPROVED') throw new NotFoundException('Noticia no encontrada');
    const likedByMe = viewer
      ? !!(await this.prisma.like.findUnique({
          where: { userId_targetType_targetId: { userId: viewer.id, targetType: 'NEWS', targetId: news.id } },
          select: { id: true },
        }))
      : false;
    return { ...news, likedByMe };
  }

  private async resolveLinks(communitySlug?: string | null, eventSlug?: string | null) {
    const [community, event] = await Promise.all([
      communitySlug ? this.prisma.community.findUnique({ where: { slug: communitySlug }, select: { id: true } }) : null,
      eventSlug ? this.prisma.event.findUnique({ where: { slug: eventSlug }, select: { id: true, communityId: true } }) : null,
    ]);
    if (communitySlug && !community) throw new BadRequestException('La comunidad asociada no existe');
    if (eventSlug && !event) throw new BadRequestException('El evento asociado no existe');
    if (community && event?.communityId && event.communityId !== community.id) {
      throw new BadRequestException('El evento no pertenece a la comunidad seleccionada');
    }
    return {
      communityId: community?.id ?? event?.communityId ?? undefined,
      eventId: event?.id,
    };
  }

  async create(user: AuthUser, dto: CreateNewsDto) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException('Solo un administrador puede publicar noticias generales');
    const { communitySlug, eventSlug, ...content } = dto;
    const links = await this.resolveLinks(communitySlug, eventSlug);
    return this.prisma.news.create({
      data: {
        ...content,
        content: clean(dto.content) ?? '',
        slug: uniqueSlug(dto.title),
        tags: [...new Set((dto.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
        ...links,
        authorId: user.id,
        status: 'APPROVED',
        publishedAt: new Date(),
      },
      include: NEWS_INCLUDE,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateNewsDto, request: ProjectAuditRequestContext) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException('Solo un administrador puede editar noticias generales');
    const existing = await this.prisma.news.findUnique({ where: { id }, include: NEWS_INCLUDE });
    if (!existing) throw new NotFoundException('Noticia no encontrada');
    const { communitySlug, eventSlug, expectedVersion, ...content } = dto;
    const data: any = { ...content };
    if (dto.content !== undefined) data.content = clean(dto.content);
    if (dto.tags !== undefined) data.tags = [...new Set(dto.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
    if (dto.status === 'APPROVED') data.publishedAt = new Date();
    const communitySpecified = Object.prototype.hasOwnProperty.call(dto, 'communitySlug');
    const eventSpecified = Object.prototype.hasOwnProperty.call(dto, 'eventSlug');
    if (communitySpecified || eventSpecified) {
      // Un PATCH parcial conserva las asociaciones no mencionadas. Al elegir
      // un evento sin enviar comunidad, se adopta automáticamente la suya.
      const nextEventSlug = eventSpecified ? eventSlug : existing.event?.slug;
      const nextCommunitySlug = communitySpecified
        ? communitySlug
        : eventSpecified && eventSlug
          ? undefined
          : existing.community?.slug;
      const links = await this.resolveLinks(nextCommunitySlug, nextEventSlug);
      data.communityId = links.communityId ?? null;
      if (eventSpecified) data.eventId = links.eventId ?? null;
    }
    if (!existing.projectId) {
      return this.prisma.news.update({ where: { id }, data, include: NEWS_INCLUDE });
    }
    return this.prisma.$transaction(async (tx) => {
      const { project, version } = await this.editableProject(tx, user, existing.projectId!, expectedVersion);
      const current = await tx.news.findFirst({ where: { id, projectId: existing.projectId } });
      if (!current) throw new NotFoundException('Noticia no encontrada');
      const updated = await tx.news.update({ where: { id }, data, include: NEWS_INCLUDE });
      if (projectAuditSnapshotsEqual(newsAuditSnapshot(current), newsAuditSnapshot(updated))) {
        throw new BadRequestException('Los datos enviados no contienen cambios efectivos');
      }
      await this.projectAudit.record(tx, {
        projectId: existing.projectId!,
        actor: user,
        action: 'NEWS_UPDATED',
        entityType: 'NEWS',
        entityId: id,
        before: newsAuditSnapshot(current),
        after: newsAuditSnapshot(updated),
        metadata: { versionBefore: project.version, versionAfter: version, source: 'ADMIN_NEWS' },
        request,
      });
      return { ...updated, projectVersion: version };
    });
  }

  async listForProject(user: AuthUser, projectId: string) {
    await this.projectAccess.assertEditor(user, projectId);
    return this.prisma.news.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: NEWS_INCLUDE,
    });
  }

  async createForProject(
    user: AuthUser,
    projectId: string,
    dto: CreateProjectNewsDto,
    request: ProjectAuditRequestContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { project, version } = await this.editableProject(tx, user, projectId, dto.expectedVersion);
      const news = await tx.news.create({
        data: {
          projectId,
          communityId: project.communityId,
          authorId: user.id,
          slug: uniqueSlug(dto.title),
          title: dto.title.trim(),
          summary: dto.summary.trim(),
          content: clean(dto.content) ?? '',
          category: dto.category,
          coverUrl: dto.coverUrl ?? null,
          tags: [...new Set((dto.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
          status: project.status === 'APPROVED' ? 'APPROVED' : 'DRAFT',
          publishedAt: project.status === 'APPROVED' ? new Date() : null,
        },
        include: NEWS_INCLUDE,
      });
      await this.projectAudit.record(tx, {
        projectId,
        actor: user,
        action: 'NEWS_CREATED',
        entityType: 'NEWS',
        entityId: news.id,
        before: null,
        after: newsAuditSnapshot(news),
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ...news, projectVersion: version };
    });
  }

  async updateForProject(
    user: AuthUser,
    projectId: string,
    newsId: string,
    dto: UpdateProjectNewsDto,
    request: ProjectAuditRequestContext,
  ) {
    const mutable = dto.title !== undefined
      || dto.summary !== undefined
      || dto.content !== undefined
      || dto.category !== undefined
      || dto.coverUrl !== undefined
      || dto.tags !== undefined;
    if (!mutable) throw new BadRequestException('No se recibió ningún cambio para la noticia');

    return this.prisma.$transaction(async (tx) => {
      const { project, version } = await this.editableProject(tx, user, projectId, dto.expectedVersion);
      const current = await tx.news.findFirst({ where: { id: newsId, projectId } });
      if (!current) throw new NotFoundException('Noticia no encontrada en este proyecto');
      const data: Prisma.NewsUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title.trim();
      if (dto.summary !== undefined) data.summary = dto.summary.trim();
      if (dto.content !== undefined) data.content = clean(dto.content) ?? '';
      if (dto.category !== undefined) data.category = dto.category;
      if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl;
      if (dto.tags !== undefined) data.tags = [...new Set(dto.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
      const updated = await tx.news.update({ where: { id: newsId }, data, include: NEWS_INCLUDE });
      if (projectAuditSnapshotsEqual(newsAuditSnapshot(current), newsAuditSnapshot(updated))) {
        throw new BadRequestException('Los datos enviados no contienen cambios efectivos');
      }
      await this.projectAudit.record(tx, {
        projectId,
        actor: user,
        action: 'NEWS_UPDATED',
        entityType: 'NEWS',
        entityId: newsId,
        before: newsAuditSnapshot(current),
        after: newsAuditSnapshot(updated),
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ...updated, projectVersion: version };
    });
  }

  async archiveForProject(
    user: AuthUser,
    projectId: string,
    newsId: string,
    expectedVersion: number | undefined,
    request: ProjectAuditRequestContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { project, version } = await this.editableProject(tx, user, projectId, expectedVersion);
      const current = await tx.news.findFirst({ where: { id: newsId, projectId } });
      if (!current) throw new NotFoundException('Noticia no encontrada en este proyecto');
      if (current.status === 'ARCHIVED') throw new BadRequestException('La noticia ya está archivada');
      const archived = await tx.news.update({ where: { id: newsId }, data: { status: 'ARCHIVED' }, include: NEWS_INCLUDE });
      await this.projectAudit.record(tx, {
        projectId,
        actor: user,
        action: 'NEWS_ARCHIVED',
        entityType: 'NEWS',
        entityId: newsId,
        before: newsAuditSnapshot(current),
        after: newsAuditSnapshot(archived),
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ok: true, version, news: archived };
    });
  }

  async likeStatus(userId: string, id: string) {
    const news = await this.prisma.news.findUnique({ where: { id }, select: { status: true, likesCount: true } });
    if (!news || news.status !== 'APPROVED') throw new NotFoundException('Noticia no encontrada');
    const like = await this.prisma.like.findUnique({
      where: { userId_targetType_targetId: { userId, targetType: 'NEWS', targetId: id } },
      select: { id: true },
    });
    return { liked: !!like, likesCount: news.likesCount };
  }

  async toggleLike(user: AuthUser, id: string) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news || news.status !== 'APPROVED') throw new NotFoundException('Noticia no encontrada');
    if (news.authorId === user.id) throw new BadRequestException('No puedes dar like a tu propia noticia');
    const existing = await this.prisma.like.findUnique({
      where: { userId_targetType_targetId: { userId: user.id, targetType: 'NEWS', targetId: id } },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.like.delete({ where: { id: existing.id } }),
        this.prisma.news.update({ where: { id }, data: { likesCount: { decrement: 1 } } }),
      ]);
      return { liked: false, likesCount: Math.max(0, news.likesCount - 1) };
    }
    await this.prisma.$transaction([
      this.prisma.like.create({ data: { userId: user.id, targetType: 'NEWS', targetId: id } }),
      this.prisma.news.update({ where: { id }, data: { likesCount: { increment: 1 } } }),
    ]);
    await this.gamification.award(news.authorId, 'LIKE_RECIBIDO', 'NEWS', `${id}:by:${user.id}`);
    return { liked: true, likesCount: news.likesCount + 1 };
  }

  async remove(user: AuthUser, id: string, expectedVersion: number | undefined, request: ProjectAuditRequestContext) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException('Solo un administrador puede archivar noticias');
    const existing = await this.prisma.news.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Noticia no encontrada');
    if (existing.status === 'ARCHIVED') return { ok: true, archived: true };
    if (!existing.projectId) {
      const archived = await this.prisma.news.update({ where: { id }, data: { status: 'ARCHIVED' }, include: NEWS_INCLUDE });
      return { ok: true, archived: true, news: archived };
    }
    return this.prisma.$transaction(async (tx) => {
      const { project, version } = await this.editableProject(tx, user, existing.projectId!, expectedVersion);
      const current = await tx.news.findFirst({ where: { id, projectId: existing.projectId } });
      if (!current) throw new NotFoundException('Noticia no encontrada');
      const archived = await tx.news.update({ where: { id }, data: { status: 'ARCHIVED' }, include: NEWS_INCLUDE });
      await this.projectAudit.record(tx, {
        projectId: existing.projectId!,
        actor: user,
        action: 'NEWS_ARCHIVED',
        entityType: 'NEWS',
        entityId: id,
        before: newsAuditSnapshot(current),
        after: newsAuditSnapshot(archived),
        metadata: { versionBefore: project.version, versionAfter: version, source: 'ADMIN_NEWS' },
        request,
      });
      return { ok: true, archived: true, version, news: archived };
    });
  }
}

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private news: NewsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Noticias publicadas, filtrables por categoría y ordenables por recientes o likes' })
  list(@Query('category') category?: NewsCategory, @Query('page') page?: number, @Query('limit') limit?: number, @Query('sort') sort?: string) {
    return this.news.list(category, page, limit, false, sort);
  }

  @Get('admin/all')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Todas las noticias, incluidas borradores y archivadas' })
  listAll(@Query('category') category?: NewsCategory, @Query('page') page?: number, @Query('limit') limit?: number, @Query('sort') sort?: string) {
    return this.news.list(category, page, limit, true, sort);
  }

  @Get(':id/like-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado de mi like en una noticia' })
  likeStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.news.likeStatus(user.id, id);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Detalle de noticia por slug' })
  detail(@Param('slug') slug: string, @CurrentUser() user: AuthUser | null) {
    return this.news.detail(slug, user);
  }

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear y publicar noticia' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNewsDto) {
    return this.news.create(user, dto);
  }

  @Post(':id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alternar like en una noticia' })
  like(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.news.toggleLike(user, id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Editar, publicar o archivar noticia' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateNewsDto, @Req() request: Request) {
    return this.news.update(user, id, dto, projectAuditRequestContext(request));
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Archivar noticia sin eliminar su historial' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() version: OptionalProjectNewsVersionDto,
    @Req() request: Request,
  ) {
    return this.news.remove(user, id, version.expectedVersion, projectAuditRequestContext(request));
  }
}

@ApiTags('project-news')
@ApiBearerAuth()
@Controller('projects/:projectId/news')
export class ProjectNewsController {
  constructor(private news: NewsService) {}

  @Get()
  @ApiOperation({ summary: 'Noticias del proyecto editables por administradores y colaboradores asociados' })
  list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.news.listForProject(user, projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una noticia asociada al proyecto' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectNewsDto,
    @Req() request: Request,
  ) {
    return this.news.createForProject(user, projectId, dto, projectAuditRequestContext(request));
  }

  @Patch(':newsId')
  @ApiOperation({ summary: 'Editar una noticia asociada al proyecto' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('newsId') newsId: string,
    @Body() dto: UpdateProjectNewsDto,
    @Req() request: Request,
  ) {
    return this.news.updateForProject(user, projectId, newsId, dto, projectAuditRequestContext(request));
  }

  @Delete(':newsId')
  @ApiOperation({ summary: 'Archivar una noticia asociada al proyecto conservando auditoría' })
  archive(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('newsId') newsId: string,
    @Query() dto: ProjectNewsVersionDto,
    @Req() request: Request,
  ) {
    return this.news.archiveForProject(user, projectId, newsId, dto.expectedVersion, projectAuditRequestContext(request));
  }
}

@Module({
  providers: [NewsService],
  controllers: [NewsController, ProjectNewsController],
})
export class NewsModule {}
