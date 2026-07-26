import {
  BadRequestException,
  Body,
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
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  Difficulty,
  MembershipRole,
  MentorshipModality,
  Prisma,
  RoleName,
} from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { clean, paginate, uniqueSlug } from '../common/utils';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule, StorageService } from '../storage/storage.module';

const WEB_URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};
const MAX_MENTORS = 12;
const MAX_STUDENTS = 100;
const MAX_GALLERY_IMAGES = 12;

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  profile: {
    select: {
      fullName: true,
      avatarUrl: true,
      semester: true,
    },
  },
  roles: {
    select: {
      role: {
        select: { name: true },
      },
    },
  },
} satisfies Prisma.UserSelect;

const MENTORSHIP_INCLUDE = {
  mentor: { select: USER_PUBLIC_SELECT },
  mentors: {
    orderBy: { isLead: 'desc' as const },
    include: { user: { select: USER_PUBLIC_SELECT } },
  },
  community: {
    select: {
      id: true,
      slug: true,
      name: true,
      accentColor: true,
    },
  },
  _count: { select: { enrollments: true } },
  gallery: {
    orderBy: { createdAt: 'asc' as const },
    take: MAX_GALLERY_IMAGES,
    select: {
      id: true,
      url: true,
      mime: true,
      sizeBytes: true,
      width: true,
      height: true,
      createdAt: true,
    },
  },
} as const;

const MENTORSHIP_DETAIL_INCLUDE = {
  ...MENTORSHIP_INCLUDE,
  enrollments: {
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: USER_PUBLIC_SELECT } },
  },
} as const;

function plainText(value: string) {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

function requiredPlainText(value: string, label: string, minimum: number, maximum: number) {
  const result = plainText(value);
  if (result.length < minimum) {
    throw new BadRequestException(`${label} debe tener al menos ${minimum} caracteres`);
  }
  if (result.length > maximum) {
    throw new BadRequestException(`${label} no puede superar ${maximum} caracteres`);
  }
  return result;
}

function requiredRichText(value: string, label: string, minimum: number, maximum: number) {
  const result = clean(value)?.trim() ?? '';
  if (plainText(result).length < minimum) {
    throw new BadRequestException(`${label} debe tener al menos ${minimum} caracteres`);
  }
  if (result.length > maximum) {
    throw new BadRequestException(`${label} no puede superar ${maximum} caracteres`);
  }
  return result;
}

function optionalPlainText(value: string | null | undefined, maximum: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const result = plainText(value);
  return result ? result.slice(0, maximum) : null;
}

export function uniqueMentorshipIds(values: string[] = [], label = 'usuarios') {
  const trimmed = values.map((value) => value.trim()).filter(Boolean);
  const unique = [...new Set(trimmed)];
  if (unique.length !== trimmed.length) {
    throw new BadRequestException(`No repitas ${label}`);
  }
  return unique;
}

export interface MentorshipConfiguration {
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  modality: MentorshipModality;
  location?: string | null;
  meetingUrl?: string | null;
  teamsUrl?: string | null;
  mentorIds: string[];
  studentCount?: number;
  capacity?: number | null;
}

export function validateMentorshipConfiguration(value: MentorshipConfiguration) {
  if (!value.mentorIds.length) {
    throw new BadRequestException('La mentoría debe tener al menos un docente responsable');
  }
  if (!value.startsAt) {
    throw new BadRequestException('La fecha y hora de inicio son obligatorias');
  }
  const startsAt = new Date(value.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new BadRequestException('La fecha de inicio no es válida');
  }
  if (value.endsAt) {
    const endsAt = new Date(value.endsAt);
    if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('La fecha de finalización debe ser posterior al inicio');
    }
  }
  const hasLocation = !!value.location?.trim();
  const hasMeetingUrl = !!(value.meetingUrl?.trim() || value.teamsUrl?.trim());
  if (value.modality === MentorshipModality.IN_PERSON && !hasLocation) {
    throw new BadRequestException('Indica el lugar de la mentoría presencial');
  }
  if (value.modality === MentorshipModality.ONLINE && !hasMeetingUrl) {
    throw new BadRequestException('Indica el enlace de la mentoría en línea');
  }
  if (value.modality === MentorshipModality.HYBRID && (!hasLocation || !hasMeetingUrl)) {
    throw new BadRequestException('La modalidad híbrida requiere lugar y enlace');
  }
  if (
    value.capacity !== null
    && value.capacity !== undefined
    && (value.studentCount ?? 0) > value.capacity
  ) {
    throw new BadRequestException('La cantidad de estudiantes supera la capacidad de la mentoría');
  }
}

