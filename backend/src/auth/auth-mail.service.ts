import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenType } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';
import { EnvironmentVariables } from '../config/environment';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export function authEmailContent(type: AuthTokenType, actionUrl: string) {
  const reset = type === 'PASSWORD_RESET';
  const title = reset ? 'Restablece tu contraseña' : 'Verifica tu correo institucional';
  const introduction = reset
    ? 'Recibimos una solicitud para restablecer la contraseña de tu cuenta.'
    : 'Confirma que este correo te pertenece para activar tu acceso al portal académico.';
  const expiration = reset ? '30 minutos' : '24 horas';
  const warning = 'Si no solicitaste esta acción, puedes ignorar este mensaje. No compartas este enlace.';
  return {
    subject: `${title} · Univalle`,
    text: `${title}\n\n${introduction}\n\n${actionUrl}\n\nEl enlace es de un solo uso y vence en ${expiration}.\n\n${warning}\n\nSICI · Universidad Privada del Valle`,
    html: `<div lang="es" style="background:#f5f5f5;padding:24px;font-family:Arial,sans-serif;color:#262626"><div style="max-width:560px;margin:auto;background:#fff;padding:32px;border-top:6px solid #7B1113"><p style="color:#7B1113;font-weight:bold">SICI · Univalle</p><h1 style="font-size:24px">${title}</h1><p>${introduction}</p><p style="margin:28px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#7B1113;color:#fff;padding:14px 20px;border-radius:6px;text-decoration:none">${title}</a></p><p>El enlace es de un solo uso y vence en ${expiration}.</p><p>Si el botón no funciona, copia este enlace:</p><p style="word-break:break-all">${escapeHtml(actionUrl)}</p><p style="font-size:13px;color:#525252">${warning}</p></div></div>`,
  };
}

@Injectable()
export class AuthMailService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthMailService.name);
  private transport?: Transporter;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    if (config.get('SMTP_HOST', { infer: true })) {
      this.transport = createTransport({
        host: config.getOrThrow('SMTP_HOST', { infer: true }),
        port: config.getOrThrow('SMTP_PORT', { infer: true }),
        secure: config.getOrThrow('SMTP_SECURE', { infer: true }),
        requireTLS: true,
        auth: { user: config.getOrThrow('SMTP_USER', { infer: true }), pass: config.getOrThrow('SMTP_PASSWORD', { infer: true }) },
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
        disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
      });
    }
  }

  assertAvailable() {
    if (!this.config.getOrThrow('AUTH_DEV_LINKS', { infer: true }) && !this.transport && !this.config.get('AUTH_EMAIL_WEBHOOK_URL', { infer: true })) {
      throw new ServiceUnavailableException('El envío de correo no está configurado');
    }
  }

  async deliver(email: string, type: AuthTokenType, actionUrl: string, expiresAt: Date) {
    this.assertAvailable();
    if (this.config.getOrThrow('AUTH_DEV_LINKS', { infer: true })) return;
    try {
      if (this.transport) {
        const result = await this.transport.sendMail({
          from: { name: this.config.getOrThrow('SMTP_FROM_NAME', { infer: true }), address: this.config.getOrThrow('SMTP_FROM', { infer: true }) },
          to: { name: '', address: email },
          ...authEmailContent(type, actionUrl),
        });
        if (!result.accepted?.length || result.rejected?.length) throw new Error('Recipient rejected');
        return;
      }
      const response = await fetch(this.config.getOrThrow('AUTH_EMAIL_WEBHOOK_URL', { infer: true }), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.getOrThrow('AUTH_EMAIL_WEBHOOK_SECRET', { infer: true })}` },
        body: JSON.stringify({ to: email, type, actionUrl, expiresAt: expiresAt.toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Delivery rejected');
    } catch {
      // Nunca registrar destinatarios, enlaces, contraseñas ni respuestas SMTP.
      this.logger.error(`No se pudo entregar el correo de ${type}. Revisa el proveedor y la configuración de correo.`);
      throw new ServiceUnavailableException('No se pudo enviar el correo en este momento. Intenta nuevamente en un minuto.');
    }
  }

  onModuleDestroy() { this.transport?.close(); }
}
