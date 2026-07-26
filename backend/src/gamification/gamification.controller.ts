import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators';

@ApiTags('gamification')
@Controller()
export class GamificationController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('ranking')
  @ApiOperation({ summary: 'Ranking de estudiantes (general, dev, research, community; total o mensual)' })
  @ApiQuery({ name: 'category', required: false, enum: ['general', 'dev', 'research', 'community'] })
  @ApiQuery({ name: 'period', required: false, enum: ['all', 'month'] })
  @ApiQuery({ name: 'limit', required: false })
  async ranking(
    @Query('category') category = 'general',
    @Query('period') period = 'all',
    @Query('limit') limit = '20',
  ) {
    const take = Math.min(Number(limit) || 20, 50);

    if (period === 'month') {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const where: any = { createdAt: { gte: start } };
      if (category !== 'general') where.category = category.toUpperCase();
      const grouped = await this.prisma.pointsTransaction.groupBy({
        by: ['userId'],
        where,
        _sum: { points: true },
        orderBy: { _sum: { points: 'desc' } },
        take,
      });
      const users = await this.prisma.user.findMany({
        where: { id: { in: grouped.map((g) => g.userId) }, isActive: true, emailVerifiedAt: { not: null } },
        include: { profile: true, badges: true },
      });
      const map = new Map(users.map((u) => [u.id, u]));
      return grouped
        .filter((g) => map.has(g.userId))
        .map((g, i) => {
          const u = map.get(g.userId)!;
          return {
            position: i + 1,
            userId: u.id,
            username: u.username,
            fullName: u.profile?.fullName,
            avatarUrl: u.profile?.avatarUrl,
            semester: u.profile?.semester,
            points: g._sum.points ?? 0,
            badgesCount: u.badges.length,
          };
        });
    }

    const orderField =
      category === 'dev' ? 'devPoints' : category === 'research' ? 'researchPoints' : category === 'community' ? 'communityPoints' : 'totalPoints';
    const profiles = await this.prisma.profile.findMany({
      where: { user: { isActive: true, emailVerifiedAt: { not: null }, roles: { some: { role: { name: 'STUDENT' } } } } },
      orderBy: { [orderField]: 'desc' },
      take,
      include: { user: { select: { id: true, username: true, badges: true } } },
    });
    return profiles.map((p, i) => ({
      position: i + 1,
      userId: p.user.id,
      username: p.user.username,
      fullName: p.fullName,
      avatarUrl: p.avatarUrl,
      semester: p.semester,
      points: (p as any)[orderField],
      totalPoints: p.totalPoints,
      devPoints: p.devPoints,
      researchPoints: p.researchPoints,
      communityPoints: p.communityPoints,
      badgesCount: p.user.badges.length,
    }));
  }

  @Public()
  @Get('badges')
  @ApiOperation({ summary: 'Catálogo de insignias' })
  badges() {
    return this.prisma.badge.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { users: true } } },
    });
  }

  @Public()
  @Get('points/rules')
  @ApiOperation({ summary: 'Reglas de puntos vigentes' })
  rules() {
    return this.prisma.pointRule.findMany({ where: { isActive: true }, orderBy: { points: 'desc' } });
  }
}
