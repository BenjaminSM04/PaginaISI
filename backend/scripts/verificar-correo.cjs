// Comprueba TLS y autenticación sin enviar mensajes ni mostrar secretos.
const path = require('node:path');
const fs = require('node:fs');
const { createTransport } = require('nodemailer');
const { mailDiagnostic } = require('../dist/auth/mail-diagnostic');

async function main() {
  const supplied = process.argv[2];
  const envPath = supplied ? path.resolve(supplied) : path.join(__dirname, '..', '.env');
  try {
    if (supplied || fs.existsSync(envPath)) process.loadEnvFile(envPath);
  } catch { throw Object.assign(new Error(), { code: 'SMTP_CONFIG' }); }
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) throw Object.assign(new Error(), { code: 'SMTP_CONFIG' });
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE || String(port === 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !['true', 'false'].includes(secure)
    || (port === 465 && secure !== 'true') || (port === 587 && secure !== 'false')) {
    throw Object.assign(new Error(), { code: 'SMTP_CONFIG' });
  }
  const transport = createTransport({
    host: SMTP_HOST, port, secure: secure === 'true',
    requireTLS: true, tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    logger: false, debug: false,
  });
  try {
    await transport.verify();
    console.log('SMTP verificado: conexión TLS y autenticación correctas. No se enviaron mensajes.');
  } finally { transport.close(); }
}

main().catch(error => {
  console.error(`No se pudo verificar el correo. ${mailDiagnostic(error)}.`);
  process.exitCode = 1;
});
