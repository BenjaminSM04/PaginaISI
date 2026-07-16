import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { ApprovalDecision } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { CurrentUser, Public, Roles, AuthUser } from '../common/decorators';
import { clean, paginate, uniqueSlug } from '../common/utils';
import { CommentDto } from '../projects/projects.module';
import { NotificationsService } from '../notifications/notifications.module';

const WEB_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class CreateArticleDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MinLength(50) @MaxLength(2000) abstract: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50_000) content?: string;
  @ApiProperty() @IsString() @MaxLength(80) area: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(300) impact?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) pdfUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) externalUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(80) doi?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) coverUrl?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Usernames de coautores registrados' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) authorUsernames?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Coautores externos (nombre libre)' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(100, { each: true }) externalAuthors?: string[];
  @ApiPropertyOptional({ description: 'Username del docente revisor' }) @IsOptional() @IsString() @MaxLength(30) reviewerUsername?: string;
}

export class UpdateArticleDto extends PartialType(CreateArticleDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() resubmit?: boolean;
}

export class ArticleReviewDto {
  @ApiProperty({ enum: ApprovalDecision }) @IsEnum(ApprovalDecision) decision: ApprovalDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) comment?: string;
}

const ARTICLE_INCLUDE = {
  owner: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
  reviewer: { select: { username: true, profile: { select: { fullName: true } } } },
  authors: { include: { user: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } } } },
} as const;

