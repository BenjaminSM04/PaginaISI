import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
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
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Public, Roles, AuthUser } from '../common/decorators';
import { paginate, uniqueSlug } from '../common/utils';

const WEB_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };
const RESPONSIBLE_ROLES: MembershipRole[] = [MembershipRole.STUDENT_LEAD, MembershipRole.TEACHER_LEAD];
const MAX_COMMUNITY_LINKS = 30;

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  profile: { select: { fullName: true, avatarUrl: true, semester: true } },
  roles: { select: { role: { select: { name: true } } } },
} as const;

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  profile: { select: { fullName: true, avatarUrl: true, semester: true } },
} as const;

export class CommunityLinkDto {
  @ApiProperty({ example: 'WhatsApp' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[^<>\u0000-\u001f\u007f]+$/)
  platform: string;

  @ApiProperty({ example: 'https://chat.whatsapp.com/example' })
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  url: string;

  @ApiPropertyOptional({ nullable: true, example: 'Grupo principal' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string | null;

  @ApiProperty({ minimum: 0, maximum: 1000, example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  order: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertCommunityDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(80) name: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(300) description: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(5000) longDescription?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) logoUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) coverUrl?: string | null;
  @ApiPropertyOptional({ example: '#06B6D4', nullable: true }) @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) accentColor?: string | null;

  @ApiPropertyOptional({ type: [CommunityLinkDto], maxItems: MAX_COMMUNITY_LINKS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COMMUNITY_LINKS)
  @ValidateNested({ each: true })
  @Type(() => CommunityLinkDto)
  links?: CommunityLinkDto[];

  // Campos conservados mientras los clientes antiguos migran al arreglo `links`.
  @ApiPropertyOptional({ nullable: true, deprecated: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) whatsappUrl?: string | null;
  @ApiPropertyOptional({ nullable: true, deprecated: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) teamsUrl?: string | null;
  @ApiPropertyOptional({ nullable: true, deprecated: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) discordUrl?: string | null;

  @ApiPropertyOptional({
    type: [String],
    minItems: 1,
    description: 'Docentes responsables. Para clientes nuevos es obligatorio enviar al menos uno.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes asignar al menos un docente responsable' })
  @ArrayMaxSize(20)
  @ArrayUnique({ message: 'No puedes asignar el mismo docente más de una vez' })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  teacherIds?: string[];

  @ApiPropertyOptional({
    nullable: true,
    deprecated: true,
    description: 'Compatibilidad: se interpreta como el primer elemento de teacherIds.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  teacherLeadId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  studentLeadId?: string | null;
}

export class UpdateCommunityDto extends PartialType(UpsertCommunityDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CommunityMembersQueryDto {
  @ApiPropertyOptional({ maximum: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ enum: MembershipRole })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;
}

export class CommunityCandidatesQueryDto extends CommunityMembersQueryDto {}

export class AddCommunityMemberDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  userId: string;

  @ApiPropertyOptional({ enum: MembershipRole, default: MembershipRole.MEMBER })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;
}

export class UpdateCommunityMemberDto {
  @ApiProperty({ enum: MembershipRole })
  @IsEnum(MembershipRole)
  role: MembershipRole;
}

interface NormalizedCommunityLink {
  platform: string;
  url: string;
  label: string | null;
  order: number;
  isActive: boolean;
}

interface LegacyCommunityLinks {
  whatsappUrl?: string | null;
  teamsUrl?: string | null;
  discordUrl?: string | null;
}

function trimNullable(value?: string | null) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function platformKey(platform: string) {
  return platform.trim().toLocaleLowerCase('es').replace(/[\s_-]+/g, '');
}

function legacyLinkKind(platform: string): keyof LegacyCommunityLinks | null {
  const key = platformKey(platform);
  if (key === 'whatsapp') return 'whatsappUrl';
  if (key === 'teams' || key === 'microsoftteams') return 'teamsUrl';
  if (key === 'discord') return 'discordUrl';
  return null;
}

function assertSafeExternalUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Uno de los enlaces de la comunidad no contiene una URL válida');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new BadRequestException('Los enlaces solo admiten HTTP/HTTPS y no pueden incluir credenciales');
  }
  return parsed.toString();
}

export function normalizeCommunityLinks(links: CommunityLinkDto[]): NormalizedCommunityLink[] {
  if (!Array.isArray(links) || links.length > MAX_COMMUNITY_LINKS) {
    throw new BadRequestException(`Una comunidad admite hasta ${MAX_COMMUNITY_LINKS} enlaces`);
  }
  const seenUrls = new Set<string>();
  return links.map((link, index) => {
    const platform = link?.platform?.trim();
    if (!platform || platform.length < 2 || platform.length > 50 || /[<>\u0000-\u001f\u007f]/.test(platform)) {
      throw new BadRequestException(`La plataforma del enlace ${index + 1} no es válida`);
    }
    if (!Number.isInteger(link.order) || link.order < 0 || link.order > 1000) {
      throw new BadRequestException(`El orden del enlace ${index + 1} no es válido`);
    }
    const url = assertSafeExternalUrl(link.url?.trim());
    const duplicateKey = url.toLocaleLowerCase('en');
    if (seenUrls.has(duplicateKey)) throw new BadRequestException('No se puede repetir el mismo enlace');
    seenUrls.add(duplicateKey);
    const label = trimNullable(link.label);
    if (label && label.length > 80) throw new BadRequestException(`La etiqueta del enlace ${index + 1} es demasiado larga`);
    return { platform, url, label: label ?? null, order: link.order, isActive: link.isActive ?? true };
  });
}

export function resolveCommunityTeacherIds(
  teacherIds: string[] | undefined,
  teacherLeadId: string | null | undefined,
  fallback: string[] = [],
) {
  const raw = teacherIds !== undefined
    ? teacherIds
    : teacherLeadId !== undefined
      ? (teacherLeadId ? [teacherLeadId] : [])
      : fallback;
  const normalized = raw.map((id) => id?.trim()).filter((id): id is string => !!id);
  if (!normalized.length) {
    throw new BadRequestException('Debes asignar al menos un docente responsable');
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new BadRequestException('No puedes asignar el mismo docente más de una vez');
  }
  return normalized;
}

export function assertCommunityRoleRemovalAllowed(
  currentRole: MembershipRole,
  nextRole: MembershipRole | null,
  teacherCount: number,
  responsibleCount: number,
) {
  if (currentRole === MembershipRole.TEACHER_LEAD && nextRole !== MembershipRole.TEACHER_LEAD && teacherCount <= 1) {
    throw new BadRequestException('No puedes quitar al único docente responsable de la comunidad');
  }
  if (
    RESPONSIBLE_ROLES.includes(currentRole)
    && (!nextRole || !RESPONSIBLE_ROLES.includes(nextRole))
    && responsibleCount <= 1
  ) {
    throw new BadRequestException('No puedes quitar al último responsable de la comunidad');
  }
}

function legacyLinksFromColumns(legacy: LegacyCommunityLinks): NormalizedCommunityLink[] {
  return [
    legacy.whatsappUrl ? { platform: 'WhatsApp', label: 'WhatsApp', url: legacy.whatsappUrl, order: 0, isActive: true } : null,
    legacy.teamsUrl ? { platform: 'Microsoft Teams', label: 'Teams', url: legacy.teamsUrl, order: 1, isActive: true } : null,
    legacy.discordUrl ? { platform: 'Discord', label: 'Discord', url: legacy.discordUrl, order: 2, isActive: true } : null,
  ].filter((link): link is NormalizedCommunityLink => !!link);
}

function legacyColumnsFromLinks(links: NormalizedCommunityLink[]): Required<LegacyCommunityLinks> {
  const result: Required<LegacyCommunityLinks> = { whatsappUrl: null, teamsUrl: null, discordUrl: null };
  for (const link of [...links].sort((a, b) => a.order - b.order)) {
    if (!link.isActive) continue;
    const kind = legacyLinkKind(link.platform);
    if (kind && !result[kind]) result[kind] = link.url;
  }
  return result;
}

function mergeLegacyLinkUpdates(
  current: NormalizedCommunityLink[],
  legacy: LegacyCommunityLinks,
): NormalizedCommunityLink[] {
  let next = [...current];
  const configurations: Array<{
    key: keyof LegacyCommunityLinks;
    platform: string;
    label: string;
  }> = [
    { key: 'whatsappUrl', platform: 'WhatsApp', label: 'WhatsApp' },
    { key: 'teamsUrl', platform: 'Microsoft Teams', label: 'Teams' },
    { key: 'discordUrl', platform: 'Discord', label: 'Discord' },
  ];
  for (const configuration of configurations) {
    if (legacy[configuration.key] === undefined) continue;
    const oldIndex = next.findIndex((link) => legacyLinkKind(link.platform) === configuration.key);
    const oldOrder = oldIndex >= 0 ? next[oldIndex].order : next.reduce((max, link) => Math.max(max, link.order), -1) + 1;
    next = next.filter((link) => legacyLinkKind(link.platform) !== configuration.key);
    const url = trimNullable(legacy[configuration.key]);
    if (url) {
      next.push({
        platform: configuration.platform,
        label: configuration.label,
        url,
        order: oldOrder,
        isActive: true,
      });
    }
  }
  return normalizeCommunityLinks(next);
}

function toNormalizedStoredLinks(links: any[] = []): NormalizedCommunityLink[] {
  return links.map((link) => ({
    platform: link.platform,
    label: link.label ?? null,
    url: link.url,
    order: link.sortOrder,
    isActive: link.isActive,
  }));
}

function presentLinks(community: any, publicOnly = false) {
  const stored = toNormalizedStoredLinks(community.links ?? []);
  const presentKinds = new Set(stored.map((link) => legacyLinkKind(link.platform)).filter(Boolean));
  const legacy = legacyLinksFromColumns(community).filter((link) => !presentKinds.has(legacyLinkKind(link.platform)));
  return [...stored, ...legacy]
    .filter((link) => !publicOnly || link.isActive)
    .sort((a, b) => a.order - b.order || a.platform.localeCompare(b.platform))
    .map((link) => ({ ...link, sortOrder: link.order }));
}

function presentCommunity(community: any, publicOnly = false) {
  if (!community) return community;
  const teacherIds = Array.isArray(community.members)
    ? community.members.filter((member: any) => member.role === MembershipRole.TEACHER_LEAD).map((member: any) => member.userId)
    : community.teacherLeadId
      ? [community.teacherLeadId]
      : [];
  return { ...community, links: presentLinks(community, publicOnly), teacherIds };
}

@Injectable()
export class CommunitiesService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
    private audit: AuditService,
  ) {}

  private managementInclude = {
    teacherLead: { select: PUBLIC_USER_SELECT },
    studentLead: { select: PUBLIC_USER_SELECT },
    links: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    members: {
      where: { role: { in: RESPONSIBLE_ROLES } },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true, role: true },
    },
    _count: { select: { members: true, projects: true, events: true, news: true, mentorships: true } },
  } satisfies Prisma.CommunityInclude;

  async list() {
    const communities = await this.prisma.community.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        teacherLead: { select: PUBLIC_USER_SELECT },
        studentLead: { select: PUBLIC_USER_SELECT },
        links: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        members: {
          where: { role: MembershipRole.TEACHER_LEAD },
          select: { userId: true, role: true },
        },
        _count: { select: { members: true, projects: true, events: true } },
      },
    });
    return communities.map((community) => presentCommunity(community, true));
  }

