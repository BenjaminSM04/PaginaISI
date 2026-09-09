import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsIn, IsObject, Min, Max, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule, StorageService } from '../storage/storage.module';

const SETTINGS_ID = 'default';
const LOGO_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_LOGO_SIZE = 8 * 1024 * 1024;

const INSTITUTION_SELECT = {
  institutionName: true,
  shortName: true,
  careerName: true,
  institutionalLogoUrl: true,
  careerLogoUrl: true,
  institutionalLogoDarkUrl: true,
  careerLogoDarkUrl: true,
  faviconUrl: true,
  logoMaxHeight: true,
  logoMaxWidth: true,
  logoObjectFit: true,
  theme: true,
  updatedAt: true,
} as const;

export const LOGO_FIELDS = {
  institutional: 'institutionalLogoUrl', career: 'careerLogoUrl',
  'institutional-dark': 'institutionalLogoDarkUrl', 'career-dark': 'careerLogoDarkUrl', favicon: 'faviconUrl',
} as const;
export type InstitutionLogoKind = keyof typeof LOGO_FIELDS;

export function normalizeTheme(value: unknown): Record<string, Record<string, string>> {
  if (value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('El tema debe ser un objeto');
  const allowed = new Set(['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted', 'border', 'success', 'warning', 'danger', 'info', 'gold']);
  const result: Record<string, Record<string, string>> = {};
  for (const [mode, palette] of Object.entries(value)) {
    if (!['light', 'dark'].includes(mode) || !palette || typeof palette !== 'object' || Array.isArray(palette)) throw new BadRequestException('Usa paletas light y dark');
    result[mode] = {};
    for (const [name, color] of Object.entries(palette)) {
      if (!allowed.has(name) || typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new BadRequestException('Color o token no válido: ' + name);
      result[mode][name] = color.toLowerCase();
    }
  }
  return result;
}

export function normalizeSafeLogoUrl(value: string | null | undefined) {
  if (value === undefined || value === null) return value;
  const url = value.trim();
  if (
    !url
    || url.length > 2_048
    || /[\u0000-\u001F\u007F\\]/.test(url)
    || /%(?:2f|5c)/i.test(url)
  ) return null;
  if (url.startsWith('/') && !url.startsWith('//')) {
    try {
      const parsed = new URL(url, 'https://portal.isi.invalid');
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeInstitutionLabel(value: string, label: string, maxLength: number) {
  if (typeof value !== 'string') throw new BadRequestException(`${label} debe ser texto`);
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > maxLength) {
    throw new BadRequestException(`${label} debe tener entre 2 y ${maxLength} caracteres`);
  }
  return normalized;
}

export class UpdateInstitutionDto {
  @IsOptional() @IsObject()
  theme?: Record<string, Record<string, string>> | null;

  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(24) @Max(96)
  logoMaxHeight?: number;

  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(48) @Max(240)
  logoMaxWidth?: number;

  @ValidateIf((_object, value) => value !== undefined) @IsIn(['contain', 'scale-down'])
  logoObjectFit?: 'contain' | 'scale-down';

  @IsOptional() @IsString() @MaxLength(2048)
  institutionalLogoDarkUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(2048)
  careerLogoDarkUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(2048)
  faviconUrl?: string | null;

  @ApiPropertyOptional({ example: 'Universidad Privada del Valle' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Matches(/\S/)
  institutionName?: string;

  @ApiPropertyOptional({ example: 'Univalle' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/\S/)
  shortName?: string;

  @ApiPropertyOptional({ example: 'Carrera de Ingeniería de Sistemas' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Matches(/\S/)
  careerName?: string;

  @ApiPropertyOptional({ nullable: true, description: 'URL HTTP(S) o ruta pública absoluta' })
  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  institutionalLogoUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'URL HTTP(S) o ruta pública absoluta' })
  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  careerLogoUrl?: string | null;
}

@Injectable()
export class InstitutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  get() {
    return this.prisma.institutionalSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
      select: INSTITUTION_SELECT,
    });
  }

  private normalizeUpdate(dto: UpdateInstitutionDto) {
    const extra: Partial<Pick<UpdateInstitutionDto, 'institutionalLogoDarkUrl' | 'careerLogoDarkUrl' | 'faviconUrl'>> = {};
    for (const field of ['institutionalLogoDarkUrl', 'careerLogoDarkUrl', 'faviconUrl'] as const) {
      if (dto[field] === undefined) continue;
      const normalized = normalizeSafeLogoUrl(dto[field]);
      if (dto[field] !== null && !normalized) throw new BadRequestException('URL de imagen no válida');
      extra[field] = normalized;
    }
    const institutionalLogoUrl = normalizeSafeLogoUrl(dto.institutionalLogoUrl);
    const careerLogoUrl = normalizeSafeLogoUrl(dto.careerLogoUrl);
    if (dto.institutionalLogoUrl !== undefined && dto.institutionalLogoUrl !== null && !institutionalLogoUrl) {
      throw new BadRequestException('La URL del logo institucional no es válida');
    }
    if (dto.careerLogoUrl !== undefined && dto.careerLogoUrl !== null && !careerLogoUrl) {
      throw new BadRequestException('La URL del logo de la carrera no es válida');
    }
    return {
      ...extra,
      ...(dto.theme === undefined ? {} : { theme: normalizeTheme(dto.theme) }),
      ...(dto.logoMaxHeight === undefined ? {} : { logoMaxHeight: dto.logoMaxHeight }),
      ...(dto.logoMaxWidth === undefined ? {} : { logoMaxWidth: dto.logoMaxWidth }),
      ...(dto.logoObjectFit === undefined ? {} : { logoObjectFit: dto.logoObjectFit }),
      ...(dto.institutionName === undefined
        ? {}
        : { institutionName: normalizeInstitutionLabel(dto.institutionName, 'El nombre institucional', 160) }),
      ...(dto.shortName === undefined
        ? {}
        : { shortName: normalizeInstitutionLabel(dto.shortName, 'El nombre corto', 80) }),
      ...(dto.careerName === undefined
        ? {}
        : { careerName: normalizeInstitutionLabel(dto.careerName, 'El nombre de la carrera', 160) }),
      ...(dto.institutionalLogoUrl === undefined ? {} : { institutionalLogoUrl }),
      ...(dto.careerLogoUrl === undefined ? {} : { careerLogoUrl }),
    };
  }

  async update(actor: AuthUser, dto: UpdateInstitutionDto) {
    const data = this.normalizeUpdate(dto);
    if (!Object.keys(data).length) {
      throw new BadRequestException('No se recibió ningún cambio de configuración institucional');
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.institutionalSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID },
        update: {},
        select: INSTITUTION_SELECT,
      });
      const changed = Object.entries(data).some(([key, value]) => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(value));
      if (!changed) throw new BadRequestException('Los datos enviados no contienen cambios efectivos');
      const settings = await tx.institutionalSettings.update({
        where: { id: SETTINGS_ID },
        data,
        select: INSTITUTION_SELECT,
      });
      await this.audit.record(tx, {
        actor,
        action: 'INSTITUTION_SETTINGS_UPDATED',
        entityType: 'INSTITUTION_SETTINGS',
        entityId: SETTINGS_ID,
        before,
        after: settings,
      });
      return settings;
    });
  }

  async uploadLogo(actor: AuthUser, kind: string, file?: Express.Multer.File) {
    if (!Object.prototype.hasOwnProperty.call(LOGO_FIELDS, kind)) {
      throw new BadRequestException('Tipo de imagen institucional no válido');
    }
    if (!file) throw new BadRequestException('Archivo requerido (campo "file")');
    if (!LOGO_IMAGE_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('El logo debe ser una imagen PNG, JPG, WEBP o GIF');
    }

    const asset = await this.storage.upload(actor, file);
    try {
      return await this.update(actor, { [LOGO_FIELDS[kind as InstitutionLogoKind]]: asset.url });
    } catch (error) {
      await this.storage.removeRecordAndObject(asset.id).catch(() => undefined);
      throw error;
    }
  }
}

