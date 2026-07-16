import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RoleName } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  roles: RoleName[];
  sessionId: string;
  emailVerifiedAt: Date | null;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | null => {
  const request = ctx.switchToHttp().getRequest();
  return request.user || null;
});