  async managementList(user: AuthUser) {
    const where = user.roles.includes('ADMIN')
      ? {}
      : {
          OR: [
            { teacherLeadId: user.id },
            { studentLeadId: user.id },
            { members: { some: { userId: user.id, role: { in: RESPONSIBLE_ROLES } } } },
          ],
        };
    const communities = await this.prisma.community.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: this.managementInclude,
    });
    return communities.map((community) => presentCommunity(community));
  }

  async managementDetail(user: AuthUser, id: string) {
    await this.assertCanManageCommunity(user, id);
    const community = await this.prisma.community.findUnique({ where: { id }, include: this.managementInclude });
    if (!community) throw new NotFoundException('Comunidad no encontrada');
    return presentCommunity(community);
  }

  async managementCandidates(query: CommunityCandidatesQueryDto) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const search = query.search?.trim().slice(0, 100);
    const where: Prisma.UserWhereInput = {
      isActive: true,
      roles: { some: { role: { name: { in: ['TEACHER', 'COMMUNITY_LEADER'] } } } },
    };
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { profile: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (query.role === MembershipRole.TEACHER_LEAD) {
      where.roles = { some: { role: { name: 'TEACHER' } } };
    } else if (query.role === MembershipRole.STUDENT_LEAD) {
      where.roles = { some: { role: { name: 'COMMUNITY_LEADER' } } };
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ profile: { fullName: 'asc' } }, { username: 'asc' }],
        take,
        skip,
        select: SAFE_USER_SELECT,
      }),
    ]);
    return { items, total, page, limit: take, pages: Math.ceil(total / take) };
  }

  async detail(slug: string) {
    const community = await this.prisma.community.findUnique({
      where: { slug },
      include: {
        teacherLead: { select: PUBLIC_USER_SELECT },
        studentLead: { select: PUBLIC_USER_SELECT },
        links: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        members: {
          orderBy: { joinedAt: 'asc' },
          take: 50,
          select: {
            id: true,
            userId: true,
            role: true,
            joinedAt: true,
            user: { select: PUBLIC_USER_SELECT },
          },
        },
        projects: {
          where: { status: 'APPROVED' },
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            coverUrl: true,
            stage: true,
            likesCount: true,
            tags: true,
          },
        },
        events: { orderBy: { startsAt: 'desc' }, take: 6 },
        news: {
          where: { status: 'APPROVED' },
          orderBy: { publishedAt: 'desc' },
          take: 6,
          include: {
            author: { select: PUBLIC_USER_SELECT },
            community: { select: { slug: true, name: true, accentColor: true } },
            event: { select: { slug: true, title: true, startsAt: true } },
          },
        },
        mentorships: { where: { isActive: true } },
        _count: { select: { members: true } },
      },
    });
    if (!community || !community.isActive) throw new NotFoundException('Comunidad no encontrada');
    return presentCommunity(community, true);
  }

  async join(user: AuthUser, slug: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const located = await tx.community.findUnique({ where: { slug }, select: { id: true } });
      if (!located) throw new NotFoundException('Comunidad no encontrada');
      await this.lockCommunity(tx, located.id);
      const [community, activeUser] = await Promise.all([
        tx.community.findFirst({
          where: { id: located.id, isActive: true },
          select: { id: true, slug: true, name: true },
        }),
        tx.user.findFirst({ where: { id: user.id, isActive: true }, select: { id: true } }),
      ]);
      if (!community) throw new NotFoundException('Comunidad no encontrada');
      if (!activeUser) throw new ForbiddenException('Tu cuenta no está activa');
      const existing = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId: community.id, userId: user.id } },
      });
      if (existing) return { community, created: false };
      const member = await tx.communityMember.create({
        data: { communityId: community.id, userId: user.id },
      });
      await this.audit.record(tx, {
        actor: user,
        action: 'COMMUNITY_JOINED',
        entityType: 'COMMUNITY_MEMBER',
        entityId: member.id,
        after: { communityId: community.id, userId: user.id, role: member.role },
      });
      return { community, created: true };
    });
    if (!result.created) return { joined: true, alreadyMember: true };
    const reward = await this.gamification.onCommunityJoined(user.id, result.community.id);
    return { joined: true, alreadyMember: false, pointsAwarded: reward?.points ?? 0 };
  }

  async leave(user: AuthUser, slug: string) {
    return this.prisma.$transaction(async (tx) => {
      const community = await tx.community.findUnique({
        where: { slug },
        select: { id: true, teacherLeadId: true, studentLeadId: true },
      });
      if (!community) throw new NotFoundException('Comunidad no encontrada');
      await this.lockCommunity(tx, community.id);
      const membership = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId: community.id, userId: user.id } },
      });
      if (!membership) return { joined: false, alreadyLeft: true };
      if (
        RESPONSIBLE_ROLES.includes(membership.role)
        || community.teacherLeadId === user.id
        || community.studentLeadId === user.id
      ) {
        throw new BadRequestException('Un responsable no puede salir por sí mismo; primero debe reasignar su rol');
      }
      await tx.communityMember.delete({ where: { id: membership.id } });
      await this.audit.record(tx, {
        actor: user,
        action: 'COMMUNITY_LEFT',
        entityType: 'COMMUNITY_MEMBER',
        entityId: membership.id,
        before: { communityId: community.id, userId: user.id, role: membership.role },
      });
      return { joined: false, alreadyLeft: false };
    });
  }

  private async assertValidResponsibleUsers(
    db: Prisma.TransactionClient | PrismaService,
    teacherIds: string[],
    studentLeadId?: string | null,
  ) {
    if (studentLeadId && teacherIds.includes(studentLeadId)) {
      throw new BadRequestException('Una misma membresía no puede ser docente y líder estudiantil a la vez');
    }
    const ids = [...teacherIds, ...(studentLeadId ? [studentLeadId] : [])];
    const users = await db.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (users.length !== ids.length) {
      throw new BadRequestException('Uno de los responsables no existe o está inactivo');
    }
    const rolesById = new Map(users.map((candidate) => [candidate.id, candidate.roles.map((entry) => entry.role.name)]));
    if (teacherIds.some((id) => !rolesById.get(id)?.includes('TEACHER'))) {
      throw new BadRequestException('Todos los docentes responsables deben tener el rol Docente');
    }
    if (studentLeadId && !rolesById.get(studentLeadId)?.includes('COMMUNITY_LEADER')) {
      throw new BadRequestException('El líder estudiantil debe tener el rol Líder de comunidad');
    }
  }

  private async syncTeacherMembers(
    tx: Prisma.TransactionClient,
    communityId: string,
    teacherIds: string[],
  ) {
    await tx.communityMember.updateMany({
      where: {
        communityId,
        role: MembershipRole.TEACHER_LEAD,
        userId: { notIn: teacherIds },
      },
      data: { role: MembershipRole.MEMBER },
    });
    for (const userId of teacherIds) {
      await tx.communityMember.upsert({
        where: { communityId_userId: { communityId, userId } },
        create: { communityId, userId, role: MembershipRole.TEACHER_LEAD },
        update: { role: MembershipRole.TEACHER_LEAD },
      });
    }
  }

  private async syncStudentLead(
    tx: Prisma.TransactionClient,
    communityId: string,
    studentLeadId: string | null,
  ) {
    await tx.communityMember.updateMany({
      where: {
        communityId,
        role: MembershipRole.STUDENT_LEAD,
        ...(studentLeadId ? { userId: { not: studentLeadId } } : {}),
      },
      data: { role: MembershipRole.MEMBER },
    });
    if (studentLeadId) {
      await tx.communityMember.upsert({
        where: { communityId_userId: { communityId, userId: studentLeadId } },
        create: { communityId, userId: studentLeadId, role: MembershipRole.STUDENT_LEAD },
        update: { role: MembershipRole.STUDENT_LEAD },
      });
    }
  }

  private async replaceLinks(
    tx: Prisma.TransactionClient,
    communityId: string,
    links: NormalizedCommunityLink[],
  ) {
    await tx.communityLink.deleteMany({ where: { communityId } });
    if (links.length) {
      await tx.communityLink.createMany({
        data: links.map((link) => ({
          communityId,
          platform: link.platform,
          label: link.label,
          url: link.url,
          sortOrder: link.order,
          isActive: link.isActive,
        })),
      });
    }
  }

  async create(user: AuthUser, dto: UpsertCommunityDto) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException('Solo administración puede crear comunidades');
    const teacherIds = resolveCommunityTeacherIds(dto.teacherIds, dto.teacherLeadId);
    const studentLeadId = trimNullable(dto.studentLeadId) ?? null;
    const links = normalizeCommunityLinks(
      dto.links !== undefined
        ? dto.links
        : legacyLinksFromColumns({
            whatsappUrl: trimNullable(dto.whatsappUrl),
            teamsUrl: trimNullable(dto.teamsUrl),
            discordUrl: trimNullable(dto.discordUrl),
          }),
    );
    const legacy = legacyColumnsFromLinks(links);
    return this.prisma.$transaction(async (tx) => {
      await this.assertValidResponsibleUsers(tx, teacherIds, studentLeadId);
      const community = await tx.community.create({
        data: {
          slug: uniqueSlug(dto.name),
          name: dto.name.trim(),
          description: dto.description.trim(),
          longDescription: trimNullable(dto.longDescription) ?? null,
          logoUrl: trimNullable(dto.logoUrl) ?? null,
          coverUrl: trimNullable(dto.coverUrl) ?? null,
          accentColor: trimNullable(dto.accentColor) ?? null,
          ...legacy,
          teacherLeadId: teacherIds[0],
          studentLeadId,
        },
      });
      await this.replaceLinks(tx, community.id, links);
      await this.syncTeacherMembers(tx, community.id, teacherIds);
      if (studentLeadId) await this.syncStudentLead(tx, community.id, studentLeadId);
      const after = {
        ...community,
        teacherIds,
        links,
      };
      await this.audit.record(tx, {
        actor: user,
        action: 'COMMUNITY_CREATED',
        entityType: 'COMMUNITY',
        entityId: community.id,
        after,
      });
      return presentCommunity({ ...community, links: links.map((link) => ({ ...link, sortOrder: link.order })), members: teacherIds.map((userId) => ({ userId, role: MembershipRole.TEACHER_LEAD })) });
    });
  }

  private async assertCanManageCommunity(
    user: AuthUser,
    communityId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (user.roles.includes('ADMIN')) {
      const exists = await db.community.findUnique({ where: { id: communityId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Comunidad no encontrada');
      return;
    }
    const community = await db.community.findFirst({
      where: {
        id: communityId,
        OR: [
          { teacherLeadId: user.id },
          { studentLeadId: user.id },
          { members: { some: { userId: user.id, role: { in: RESPONSIBLE_ROLES } } } },
        ],
      },
      select: { id: true },
    });
    if (!community) throw new ForbiddenException('Solo puedes gestionar una comunidad donde eres responsable');
  }

  async update(user: AuthUser, id: string, dto: UpdateCommunityDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCommunity(tx, id);
      await this.assertCanManageCommunity(user, id, tx);
      const current = await tx.community.findUnique({
        where: { id },
        include: {
          links: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          members: { where: { role: { in: RESPONSIBLE_ROLES } }, select: { userId: true, role: true } },
        },
      });
      if (!current) throw new NotFoundException('Comunidad no encontrada');
      const responsibleSelectionChanged = dto.teacherIds !== undefined
        || dto.teacherLeadId !== undefined
        || dto.studentLeadId !== undefined;
      if (!user.roles.includes('ADMIN') && (responsibleSelectionChanged || dto.isActive !== undefined)) {
        throw new ForbiddenException('Solo administración puede cambiar responsables o el estado de una comunidad');
      }

      const currentTeacherIds = current.members
        .filter((member) => member.role === MembershipRole.TEACHER_LEAD)
        .map((member) => member.userId);
      if (!currentTeacherIds.length && current.teacherLeadId) currentTeacherIds.push(current.teacherLeadId);
      const teacherIds = resolveCommunityTeacherIds(dto.teacherIds, dto.teacherLeadId, currentTeacherIds);
      const studentLeadId = dto.studentLeadId !== undefined
        ? trimNullable(dto.studentLeadId) ?? null
        : current.studentLeadId;
      await this.assertValidResponsibleUsers(tx, teacherIds, studentLeadId);

      const linksTouched = dto.links !== undefined
        || dto.whatsappUrl !== undefined
        || dto.teamsUrl !== undefined
        || dto.discordUrl !== undefined;
      // Si el despliegue está en transición y el backfill aún no materializó
      // algún campo legacy, lo incorporamos antes de aplicar un cambio parcial.
      let links = presentLinks(current).map((link) => ({
        platform: link.platform,
        label: link.label,
        url: link.url,
        order: link.order,
        isActive: link.isActive,
      }));
      if (dto.links !== undefined) {
        links = normalizeCommunityLinks(dto.links);
      } else if (linksTouched) {
        links = mergeLegacyLinkUpdates(links, {
          whatsappUrl: trimNullable(dto.whatsappUrl),
          teamsUrl: trimNullable(dto.teamsUrl),
          discordUrl: trimNullable(dto.discordUrl),
        });
      }

      const data: Prisma.CommunityUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.description !== undefined) data.description = dto.description.trim();
      if (dto.longDescription !== undefined) data.longDescription = trimNullable(dto.longDescription) ?? null;
      if (dto.logoUrl !== undefined) data.logoUrl = trimNullable(dto.logoUrl) ?? null;
      if (dto.coverUrl !== undefined) data.coverUrl = trimNullable(dto.coverUrl) ?? null;
      if (dto.accentColor !== undefined) data.accentColor = trimNullable(dto.accentColor) ?? null;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      if (responsibleSelectionChanged) {
        data.teacherLead = { connect: { id: teacherIds[0] } };
        data.studentLead = studentLeadId ? { connect: { id: studentLeadId } } : { disconnect: true };
      }
      if (linksTouched) Object.assign(data, legacyColumnsFromLinks(links));

      const updated = await tx.community.update({ where: { id }, data });
      if (linksTouched) await this.replaceLinks(tx, id, links);
      if (responsibleSelectionChanged) {
        await this.syncTeacherMembers(tx, id, teacherIds);
        await this.syncStudentLead(tx, id, studentLeadId);
      }
      const after = { ...updated, teacherIds, links };
      await this.audit.record(tx, {
        actor: user,
        action: 'COMMUNITY_UPDATED',
        entityType: 'COMMUNITY',
        entityId: id,
        before: {
          ...current,
          teacherIds: currentTeacherIds,
          links: toNormalizedStoredLinks(current.links),
        },
        after,
      });
      return presentCommunity({
        ...updated,
        links: links.map((link) => ({ ...link, sortOrder: link.order })),
        members: teacherIds.map((userId) => ({ userId, role: MembershipRole.TEACHER_LEAD })),
      });
    });
  }

  async remove(user: AuthUser, id: string) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException('Solo administración puede desactivar comunidades');
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.community.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Comunidad no encontrada');
      const updated = await tx.community.update({ where: { id }, data: { isActive: false } });
      await this.audit.record(tx, {
        actor: user,
        action: 'COMMUNITY_DEACTIVATED',
        entityType: 'COMMUNITY',
        entityId: id,
        before: current,
        after: updated,
      });
      return updated;
    });
  }

  async members(user: AuthUser, communityId: string, query: CommunityMembersQueryDto) {
    await this.assertCanManageCommunity(user, communityId);
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const search = query.search?.trim().slice(0, 100);
    const where: Prisma.CommunityMemberWhereInput = {
      communityId,
      ...(query.role ? { role: query.role } : {}),
    };
    if (search) {
      where.user = {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { profile: { fullName: { contains: search, mode: 'insensitive' } } },
        ],
      };
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.communityMember.count({ where }),
      this.prisma.communityMember.findMany({
        where,
        orderBy: [
          { role: 'desc' },
          { joinedAt: 'asc' },
        ],
        take,
        skip,
        select: {
          id: true,
          userId: true,
          role: true,
          joinedAt: true,
          user: { select: SAFE_USER_SELECT },
        },
      }),
    ]);
    return { items, total, page, limit: take, pages: Math.ceil(total / take) };
  }

  async memberCandidates(user: AuthUser, communityId: string, query: CommunityCandidatesQueryDto) {
    await this.assertCanManageCommunity(user, communityId);
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const search = query.search?.trim().slice(0, 100);
    const where: Prisma.UserWhereInput = {
      isActive: true,
      communityMemberships: { none: { communityId } },
    };
    if (query.role === MembershipRole.TEACHER_LEAD) {
      where.roles = { some: { role: { name: 'TEACHER' } } };
    } else if (query.role === MembershipRole.STUDENT_LEAD) {
      where.roles = { some: { role: { name: 'COMMUNITY_LEADER' } } };
    }
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { profile: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ profile: { fullName: 'asc' } }, { username: 'asc' }],
        take,
        skip,
        select: SAFE_USER_SELECT,
      }),
    ]);
    return { items, total, page, limit: take, pages: Math.ceil(total / take) };
  }

  private assertCanAssignMemberRole(actor: AuthUser, currentRole: MembershipRole | null, nextRole: MembershipRole) {
    if (
      !actor.roles.includes('ADMIN')
      && (currentRole === MembershipRole.TEACHER_LEAD || nextRole === MembershipRole.TEACHER_LEAD)
    ) {
      throw new ForbiddenException('Solo administración puede asignar o retirar docentes responsables');
    }
  }

  private async assertEligibleMember(
    db: Prisma.TransactionClient,
    userId: string,
    role: MembershipRole,
  ) {
    const candidate = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!candidate || !candidate.isActive) throw new BadRequestException('El usuario no existe o está inactivo');
    const roles = candidate.roles.map((entry) => entry.role.name);
    if (role === MembershipRole.TEACHER_LEAD && !roles.includes('TEACHER')) {
      throw new BadRequestException('Un docente responsable debe tener el rol Docente');
    }
    if (role === MembershipRole.STUDENT_LEAD && !roles.includes('COMMUNITY_LEADER')) {
      throw new BadRequestException('Un líder estudiantil debe tener el rol Líder de comunidad');
    }
  }

  private async responsibilityCounts(db: Prisma.TransactionClient, communityId: string) {
    const [teacherCount, responsibleCount] = await Promise.all([
      db.communityMember.count({ where: { communityId, role: MembershipRole.TEACHER_LEAD } }),
      db.communityMember.count({ where: { communityId, role: { in: RESPONSIBLE_ROLES } } }),
    ]);
    return { teacherCount, responsibleCount };
  }

  private async lockCommunity(db: Prisma.TransactionClient, communityId: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "Community"
      WHERE "id" = ${communityId}
      FOR UPDATE
    `);
  }

  private async syncLegacyLeadPointers(db: Prisma.TransactionClient, communityId: string) {
    const [teacher, student] = await Promise.all([
      db.communityMember.findFirst({
        where: { communityId, role: MembershipRole.TEACHER_LEAD },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: { userId: true },
      }),
      db.communityMember.findFirst({
        where: { communityId, role: MembershipRole.STUDENT_LEAD },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: { userId: true },
      }),
    ]);
    if (!teacher) throw new BadRequestException('La comunidad debe conservar al menos un docente responsable');
    await db.community.update({
      where: { id: communityId },
      data: { teacherLeadId: teacher.userId, studentLeadId: student?.userId ?? null },
    });
  }

  async addMember(user: AuthUser, communityId: string, dto: AddCommunityMemberDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCommunity(tx, communityId);
      await this.assertCanManageCommunity(user, communityId, tx);
      const role = dto.role ?? MembershipRole.MEMBER;
      this.assertCanAssignMemberRole(user, null, role);
      await this.assertEligibleMember(tx, dto.userId, role);
      const existing = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId: dto.userId } },
      });
      if (existing) throw new ConflictException('El usuario ya pertenece a esta comunidad');
      let member;
      try {
        member = await tx.communityMember.create({
          data: { communityId, userId: dto.userId, role },
          select: {
            id: true,
            userId: true,
            role: true,
            joinedAt: true,
            user: { select: SAFE_USER_SELECT },
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('El usuario ya pertenece a esta comunidad');
        }
        throw error;
      }
      if (RESPONSIBLE_ROLES.includes(role)) await this.syncLegacyLeadPointers(tx, communityId);
      await this.audit.record(tx, {
        actor: user,
        action: 'COMMUNITY_MEMBER_ADDED',
        entityType: 'COMMUNITY_MEMBER',
        entityId: member.id,
        after: { communityId, userId: member.userId, role: member.role },
      });
      return member;
    });
  }

  async updateMember(user: AuthUser, communityId: string, memberUserId: string, dto: UpdateCommunityMemberDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCommunity(tx, communityId);
      await this.assertCanManageCommunity(user, communityId, tx);
      const member = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId: memberUserId } },
      });
      if (!member) throw new NotFoundException('Miembro no encontrado en esta comunidad');
      if (member.role === dto.role) return member;
      if (user.id === memberUserId && RESPONSIBLE_ROLES.includes(member.role)) {
        throw new BadRequestException('No puedes retirar tu propio rol responsable; otro responsable debe reasignarte');
      }
      this.assertCanAssignMemberRole(user, member.role, dto.role);
      await this.assertEligibleMember(tx, memberUserId, dto.role);
      const counts = await this.responsibilityCounts(tx, communityId);
      assertCommunityRoleRemovalAllowed(member.role, dto.role, counts.teacherCount, counts.responsibleCount);
      const updated = await tx.communityMember.update({
        where: { id: member.id },
        data: { role: dto.role },
        select: {
          id: true,
          userId: true,
          role: true,
          joinedAt: true,
          user: { select: SAFE_USER_SELECT },
        },
      });
      if (RESPONSIBLE_ROLES.includes(member.role) || RESPONSIBLE_ROLES.includes(dto.role)) {
        await this.syncLegacyLeadPointers(tx, communityId);
      }
      await this.audit.record(tx, {
        actor: user,
        action: 'COMMUNITY_MEMBER_ROLE_UPDATED',
        entityType: 'COMMUNITY_MEMBER',
        entityId: member.id,
        before: { communityId, userId: member.userId, role: member.role },
        after: { communityId, userId: updated.userId, role: updated.role },
      });
      return updated;
    });
  }

  async removeMember(user: AuthUser, communityId: string, memberUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCommunity(tx, communityId);
      await this.assertCanManageCommunity(user, communityId, tx);
      const member = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId: memberUserId } },
      });
      if (!member) throw new NotFoundException('Miembro no encontrado en esta comunidad');
      if (user.id === memberUserId && RESPONSIBLE_ROLES.includes(member.role)) {
        throw new BadRequestException('No puedes quitarte como responsable; otro responsable debe reasignarte');
      }
      this.assertCanAssignMemberRole(user, member.role, MembershipRole.MEMBER);
      const counts = await this.responsibilityCounts(tx, communityId);
      assertCommunityRoleRemovalAllowed(member.role, null, counts.teacherCount, counts.responsibleCount);
      await tx.communityMember.delete({ where: { id: member.id } });
      if (RESPONSIBLE_ROLES.includes(member.role)) await this.syncLegacyLeadPointers(tx, communityId);
      await this.audit.record(tx, {
        actor: user,
        action: 'COMMUNITY_MEMBER_REMOVED',
        entityType: 'COMMUNITY_MEMBER',
        entityId: member.id,
        before: { communityId, userId: member.userId, role: member.role },
      });
      return { removed: true };
    });
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
  @ApiOperation({ summary: '[Admin/Responsable] Comunidades que puedo gestionar' })
  managementList(@CurrentUser() user: AuthUser) {
    return this.communities.managementList(user);
  }

  @Get('management/candidates')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Búsqueda paginada de docentes y líderes elegibles' })
  managementCandidates(@Query() query: CommunityCandidatesQueryDto) {
    return this.communities.managementCandidates(query);
  }

  @Get('management/:id/members')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Responsable] Miembros paginados de una comunidad' })
  members(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: CommunityMembersQueryDto,
  ) {
    return this.communities.members(user, id, query);
  }

  @Get('management/:id/candidates')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Responsable] Candidatos activos que aún no pertenecen a la comunidad' })
  memberCandidates(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: CommunityCandidatesQueryDto,
  ) {
    return this.communities.memberCandidates(user, id, query);
  }

  @Post('management/:id/members')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Responsable] Agregar miembro' })
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddCommunityMemberDto,
  ) {
    return this.communities.addMember(user, id, dto);
  }

  @Patch('management/:id/members/:userId')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Responsable] Cambiar rol interno de un miembro' })
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') memberUserId: string,
    @Body() dto: UpdateCommunityMemberDto,
  ) {
    return this.communities.updateMember(user, id, memberUserId, dto);
  }

  @Delete('management/:id/members/:userId')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Responsable] Quitar miembro (la confirmación se realiza en el cliente)' })
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') memberUserId: string,
  ) {
    return this.communities.removeMember(user, id, memberUserId);
  }

  @Get('management/:id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Responsable] Detalle editable de una comunidad' })
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
  @ApiOperation({ summary: 'Unirse a una comunidad activa y aplicar la regla de puntos configurada' })
  join(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.communities.join(user, slug);
  }

  @Post(':slug/leave')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Salir de la comunidad; los responsables deben reasignarse primero' })
  leave(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.communities.leave(user, slug);
  }

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Crear comunidad con al menos un docente responsable' })
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertCommunityDto) {
    return this.communities.create(user, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Responsable] Actualizar comunidad' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCommunityDto) {
    return this.communities.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Desactivar comunidad' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.communities.remove(user, id);
  }
}

@Module({
  providers: [CommunitiesService],
  controllers: [CommunitiesController],
})
export class CommunitiesModule {}
