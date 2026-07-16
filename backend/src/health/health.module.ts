import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Disponibilidad del API y conexión a PostgreSQL' })
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