export class UpsertMentorshipDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(140)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(10_000)
  description: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  area: string;

  @ApiPropertyOptional({ enum: Difficulty })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiPropertyOptional({ type: [String], description: 'Temario' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  syllabus?: string[];

  @ApiProperty({ example: '2026-08-10T14:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  coverUrl?: string | null;

  @ApiPropertyOptional({ enum: MentorshipModality, default: MentorshipModality.ONLINE })
  @IsOptional()
  @IsEnum(MentorshipModality)
  modality?: MentorshipModality;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  meetingUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Alias legacy de canal de comunicación' })
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  teamsUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  youtubeUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @ApiPropertyOptional({ type: [String], description: 'IDs de docentes obtenidos del directorio paginado' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MENTORS)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  mentorIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'IDs de estudiantes obtenidos del directorio paginado' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_STUDENTS)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Imágenes nuevas devueltas por POST /media/upload' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GALLERY_IMAGES)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  galleryImageIds?: string[];

  @ApiPropertyOptional({ description: 'Compatibilidad con clientes anteriores' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mentorUsername?: string;

  @ApiPropertyOptional({ description: 'Campo legacy informativo; no sustituye al docente registrado' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mentorName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  communitySlug?: string | null;
}

export class UpdateMentorshipDto extends PartialType(UpsertMentorshipDto) {}

export class MentorshipGalleryDto {
  @ApiProperty({ type: [String], description: 'IDs de imágenes devueltas por POST /media/upload' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GALLERY_IMAGES)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  imageIds: string[];
}

export class MentorshipListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @ApiPropertyOptional({ enum: Difficulty })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiPropertyOptional({ enum: MentorshipModality })
  @IsOptional()
  @IsEnum(MentorshipModality)
  modality?: MentorshipModality;

  @ApiPropertyOptional({ enum: ['upcoming', 'current', 'past'] })
  @IsOptional()
  @IsIn(['upcoming', 'current', 'past'])
  when?: 'upcoming' | 'current' | 'past';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

function mentorshipAuditSnapshot(mentorship: any) {
  return {
    id: mentorship.id,
    slug: mentorship.slug,
    title: mentorship.title,
    area: mentorship.area,
    startsAt: mentorship.startsAt,
    endsAt: mentorship.endsAt,
    modality: mentorship.modality,
    location: mentorship.location,
    meetingUrl: mentorship.meetingUrl,
    capacity: mentorship.capacity,
    isActive: mentorship.isActive,
    mentorIds: mentorship.mentors?.map((entry: any) => entry.userId ?? entry.user?.id) ?? [],
    studentIds: mentorship.enrollments?.map((entry: any) => entry.userId ?? entry.user?.id) ?? [],
    galleryIds: mentorship.gallery?.map((entry: any) => entry.id) ?? [],
    communityId: mentorship.communityId,
  };
}

@Injectable()
export class MentorshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly gamification: GamificationService,
  ) {}

  private serializeUser(user: any) {
    if (!user) return null;
    return {
      ...user,
      roles: user.roles?.map((entry: any) => entry.role?.name ?? entry) ?? [],
    };
  }

  private statusOf(mentorship: {
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  }) {
    if (!mentorship.isActive) return 'INACTIVE';
    const now = Date.now();
    if (mentorship.endsAt && mentorship.endsAt.getTime() < now) return 'COMPLETED';
    if (mentorship.startsAt && mentorship.startsAt.getTime() > now) return 'UPCOMING';
    return 'IN_PROGRESS';
  }

  private serialize(
    mentorship: any,
    options: {
      canManage: boolean;
      enrolled: boolean;
      exposeParticipants?: boolean;
      exposeAccess?: boolean;
    },
  ) {
    const exposeAccess = options.exposeAccess ?? (options.canManage || options.enrolled);
    const mentors = mentorship.mentors?.map((entry: any) => ({
      ...entry,
      user: this.serializeUser(entry.user),
    })) ?? [];
    const legacyMentor = this.serializeUser(mentorship.mentor);
    return {
      ...mentorship,
      mentor: legacyMentor,
      mentors,
      enrollments: options.exposeParticipants
        ? mentorship.enrollments?.map((entry: any) => ({
            id: entry.id,
            createdAt: entry.createdAt,
            user: this.serializeUser(entry.user),
          })) ?? []
        : undefined,
      participants: options.exposeParticipants
        ? mentorship.enrollments?.map((entry: any) => this.serializeUser(entry.user)) ?? []
        : [],
      meetingUrl: exposeAccess ? mentorship.meetingUrl : null,
      teamsUrl: exposeAccess ? mentorship.teamsUrl : null,
      enrolled: options.enrolled,
      canManage: options.canManage,
      status: this.statusOf(mentorship),
    };
  }

  private listWhere(query: MentorshipListQueryDto, activeOnly: boolean) {
    const now = new Date();
    const q = query.q?.trim().slice(0, 120);
    const and: Prisma.MentorshipWhereInput[] = [];
    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { area: { contains: q, mode: 'insensitive' } },
          { mentors: { some: { user: { username: { contains: q, mode: 'insensitive' } } } } },
          { mentors: { some: { user: { profile: { fullName: { contains: q, mode: 'insensitive' } } } } } },
        ],
      });
    }
    if (query.when === 'current') {
      and.push({
        OR: [
          { endsAt: null },
          { endsAt: { gte: now } },
        ],
      });
    }
    const where: Prisma.MentorshipWhereInput = {
      ...(activeOnly ? { isActive: true } : {}),
      ...(query.area
        ? { area: { contains: query.area.trim().slice(0, 80), mode: 'insensitive' } }
        : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.modality ? { modality: query.modality } : {}),
      ...(query.when === 'upcoming' ? { startsAt: { gt: now } } : {}),
      ...(query.when === 'past' ? { endsAt: { lt: now } } : {}),
      ...(query.when === 'current'
        ? {
            startsAt: { lte: now },
          }
        : {}),
      ...(and.length ? { AND: and } : {}),
    };
    return where;
  }

  private async accessSets(user: AuthUser | null | undefined, items: any[]) {
    const enrolled = new Set<string>();
    const manageable = new Set<string>();
    if (!user || !items.length) return { enrolled, manageable };
    const ids = items.map((item) => item.id);
    const enrollments = await this.prisma.mentorshipEnrollment.findMany({
      where: { userId: user.id, mentorshipId: { in: ids } },
      select: { mentorshipId: true },
    });
    for (const entry of enrollments) enrolled.add(entry.mentorshipId);
    if (user.roles.includes('ADMIN')) {
      for (const id of ids) manageable.add(id);
      return { enrolled, manageable };
    }
    for (const item of items) {
      if (
        item.mentorId === user.id
        || item.mentors?.some((mentor: any) => mentor.userId === user.id)
      ) {
        manageable.add(item.id);
      }
    }
    const communityIds = [
      ...new Set(items.flatMap((item) => item.communityId ? [item.communityId] : [])),
    ];
    if (communityIds.length) {
      const communities = await this.prisma.community.findMany({
        where: {
          id: { in: communityIds },
          OR: [
            { teacherLeadId: user.id },
            { studentLeadId: user.id },
            {
              members: {
                some: {
                  userId: user.id,
                  role: {
                    in: [MembershipRole.STUDENT_LEAD, MembershipRole.TEACHER_LEAD],
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      });
      const communitySet = new Set(communities.map((community) => community.id));
      for (const item of items) {
        if (item.communityId && communitySet.has(item.communityId)) manageable.add(item.id);
      }
    }
    return { enrolled, manageable };
  }

  async list(query: MentorshipListQueryDto, viewer?: AuthUser | null) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 12);
    const where = this.listWhere(query, true);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.mentorship.count({ where }),
      this.prisma.mentorship.findMany({
        where,
        orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        include: MENTORSHIP_INCLUDE,
      }),
    ]);
    const { enrolled, manageable } = await this.accessSets(viewer, items);
    return {
      items: items.map((mentorship) => this.serialize(mentorship, {
        canManage: manageable.has(mentorship.id),
        enrolled: enrolled.has(mentorship.id),
      })),
      myEnrollments: [...enrolled],
      total,
      page,
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async managementList(user: AuthUser, query: MentorshipListQueryDto) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const baseWhere = this.listWhere(query, false);
    const baseAnd = Array.isArray(baseWhere.AND)
      ? baseWhere.AND
      : baseWhere.AND
        ? [baseWhere.AND]
        : [];
    const where: Prisma.MentorshipWhereInput = {
      ...baseWhere,
      ...(!user.roles.includes('ADMIN')
        ? {
            AND: [
              ...baseAnd,
              {
                OR: [
                  { mentorId: user.id },
                  { mentors: { some: { userId: user.id } } },
                  { community: { teacherLeadId: user.id } },
                  { community: { studentLeadId: user.id } },
                  {
                    community: {
                      members: {
                        some: {
                          userId: user.id,
                          role: {
                            in: [MembershipRole.STUDENT_LEAD, MembershipRole.TEACHER_LEAD],
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.mentorship.count({ where }),
      this.prisma.mentorship.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { startsAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
        include: MENTORSHIP_INCLUDE,
      }),
    ]);
    const enrollmentIds = items.length
      ? await this.prisma.mentorshipEnrollment.findMany({
          where: { userId: user.id, mentorshipId: { in: items.map((item) => item.id) } },
          select: { mentorshipId: true },
        })
      : [];
    const enrolled = new Set(enrollmentIds.map((entry) => entry.mentorshipId));
    return {
      items: items.map((item) => this.serialize(item, {
        canManage: true,
        enrolled: enrolled.has(item.id),
        exposeAccess: true,
      })),
      total,
      page,
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async detail(slug: string, viewer?: AuthUser | null) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { slug },
      include: MENTORSHIP_DETAIL_INCLUDE,
    });
    if (!mentorship || !mentorship.isActive) {
      throw new NotFoundException('Mentoría no encontrada');
    }
    const { enrolled, manageable } = await this.accessSets(viewer, [mentorship]);
    const isEnrolled = enrolled.has(mentorship.id);
    const canManage = manageable.has(mentorship.id);
    return this.serialize(mentorship, {
      canManage,
      enrolled: isEnrolled,
      exposeParticipants: canManage || isEnrolled,
    });
  }

  async managementDetail(user: AuthUser, id: string) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id },
      include: MENTORSHIP_DETAIL_INCLUDE,
    });
    if (!mentorship) throw new NotFoundException('Mentoría no encontrada');
    await this.assertCanManage(user, mentorship);
    const enrolled = mentorship.enrollments.some((entry) => entry.userId === user.id);
    return this.serialize(mentorship, {
      canManage: true,
      enrolled,
      exposeParticipants: true,
      exposeAccess: true,
    });
  }

  private async resolveCommunity(communitySlug?: string | null) {
    if (communitySlug === undefined) return undefined;
    if (!communitySlug?.trim()) return null;
    const community = await this.prisma.community.findUnique({
      where: { slug: communitySlug.trim() },
      select: { id: true },
    });
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
          {
            members: {
              some: {
                userId: user.id,
                role: {
                  in: [MembershipRole.STUDENT_LEAD, MembershipRole.TEACHER_LEAD],
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    return !!community;
  }

  private async assertCanManage(
    user: AuthUser,
    mentorship: {
      id: string;
      mentorId: string | null;
      communityId: string | null;
      mentors?: { userId: string }[];
    },
  ) {
    if (user.roles.includes('ADMIN')) return;
    if (
      mentorship.mentorId === user.id
      || mentorship.mentors?.some((mentor) => mentor.userId === user.id)
    ) {
      return;
    }
    if (await this.canManageCommunity(user, mentorship.communityId)) return;
    throw new ForbiddenException('No puedes gestionar esta mentoría');
  }

  private async assertCommunityAssignment(user: AuthUser, communityId?: string | null) {
    if (user.roles.includes('ADMIN') || !communityId) return;
    if (await this.canManageCommunity(user, communityId)) return;
    throw new ForbiddenException('Solo puedes asociar mentorías a una comunidad que administras');
  }

  private async resolveMentorIds(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    dto: Pick<UpdateMentorshipDto, 'mentorIds' | 'mentorUsername'>,
    current: { mentorId: string | null; mentors: { userId: string }[] } | null,
  ) {
    let ids: string[];
    if (dto.mentorIds !== undefined) {
      ids = uniqueMentorshipIds(dto.mentorIds, 'docentes');
    } else if (dto.mentorUsername?.trim()) {
      const mentor = await tx.user.findUnique({
        where: { username: dto.mentorUsername.trim().toLowerCase() },
        select: { id: true },
      });
      if (!mentor) throw new BadRequestException('Docente responsable no encontrado');
      ids = [mentor.id];
    } else if (current) {
      ids = current.mentors.map((mentor) => mentor.userId);
      if (!ids.length && current.mentorId) ids = [current.mentorId];
    } else if (user.roles.includes(RoleName.TEACHER)) {
      ids = [user.id];
    } else {
      ids = [];
    }
    if (!ids.length) {
      throw new BadRequestException('La mentoría debe tener al menos un docente responsable');
    }
    const mentors = await tx.user.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        emailVerifiedAt: { not: null },
        roles: { some: { role: { name: RoleName.TEACHER } } },
      },
      select: { id: true },
    });
    const found = new Set(mentors.map((mentor) => mentor.id));
    if (ids.some((id) => !found.has(id))) {
      throw new BadRequestException('Todos los responsables deben ser docentes activos');
    }
    return ids;
  }

  private async resolveStudentIds(
    tx: Prisma.TransactionClient,
    rawStudentIds: string[] | undefined,
    currentStudentIds: string[],
    mentorIds: string[],
  ) {
    if (rawStudentIds === undefined) return currentStudentIds;
    const ids = uniqueMentorshipIds(rawStudentIds, 'estudiantes');
    if (ids.some((id) => mentorIds.includes(id))) {
      throw new BadRequestException('Una misma persona no puede ser docente y estudiante de la mentoría');
    }
    if (!ids.length) return [];
    const students = await tx.user.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        emailVerifiedAt: { not: null },
        roles: { some: { role: { name: RoleName.STUDENT } } },
      },
      select: { id: true },
    });
    const found = new Set(students.map((student) => student.id));
    if (ids.some((id) => !found.has(id))) {
      throw new BadRequestException('Todos los participantes seleccionados deben ser estudiantes activos');
    }
    return ids;
  }

  private normalizedSyllabus(values?: string[]) {
    if (values === undefined) return undefined;
    const result = values
      .map((entry) => plainText(entry))
      .filter(Boolean);
    if (result.some((entry) => entry.length > 200)) {
      throw new BadRequestException('Cada punto del temario admite hasta 200 caracteres');
    }
    return result;
  }

  private serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await this.prisma.$transaction(operation, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          });
        } catch (error) {
          if (
            attempt >= 2
            || !(error instanceof Prisma.PrismaClientKnownRequestError)
            || !['P2002', 'P2034'].includes(error.code)
          ) {
            throw error;
          }
        }
      }
    };
    return run();
  }

  async create(user: AuthUser, dto: UpsertMentorshipDto) {
    const communityId = await this.resolveCommunity(dto.communitySlug);
    const resolvedCommunityId = communityId ?? null;
    if (
      user.roles.includes(RoleName.COMMUNITY_LEADER)
      && !user.roles.includes(RoleName.ADMIN)
      && !user.roles.includes(RoleName.TEACHER)
      && !resolvedCommunityId
    ) {
      throw new BadRequestException('Selecciona una comunidad que administras');
    }
    await this.assertCommunityAssignment(user, resolvedCommunityId);
    const galleryImageIds = uniqueMentorshipIds(dto.galleryImageIds, 'imágenes');

    const createdId = await this.prisma.$transaction(async (tx) => {
      const mentorIds = await this.resolveMentorIds(tx, user, dto, null);
      const studentIds = await this.resolveStudentIds(tx, dto.studentIds, [], mentorIds);
      const modality = dto.modality ?? MentorshipModality.ONLINE;
      const location = optionalPlainText(dto.location, 180) ?? null;
      const meetingUrl = dto.meetingUrl?.trim() || null;
      const teamsUrl = dto.teamsUrl?.trim() || null;
      validateMentorshipConfiguration({
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        modality,
        location,
        meetingUrl,
        teamsUrl,
        mentorIds,
        studentCount: studentIds.length,
        capacity: dto.capacity,
      });
      await this.storage.assertOwnedUnlinkedImages(tx, user.id, galleryImageIds);
      const mentorship = await tx.mentorship.create({
        data: {
          slug: uniqueSlug(dto.title),
          title: requiredPlainText(dto.title, 'El título', 5, 140),
          description: requiredRichText(dto.description, 'La descripción', 10, 10_000),
          area: requiredPlainText(dto.area, 'El área', 2, 80),
          difficulty: dto.difficulty ?? Difficulty.BASICO,
          syllabus: this.normalizedSyllabus(dto.syllabus) ?? [],
          startsAt: new Date(dto.startsAt),
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          coverUrl: dto.coverUrl?.trim() || null,
          modality,
          location,
          meetingUrl,
          teamsUrl,
          youtubeUrl: dto.youtubeUrl?.trim() || null,
          capacity: dto.capacity ?? null,
          mentorId: mentorIds[0],
          mentorName: null,
          communityId: resolvedCommunityId,
          mentors: {
            create: mentorIds.map((userId, index) => ({ userId, isLead: index === 0 })),
          },
          enrollments: studentIds.length
            ? { create: studentIds.map((userId) => ({ userId })) }
            : undefined,
          gallery: galleryImageIds.length
            ? { connect: galleryImageIds.map((id) => ({ id })) }
            : undefined,
        },
        include: {
          mentors: { select: { userId: true } },
          enrollments: { select: { userId: true } },
          gallery: { select: { id: true } },
        },
      });
      await this.audit.record(tx, {
        actor: user,
        action: 'MENTORSHIP_CREATED',
        entityType: 'MENTORSHIP',
        entityId: mentorship.id,
        before: null,
        after: mentorshipAuditSnapshot(mentorship),
      });
      return mentorship.id;
    });
    if (dto.studentIds?.length) {
      const studentIds = uniqueMentorshipIds(dto.studentIds, 'estudiantes');
      await this.notifySelectedStudents(
        createdId,
        studentIds,
      );
      await Promise.all(studentIds.map((studentId) => (
        this.gamification.evaluateBadgesForUser(studentId)
      )));
    }
    return this.managementDetail(user, createdId);
  }

  async update(user: AuthUser, id: string, dto: UpdateMentorshipDto) {
    const current = await this.prisma.mentorship.findUnique({
      where: { id },
      include: {
        mentors: {
          orderBy: { isLead: 'desc' },
          select: { userId: true, isLead: true },
        },
        enrollments: { select: { userId: true } },
        gallery: { select: { id: true } },
      },
    });
    if (!current) throw new NotFoundException('Mentoría no encontrada');
    await this.assertCanManage(user, current);
    const communityId = await this.resolveCommunity(dto.communitySlug);
    const nextCommunityId = communityId === undefined ? current.communityId : communityId;
    if (communityId !== undefined && communityId !== current.communityId) {
      await this.assertCommunityAssignment(user, communityId);
    }
    const galleryImageIds = uniqueMentorshipIds(dto.galleryImageIds, 'imágenes');
    const priorStudentIds = current.enrollments.map((entry) => entry.userId);

    await this.prisma.$transaction(async (tx) => {
      const mentorIds = await this.resolveMentorIds(tx, user, dto, current);
      const studentIds = await this.resolveStudentIds(
        tx,
        dto.studentIds,
        priorStudentIds,
        mentorIds,
      );
      const modality = dto.modality ?? current.modality;
      const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
      const endsAt = dto.endsAt !== undefined
        ? (dto.endsAt ? new Date(dto.endsAt) : null)
        : current.endsAt;
      const location = dto.location !== undefined
        ? optionalPlainText(dto.location, 180) ?? null
        : current.location;
      const meetingUrl = dto.meetingUrl !== undefined
        ? dto.meetingUrl?.trim() || null
        : current.meetingUrl;
      const teamsUrl = dto.teamsUrl !== undefined
        ? dto.teamsUrl?.trim() || null
        : current.teamsUrl;
      const capacity = dto.capacity !== undefined ? dto.capacity : current.capacity;
      validateMentorshipConfiguration({
        startsAt,
        endsAt,
        modality,
        location,
        meetingUrl,
        teamsUrl,
        mentorIds,
        studentCount: studentIds.length,
        capacity,
      });
      const currentGalleryIds = new Set(current.gallery.map((entry) => entry.id));
      if (galleryImageIds.some((imageId) => currentGalleryIds.has(imageId))) {
        throw new BadRequestException('Una imagen ya forma parte de la galería');
      }
      if (current.gallery.length + galleryImageIds.length > MAX_GALLERY_IMAGES) {
        throw new BadRequestException(`La galería admite hasta ${MAX_GALLERY_IMAGES} imágenes`);
      }
      await this.storage.assertOwnedUnlinkedImages(tx, user.id, galleryImageIds);

      const mentorSetChanged = mentorIds.join('|') !== current.mentors.map((entry) => entry.userId).join('|');
      if (mentorSetChanged) {
        await tx.mentorshipMentor.deleteMany({ where: { mentorshipId: id } });
        await tx.mentorshipMentor.createMany({
          data: mentorIds.map((userId, index) => ({
            mentorshipId: id,
            userId,
            isLead: index === 0,
          })),
        });
      }
      if (dto.studentIds !== undefined) {
        await tx.mentorshipEnrollment.deleteMany({ where: { mentorshipId: id } });
        if (studentIds.length) {
          await tx.mentorshipEnrollment.createMany({
            data: studentIds.map((userId) => ({ mentorshipId: id, userId })),
          });
        }
      }
      const updated = await tx.mentorship.update({
        where: { id },
        data: {
          title: dto.title === undefined
            ? undefined
            : requiredPlainText(dto.title, 'El título', 5, 140),
          description: dto.description === undefined
            ? undefined
            : requiredRichText(dto.description, 'La descripción', 10, 10_000),
          area: dto.area === undefined
            ? undefined
            : requiredPlainText(dto.area, 'El área', 2, 80),
          difficulty: dto.difficulty,
          syllabus: this.normalizedSyllabus(dto.syllabus),
          startsAt,
          endsAt,
          coverUrl: dto.coverUrl !== undefined ? dto.coverUrl?.trim() || null : undefined,
          modality,
          location,
          meetingUrl,
          teamsUrl,
          youtubeUrl: dto.youtubeUrl !== undefined ? dto.youtubeUrl?.trim() || null : undefined,
          capacity,
          mentorId: mentorIds[0],
          mentorName: null,
          communityId: nextCommunityId,
          gallery: galleryImageIds.length
            ? { connect: galleryImageIds.map((imageId) => ({ id: imageId })) }
            : undefined,
        },
        include: {
          mentors: { select: { userId: true } },
          enrollments: { select: { userId: true } },
          gallery: { select: { id: true } },
        },
      });
      await this.audit.record(tx, {
        actor: user,
        action: 'MENTORSHIP_UPDATED',
        entityType: 'MENTORSHIP',
        entityId: id,
        before: mentorshipAuditSnapshot(current),
        after: mentorshipAuditSnapshot(updated),
      });
    });

    if (dto.studentIds !== undefined) {
      const priorSet = new Set(priorStudentIds);
      const added = uniqueMentorshipIds(dto.studentIds, 'estudiantes')
        .filter((studentId) => !priorSet.has(studentId));
      if (added.length) await this.notifySelectedStudents(id, added);
    }
    if (dto.studentIds !== undefined || dto.endsAt !== undefined) {
      const currentStudents = await this.prisma.mentorshipEnrollment.findMany({
        where: { mentorshipId: id },
        select: { userId: true },
      });
      await Promise.all(currentStudents.map(({ userId }) => (
        this.gamification.evaluateBadgesForUser(userId)
      )));
    }
    return this.managementDetail(user, id);
  }

  private async notifySelectedStudents(mentorshipId: string, studentIds: string[]) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id: mentorshipId },
      select: { id: true, slug: true, title: true },
    });
    if (!mentorship) return;
    await Promise.all(studentIds.map((studentId) => this.notifications.send({
      userId: studentId,
      type: 'MENTORSHIP_ENROLLMENT',
      title: 'Te agregaron a una mentoría',
      body: `Ya formas parte de “${mentorship.title}”.`,
      href: `/mentorias/${mentorship.slug}`,
      dedupeKey: `mentorship-selected:${mentorship.id}:${studentId}`,
    })));
  }

  async deactivate(user: AuthUser, id: string) {
    const current = await this.prisma.mentorship.findUnique({
      where: { id },
      include: {
        mentors: { select: { userId: true } },
        enrollments: { select: { userId: true } },
        gallery: { select: { id: true } },
      },
    });
    if (!current) throw new NotFoundException('Mentoría no encontrada');
    await this.assertCanManage(user, current);
    if (!current.isActive) return { deactivated: true, alreadyInactive: true };
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mentorship.update({
        where: { id },
        data: { isActive: false },
        include: {
          mentors: { select: { userId: true } },
          enrollments: { select: { userId: true } },
          gallery: { select: { id: true } },
        },
      });
      await this.audit.record(tx, {
        actor: user,
        action: 'MENTORSHIP_DEACTIVATED',
        entityType: 'MENTORSHIP',
        entityId: id,
        before: mentorshipAuditSnapshot(current),
        after: mentorshipAuditSnapshot(updated),
      });
    });
    return { deactivated: true };
  }

  async enroll(user: AuthUser, slug: string) {
    if (!user.roles.includes(RoleName.STUDENT)) {
      throw new ForbiddenException('La inscripción está disponible para estudiantes');
    }
    const result = await this.serializable(async (tx) => {
      const mentorship = await tx.mentorship.findUnique({
        where: { slug },
        include: {
          mentors: { select: { userId: true } },
          _count: { select: { enrollments: true } },
        },
      });
      if (!mentorship) throw new NotFoundException('Mentoría no encontrada');
      if (!mentorship.isActive || (mentorship.endsAt && mentorship.endsAt < new Date())) {
        throw new BadRequestException('La mentoría no está disponible para inscripciones');
      }
      if (
        mentorship.mentorId === user.id
        || mentorship.mentors.some((mentor) => mentor.userId === user.id)
      ) {
        throw new BadRequestException('Un docente responsable no puede inscribirse como estudiante');
      }
      const existing = await tx.mentorshipEnrollment.findUnique({
        where: {
          mentorshipId_userId: {
            mentorshipId: mentorship.id,
            userId: user.id,
          },
        },
      });
      if (existing) {
        return {
          enrolled: true,
          alreadyEnrolled: true,
          mentorshipId: mentorship.id,
          mentorIds: mentorship.mentors.map((mentor) => mentor.userId),
        };
      }
      if (
        mentorship.capacity
        && mentorship._count.enrollments >= mentorship.capacity
      ) {
        throw new ForbiddenException('La mentoría alcanzó su capacidad máxima');
      }
      await tx.mentorshipEnrollment.create({
        data: { mentorshipId: mentorship.id, userId: user.id },
      });
      await this.audit.record(tx, {
        actor: user,
        action: 'MENTORSHIP_ENROLLED',
        entityType: 'MENTORSHIP',
        entityId: mentorship.id,
        before: { enrolled: false },
        after: { enrolled: true },
      });
      return {
        enrolled: true,
        alreadyEnrolled: false,
        mentorshipId: mentorship.id,
        mentorIds: mentorship.mentors.map((mentor) => mentor.userId),
      };
    });
    if (!result.alreadyEnrolled) {
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
        const mentorIds = [
          ...new Set([
            ...result.mentorIds,
            ...(mentorship.mentorId ? [mentorship.mentorId] : []),
          ]),
        ].filter((mentorId) => mentorId !== user.id);
        await Promise.all(mentorIds.map((mentorId) => this.notifications.send({
          userId: mentorId,
          type: 'MENTORSHIP_ENROLLMENT',
          title: 'Nueva inscripción en tu mentoría',
          body: `@${user.username} se inscribió en “${mentorship.title}”.`,
          href: `/mentorias/${mentorship.slug}`,
          dedupeKey: `mentorship-mentor-enrollment:${mentorship.id}:${user.id}:${mentorId}`,
        })));
      }
      await this.gamification.evaluateBadgesForUser(user.id);
    }
    return {
      enrolled: true,
      alreadyEnrolled: result.alreadyEnrolled,
    };
  }

  async cancelEnrollment(user: AuthUser, slug: string) {
    return this.prisma.$transaction(async (tx) => {
      const mentorship = await tx.mentorship.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!mentorship) throw new NotFoundException('Mentoría no encontrada');
      const enrollment = await tx.mentorshipEnrollment.findUnique({
        where: {
          mentorshipId_userId: {
            mentorshipId: mentorship.id,
            userId: user.id,
          },
        },
      });
      if (!enrollment) return { enrolled: false, alreadyCancelled: true };
      await tx.mentorshipEnrollment.delete({ where: { id: enrollment.id } });
      await this.audit.record(tx, {
        actor: user,
        action: 'MENTORSHIP_ENROLLMENT_CANCELLED',
        entityType: 'MENTORSHIP',
        entityId: mentorship.id,
        before: { enrolled: true },
        after: { enrolled: false },
      });
      return { enrolled: false, alreadyCancelled: false };
    });
  }

  async addGalleryImages(user: AuthUser, id: string, dto: MentorshipGalleryDto) {
    const imageIds = uniqueMentorshipIds(dto.imageIds, 'imágenes');
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id },
      include: {
        mentors: { select: { userId: true } },
        gallery: { select: { id: true } },
      },
    });
    if (!mentorship) throw new NotFoundException('Mentoría no encontrada');
    await this.assertCanManage(user, mentorship);
    if (mentorship.gallery.length + imageIds.length > MAX_GALLERY_IMAGES) {
      throw new BadRequestException(`La galería admite hasta ${MAX_GALLERY_IMAGES} imágenes`);
    }
    const existing = new Set(mentorship.gallery.map((entry) => entry.id));
    if (imageIds.some((imageId) => existing.has(imageId))) {
      throw new BadRequestException('Una imagen ya forma parte de la galería');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.storage.assertOwnedUnlinkedImages(tx, user.id, imageIds);
      const updated = await tx.mentorship.update({
        where: { id },
        data: {
          gallery: { connect: imageIds.map((imageId) => ({ id: imageId })) },
        },
        include: { gallery: MENTORSHIP_INCLUDE.gallery },
      });
      await this.audit.record(tx, {
        actor: user,
        action: 'MENTORSHIP_MEDIA_ADDED',
        entityType: 'MENTORSHIP',
        entityId: id,
        before: { galleryIds: mentorship.gallery.map((entry) => entry.id) },
        after: { galleryIds: updated.gallery.map((entry) => entry.id) },
      });
      return updated.gallery;
    });
  }

  async removeGalleryImage(user: AuthUser, id: string, imageId: string) {
    const mentorship = await this.prisma.mentorship.findUnique({
      where: { id },
      include: { mentors: { select: { userId: true } } },
    });
    if (!mentorship) throw new NotFoundException('Mentoría no encontrada');
    await this.assertCanManage(user, mentorship);
    const image = await this.prisma.mediaAsset.findFirst({
      where: { id: imageId, mentorshipId: id },
      select: { id: true, url: true, key: true, provider: true },
    });
    if (!image) throw new NotFoundException('Imagen no encontrada en esta mentoría');
    await this.prisma.$transaction(async (tx) => {
      if (mentorship.coverUrl === image.url) {
        await tx.mentorship.update({ where: { id }, data: { coverUrl: null } });
      }
      await tx.mediaAsset.delete({ where: { id: imageId } });
      await this.audit.record(tx, {
        actor: user,
        action: 'MENTORSHIP_MEDIA_REMOVED',
        entityType: 'MENTORSHIP',
        entityId: id,
        before: { imageId, url: image.url },
        after: null,
      });
    });
    await this.storage.removeStoredObject(image).catch(() => undefined);
    return { removed: true };
  }
}

