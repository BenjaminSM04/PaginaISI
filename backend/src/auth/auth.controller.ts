import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SessionIdDto,
  VerifyEmailDto,
} from './auth.dto';
import { AllowUnverified, CurrentUser, Public, AuthUser } from '../common/decorators';
import { EnvironmentVariables } from '../config/environment';

const REFRESH_COOKIE = 'isi_refresh';

@ApiTags('auth')
@AllowUnverified()
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService<EnvironmentVariables, true>,
  ) {}

  private refreshCookieOptions(): CookieOptions {
    const publicApiUrl = new URL(this.config.getOrThrow('PUBLIC_API_URL', { infer: true }));
    return {
      httpOnly: true,
      sameSite: 'lax',
      // La demo Docker usa HTTP exclusivamente en loopback. En cualquier URL
      // HTTPS la cookie se endurece automáticamente con Secure.
      secure: publicApiUrl.protocol === 'https:',
      path: '/api/auth',
      maxAge: this.config.getOrThrow('JWT_REFRESH_TTL_MS', { infer: true }),
    };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, this.refreshCookieOptions());
  }

  private clearRefreshCookie(res: Response) {
    const { maxAge: _maxAge, ...options } = this.refreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE, options);
  }

  private requestMetadata(req: Request) {
    return { userAgent: req.get('user-agent'), ipAddress: req.ip };
  }

  private assertTrustedCookieOrigin(req: Request) {
    const origin = req.get('origin');
    if (!origin) return;
    let normalizedOrigin: string;
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch {
      throw new ForbiddenException('Origen no permitido');
    }
    const trusted = new Set([
      ...this.config.getOrThrow('WEB_ORIGINS', { infer: true }),
      new URL(this.config.getOrThrow('PUBLIC_API_URL', { infer: true })).origin,
    ]);
    if (normalizedOrigin !== origin || !trusted.has(normalizedOrigin)) {
      throw new ForbiddenException('Origen no permitido');
    }
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } })
  @ApiOperation({ summary: 'Registro de estudiante (+10 pts de bienvenida)' })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertTrustedCookieOrigin(req);
    const { refreshToken, ...rest } = await this.auth.register(dto, this.requestMetadata(req));
    this.setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicio de sesión con email o username' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertTrustedCookieOrigin(req);
    const { refreshToken, ...rest } = await this.auth.login(dto, this.requestMetadata(req));
    this.setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Renueva el access token usando la cookie httpOnly' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertTrustedCookieOrigin(req);
    try {
      const result = await this.auth.refresh(
        req.cookies?.[REFRESH_COOKIE],
        this.requestMetadata(req),
      );
      const { refreshToken, ...rest } = result;
      // Los refresh simultáneos que usan el token anterior reciben solo un
      // access token; así nunca pisan la cookie emitida por el request ganador.
      if (refreshToken) this.setRefreshCookie(res, refreshToken);
      return rest;
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cierra sesión e invalida el refresh token' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertTrustedCookieOrigin(req);
    try {
      return await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    } finally {
      this.clearRefreshCookie(res);
    }
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado con perfil, roles e insignias' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Public()
  @Post('password/forgot')
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Solicita un enlace de recuperación sin revelar si el correo existe' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('password/reset')
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Restablece la contraseña con un token de un solo uso' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @CurrentUser() currentUser: AuthUser | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, ...result } = await this.auth.resetPassword(dto);
    const currentSessionInvalidated = currentUser?.id === userId;
    if (currentSessionInvalidated) this.clearRefreshCookie(res);
    return { ...result, currentSessionInvalidated };
  }

  @Post('password/change')
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambia la contraseña y cierra las demás sesiones' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertTrustedCookieOrigin(req);
    const { refreshToken, ...rest } = await this.auth.changePassword(user.id, dto, this.requestMetadata(req));
    this.setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Post('email/verification')
  @Throttle({ default: { limit: 3, ttl: 60 * 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Envía o genera un enlace de verificación de correo' })
  requestEmailVerification(@CurrentUser() user: AuthUser) {
    return this.auth.requestEmailVerification(user.id);
  }

  @Public()
  @Post('email/verify')
  @Throttle({ default: { limit: 8, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Confirma el correo con un token de un solo uso' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista sesiones activas del usuario' })
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca una sesión concreta' })
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param() params: SessionIdDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.revokeSession(user.id, params.id);
    if (params.id === user.sessionId) this.clearRefreshCookie(res);
    return { ...result, currentSessionRevoked: params.id === user.sessionId };
  }

  @Post('sessions/revoke-others')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca todas las sesiones excepto la actual' })
  revokeOtherSessions(@CurrentUser() user: AuthUser) {
    return this.auth.revokeOtherSessions(user.id, user.sessionId);
  }
}
