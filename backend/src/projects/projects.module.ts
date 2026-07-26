import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApprovalDecision, NewsCategory, Prisma, ProjectMilestoneStatus, ProjectStage, PublicationStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { CurrentUser, Public, Roles, AuthUser } from '../common/decorators';
import { clean, paginate, uniqueSlug } from '../common/utils';
import { NotificationsService } from '../notifications/notifications.module';
import {
  ProjectAuditService,
  projectAuditRequestContext,
  projectAuditSnapshot,
  projectAuditSnapshotsEqual,
  ProjectAuditRequestContext,
} from '../project-collaboration/project-audit.service';
import { ProjectAccessService } from '../project-collaboration/project-access.service';
import { IncubatorClientsModule, IncubatorClientsService } from '../incubator-clients/incubator-clients.module';

const WEB_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class ListProjectsQueryDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) tech?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) community?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  semester?: number;
  @ApiPropertyOptional({ enum: ProjectStage }) @IsOptional() @IsEnum(ProjectStage) stage?: ProjectStage;
  @ApiPropertyOptional({ enum: ['true', 'false'] }) @IsOptional() @IsIn(['true', 'false']) incubator?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] }) @IsOptional() @IsIn(['true', 'false']) featured?: string;
}

export class CreateProjectDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(140) title: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(300) summary: string;
  @ApiProperty() @IsString() @MinLength(30) description: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) coverUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) videoUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) repoUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) demoUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(80) subject?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(8) semester?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(80) phase?: string | null;
  @ApiPropertyOptional({ enum: ProjectStage }) @IsOptional() @IsEnum(ProjectStage) stage?: ProjectStage;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Tecnologías usadas' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(50, { each: true }) technologies?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Usernames de los integrantes' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) memberUsernames?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Clientes empresariales registrados para un proyecto de Incubadora' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  clientIds?: string[];
  @ApiPropertyOptional({ description: 'Username del docente revisor' }) @IsOptional() @IsString() @MaxLength(30) reviewerUsername?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(80) communitySlug?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isIncubator?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recruiting?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() startedAt?: string | null;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @ApiPropertyOptional({ description: 'true para reenviar a revisión tras corregir observaciones' })
  @IsOptional()
  @IsBoolean()
  resubmit?: boolean;

  @ApiProperty({ description: 'Versión leída por el cliente; evita sobrescribir una edición más reciente' })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiPropertyOptional({ description: 'Solo ADMIN' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ enum: PublicationStatus, description: 'Solo ADMIN; usar review para el flujo editorial normal' })
  @IsOptional()
  @IsEnum(PublicationStatus)
  status?: PublicationStatus;
}

export class ReviewDto {
  @ApiProperty({ enum: ApprovalDecision }) @IsEnum(ApprovalDecision) decision: ApprovalDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) comment?: string;
  @ApiProperty() @IsInt() @Min(1) expectedVersion: number;
}

export class CommentDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(600) body: string;
}

export class CreateProjectMilestoneDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(140) title: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2_000) description?: string | null;
  @ApiProperty() @IsDateString() startsAt: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allDay?: boolean;
  @ApiPropertyOptional({ enum: ProjectMilestoneStatus }) @IsOptional() @IsEnum(ProjectMilestoneStatus) status?: ProjectMilestoneStatus;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) location?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) url?: string | null;
  @ApiProperty({ description: 'Versión del proyecto leída por el cliente' }) @IsInt() @Min(1) expectedVersion: number;
}

export class UpdateProjectMilestoneDto extends PartialType(OmitType(CreateProjectMilestoneDto, ['expectedVersion'] as const)) {
  @ApiProperty({ description: 'Versión del proyecto leída por el cliente' }) @IsInt() @Min(1) expectedVersion: number;
}

export class AttachProjectMediaDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(64) mediaId: string;
  @ApiProperty() @IsInt() @Min(1) expectedVersion: number;
}

export class ExpectedProjectVersionDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion: number;
}

export class RollbackProjectAuditDto extends ExpectedProjectVersionDto {
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(300) reason: string;
}

function assertMilestoneDates(startsAt: Date, endsAt?: Date | null) {
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) {
    throw new BadRequestException('Las fechas del hito no son válidas');
  }
  if (endsAt && endsAt < startsAt) {
    throw new BadRequestException('La fecha de fin no puede ser anterior al inicio');
  }
}

export const PUBLIC_INCLUDE = {
  owner: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
  reviewer: { select: { username: true, profile: { select: { fullName: true } } } },
  community: { select: { slug: true, name: true, accentColor: true } },
  technologies: true,
  members: { include: { user: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } } } },
  clients: {
    select: { id: true, name: true, logoUrl: true },
    orderBy: { name: 'asc' as const },
  },
} as const;