@Injectable()
export class ArticlesService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
    private notifications: NotificationsService,
  ) {}

  async list(q: any) {
    const { take, skip } = paginate(q.page, q.limit);
    const where: any = { status: 'APPROVED' };
    if (q.search) where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { abstract: { contains: q.search, mode: 'insensitive' } },
    ];
    if (q.area) where.area = { contains: q.area, mode: 'insensitive' };
    if (q.tag) where.tags = { has: q.tag };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({ where, orderBy: { publishedAt: 'desc' }, take, skip, include: ARTICLE_INCLUDE }),
    ]);
    return { total, items };
  }

  async detail(slug: string, viewer?: AuthUser | null) {
    const article = await this.prisma.article.findUnique({ where: { slug }, include: ARTICLE_INCLUDE });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    const reviewerCanView = !!viewer?.roles?.includes('TEACHER')
      && (!article.reviewerId || article.reviewerId === viewer.id);
    const privileged = viewer && (viewer.id === article.ownerId || viewer.roles.includes('ADMIN') || reviewerCanView);
    if (article.status !== 'APPROVED' && !privileged) throw new NotFoundException('Artículo no encontrado');
    const approvals = privileged
      ? await this.prisma.approvalRequest.findMany({
          where: { targetType: 'ARTICLE', targetId: article.id },
          orderBy: { createdAt: 'desc' },
          include: { reviewer: { select: { username: true, profile: { select: { fullName: true } } } } },
        })
      : [];
    const comments = await this.prisma.comment.findMany({
      where: { targetType: 'ARTICLE', targetId: article.id },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } } },
    });
    let likedByMe = false;
    if (viewer) {
      likedByMe = !!(await this.prisma.like.findUnique({
        where: { userId_targetType_targetId: { userId: viewer.id, targetType: 'ARTICLE', targetId: article.id } },
      }));
    }
    return { ...article, comments, approvals, likedByMe };
  }

  private async resolveReviewer(username?: string) {
    if (!username) return undefined;
    const reviewer = await this.prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
      include: { roles: { include: { role: true } } },
    });
    if (!reviewer || !reviewer.isActive || !reviewer.roles.some((role) => ['TEACHER', 'ADMIN'].includes(role.role.name))) {
      throw new BadRequestException('El revisor debe ser un docente registrado');
    }
    return reviewer.id;
  }

  private async resolveAuthors(ownerId: string, authorUsernames: string[] = [], externalAuthors: string[] = []) {
    const usernames = [...new Set(authorUsernames.map((value) => value.trim().toLowerCase()).filter(Boolean))];
    const users = usernames.length
      ? await this.prisma.user.findMany({ where: { username: { in: usernames }, isActive: true }, select: { id: true, username: true } })
      : [];
    const found = new Set(users.map((author) => author.username));
    const missing = usernames.filter((username) => !found.has(username));
    if (missing.length) throw new BadRequestException(`Coautores no encontrados: ${missing.join(', ')}`);
    const external = [...new Set(externalAuthors.map((value) => value.trim()).filter(Boolean))];
    return [
      { userId: ownerId },
      ...users.filter((author) => author.id !== ownerId).map((author) => ({ userId: author.id })),
      ...external.map((externalName) => ({ externalName })),
    ];
  }

  async create(user: AuthUser, dto: CreateArticleDto) {
    const reviewerId = await this.resolveReviewer(dto.reviewerUsername);
    const authorCreates = await this.resolveAuthors(user.id, dto.authorUsernames, dto.externalAuthors);

    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.create({ data: {
        title: dto.title,
        abstract: dto.abstract,
        content: clean(dto.content),
        slug: uniqueSlug(dto.title),
        area: dto.area, impact: dto.impact,
        pdfUrl: dto.pdfUrl, externalUrl: dto.externalUrl, doi: dto.doi, coverUrl: dto.coverUrl,
        tags: (dto.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
        status: 'PENDING',
        ownerId: user.id,
        reviewerId,
        authors: { create: authorCreates },
      } });
      await tx.approvalRequest.create({
        data: { targetType: 'ARTICLE', targetId: article.id, requesterId: user.id, reviewerId },
      });
      return article;
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateArticleDto) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: { authors: { include: { user: { select: { username: true } } } } },
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    if (article.ownerId !== user.id && !user.roles.includes('ADMIN')) throw new ForbiddenException('Solo el autor puede editar');
    const data: any = {
      title: dto.title, abstract: dto.abstract, area: dto.area, impact: dto.impact,
      pdfUrl: dto.pdfUrl, externalUrl: dto.externalUrl, doi: dto.doi, coverUrl: dto.coverUrl,
    };
    if (dto.content !== undefined) data.content = clean(dto.content);
    if (dto.tags !== undefined) data.tags = dto.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
    const reviewerId = await this.resolveReviewer(dto.reviewerUsername);
    if (reviewerId) data.reviewerId = reviewerId;

    let authorCreates: Awaited<ReturnType<ArticlesService['resolveAuthors']>> | undefined;
    if (dto.authorUsernames !== undefined || dto.externalAuthors !== undefined) {
      const currentUsernames = article.authors.flatMap((author) => author.user?.username ? [author.user.username] : []);
      const currentExternal = article.authors.flatMap((author) => author.externalName ? [author.externalName] : []);
      authorCreates = await this.resolveAuthors(
        article.ownerId,
        dto.authorUsernames ?? currentUsernames,
        dto.externalAuthors ?? currentExternal,
      );
    }

    const contentChanged = Object.entries(dto).some(([key, value]) => key !== 'resubmit' && value !== undefined);
    const approvedEditRequiresReview = article.status === 'APPROVED' && contentChanged && !user.roles.includes('ADMIN');
    const requestedResubmit = !!dto.resubmit && ['OBSERVED', 'REJECTED', 'DRAFT'].includes(article.status);
    if (approvedEditRequiresReview || requestedResubmit) {
      data.status = 'PENDING';
    }
    return this.prisma.$transaction(async (tx) => {
      if (authorCreates) {
        await tx.articleAuthor.deleteMany({ where: { articleId: id } });
        data.authors = { create: authorCreates };
      }
      if (approvedEditRequiresReview || requestedResubmit) {
        await tx.approvalRequest.create({
          data: { targetType: 'ARTICLE', targetId: id, requesterId: user.id, reviewerId: reviewerId ?? article.reviewerId },
        });
      }
      return tx.article.update({ where: { id }, data, include: ARTICLE_INCLUDE });
    });
  }

  async review(reviewer: AuthUser, id: string, dto: ArticleReviewDto) {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    if (article.status !== 'PENDING') throw new BadRequestException('El artículo no está pendiente de revisión');
    if (!reviewer.roles.includes('ADMIN') && article.reviewerId && article.reviewerId !== reviewer.id) {
      throw new ForbiddenException('Este artículo está asignado a otro docente revisor');
    }
    if (dto.decision !== 'APPROVED' && !dto.comment?.trim()) {
      throw new BadRequestException('Debes explicar por qué observas o rechazas el artículo');
    }
    const statusMap: Record<ApprovalDecision, 'APPROVED' | 'OBSERVED' | 'REJECTED'> = {
      APPROVED: 'APPROVED', OBSERVED: 'OBSERVED', REJECTED: 'REJECTED',
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const open = await tx.approvalRequest.findFirst({
        where: { targetType: 'ARTICLE', targetId: id, decision: null },
        orderBy: { createdAt: 'desc' },
      });
      if (open) {
        await tx.approvalRequest.update({
          where: { id: open.id },
          data: { decision: dto.decision, comment: dto.comment?.trim(), reviewerId: reviewer.id, decidedAt: new Date() },
        });
      } else {
        await tx.approvalRequest.create({
          data: { targetType: 'ARTICLE', targetId: id, requesterId: article.ownerId, reviewerId: reviewer.id, decision: dto.decision, comment: dto.comment?.trim(), decidedAt: new Date() },
        });
      }
      return tx.article.update({
        where: { id },
        data: { status: statusMap[dto.decision], publishedAt: dto.decision === 'APPROVED' ? new Date() : article.publishedAt },
      });
    });
    if (dto.decision === 'APPROVED') await this.gamification.onArticleApproved(article.ownerId, id);
    const decisionLabel = dto.decision === 'APPROVED' ? 'aprobado' : dto.decision === 'OBSERVED' ? 'observado' : 'rechazado';
    await this.notifications.send({
      userId: article.ownerId,
      type: 'CONTENT_REVIEW',
      title: `Tu artículo fue ${decisionLabel}`,
      body: dto.comment?.trim() || `La revisión de “${article.title}” ya está disponible.`,
      href: '/cuenta?tab=articulos',
      dedupeKey: `article-review:${id}:${updated.updatedAt.toISOString()}`,
    });
    return updated;
  }

  pendingForReviewer(user: AuthUser) {
    const where: any = { status: 'PENDING' };
    if (!user.roles.includes('ADMIN')) where.OR = [{ reviewerId: user.id }, { reviewerId: null }];
    return this.prisma.article.findMany({ where, orderBy: { createdAt: 'asc' }, include: ARTICLE_INCLUDE });
  }

  async mine(userId: string) {
    const items = await this.prisma.article.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: ARTICLE_INCLUDE,
    });
    if (!items.length) return [];
    const approvals = await this.prisma.approvalRequest.findMany({
      where: { targetType: 'ARTICLE', targetId: { in: items.map((item) => item.id) } },
      orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { username: true, profile: { select: { fullName: true } } } } },
    });
    const byTarget = new Map<string, typeof approvals>();
    for (const approval of approvals) {
      const history = byTarget.get(approval.targetId) ?? [];
      history.push(approval);
      byTarget.set(approval.targetId, history);
    }
    return items.map((item) => ({ ...item, approvals: byTarget.get(item.id) ?? [] }));
  }

  async mineDetail(user: AuthUser, id: string) {
    const article = await this.prisma.article.findUnique({ where: { id }, include: ARTICLE_INCLUDE });
    if (!article || (article.ownerId !== user.id && !user.roles.includes('ADMIN'))) {
      throw new NotFoundException('Artículo no encontrado');
    }
    const approvals = await this.prisma.approvalRequest.findMany({
      where: { targetType: 'ARTICLE', targetId: id },
      orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { username: true, profile: { select: { fullName: true } } } } },
    });
    return { ...article, approvals };
  }

  async likeStatus(userId: string, id: string) {
    const article = await this.prisma.article.findUnique({ where: { id }, select: { status: true, likesCount: true } });
    if (!article || article.status !== 'APPROVED') throw new NotFoundException('Artículo no encontrado');
    const like = await this.prisma.like.findUnique({
      where: { userId_targetType_targetId: { userId, targetType: 'ARTICLE', targetId: id } },
      select: { id: true },
    });
    return { liked: !!like, likesCount: article.likesCount };
  }

  async toggleLike(user: AuthUser, id: string) {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article || article.status !== 'APPROVED') throw new NotFoundException('Artículo no encontrado');
    if (article.ownerId === user.id) throw new BadRequestException('No puedes dar like a tu propio artículo');
    const existing = await this.prisma.like.findUnique({
      where: { userId_targetType_targetId: { userId: user.id, targetType: 'ARTICLE', targetId: id } },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.like.delete({ where: { id: existing.id } }),
        this.prisma.article.update({ where: { id }, data: { likesCount: { decrement: 1 } } }),
      ]);
      return { liked: false, likesCount: article.likesCount - 1 };
    }
    await this.prisma.$transaction([
      this.prisma.like.create({ data: { userId: user.id, targetType: 'ARTICLE', targetId: id } }),
      this.prisma.article.update({ where: { id }, data: { likesCount: { increment: 1 } } }),
    ]);
    await this.gamification.award(article.ownerId, 'LIKE_RECIBIDO', 'ARTICLE', `${id}:by:${user.id}`);
    return { liked: true, likesCount: article.likesCount + 1 };
  }

  async addComment(user: AuthUser, id: string, dto: CommentDto) {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article || article.status !== 'APPROVED') throw new NotFoundException('Artículo no encontrado');
    return this.prisma.comment.create({
      data: { targetType: 'ARTICLE', targetId: id, authorId: user.id, body: clean(dto.body) ?? '' },
      include: { author: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } } },
    });
  }
}

