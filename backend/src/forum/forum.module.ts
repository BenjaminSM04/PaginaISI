import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Prisma, VoteTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { CurrentUser, Public, Roles, AuthUser } from '../common/decorators';
import { clean, paginate } from '../common/utils';
import { StorageModule, StorageService } from '../storage/storage.module';
import { NotificationsService } from '../notifications/notifications.module';

export class CreateQuestionDto {
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(180) title: string;
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(10_000) body: string;
  @ApiPropertyOptional({ type: [String], maxItems: 5 }) @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(12) semester?: number;
  @ApiPropertyOptional({ type: [String], maxItems: 2, description: 'IDs devueltos por POST /media/upload' })
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsString({ each: true }) @MaxLength(40, { each: true }) imageIds?: string[];
}

export class CreateAnswerDto {
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(10_000) body: string;
  @ApiPropertyOptional({ type: [String], maxItems: 2, description: 'IDs devueltos por POST /media/upload' })
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsString({ each: true }) @MaxLength(40, { each: true }) imageIds?: string[];
}

export class VoteDto {
  @ApiProperty({ enum: [1, -1] }) @IsIn([1, -1]) value: 1 | -1;
}

const AUTHOR_SELECT = {
  select: { username: true, profile: { select: { fullName: true, avatarUrl: true, semester: true, totalPoints: true } } },
} as const;

const IMAGE_SELECT = {
  select: { id: true, url: true, mime: true, sizeBytes: true, width: true, height: true },
} as const;

export const MAX_FORUM_TAGS = 5;
export const MAX_FORUM_IMAGES = 2;

/** Convierte tags libres a una forma estable sin mantener duplicados. */
export function normalizeForumTags(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new BadRequestException('Los tags deben enviarse como una lista');
  if (input.length > MAX_FORUM_TAGS) throw new BadRequestException(`Se permiten hasta ${MAX_FORUM_TAGS} tags por pregunta`);

  const normalized: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') throw new BadRequestException('Cada tag debe ser texto');
    const tag = raw
      .normalize('NFKC')
      .trim()
      .replace(/^#+/, '')
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
    if (!tag || tag.length > 30 || !/^[\p{L}\p{N}.][\p{L}\p{N}+#.-]*$/u.test(tag)) {
      throw new BadRequestException(`Tag inválido: ${raw || '(vacío)'}`);
    }
    if (!normalized.includes(tag)) normalized.push(tag);
  }
  return normalized;
}

export function parseForumTagFilter(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  const entries = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => typeof entry === 'string' ? entry.split(',') : [entry]);
  return normalizeForumTags(entries);
}

