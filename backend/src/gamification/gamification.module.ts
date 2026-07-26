import { Global, Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { BadgeRulesService } from './badge-rules.service';
import { BadgeRulesWorker } from './badge-rules.worker';

@Global()
@Module({
  providers: [GamificationService, BadgeRulesService, BadgeRulesWorker],
  controllers: [GamificationController],
  exports: [GamificationService, BadgeRulesService],
})
export class GamificationModule {}
