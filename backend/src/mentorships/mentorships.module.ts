import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';
import { Difficulty, MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Public, Roles, AuthUser } from '../common/decorators';
import { uniqueSlug } from '../common/utils';
import { NotificationsService } from '../notifications/notifications.module';

const WEB_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class UpsertMentorshipDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(140) title: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(10_000) description: string;
  @ApiProperty() @IsString() @MaxLength(80) area: string;
  @ApiPropertyOptional({ enum: Difficulty }) @IsOptional() @IsEnum(Difficulty) difficulty?: Difficulty;
  @ApiPropertyOptional({ type: [String], description: 'Temario' }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true }) syllabus?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) teamsUrl?: string;
  @ApiPropertyOptional({ description: 'Preparado para fase 2 (videos)' }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) youtubeUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) mentorUsername?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) mentorName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) communitySlug?: string;
}

export class UpdateMentorshipDto extends PartialType(UpsertMentorshipDto) {}

const MENTORSHIP_INCLUDE = {
  mentor: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
  community: { select: { slug: true, name: true, accentColor: true } },
  _count: { select: { enrollments: true } },
} as const;

@Injectable()
export class MentorshipsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async list(q: any, viewer?: AuthUser | null) {
    const where: any = { isActive: true };
    if (q.area) where.area = { contains: q.area, mode: 'insensitive' };
    if (q.difficulty) where.difficulty = q.difficulty;
    const items = await this.prisma.mentorship.findMany({ where, orderBy: { startsAt: 'asc' }, include: MENTORSHIP_INCLUDE });
    let myEnrollments: string[] = [];
    if (viewer) {
      const enr = await this.prisma.mentorshipEnrollment.findMany({ where: { userId: viewer.id }, select: { mentorshipId: true } });
      myEnrollments = enr.map((e) => e.mentorshipId);
    }
    const accessibleItems = await Promise.all(items.map(async (mentorship) => {
      const mayManageCommunities = !!viewer && viewer.roles.some((role) => ['ADMIN', 'COMMUNITY_LEADER', 'TEACHER'].includes(role));
      const canManage = !!viewer && (
        viewer.roles.includes('ADMIN')
        || mentorship.mentorId === viewer.id
        || (mayManageCommunities && await this.canManageCommunity(viewer, mentorship.communityId))
      );
      return {
        ...mentorship,
        teamsUrl: viewer && (myEnrollments.includes(mentorship.id) || canManage) ? mentorship.teamsUrl : null,
        canManage,
      };
    }));
    return {
      items: accessibleItems,
      myEnrollments,
    };
  }

  async detail(slug: string, viewer?: AuthUser | null) {
    const mentorship = await this.prisma.mentorship.findUnique({ where: { slug }, include: MENTORSHIP_INCLUDE });
    if (!mentorship || !mentorship.isActive) throw new NotFoundException('Mentoría no encontrada');
    const enrollment = viewer
      ? await this.prisma.mentorshipEnrollment.findUnique({
          where: { mentorshipId_userId: { mentorshipId: mentorship.id, userId: viewer.id } },
          select: { id: true },
        })
      : null;
    const canManage = !!viewer && (viewer.roles.includes('ADMIN') || mentorship.mentorId === viewer.id || await this.canManageCommunity(viewer, mentorship.communityId));
    return { ...mentorship, teamsUrl: enrollment || canManage ? mentorship.teamsUrl : null, enrolled: !!enrollment };
  }

  async enroll(user: AuthUser, slug: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const mentorship = await tx.mentorship.findUnique({ where: { slug }, include: { _count: { select: { enrollments: true } } } });
      if (!mentorship) throw new NotFoundException('Mentoría no encontrada');
      if (!mentorship.isActive) throw new BadRequestException('La mentoría no está disponible para inscripciones');
      const existing = await tx.mentorshipEnrollment.findUnique({
        where: { mentorshipId_userId: { mentorshipId: mentorship.id, userId: user.id } },
      });
      if (existing) return { enrolled: true, alreadyEnrolled: true };
      if (mentorship.capacity && mentorship._count.enrollments >= mentorship.capacity) {
        throw new ForbiddenException('La mentoría alcanzó su capacidad máxima');
      }
      await tx.mentorshipEnrollment.create({ data: { mentorshipId: mentorship.id, userId: user.id } });
      return { enrolled: true, mentorshipId: mentorship.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ('mentorshipId' in result) {
      const mentorship = await this.prisma.mentorship.findUnique({
        where: { id: result.mentorshipId },
        select: { id: true, slug: true, title: true, mentorId: true },
      });
      if (mentorship) {
        await this.notifications.send({
          userId: user.id,
          type: 'MENTORSHIP_ENROLLMENT',
          title: 'Inscripción a mentoría confirmada',
          body: `Ya formas parte de “${mentorship.title}”.`,
          href: `/mentorias/${mentorship.slug}`,
          dedupeKey: `mentorship-enrollment:${mentorship.id}:${user.id}`,
        });
        if (mentorship.mentorId && mentorship.mentorId !== user.id) {
          await this.notifications.send({
            userId: mentorship.mentorId,
            type: 'MENTORSHIP_ENROLLMENT',
            title: 'Nueva inscripción en tu mentoría',
            body: `@${user.username} se inscribió en “${mentorship.title}”.`,
            href: `/mentorias/${mentorship.slug}`,
            dedupeKey: `mentorship-mentor-enrollment:${mentorship.id}:${user.id}`,
          });
        }
      }
      const { mentorshipId, ...response } = result;
      return response;
    }
    return result;
  }

  private async resolveMentor(mentorUsername?: string) {
    if (!mentorUsername) return undefined;
    const mentor = await this.prisma.user.findUnique({ where: { username: mentorUsername } });
    if (!mentor) throw new BadRequestException('Mentor no encontrado');
    return mentor.id;
  }

  private async resolveCommunity(communitySlug?: string) {
    if (!communitySlug) return undefined;
    const community = await this.prisma.community.findUnique({ where: { slug: communitySlug } });
    if (!community) throw new BadRequestException('Comunidad no encontrada');
    return community.id;
  }

  private async canManageCommunity(user: AuthUser, communityId?: string | null) {
    if (user.roles.includes('ADMIN')) return true;
    if (!communityId) return false;
    const community = await this.prisma.community.findFirst({
      where: {
        id: communityId,
        OR: [
          { teacherLeadId: user.id },
          { studentLeadId: user.id },
          { members: { some: { userId: user.id, role: { in: [MembershipRole.STUDENT_LEAD, MembershipRole.TEACHER_LEAD] } } } },
        ],
      },
      select: { id: true },
    });
    return !!community;
  }

  private async assertCanManageCommunity(user: AuthUser, communityId?: string | null) {
    if (await this.canManageCommunity(user, communityId)) return;
    throw new ForbiddenException('Solo puedes gestionar mentorías de tu comunidad');
  }

  async create(user: AuthUser, dto: UpsertMentorshipDto) {
    let mentorId: string | undefined;
    mentorId = await this.resolveMentor(dto.mentorUsername);
    if (!mentorId && user.roles.includes('TEACHER')) mentorId = user.id;
    const communityId = await this.resolveCommunity(dto.communitySlug);
    if (user.roles.includes('COMMUNITY_LEADER') && !user.roles.includes('ADMIN') && !user.roles.includes('TEACHER')) {
      await this.assertCanManageCommunity(user, communityId);
    }
    const { mentorUsername, communitySlug, ...rest } = dto;
    return this.prisma.mentorship.create({
      data: {
        ...rest,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        syllabus: dto.syllabus ?? [],
        slug: uniqueSlug(dto.title),
        mentorId,
        communityId,
      },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateMentorshipDto) {
    const mentorship = await this.prisma.mentorship.findUnique({ where: { id } });
    if (!mentorship) throw new NotFoundException('Mentoría no encontrada');
    const { mentorUsername, communitySlug, ...rest } = dto;
    const communityId = dto.communitySlug ? await this.resolveCommunity(dto.communitySlug) : undefined;
    if (!user.roles.includes('ADMIN')) {
      const isAssignedMentor = user.roles.includes('TEACHER') && mentorship.mentorId === user.id;
      if (!isAssignedMentor) await this.assertCanManageCommunity(user, communityId ?? mentorship.communityId);
    }
    const data: any = { ...rest };
    if (dto.mentorUsername) data.mentorId = await this.resolveMentor(dto.mentorUsername);
    if (communityId) data.communityId = communityId;
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt);
    return this.prisma.mentorship.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.mentorship.update({ where: { id }, data: { isActive: false } });
  }
}

@ApiTags('mentorships')
@Controller('mentorships')
export class MentorshipsController {
  constructor(private mentorships: MentorshipsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Mentorías y cursos disponibles' })
  list(@Query() query: any, @CurrentUser() user: AuthUser | null) {
    return this.mentorships.list(query, user);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Detalle de mentoría con temario' })
  detail(@Param('slug') slug: string, @CurrentUser() user: AuthUser | null) {
    return this.mentorships.detail(slug, user);
  }

  @Post(':slug/enroll')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inscribirse a la mentoría' })
  enroll(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.mentorships.enroll(user, slug);
  }

  @Post()
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Líder/Docente] Crear mentoría' })
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertMentorshipDto) {
    return this.mentorships.create(user, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar mentoría' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMentorshipDto) {
    return this.mentorships.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Desactivar mentoría' })
  remove(@Param('id') id: string) {
    return this.mentorships.remove(id);
  }
}

@Module({
  providers: [MentorshipsService],
  controllers: [MentorshipsController],
})
export class MentorshipsModule {}