@Injectable()
export class ForumService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  async list(q: any) {
    const { take, skip } = paginate(q.page, q.limit);
    const where: any = {};
    const selectedTags = parseForumTagFilter(q.tags ?? q.tag);
    if (selectedTags.length) where.tags = { hasEvery: selectedTags };
    if (q.subject) where.subject = { contains: q.subject, mode: 'insensitive' };
    if (q.semester) where.semester = Number(q.semester);
    if (q.search) where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { body: { contains: q.search, mode: 'insensitive' } },
    ];
    if (q.filter === 'unanswered') where.answersCount = 0;
    if (q.filter === 'solved') where.acceptedAnswerId = { not: null };

    const orderBy: any = q.sort === 'votes' ? { votesScore: 'desc' } : { createdAt: 'desc' };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.forumQuestion.count({ where }),
      this.prisma.forumQuestion.findMany({ where, orderBy, take, skip, include: { author: AUTHOR_SELECT, images: { ...IMAGE_SELECT, take: MAX_FORUM_IMAGES } } }),
    ]);
    return { total, items };
  }

  async detail(id: string, viewer?: AuthUser | null) {
    const question = await this.prisma.forumQuestion.findUnique({
      where: { id },
      include: {
        author: AUTHOR_SELECT,
        images: IMAGE_SELECT,
        answers: { orderBy: [{ isAccepted: 'desc' }, { votesScore: 'desc' }, { createdAt: 'asc' }], include: { author: AUTHOR_SELECT, images: IMAGE_SELECT } },
      },
    });
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    await this.prisma.forumQuestion.update({ where: { id }, data: { viewsCount: { increment: 1 } } });

    let myVotes: Record<string, number> = {};
    if (viewer) {
      const votes = await this.prisma.vote.findMany({
        where: { userId: viewer.id, OR: [{ targetType: 'QUESTION', targetId: id }, { targetType: 'ANSWER', targetId: { in: question.answers.map((a) => a.id) } }] },
      });
      for (const v of votes) myVotes[`${v.targetType}:${v.targetId}`] = v.value;
    }
    return { ...question, myVotes };
  }

  async createQuestion(user: AuthUser, dto: CreateQuestionDto) {
    const tags = normalizeForumTags(dto.tags);
    const imageIds = this.uniqueImageIds(dto.imageIds);
    const question = await this.prisma.$transaction(async (tx) => {
      await this.storage.assertOwnedUnlinkedImages(tx, user.id, imageIds);
      return tx.forumQuestion.create({
        data: {
          title: dto.title.trim(),
          body: clean(dto.body) ?? '',
          tags,
          subject: dto.subject?.trim() || null,
          semester: dto.semester,
          authorId: user.id,
          images: imageIds.length ? { connect: imageIds.map((id) => ({ id })) } : undefined,
        },
        include: { author: AUTHOR_SELECT, images: IMAGE_SELECT },
      });
    });
    await this.gamification.award(user.id, 'PREGUNTA_PUBLICADA', 'QUESTION', question.id);
    return question;
  }

  async createAnswer(user: AuthUser, questionId: string, dto: CreateAnswerDto) {
    const question = await this.prisma.forumQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    if (question.isClosed) throw new BadRequestException('La pregunta está cerrada');
    const imageIds = this.uniqueImageIds(dto.imageIds);
    const answer = await this.prisma.$transaction(async (tx) => {
      await this.storage.assertOwnedUnlinkedImages(tx, user.id, imageIds);
      const created = await tx.forumAnswer.create({
        data: {
          questionId,
          authorId: user.id,
          body: clean(dto.body) ?? '',
          images: imageIds.length ? { connect: imageIds.map((id) => ({ id })) } : undefined,
        },
        include: { author: AUTHOR_SELECT, images: IMAGE_SELECT },
      });
      await tx.forumQuestion.update({ where: { id: questionId }, data: { answersCount: { increment: 1 } } });
      return created;
    });
    await this.gamification.onAnswerCreated(user.id, answer.id);
    if (question.authorId !== user.id) {
      await this.notifications.send({
        userId: question.authorId,
        type: 'FORUM_ANSWER',
        title: 'Recibiste una nueva respuesta',
        body: `@${user.username} respondió “${question.title}”.`,
        href: `/foro/${questionId}`,
        dedupeKey: `forum-answer:${answer.id}`,
      });
    }
    return answer;
  }

  private uniqueImageIds(input?: string[]): string[] {
    const ids = [...new Set((input ?? []).map((id) => id.trim()).filter(Boolean))];
    if (ids.length > MAX_FORUM_IMAGES) {
      throw new BadRequestException(`Se permiten hasta ${MAX_FORUM_IMAGES} imágenes`);
    }
    return ids;
  }

  async vote(user: AuthUser, targetType: VoteTargetType, targetId: string, value: 1 | -1) {
    return this.prisma.$transaction(async (tx) => {
      const target = targetType === 'QUESTION'
        ? await tx.forumQuestion.findUnique({ where: { id: targetId } })
        : await tx.forumAnswer.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundException('Contenido no encontrado');
      if (target.authorId === user.id) throw new BadRequestException('No puedes votar tu propio contenido');

      const existing = await tx.vote.findUnique({
        where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
      });

      let delta = value as number;
      let myVote: number = value;
      if (existing) {
        if (existing.value === value) {
          await tx.vote.delete({ where: { id: existing.id } });
          delta = -value;
          myVote = 0;
        } else {
          await tx.vote.update({ where: { id: existing.id }, data: { value } });
          delta = value * 2;
        }
      } else {
        await tx.vote.create({ data: { userId: user.id, targetType, targetId, value } });
      }

      const updated = targetType === 'QUESTION'
        ? await tx.forumQuestion.update({ where: { id: targetId }, data: { votesScore: { increment: delta } } })
        : await tx.forumAnswer.update({ where: { id: targetId }, data: { votesScore: { increment: delta } } });
      return { votesScore: updated.votesScore, myVote };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async acceptAnswer(user: AuthUser, questionId: string, answerId: string) {
    const question = await this.prisma.forumQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    if (question.authorId !== user.id) throw new ForbiddenException('Solo quien preguntó puede aceptar una respuesta');
    const answer = await this.prisma.forumAnswer.findUnique({ where: { id: answerId } });
    if (!answer || answer.questionId !== questionId) throw new NotFoundException('Respuesta no encontrada');
    if (answer.authorId === user.id) throw new BadRequestException('No puedes aceptar tu propia respuesta');
    if (question.acceptedAnswerId === answerId) return { accepted: true, alreadyAccepted: true };
    if (question.acceptedAnswerId) {
      throw new BadRequestException('La pregunta ya tiene una respuesta aceptada');
    }

    await this.prisma.$transaction([
      this.prisma.forumAnswer.updateMany({ where: { questionId }, data: { isAccepted: false } }),
      this.prisma.forumAnswer.update({ where: { id: answerId }, data: { isAccepted: true } }),
      this.prisma.forumQuestion.update({ where: { id: questionId }, data: { acceptedAnswerId: answerId } }),
    ]);
    await this.gamification.onAnswerAccepted(answer.authorId, answerId);
    await this.notifications.send({
      userId: answer.authorId,
      type: 'FORUM_ACCEPTED',
      title: 'Tu respuesta fue aceptada',
      body: `Tu respuesta en “${question.title}” fue marcada como la solución.`,
      href: `/foro/${questionId}`,
      dedupeKey: `forum-accepted:${answerId}`,
    });
    return { accepted: true };
  }

  async removeQuestion(user: AuthUser, id: string) {
    const question = await this.prisma.forumQuestion.findUnique({ where: { id } });
    if (!question) throw new NotFoundException();
    if (question.authorId !== user.id && !user.roles.includes('ADMIN')) throw new ForbiddenException();
    await this.prisma.forumQuestion.delete({ where: { id } });
    return { ok: true };
  }

  async removeAnswer(user: AuthUser, id: string) {
    const answer = await this.prisma.forumAnswer.findUnique({ where: { id } });
    if (!answer) throw new NotFoundException();
    if (answer.authorId !== user.id && !user.roles.includes('ADMIN')) throw new ForbiddenException();
    if (answer.isAccepted) throw new BadRequestException('No se puede eliminar una respuesta aceptada');
    await this.prisma.$transaction([
      this.prisma.forumAnswer.delete({ where: { id } }),
      this.prisma.forumQuestion.update({ where: { id: answer.questionId }, data: { answersCount: { decrement: 1 } } }),
    ]);
    return { ok: true };
  }

  popularTags() {
    return this.prisma.forumQuestion.findMany({ select: { tags: true }, take: 200, orderBy: { createdAt: 'desc' } }).then((rows) => {
      const counts = new Map<string, number>();
      for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }));
    });
  }
}

