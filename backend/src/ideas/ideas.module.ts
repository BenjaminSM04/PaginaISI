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
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ApprovalDecision,
  CatalogKind,
  Prisma,
  PublicationStatus,
} from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import { AuditService } from '../audit/audit.service';
import { CatalogsService, normalizeCatalogValue } from '../catalogs/catalogs.module';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { clean, paginate } from '../common/utils';
import { NotificationsService } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule, StorageService } from '../storage/storage.module';

const WEB_URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};
const MAX_IDEA_MEMBERS = 20;
const MAX_IDEA_MEDIA = 8;

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

const IDEA_INCLUDE = {
  owner: { select: USER_PUBLIC_SELECT },
  reviewer: { select: USER_PUBLIC_SELECT },
  members: {
    orderBy: { user: { username: 'asc' as const } },
    include: { user: { select: USER_PUBLIC_SELECT } },
  },
  media: {
    orderBy: { createdAt: 'asc' as const },
    take: MAX_IDEA_MEDIA,
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

function normalizedUniqueIds(values: string[] = [], label = 'usuarios') {
  const trimmed = values.map((value) => value.trim()).filter(Boolean);
  const unique = [...new Set(trimmed)];
  if (unique.length !== trimmed.length) {
    throw new BadRequestException(`No repitas ${label}`);
  }
  return unique;
}

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
  const visibleText = plainText(result);
  if (visibleText.length < minimum) {
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

export function normalizeIdeaTechnologies(values: string[] = []) {
  const unique = new Map<string, string>();
  for (const rawValue of values) {
    const value = normalizeCatalogValue(rawValue);
    if (!value.name) continue;
    if (value.name.length > 80) {
      throw new BadRequestException('Cada tecnología o área admite hasta 80 caracteres');
    }
    if (!unique.has(value.normalizedName)) unique.set(value.normalizedName, value.name);
  }
  if (unique.size > 20) {
    throw new BadRequestException('Una idea admite hasta 20 tecnologías o áreas');
  }
  return [...unique.values()];
}

export interface RealClientFields {
  isRealClient: boolean;
  clientName?: string | null;
  clientContactName?: string | null;
  clientContact?: string | null;
  clientNeed?: string | null;
}

export function assertIdeaRealClientFields(value: RealClientFields) {
  if (!value.isRealClient) return;
  const missing: string[] = [];
  if (!value.clientName?.trim()) missing.push('nombre o razón social');
  if (!value.clientContactName?.trim()) missing.push('persona de contacto');
  if (!value.clientContact?.trim()) missing.push('medio de contacto');
  if (!value.clientNeed?.trim()) missing.push('necesidad planteada');
  if (missing.length) {
    throw new BadRequestException(`Completa los datos del cliente real: ${missing.join(', ')}`);
  }
}

export class CreateIdeaProposalDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(8_000)
  description: string;

  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(8_000)
  problem: string;

  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(8_000)
  proposedSolution: string;

  @ApiPropertyOptional({ type: [String], description: 'Tecnologías o áreas relacionadas' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  technologies?: string[];

  @ApiPropertyOptional({ type: [String], description: 'IDs del directorio privado de usuarios' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IDEA_MEMBERS)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  memberIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'IDs devueltos por POST /media/upload' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IDEA_MEDIA)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  mediaIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRealClient?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((object, value) => object.isRealClient || (value !== undefined && value !== null))
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  clientName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((object, value) => object.isRealClient || (value !== undefined && value !== null))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  clientContactName?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Correo, teléfono u otro medio proporcionado por el cliente' })
  @ValidateIf((object, value) => object.isRealClient || (value !== undefined && value !== null))
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  clientContact?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((object, value) => object.isRealClient || (value !== undefined && value !== null))
  @IsString()
  @MinLength(10)
  @MaxLength(4_000)
  clientNeed?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'URL del respaldo o autorización' })
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  clientAuthorizationUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'URL externa o URL obtenida al subir un archivo' })
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  attachmentUrl?: string | null;

  @ApiPropertyOptional({ description: 'ID de un docente revisor elegido mediante el directorio' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reviewerId?: string;
}

export class UpdateIdeaProposalDto extends PartialType(CreateIdeaProposalDto) {
  @ApiPropertyOptional({ description: 'Reenviar una propuesta observada o rechazada' })
  @IsOptional()
  @IsBoolean()
  resubmit?: boolean;
}

export class IdeaReviewDto {
  @ApiProperty({ enum: ApprovalDecision })
  @IsEnum(ApprovalDecision)
  decision: ApprovalDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  comment?: string;
}

export class IdeaListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  technology?: string;

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

function ideaAuditSnapshot(idea: any) {
  return {
    id: idea.id,
    title: idea.title,
    status: idea.status,
    ownerId: idea.ownerId,
    reviewerId: idea.reviewerId,
    isRealClient: idea.isRealClient,
    technologies: idea.technologies,
    memberIds: idea.members?.map((member: any) => member.userId ?? member.user?.id) ?? [],
    mediaIds: idea.media?.map((asset: any) => asset.id) ?? [],
    attachmentUrl: idea.attachmentUrl,
    decidedAt: idea.decidedAt,
  };
}

@Injectable()
export class IdeasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly catalogs: CatalogsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async canonicalTechnology(rawTechnology?: string) {
    if (!rawTechnology?.trim()) return undefined;
    const normalized = normalizeCatalogValue(rawTechnology);
    const existing = await this.prisma.catalogValue.findUnique({
      where: {
        kind_normalizedName: {
          kind: CatalogKind.TECHNOLOGY,
          normalizedName: normalized.normalizedName,
        },
      },
      select: { name: true },
    });
    return existing?.name ?? normalized.name;
  }

  async list(query: IdeaListQueryDto) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 12);
    const q = query.q?.trim().slice(0, 120);
    const technology = await this.canonicalTechnology(query.technology);
    const where: Prisma.IdeaProposalWhereInput = {
      status: PublicationStatus.APPROVED,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { problem: { contains: q, mode: 'insensitive' } },
              { proposedSolution: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(technology ? { technologies: { has: technology } } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.ideaProposal.count({ where }),
      this.prisma.ideaProposal.findMany({
        where,
        orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: IDEA_INCLUDE,
      }),
    ]);
    return {
      items: items.map((item) => this.serialize(item, false)),
      total,
      page,
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async mine(user: AuthUser, query: IdeaListQueryDto) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const q = query.q?.trim().slice(0, 120);
    const where: Prisma.IdeaProposalWhereInput = {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
      ...(q
        ? {
            AND: [{
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.ideaProposal.count({ where }),
      this.prisma.ideaProposal.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: IDEA_INCLUDE,
      }),
    ]);
    return {
      items: items.map((item) => this.serialize(item, true)),
      total,
      page,
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async pending(user: AuthUser, query: IdeaListQueryDto) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const q = query.q?.trim().slice(0, 120);
    const where: Prisma.IdeaProposalWhereInput = {
      status: PublicationStatus.PENDING,
      ...(!user.roles.includes('ADMIN')
        ? { OR: [{ reviewerId: user.id }, { reviewerId: null }] }
        : {}),
      ...(q
        ? {
            AND: [{
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { owner: { username: { contains: q, mode: 'insensitive' } } },
                { owner: { profile: { fullName: { contains: q, mode: 'insensitive' } } } },
              ],
            }],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.ideaProposal.count({ where }),
      this.prisma.ideaProposal.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
        include: IDEA_INCLUDE,
      }),
    ]);
    return {
      items: items.map((item) => this.serialize(item, true)),
      total,
      page,
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async detail(id: string, viewer?: AuthUser | null) {
    const idea = await this.prisma.ideaProposal.findUnique({
      where: { id },
      include: IDEA_INCLUDE,
    });
    if (!idea || idea.status === PublicationStatus.ARCHIVED) {
      throw new NotFoundException('Idea no encontrada');
    }
    const isMember = !!viewer && idea.members.some((member) => member.userId === viewer.id);
    const isUnassignedReviewer = !!viewer
      && viewer.roles.includes('TEACHER')
      && idea.status === PublicationStatus.PENDING
      && !idea.reviewerId;
    const privileged = !!viewer && (
      viewer.roles.includes('ADMIN')
      || idea.ownerId === viewer.id
      || idea.reviewerId === viewer.id
      || isMember
      || isUnassignedReviewer
    );
    if (idea.status !== PublicationStatus.APPROVED && !privileged) {
      throw new NotFoundException('Idea no encontrada');
    }
    return this.serialize(idea, privileged);
  }

  private serialize(idea: any, privileged: boolean) {
    const result = {
      ...idea,
      owner: idea.owner ? this.serializeUser(idea.owner) : undefined,
      reviewer: idea.reviewer ? this.serializeUser(idea.reviewer) : null,
      members: idea.members?.map((member: any) => ({
        ...member,
        user: this.serializeUser(member.user),
      })) ?? [],
    };
    if (privileged) return result;
    return {
      ...result,
      clientContactName: null,
      clientContact: null,
      clientAuthorizationUrl: null,
      reviewComment: null,
    };
  }

  private serializeUser(user: any) {
    return {
      ...user,
      roles: user.roles?.map((entry: any) => entry.role?.name ?? entry) ?? [],
    };
  }

  private async resolveReviewerId(id?: string) {
    if (!id) return undefined;
    const reviewer = await this.prisma.user.findFirst({
      where: {
        id,
        isActive: true,
        emailVerifiedAt: { not: null },
        roles: {
          some: {
            role: {
              name: { in: ['TEACHER', 'ADMIN'] },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!reviewer) {
      throw new BadRequestException('El revisor debe ser un docente o administrador activo');
    }
    return reviewer.id;
  }

  private async resolveMembers(
    tx: Prisma.TransactionClient,
    ownerId: string,
    rawMemberIds: string[] = [],
  ) {
    const memberIds = normalizedUniqueIds(rawMemberIds, 'integrantes');
    if (memberIds.includes(ownerId)) {
      throw new BadRequestException('El postulante ya es propietario y no debe repetirse como integrante');
    }
    if (!memberIds.length) return [];
    const users = await tx.user.findMany({
      where: {
        id: { in: memberIds },
        isActive: true,
        emailVerifiedAt: { not: null },
      },
      select: { id: true },
    });
    const found = new Set(users.map((entry) => entry.id));
    const missing = memberIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw new BadRequestException('Uno o más integrantes no existen o no están activos');
    }
    return memberIds;
  }

  private normalizedClientFields(
    input: Partial<CreateIdeaProposalDto>,
    current?: {
      isRealClient: boolean;
      clientName: string | null;
      clientContactName: string | null;
      clientContact: string | null;
      clientNeed: string | null;
      clientAuthorizationUrl: string | null;
    },
  ) {
    const isRealClient = input.isRealClient ?? current?.isRealClient ?? false;
    const fields = {
      isRealClient,
      clientName: optionalPlainText(
        input.clientName !== undefined ? input.clientName : current?.clientName,
        180,
      ) ?? null,
      clientContactName: optionalPlainText(
        input.clientContactName !== undefined ? input.clientContactName : current?.clientContactName,
        160,
      ) ?? null,
      clientContact: optionalPlainText(
        input.clientContact !== undefined ? input.clientContact : current?.clientContact,
        180,
      ) ?? null,
      clientNeed: input.clientNeed !== undefined
        ? (input.clientNeed === null ? null : requiredRichText(input.clientNeed, 'La necesidad del cliente', 10, 4_000))
        : current?.clientNeed ?? null,
      clientAuthorizationUrl: input.clientAuthorizationUrl !== undefined
        ? input.clientAuthorizationUrl?.trim() || null
        : current?.clientAuthorizationUrl ?? null,
    };
    assertIdeaRealClientFields(fields);
    if (!isRealClient) {
      return {
        isRealClient: false,
        clientName: null,
        clientContactName: null,
        clientContact: null,
        clientNeed: null,
        clientAuthorizationUrl: null,
      };
    }
    return fields;
  }

  async create(user: AuthUser, dto: CreateIdeaProposalDto) {
    const title = requiredPlainText(dto.title, 'El título', 5, 160);
    const description = requiredRichText(dto.description, 'La descripción', 20, 8_000);
    const problem = requiredRichText(dto.problem, 'El problema', 20, 8_000);
    const proposedSolution = requiredRichText(dto.proposedSolution, 'La solución propuesta', 20, 8_000);
    const technologies = normalizeIdeaTechnologies(dto.technologies);
    const mediaIds = normalizedUniqueIds(dto.mediaIds, 'archivos');
    const reviewerId = await this.resolveReviewerId(dto.reviewerId);
    const client = this.normalizedClientFields(dto);

    const ideaId = await this.prisma.$transaction(async (tx) => {
      const memberIds = await this.resolveMembers(tx, user.id, dto.memberIds);
      const assets = await this.storage.assertOwnedUnlinkedAssets(tx, user.id, mediaIds);
      const canonicalTechnologies = (
        await this.catalogs.upsertMany(CatalogKind.TECHNOLOGY, technologies, tx)
      ).map((entry) => entry.name);
      const idea = await tx.ideaProposal.create({
        data: {
          title,
          description,
          problem,
          proposedSolution,
          technologies: canonicalTechnologies,
          ...client,
          attachmentUrl: dto.attachmentUrl?.trim() || assets[0]?.url || null,
          status: PublicationStatus.PENDING,
          ownerId: user.id,
          reviewerId,
          members: memberIds.length
            ? { create: memberIds.map((userId) => ({ userId })) }
            : undefined,
          media: mediaIds.length
            ? { connect: mediaIds.map((id) => ({ id })) }
            : undefined,
        },
        include: {
          members: { select: { userId: true } },
          media: { select: { id: true } },
        },
      });
      await this.audit.record(tx, {
        actor: user,
        action: 'IDEA_SUBMITTED',
        entityType: 'IDEA_PROPOSAL',
        entityId: idea.id,
        before: null,
        after: ideaAuditSnapshot(idea),
      });
      return idea.id;
    });
    return this.detail(ideaId, user);
  }

  async update(user: AuthUser, id: string, dto: UpdateIdeaProposalDto) {
    const existing = await this.prisma.ideaProposal.findUnique({
      where: { id },
      include: {
        members: { select: { userId: true } },
        media: { select: { id: true, url: true } },
      },
    });
    if (!existing || existing.status === PublicationStatus.ARCHIVED) {
      throw new NotFoundException('Idea no encontrada');
    }
    const isAdmin = user.roles.includes('ADMIN');
    if (existing.ownerId !== user.id && !isAdmin) {
      throw new ForbiddenException('Solo el postulante puede editar esta idea');
    }
    if (!isAdmin && existing.status === PublicationStatus.APPROVED) {
      throw new BadRequestException('Una idea aprobada no puede modificarse desde la postulación');
    }
    if (
      dto.resubmit
      && existing.status !== PublicationStatus.OBSERVED
      && existing.status !== PublicationStatus.REJECTED
    ) {
      throw new BadRequestException('Solo se puede reenviar una idea observada o rechazada');
    }

    const reviewerId = dto.reviewerId !== undefined
      ? await this.resolveReviewerId(dto.reviewerId)
      : existing.reviewerId;
    const mediaIds = normalizedUniqueIds(dto.mediaIds, 'archivos');
    const existingMediaIds = new Set(existing.media.map((asset) => asset.id));
    if (mediaIds.some((mediaId) => existingMediaIds.has(mediaId))) {
      throw new BadRequestException('Uno de los archivos ya está vinculado a la idea');
    }
    const client = this.normalizedClientFields(dto, existing);

    await this.prisma.$transaction(async (tx) => {
      const memberIds = dto.memberIds !== undefined
        ? await this.resolveMembers(tx, existing.ownerId, dto.memberIds)
        : undefined;
      const assets = await this.storage.assertOwnedUnlinkedAssets(tx, user.id, mediaIds);
      let technologies: string[] | undefined;
      if (dto.technologies !== undefined) {
        const normalized = normalizeIdeaTechnologies(dto.technologies);
        technologies = (
          await this.catalogs.upsertMany(CatalogKind.TECHNOLOGY, normalized, tx)
        ).map((entry) => entry.name);
      }

      if (memberIds) {
        await tx.ideaMember.deleteMany({ where: { ideaId: id } });
        if (memberIds.length) {
          await tx.ideaMember.createMany({
            data: memberIds.map((userId) => ({ ideaId: id, userId })),
          });
        }
      }
      const updated = await tx.ideaProposal.update({
        where: { id },
        data: {
          title: dto.title === undefined
            ? undefined
            : requiredPlainText(dto.title, 'El título', 5, 160),
          description: dto.description === undefined
            ? undefined
            : requiredRichText(dto.description, 'La descripción', 20, 8_000),
          problem: dto.problem === undefined
            ? undefined
            : requiredRichText(dto.problem, 'El problema', 20, 8_000),
          proposedSolution: dto.proposedSolution === undefined
            ? undefined
            : requiredRichText(dto.proposedSolution, 'La solución propuesta', 20, 8_000),
          technologies,
          ...client,
          reviewerId,
          attachmentUrl: dto.attachmentUrl !== undefined
            ? dto.attachmentUrl?.trim() || null
            : (existing.attachmentUrl ?? assets[0]?.url ?? null),
          status: dto.resubmit ? PublicationStatus.PENDING : undefined,
          reviewComment: dto.resubmit ? null : undefined,
          decidedAt: dto.resubmit ? null : undefined,
          media: mediaIds.length
            ? { connect: mediaIds.map((mediaId) => ({ id: mediaId })) }
            : undefined,
        },
        include: {
          members: { select: { userId: true } },
          media: { select: { id: true } },
        },
      });
      await this.audit.record(tx, {
        actor: user,
        action: dto.resubmit ? 'IDEA_RESUBMITTED' : 'IDEA_UPDATED',
        entityType: 'IDEA_PROPOSAL',
        entityId: id,
        before: ideaAuditSnapshot(existing),
        after: ideaAuditSnapshot(updated),
      });
    });
    return this.detail(id, user);
  }

  async review(reviewer: AuthUser, id: string, dto: IdeaReviewDto) {
    const idea = await this.prisma.ideaProposal.findUnique({
      where: { id },
      include: {
        members: { select: { userId: true } },
        media: { select: { id: true } },
      },
    });
    if (!idea || idea.status === PublicationStatus.ARCHIVED) {
      throw new NotFoundException('Idea no encontrada');
    }
    if (idea.status !== PublicationStatus.PENDING) {
      throw new BadRequestException('La idea no está pendiente de revisión');
    }
    if (idea.ownerId === reviewer.id) {
      throw new ForbiddenException('No puedes revisar tu propia postulación');
    }
    if (!reviewer.roles.includes('ADMIN') && idea.reviewerId && idea.reviewerId !== reviewer.id) {
      throw new ForbiddenException('La idea está asignada a otro docente revisor');
    }
    const comment = dto.comment ? plainText(dto.comment).slice(0, 1_000) : null;
    if (dto.decision !== ApprovalDecision.APPROVED && !comment) {
      throw new BadRequestException('Debes explicar por qué observas o rechazas la idea');
    }
    const status: Record<ApprovalDecision, PublicationStatus> = {
      APPROVED: PublicationStatus.APPROVED,
      OBSERVED: PublicationStatus.OBSERVED,
      REJECTED: PublicationStatus.REJECTED,
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ideaProposal.update({
        where: { id },
        data: {
          status: status[dto.decision],
          reviewerId: reviewer.id,
          reviewComment: comment,
          decidedAt: new Date(),
        },
        include: {
          members: { select: { userId: true } },
          media: { select: { id: true } },
        },
      });
      await this.audit.record(tx, {
        actor: reviewer,
        action: `IDEA_${dto.decision}`,
        entityType: 'IDEA_PROPOSAL',
        entityId: id,
        before: ideaAuditSnapshot(idea),
        after: ideaAuditSnapshot(result),
        metadata: comment ? { comment } : undefined,
      });
      return result;
    });
    const decisionLabel = dto.decision === ApprovalDecision.APPROVED
      ? 'aprobada'
      : dto.decision === ApprovalDecision.OBSERVED
        ? 'observada'
        : 'rechazada';
    await this.notifications.send({
      userId: idea.ownerId,
      type: 'CONTENT_REVIEW',
      title: `Tu idea fue ${decisionLabel}`,
      body: comment || `La revisión de “${idea.title}” ya está disponible.`,
      href: '/incubadora/mis-ideas',
      dedupeKey: `idea-review:${id}:${updated.decidedAt?.toISOString()}`,
    });
    return this.detail(id, reviewer);
  }

  async archive(user: AuthUser, id: string) {
    const idea = await this.prisma.ideaProposal.findUnique({
      where: { id },
      include: {
        members: { select: { userId: true } },
        media: { select: { id: true } },
      },
    });
    if (!idea || idea.status === PublicationStatus.ARCHIVED) {
      throw new NotFoundException('Idea no encontrada');
    }
    if (idea.ownerId !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('No puedes retirar esta idea');
    }
    if (idea.status === PublicationStatus.APPROVED && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Solo un administrador puede archivar una idea aprobada');
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ideaProposal.update({
        where: { id },
        data: { status: PublicationStatus.ARCHIVED },
        include: {
          members: { select: { userId: true } },
          media: { select: { id: true } },
        },
      });
      await this.audit.record(tx, {
        actor: user,
        action: 'IDEA_ARCHIVED',
        entityType: 'IDEA_PROPOSAL',
        entityId: id,
        before: ideaAuditSnapshot(idea),
        after: ideaAuditSnapshot(updated),
      });
    });
    return { archived: true };
  }

  async removeMedia(user: AuthUser, ideaId: string, mediaId: string) {
    const idea = await this.prisma.ideaProposal.findUnique({
      where: { id: ideaId },
      select: { id: true, ownerId: true, status: true, attachmentUrl: true },
    });
    if (!idea || idea.status === PublicationStatus.ARCHIVED) {
      throw new NotFoundException('Idea no encontrada');
    }
    if (idea.ownerId !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('No puedes editar los archivos de esta idea');
    }
    if (idea.status === PublicationStatus.APPROVED && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('No puedes modificar una idea aprobada');
    }
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, ideaProposalId: ideaId },
      select: { id: true, url: true, key: true, provider: true },
    });
    if (!asset) throw new NotFoundException('Archivo no encontrado en esta idea');
    await this.prisma.$transaction(async (tx) => {
      if (idea.attachmentUrl === asset.url) {
        await tx.ideaProposal.update({
          where: { id: ideaId },
          data: { attachmentUrl: null },
        });
      }
      await tx.mediaAsset.delete({ where: { id: mediaId } });
      await this.audit.record(tx, {
        actor: user,
        action: 'IDEA_MEDIA_REMOVED',
        entityType: 'IDEA_PROPOSAL',
        entityId: ideaId,
        before: { mediaId, url: asset.url },
        after: null,
      });
    });
    await this.storage.removeStoredObject(asset).catch(() => undefined);
    return { removed: true };
  }
}

@ApiTags('ideas')
@Controller('ideas')
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Ideas aprobadas, públicas y paginadas' })
  list(@Query() query: IdeaListQueryDto) {
    return this.ideas.list(query);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ideas propias o donde participo, en todos sus estados' })
  mine(@CurrentUser() user: AuthUser, @Query() query: IdeaListQueryDto) {
    return this.ideas.mine(user, query);
  }

  @Get('review/pending')
  @Roles('TEACHER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Docente/Admin] Ideas pendientes de revisión' })
  pending(@CurrentUser() user: AuthUser, @Query() query: IdeaListQueryDto) {
    return this.ideas.pending(user, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Detalle público aprobado o detalle privado autorizado' })
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    return this.ideas.detail(id, user);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Postular una idea para revisión' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIdeaProposalDto) {
    return this.ideas.create(user, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar o reenviar una postulación propia' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIdeaProposalDto,
  ) {
    return this.ideas.update(user, id, dto);
  }

  @Post(':id/review')
  @Roles('TEACHER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Docente/Admin] Aprobar, observar o rechazar una idea' })
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: IdeaReviewDto,
  ) {
    return this.ideas.review(user, id, dto);
  }

  @Delete(':id/media/:mediaId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirar un archivo vinculado a una postulación editable' })
  removeMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.ideas.removeMedia(user, id, mediaId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirar una idea; las aprobadas requieren administración' })
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ideas.archive(user, id);
  }
}

@Module({
  imports: [StorageModule],
  providers: [IdeasService],
  controllers: [IdeasController],
})
export class IdeasModule {}
