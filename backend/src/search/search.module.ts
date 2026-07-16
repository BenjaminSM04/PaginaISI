import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators';

export class GlobalSearchQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q?: string;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async global(q: string) {
    if (!q || q.trim().length < 2) return { projects: [], articles: [], news: [], questions: [], communities: [], users: [] };
    const query = q.trim();
    const contains = { contains: query, mode: 'insensitive' as const };

    const [projects, articles, news, questions, communities, users] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where: { status: 'APPROVED', OR: [{ title: contains }, { summary: contains }, { tags: { has: query.toLowerCase() } }] },
        take: 5,
        select: { slug: true, title: true, summary: true, coverUrl: true },
      }),
      this.prisma.article.findMany({
        where: { status: 'APPROVED', OR: [{ title: contains }, { abstract: contains }] },
        take: 5,
        select: { slug: true, title: true, area: true },
      }),
      this.prisma.news.findMany({
        where: { status: 'APPROVED', OR: [{ title: contains }, { summary: contains }] },
        take: 5,
        select: { slug: true, title: true, category: true },
      }),
      this.prisma.forumQuestion.findMany({
        where: { OR: [{ title: contains }, { body: contains }, { tags: { has: query.toLowerCase() } }] },
        take: 5,
        select: { id: true, title: true, answersCount: true, votesScore: true },
      }),
      this.prisma.community.findMany({
        where: { isActive: true, OR: [{ name: contains }, { description: contains }] },
        take: 5,
        select: { slug: true, name: true, description: true, accentColor: true },
      }),
      this.prisma.user.findMany({
        where: { isActive: true, emailVerifiedAt: { not: null }, OR: [{ username: contains }, { profile: { fullName: contains } }] },
        take: 5,
        select: { username: true, profile: { select: { fullName: true, avatarUrl: true, totalPoints: true } } },
      }),
    ]);
    return { projects, articles, news, questions, communities, users };
  }
}

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Public()
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Buscador global: proyectos, artículos, noticias, foro, comunidades y personas' })
  global(@Query() query: GlobalSearchQueryDto) {
    return this.search.global(query.q ?? '');
  }
}

@Module({
  providers: [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
