import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';
import { ACCESS_TOKEN_TYPE, EnvironmentVariables, JWT_ALGORITHM } from '../config/environment';

interface AccessTokenPayload {
  sub: string;
  type: typeof ACCESS_TOKEN_TYPE;
  sid: string;
  ver: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<EnvironmentVariables, true>, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_ACCESS_SECRET', { infer: true }),
      issuer: config.getOrThrow('JWT_ISSUER', { infer: true }),
      audience: config.getOrThrow('JWT_AUDIENCE', { infer: true }),
      algorithms: [JWT_ALGORITHM],
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (
      payload?.type !== ACCESS_TOKEN_TYPE
      || typeof payload.sub !== 'string'
      || !payload.sub
      || typeof payload.sid !== 'string'
      || typeof payload.ver !== 'number'
    ) {
      throw new UnauthorizedException('Token de acceso invalido');
    }
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        absoluteExpiresAt: { gt: new Date() },
      },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    const user = session?.user;
    if (
      !user
      || !user.isActive
      || user.securityVersion !== payload.ver
      || session.securityVersion !== payload.ver
    ) {
      throw new UnauthorizedException('Usuario o sesión inválidos');
    }
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      roles: user.roles.map((r) => r.role.name),
      sessionId: session.id,
      emailVerifiedAt: user.emailVerifiedAt,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
