import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';
import { EventCategory, MembershipRole, Prisma, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { CurrentUser, Public, Roles, AuthUser } from '../common/decorators';
import { uniqueSlug } from '../common/utils';
import { StorageModule, StorageService } from '../storage/storage.module';
import { NotificationsService } from '../notifications/notifications.module';

const WEB_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class UpsertEventDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(140) title: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(10_000) description: string;
  @ApiProperty({ enum: EventCategory }) @IsEnum(EventCategory) category: EventCategory;
  @ApiProperty({ example: '2026-08-10T14:00:00.000Z' }) @IsDateString() startsAt: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(120) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isOnline?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) meetingUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) rulesUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUrl(WEB_URL_OPTIONS) @MaxLength(2048) coverUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) capacity?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) communitySlug?: string | null;
}

export class UpdateEventDto extends PartialType(UpsertEventDto) {}

const MAX_EVENT_GALLERY_IMAGES = 12;
const ACTIVE_REGISTRATION_STATUSES: RegistrationStatus[] = [RegistrationStatus.REGISTERED, RegistrationStatus.ATTENDED];

export class EventGalleryDto {
  @ApiProperty({ type: [String], description: 'IDs devueltos por POST /media/upload' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EVENT_GALLERY_IMAGES)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  imageIds: string[];
}

export class UpdateAttendanceDto {
  @ApiProperty({ enum: RegistrationStatus })
  @IsEnum(RegistrationStatus)
  status: RegistrationStatus;
}

const EVENT_INCLUDE = {
  organizer: { select: { username: true, profile: { select: { fullName: true } } } },
  community: { select: { slug: true, name: true, accentColor: true } },
  _count: { select: { registrations: { where: { status: { in: ACTIVE_REGISTRATION_STATUSES } } } } },
  gallery: {
    orderBy: { createdAt: 'asc' as const },
    take: MAX_EVENT_GALLERY_IMAGES,
    select: { id: true, url: true, mime: true, sizeBytes: true, width: true, height: true, createdAt: true },
  },
} as const;

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  async list(q: any, viewer?: AuthUser | null) {
    const where: any = { status: 'APPROVED' };
    if (q.category) where.category = q.category;
    if (q.community) where.community = { slug: q.community };
    if (q.when === 'upcoming') where.startsAt = { gte: new Date() };
    if (q.when === 'past') where.startsAt = { lt: new Date() };
    const items = await this.prisma.event.findMany({
      where,
      orderBy: { startsAt: q.when === 'past' ? 'desc' : 'asc' },
      take: 50,
      include: EVENT_INCLUDE,
    });
    let myRegistrations: string[] = [];
    if (viewer) {
      const regs = await this.prisma.eventRegistration.findMany({
        where: { userId: viewer.id, status: { in: ACTIVE_REGISTRATION_STATUSES } },
        select: { eventId: true },
      });
      myRegistrations = regs.map((r) => r.eventId);
    }
    return {
      items: items.map((event) => ({
        ...event,
        isPast: event.startsAt.getTime() <= Date.now(),
        meetingUrl: viewer && (myRegistrations.includes(event.id) || event.organizerId === viewer.id || viewer.roles.includes('ADMIN'))
          ? event.meetingUrl
          : null,
      })),
      myRegistrations,
    };
  }