@ApiTags('institution')
@Controller('institution')
export class InstitutionController {
  constructor(private readonly institution: InstitutionService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Identidad institucional pública vigente' })
  getPublic() {
    return this.institution.get();
  }

  @Get('admin')
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Consultar configuración institucional' })
  getAdmin() {
    return this.institution.get();
  }

  @Patch('admin')
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Actualizar nombres o URLs de logos institucionales' })
  update(@CurrentUser() actor: AuthUser, @Body() dto: UpdateInstitutionDto) {
    return this.institution.update(actor, dto);
  }

  @Post('admin/logos/:kind')
  @Roles(RoleName.ADMIN)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_LOGO_SIZE, files: 1, fields: 0, parts: 2 },
    fileFilter: (_request, file, callback) => {
      if (!LOGO_IMAGE_MIMES.includes(file.mimetype)) {
        callback(new BadRequestException('El logo debe ser una imagen PNG, JPG, WEBP o GIF'), false);
        return;
      }
      callback(null, true);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: '[Admin] Cargar y guardar un logo institucional o de carrera' })
  uploadLogo(
    @CurrentUser() actor: AuthUser,
    @Param('kind') kind: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.institution.uploadLogo(actor, kind, file);
  }
}

@Module({
  imports: [StorageModule],
  providers: [InstitutionService],
  controllers: [InstitutionController],
  exports: [InstitutionService],
})
export class InstitutionModule {}
