import { BadRequestException, ConflictException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TwoFactorCredential, User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Secret } from 'otpauth';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { EnvironmentVariables } from '../config/environment';
import { createTotp, decryptTotp, encryptTotp, matchingCounter } from './two-factor-crypto';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const CHALLENGE_TTL = 5 * 60_000;
const SETUP_TTL = 10 * 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class TwoFactorService {
  constructor(private prisma: PrismaService, private config: ConfigService<EnvironmentVariables, true>) {}

  private key() { return this.config.get('TOTP_ENCRYPTION_KEY', { infer: true }); }

  private async passwordUser(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) throw new UnauthorizedException('La cuenta no está disponible');
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new BadRequestException('La contraseña actual no es correcta');
    if (user.mustChangePassword) throw new BadRequestException('Primero cambia tu contraseña');
    return user;
  }

  async beginSetup(userId: string, password: string) {
    const user = await this.passwordUser(userId, password);
    if (user.twoFactorEnabled) throw new ConflictException('La autenticación de dos factores ya está activa');
    const secret = new Secret({ size: 20 }).base32;
    const encrypted = encryptTotp(secret, userId, this.key());
    const expiresAt = new Date(Date.now() + SETUP_TTL);
    await this.prisma.twoFactorCredential.upsert({ where: { userId }, create: { userId }, update: {} });
    const updated = await this.prisma.twoFactorCredential.updateMany({
      where: { userId, user: { twoFactorEnabled: false, securityVersion: user.securityVersion } },
      data: { pendingEncrypted: encrypted, pendingExpiresAt: expiresAt },
    });
    if (updated.count !== 1) throw new ConflictException('La cuenta cambió; vuelve a iniciar la configuración');
    const institution = await this.prisma.institutionalSettings.findUnique({ where: { id: 'default' }, select: { shortName: true } });
    const uri = createTotp(secret, user.email, institution?.shortName || 'Univalle').toString();
    // Generate locally. Never transmit the enrollment secret to a QR service.
    return { secret, qrCode: await toDataURL(uri, { width: 256, margin: 2 }), expiresAt };
  }

  /** Persistent, account-wide attempt budget; creating a new challenge does not reset it. */
  private async reserveAttempt(userId: string) {
    const now = new Date();
    await this.prisma.twoFactorCredential.updateMany({
      where: { userId, blockedUntil: { lte: now } }, data: { failedAttempts: 0, blockedUntil: null },
    });
    const attempt = await this.prisma.twoFactorCredential.updateMany({
      where: { userId, blockedUntil: null, failedAttempts: { lt: MAX_ATTEMPTS } },
      data: { failedAttempts: { increment: 1 } },
    });
    if (attempt.count !== 1) {
      await this.prisma.twoFactorCredential.updateMany({ where: { userId, blockedUntil: null }, data: { blockedUntil: new Date(Date.now() + SETUP_TTL) } });
      throw new HttpException('Demasiados intentos. Espera diez minutos antes de volver a intentarlo.', 429);
    }
  }

  private async consumeCode(tx: Prisma.TransactionClient, factor: TwoFactorCredential, code: string, pending = false) {
    const encrypted = pending ? factor.pendingEncrypted : factor.secretEncrypted;
    if (!encrypted || (pending && (!factor.pendingExpiresAt || factor.pendingExpiresAt <= new Date()))) return false;
    if (!pending && /^[a-fA-F0-9]{20}$/.test(code)) {
      const hash = digest(`${factor.userId}:${code.toLowerCase()}`);
      if (!factor.recoveryHashes.includes(hash)) return false;
      const claimed = await tx.twoFactorCredential.updateMany({
        where: { userId: factor.userId, secretEncrypted: encrypted, recoveryHashes: { equals: factor.recoveryHashes } },
        data: { recoveryHashes: { set: factor.recoveryHashes.filter(value => value !== hash) }, failedAttempts: 0, blockedUntil: null },
      });
      return claimed.count === 1;
    }
    const counter = matchingCounter(decryptTotp(encrypted, factor.userId, this.key()), code);
    if (counter === null || (!pending && factor.lastUsedCounter !== null && counter <= factor.lastUsedCounter)) return false;
    const claimed = await tx.twoFactorCredential.updateMany({
      where: {
        userId: factor.userId,
        ...(pending ? { pendingEncrypted: encrypted, pendingExpiresAt: { gt: new Date() } } : { secretEncrypted: encrypted, OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: counter } }] }),
      },
      data: { lastUsedCounter: counter, failedAttempts: 0, blockedUntil: null },
    });
    return claimed.count === 1;
  }

  private async changeState(tx: Prisma.TransactionClient, user: User, enabled: boolean) {
    const updated = await tx.user.updateMany({
      where: { id: user.id, isActive: true, securityVersion: user.securityVersion, twoFactorEnabled: user.twoFactorEnabled },
      data: { twoFactorEnabled: enabled, securityVersion: { increment: 1 }, refreshTokenHash: null },
    });
    if (updated.count !== 1) throw new ConflictException('La seguridad de la cuenta cambió; inicia sesión nuevamente');
    await tx.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.twoFactorChallenge.deleteMany({ where: { userId: user.id } });
  }

  async confirmSetup(userId: string, password: string, code: string) {
    const user = await this.passwordUser(userId, password);
    if (user.twoFactorEnabled) throw new ConflictException('La autenticación de dos factores ya está activa');
    const factor = await this.prisma.twoFactorCredential.findUnique({ where: { userId } });
    if (!factor) throw new BadRequestException('Inicia primero la configuración');
    await this.reserveAttempt(userId);
    const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(10).toString('hex'));
    await this.prisma.$transaction(async tx => {
      if (!(await this.consumeCode(tx, factor, code, true))) throw new BadRequestException('Código incorrecto o configuración expirada');
      await tx.twoFactorCredential.update({ where: { userId }, data: {
        secretEncrypted: factor.pendingEncrypted, pendingEncrypted: null, pendingExpiresAt: null,
        recoveryHashes: recoveryCodes.map(value => digest(`${userId}:${value}`)),
      } });
      await this.changeState(tx, user, true);
    });
    return { recoveryCodes, securityVersion: user.securityVersion + 1 };
  }

  async disable(userId: string, password: string, code: string) {
    const user = await this.passwordUser(userId, password);
    if (!user.twoFactorEnabled) throw new BadRequestException('La autenticación de dos factores no está activa');
    await this.reserveAttempt(userId);
    const factor = await this.prisma.twoFactorCredential.findUnique({ where: { userId } });
    await this.prisma.$transaction(async tx => {
      if (!factor || !(await this.consumeCode(tx, factor, code))) throw new BadRequestException('Código incorrecto o ya utilizado');
      await tx.twoFactorCredential.update({ where: { userId }, data: {
        secretEncrypted: null, pendingEncrypted: null, pendingExpiresAt: null, lastUsedCounter: null, recoveryHashes: [],
      } });
      await this.changeState(tx, user, false);
    });
    return { securityVersion: user.securityVersion + 1 };
  }

  async challenge(user: User) {
    const challengeToken = randomBytes(32).toString('base64url');
    await this.prisma.twoFactorChallenge.deleteMany({ where: { userId: user.id, OR: [{ expiresAt: { lte: new Date() } }, { usedAt: { not: null } }] } });
    await this.prisma.twoFactorChallenge.create({ data: {
      userId: user.id, tokenHash: digest(challengeToken), securityVersion: user.securityVersion,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL),
    } });
    return { requiresTwoFactor: true as const, challengeToken, expiresIn: CHALLENGE_TTL / 1000 };
  }

  async verifyLogin(challengeToken: string, code: string) {
    const challenge = await this.prisma.twoFactorChallenge.findUnique({ where: { tokenHash: digest(challengeToken) } });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) throw new UnauthorizedException('La verificación expiró; inicia sesión nuevamente');
    const attempt = await this.prisma.twoFactorChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (attempt.count !== 1) throw new UnauthorizedException('La verificación expiró; inicia sesión nuevamente');
    await this.reserveAttempt(challenge.userId);
    return this.prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: challenge.userId } });
      const factor = await tx.twoFactorCredential.findUnique({ where: { userId: challenge.userId } });
      if (!user?.isActive || !user.twoFactorEnabled || user.securityVersion !== challenge.securityVersion || !factor) throw new UnauthorizedException('La cuenta cambió; inicia sesión nuevamente');
      if (!(await this.consumeCode(tx, factor, code))) throw new UnauthorizedException('Código incorrecto o ya utilizado');
      const claimed = await tx.twoFactorChallenge.updateMany({ where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new UnauthorizedException('La verificación ya fue utilizada');
      return { userId: user.id, securityVersion: user.securityVersion };
    });
  }
}