  async detail(slug: string, viewer?: AuthUser | null) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        ...EVENT_INCLUDE,
        news: {
          where: { status: 'APPROVED' },
          orderBy: { publishedAt: 'desc' },
          take: 6,
          include: {
            author: { select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } } },
            community: { select: { slug: true, name: true, accentColor: true } },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    let registered = false;
    if (viewer) {
      registered = !!(await this.prisma.eventRegistration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: viewer.id } },
      }).then((r) => r && ACTIVE_REGISTRATION_STATUSES.includes(r.status)));
    }
    const canManage = !!viewer && (event.organizerId === viewer.id || viewer.roles.includes('ADMIN') || await this.canManageCommunity(viewer, event.communityId));
    if (event.status !== 'APPROVED' && !canManage) throw new NotFoundException('Evento no encontrado');
    return { ...event, meetingUrl: registered || canManage ? event.meetingUrl : null, registered, isPast: event.startsAt.getTime() <= Date.now() };
  }

  async register(user: AuthUser, slug: string) {
    let awardPoints = false;
    const result = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { slug },
        include: { _count: { select: { registrations: { where: { status: { in: ACTIVE_REGISTRATION_STATUSES } } } } } },
      });
      if (!event) throw new NotFoundException('Evento no encontrado');
      if (event.status !== 'APPROVED') throw new BadRequestException('El evento no está disponible para inscripciones');
      if (event.startsAt.getTime() <= Date.now()) throw new BadRequestException('El evento ya comenzó o finalizó');
      const existing = await tx.eventRegistration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
      });
      if (existing && ACTIVE_REGISTRATION_STATUSES.includes(existing.status)) {
        return { registered: true, alreadyRegistered: true };
      }
      if (event.capacity && event._count.registrations >= event.capacity) {
        throw new ForbiddenException('El evento ya alcanzó su capacidad máxima');
      }
      if (existing) {
        await tx.eventRegistration.update({ where: { id: existing.id }, data: { status: 'REGISTERED' } });
        return { registered: true };
      }
      await tx.eventRegistration.create({ data: { eventId: event.id, userId: user.id } });
      awardPoints = true;
      return { registered: true, pointsAwarded: 5, eventId: event.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (awardPoints && 'eventId' in result) {
      const event = await this.prisma.event.findUnique({
        where: { id: result.eventId },
        select: { id: true, slug: true, title: true, organizerId: true },
      });
      if (event) {
        await this.notifications.send({
          userId: user.id,
          type: 'EVENT_REGISTRATION',
          title: 'Inscripción confirmada',
          body: `Tu lugar en “${event.title}” quedó registrado.`,
          href: `/eventos/${event.slug}`,
          dedupeKey: `event-registration:${event.id}:${user.id}`,
        });
        if (event.organizerId !== user.id) {
          await this.notifications.send({
            userId: event.organizerId,
            type: 'EVENT_REGISTRATION',
            title: 'Nueva inscripción en tu evento',
            body: `@${user.username} se inscribió en “${event.title}”.`,
            href: `/eventos/${event.slug}`,
            dedupeKey: `event-organizer-registration:${event.id}:${user.id}`,
          });
        }
      }
      await this.gamification.award(user.id, 'INSCRIPCION_EVENTO', 'EVENT', result.eventId);
      const { eventId, ...response } = result;
      return response;
    }
    return result;
  }

  async unregister(user: AuthUser, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    await this.prisma.eventRegistration.updateMany({
      where: { eventId: event.id, userId: user.id },
      data: { status: 'CANCELLED' },
    });
    return { registered: false };
  }

  async attendees(user: AuthUser, slug: string) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    const canSee = user.roles.includes('ADMIN') || event.organizerId === user.id
      || await this.canManageCommunity(user, event.communityId);
    if (!canSee) throw new ForbiddenException('Sin permisos para ver inscritos');
    return this.prisma.eventRegistration.findMany({
      where: { eventId: event.id, status: { in: [RegistrationStatus.REGISTERED, RegistrationStatus.ATTENDED] } },
      include: { user: { select: { username: true, email: true, profile: { select: { fullName: true, semester: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateAttendance(user: AuthUser, slug: string, registrationId: string, dto: UpdateAttendanceDto) {
    const event = await this.prisma.event.findUnique({ where: { slug } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    const canManage = user.roles.includes('ADMIN') || event.organizerId === user.id
      || await this.canManageCommunity(user, event.communityId);
    if (!canManage) throw new ForbiddenException('No puedes gestionar la asistencia de este evento');
    const registration = await this.prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!registration || registration.eventId !== event.id) throw new NotFoundException('Inscripción no encontrada');
    return this.prisma.eventRegistration.update({ where: { id: registrationId }, data: { status: dto.status } });
  }

  async addGalleryImages(user: AuthUser, id: string, dto: EventGalleryDto) {
    const imageIds = [...new Set(dto.imageIds)];
    if (imageIds.length !== dto.imageIds.length) throw new BadRequestException('No repitas imágenes en la galería');
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true, communityId: true },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    const canManage = user.roles.includes('ADMIN') || event.organizerId === user.id
      || await this.canManageCommunity(user, event.communityId);
    if (!canManage) throw new ForbiddenException('No puedes administrar la galería de este evento');
    return this.prisma.$transaction(async (tx) => {
      const currentImages = await tx.mediaAsset.count({ where: { eventId: id } });
      if (currentImages + imageIds.length > MAX_EVENT_GALLERY_IMAGES) {
        throw new BadRequestException(`La galería admite hasta ${MAX_EVENT_GALLERY_IMAGES} imágenes`);
      }
      await this.storage.assertOwnedUnlinkedImages(tx, user.id, imageIds);
      const updated = await tx.event.update({
        where: { id },
        data: { gallery: { connect: imageIds.map((imageId) => ({ id: imageId })) } },
        include: { gallery: EVENT_INCLUDE.gallery },
      });
      return updated.gallery;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async galleryAccess(user: AuthUser, id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: { organizerId: true, communityId: true },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    const canManage = user.roles.includes('ADMIN') || event.organizerId === user.id
      || await this.canManageCommunity(user, event.communityId);
    return { canManage };
  }

  async removeGalleryImage(user: AuthUser, id: string, imageId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true, communityId: true },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    const canManage = user.roles.includes('ADMIN') || event.organizerId === user.id
      || await this.canManageCommunity(user, event.communityId);
    if (!canManage) throw new ForbiddenException('No puedes administrar la galería de este evento');
    const image = await this.prisma.mediaAsset.findFirst({ where: { id: imageId, eventId: id }, select: { id: true } });
    if (!image) throw new NotFoundException('Imagen no encontrada en esta galería');
    await this.storage.removeRecordAndObject(image.id);
    return this.prisma.mediaAsset.findMany({ where: { eventId: id }, orderBy: { createdAt: 'asc' }, select: EVENT_INCLUDE.gallery.select });
  }

  private async resolveCommunity(communitySlug?: string | null) {
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
    throw new ForbiddenException('Solo puedes gestionar eventos de tu comunidad');
  }

  private validateSchedule(startsAt: Date, endsAt?: Date | null) {
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('La fecha de finalización debe ser posterior al inicio');
    }
  }

  async create(user: AuthUser, dto: UpsertEventDto) {
    const communityId = await this.resolveCommunity(dto.communitySlug);
    if (user.roles.includes('COMMUNITY_LEADER') && !user.roles.includes('ADMIN') && !user.roles.includes('TEACHER')) {
      await this.assertCanManageCommunity(user, communityId);
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    this.validateSchedule(startsAt, endsAt);
    const { communitySlug, ...rest } = dto;
    return this.prisma.event.create({
      data: {
        ...rest,
        startsAt,
        endsAt,
        slug: uniqueSlug(dto.title),
        organizerId: user.id,
        communityId,
      },
    });
  }

  async update(user: AuthUser, id: string, dto: Partial<UpsertEventDto>) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.organizerId !== user.id && !user.roles.includes('ADMIN') && !await this.canManageCommunity(user, event.communityId)) {
      throw new ForbiddenException('No puedes editar este evento');
    }
    const communitySpecified = Object.prototype.hasOwnProperty.call(dto, 'communitySlug');
    const communityId = communitySpecified ? await this.resolveCommunity(dto.communitySlug) : undefined;
    if (user.roles.includes('COMMUNITY_LEADER') && !user.roles.includes('ADMIN') && !user.roles.includes('TEACHER')) {
      await this.assertCanManageCommunity(user, communityId ?? event.communityId);
    }
    const { communitySlug, ...rest } = dto;
    const data: any = { ...rest };
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : event.startsAt;
    const endsAt = dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : event.endsAt;
    this.validateSchedule(startsAt, endsAt);
    if (dto.startsAt) data.startsAt = startsAt;
    if (dto.endsAt !== undefined) data.endsAt = endsAt;
    if (communitySpecified) data.communityId = communityId ?? null;
    return this.prisma.event.update({ where: { id }, data });
  }

  async remove(user: AuthUser, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id }, include: { gallery: { select: { key: true, provider: true } } } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event.organizerId !== user.id && !user.roles.includes('ADMIN') && !await this.canManageCommunity(user, event.communityId)) {
      throw new ForbiddenException('No puedes eliminar este evento');
    }
    await this.prisma.event.delete({ where: { id } });
    await Promise.allSettled(event.gallery.map((asset) => this.storage.removeStoredObject(asset)));
    return { ok: true };
  }
}

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private events: EventsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Eventos: próximos/pasados, por categoría o comunidad' })
  list(@Query() query: any, @CurrentUser() user: AuthUser | null) {
    return this.events.list(query, user);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Detalle de evento' })
  detail(@Param('slug') slug: string, @CurrentUser() user: AuthUser | null) {
    return this.events.detail(slug, user);
  }

  @Post(':slug/register')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inscribirse (+5 pts la primera vez)' })
  register(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.events.register(user, slug);
  }

  @Post(':slug/unregister')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancelar inscripción' })
  unregister(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.events.unregister(user, slug);
  }

  @Get(':slug/attendees')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Organizador/Líder/Docente/Admin] Lista de inscritos' })
  attendees(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.events.attendees(user, slug);
  }

  @Patch(':slug/attendees/:registrationId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Organizador/Líder/Admin] Marcar asistencia o actualizar inscripción' })
  updateAttendance(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.events.updateAttendance(user, slug, registrationId, dto);
  }

  @Post(':id/gallery')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Organizador/Líder/Admin] Vincular imágenes ya optimizadas a la galería' })
  addGalleryImages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EventGalleryDto) {
    return this.events.addGalleryImages(user, id, dto);
  }

  @Get(':id/gallery/manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comprobar si puedo administrar la galería del evento' })
  galleryAccess(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.galleryAccess(user, id);
  }

  @Delete(':id/gallery/:imageId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Organizador/Líder/Admin] Quitar una imagen y liberar el archivo físico' })
  removeGalleryImage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('imageId') imageId: string) {
    return this.events.removeGalleryImage(user, id, imageId);
  }

  @Post()
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin/Líder/Docente] Crear evento' })
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertEventDto) {
    return this.events.create(user, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar evento (organizador o admin)' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'COMMUNITY_LEADER', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar evento (organizador o admin)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.remove(user, id);
  }
}

@Module({
  imports: [StorageModule],
  providers: [EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
