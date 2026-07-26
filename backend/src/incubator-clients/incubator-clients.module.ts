import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Prisma, RoleName } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { paginate } from '../common/utils';
import { normalizeSafeLogoUrl } from '../institution/institution.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule, StorageService } from '../storage/storage.module';

const CLIENT_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_CLIENT_LOGO_SIZE = 8 * 1024 * 1024;

type ClientDatabase = PrismaService | Prisma.TransactionClient;

const CLIENT_PUBLIC_SELECT = {
  id: true,
  name: true,
  logoUrl: true,
} as const;

export function normalizeIncubatorClientName(value: string) {
  if (typeof value !== 'string') throw new BadRequestException('El nombre del cliente debe ser texto');
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const normalizedName = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es');
  return { name, normalizedName };
}

export function validateIncubatorClientName(value: string) {
  const normalized = normalizeIncubatorClientName(value);
  if (
    normalized.name.length < 2
    || normalized.name.length > 160
    || !normalized.normalizedName
  ) {
    throw new BadRequestException('El nombre del cliente debe tener entre 2 y 160 caracteres');
  }
  return normalized;
}

export function normalizeIncubatorClientIds(values: string[] = []) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new BadRequestException('clientIds debe ser una lista de identificadores');
  }
  if (values.length > 30) throw new BadRequestException('No puedes asociar más de 30 clientes');
  const ids = values.map((value) => value.trim());
  if (ids.some((id) => !id)) {
    throw new BadRequestException('Los identificadores de cliente no pueden estar vacíos');
  }
  if (ids.some((id) => id.length > 64)) {
    throw new BadRequestException('Uno de los identificadores de cliente no es válido');
  }
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('No repitas clientes en un mismo proyecto');
  }
  return ids;
}

