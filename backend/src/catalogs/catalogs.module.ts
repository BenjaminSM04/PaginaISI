import { BadRequestException, Controller, Get, Global, Injectable, Module, Param, ParseEnumPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { CatalogKind, Prisma } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Public } from '../common/decorators';
import { paginate } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

type CatalogDatabase = Prisma.TransactionClient | PrismaService;

export class CatalogQueryDto {
  @ApiPropertyOptional({ description: 'Texto normalizado a buscar' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export function normalizeCatalogValue(name: string) {
  const displayName = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return {
    name: displayName,
    normalizedName: displayName.toLocaleLowerCase('es'),
  };
}

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(kind: CatalogKind, query: CatalogQueryDto = {}) {
    const { take, skip, page } = paginate(query.page, query.limit ?? 20);
    const normalizedQuery = query.q ? normalizeCatalogValue(query.q).normalizedName.slice(0, 80) : '';
    const where: Prisma.CatalogValueWhereInput = {
      kind,
      ...(normalizedQuery
        ? { normalizedName: { contains: normalizedQuery, mode: 'insensitive' } }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.catalogValue.count({ where }),
      this.prisma.catalogValue.findMany({
        where,
        select: { id: true, kind: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take,
        skip,
      }),
    ]);
    return {
      items,
      total,
      page,
      limit: take,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async upsert(kind: CatalogKind, rawName: string, db: CatalogDatabase = this.prisma) {
    const value = normalizeCatalogValue(rawName);
    if (!value.name) throw new BadRequestException('El valor de catálogo no puede estar vacío');
    if (value.name.length > 80) throw new BadRequestException('El valor de catálogo no puede superar 80 caracteres');
    return db.catalogValue.upsert({
      where: { kind_normalizedName: { kind, normalizedName: value.normalizedName } },
      create: { kind, ...value },
      update: {},
    });
  }

  async upsertMany(kind: CatalogKind, rawNames: string[], db: CatalogDatabase = this.prisma) {
    const unique = new Map<string, string>();
    for (const rawName of rawNames) {
      const value = normalizeCatalogValue(rawName);
      if (!value.name) continue;
      if (value.name.length > 80) throw new BadRequestException('Los valores de catálogo no pueden superar 80 caracteres');
      if (!unique.has(value.normalizedName)) unique.set(value.normalizedName, value.name);
    }
    return Promise.all([...unique.values()].map((name) => this.upsert(kind, name, db)));
  }
}

@ApiTags('catalogs')
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Public()
  @Get(':kind')
  @ApiOperation({ summary: 'Catálogo normalizado y paginado para selectores con búsqueda' })
  list(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Query() query: CatalogQueryDto,
  ) {
    return this.catalogs.list(kind, query);
  }
}

@Global()
@Module({
  providers: [CatalogsService],
  controllers: [CatalogsController],
  exports: [CatalogsService],
})
export class CatalogsModule {}
