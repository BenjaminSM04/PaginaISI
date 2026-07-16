import { Global, Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';

@Global()
@Module({
  providers: [GamificationService],
  controllers: [GamificationController],
  exports: [GamificationService],
})
export class GamificationModule {}
