import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { CurrentUser, Public, Roles, AuthUser } from '../common/decorators';
import { uniqueSlug } from '../common/utils';

const WEB_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class UpsertCommunityDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(80) name: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(300) description: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(5000) longDescription?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) logoUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) coverUrl?: string | null;
  @ApiPropertyOptional({ example: '#06B6D4', nullable: true }) @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) accentColor?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) whatsappUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) teamsUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) discordUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(40) teacherLeadId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(40) studentLeadId?: string | null;
}

export class UpdateCommunityDto extends PartialType(UpsertCommunityDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class CommunitiesService {
  constructor(private prisma: PrismaService, private gamification: GamificationService) {}

  list() {
    return this.prisma.community.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        teacherLead: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
        studentLead: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
        _count: { select: { members: true, projects: true, events: true } },
      },
    });
  }

  private managementInclude = {
    teacherLead: { select: { id: true, username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
    studentLead: { select: { id: true, username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
    _count: { select: { members: true, projects: true, events: true, news: true, mentorships: true } },
  } as const;

  async managementList(user: AuthUser) {
    const where = user.roles.includes('ADMIN')
      ? {}
      : {
          OR: [
            { teacherLeadId: user.id },
            { studentLeadId: user.id },
            { members: { some: { userId: user.id, role: { in: [MembershipRole.STUDENT_LEAD, MembershipRole.TEACHER_LEAD] } } } },
          ],
        };
    return this.prisma.community.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: this.managementInclude });
  }

  async managementDetail(user: AuthUser, id: string) {
    await this.assertCanManageCommunity(user, id);
    const community = await this.prisma.community.findUnique({ where: { id }, include: this.managementInclude });
    if (!community) throw new NotFoundException('Comunidad no encontrada');
    return community;
  }

  managementCandidates() {
    return this.prisma.user.findMany({
      where: { isActive: true, roles: { some: { role: { name: { in: ['TEACHER', 'COMMUNITY_LEADER'] } } } } },
      orderBy: { profile: { fullName: 'asc' } },
      select: {
        id: true,
        username: true,
        profile: { select: { fullName: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
    });
  }

  async detail(slug: string) {
    const community = await this.prisma.community.findUnique({
      where: { slug },
      include: {
        teacherLead: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
        studentLead: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true, semester: true } } } } },
        },
        projects: { where: { status: 'APPROVED' }, select: { id: true, slug: true, title: true, summary: true, coverUrl: true, stage: true, likesCount: true, tags: true } },
        events: { orderBy: { startsAt: 'desc' }, take: 6 },
        news: {
          where: { status: 'APPROVED' },
          orderBy: { publishedAt: 'desc' },
          take: 6,
          include: {
            author: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
            community: { select: { slug: true, name: true, accentColor: true } },
            event: { select: { slug: true, title: true, startsAt: true } },
          },
        },
        mentorships: { where: { isActive: true } },
        _count: { select: { members: true } },
      },
    });
    if (!community || !community.isActive) throw new NotFoundException('Comunidad no encontrada');
    return community;
  }

  async join(userId: string, slug: string) {
    const community = await this.prisma.community.findUnique({ where: { slug } });
    if (!community) throw new NotFoundException('Comunidad no encontrada');
    const existing = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId } },
    });
    if (existing) return { joined: true, alreadyMember: true };
    await this.prisma.communityMember.create({ data: { communityId: community.id, userId } });
    await this.gamification.onCommunityJoined(userId, community.id);
    return { joined: true, alreadyMember: false, pointsAwarded: 5 };
  }

  async leave(userId: string, slug: string) {
    const community = await this.prisma.community.findUnique({ where: { slug } });
    if (!community) throw new NotFoundException('Comunidad no encontrada');
    await this.prisma.communityMember.deleteMany({ where: { communityId: community.id, userId } });
    return { joined: false };
  }

  private async assertValidLeads(teacherLeadId?: string | null, studentLeadId?: string | null) {
    const ids = [...new Set([teacherLeadId, studentLeadId].filter((id): id is string => !!id))];
    if (!ids.length) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (users.length !== ids.length) throw new BadRequestException('Uno de los responsables no existe o está inactivo');
    const rolesById = new Map(users.map((candidate) => [candidate.id, candidate.roles.map((entry) => entry.role.name)]));
    if (teacherLeadId && !rolesById.get(teacherLeadId)?.includes('TEACHER')) {
      throw new BadRequestException('El docente asesor debe tener el rol Docente');
    }
    if (studentLeadId && !rolesById.get(studentLeadId)?.includes('COMMUNITY_LEADER')) {
      throw new BadRequestException('El líder estudiantil debe tener el rol Líder de comunidad');
    }
  }

  async create(dto: UpsertCommunityDto) {
    await this.assertValidLeads(dto.teacherLeadId, dto.studentLeadId);
    return this.prisma.community.create({ data: { ...dto, slug: uniqueSlug(dto.name) } });
  }

  private async assertCanManageCommunity(user: AuthUser, communityId: string) {
    if (user.roles.includes('ADMIN')) return;
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
    if (!community) throw new ForbiddenException('Solo puedes gestionar tu comunidad');
  }

  async update(user: AuthUser, id: string, dto: UpdateCommunityDto) {
    const community = await this.prisma.community.findUnique({ where: { id }, select: { id: true } });
    if (!community) throw new NotFoundException('Comunidad no encontrada');
    await this.assertCanManageCommunity(user, id);
    if (!user.roles.includes('ADMIN') && (dto.teacherLeadId !== undefined || dto.studentLeadId !== undefined || dto.isActive !== undefined)) {
      throw new ForbiddenException('Solo administración puede cambiar responsables o el estado de una comunidad');
    }
    if (user.roles.includes('ADMIN')) await this.assertValidLeads(dto.teacherLeadId, dto.studentLeadId);
    return this.prisma.community.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.community.update({ where: { id }, data: { isActive: false } });
  }
}

@ApiTags('communities')
@Controller('communities')
export class CommunitiesController {
  constructor(private communities: CommunitiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Listado de comunidades activas' })
  list() {
    return this.communities.list();
  }

  @Get('management/mine')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Líder] Comunidades que puedo gestionar' })
  managementList(@CurrentUser() user: AuthUser) {
    return this.communities.managementList(user);
  }

  @Get('management/candidates')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Docentes y líderes elegibles como responsables' })
  managementCandidates() {
    return this.communities.managementCandidates();
  }

  @Get('management/:id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Líder] Detalle editable de una comunidad' })
  managementDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.communities.managementDetail(user, id);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Detalle de comunidad con miembros, proyectos y eventos' })
  detail(@Param('slug') slug: string) {
    return this.communities.detail(slug);
  }

  @Post(':slug/join')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unirse a la comunidad (+5 pts la primera vez)' })
  join(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.communities.join(user.id, slug);
  }

  @Post(':slug/leave')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Salir de la comunidad' })
  leave(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.communities.leave(user.id, slug);
  }

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear comunidad' })
  create(@Body() dto: UpsertCommunityDto) {
    return this.communities.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Líder] Actualizar comunidad' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCommunityDto) {
    return this.communities.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Desactivar comunidad' })
  remove(@Param('id') id: string) {
    return this.communities.remove(id);
  }
}

@Module({
  providers: [CommunitiesService],
  controllers: [CommunitiesController],
})
export class CommunitiesModule {}