@ApiTags('articles')
@Controller('articles')
export class ArticlesController {
  constructor(private articles: ArticlesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Artículos científicos aprobados con filtros' })
  list(@Query() query: any) {
    return this.articles.list(query);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mis artículos en todos los estados' })
  mine(@CurrentUser() user: AuthUser) {
    return this.articles.mine(user.id);
  }

  @Get('mine/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle editable de uno de mis artículos' })
  mineDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.articles.mineDetail(user, id);
  }

  @Get('review/pending')
  @Roles('TEACHER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Docente/Admin] Artículos pendientes de revisión' })
  pending(@CurrentUser() user: AuthUser) {
    return this.articles.pendingForReviewer(user);
  }

  @Get(':id/like-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado de mi like para sincronizar la interfaz autenticada' })
  likeStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.articles.likeStatus(user.id, id);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Detalle de artículo por slug' })
  detail(@Param('slug') slug: string, @CurrentUser() user: AuthUser | null) {
    return this.articles.detail(slug, user);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar artículo → queda PENDIENTE hasta aprobación (+35 pts al aprobarse)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateArticleDto) {
    return this.articles.create(user, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar mi artículo; resubmit=true reenvía a revisión' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articles.update(user, id, dto);
  }

  @Post(':id/review')
  @Roles('TEACHER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Docente/Admin] Aprobar, observar o rechazar artículo' })
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ArticleReviewDto) {
    return this.articles.review(user, id, dto);
  }

  @Post(':id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dar/quitar like a un artículo' })
  like(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.articles.toggleLike(user, id);
  }

  @Post(':id/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comentar un artículo' })
  comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.articles.addComment(user, id, dto);
  }
}

@Module({
  providers: [ArticlesService],
  controllers: [ArticlesController],
})
export class ArticlesModule {}