export class CreateIncubatorClientDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Matches(/\S/)
  name: string;

  @ApiPropertyOptional({
    description: 'URL de una imagen propia y aún no vinculada, devuelta por POST /media/upload. Es opcional al enviar file en multipart.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2_048)
  logoUrl?: string;
}

export class UpdateIncubatorClientDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Matches(/\S/)
  name?: string;

  @ApiPropertyOptional({
    description: 'URL de una imagen propia y aún no vinculada, devuelta por POST /media/upload.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2_048)
  logoUrl?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class ListIncubatorClientsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: 'true' | 'false';
}

@Injectable()
export class IncubatorClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async resolveActive(ids: string[], db: ClientDatabase = this.prisma) {
    const normalizedIds = normalizeIncubatorClientIds(ids);
    if (!normalizedIds.length) return [];
    const clients = await db.incubatorClient.findMany({
      where: { id: { in: normalizedIds }, isActive: true },
      select: { id: true, name: true, logoUrl: true, isActive: true },
    });
    if (clients.length !== normalizedIds.length) {
      throw new BadRequestException('Uno o más clientes no existen o están desactivados');
    }
    const byId = new Map(clients.map((client) => [client.id, client]));
    return normalizedIds.map((id) => byId.get(id)!);
  }

  async resolveForProjectUpdate(
    ids: string[],
    existingClientIds: string[],
    db: ClientDatabase = this.prisma,
  ) {
    const normalizedIds = normalizeIncubatorClientIds(ids);
    if (!normalizedIds.length) return [];
    const clients = await db.incubatorClient.findMany({
      where: { id: { in: normalizedIds } },
      select: { id: true, name: true, logoUrl: true, isActive: true },
    });
    if (clients.length !== normalizedIds.length) {
      throw new BadRequestException('Uno o más clientes no existen');
    }
    const existing = new Set(existingClientIds);
    const inactiveNewClients = clients.filter((client) => !client.isActive && !existing.has(client.id));
    if (inactiveNewClients.length) {
      throw new BadRequestException('No puedes agregar un cliente desactivado a un proyecto');
    }
    const byId = new Map(clients.map((client) => [client.id, client]));
    return normalizedIds.map((id) => byId.get(id)!);
  }

  private where(query: ListIncubatorClientsDto, admin: boolean): Prisma.IncubatorClientWhereInput {
    const normalizedQuery = query.q ? normalizeIncubatorClientName(query.q).normalizedName : '';
    return {
      ...(admin && query.isActive !== undefined
        ? { isActive: query.isActive === 'true' }
        : admin ? {} : { isActive: true }),
      ...(normalizedQuery
        ? { normalizedName: { contains: normalizedQuery, mode: 'insensitive' } }
        : {}),
    };
  }

  async listPublic(query: ListIncubatorClientsDto) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const where = this.where(query, false);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.incubatorClient.count({ where }),
      this.prisma.incubatorClient.findMany({
        where,
        select: CLIENT_PUBLIC_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take,
        skip,
      }),
    ]);
    return { items, total, page, limit: take, pages: Math.max(1, Math.ceil(total / take)) };
  }

  async listAdmin(query: ListIncubatorClientsDto) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const where = this.where(query, true);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.incubatorClient.count({ where }),
      this.prisma.incubatorClient.findMany({
        where,
        include: { _count: { select: { projects: true } } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        take,
        skip,
      }),
    ]);
    const items = rows.map(({ _count, ...client }) => ({
      ...client,
      projectCount: _count.projects,
    }));
    return { items, total, page, limit: take, pages: Math.max(1, Math.ceil(total / take)) };
  }

  private safeLogoUrl(raw: string | undefined) {
    const logoUrl = normalizeSafeLogoUrl(raw);
    if (!logoUrl) throw new BadRequestException('Debes proporcionar un logo con una URL válida o adjuntar una imagen');
    return logoUrl;
  }

  private assertImage(file?: Express.Multer.File) {
    if (!file) return;
    if (!CLIENT_LOGO_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('El logo debe ser una imagen PNG, JPG, WEBP o GIF');
    }
  }

  private duplicateError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un cliente con ese nombre');
    }
    throw error;
  }

  async create(actor: AuthUser, dto: CreateIncubatorClientDto, file?: Express.Multer.File) {
    this.assertImage(file);
    if (file && dto.logoUrl !== undefined) {
      throw new BadRequestException('Envía el logo como archivo o URL, no ambos');
    }
    const normalized = validateIncubatorClientName(dto.name);
    const duplicate = await this.prisma.incubatorClient.findUnique({
      where: { normalizedName: normalized.normalizedName },
      select: { ...CLIENT_PUBLIC_SELECT, isActive: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message: duplicate.isActive
          ? 'Ya existe un cliente con ese nombre; selecciona el registro existente'
          : 'Ese cliente existe, pero está desactivado; solicita su reactivación a un administrador',
        existingClient: duplicate,
      });
    }

    const asset = file ? await this.storage.upload(actor, file) : null;
    const logoUrl = asset?.url ?? this.safeLogoUrl(dto.logoUrl);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.storage.assertOwnedUnlinkedImageUrl(actor.id, logoUrl, tx);
        const client = await tx.incubatorClient.create({
          data: { ...normalized, logoUrl },
          select: CLIENT_PUBLIC_SELECT,
        });
        await this.audit.record(tx, {
          actor,
          action: 'INCUBATOR_CLIENT_CREATED',
          entityType: 'INCUBATOR_CLIENT',
          entityId: client.id,
          after: client,
        });
        return client;
      });
    } catch (error) {
      if (asset) await this.storage.removeRecordAndObject(asset.id).catch(() => undefined);
      return this.duplicateError(error);
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateIncubatorClientDto) {
    const before = await this.prisma.incubatorClient.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Cliente no encontrado');
    const normalized = dto.name === undefined ? {} : validateIncubatorClientName(dto.name);
    const logoUrl = dto.logoUrl === undefined ? undefined : this.safeLogoUrl(dto.logoUrl);
    const logoChanged = logoUrl !== undefined && logoUrl !== before.logoUrl;
    const data: Prisma.IncubatorClientUpdateInput = {
      ...normalized,
      ...(logoUrl === undefined ? {} : { logoUrl }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
    };
    if (!Object.keys(data).length) throw new BadRequestException('No se recibió ningún cambio');
    const changed = Object.entries(data).some(([key, value]) => before[key as keyof typeof before] !== value);
    if (!changed) throw new BadRequestException('Los datos enviados no contienen cambios efectivos');

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (logoChanged) {
          await this.storage.assertOwnedUnlinkedImageUrl(actor.id, logoUrl!, tx);
        }
        const client = await tx.incubatorClient.update({ where: { id }, data });
        await this.audit.record(tx, {
          actor,
          action: !before.isActive && client.isActive
            ? 'INCUBATOR_CLIENT_REACTIVATED'
            : before.isActive && !client.isActive
              ? 'INCUBATOR_CLIENT_DEACTIVATED'
              : 'INCUBATOR_CLIENT_UPDATED',
          entityType: 'INCUBATOR_CLIENT',
          entityId: id,
          before,
          after: client,
        });
        return client;
      });
    } catch (error) {
      return this.duplicateError(error);
    }
  }

  async replaceLogo(actor: AuthUser, id: string, file?: Express.Multer.File) {
    this.assertImage(file);
    if (!file) throw new BadRequestException('Archivo requerido (campo "file")');
    const before = await this.prisma.incubatorClient.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Cliente no encontrado');
    const asset = await this.storage.upload(actor, file);
    try {
      return await this.update(actor, id, { logoUrl: asset.url });
    } catch (error) {
      await this.storage.removeRecordAndObject(asset.id).catch(() => undefined);
      throw error;
    }
  }

  async deactivate(actor: AuthUser, id: string) {
    const client = await this.prisma.incubatorClient.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (!client.isActive) return client;
    return this.update(actor, id, { isActive: false });
  }
}

