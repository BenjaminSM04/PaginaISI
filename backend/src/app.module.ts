import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamificationModule } from './gamification/gamification.module';
import { NewsModule } from './news/news.module';
import { CommunitiesModule } from './communities/communities.module';
import { ProjectsModule } from './projects/projects.module';
import { ArticlesModule } from './articles/articles.module';
import { EventsModule } from './events/events.module';
import { MentorshipsModule } from './mentorships/mentorships.module';
import { ForumModule } from './forum/forum.module';
import { ReportsModule } from './reports/reports.module';
import { StorageModule } from './storage/storage.module';
import { AdminModule } from './admin/admin.module';
import { SearchModule } from './search/search.module';
import { JwtAuthGuard, RolesGuard, VerifiedEmailGuard } from './common/guards';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectCollaborationModule } from './project-collaboration/project-collaboration.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    HealthModule,
    NotificationsModule,
    ProjectCollaborationModule,
    GamificationModule,
    AuthModule,
    UsersModule,
    NewsModule,
    CommunitiesModule,
    ProjectsModule,
    ArticlesModule,
    EventsModule,
    MentorshipsModule,
    ForumModule,
    ReportsModule,
    StorageModule,
    AdminModule,
    SearchModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: VerifiedEmailGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