@ApiTags('forum')
@Controller('forum')
export class ForumController {
  constructor(private forum: ForumService) {}

  @Public()
  @Get('questions')
  @ApiOperation({ summary: 'Preguntas: recientes, más votadas, sin responder o resueltas' })
  @ApiQuery({ name: 'sort', required: false, enum: ['recent', 'votes'] })
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'unanswered', 'solved'] })
  @ApiQuery({ name: 'tags', required: false, description: 'Hasta 5 tags separados por coma; deben coincidir todos' })
  list(@Query() query: any) {
    return this.forum.list(query);
  }

  @Public()
  @Get('tags')
  @ApiOperation({ summary: 'Tags populares del foro' })
  tags() {
    return this.forum.popularTags();
  }

  @Public()
  @Get('questions/:id')
  @ApiOperation({ summary: 'Detalle de pregunta con respuestas (suma vista)' })
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    return this.forum.detail(id, user);
  }

  @Post('questions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publicar pregunta (+5 pts)' })
  createQuestion(@CurrentUser() user: AuthUser, @Body() dto: CreateQuestionDto) {
    return this.forum.createQuestion(user, dto);
  }

  @Post('questions/:id/answers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Responder pregunta (+10 pts)' })
  createAnswer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateAnswerDto) {
    return this.forum.createAnswer(user, id, dto);
  }

  @Post('questions/:id/vote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Votar pregunta (+1/-1, toggle, sin self-vote)' })
  voteQuestion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoteDto) {
    return this.forum.vote(user, 'QUESTION', id, dto.value);
  }

  @Post('answers/:id/vote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Votar respuesta (+1/-1, toggle, sin self-vote)' })
  voteAnswer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoteDto) {
    return this.forum.vote(user, 'ANSWER', id, dto.value);
  }

  @Post('questions/:id/accept/:answerId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marcar respuesta correcta (+30 pts al autor de la respuesta)' })
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('answerId') answerId: string) {
    return this.forum.acceptAnswer(user, id, answerId);
  }

  @Delete('questions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar pregunta (autor o admin)' })
  removeQuestion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.forum.removeQuestion(user, id);
  }

  @Delete('answers/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar respuesta (autor o admin)' })
  removeAnswer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.forum.removeAnswer(user, id);
  }
}

@Module({
  imports: [StorageModule],
  providers: [ForumService],
  controllers: [ForumController],
})
export class ForumModule {}
