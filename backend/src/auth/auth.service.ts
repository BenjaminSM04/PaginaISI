import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import {
  ACCESS_TOKEN_TYPE,
  EnvironmentVariables,
  JWT_ALGORITHM,
  REFRESH_TOKEN_TYPE,
} from '../config/environment';
import { AuthUser } from '../common/decorators';
import { TwoFactorService } from './two-factor.service';
import { assertNewPassword } from './password-policy';
import { ChangePasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';

interface RefreshTokenPayload {
  sub: string;
  type: typeof REFRESH_TOKEN_TYPE;
  jti: string;
  exp: number;
}

export interface AuthRequestMetadata {
  userAgent?: string;
  ipAddress?: string;
}

interface ActionLinkResult {
  ok: true;
  message: string;
  previewUrl?: string;
}

export type SessionInspection =
  | { active: false }
  | { active: true; userId: string; source: 'access' | 'refresh' };

const PASSWORD_ROUNDS = 12;
const REFRESH_TOKEN_ROUNDS = 8;
const PASSWORD_RESET_TTL_MS = 30 * 60_000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;
const ACTION_LINK_COOLDOWN_MS = 60_000;
const REFRESH_ROTATION_GRACE_MS = 15_000;
const MAX_ACTIVE_SESSIONS = 10;
const SESSION_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60_000;
// Evita que la diferencia de tiempo entre "usuario inexistente" y contraseña
// incorrecta se convierta en un canal sencillo de enumeración.
const DUMMY_PASSWORD_HASH = '$2b$12$X/23dVyTsTf8GL8T3kZa9OrmHZ8W.NpT9xvAriUaA6RjaGIHkiMzy';

class ActionLinkCooldownException extends HttpException {
  constructor() {
    super('Espera un minuto antes de solicitar otro enlace', 429);
  }
}

export const hashAuthActionToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private gamification: GamificationService,
    private config: ConfigService<EnvironmentVariables, true>,
    private twoFactor: TwoFactorService,
  ) {}

  private sanitizeMetadata(metadata: AuthRequestMetadata): AuthRequestMetadata {
    const userAgent = metadata.userAgent?.replace(/[\r\n]/g, ' ').trim().slice(0, 300) || undefined;
    const ipAddress = metadata.ipAddress?.replace(/[\r\n]/g, '').trim().slice(0, 64) || undefined;
    return { userAgent, ipAddress };
  }


  private signAccessToken(userId: string, securityVersion: number, sessionId: string) {
    const issuer = this.config.getOrThrow('JWT_ISSUER', { infer: true });
    const audience = this.config.getOrThrow('JWT_AUDIENCE', { infer: true });
    return this.jwt.signAsync(
      { sub: userId, type: ACCESS_TOKEN_TYPE, sid: sessionId, ver: securityVersion, jti: randomUUID() },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.getOrThrow('JWT_ACCESS_TTL', { infer: true }),
        issuer,
        audience,
        algorithm: JWT_ALGORITHM,
      },
    );
  }

  private async signTokenPair(userId: string, securityVersion: number, sessionId: string) {
    const issuer = this.config.getOrThrow('JWT_ISSUER', { infer: true });
    const audience = this.config.getOrThrow('JWT_AUDIENCE', { infer: true });
    return Promise.all([
      this.signAccessToken(userId, securityVersion, sessionId),
      this.jwt.signAsync(
        { sub: userId, type: REFRESH_TOKEN_TYPE, jti: sessionId, nonce: randomUUID() },
        {
          secret: this.config.getOrThrow('JWT_REFRESH_SECRET', { infer: true }),
          expiresIn: this.config.getOrThrow('JWT_REFRESH_TTL', { infer: true }),
          issuer,
          audience,
          algorithm: JWT_ALGORITHM,
        },
      ),
    ]);
  }

  private async createSession(userId: string, securityVersion: number, metadata: AuthRequestMetadata) {
    const sessionId = randomUUID();
    const [accessToken, refreshToken] = await this.signTokenPair(userId, securityVersion, sessionId);
    const tokenHash = await bcrypt.hash(refreshToken, REFRESH_TOKEN_ROUNDS);
    const cleanMetadata = this.sanitizeMetadata(metadata);
    const issuedAt = Date.now();
    const expiresAt = new Date(issuedAt + this.config.getOrThrow('JWT_REFRESH_TTL_MS', { infer: true }));
    const absoluteExpiresAt = new Date(issuedAt + this.config.getOrThrow('SESSION_ABSOLUTE_TTL_MS', { infer: true }));
    await this.prisma.refreshSession.create({
      data: { id: sessionId, userId, securityVersion, tokenHash, expiresAt, absoluteExpiresAt, ...cleanMetadata },
    });
    const now = new Date();
    const excessSessions = await this.prisma.refreshSession.findMany({
      where: { userId, id: { not: sessionId }, revokedAt: null, expiresAt: { gt: now } },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      skip: MAX_ACTIVE_SESSIONS - 1,
      select: { id: true },
    });
    if (excessSessions.length > 0) {
      await this.prisma.refreshSession.updateMany({
        where: { id: { in: excessSessions.map((session) => session.id) }, userId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await this.prisma.refreshSession.deleteMany({
      where: {
        userId,
        OR: [
          { expiresAt: { lt: new Date(now.getTime() - SESSION_HISTORY_RETENTION_MS) } },
          { revokedAt: { lt: new Date(now.getTime() - SESSION_HISTORY_RETENTION_MS) } },
        ],
      },
    });
    return { accessToken, refreshToken };
  }

  private async rotateSession(
    userId: string,
    securityVersion: number,
    sessionId: string,
    expectedHash: string,
    absoluteExpiresAt: Date,
    metadata: AuthRequestMetadata,
  ) {
    const [accessToken, refreshToken] = await this.signTokenPair(userId, securityVersion, sessionId);
    const tokenHash = await bcrypt.hash(refreshToken, REFRESH_TOKEN_ROUNDS);
    const cleanMetadata = this.sanitizeMetadata(metadata);
    const now = new Date();
    const updated = await this.prisma.refreshSession.updateMany({
      where: {
        id: sessionId,
        userId,
        securityVersion,
        tokenHash: expectedHash,
        revokedAt: null,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      data: {
        tokenHash,
        previousTokenHash: expectedHash,
        previousValidUntil: new Date(now.getTime() + REFRESH_ROTATION_GRACE_MS),
        lastUsedAt: now,
        expiresAt: new Date(Math.min(
          absoluteExpiresAt.getTime(),
          now.getTime() + this.config.getOrThrow('JWT_REFRESH_TTL_MS', { infer: true }),
        )),
        ...(cleanMetadata.userAgent ? { userAgent: cleanMetadata.userAgent } : {}),
        ...(cleanMetadata.ipAddress ? { ipAddress: cleanMetadata.ipAddress } : {}),
      },
    });
    return updated.count === 1 ? { accessToken, refreshToken } : null;
  }

  private async accessFromGraceToken(
    userId: string,
    securityVersion: number,
    sessionId: string,
    refreshToken: string,
  ) {
    const latest = await this.prisma.refreshSession.findFirst({
      where: {
        id: sessionId,
        userId,
        securityVersion,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        absoluteExpiresAt: { gt: new Date() },
        previousValidUntil: { gt: new Date() },
        previousTokenHash: { not: null },
      },
    });
    if (!latest?.previousTokenHash || !(await bcrypt.compare(refreshToken, latest.previousTokenHash))) return null;
    return {
      accessToken: await this.signAccessToken(userId, securityVersion, sessionId),
      refreshToken: undefined,
    };
  }

  private async verifyRefreshToken(refreshToken: string, ignoreExpiration = false): Promise<RefreshTokenPayload> {
    const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET', { infer: true }),
      algorithms: [JWT_ALGORITHM],
      issuer: this.config.getOrThrow('JWT_ISSUER', { infer: true }),
      audience: this.config.getOrThrow('JWT_AUDIENCE', { infer: true }),
      ignoreExpiration,
    });
    if (
      payload?.type !== REFRESH_TOKEN_TYPE
      || typeof payload.sub !== 'string'
      || !payload.sub
      || typeof payload.jti !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.jti)
      || typeof payload.exp !== 'number'
    ) {
      throw new UnauthorizedException('Token de sesión inválido');
    }
    return payload;
  }

  /**
   * Inspección de solo lectura para las pantallas de acceso. Valida la sesión
   * completa (firma, expiración, hash, versión de seguridad y usuario activo)
   * sin rotar tokens, actualizar lastUsedAt ni migrar la cookie legacy.
   */
  async inspectSession(
    accessUser: AuthUser | null | undefined,
    refreshToken?: string,
  ): Promise<SessionInspection> {
    if (accessUser) {
      return { active: true, userId: accessUser.id, source: 'access' };
    }
    if (!refreshToken) return { active: false };

    let payload: RefreshTokenPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      return { active: false };
    }

    const now = new Date();
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.jti },
      select: {
        userId: true,
        securityVersion: true,
        tokenHash: true,
        previousTokenHash: true,
        previousValidUntil: true,
        expiresAt: true,
        absoluteExpiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            isActive: true,
            securityVersion: true,
          },
        },
      },
    });
    if (session) {
      const structurallyActive = session.userId === payload.sub
        && session.user.id === payload.sub
        && session.user.isActive
        && session.securityVersion === session.user.securityVersion
        && !session.revokedAt
        && session.expiresAt > now
        && session.absoluteExpiresAt > now;
      if (!structurallyActive) return { active: false };

      const matchesCurrent = await bcrypt.compare(refreshToken, session.tokenHash);
      const matchesGrace = !matchesCurrent
        && !!session.previousTokenHash
        && !!session.previousValidUntil
        && session.previousValidUntil > now
        && await bcrypt.compare(refreshToken, session.previousTokenHash);
      return matchesCurrent || matchesGrace
        ? { active: true, userId: session.userId, source: 'refresh' }
        : { active: false };
    }

    // Compatibilidad de solo lectura con la cookie única anterior a
    // RefreshSession. La migración se mantiene exclusivamente en refresh().
    const legacyUser = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, refreshTokenHash: true },
    });
    if (
      legacyUser?.isActive
      && legacyUser.refreshTokenHash
      && await bcrypt.compare(refreshToken, legacyUser.refreshTokenHash)
    ) {
      return { active: true, userId: legacyUser.id, source: 'refresh' };
    }
    return { active: false };
  }

  private actionPath(type: AuthTokenType) {
    return type === 'PASSWORD_RESET' ? '/restablecer-contrasena' : '/verificar-correo';
  }

  private actionLabel(type: AuthTokenType) {
    return type === 'PASSWORD_RESET' ? 'restablecer tu contraseña' : 'verificar tu correo';
  }

  private assertActionDeliveryAvailable() {
    if (
      !this.config.getOrThrow('AUTH_DEV_LINKS', { infer: true })
      && !this.config.get('AUTH_EMAIL_WEBHOOK_URL', { infer: true })
    ) {
      throw new ServiceUnavailableException('El envío de correo no está configurado');
    }
  }

  private async deliverActionLink(email: string, type: AuthTokenType, url: string, expiresAt: Date) {
    if (this.config.getOrThrow('AUTH_DEV_LINKS', { infer: true })) return;

    const webhookUrl = this.config.get('AUTH_EMAIL_WEBHOOK_URL', { infer: true });
    const webhookSecret = this.config.get('AUTH_EMAIL_WEBHOOK_SECRET', { infer: true });
    if (!webhookUrl) {
      throw new ServiceUnavailableException('El envío de correo no está configurado');
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(webhookSecret ? { authorization: `Bearer ${webhookSecret}` } : {}),
        },
        body: JSON.stringify({ to: email, type, actionUrl: url, expiresAt: expiresAt.toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      throw new ServiceUnavailableException('No se pudo enviar el correo en este momento');
    }
  }

  private async issueActionLink(user: { id: string; email: string }, type: AuthTokenType): Promise<ActionLinkResult> {
    const now = new Date();
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + (type === 'PASSWORD_RESET' ? PASSWORD_RESET_TTL_MS : EMAIL_VERIFICATION_TTL_MS));
    const tokenHash = hashAuthActionToken(rawToken);
    const replaced = await this.prisma.authActionToken.updateMany({
      where: { userId: user.id, type, createdAt: { lte: new Date(now.getTime() - ACTION_LINK_COOLDOWN_MS) } },
      data: { tokenHash, expiresAt, usedAt: null, createdAt: now },
    });
    if (replaced.count === 0) {
      try {
        await this.prisma.authActionToken.create({
          data: { userId: user.id, type, tokenHash, expiresAt },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ActionLinkCooldownException();
        }
        throw error;
      }
    }
    const baseUrl = this.config.getOrThrow('PUBLIC_WEB_URL', { infer: true });
    // El secreto va en el fragmento: no se envía en la petición HTTP inicial,
    // logs del proxy ni cabecera Referer.
    const url = `${baseUrl}${this.actionPath(type)}#token=${encodeURIComponent(rawToken)}`;

    await this.deliverActionLink(user.email, type, url, expiresAt);

    return {
      ok: true,
      message: `Se generó el enlace para ${this.actionLabel(type)}.`,
      ...(this.config.getOrThrow('AUTH_DEV_LINKS', { infer: true }) ? { previewUrl: url } : {}),
    };
  }

  async register(dto: RegisterDto, metadata: AuthRequestMetadata = {}) {
    assertNewPassword(dto.password);
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim().toLowerCase();
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (exists) throw new ConflictException('El email o nombre de usuario ya está registrado');

    const studentRole = await this.prisma.role.upsert({
      where: { name: 'STUDENT' },
      create: { name: 'STUDENT' },
      update: {},
    });

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        roles: { create: [{ roleId: studentRole.id }] },
        profile: { create: { fullName: dto.fullName, semester: dto.semester ?? null } },
      },
    });

    const tokens = await this.createSession(user.id, user.securityVersion, metadata);
    let emailVerificationPreviewUrl: string | undefined;
    if (this.config.getOrThrow('AUTH_DEV_LINKS', { infer: true })) {
      try {
        emailVerificationPreviewUrl = (await this.issueActionLink(user, 'EMAIL_VERIFICATION')).previewUrl;
      } catch {
        // La cuenta y su sesión ya existen; el enlace puede regenerarse desde Seguridad.
      }
    } else {
      void this.issueActionLink(user, 'EMAIL_VERIFICATION').catch(() => undefined);
    }
    return { user: await this.me(user.id), emailVerificationPreviewUrl, ...tokens };
  }

  async login(dto: LoginDto, metadata: AuthRequestMetadata = {}) {
    const identifier = dto.identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (user.twoFactorEnabled) return this.twoFactor.challenge(user);
    const tokens = await this.createSession(user.id, user.securityVersion, metadata);
    return { user: await this.me(user.id), ...tokens };
  }

  async verifyTwoFactor(challengeToken: string, code: string, metadata: AuthRequestMetadata = {}) {
    const verified = await this.twoFactor.verifyLogin(challengeToken, code);
    const tokens = await this.createSession(verified.userId, verified.securityVersion, metadata);
    return { user: await this.me(verified.userId), ...tokens };
  }

  setupTwoFactor(userId: string, password: string) { return this.twoFactor.beginSetup(userId, password); }

  async updateTwoFactor(userId: string, password: string, code: string, enabled: boolean, metadata: AuthRequestMetadata = {}) {
    const result = enabled ? await this.twoFactor.confirmSetup(userId, password, code) : await this.twoFactor.disable(userId, password, code);
    const tokens = await this.createSession(userId, result.securityVersion, metadata);
    return { ok: true, ...('recoveryCodes' in result ? { recoveryCodes: result.recoveryCodes } : {}), user: await this.me(userId), ...tokens };
  }

  async refresh(refreshToken?: string, metadata: AuthRequestMetadata = {}) {
    if (!refreshToken) throw new UnauthorizedException('Sin sesión');
    let payload: RefreshTokenPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Sesión expirada');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Sesión inválida');

    let session = await this.prisma.refreshSession.findUnique({ where: { id: payload.jti } });
    // Puente de una sola vez para cookies emitidas antes de habilitar sesiones múltiples.
    if (!session && user.refreshTokenHash && await bcrypt.compare(refreshToken, user.refreshTokenHash)) {
      const expiresAt = new Date(payload.exp * 1_000);
      session = await this.prisma.refreshSession.upsert({
        where: { id: payload.jti },
        create: {
          id: payload.jti,
          userId: user.id,
          securityVersion: user.securityVersion,
          tokenHash: user.refreshTokenHash,
          expiresAt,
          absoluteExpiresAt: new Date(Date.now() + this.config.getOrThrow('SESSION_ABSOLUTE_TTL_MS', { infer: true })),
          ...this.sanitizeMetadata(metadata),
        },
        update: {},
      });
      await this.prisma.user.updateMany({
        where: { id: user.id, refreshTokenHash: user.refreshTokenHash },
        data: { refreshTokenHash: null },
      });
    }

    const sessionIsActive = !!session
      && session.userId === user.id
      && session.securityVersion === user.securityVersion
      && !session.revokedAt
      && session.expiresAt.getTime() > Date.now();
    const withinAbsoluteLifetime = !!session && session.absoluteExpiresAt.getTime() > Date.now();
    const matchesCurrent = sessionIsActive && session
      ? await bcrypt.compare(refreshToken, session.tokenHash)
      : false;
    if (!sessionIsActive || !withinAbsoluteLifetime || !session) {
      if (session && !session.revokedAt) {
        await this.prisma.refreshSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      throw new UnauthorizedException('Sesión inválida');
    }

    if (matchesCurrent) {
      const rotated = await this.rotateSession(
        user.id,
        user.securityVersion,
        session.id,
        session.tokenHash,
        session.absoluteExpiresAt,
        metadata,
      );
      if (rotated) return { user: await this.me(user.id), ...rotated };
      // Otro request ganó el CAS. El token presentado debe ser ahora el
      // anterior dentro de la ventana de gracia; no se vuelve a rotar.
      const concurrent = await this.accessFromGraceToken(user.id, user.securityVersion, session.id, refreshToken);
      if (concurrent) return { user: await this.me(user.id), ...concurrent };
      throw new UnauthorizedException('La sesión ya fue renovada o revocada');
    }

    const graceAccess = await this.accessFromGraceToken(user.id, user.securityVersion, session.id, refreshToken);
    if (graceAccess) return { user: await this.me(user.id), ...graceAccess };

    // Un token anterior reutilizado fuera de la pequeña ventana de concurrencia
    // se trata como posible replay y cierra esa sesión.
    await this.prisma.refreshSession.updateMany({
      where: { id: session.id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedException('Sesión inválida');
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    let payload: RefreshTokenPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken, true);
    } catch {
      return { ok: true };
    }

    const session = await this.prisma.refreshSession.findUnique({ where: { id: payload.jti } });
    const matchesCurrent = session?.userId === payload.sub && await bcrypt.compare(refreshToken, session.tokenHash);
    const matchesGraceToken = session?.userId === payload.sub
      && !!session.previousTokenHash
      && !!session.previousValidUntil
      && session.previousValidUntil.getTime() > Date.now()
      && await bcrypt.compare(refreshToken, session.previousTokenHash);
    if (session && (matchesCurrent || matchesGraceToken)) {
      await this.prisma.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { ok: true };
    }

    const legacy = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { refreshTokenHash: true } });
    if (legacy?.refreshTokenHash && await bcrypt.compare(refreshToken, legacy.refreshTokenHash)) {
      await this.prisma.user.update({ where: { id: payload.sub }, data: { refreshTokenHash: null } });
    }
    return { ok: true };
  }

  async requestPasswordReset(email: string): Promise<ActionLinkResult> {
    this.assertActionDeliveryAvailable();
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const generic: ActionLinkResult = {
      ok: true,
      message: 'Si existe una cuenta activa con ese correo, recibirás un enlace de recuperación.',
    };
    if (!user?.isActive) return generic;
    if (!this.config.getOrThrow('AUTH_DEV_LINKS', { infer: true })) {
      // La entrega se desacopla de la respuesta para reducir diferencias de
      // tiempo observables entre correos existentes e inexistentes.
      void this.issueActionLink(user, 'PASSWORD_RESET').catch(() => undefined);
      return generic;
    }
    try {
      const result = await this.issueActionLink(user, 'PASSWORD_RESET');
      return { ...generic, ...(result.previewUrl ? { previewUrl: result.previewUrl } : {}) };
    } catch (error) {
      // La respuesta no debe convertirse en un oráculo de cuentas cuando el
      // proveedor de correo está temporalmente caído.
      if (error instanceof ServiceUnavailableException || error instanceof ActionLinkCooldownException) return generic;
      throw error;
    }
  }

  async resetPassword(dto: ResetPasswordDto) {
    assertNewPassword(dto.newPassword);
    const now = new Date();
    const tokenHash = hashAuthActionToken(dto.token);
    const actionToken = await this.prisma.authActionToken.findUnique({ where: { tokenHash } });
    if (
      !actionToken
      || actionToken.type !== 'PASSWORD_RESET'
      || actionToken.usedAt
      || actionToken.expiresAt <= now
    ) {
      throw new BadRequestException('El enlace es inválido, ya fue utilizado o expiró');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: actionToken.userId },
      select: { passwordHash: true, isActive: true, securityVersion: true },
    });
    if (!targetUser?.isActive) throw new BadRequestException('La cuenta no está disponible');
    if (await bcrypt.compare(dto.newPassword, targetUser.passwordHash)) {
      throw new BadRequestException('La nueva contraseña debe ser diferente de la anterior');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, PASSWORD_ROUNDS);
    const claimAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.authActionToken.updateMany({
        where: {
          id: actionToken.id,
          type: 'PASSWORD_RESET',
          tokenHash: actionToken.tokenHash,
          usedAt: null,
          expiresAt: { gt: claimAt },
        },
        data: { usedAt: claimAt },
      });
      if (claimed.count !== 1) throw new BadRequestException('El enlace ya fue utilizado');
      const changed = await tx.user.updateMany({
        where: {
          id: actionToken.userId,
          isActive: true,
          passwordHash: targetUser.passwordHash,
          securityVersion: targetUser.securityVersion,
        },
        data: { passwordHash, mustChangePassword: false, securityVersion: { increment: 1 }, refreshTokenHash: null },
      });
      if (changed.count !== 1) {
        throw new ConflictException('La contraseña cambió durante la operación; inténtalo nuevamente');
      }
      await tx.refreshSession.updateMany({
        where: { userId: actionToken.userId, revokedAt: null },
        data: { revokedAt: claimAt },
      });
      await tx.authActionToken.updateMany({
        where: { userId: actionToken.userId, type: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: claimAt },
      });
      await tx.twoFactorCredential.updateMany({ where: { userId: actionToken.userId }, data: { pendingEncrypted: null, pendingExpiresAt: null } });
      await tx.twoFactorChallenge.deleteMany({ where: { userId: actionToken.userId } });
    });
    return { ok: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.', userId: actionToken.userId };
  }

  async requestEmailVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    if (user.emailVerifiedAt) return { ok: true as const, message: 'Tu correo ya está verificado.' };
    this.assertActionDeliveryAvailable();
    return this.issueActionLink(user, 'EMAIL_VERIFICATION');
  }

  async verifyEmail(rawToken: string) {
    const now = new Date();
    const tokenHash = hashAuthActionToken(rawToken);
    const actionToken = await this.prisma.authActionToken.findUnique({ where: { tokenHash } });
    if (
      !actionToken
      || actionToken.type !== 'EMAIL_VERIFICATION'
      || actionToken.usedAt
      || actionToken.expiresAt <= now
    ) {
      throw new BadRequestException('El enlace es inválido, ya fue utilizado o expiró');
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.authActionToken.updateMany({
        where: {
          id: actionToken.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: actionToken.tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException('El enlace ya fue utilizado');
      await tx.user.update({ where: { id: actionToken.userId }, data: { emailVerifiedAt: now } });
      await tx.authActionToken.updateMany({
        where: { userId: actionToken.userId, type: 'EMAIL_VERIFICATION', usedAt: null },
        data: { usedAt: now },
      });
    });
    await this.gamification.award(actionToken.userId, 'REGISTRO_COMPLETO', 'USER', actionToken.userId);
    return { ok: true, message: 'Correo verificado correctamente.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, metadata: AuthRequestMetadata = {}) {
    assertNewPassword(dto.newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException('La nueva contraseña debe ser diferente de la actual');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, PASSWORD_ROUNDS);
    const now = new Date();
    const nextSecurityVersion = user.securityVersion + 1;
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          isActive: true,
          passwordHash: user.passwordHash,
          securityVersion: user.securityVersion,
        },
        data: { passwordHash, mustChangePassword: false, securityVersion: { increment: 1 }, refreshTokenHash: null },
      });
      if (changed.count !== 1) {
        throw new ConflictException('La contraseña cambió durante la operación; vuelve a intentarlo');
      }
      await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.authActionToken.updateMany({
        where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: now },
      });
      await tx.twoFactorCredential.updateMany({ where: { userId: user.id }, data: { pendingEncrypted: null, pendingExpiresAt: null } });
      await tx.twoFactorChallenge.deleteMany({ where: { userId: user.id } });
    });
    const tokens = await this.createSession(user.id, nextSecurityVersion, metadata);
    return { ok: true, message: 'Contraseña actualizada y otras sesiones cerradas.', ...tokens };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, absoluteExpiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true, absoluteExpiresAt: true },
    });
    return sessions.map((session) => ({ ...session, isCurrent: session.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException('La sesión no existe o ya fue cerrada');
    return { ok: true };
  }

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    const result = await this.prisma.refreshSession.updateMany({
      where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true, revoked: result.count };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        profile: true,
        badges: { include: { badge: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash, refreshTokenHash, securityVersion: _securityVersion, ...rest } = user;
    return { ...rest, roles: user.roles.map((r) => r.role.name) };
  }
}
