import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Prisma, ReportStatus, ReportTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { CurrentUser, Roles, AuthUser } from '../common/decorators';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType }) @IsEnum(ReportTargetType) targetType: ReportTargetType;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(64) targetId: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(500) reason: string;
}

export class ListReportsQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['VALID', 'DISMISSED'] }) @IsIn(['VALID', 'DISMISSED']) status: 'VALID' | 'DISMISSED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) resolutionNote?: string;
  @ApiPropertyOptional({ description: 'true para aplicar al autor la penalización configurada' })
  @IsOptional()
  @IsBoolean()
  penalizeAuthor?: boolean;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private gamification: GamificationService) {}

  async create(user: AuthUser, dto: CreateReportDto) {
    const authorId = await this.findContentAuthor(dto.targetType, dto.targetId);
    if (!authorId) throw new NotFoundException('El contenido reportado no existe');
    if (authorId === user.id) throw new BadRequestException('No puedes reportar tu propio contenido');
    try {
      return await this.prisma.report.create({ data: { ...dto, reporterId: user.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Ya reportaste este contenido');
      }
      throw error;
    }
  }

  list(status?: ReportStatus) {
    return this.prisma.report.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { username: true, profile: { select: { fullName: true } } } },
        resolvedBy: { select: { username: true } },
      },
    });
  }

  private async findContentAuthor(targetType: ReportTargetType, targetId: string): Promise<string | null> {
    switch (targetType) {
      case 'QUESTION': return (await this.prisma.forumQuestion.findUnique({ where: { id: targetId } }))?.authorId ?? null;
      case 'ANSWER': return (await this.prisma.forumAnswer.findUnique({ where: { id: targetId } }))?.authorId ?? null;
      case 'PROJECT': return (await this.prisma.project.findUnique({ where: { id: targetId } }))?.ownerId ?? null;
      case 'ARTICLE': return (await this.prisma.article.findUnique({ where: { id: targetId } }))?.ownerId ?? null;
      case 'COMMENT': return (await this.prisma.comment.findUnique({ where: { id: targetId } }))?.authorId ?? null;
      case 'USER': return targetId;
      default: return null;
    }
  }

  async resolve(admin: AuthUser, id: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (report.status !== 'PENDING') throw new BadRequestException('El reporte ya fue resuelto');

    const updated = await this.prisma.report.update({
      where: { id },
      data: { status: dto.status, resolutionNote: dto.resolutionNote, resolvedById: admin.id, resolvedAt: new Date() },
    });

    if (dto.status === 'VALID') {
      await this.gamification.award(report.reporterId, 'REPORTE_VALIDO', 'REPORT', report.id);
      await this.gamification.grantBadge(report.reporterId, 'CAZADOR_BUGS');
      if (dto.penalizeAuthor) {
        const authorId = await this.findContentAuthor(report.targetType, report.targetId);
        if (authorId) await this.gamification.award(authorId, 'PENALIZACION_SPAM', 'REPORT', report.id);
      }
    }
    return updated;
  }
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reportar contenido inadecuado; un reporte válido aplica la regla configurada' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user, dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Lista de reportes por estado' })
  list(@Query() query: ListReportsQueryDto) {
    return this.reports.list(query.status);
  }

  @Patch(':id/resolve')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Resolver reporte: válido (+5 al reportante) o descartado' })
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.reports.resolve(user, id, dto);
  }
}

@Module({
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
