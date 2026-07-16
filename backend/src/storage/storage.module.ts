import {
  BadRequestException, ConflictException, Controller, Delete, ForbiddenException, Get, HttpException, HttpStatus, Injectable, InternalServerErrorException,
  Logger, Module, NotFoundException, OnModuleInit, Param, Post, Query, Req, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { basename, extname, join, resolve, sep } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles, AuthUser } from '../common/decorators';
import { optimizeImage, UnsafeImageError } from './image-optimizer';
import { ProjectAccessService } from '../project-collaboration/project-access.service';
import { ProjectAuditRequestContext, ProjectAuditService, projectAuditRequestContext } from '../project-collaboration/project-audit.service';
import type { Request } from 'express';

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_SIZE = 8 * 1024 * 1024;
const DEFAULT_DAILY_UPLOAD_LIMIT = 25;
const DEFAULT_STORAGE_QUOTA_BYTES = 250 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

/**
 * Multer obtiene `mimetype` del cliente. Esta comprobación mínima evita que un
 * archivo arbitrario se publique simplemente cambiando ese encabezado.
 */
export function hasValidFileSignature(buffer: Buffer, mime: string): boolean {
  if (!buffer?.length) return false;
  switch (mime) {
    case 'image/png':
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/gif': {
      const signature = buffer.subarray(0, 6).toString('ascii');
      return signature === 'GIF87a' || signature === 'GIF89a';
    }
    case 'image/webp':
      return buffer.length >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'application/pdf':
      return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

export interface StorageDriver {
  save(buffer: Buffer, key: string, mime: string): Promise<{ url: string; key: string; provider: 'LOCAL' | 'S3' }>;
  remove(key: string): Promise<void>;
}

@Injectable()
export class LocalStorageDriver implements StorageDriver {
  async save(buffer: Buffer, key: string): Promise<{ url: string; key: string; provider: 'LOCAL' }> {
    const dir = join(process.cwd(), 'uploads');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await writeFile(join(dir, key), buffer, { flag: 'wx' });
    const base = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;
    return { url: `${base}/uploads/${key}`, key, provider: 'LOCAL' };
  }

  async remove(key: string): Promise<void> {
    const root = resolve(process.cwd(), 'uploads');
    const target = resolve(root, key);
    if (basename(key) !== key || !target.startsWith(`${root}${sep}`)) {
      throw new BadRequestException('Clave de almacenamiento local inválida');
    }
    try {
      await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

@Injectable()
export class S3StorageDriver implements StorageDriver {
  async save(buffer: Buffer, key: string, mime: string): Promise<{ url: string; key: string; provider: 'S3' }> {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const region = process.env.S3_REGION || 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException('Storage S3 no configurado');
    }
    const client = new S3Client({
      region,
      endpoint,
      forcePathStyle: !!endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mime }));
    const publicBase = process.env.S3_PUBLIC_URL
      || (endpoint ? `${endpoint.replace(/\/$/, '')}/${bucket}` : `https://${bucket}.s3.${region}.amazonaws.com`);
    return { url: `${publicBase}/${key}`, key, provider: 'S3' };
  }

  async remove(key: string): Promise<void> {
    const { DeleteObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    const region = process.env.S3_REGION || 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) throw new InternalServerErrorException('Storage S3 no configurado');
    const client = new S3Client({
      region,
      endpoint,
      forcePathStyle: !!endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private prisma: PrismaService,
    private local: LocalStorageDriver,
    private s3: S3StorageDriver,
    private projectAccess: ProjectAccessService,
    private projectAudit: ProjectAuditService,
  ) {}

  private get driver(): StorageDriver {
    return (process.env.STORAGE_DRIVER || 'local') === 's3' ? this.s3 : this.local;
  }

  onModuleInit() {
    if (process.env.CLEAN_ORPHAN_UPLOADS_ON_START !== 'true') return;
    const timer = setTimeout(() => {
      void this.cleanupOrphans(24, true).then((result) => {
        if (result.deleted) this.logger.log(`Limpieza de uploads huérfanos: ${result.deleted} archivo(s) eliminado(s)`);
      }).catch((error) => this.logger.warn(`No se pudo limpiar uploads huérfanos: ${error instanceof Error ? error.message : error}`));
    }, 5_000);
    timer.unref();
  }

  private driverFor(provider: 'LOCAL' | 'S3'): StorageDriver {
    return provider === 'S3' ? this.s3 : this.local;
  }

  private storageQuotaBytes() {
    const configured = Number(process.env.STORAGE_BYTES_PER_USER);
    return Number.isSafeInteger(configured) && configured >= 10 * 1024 * 1024
      ? configured
      : DEFAULT_STORAGE_QUOTA_BYTES;
  }

  async quota(userId: string) {
    const aggregate = await this.prisma.mediaAsset.aggregate({
      where: { uploaderId: userId },
      _sum: { sizeBytes: true },
      _count: { id: true },
    });
    const usedBytes = aggregate._sum.sizeBytes ?? 0;
    const limitBytes = this.storageQuotaBytes();
    return { usedBytes, limitBytes, availableBytes: Math.max(0, limitBytes - usedBytes), files: aggregate._count.id };
  }

  async removeStoredObject(asset: { key: string | null; provider: 'LOCAL' | 'S3' }) {
    if (!asset.key) return;
    await this.driverFor(asset.provider).remove(asset.key);
  }

  async removeRecordAndObject(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: { id: true, key: true, provider: true },
    });
    if (!asset) return false;
    await this.prisma.mediaAsset.delete({ where: { id } });
    try {
      await this.removeStoredObject(asset);
    } catch (error) {
      this.logger.warn(`El registro ${id} se eliminó, pero falló la limpieza física: ${error instanceof Error ? error.message : error}`);
    }
    return true;
  }

  private async isUrlReferenced(url: string) {
    const counts = await Promise.all([
      this.prisma.profile.count({ where: { avatarUrl: url } }),
      this.prisma.community.count({ where: { OR: [{ logoUrl: url }, { coverUrl: url }] } }),
      this.prisma.news.count({ where: { coverUrl: url } }),
      this.prisma.project.count({ where: { coverUrl: url } }),
      this.prisma.article.count({ where: { OR: [{ pdfUrl: url }, { coverUrl: url }] } }),
      this.prisma.event.count({ where: { coverUrl: url } }),
    ]);
    return counts.some((count) => count > 0);
  }

  private isLinked(asset: {
    projectId: string | null;
    forumQuestionId: string | null;
    forumAnswerId: string | null;
    eventId: string | null;
  }) {
    return !!(asset.projectId || asset.forumQuestionId || asset.forumAnswerId || asset.eventId);
  }

  async deleteOwnedUnlinked(user: AuthUser, id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Archivo no encontrado');
    if (asset.uploaderId !== user.id && !user.roles.includes('ADMIN')) throw new ForbiddenException('No puedes eliminar este archivo');
    if (this.isLinked(asset) || await this.isUrlReferenced(asset.url)) {
      throw new BadRequestException('El archivo está en uso y no puede eliminarse directamente');
    }
    await this.removeRecordAndObject(asset.id);
    return { ok: true };
  }

  async cleanupOrphans(olderThanHours = 24, apply = false) {
    const safeHours = Number.isFinite(olderThanHours) ? Math.min(Math.max(Math.trunc(olderThanHours), 1), 24 * 365) : 24;
    const candidates = await this.prisma.mediaAsset.findMany({
      where: {
        createdAt: { lt: new Date(Date.now() - safeHours * 60 * 60 * 1000) },
        projectId: null,
        forumQuestionId: null,
        forumAnswerId: null,
        eventId: null,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const orphaned = [];
    for (const asset of candidates) {
      if (!await this.isUrlReferenced(asset.url)) orphaned.push(asset);
    }
    if (apply) {
      for (const asset of orphaned) await this.removeRecordAndObject(asset.id);
    }
    return {
      inspected: candidates.length,
      orphaned: orphaned.length,
      deleted: apply ? orphaned.length : 0,
      hasMore: candidates.length === 200,
      items: orphaned.map(({ id, url, sizeBytes, createdAt }) => ({ id, url, sizeBytes, createdAt })),
    };
  }

  /**
   * Verifica que una lista de imágenes recién subida pueda vincularse a una
   * entidad. Se ejecuta dentro de la misma transacción que realiza el connect.
   */
  async assertOwnedUnlinkedImages(tx: Prisma.TransactionClient, userId: string, imageIds: string[]) {
    if (!imageIds.length) return;
    const images = await tx.mediaAsset.findMany({
      where: {
        id: { in: imageIds },
        uploaderId: userId,
        mime: { startsWith: 'image/' },
        projectId: null,
        forumQuestionId: null,
        forumAnswerId: null,
        eventId: null,
      },
      select: { id: true },
    });
    if (images.length !== imageIds.length) {
      throw new BadRequestException('Una imagen no existe, no te pertenece o ya está vinculada');
    }
  }

  async upload(
    user: AuthUser,
    file: Express.Multer.File,
    projectId?: string,
    expectedVersion?: number,
    request?: ProjectAuditRequestContext,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido (campo "file")');
    if (!ALLOWED_MIME.includes(file.mimetype)) throw new BadRequestException('Tipo de archivo no permitido (png, jpg, webp, gif, pdf)');
    if (!file.buffer?.length || file.buffer.length > MAX_SIZE || file.size > MAX_SIZE) {
      throw new BadRequestException('El archivo está vacío o supera los 8MB');
    }
    if (!hasValidFileSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('El contenido del archivo no coincide con su tipo declarado');
    }

    const configuredLimit = Number(process.env.UPLOADS_PER_USER_PER_DAY);
    const dailyLimit = Number.isInteger(configuredLimit) && configuredLimit > 0
      ? Math.min(configuredLimit, 100)
      : DEFAULT_DAILY_UPLOAD_LIMIT;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const uploadsToday = await this.prisma.mediaAsset.count({
      where: { uploaderId: user.id, createdAt: { gte: since } },
    });
    if (uploadsToday >= dailyLimit) {
      throw new HttpException(`Alcanzaste el límite de ${dailyLimit} archivos por 24 horas`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const managed = projectId ? await this.projectAccess.assertEditor(user, projectId) : null;
    if (projectId && !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('La galería del proyecto solo admite imágenes');
    }
    if (projectId && expectedVersion === undefined) {
      throw new BadRequestException('expectedVersion es obligatorio al subir archivos vinculados a un proyecto');
    }
    if (expectedVersion !== undefined && managed && expectedVersion !== managed.project.version) {
      throw new ConflictException('La versión enviada ya no es la actual. Recarga el proyecto.');
    }

    let payload = file.buffer;
    let storedMime = file.mimetype;
    let extension = MIME_EXT[file.mimetype] || extname(file.originalname || '') || '';
    let width: number | null = null;
    let height: number | null = null;

    if (file.mimetype.startsWith('image/')) {
      try {
        const optimized = await optimizeImage(file.buffer, file.mimetype);
        payload = optimized.buffer;
        storedMime = optimized.mime;
        extension = optimized.extension;
        width = optimized.width;
        height = optimized.height;
      } catch (error) {
        if (error instanceof UnsafeImageError) throw new BadRequestException(error.message);
        throw error;
      }
    }

    const quota = await this.quota(user.id);
    if (quota.usedBytes + payload.length > quota.limitBytes) {
      throw new HttpException('No tienes espacio suficiente. Elimina archivos sin usar o solicita más cuota.', HttpStatus.INSUFFICIENT_STORAGE);
    }

    const key = `${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
    const saved = await this.driver.save(payload, key, storedMime);
    try {
      if (!projectId || !managed) {
        return await this.prisma.mediaAsset.create({
          data: {
            url: saved.url,
            key: saved.key,
            provider: saved.provider,
            mime: storedMime,
            sizeBytes: payload.length,
            width,
            height,
            uploaderId: user.id,
          },
        });
      }
      return await this.prisma.$transaction(async (tx) => {
        const bumped = await tx.project.updateMany({
          where: { id: projectId, version: managed.project.version },
          data: { version: { increment: 1 } },
        });
        if (bumped.count !== 1) {
          throw new ConflictException('El proyecto cambió mientras subías la imagen. Recarga antes de continuar.');
        }
        const activeImages = await tx.mediaAsset.count({
          where: { projectId, archivedAt: null, mime: { startsWith: 'image/' } },
        });
        if (activeImages >= 12) throw new BadRequestException('La galería admite hasta 12 imágenes activas');
        const asset = await tx.mediaAsset.create({
          data: {
            url: saved.url,
            key: saved.key,
            provider: saved.provider,
            mime: storedMime,
            sizeBytes: payload.length,
            width,
            height,
            uploaderId: user.id,
            projectId,
          },
        });
        await this.projectAudit.record(tx, {
          projectId,
          actor: user,
          action: 'MEDIA_UPLOADED',
          entityType: 'GALLERY',
          entityId: asset.id,
          before: null,
          after: {
            id: asset.id,
            projectId: asset.projectId,
            uploaderId: asset.uploaderId,
            url: asset.url,
            mime: asset.mime,
            archivedAt: null,
          },
          metadata: {
            sizeBytes: asset.sizeBytes,
            versionBefore: managed.project.version,
            versionAfter: managed.project.version + 1,
          },
          request,
        });
        return { ...asset, projectVersion: managed.project.version + 1 };
      });
    } catch (error) {
      await this.driver.remove(saved.key).catch(() => undefined);
      throw error;
    }
  }
}

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private storage: StorageService) {}

  @Get('quota')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consultar consumo y cuota personal de almacenamiento' })
  quota(@CurrentUser() user: AuthUser) {
    return this.storage.quota(user.id);
  }

  @Delete('maintenance/orphans')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Detectar o eliminar uploads huérfanos antiguos' })
  cleanupOrphans(@Query('olderThanHours') hours?: string, @Query('apply') apply?: string) {
    return this.storage.cleanupOrphans(Number(hours ?? 24), apply === 'true');
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar un archivo propio que todavía no está vinculado' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storage.deleteOwnedUnlinked(user, id);
  }

  @Post('upload')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', {
    // Busboy emite el evento partsLimit al alcanzar exactamente el límite;
    // dejamos una unidad de margen manteniendo 0 campos y 1 archivo efectivos.
    limits: { fileSize: MAX_SIZE, files: 1, fields: 0, parts: 2 },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_MIME.includes(file.mimetype)) {
        callback(new BadRequestException('Tipo de archivo no permitido (png, jpg, webp, gif, pdf)'), false);
        return;
      }
      callback(null, true);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Subir imagen o PDF (driver local o S3 según STORAGE_DRIVER)' })
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId: string | undefined,
    @Query('expectedVersion') rawExpectedVersion: string | undefined,
    @Req() request: Request,
  ) {
    const expectedVersion = rawExpectedVersion === undefined ? undefined : Number(rawExpectedVersion);
    if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
      throw new BadRequestException('expectedVersion debe ser un entero positivo');
    }
    return this.storage.upload(user, file, projectId, expectedVersion, projectAuditRequestContext(request));
  }
}

@Module({
  providers: [StorageService, LocalStorageDriver, S3StorageDriver],
  controllers: [MediaController],
  exports: [StorageService],
})
export class StorageModule {}