const PENDING_VERSION_INCLUDE = {
  requester: { select: { id: true, username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
  reviewer: { select: { id: true, username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
} as const;

export const MANAGE_INCLUDE = {
  ...PUBLIC_INCLUDE,
  clients: {
    select: { id: true, name: true, logoUrl: true, isActive: true },
    orderBy: { name: 'asc' as const },
  },
  pendingVersion: { include: PENDING_VERSION_INCLUDE },
  gallery: { where: { archivedAt: null }, orderBy: { createdAt: 'asc' as const } },
  milestones: { orderBy: [{ startsAt: 'asc' as const }, { createdAt: 'asc' as const }] },
} satisfies Prisma.ProjectInclude;

const MINE_INCLUDE = {
  ...PUBLIC_INCLUDE,
  clients: {
    select: { id: true, name: true, logoUrl: true, isActive: true },
    orderBy: { name: 'asc' as const },
  },
  pendingVersion: { include: PENDING_VERSION_INCLUDE },
} satisfies Prisma.ProjectInclude;

export const PROJECT_AUDIT_ACTIONS = {
  created: 'PROJECT_CREATED',
  updated: 'PROJECT_UPDATED',
  archived: 'PROJECT_ARCHIVED',
  reviewed: 'PROJECT_REVIEWED',
  versionSubmitted: 'PROJECT_VERSION_SUBMITTED',
  versionObserved: 'PROJECT_VERSION_OBSERVED',
  versionRejected: 'PROJECT_VERSION_REJECTED',
  versionPublished: 'PROJECT_VERSION_PUBLISHED',
  membersUpdated: 'MEMBERS_UPDATED',
  milestoneCreated: 'MILESTONE_CREATED',
  milestoneUpdated: 'MILESTONE_UPDATED',
  milestoneDeleted: 'MILESTONE_DELETED',
  galleryAttached: 'GALLERY_ATTACHED',
  galleryArchived: 'GALLERY_ARCHIVED',
  mediaUploaded: 'MEDIA_UPLOADED',
  newsCreated: 'NEWS_CREATED',
  newsUpdated: 'NEWS_UPDATED',
  newsArchived: 'NEWS_ARCHIVED',
  rollback: 'ROLLBACK',
} as const;

const ROLLBACKABLE_PROJECT_ACTIONS = new Set<string>([
  PROJECT_AUDIT_ACTIONS.updated,
  PROJECT_AUDIT_ACTIONS.archived,
  PROJECT_AUDIT_ACTIONS.membersUpdated,
  PROJECT_AUDIT_ACTIONS.milestoneCreated,
  PROJECT_AUDIT_ACTIONS.milestoneUpdated,
  PROJECT_AUDIT_ACTIONS.milestoneDeleted,
  PROJECT_AUDIT_ACTIONS.galleryAttached,
  PROJECT_AUDIT_ACTIONS.galleryArchived,
  PROJECT_AUDIT_ACTIONS.mediaUploaded,
  PROJECT_AUDIT_ACTIONS.newsCreated,
  PROJECT_AUDIT_ACTIONS.newsUpdated,
  PROJECT_AUDIT_ACTIONS.newsArchived,
]);

export function normalizeProjectValue(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function normalizeProjectValueKey(value: string) {
  return normalizeProjectValue(value).toLocaleLowerCase('es');
}

export function normalizeProjectTags(values: string[] = []) {
  return [...new Set(values.map(normalizeProjectValueKey).filter(Boolean))];
}

export function normalizeProjectTechnologies(values: string[] = []) {
  const byKey = new Map<string, string>();
  for (const raw of values) {
    const name = normalizeProjectValue(raw);
    const key = normalizeProjectValueKey(raw);
    if (name && !byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.entries()].map(([normalizedName, name]) => ({ name, normalizedName }));
}

function projectClientIds(clients: any[] = []) {
  return [...new Set(clients
    .filter((client) => client && typeof client.id === 'string')
    .map((client) => client.id as string))]
    .sort((left, right) => left.localeCompare(right));
}

function projectWithClientIds(project: any) {
  return { ...project, clientIds: projectClientIds(project.clients ?? []) };
}

export function canonicalProjectSnapshotClientRelation(snapshot: Record<string, any>) {
  const clients = Array.isArray(snapshot.clients) ? snapshot.clients : [];
  const clientIds = Array.isArray(snapshot.clientIds)
    ? [...new Set(snapshot.clientIds.filter((id: unknown): id is string => typeof id === 'string'))]
    : projectClientIds(clients);
  clientIds.sort((left, right) => left.localeCompare(right));
  return {
    ...snapshot,
    // La metadata pertenece al cliente global y puede cambiar sin editar el
    // proyecto. Para concurrencia/rollback la relación se compara solo por IDs.
    clients: [],
    clientIds,
  };
}

export function editableProjectSnapshot(project: any) {
  return {
    title: project.title,
    summary: project.summary,
    description: project.description,
    coverUrl: project.coverUrl,
    videoUrl: project.videoUrl,
    repoUrl: project.repoUrl,
    demoUrl: project.demoUrl,
    subject: project.subject,
    semester: project.semester,
    phase: project.phase,
    status: project.status,
    stage: project.stage,
    isFeatured: project.isFeatured,
    isIncubator: project.isIncubator,
    recruiting: project.recruiting,
    tags: [...(project.tags ?? [])],
    startedAt: project.startedAt ? new Date(project.startedAt).toISOString() : null,
    publishedAt: project.publishedAt ? new Date(project.publishedAt).toISOString() : null,
    reviewerId: project.reviewerId,
    communityId: project.communityId,
    technologies: [...(project.technologies ?? [])]
      .map((technology: any) => technology.name)
      .sort((left: string, right: string) => left.localeCompare(right)),
    clients: [...(project.clients ?? [])]
      .map((client: any) => ({
        id: client.id,
        name: client.name,
        logoUrl: client.logoUrl,
        isActive: client.isActive ?? true,
      }))
      .sort((left: any, right: any) => left.id.localeCompare(right.id)),
    clientIds: projectClientIds(project.clients ?? []),
  };
}

function projectMembersSnapshot(members: any[]) {
  return [...members]
    .map((member) => ({
      userId: member.userId,
      username: member.user?.username ?? null,
      roleInProject: member.roleInProject ?? null,
    }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

function canonicalProjectMembers(members: any[]) {
  return [...members]
    .map((member) => ({ userId: member.userId, roleInProject: member.roleInProject ?? null }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

export function projectVersionSnapshot(project: any) {
  const editable = editableProjectSnapshot(project);
  const {
    status: _status,
    publishedAt: _publishedAt,
    technologies,
    ...content
  } = editable;
  return {
    ...content,
    technologies,
    members: projectMembersSnapshot(project.members ?? []),
  };
}

function versionSnapshot(value: Prisma.JsonValue | Prisma.InputJsonValue) {
  return auditObject(value as Prisma.JsonValue, 'de versión');
}

export function projectWithVersion(project: any, version: any | null) {
  if (!version) return projectWithClientIds(project);
  const snapshot = versionSnapshot(version.snapshot);
  const currentUsers = new Map(
    (project.members ?? []).map((member: any) => [member.userId, member.user]),
  );
  const members = Array.isArray(snapshot.members)
    ? snapshot.members.map((member: any) => ({
        id: `version:${member.userId}`,
        projectId: project.id,
        userId: member.userId,
        roleInProject: member.roleInProject ?? null,
        user: currentUsers.get(member.userId) ?? {
          username: member.username ?? 'usuario',
          profile: { fullName: member.fullName ?? member.username ?? 'Usuario', avatarUrl: null },
        },
      }))
    : project.members;
  const technologies = Array.isArray(snapshot.technologies)
    ? snapshot.technologies.map((technology: unknown, index: number) => ({
        id: `version:${index}`,
        projectId: project.id,
        name: String(technology),
        normalizedName: normalizeProjectValueKey(String(technology)),
      }))
    : project.technologies;
  const clients = Array.isArray(snapshot.clients)
    ? snapshot.clients
        .filter((client: any) => client && typeof client.id === 'string')
        .map((client: any) => ({
          id: client.id,
          name: String(client.name ?? ''),
          logoUrl: String(client.logoUrl ?? ''),
          isActive: client.isActive !== false,
        }))
    : project.clients;
  const clientIds = Array.isArray(snapshot.clientIds)
    ? [...new Set(snapshot.clientIds.filter((id: unknown): id is string => typeof id === 'string'))]
    : projectClientIds(clients ?? []);
  const scalar = {
    title: snapshot.title,
    summary: snapshot.summary,
    description: snapshot.description,
    coverUrl: snapshot.coverUrl ?? null,
    videoUrl: snapshot.videoUrl ?? null,
    repoUrl: snapshot.repoUrl ?? null,
    demoUrl: snapshot.demoUrl ?? null,
    subject: snapshot.subject ?? null,
    semester: snapshot.semester ?? null,
    phase: snapshot.phase ?? null,
    stage: snapshot.stage,
    isFeatured: Boolean(snapshot.isFeatured),
    isIncubator: Boolean(snapshot.isIncubator),
    recruiting: Boolean(snapshot.recruiting),
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    startedAt: snapshot.startedAt ?? null,
  };
  return {
    ...project,
    ...scalar,
    technologies,
    members,
    clients,
    clientIds,
    reviewer: version.reviewer ?? project.reviewer,
    reviewerId: snapshot.reviewerId ?? null,
    communityId: snapshot.communityId ?? null,
    publicStatus: project.status,
    status: version.status,
    pendingVersion: {
      id: version.id,
      number: version.number,
      status: version.status,
      submittedAt: version.submittedAt,
      decidedAt: version.decidedAt,
      reviewComment: version.reviewComment,
      requester: version.requester,
      reviewer: version.reviewer,
    },
  };
}

function projectMilestoneSnapshot(milestone: any) {
  return {
    id: milestone.id,
    projectId: milestone.projectId,
    title: milestone.title,
    description: milestone.description,
    startsAt: new Date(milestone.startsAt).toISOString(),
    endsAt: milestone.endsAt ? new Date(milestone.endsAt).toISOString() : null,
    allDay: milestone.allDay,
    status: milestone.status,
    location: milestone.location,
    url: milestone.url,
  };
}

function projectGallerySnapshot(asset: any) {
  return {
    id: asset.id,
    projectId: asset.projectId,
    uploaderId: asset.uploaderId,
    url: asset.url,
    mime: asset.mime,
    archivedAt: asset.archivedAt ? new Date(asset.archivedAt).toISOString() : null,
  };
}

function projectNewsSnapshot(news: any) {
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

function auditObject(value: Prisma.JsonValue | null, label: string): Record<string, any> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ConflictException(`La entrada de auditoría no contiene un snapshot ${label} válido`);
  }
  return value as Record<string, any>;
}

function auditArray(value: Prisma.JsonValue | null, label: string): any[] {
  if (!Array.isArray(value)) {
    throw new ConflictException(`La entrada de auditoría no contiene un snapshot ${label} válido`);
  }
  return value;
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
    private notifications: NotificationsService,
    private audit: ProjectAuditService,
    private accessPolicy: ProjectAccessService,
    private incubatorClients: IncubatorClientsService,
  ) {}

  private async managedProject(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: MANAGE_INCLUDE });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    const access = this.accessPolicy.forProject(user, project);
    if (!access.isAdmin && !access.isOwner && !access.isMember) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return { project, access };
  }

  private async bumpVersion(
    tx: Prisma.TransactionClient,
    projectId: string,
    expectedVersion: number,
  ) {
    const bumped = await tx.project.updateMany({
      where: { id: projectId, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    if (bumped.count !== 1) {
      throw new ConflictException('El proyecto cambió mientras editabas. Recarga antes de guardar.');
    }
    return expectedVersion + 1;
  }

  private assertExpectedVersion(actual: number, expected?: number) {
    if (expected === undefined) {
      throw new BadRequestException('expectedVersion es obligatorio para evitar sobrescribir cambios recientes');
    }
    if (expected !== actual) {
      throw new ConflictException('La versión enviada ya no es la actual. Recarga el proyecto.');
    }
  }

  private assertAdmin(user: AuthUser) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException('Solo un administrador puede realizar esta acción');
  }

  private async registerCatalogValues(
    tx: Prisma.TransactionClient,
    tags: string[],
    technologies: Array<{ name: string; normalizedName: string }>,
    subject?: string | null,
  ) {
    const values = [
      ...tags.map((name) => ({ kind: 'TAG' as const, name, normalizedName: normalizeProjectValueKey(name) })),
      ...technologies.map((technology) => ({ kind: 'TECHNOLOGY' as const, ...technology })),
      ...(subject?.trim()
        ? [{ kind: 'SUBJECT' as const, name: normalizeProjectValue(subject), normalizedName: normalizeProjectValueKey(subject) }]
        : []),
    ];
    for (const value of values) {
      await tx.catalogValue.upsert({
        where: { kind_normalizedName: { kind: value.kind, normalizedName: value.normalizedName } },
        create: value,
        update: {},
      });
    }
  }

  private buildVersionCandidate(
    project: any,
    dto: UpdateProjectDto,
    normalizedTags: string[] | undefined,
    normalizedTechnologies: Array<{ name: string; normalizedName: string }> | undefined,
    memberIds: Array<{ userId: string; username: string; roleInProject?: string }> | undefined,
    clients: Array<{ id: string; name: string; logoUrl: string; isActive: boolean }> | undefined,
    reviewerId: string | undefined,
    communitySpecified: boolean,
    communityId: string | undefined,
  ) {
    const base = project.pendingVersion
      ? versionSnapshot(project.pendingVersion.snapshot)
      : projectVersionSnapshot(project);
    const candidate = JSON.parse(JSON.stringify(base)) as Record<string, any>;
    if (dto.title !== undefined) candidate.title = dto.title.trim();
    if (dto.summary !== undefined) candidate.summary = dto.summary.trim();
    if (dto.description !== undefined) candidate.description = clean(dto.description) ?? '';
    if (dto.coverUrl !== undefined) candidate.coverUrl = dto.coverUrl;
    if (dto.videoUrl !== undefined) candidate.videoUrl = dto.videoUrl;
    if (dto.repoUrl !== undefined) candidate.repoUrl = dto.repoUrl;
    if (dto.demoUrl !== undefined) candidate.demoUrl = dto.demoUrl;
    if (dto.subject !== undefined) candidate.subject = dto.subject ? normalizeProjectValue(dto.subject) : null;
    if (dto.semester !== undefined) candidate.semester = dto.semester;
    if (dto.phase !== undefined) candidate.phase = dto.phase?.trim() || null;
    if (dto.stage !== undefined) candidate.stage = dto.stage;
    if (dto.recruiting !== undefined) candidate.recruiting = dto.recruiting;
    if (dto.isIncubator !== undefined) candidate.isIncubator = dto.isIncubator;
    if (dto.startedAt !== undefined) candidate.startedAt = dto.startedAt ? new Date(dto.startedAt).toISOString() : null;
    if (normalizedTags !== undefined) candidate.tags = normalizedTags;
    if (normalizedTechnologies !== undefined) candidate.technologies = normalizedTechnologies.map((item) => item.name);
    if (memberIds !== undefined) candidate.members = memberIds;
    if (clients !== undefined) {
      candidate.clients = clients;
      candidate.clientIds = projectClientIds(clients);
    }
    if (dto.isIncubator === false) {
      candidate.clients = [];
      candidate.clientIds = [];
    }
    if (dto.reviewerUsername !== undefined) candidate.reviewerId = reviewerId ?? null;
    if (communitySpecified) candidate.communityId = communityId ?? null;
    if (dto.isFeatured !== undefined) candidate.isFeatured = dto.isFeatured;
    return candidate;
  }

  private async nextEditorialVersion(tx: Prisma.TransactionClient, projectId: string) {
    const latest = await tx.projectVersion.aggregate({
      where: { projectId },
      _max: { number: true },
    });
    return (latest._max.number ?? 0) + 1;
  }

  private async publishVersionSnapshot(
    tx: Prisma.TransactionClient,
    project: any,
    snapshot: Record<string, any>,
    reviewerId: string | null,
  ) {
    const technologies = normalizeProjectTechnologies(
      Array.isArray(snapshot.technologies)
        ? snapshot.technologies.filter((value: unknown): value is string => typeof value === 'string')
        : [],
    );
    const members = Array.isArray(snapshot.members)
      ? snapshot.members
          .filter((member: any) => member && typeof member.userId === 'string')
          .map((member: any) => ({ userId: member.userId, roleInProject: member.roleInProject ?? null }))
      : canonicalProjectMembers(project.members ?? []);
    const clientIds = Array.isArray(snapshot.clientIds)
      ? [...new Set(snapshot.clientIds.filter((id: unknown): id is string => typeof id === 'string'))]
      : Array.isArray(snapshot.clients)
        ? projectClientIds(snapshot.clients)
        : null;
    if (!members.some((member: any) => member.userId === project.ownerId)) {
      members.unshift({ userId: project.ownerId, roleInProject: 'Líder' });
    }
    await tx.projectTechnology.deleteMany({ where: { projectId: project.id } });
    await tx.projectMember.deleteMany({ where: { projectId: project.id } });
    await this.registerCatalogValues(
      tx,
      normalizeProjectTags(Array.isArray(snapshot.tags) ? snapshot.tags : []),
      technologies,
      typeof snapshot.subject === 'string' ? snapshot.subject : null,
    );
    return tx.project.update({
      where: { id: project.id },
      data: {
        title: String(snapshot.title),
        summary: String(snapshot.summary),
        description: String(snapshot.description),
        coverUrl: snapshot.coverUrl ?? null,
        videoUrl: snapshot.videoUrl ?? null,
        repoUrl: snapshot.repoUrl ?? null,
        demoUrl: snapshot.demoUrl ?? null,
        subject: snapshot.subject ?? null,
        semester: snapshot.semester ?? null,
        phase: snapshot.phase ?? null,
        stage: snapshot.stage as ProjectStage,
        isFeatured: Boolean(snapshot.isFeatured),
        isIncubator: Boolean(snapshot.isIncubator),
        recruiting: Boolean(snapshot.recruiting),
        tags: normalizeProjectTags(Array.isArray(snapshot.tags) ? snapshot.tags : []),
        startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : null,
        reviewerId: reviewerId ?? snapshot.reviewerId ?? null,
        communityId: snapshot.communityId ?? null,
        status: 'APPROVED',
        publishedAt: new Date(),
        pendingVersionId: null,
        technologies: { create: technologies },
        members: { create: members },
        ...(clientIds === null
          ? {}
          : { clients: { set: clientIds.map((id) => ({ id })) } }),
      },
      include: MANAGE_INCLUDE,
    });
  }

  async list(q: ListProjectsQueryDto) {
    const { take, skip } = paginate(q.page, q.limit);
    const where: any = { status: 'APPROVED' };
    if (q.search) where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { summary: { contains: q.search, mode: 'insensitive' } },
    ];
    if (q.tag) where.tags = { has: q.tag };
    if (q.tech) where.technologies = { some: { name: { equals: q.tech, mode: 'insensitive' } } };
    if (q.community) where.community = { slug: q.community };
    if (q.semester) where.semester = q.semester;
    if (q.stage) where.stage = q.stage;
    if (q.incubator === 'true') where.isIncubator = true;
    if (q.featured === 'true') where.isFeatured = true;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
        take, skip,
        include: PUBLIC_INCLUDE,
      }),
    ]);
    return { total, items: items.map(projectWithClientIds) };
  }

  async manageable(user: AuthUser) {
    const projects = await this.prisma.project.findMany({
      where: this.accessPolicy.manageableWhere(user),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: PUBLIC_INCLUDE,
    });
    return projects.map((project) => ({
      ...projectWithClientIds(project),
      access: this.accessPolicy.forProject(user, project),
    }));
  }

  async manageDetail(user: AuthUser, id: string) {
    const { project, access } = await this.managedProject(user, id);
    return { ...projectWithVersion(project, project.pendingVersion), access };
  }

  async detail(slug: string, viewer?: AuthUser | null) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: {
        ...PUBLIC_INCLUDE,
        gallery: { where: { archivedAt: null }, orderBy: { createdAt: 'asc' } },
        milestones: { orderBy: { startsAt: 'asc' } },
        news: {
          where: { status: 'APPROVED' },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          take: 6,
          include: {
            author: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
            event: { select: { slug: true, title: true, startsAt: true } },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    const reviewerCanView = !!viewer?.roles?.includes('TEACHER')
      && (!project.reviewerId || project.reviewerId === viewer.id);
    const explicitMember = !!viewer && project.members.some((member) => member.userId === viewer.id);
    const privileged = viewer && (viewer.id === project.ownerId || explicitMember || viewer.roles.includes('ADMIN') || reviewerCanView);
    if (project.status !== 'APPROVED' && !privileged) throw new NotFoundException('Proyecto no encontrado');

    await this.prisma.project.update({ where: { id: project.id }, data: { viewsCount: { increment: 1 } } });
    const comments = await this.prisma.comment.findMany({
      where: { targetType: 'PROJECT', targetId: project.id },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } } },
    });
    const approvals = privileged
      ? await this.prisma.approvalRequest.findMany({
          where: { targetType: 'PROJECT', targetId: project.id },
          orderBy: { createdAt: 'desc' },
          include: { reviewer: { select: { username: true, profile: { select: { fullName: true } } } } },
        })
      : [];
    let likedByMe = false;
    if (viewer) {
      likedByMe = !!(await this.prisma.like.findUnique({
        where: { userId_targetType_targetId: { userId: viewer.id, targetType: 'PROJECT', targetId: project.id } },
      }));
    }
    return { ...projectWithClientIds(project), comments, approvals, likedByMe };
  }

  private async resolveRelations(dto: Partial<Pick<CreateProjectDto, 'reviewerUsername' | 'communitySlug'>>) {
    let reviewerId: string | undefined;
    if (dto.reviewerUsername) {
      const reviewer = await this.prisma.user.findUnique({
        where: { username: dto.reviewerUsername },
        include: { roles: { include: { role: true } } },
      });
      if (!reviewer || !reviewer.roles.some((r) => r.role.name === 'TEACHER' || r.role.name === 'ADMIN')) {
        throw new BadRequestException('El revisor debe ser un docente registrado');
      }
      reviewerId = reviewer.id;
    }
    let communityId: string | undefined;
    if (dto.communitySlug) {
      const community = await this.prisma.community.findUnique({ where: { slug: dto.communitySlug } });
      if (!community || !community.isActive) throw new BadRequestException('Comunidad no encontrada');
      communityId = community.id;
    }
    return { reviewerId, communityId };
  }

  private async resolveMembers(ownerId: string, usernames?: string[]) {
    const requested = [...new Set((usernames ?? []).map((value) => normalizeProjectValueKey(value)).filter(Boolean))];
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        emailVerifiedAt: { not: null },
        OR: [{ id: ownerId }, ...(requested.length ? [{ username: { in: requested } }] : [])],
      },
      select: { id: true, username: true, profile: { select: { fullName: true } } },
    });
    const found = new Set(users.map((member) => member.username));
    const missing = requested.filter((username) => !found.has(username));
    if (missing.length) throw new BadRequestException(`Integrantes no encontrados: ${missing.join(', ')}`);
    return [
      {
        userId: ownerId,
        username: users.find((member) => member.id === ownerId)?.username ?? '',
        fullName: users.find((member) => member.id === ownerId)?.profile?.fullName ?? null,
        roleInProject: 'Líder',
      },
      ...users.filter((member) => member.id !== ownerId).map((member) => ({
        userId: member.id,
        username: member.username,
        fullName: member.profile?.fullName ?? null,
        roleInProject: undefined,
      })),
    ];
  }

  async create(user: AuthUser, dto: CreateProjectDto, request: ProjectAuditRequestContext) {
    if ((dto as any).clientIds === null) {
      throw new BadRequestException('clientIds debe ser una lista');
    }
    if (!(dto.isIncubator ?? false) && dto.clientIds?.length) {
      throw new BadRequestException('Solo los proyectos de Incubadora pueden asociar clientes');
    }
    const { reviewerId, communityId } = await this.resolveRelations(dto);
    const memberIds = await this.resolveMembers(user.id, dto.memberUsernames);
    const tags = normalizeProjectTags(dto.tags);
    const technologies = normalizeProjectTechnologies(dto.technologies);
    const subject = dto.subject ? normalizeProjectValue(dto.subject) : null;
    return this.prisma.$transaction(async (tx) => {
      const clients = await this.incubatorClients.resolveActive(dto.clientIds ?? [], tx);
      await this.registerCatalogValues(tx, tags, technologies, subject);
      const project = await tx.project.create({ data: {
        title: dto.title.trim(),
        summary: dto.summary.trim(),
        description: clean(dto.description) ?? '',
        slug: uniqueSlug(dto.title),
        coverUrl: dto.coverUrl, videoUrl: dto.videoUrl, repoUrl: dto.repoUrl, demoUrl: dto.demoUrl,
        subject, semester: dto.semester, phase: dto.phase?.trim() || null,
        stage: dto.stage ?? 'IN_DEVELOPMENT',
        tags,
        isIncubator: dto.isIncubator ?? false,
        recruiting: dto.recruiting ?? false,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
        status: 'PENDING',
        ownerId: user.id,
        reviewerId,
        communityId,
        technologies: { create: technologies },
        members: {
          create: memberIds.map(({ userId, roleInProject }) => ({ userId, roleInProject })),
        },
        clients: { connect: clients.map(({ id }) => ({ id })) },
      }, include: MANAGE_INCLUDE });
      const version = await tx.projectVersion.create({
        data: {
          projectId: project.id,
          number: 1,
          status: 'PENDING',
          snapshot: projectAuditSnapshot(projectVersionSnapshot(project)),
          requesterId: user.id,
          reviewerId,
        },
        include: PENDING_VERSION_INCLUDE,
      });
      await tx.project.update({ where: { id: project.id }, data: { pendingVersionId: version.id } });
      await tx.approvalRequest.create({
        data: {
          targetType: 'PROJECT',
          targetId: project.id,
          requesterId: user.id,
          reviewerId,
          projectVersionId: version.id,
        },
      });
      await this.audit.record(tx, {
        projectId: project.id,
        actor: user,
        action: PROJECT_AUDIT_ACTIONS.created,
        entityType: 'PROJECT',
        entityId: project.id,
        before: null,
        after: editableProjectSnapshot(project),
        request,
      });
      return projectWithVersion(project, version);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateProjectDto, request: ProjectAuditRequestContext) {
    if ((dto as any).clientIds === null) {
      throw new BadRequestException('clientIds debe ser una lista');
    }
    const { project, access } = await this.managedProject(user, id);
    this.assertExpectedVersion(project.version, dto.expectedVersion);

    const communitySpecified = Object.prototype.hasOwnProperty.call(dto, 'communitySlug');
    const editorialBase = project.pendingVersion
      ? versionSnapshot(project.pendingVersion.snapshot)
      : null;
    const targetIsIncubator = dto.isIncubator
      ?? (editorialBase ? Boolean(editorialBase.isIncubator) : project.isIncubator);
    if (!targetIsIncubator && dto.clientIds?.length) {
      throw new BadRequestException('Solo los proyectos de Incubadora pueden asociar clientes');
    }
    const governanceChanged = dto.memberUsernames !== undefined
      || dto.reviewerUsername !== undefined
      || communitySpecified;
    if (governanceChanged && !access.canManageMembers) {
      throw new ForbiddenException('Solo el líder o un administrador pueden cambiar integrantes, revisor o comunidad');
    }
    if ((dto.isFeatured !== undefined || dto.status !== undefined) && !access.isAdmin) {
      throw new ForbiddenException('Solo un administrador puede cambiar el estado o destacar un proyecto');
    }

    const mutableKeys = [
      'title', 'summary', 'description', 'coverUrl', 'videoUrl', 'repoUrl', 'demoUrl', 'subject', 'semester',
      'phase', 'stage', 'tags', 'technologies', 'memberUsernames', 'reviewerUsername', 'communitySlug',
      'clientIds', 'isIncubator', 'recruiting', 'startedAt', 'isFeatured', 'status', 'resubmit',
    ] as const;
    if (!mutableKeys.some((key) => dto[key] !== undefined)) {
      throw new BadRequestException('No se recibió ningún cambio');
    }

    const { reviewerId, communityId } = await this.resolveRelations(dto);
    const memberIds = dto.memberUsernames !== undefined
      ? await this.resolveMembers(project.ownerId, dto.memberUsernames)
      : undefined;
    const normalizedTags = dto.tags === undefined
      ? undefined
      : normalizeProjectTags(dto.tags);
    const normalizedTechnologies = dto.technologies === undefined
      ? undefined
      : normalizeProjectTechnologies(dto.technologies);
    const baseClientIds = editorialBase && Array.isArray(editorialBase.clientIds)
      ? editorialBase.clientIds.filter((id: unknown): id is string => typeof id === 'string')
      : editorialBase && Array.isArray(editorialBase.clients)
        ? projectClientIds(editorialBase.clients)
        : project.clients.map((client) => client.id);
    const existingClientIds = [...new Set([
      ...project.clients.map((client) => client.id),
      ...baseClientIds,
    ])];
    const resolvedClients = dto.clientIds !== undefined
      ? await this.incubatorClients.resolveForProjectUpdate(dto.clientIds, existingClientIds)
      : dto.isIncubator === false ? [] : undefined;
    const sameList = (left: string[], right: string[]) => {
      const a = [...left].sort((x, y) => x.localeCompare(y));
      const b = [...right].sort((x, y) => x.localeCompare(y));
      return a.length === b.length && a.every((value, index) => value === b[index]);
    };
    const clientsChanged = resolvedClients !== undefined
      && !sameList(resolvedClients.map((client) => client.id), baseClientIds);
    const contentChanged =
      (dto.title !== undefined && dto.title.trim() !== project.title)
      || (dto.summary !== undefined && dto.summary.trim() !== project.summary)
      || (dto.description !== undefined && (clean(dto.description) ?? '') !== project.description)
      || (dto.coverUrl !== undefined && dto.coverUrl !== project.coverUrl)
      || (dto.videoUrl !== undefined && dto.videoUrl !== project.videoUrl)
      || (dto.repoUrl !== undefined && dto.repoUrl !== project.repoUrl)
      || (dto.demoUrl !== undefined && dto.demoUrl !== project.demoUrl)
      || (dto.subject !== undefined && (dto.subject ? normalizeProjectValue(dto.subject) : null) !== project.subject)
      || (dto.semester !== undefined && dto.semester !== project.semester)
      || (dto.phase !== undefined && (dto.phase?.trim() || null) !== project.phase)
      || (dto.stage !== undefined && dto.stage !== project.stage)
      || (normalizedTags !== undefined && !sameList(normalizedTags, project.tags))
      || (normalizedTechnologies !== undefined && !sameList(
        normalizedTechnologies.map((item) => item.normalizedName),
        project.technologies.map((item) => item.normalizedName),
      ))
      || (dto.isIncubator !== undefined && dto.isIncubator !== project.isIncubator)
      || (dto.recruiting !== undefined && dto.recruiting !== project.recruiting)
      || (dto.startedAt !== undefined
        && (dto.startedAt ? new Date(dto.startedAt).toISOString() : null) !== (project.startedAt?.toISOString() ?? null))
      || clientsChanged;
    const data: Prisma.ProjectUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.summary !== undefined) data.summary = dto.summary.trim();
    if (dto.description !== undefined) data.description = clean(dto.description) ?? '';
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl;
    if (dto.videoUrl !== undefined) data.videoUrl = dto.videoUrl;
    if (dto.repoUrl !== undefined) data.repoUrl = dto.repoUrl;
    if (dto.demoUrl !== undefined) data.demoUrl = dto.demoUrl;
    if (dto.subject !== undefined) data.subject = dto.subject ? normalizeProjectValue(dto.subject) : null;
    if (dto.semester !== undefined) data.semester = dto.semester;
    if (dto.phase !== undefined) data.phase = dto.phase?.trim() || null;
    if (dto.stage !== undefined) data.stage = dto.stage;
    if (dto.recruiting !== undefined) data.recruiting = dto.recruiting;
    if (dto.isIncubator !== undefined) data.isIncubator = dto.isIncubator;
    if (dto.startedAt !== undefined) data.startedAt = dto.startedAt ? new Date(dto.startedAt) : null;
    if (resolvedClients !== undefined) data.clients = { set: resolvedClients.map(({ id: clientId }) => ({ id: clientId })) };
    if (normalizedTags !== undefined) data.tags = normalizedTags;
    if (reviewerId) data.reviewer = { connect: { id: reviewerId } };
    if (communitySpecified) data.community = communityId ? { connect: { id: communityId } } : { disconnect: true };
    if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'APPROVED' && !project.publishedAt) data.publishedAt = new Date();
    }

    const shouldCreatePublishedVersion = project.status === 'APPROVED'
      && dto.status === undefined
      && (contentChanged || governanceChanged);
    if (shouldCreatePublishedVersion) {
      const candidate = this.buildVersionCandidate(
        project,
        dto,
        normalizedTags,
        normalizedTechnologies,
        memberIds,
        resolvedClients,
        reviewerId,
        communitySpecified,
        communityId,
      );
      const base = project.pendingVersion
        ? versionSnapshot(project.pendingVersion.snapshot)
        : projectVersionSnapshot(project);
      if (projectAuditSnapshotsEqual(base, candidate)) {
        throw new BadRequestException('Los datos enviados no contienen cambios efectivos');
      }
      return this.prisma.$transaction(async (tx) => {
        if (resolvedClients?.length) {
          await this.incubatorClients.resolveForProjectUpdate(
            resolvedClients.map((client) => client.id),
            existingClientIds,
            tx,
          );
        }
        const revision = await this.bumpVersion(tx, id, project.version);
        if (project.pendingVersion?.status === 'PENDING') {
          await tx.projectVersion.update({
            where: { id: project.pendingVersion.id },
            data: { status: 'SUPERSEDED', decidedAt: project.pendingVersion.decidedAt ?? new Date() },
          });
        }
        await this.registerCatalogValues(
          tx,
          normalizeProjectTags(Array.isArray(candidate.tags) ? candidate.tags : []),
          normalizeProjectTechnologies(Array.isArray(candidate.technologies) ? candidate.technologies : []),
          typeof candidate.subject === 'string' ? candidate.subject : null,
        );
        const number = await this.nextEditorialVersion(tx, id);
        const version = await tx.projectVersion.create({
          data: {
            projectId: id,
            number,
            status: 'PENDING',
            snapshot: projectAuditSnapshot(candidate),
            requesterId: user.id,
            reviewerId: (candidate.reviewerId as string | null) ?? null,
          },
          include: PENDING_VERSION_INCLUDE,
        });
        const existingApproval = await tx.approvalRequest.findFirst({
          where: { targetType: 'PROJECT', targetId: id, decision: null },
          orderBy: { createdAt: 'desc' },
        });
        const approval = existingApproval
          ? await tx.approvalRequest.update({
              where: { id: existingApproval.id },
              data: {
                requesterId: user.id,
                reviewerId: version.reviewerId,
                projectVersionId: version.id,
              },
            })
          : await tx.approvalRequest.create({
              data: {
                targetType: 'PROJECT',
                targetId: id,
                requesterId: user.id,
                reviewerId: version.reviewerId,
                projectVersionId: version.id,
              },
            });
        await tx.project.update({ where: { id }, data: { pendingVersionId: version.id } });
        await this.audit.record(tx, {
          projectId: id,
          actor: user,
          action: PROJECT_AUDIT_ACTIONS.versionSubmitted,
          entityType: 'PROJECT_VERSION',
          entityId: version.id,
          before: base,
          after: candidate,
          metadata: {
            publicVersionUnchanged: true,
            editorialVersion: number,
            versionBefore: project.version,
            versionAfter: revision,
            approvalRequestId: approval.id,
          },
          request,
        });
        return projectWithVersion({ ...project, version: revision, pendingVersion: version }, version);
      });
    }

    const requestedResubmit = !!dto.resubmit && ['OBSERVED', 'REJECTED', 'DRAFT'].includes(project.status);
    if (requestedResubmit) data.status = 'PENDING';

    return this.prisma.$transaction(async (tx) => {
      if (resolvedClients?.length) {
        await this.incubatorClients.resolveForProjectUpdate(
          resolvedClients.map((client) => client.id),
          existingClientIds,
          tx,
        );
      }
      const version = await this.bumpVersion(tx, id, project.version);
      let approvalRequestId: string | null = null;
      await this.registerCatalogValues(
        tx,
        normalizedTags ?? project.tags,
        normalizedTechnologies ?? project.technologies.map((item) => ({
          name: item.name,
          normalizedName: item.normalizedName,
        })),
        dto.subject !== undefined ? (dto.subject ? normalizeProjectValue(dto.subject) : null) : project.subject,
      );
      if (dto.technologies !== undefined) {
        await tx.projectTechnology.deleteMany({ where: { projectId: id } });
        data.technologies = {
          create: normalizedTechnologies ?? [],
        };
      }
      if (memberIds) {
        await tx.projectMember.deleteMany({ where: { projectId: id } });
        data.members = {
          create: memberIds.map(({ userId, roleInProject }) => ({ userId, roleInProject })),
        };
      }
      const updated = await tx.project.update({ where: { id }, data, include: MANAGE_INCLUDE });
      const beforeProject = editableProjectSnapshot(project);
      const afterProject = editableProjectSnapshot(updated);
      const projectChanged = !projectAuditSnapshotsEqual(beforeProject, afterProject);
      const beforeMembers = projectMembersSnapshot(project.members);
      const afterMembers = projectMembersSnapshot(updated.members);
      const membersChanged = !projectAuditSnapshotsEqual(beforeMembers, afterMembers);
      if (!projectChanged && !membersChanged) {
        throw new BadRequestException('Los datos enviados no contienen cambios efectivos');
      }
      let editorialVersion: any | null = null;
      if (projectChanged || membersChanged) {
        if (project.pendingVersion?.status === 'PENDING') {
          await tx.projectVersion.update({
            where: { id: project.pendingVersion.id },
            data: { status: 'SUPERSEDED', decidedAt: project.pendingVersion.decidedAt ?? new Date() },
          });
        }
        const number = await this.nextEditorialVersion(tx, id);
        const status = updated.status === 'APPROVED'
          ? 'PUBLISHED'
          : updated.status === 'OBSERVED'
            ? 'OBSERVED'
            : updated.status === 'REJECTED'
              ? 'REJECTED'
              : 'PENDING';
        if (status === 'PUBLISHED') {
          await tx.projectVersion.updateMany({
            where: { projectId: id, status: 'PUBLISHED' },
            data: { status: 'SUPERSEDED' },
          });
        }
        editorialVersion = await tx.projectVersion.create({
          data: {
            projectId: id,
            number,
            status,
            snapshot: projectAuditSnapshot(projectVersionSnapshot(updated)),
            requesterId: user.id,
            reviewerId: updated.reviewerId,
            publishedAt: status === 'PUBLISHED' ? new Date() : null,
          },
          include: PENDING_VERSION_INCLUDE,
        });
        await tx.project.update({
          where: { id },
          data: {
            pendingVersionId: status === 'PUBLISHED' ? null : editorialVersion.id,
          },
        });
        if (status === 'PENDING') {
          const open = await tx.approvalRequest.findFirst({
            where: { targetType: 'PROJECT', targetId: id, decision: null },
            orderBy: { createdAt: 'desc' },
          });
          const approval = open
            ? await tx.approvalRequest.update({
                where: { id: open.id },
                data: { reviewerId: updated.reviewerId, projectVersionId: editorialVersion.id },
              })
            : await tx.approvalRequest.create({
                data: {
                  targetType: 'PROJECT',
                  targetId: id,
                  requesterId: user.id,
                  reviewerId: updated.reviewerId,
                  projectVersionId: editorialVersion.id,
                },
              });
          approvalRequestId = approval.id;
        }
      }
      if (projectChanged) {
        await this.audit.record(tx, {
          projectId: id,
          actor: user,
          action: PROJECT_AUDIT_ACTIONS.updated,
          entityType: 'PROJECT',
          entityId: id,
          before: beforeProject,
          after: afterProject,
          metadata: { versionBefore: project.version, versionAfter: version, approvalRequestId },
          request,
        });
      }
      if (membersChanged) {
        await this.audit.record(tx, {
          projectId: id,
          actor: user,
          action: PROJECT_AUDIT_ACTIONS.membersUpdated,
          entityType: 'MEMBERS',
          entityId: id,
          before: beforeMembers,
          after: afterMembers,
          metadata: { versionBefore: project.version, versionAfter: version },
          request,
        });
      }
      const response = editorialVersion && editorialVersion.status !== 'PUBLISHED'
        ? projectWithVersion({ ...updated, pendingVersion: editorialVersion }, editorialVersion)
        : updated;
      return { ...projectWithClientIds(response), access: this.accessPolicy.forProject(user, updated) };
    });
  }

  async milestones(user: AuthUser, projectId: string) {
    await this.accessPolicy.assertEditor(user, projectId);
    return this.prisma.projectMilestone.findMany({
      where: { projectId },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createMilestone(
    user: AuthUser,
    projectId: string,
    dto: CreateProjectMilestoneDto,
    request: ProjectAuditRequestContext,
  ) {
    const { project } = await this.managedProject(user, projectId);
    this.assertExpectedVersion(project.version, dto.expectedVersion);
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    assertMilestoneDates(startsAt, endsAt);

    return this.prisma.$transaction(async (tx) => {
      const version = await this.bumpVersion(tx, projectId, project.version);
      const milestone = await tx.projectMilestone.create({
        data: {
          projectId,
          title: dto.title.trim(),
          description: dto.description ? clean(dto.description) : null,
          startsAt,
          endsAt,
          allDay: dto.allDay ?? false,
          status: dto.status ?? 'PLANNED',
          location: dto.location?.trim() || null,
          url: dto.url || null,
        },
      });
      await this.audit.record(tx, {
        projectId,
        actor: user,
        action: PROJECT_AUDIT_ACTIONS.milestoneCreated,
        entityType: 'MILESTONE',
        entityId: milestone.id,
        before: null,
        after: projectMilestoneSnapshot(milestone),
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ...milestone, projectVersion: version };
    });
  }

  async updateMilestone(
    user: AuthUser,
    projectId: string,
    milestoneId: string,
    dto: UpdateProjectMilestoneDto,
    request: ProjectAuditRequestContext,
  ) {
    const { project } = await this.managedProject(user, projectId);
    this.assertExpectedVersion(project.version, dto.expectedVersion);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) throw new NotFoundException('Hito no encontrado');
    const meaningful = ['title', 'description', 'startsAt', 'endsAt', 'allDay', 'status', 'location', 'url']
      .some((key) => (dto as any)[key] !== undefined);
    if (!meaningful) throw new BadRequestException('No se recibió ningún cambio para el hito');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : milestone.startsAt;
    const endsAt = dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : milestone.endsAt;
    assertMilestoneDates(startsAt, endsAt);
    const data: Prisma.ProjectMilestoneUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description ? clean(dto.description) : null;
    if (dto.startsAt !== undefined) data.startsAt = startsAt;
    if (dto.endsAt !== undefined) data.endsAt = endsAt;
    if (dto.allDay !== undefined) data.allDay = dto.allDay;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.location !== undefined) data.location = dto.location?.trim() || null;
    if (dto.url !== undefined) data.url = dto.url || null;

    return this.prisma.$transaction(async (tx) => {
      const version = await this.bumpVersion(tx, projectId, project.version);
      const updated = await tx.projectMilestone.update({ where: { id: milestoneId }, data });
      if (projectAuditSnapshotsEqual(projectMilestoneSnapshot(milestone), projectMilestoneSnapshot(updated))) {
        throw new BadRequestException('Los datos enviados no contienen cambios efectivos');
      }
      await this.audit.record(tx, {
        projectId,
        actor: user,
        action: PROJECT_AUDIT_ACTIONS.milestoneUpdated,
        entityType: 'MILESTONE',
        entityId: milestone.id,
        before: projectMilestoneSnapshot(milestone),
        after: projectMilestoneSnapshot(updated),
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ...updated, projectVersion: version };
    });
  }

  async deleteMilestone(
    user: AuthUser,
    projectId: string,
    milestoneId: string,
    expectedVersion: number | undefined,
    request: ProjectAuditRequestContext,
  ) {
    const { project } = await this.managedProject(user, projectId);
    this.assertExpectedVersion(project.version, expectedVersion);
    const milestone = await this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) throw new NotFoundException('Hito no encontrado');
    return this.prisma.$transaction(async (tx) => {
      const version = await this.bumpVersion(tx, projectId, project.version);
      await tx.projectMilestone.delete({ where: { id: milestoneId } });
      await this.audit.record(tx, {
        projectId,
        actor: user,
        action: PROJECT_AUDIT_ACTIONS.milestoneDeleted,
        entityType: 'MILESTONE',
        entityId: milestone.id,
        before: projectMilestoneSnapshot(milestone),
        after: null,
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ok: true, version };
    });
  }

  async attachGalleryMedia(
    user: AuthUser,
    projectId: string,
    dto: AttachProjectMediaDto,
    request: ProjectAuditRequestContext,
  ) {
    const { project } = await this.managedProject(user, projectId);
    this.assertExpectedVersion(project.version, dto.expectedVersion);
    if (project.gallery.length >= 12) throw new BadRequestException('La galería admite hasta 12 imágenes activas');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: dto.mediaId } });
    if (!asset || asset.archivedAt || asset.projectId || asset.eventId || asset.forumQuestionId || asset.forumAnswerId) {
      throw new BadRequestException('La imagen no existe o ya está vinculada');
    }
    if (!asset.mime?.startsWith('image/')) throw new BadRequestException('Solo se pueden adjuntar imágenes a la galería');
    if (asset.uploaderId !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Solo puedes adjuntar una imagen que hayas subido');
    }
    const before = projectGallerySnapshot(asset);
    return this.prisma.$transaction(async (tx) => {
      const version = await this.bumpVersion(tx, projectId, project.version);
      const activeImages = await tx.mediaAsset.count({ where: { projectId, archivedAt: null, mime: { startsWith: 'image/' } } });
      if (activeImages >= 12) throw new BadRequestException('La galería admite hasta 12 imágenes activas');
      const linked = await tx.mediaAsset.updateMany({
        where: {
          id: asset.id,
          uploaderId: user.roles.includes('ADMIN') ? undefined : user.id,
          archivedAt: null,
          projectId: null,
          eventId: null,
          forumQuestionId: null,
          forumAnswerId: null,
          mime: { startsWith: 'image/' },
        },
        data: { projectId },
      });
      if (linked.count !== 1) throw new ConflictException('La imagen fue vinculada por otra operación; recarga la galería');
      const attached = await tx.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
      await this.audit.record(tx, {
        projectId,
        actor: user,
        action: PROJECT_AUDIT_ACTIONS.galleryAttached,
        entityType: 'GALLERY',
        entityId: asset.id,
        before,
        after: projectGallerySnapshot(attached),
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ...attached, version, projectVersion: version };
    });
  }

  async archiveGalleryMedia(
    user: AuthUser,
    projectId: string,
    mediaId: string,
    expectedVersion: number | undefined,
    request: ProjectAuditRequestContext,
  ) {
    const { project } = await this.managedProject(user, projectId);
    this.assertExpectedVersion(project.version, expectedVersion);
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, projectId, archivedAt: null } });
    if (!asset) throw new NotFoundException('Imagen no encontrada en la galería');
    return this.prisma.$transaction(async (tx) => {
      const version = await this.bumpVersion(tx, projectId, project.version);
      const archived = await tx.mediaAsset.update({ where: { id: asset.id }, data: { archivedAt: new Date() } });
      await this.audit.record(tx, {
        projectId,
        actor: user,
        action: PROJECT_AUDIT_ACTIONS.galleryArchived,
        entityType: 'GALLERY',
        entityId: asset.id,
        before: projectGallerySnapshot(asset),
        after: projectGallerySnapshot(archived),
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ok: true, version };
    });
  }

  async auditHistory(user: AuthUser, projectId: string, query: any) {
    this.assertAdmin(user);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    const { take, skip, page } = paginate(query.page, Math.min(Number(query.limit) || 30, 100));
    const [total, items] = await this.prisma.$transaction([
      this.prisma.projectAuditLog.count({ where: { projectId } }),
      this.prisma.projectAuditLog.findMany({
        where: { projectId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: { select: { fullName: true } },
              roles: { select: { role: { select: { name: true } } } },
            },
          },
          rollbackEntries: { select: { id: true, createdAt: true } },
          delivery: { select: { status: true, attempts: true, sentAt: true, lastError: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      limit: take,
      items: items.map((item) => ({
        ...item,
        actor: item.actor
          ? { ...item.actor, roles: item.actor.roles.map((entry) => entry.role.name) }
          : null,
        actorDeleted: !item.actor,
        canRollback: ROLLBACKABLE_PROJECT_ACTIONS.has(item.action) && item.rollbackEntries.length === 0,
      })),
    };
  }

  async recentAudit(user: AuthUser, query: any) {
    this.assertAdmin(user);
    const { take, skip, page } = paginate(query.page, Math.min(Number(query.limit) || 30, 100));
    const search = typeof query.search === 'string' ? query.search.trim().slice(0, 120) : '';
    const action = typeof query.action === 'string' ? query.action.trim().slice(0, 80) : '';
    const where: Prisma.ProjectAuditLogWhereInput = {};
    if (action) where.action = action;
    if (search) {
      where.OR = [
        { actorEmailSnapshot: { contains: search, mode: 'insensitive' } },
        { actorNameSnapshot: { contains: search, mode: 'insensitive' } },
        { actorUsernameSnapshot: { contains: search, mode: 'insensitive' } },
        { actor: { is: { username: { contains: search, mode: 'insensitive' } } } },
        { actor: { is: { profile: { fullName: { contains: search, mode: 'insensitive' } } } } },
        { project: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.projectAuditLog.count({ where }),
      this.prisma.projectAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              username: true,
              profile: { select: { fullName: true } },
              roles: { select: { role: { select: { name: true } } } },
            },
          },
          project: { select: { id: true, title: true, slug: true } },
          delivery: { select: { status: true, attempts: true, sentAt: true, lastError: true } },
        },
      }),
    ]);
    const items = rows.map((row) => {
      const metadata = row.metadata && !Array.isArray(row.metadata) && typeof row.metadata === 'object'
        ? row.metadata as Record<string, any>
        : {};
      return {
        ...row,
        actor: row.actor
          ? { ...row.actor, roles: row.actor.roles.map((entry) => entry.role.name) }
          : null,
        actorDeleted: !row.actor,
        riskSignals: Array.isArray(metadata.security?.riskSignals) ? metadata.security.riskSignals : [],
      };
    });
    return { total, page, limit: take, items };
  }

  private async restoreProjectSnapshot(
    tx: Prisma.TransactionClient,
    projectId: string,
    snapshot: Record<string, any>,
  ) {
    const relationSnapshot = canonicalProjectSnapshotClientRelation(snapshot);
    await tx.projectTechnology.deleteMany({ where: { projectId } });
    const technologies = normalizeProjectTechnologies(
      Array.isArray(snapshot.technologies)
        ? snapshot.technologies.filter((name: unknown): name is string => typeof name === 'string')
        : [],
    );
    const clientIds = relationSnapshot.clientIds;
    const data: Prisma.ProjectUpdateInput = {
      title: String(snapshot.title),
      summary: String(snapshot.summary),
      description: String(snapshot.description),
      coverUrl: snapshot.coverUrl ?? null,
      videoUrl: snapshot.videoUrl ?? null,
      repoUrl: snapshot.repoUrl ?? null,
      demoUrl: snapshot.demoUrl ?? null,
      subject: snapshot.subject ?? null,
      semester: snapshot.semester ?? null,
      phase: snapshot.phase ?? null,
      status: snapshot.status as PublicationStatus,
      stage: snapshot.stage as ProjectStage,
      isFeatured: Boolean(snapshot.isFeatured),
      isIncubator: Boolean(snapshot.isIncubator),
      recruiting: Boolean(snapshot.recruiting),
      tags: Array.isArray(snapshot.tags) ? snapshot.tags.filter((tag: unknown) => typeof tag === 'string') : [],
      startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : null,
      publishedAt: snapshot.publishedAt ? new Date(snapshot.publishedAt) : null,
      reviewer: snapshot.reviewerId
        ? { connect: { id: snapshot.reviewerId } }
        : { disconnect: true },
      community: snapshot.communityId
        ? { connect: { id: snapshot.communityId } }
        : { disconnect: true },
      technologies: { create: technologies },
      clients: { set: clientIds.map((id) => ({ id })) },
    };
    return tx.project.update({ where: { id: projectId }, data, include: MANAGE_INCLUDE });
  }

  async rollbackAudit(
    user: AuthUser,
    projectId: string,
    auditId: string,
    dto: RollbackProjectAuditDto,
    request: ProjectAuditRequestContext,
  ) {
    this.assertAdmin(user);
    const { project } = await this.managedProject(user, projectId);
    this.assertExpectedVersion(project.version, dto.expectedVersion);
    const log = await this.prisma.projectAuditLog.findFirst({
      where: { id: auditId, projectId },
      include: { rollbackEntries: { select: { id: true } } },
    });
    if (!log) throw new NotFoundException('Entrada de auditoría no encontrada');
    if (log.action === PROJECT_AUDIT_ACTIONS.rollback || log.rollbackEntries.length) {
      throw new ConflictException('Esta entrada no se puede revertir o ya fue revertida');
    }
    if (!ROLLBACKABLE_PROJECT_ACTIONS.has(log.action)) {
      throw new BadRequestException(`La acción ${log.action} es solo informativa y no admite rollback automático`);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await this.bumpVersion(tx, projectId, project.version);
        let rollbackBefore: unknown;
        let rollbackAfter: unknown;

        if ([
          PROJECT_AUDIT_ACTIONS.updated,
          PROJECT_AUDIT_ACTIONS.archived,
        ].includes(log.action as any)) {
          const current = await tx.project.findUnique({
            where: { id: projectId },
            include: { technologies: true, clients: true },
          });
          if (!current) throw new NotFoundException('Proyecto no encontrado');
          const currentSnapshot = editableProjectSnapshot(current);
          const expectedAfter = auditObject(log.after, 'posterior');
          if (!projectAuditSnapshotsEqual(
            canonicalProjectSnapshotClientRelation(currentSnapshot),
            canonicalProjectSnapshotClientRelation(expectedAfter),
          )) {
            throw new ConflictException('El proyecto cambió después de esa edición; revierte primero los cambios más recientes');
          }
          const restored = await this.restoreProjectSnapshot(tx, projectId, auditObject(log.before, 'anterior'));
          const metadata = log.metadata && !Array.isArray(log.metadata) && typeof log.metadata === 'object'
            ? log.metadata as Record<string, any>
            : {};
          if (typeof metadata.approvalRequestId === 'string') {
            await tx.approvalRequest.deleteMany({
              where: {
                id: metadata.approvalRequestId,
                targetType: 'PROJECT',
                targetId: projectId,
                decision: null,
              },
            });
          }
          rollbackBefore = currentSnapshot;
          rollbackAfter = editableProjectSnapshot(restored);
        } else if (log.action === PROJECT_AUDIT_ACTIONS.membersUpdated) {
          const current = await tx.projectMember.findMany({
            where: { projectId },
            include: { user: { select: { username: true } } },
          });
          const expectedMembers = auditArray(log.after, 'posterior');
          if (!projectAuditSnapshotsEqual(canonicalProjectMembers(current), canonicalProjectMembers(expectedMembers))) {
            throw new ConflictException('Los integrantes cambiaron después de esa edición');
          }
          const previous = auditArray(log.before, 'anterior');
          const userIds = [...new Set(previous.map((member) => member.userId).filter(Boolean))] as string[];
          const existingUsers = await tx.user.count({ where: { id: { in: userIds }, isActive: true } });
          if (existingUsers !== userIds.length) {
            throw new ConflictException('No se puede restaurar: uno de los integrantes ya no está activo');
          }
          await tx.projectMember.deleteMany({ where: { projectId } });
          await tx.projectMember.createMany({
            data: previous.map((member) => ({
              projectId,
              userId: member.userId,
              roleInProject: member.roleInProject ?? null,
            })),
          });
          const restored = await tx.projectMember.findMany({
            where: { projectId },
            include: { user: { select: { username: true } } },
          });
          rollbackBefore = projectMembersSnapshot(current);
          rollbackAfter = projectMembersSnapshot(restored);
        } else if (log.action === PROJECT_AUDIT_ACTIONS.milestoneCreated) {
          const current = await tx.projectMilestone.findFirst({ where: { id: log.entityId ?? '', projectId } });
          if (!current || !projectAuditSnapshotsEqual(projectMilestoneSnapshot(current), auditObject(log.after, 'posterior'))) {
            throw new ConflictException('El hito cambió después de su creación');
          }
          await tx.projectMilestone.delete({ where: { id: current.id } });
          rollbackBefore = projectMilestoneSnapshot(current);
          rollbackAfter = null;
        } else if (log.action === PROJECT_AUDIT_ACTIONS.milestoneUpdated) {
          const current = await tx.projectMilestone.findFirst({ where: { id: log.entityId ?? '', projectId } });
          if (!current || !projectAuditSnapshotsEqual(projectMilestoneSnapshot(current), auditObject(log.after, 'posterior'))) {
            throw new ConflictException('El hito cambió después de esa edición');
          }
          const previous = auditObject(log.before, 'anterior');
          const restored = await tx.projectMilestone.update({
            where: { id: current.id },
            data: {
              title: previous.title,
              description: previous.description ?? null,
              startsAt: new Date(previous.startsAt),
              endsAt: previous.endsAt ? new Date(previous.endsAt) : null,
              allDay: previous.allDay,
              status: previous.status as ProjectMilestoneStatus,
              location: previous.location ?? null,
              url: previous.url ?? null,
            },
          });
          rollbackBefore = projectMilestoneSnapshot(current);
          rollbackAfter = projectMilestoneSnapshot(restored);
        } else if (log.action === PROJECT_AUDIT_ACTIONS.milestoneDeleted) {
          const exists = await tx.projectMilestone.findUnique({ where: { id: log.entityId ?? '' } });
          if (exists) throw new ConflictException('Ya existe un hito con el identificador que se intenta restaurar');
          const previous = auditObject(log.before, 'anterior');
          const restored = await tx.projectMilestone.create({
            data: {
              id: previous.id,
              projectId,
              title: previous.title,
              description: previous.description ?? null,
              startsAt: new Date(previous.startsAt),
              endsAt: previous.endsAt ? new Date(previous.endsAt) : null,
              allDay: previous.allDay,
              status: previous.status as ProjectMilestoneStatus,
              location: previous.location ?? null,
              url: previous.url ?? null,
            },
          });
          rollbackBefore = null;
          rollbackAfter = projectMilestoneSnapshot(restored);
        } else if ([
          PROJECT_AUDIT_ACTIONS.newsCreated,
          PROJECT_AUDIT_ACTIONS.newsUpdated,
          PROJECT_AUDIT_ACTIONS.newsArchived,
        ].includes(log.action as any)) {
          const current = await tx.news.findFirst({ where: { id: log.entityId ?? '', projectId } });
          if (!current || !projectAuditSnapshotsEqual(projectNewsSnapshot(current), auditObject(log.after, 'posterior'))) {
            throw new ConflictException('La noticia cambió después de esa edición');
          }
          let restored;
          if (log.action === PROJECT_AUDIT_ACTIONS.newsCreated) {
            restored = await tx.news.update({ where: { id: current.id }, data: { status: 'ARCHIVED' } });
          } else {
            const previous = auditObject(log.before, 'anterior');
            restored = await tx.news.update({
              where: { id: current.id },
              data: {
                title: String(previous.title),
                summary: String(previous.summary),
                content: String(previous.content),
                category: previous.category as NewsCategory,
                coverUrl: previous.coverUrl ?? null,
                tags: Array.isArray(previous.tags) ? previous.tags.filter((tag: unknown) => typeof tag === 'string') : [],
                status: previous.status as PublicationStatus,
                publishedAt: previous.publishedAt ? new Date(previous.publishedAt) : null,
                communityId: previous.communityId ?? null,
                eventId: previous.eventId ?? null,
              },
            });
          }
          rollbackBefore = projectNewsSnapshot(current);
          rollbackAfter = projectNewsSnapshot(restored);
        } else if ([PROJECT_AUDIT_ACTIONS.galleryAttached, PROJECT_AUDIT_ACTIONS.galleryArchived, PROJECT_AUDIT_ACTIONS.mediaUploaded].includes(log.action as any)) {
          const current = await tx.mediaAsset.findFirst({ where: { id: log.entityId ?? '', projectId } });
          if (!current || !projectAuditSnapshotsEqual(projectGallerySnapshot(current), auditObject(log.after, 'posterior'))) {
            throw new ConflictException('La imagen cambió después de esa edición');
          }
          const previous = log.before ? auditObject(log.before, 'anterior') : null;
          const restored = await tx.mediaAsset.update({
            where: { id: current.id },
            data: log.action === PROJECT_AUDIT_ACTIONS.mediaUploaded
              ? { archivedAt: new Date() }
              : {
                  projectId: previous?.projectId ?? null,
                  archivedAt: previous?.archivedAt ? new Date(previous.archivedAt) : null,
                },
          });
          rollbackBefore = projectGallerySnapshot(current);
          rollbackAfter = projectGallerySnapshot(restored);
        } else {
          throw new BadRequestException(`Rollback no soportado para la acción ${log.action}`);
        }

        const rollback = await this.audit.record(tx, {
          projectId,
          actor: user,
          action: PROJECT_AUDIT_ACTIONS.rollback,
          entityType: log.entityType,
          entityId: log.entityId,
          before: rollbackBefore,
          after: rollbackAfter,
          rollbackOfId: log.id,
          metadata: {
            reason: dto.reason.trim(),
            rollbackOf: log.id,
            originalAction: log.action,
            versionBefore: project.version,
            versionAfter: version,
          },
          request,
        });
        return { ok: true, version, audit: rollback };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta entrada ya fue revertida');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('No se puede restaurar el cambio porque una relación histórica ya no existe');
      }
      throw error;
    }
  }

  async review(reviewer: AuthUser, id: string, dto: ReviewDto, request: ProjectAuditRequestContext) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: MANAGE_INCLUDE });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    this.assertExpectedVersion(project.version, dto.expectedVersion);
    const editorial = project.pendingVersion;
    if ((!editorial || editorial.status !== 'PENDING') && project.status !== 'PENDING') {
      throw new BadRequestException('El proyecto no está pendiente de revisión');
    }
    const assignedReviewerId = editorial?.reviewerId ?? project.reviewerId;
    if (!reviewer.roles.includes('ADMIN') && assignedReviewerId && assignedReviewerId !== reviewer.id) {
      throw new ForbiddenException('Este proyecto está asignado a otro docente revisor');
    }
    if (dto.decision !== 'APPROVED' && !dto.comment?.trim()) {
      throw new BadRequestException('Debes explicar por qué observas o rechazas el proyecto');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const revision = await this.bumpVersion(tx, id, project.version);
      const open = await tx.approvalRequest.findFirst({
        where: {
          targetType: 'PROJECT',
          targetId: id,
          decision: null,
          ...(editorial ? { OR: [{ projectVersionId: editorial.id }, { projectVersionId: null }] } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (open) {
        await tx.approvalRequest.update({
          where: { id: open.id },
          data: {
            decision: dto.decision,
            comment: dto.comment?.trim(),
            reviewerId: reviewer.id,
            projectVersionId: editorial?.id,
            decidedAt: new Date(),
          },
        });
      } else {
        await tx.approvalRequest.create({
          data: {
            targetType: 'PROJECT',
            targetId: id,
            requesterId: editorial?.requesterId ?? project.ownerId,
            reviewerId: reviewer.id,
            projectVersionId: editorial?.id,
            decision: dto.decision,
            comment: dto.comment?.trim(),
            decidedAt: new Date(),
          },
        });
      }
      let reviewed: any;
      if (editorial) {
        const snapshot = versionSnapshot(editorial.snapshot);
        if (dto.decision === 'APPROVED') {
          await tx.projectVersion.updateMany({
            where: { projectId: id, status: 'PUBLISHED', id: { not: editorial.id } },
            data: { status: 'SUPERSEDED' },
          });
          reviewed = await this.publishVersionSnapshot(tx, project, snapshot, reviewer.id);
          await tx.projectVersion.update({
            where: { id: editorial.id },
            data: {
              status: 'PUBLISHED',
              reviewerId: reviewer.id,
              reviewComment: dto.comment?.trim() || null,
              decidedAt: new Date(),
              publishedAt: new Date(),
            },
          });
        } else {
          const versionStatus = dto.decision === 'OBSERVED' ? 'OBSERVED' : 'REJECTED';
          await tx.projectVersion.update({
            where: { id: editorial.id },
            data: {
              status: versionStatus,
              reviewerId: reviewer.id,
              reviewComment: dto.comment!.trim(),
              decidedAt: new Date(),
            },
          });
          if (project.status !== 'APPROVED') {
            await tx.project.update({ where: { id }, data: { status: versionStatus } });
          }
          reviewed = await tx.project.findUniqueOrThrow({ where: { id }, include: MANAGE_INCLUDE });
        }
      } else {
        const status = dto.decision === 'APPROVED' ? 'APPROVED' : dto.decision === 'OBSERVED' ? 'OBSERVED' : 'REJECTED';
        reviewed = await tx.project.update({
          where: { id },
          data: { status, publishedAt: status === 'APPROVED' ? new Date() : project.publishedAt },
          include: MANAGE_INCLUDE,
        });
      }
      const pendingSnapshot = editorial ? versionSnapshot(editorial.snapshot) : null;
      await this.audit.record(tx, {
        projectId: id,
        actor: reviewer,
        action: dto.decision === 'APPROVED'
          ? PROJECT_AUDIT_ACTIONS.versionPublished
          : dto.decision === 'OBSERVED'
            ? PROJECT_AUDIT_ACTIONS.versionObserved
            : PROJECT_AUDIT_ACTIONS.versionRejected,
        entityType: editorial ? 'PROJECT_VERSION' : 'PROJECT',
        entityId: editorial?.id ?? id,
        before: projectVersionSnapshot(project),
        after: dto.decision === 'APPROVED' ? projectVersionSnapshot(reviewed) : pendingSnapshot,
        metadata: {
          decision: dto.decision,
          comment: dto.comment?.trim() || null,
          editorialVersion: editorial?.number ?? null,
          publicVersionUnchanged: dto.decision !== 'APPROVED' && project.status === 'APPROVED',
          versionBefore: project.version,
          versionAfter: revision,
        },
        request,
      });
      return reviewed;
    });
    if (dto.decision === 'APPROVED') await this.gamification.onProjectApproved(project.ownerId, id);
    const decisionLabel = dto.decision === 'APPROVED' ? 'aprobado' : dto.decision === 'OBSERVED' ? 'observado' : 'rechazado';
    await this.notifications.send({
      userId: project.ownerId,
      type: 'CONTENT_REVIEW',
      title: `Tu proyecto fue ${decisionLabel}`,
      body: dto.comment?.trim() || `La revisión de “${editorial ? versionSnapshot(editorial.snapshot).title : project.title}” ya está disponible.`,
      href: '/cuenta?tab=proyectos',
      dedupeKey: `project-review:${id}:${editorial?.id ?? updated.updatedAt.toISOString()}:${dto.decision}`,
    });
    return projectWithClientIds(updated);
  }

  async pendingForReviewer(user: AuthUser) {
    const assignment = user.roles.includes('ADMIN')
      ? {}
      : {
          OR: [
            { pendingVersion: { is: { reviewerId: user.id } } },
            { pendingVersion: { is: { reviewerId: null } } },
            { AND: [{ pendingVersionId: null }, { OR: [{ reviewerId: user.id }, { reviewerId: null }] }] },
          ],
        };
    const projects = await this.prisma.project.findMany({
      where: {
        AND: [
          {
            OR: [
              { pendingVersion: { is: { status: 'PENDING' } } },
              { pendingVersionId: null, status: 'PENDING' },
            ],
          },
          assignment,
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: MINE_INCLUDE,
    });
    return projects.map((project) => projectWithVersion(project, project.pendingVersion));
  }

  async reviewPreview(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: MANAGE_INCLUDE });
    if (!project?.pendingVersion || project.pendingVersion.status !== 'PENDING') {
      throw new NotFoundException('Versión pendiente no encontrada');
    }
    const assigned = project.pendingVersion.reviewerId ?? project.reviewerId;
    if (!user.roles.includes('ADMIN') && assigned && assigned !== user.id) {
      throw new ForbiddenException('Esta revisión está asignada a otro docente');
    }
    return projectWithVersion(project, project.pendingVersion);
  }

  async versionHistory(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { members: { select: { userId: true } } },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    const canRead = user.roles.includes('ADMIN')
      || user.id === project.ownerId
      || user.id === project.reviewerId
      || project.members.some((member) => member.userId === user.id);
    if (!canRead) throw new NotFoundException('Proyecto no encontrado');
    return this.prisma.projectVersion.findMany({
      where: { projectId: id },
      orderBy: [{ number: 'desc' }, { createdAt: 'desc' }],
      include: PENDING_VERSION_INCLUDE,
    });
  }

  async mine(userId: string) {
    const items = await this.prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: MINE_INCLUDE,
    });
    if (!items.length) return [];
    const approvals = await this.prisma.approvalRequest.findMany({
      where: { targetType: 'PROJECT', targetId: { in: items.map((item) => item.id) } },
      orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { username: true, profile: { select: { fullName: true } } } } },
    });
    const byTarget = new Map<string, typeof approvals>();
    for (const approval of approvals) {
      const history = byTarget.get(approval.targetId) ?? [];
      history.push(approval);
      byTarget.set(approval.targetId, history);
    }
    return items.map((item) => ({
      ...projectWithVersion(item, item.pendingVersion),
      approvals: byTarget.get(item.id) ?? [],
    }));
  }

  async mineDetail(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: MINE_INCLUDE });
    if (!project || (project.ownerId !== user.id && !user.roles.includes('ADMIN'))) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    const approvals = await this.prisma.approvalRequest.findMany({
      where: { targetType: 'PROJECT', targetId: id },
      orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { username: true, profile: { select: { fullName: true } } } } },
    });
    return { ...projectWithVersion(project, project.pendingVersion), approvals };
  }

  async likeStatus(userId: string, id: string) {
    const project = await this.prisma.project.findUnique({ where: { id }, select: { status: true, likesCount: true } });
    if (!project || project.status !== 'APPROVED') throw new NotFoundException('Proyecto no encontrado');
    const like = await this.prisma.like.findUnique({
      where: { userId_targetType_targetId: { userId, targetType: 'PROJECT', targetId: id } },
      select: { id: true },
    });
    return { liked: !!like, likesCount: project.likesCount };
  }

  async toggleLike(user: AuthUser, id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project || project.status !== 'APPROVED') throw new NotFoundException('Proyecto no encontrado');
    if (project.ownerId === user.id) throw new BadRequestException('No puedes dar like a tu propio proyecto');

    const existing = await this.prisma.like.findUnique({
      where: { userId_targetType_targetId: { userId: user.id, targetType: 'PROJECT', targetId: id } },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.like.delete({ where: { id: existing.id } }),
        this.prisma.project.update({ where: { id }, data: { likesCount: { decrement: 1 } } }),
      ]);
      return { liked: false, likesCount: project.likesCount - 1 };
    }
    await this.prisma.$transaction([
      this.prisma.like.create({ data: { userId: user.id, targetType: 'PROJECT', targetId: id } }),
      this.prisma.project.update({ where: { id }, data: { likesCount: { increment: 1 } } }),
    ]);
    await this.gamification.award(project.ownerId, 'LIKE_RECIBIDO', 'PROJECT', `${id}:by:${user.id}`);
    return { liked: true, likesCount: project.likesCount + 1 };
  }

  async addComment(user: AuthUser, id: string, dto: CommentDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project || project.status !== 'APPROVED') throw new NotFoundException('Proyecto no encontrado');
    return this.prisma.comment.create({
      data: { targetType: 'PROJECT', targetId: id, authorId: user.id, body: clean(dto.body) ?? '' },
      include: { author: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } } },
    });
  }

  async remove(
    user: AuthUser,
    id: string,
    expectedVersion: number | undefined,
    request: ProjectAuditRequestContext,
  ) {
    const { project, access } = await this.managedProject(user, id);
    if (!access.canManageMembers) throw new ForbiddenException('Solo el líder o un administrador pueden archivar el proyecto');
    this.assertExpectedVersion(project.version, expectedVersion);
    if (project.status === 'ARCHIVED') throw new BadRequestException('El proyecto ya está archivado');
    return this.prisma.$transaction(async (tx) => {
      const version = await this.bumpVersion(tx, id, project.version);
      const archived = await tx.project.update({
        where: { id },
        data: { status: 'ARCHIVED', isFeatured: false, recruiting: false },
        include: MANAGE_INCLUDE,
      });
      await this.audit.record(tx, {
        projectId: id,
        actor: user,
        action: PROJECT_AUDIT_ACTIONS.archived,
        entityType: 'PROJECT',
        entityId: id,
        before: editableProjectSnapshot(project),
        after: editableProjectSnapshot(archived),
        metadata: { versionBefore: project.version, versionAfter: version },
        request,
      });
      return { ok: true, archived: true, version };
    });
  }
}

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Vitrina pública de proyectos aprobados con filtros' })
  list(@Query() query: ListProjectsQueryDto) {
    return this.projects.list(query);
  }

  @Get('manage/mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Proyectos que puedo gestionar como líder, colaborador o administrador' })
  manageable(@CurrentUser() user: AuthUser) {
    return this.projects.manageable(user);
  }

  @Get('audit/recent')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Actividad reciente de todos los proyectos, con señales de riesgo' })
  recentAudit(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.projects.recentAudit(user, query);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mis proyectos en todos los estados' })
  mine(@CurrentUser() user: AuthUser) {
    return this.projects.mine(user.id);
  }

  @Get('mine/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle editable de uno de mis proyectos' })
  mineDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.mineDetail(user, id);
  }

  @Get(':id/manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle de gestión para líder, integrante o administrador' })
  manageDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.manageDetail(user, id);
  }

  @Get(':id/milestones')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Calendario e hitos del proyecto gestionable' })
  milestones(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.milestones(user, id);
  }

  @Get(':id/audit')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Bitácora inmutable de un proyecto' })
  auditHistory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: any) {
    return this.projects.auditHistory(user, id, query);
  }

  @Get('review/pending')
  @Roles('TEACHER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Docente/Admin] Proyectos pendientes de revisión' })
  pending(@CurrentUser() user: AuthUser) {
    return this.projects.pendingForReviewer(user);
  }

  @Get(':id/review-preview')
  @Roles('TEACHER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Docente/Admin] Vista previa exacta de la versión sometida a revisión' })
  reviewPreview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.reviewPreview(user, id);
  }

  @Get(':id/versions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historial editorial de versiones publicadas, pendientes, observadas y rechazadas' })
  versions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.versionHistory(user, id);
  }

  @Get(':id/like-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado de mi like para sincronizar la interfaz autenticada' })
  likeStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.likeStatus(user.id, id);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Detalle de proyecto (aprobado, o propio/en revisión para autor y docentes)' })
  detail(@Param('slug') slug: string, @CurrentUser() user: AuthUser | null) {
    return this.projects.detail(slug, user);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publicar proyecto → queda PENDIENTE hasta aprobación docente' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto, @Req() request: Request) {
    return this.projects.create(user, dto, projectAuditRequestContext(request));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar mi proyecto; con resubmit=true reenvía a revisión' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto, @Req() request: Request) {
    return this.projects.update(user, id, dto, projectAuditRequestContext(request));
  }

  @Post(':id/milestones')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agregar una fecha o hito al calendario del proyecto' })
  createMilestone(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateProjectMilestoneDto,
    @Req() request: Request,
  ) {
    return this.projects.createMilestone(user, id, dto, projectAuditRequestContext(request));
  }

  @Patch(':id/milestones/:milestoneId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar una fecha o hito del proyecto' })
  updateMilestone(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateProjectMilestoneDto,
    @Req() request: Request,
  ) {
    return this.projects.updateMilestone(user, id, milestoneId, dto, projectAuditRequestContext(request));
  }

  @Delete(':id/milestones/:milestoneId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar de forma auditable un hito del proyecto' })
  deleteMilestone(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Query() dto: ExpectedProjectVersionDto,
    @Req() request: Request,
  ) {
    return this.projects.deleteMilestone(user, id, milestoneId, dto.expectedVersion, projectAuditRequestContext(request));
  }

  @Post(':id/gallery')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adjuntar a la galería una imagen previamente subida' })
  attachGallery(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AttachProjectMediaDto,
    @Req() request: Request,
  ) {
    return this.projects.attachGalleryMedia(user, id, dto, projectAuditRequestContext(request));
  }

  @Delete(':id/gallery/:mediaId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archivar una imagen de galería (reversible por ADMIN)' })
  archiveGallery(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Query() dto: ExpectedProjectVersionDto,
    @Req() request: Request,
  ) {
    return this.projects.archiveGalleryMedia(user, id, mediaId, dto.expectedVersion, projectAuditRequestContext(request));
  }

  @Post(':id/audit/:auditId/rollback')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Revertir una edición sin eliminar la evidencia original' })
  rollbackAudit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('auditId') auditId: string,
    @Body() dto: RollbackProjectAuditDto,
    @Req() request: Request,
  ) {
    return this.projects.rollbackAudit(user, id, auditId, dto, projectAuditRequestContext(request));
  }

  @Post(':id/review')
  @Roles('TEACHER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Docente/Admin] Aprobar, observar o rechazar y aplicar la regla configurada' })
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto, @Req() request: Request) {
    return this.projects.review(user, id, dto, projectAuditRequestContext(request));
  }

  @Post(':id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dar/quitar like (sin self-like; +1 pt al autor con límite diario)' })
  like(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.toggleLike(user, id);
  }

  @Post(':id/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comentar un proyecto' })
  comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.projects.addComment(user, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar mi proyecto (o admin)' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() dto: ExpectedProjectVersionDto,
    @Req() request: Request,
  ) {
    return this.projects.remove(user, id, dto.expectedVersion, projectAuditRequestContext(request));
  }
}

@Module({
  imports: [IncubatorClientsModule],
  providers: [ProjectsService],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