@ApiTags('incubator clients')
@Controller('incubator/clients')
export class IncubatorClientsController {
  constructor(private readonly clients: IncubatorClientsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Buscar clientes activos de Incubadora' })
  list(@Query() query: ListIncubatorClientsDto) {
    return this.clients.listPublic(query);
  }

  @Post()
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_CLIENT_LOGO_SIZE, files: 1, fields: 2, parts: 4 },
    fileFilter: (_request, file, callback) => {
      if (!CLIENT_LOGO_MIMES.includes(file.mimetype)) {
        callback(new BadRequestException('El logo debe ser una imagen PNG, JPG, WEBP o GIF'), false);
        return;
      }
      callback(null, true);
    },
  }))
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        logoUrl: {
          type: 'string',
          description: 'URL de una imagen propia y aún no vinculada, devuelta por POST /media/upload.',
        },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Registrar un cliente reutilizable desde el formulario de proyecto' })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateIncubatorClientDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.clients.create(actor, dto, file);
  }
}

@ApiTags('admin incubator clients')
@ApiBearerAuth()
@Roles(RoleName.ADMIN)
@Controller('admin/incubator/clients')
export class AdminIncubatorClientsController {
  constructor(private readonly clients: IncubatorClientsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Listar todos los clientes, incluidos los desactivados' })
  list(@Query() query: ListIncubatorClientsDto) {
    return this.clients.listAdmin(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Editar o reactivar un cliente' })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncubatorClientDto,
  ) {
    return this.clients.update(actor, id, dto);
  }

  @Post(':id/logo')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_CLIENT_LOGO_SIZE, files: 1, fields: 0, parts: 2 },
    fileFilter: (_request, file, callback) => {
      if (!CLIENT_LOGO_MIMES.includes(file.mimetype)) {
        callback(new BadRequestException('El logo debe ser una imagen PNG, JPG, WEBP o GIF'), false);
        return;
      }
      callback(null, true);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: '[Admin] Reemplazar el logo de un cliente conservando el anterior si falla' })
  replaceLogo(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.clients.replaceLogo(actor, id, file);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Desactivar un cliente sin romper proyectos históricos' })
  deactivate(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.clients.deactivate(actor, id);
  }
}

@Module({
  imports: [StorageModule],
  providers: [IncubatorClientsService],
  controllers: [IncubatorClientsController, AdminIncubatorClientsController],
  exports: [IncubatorClientsService],
})
export class IncubatorClientsModule {}