@ApiTags('mentorships')
@Controller('mentorships')
export class MentorshipsController {
  constructor(private readonly mentorships: MentorshipsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Mentorías disponibles, filtradas y paginadas' })
  list(
    @Query() query: MentorshipListQueryDto,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.mentorships.list(query, user);
  }

  @Get('management')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mentorías que el actor puede gestionar' })
  managementList(
    @CurrentUser() user: AuthUser,
    @Query() query: MentorshipListQueryDto,
  ) {
    return this.mentorships.managementList(user, query);
  }

  @Get('management/:id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle editable con docentes, estudiantes y enlaces privados' })
  managementDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mentorships.managementDetail(user, id);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Detalle de mentoría con temario, responsables y galería' })
  detail(@Param('slug') slug: string, @CurrentUser() user: AuthUser | null) {
    return this.mentorships.detail(slug, user);
  }

  @Post(':slug/enroll')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inscribirse a una mentoría con cupo disponible' })
  enroll(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.mentorships.enroll(user, slug);
  }

  @Delete(':slug/enroll')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancelar mi inscripción a una mentoría' })
  cancelEnrollment(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.mentorships.cancelEnrollment(user, slug);
  }

  @Post()
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear una mentoría con al menos un docente responsable' })
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertMentorshipDto) {
    return this.mentorships.create(user, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar una mentoría autorizada' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMentorshipDto,
  ) {
    return this.mentorships.update(user, id, dto);
  }

  @Post(':id/gallery')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agregar imágenes optimizadas a la galería' })
  addGallery(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MentorshipGalleryDto,
  ) {
    return this.mentorships.addGalleryImages(user, id, dto);
  }

  @Delete(':id/gallery/:imageId')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirar una imagen de la galería' })
  removeGallery(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.mentorships.removeGalleryImage(user, id, imageId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desactivar una mentoría autorizada' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mentorships.deactivate(user, id);
  }
}

@Module({
  imports: [StorageModule],
  providers: [MentorshipsService],
  controllers: [MentorshipsController],
})
export class MentorshipsModule {}
