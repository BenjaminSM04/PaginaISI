import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TwoFactorService } from './two-factor.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GamificationModule } from '../gamification/gamification.module';
import { AuthMailService } from './auth-mail.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), GamificationModule],
  providers: [AuthService, JwtStrategy, TwoFactorService, AuthMailService],
  controllers: [AuthController],
})
export class AuthModule {}
