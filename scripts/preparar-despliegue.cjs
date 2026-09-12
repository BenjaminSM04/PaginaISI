// Ejecutar desde el repositorio: node scripts/preparar-despliegue.cjs https://tu-dominio
// Conserva las claves de base de datos y TOTP del .env; escribe .env.production.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

try {
  const rawUrl = process.argv[2];
  if (!rawUrl) throw new Error('Indica la URL pública: node scripts/preparar-despliegue.cjs https://tu-dominio');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || /\.(invalid|test|example)$/.test(url.hostname)) {
    throw new Error('Usa el origen HTTPS definitivo, sin rutas, credenciales ni parámetros.');
  }
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, '.env'), 'utf8');
  const env = parseEnv(source);
  for (const key of ['POSTGRES_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TOTP_ENCRYPTION_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) {
    if (!env[key]) throw new Error(`Falta ${key} en .env.`);
  }
  const updates = { PUBLIC_WEB_URL: url.origin, WEB_ORIGIN: url.origin, TRUST_PROXY_HOPS: '1', AUTH_DEV_LINKS: 'false', ENABLE_SWAGGER: 'false', SEED_ON_FIRST_RUN: 'false', ALLOW_DEMO_SEED: 'false' };
  let output = source;
  for (const [key, value] of Object.entries(updates)) {
    const expression = new RegExp(`^${key}=.*$`, 'm');
    output = expression.test(output) ? output.replace(expression, () => `${key}=${value}`) : `${output.trimEnd()}\n${key}=${value}\n`;
  }
  fs.writeFileSync(path.join(root, '.env.production'), output, { mode: 0o600 });
  console.log(`Configuración preparada en .env.production para ${url.origin}. Transfiérela de forma privada como .env al servidor.`);
  console.log('Usa Nginx con HTTPS y /api directo al puerto API (TRUST_PROXY_HOPS=1). Los datos se conservan; el seed demo está desactivado.');
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'No se encontró .env en la raíz del repositorio.' : error instanceof TypeError ? 'La URL pública no es válida.' : error.message);
  process.exitCode = 1;
}
