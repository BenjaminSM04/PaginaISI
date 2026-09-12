// Comprueba TLS y autenticación sin enviar mensajes ni mostrar secretos.
const path = require('node:path');
const fs = require('node:fs');
const { createTransport } = require('nodemailer');

async function main() {
  const supplied = process.argv[2];
  const envPath = supplied ? path.resolve(supplied) : path.join(__dirname, '..', '.env');
  if (supplied || fs.existsSync(envPath)) process.loadEnvFile(envPath);
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) throw new Error('SMTP_CONFIG');
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = createTransport({
    host: SMTP_HOST, port, secure: (process.env.SMTP_SECURE || String(port === 465)) === 'true',
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
  const code = ['EAUTH', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS'].includes(error?.code) ? error.code : 'SMTP_CONFIG';
  console.error(`No se pudo verificar el correo (${code}). Revisa las variables SMTP, la contraseña de aplicación y la salida de red del servidor.`);
  process.exitCode = 1;
});
