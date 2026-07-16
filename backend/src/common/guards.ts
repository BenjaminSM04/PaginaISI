import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { RoleName } from '@prisma/client';
import { ALLOW_UNVERIFIED_KEY, AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      try {
        await super.canActivate(context);
      } catch {
        // Ruta pública: el usuario autenticado es opcional
      }
      return true;
    }
    return (await super.canActivate(context)) as boolean;
  }

  handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Passport puede entregar `false` cuando no hay credenciales opcionales.
    // Normalizamos siempre a null para que los controladores públicos no
    // reciban un valor truthy/falsy con forma distinta a AuthUser.
    if (isPublic) return user || null;
    if (err || !user) throw err ?? new UnauthorizedException('No autenticado');
    return user;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('No autenticado');
    const ok = required.some((r) => user.roles?.includes(r));
    if (!ok) throw new ForbiddenException('No tienes permisos para esta acción');
    return true;
  }
}

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || allowUnverified) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException('Verifica tu correo antes de realizar esta acción');
    }
    return true;
  }
}
