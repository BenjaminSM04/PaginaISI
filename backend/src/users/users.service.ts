import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async publicProfile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        profile: true,
        badges: { include: { badge: true }, orderBy: { awardedAt: 'desc' } },
        skills: { include: { skill: true } },
        communityMemberships: { include: { community: { select: { id: true, slug: true, name: true, logoUrl: true, accentColor: true } } } },
        projectsOwned: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, select: { id: true, slug: true, title: true, summary: true, coverUrl: true, likesCount: true, stage: true, tags: true } },
        articlesOwned: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, select: { id: true, slug: true, title: true, abstract: true, area: true, likesCount: true } },
        questions: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, title: true, votesScore: true, answersCount: true, createdAt: true, acceptedAnswerId: true } },
      },
    });
    if (!user || !user.isActive || !user.emailVerifiedAt) throw new NotFoundException('Usuario no encontrado');

    const [answersCount, acceptedCount] = await Promise.all([
      this.prisma.forumAnswer.count({ where: { authorId: user.id } }),
      this.prisma.forumAnswer.count({ where: { authorId: user.id, isAccepted: true } }),
    ]);

    const {
      passwordHash,
      refreshTokenHash,
      securityVersion,
      emailVerifiedAt,
      email,
      ...safe
    } = user;
    return {
      ...safe,
      stats: {
        answersCount,
        acceptedCount,
        questionsCount: await this.prisma.forumQuestion.count({ where: { authorId: user.id } }),
        projectsCount: user.projectsOwned.length,
        articlesCount: user.articlesOwned.length,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { skills, ...profile } = dto;
    const data: any = { ...profile };
    return this.prisma.$transaction(async (tx) => {
      await tx.profile.update({ where: { userId }, data });

      if (skills !== undefined) {
        await tx.userSkill.deleteMany({ where: { userId } });
        const normalized = [...new Map(
          skills
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => [name.toLocaleLowerCase('es'), name] as const),
        ).values()];
        for (const name of normalized) {
          const skill = await tx.skill.upsert({ where: { name }, create: { name }, update: {} });
          await tx.userSkill.create({ data: { userId, skillId: skill.id } });
        }
      }
      return tx.profile.findUnique({ where: { userId } });
    });
  }

  async teachers() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, emailVerifiedAt: { not: null }, roles: { some: { role: { name: 'TEACHER' } } } },
      select: { username: true, profile: { select: { fullName: true, avatarUrl: true } } },
      orderBy: { username: 'asc' },
    });
    return users;
  }

  async myActivity(userId: string) {
    const [projects, articles, questions, transactions] = await Promise.all([
      this.prisma.project.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' }, include: { technologies: true } }),
      this.prisma.article.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.forumQuestion.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.pointsTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    return { projects, articles, questions, transactions };
  }
}
