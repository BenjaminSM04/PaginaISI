export const JWT_ALGORITHM = 'HS256' as const;
export const ACCESS_TOKEN_TYPE = 'access' as const;
export const REFRESH_TOKEN_TYPE = 'refresh' as const;

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  DATABASE_URL: string;
  PORT: number;
  WEB_ORIGINS: string[];
  PUBLIC_WEB_URL: string;
  TRUST_PROXY_HOPS: number;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  TOTP_ENCRYPTION_KEY?: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  JWT_REFRESH_TTL_MS: number;
  SESSION_ABSOLUTE_TTL: string;
  SESSION_ABSOLUTE_TTL_MS: number;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  ENABLE_SWAGGER: boolean;
  STORAGE_DRIVER: 'local' | 's3';
  PUBLIC_API_URL: string;
  UPLOADS_PER_USER_PER_DAY: number;
  STORAGE_BYTES_PER_USER: number;
  CLEAN_ORPHAN_UPLOADS_ON_START: boolean;
  AUTH_DEV_LINKS: boolean;
  AUTH_EMAIL_WEBHOOK_URL?: string;
  AUTH_EMAIL_WEBHOOK_SECRET?: string;
  SECURITY_ALERT_WEBHOOK_URL?: string;
  SECURITY_ALERT_WEBHOOK_SECRET?: string;
}

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function optionalString(config: Record<string, unknown>, key: string): string | undefined {
  const raw = config[key];
  if (raw === undefined || raw === null) return undefined;
  const value = String(raw).trim();
  return value.length > 0 ? value : undefined;
}

function requiredString(config: Record<string, unknown>, key: string): string {
  const value = optionalString(config, key);
  if (!value) throw new Error(`Configuracion invalida: ${key} es obligatorio`);
  return value;
}

function strongSecret(config: Record<string, unknown>, key: string): string {
  const secret = requiredString(config, key);
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error(`Configuracion invalida: ${key} debe tener al menos 32 bytes`);
  }
  if (new Set(secret).size < 10 || /^(change[-_ ]?me|dev[-_ ]|test[-_ ]|password|secret)/i.test(secret)) {
    throw new Error(`Configuracion invalida: ${key} parece predecible o es un placeholder`);
  }
  return secret;
}

function duration(config: Record<string, unknown>, key: string, fallback: string): { value: string; ms: number } {
  const value = (optionalString(config, key) ?? fallback).toLowerCase();
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) {
    throw new Error(`Configuracion invalida: ${key} debe incluir unidad (por ejemplo, 15m o 7d)`);
  }
  const amount = Number(match[1]);
  const ms = amount * DURATION_UNITS[match[2]];
  if (!Number.isSafeInteger(ms) || amount <= 0) {
    throw new Error(`Configuracion invalida: ${key} debe ser una duracion positiva`);
  }
  return { value, ms };
}

function booleanValue(config: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = optionalString(config, key);
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Configuracion invalida: ${key} debe ser true o false`);
}

function databaseUrl(config: Record<string, unknown>): string {
  const value = requiredString(config, 'DATABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Configuracion invalida: DATABASE_URL no es una URL valida');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('Configuracion invalida: DATABASE_URL debe apuntar a una base PostgreSQL concreta');
  }
  return value;
}

function origins(config: Record<string, unknown>, nodeEnvironment: NodeEnvironment): string[] {
  const raw = optionalString(config, 'WEB_ORIGIN');
  if (!raw && nodeEnvironment === 'production') {
    throw new Error('Configuracion invalida: WEB_ORIGIN es obligatorio en produccion');
  }

  const entries = (raw ?? 'http://localhost:3000')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const normalized = new Set<string>();

  for (const entry of entries) {
    if (entry === '*') throw new Error('Configuracion invalida: WEB_ORIGIN no admite comodines');
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error(`Configuracion invalida: origen CORS no valido (${entry})`);
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    ) {
      throw new Error(`Configuracion invalida: WEB_ORIGIN debe contener solo origenes HTTP(S) (${entry})`);
    }
    const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
    if (nodeEnvironment === 'production' && parsed.protocol !== 'https:' && !loopback) {
      throw new Error(`Configuracion invalida: los origenes CORS deben usar HTTPS en produccion (${entry})`);
    }
    normalized.add(parsed.origin);
  }

  if (normalized.size === 0) throw new Error('Configuracion invalida: WEB_ORIGIN no contiene origenes');
  return [...normalized];
}

function httpUrl(config: Record<string, unknown>, key: string, fallback?: string): string {
  const value = optionalString(config, key) ?? fallback;
  if (!value) throw new Error(`Configuracion invalida: ${key} es obligatorio`);
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Configuracion invalida: ${key} debe ser una URL HTTP(S)`);
  }
}

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> & EnvironmentVariables {
  const rawNodeEnvironment = optionalString(config, 'NODE_ENV') ?? 'development';
  if (!['development', 'test', 'production'].includes(rawNodeEnvironment)) {
    throw new Error('Configuracion invalida: NODE_ENV debe ser development, test o production');
  }
  const nodeEnvironment = rawNodeEnvironment as NodeEnvironment;

  const dbUrl = databaseUrl(config);
  const accessSecret = strongSecret(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = strongSecret(config, 'JWT_REFRESH_SECRET');
  if (accessSecret === refreshSecret) {
    throw new Error('Configuracion invalida: los secretos JWT de access y refresh deben ser distintos');
  }

  const accessTtl = duration(config, 'JWT_ACCESS_TTL', '15m');
  const refreshTtl = duration(config, 'JWT_REFRESH_TTL', '7d');
  const absoluteSessionTtl = duration(config, 'SESSION_ABSOLUTE_TTL', '30d');
  if (accessTtl.ms < 30_000 || accessTtl.ms > 86_400_000) {
    throw new Error('Configuracion invalida: JWT_ACCESS_TTL debe estar entre 30s y 1d');
  }
  if (refreshTtl.ms <= accessTtl.ms || refreshTtl.ms > 90 * 86_400_000) {
    throw new Error('Configuracion invalida: JWT_REFRESH_TTL debe ser mayor al access TTL y no superar 90d');
  }
  if (absoluteSessionTtl.ms < refreshTtl.ms || absoluteSessionTtl.ms > 90 * 86_400_000) {
    throw new Error('Configuracion invalida: SESSION_ABSOLUTE_TTL debe ser al menos el refresh TTL y no superar 90d');
  }

  const issuer = optionalString(config, 'JWT_ISSUER') ?? 'isi-portal-api';
  const audience = optionalString(config, 'JWT_AUDIENCE') ?? 'isi-portal-web';
  if (/\s/.test(issuer) || /\s/.test(audience) || issuer === '*' || audience === '*') {
    throw new Error('Configuracion invalida: JWT_ISSUER y JWT_AUDIENCE no admiten espacios ni comodines');
  }

  const port = Number(optionalString(config, 'PORT') ?? '4000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Configuracion invalida: PORT debe ser un entero entre 1 y 65535');
  }

  const webOrigins = origins(config, nodeEnvironment);
  const rawPublicWebUrl = httpUrl(config, 'PUBLIC_WEB_URL', webOrigins[0]);
  const parsedPublicWebUrl = new URL(rawPublicWebUrl);
  if (parsedPublicWebUrl.pathname !== '/' || parsedPublicWebUrl.search || parsedPublicWebUrl.hash) {
    throw new Error('Configuracion invalida: PUBLIC_WEB_URL debe contener solo el origen, sin ruta, query ni fragmento');
  }
  const publicWebUrl = parsedPublicWebUrl.origin;
  if (!webOrigins.includes(publicWebUrl)) {
    throw new Error('Configuracion invalida: PUBLIC_WEB_URL debe estar incluido en WEB_ORIGIN');
  }
  const publicWebLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsedPublicWebUrl.hostname);
  if (nodeEnvironment === 'production' && !publicWebLoopback && parsedPublicWebUrl.protocol !== 'https:') {
    throw new Error('Configuracion invalida: PUBLIC_WEB_URL debe usar HTTPS fuera de loopback en produccion');
  }
  const trustProxyHops = Number(optionalString(config, 'TRUST_PROXY_HOPS') ?? '0');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
    throw new Error('Configuracion invalida: TRUST_PROXY_HOPS debe ser un entero entre 0 y 5');
  }
  const enableSwagger = booleanValue(config, 'ENABLE_SWAGGER');
  const authDevLinks = booleanValue(config, 'AUTH_DEV_LINKS');
  if (authDevLinks) {
    const localOnly = webOrigins.every((origin) => {
      const hostname = new URL(origin).hostname;
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    });
    if (!localOnly) {
      throw new Error('Configuracion invalida: AUTH_DEV_LINKS solo puede habilitarse con WEB_ORIGIN local');
    }
  }
  const authEmailWebhookUrl = optionalString(config, 'AUTH_EMAIL_WEBHOOK_URL');
  const authEmailWebhookSecret = optionalString(config, 'AUTH_EMAIL_WEBHOOK_SECRET');
  if (authEmailWebhookUrl) {
    const normalizedWebhookUrl = httpUrl(config, 'AUTH_EMAIL_WEBHOOK_URL');
    const webhookHost = new URL(normalizedWebhookUrl).hostname;
    const loopbackWebhook = webhookHost === 'localhost' || webhookHost === '127.0.0.1' || webhookHost === '[::1]';
    if (nodeEnvironment === 'production' && !loopbackWebhook && !normalizedWebhookUrl.startsWith('https://')) {
      throw new Error('Configuracion invalida: AUTH_EMAIL_WEBHOOK_URL debe usar HTTPS en produccion');
    }
    if (!authEmailWebhookSecret || Buffer.byteLength(authEmailWebhookSecret, 'utf8') < 16) {
      throw new Error('Configuracion invalida: AUTH_EMAIL_WEBHOOK_SECRET debe tener al menos 16 bytes');
    }
  }
  if (nodeEnvironment === 'production' && !authDevLinks && !authEmailWebhookUrl) {
    throw new Error('Configuracion invalida: configura AUTH_EMAIL_WEBHOOK_URL o habilita AUTH_DEV_LINKS solo en localhost');
  }
  const securityAlertWebhookUrl = optionalString(config, 'SECURITY_ALERT_WEBHOOK_URL');
  const securityAlertWebhookSecret = optionalString(config, 'SECURITY_ALERT_WEBHOOK_SECRET');
  if (securityAlertWebhookUrl) {
    const normalizedWebhookUrl = httpUrl(config, 'SECURITY_ALERT_WEBHOOK_URL');
    const webhookHost = new URL(normalizedWebhookUrl).hostname;
    const loopbackWebhook = webhookHost === 'localhost' || webhookHost === '127.0.0.1' || webhookHost === '[::1]';
    if (nodeEnvironment === 'production' && !loopbackWebhook && !normalizedWebhookUrl.startsWith('https://')) {
      throw new Error('Configuracion invalida: SECURITY_ALERT_WEBHOOK_URL debe usar HTTPS en produccion');
    }
    if (!securityAlertWebhookSecret || Buffer.byteLength(securityAlertWebhookSecret, 'utf8') < 32) {
      throw new Error('Configuracion invalida: SECURITY_ALERT_WEBHOOK_SECRET debe tener al menos 32 bytes');
    }
  } else if (securityAlertWebhookSecret) {
    throw new Error('Configuracion invalida: SECURITY_ALERT_WEBHOOK_SECRET requiere SECURITY_ALERT_WEBHOOK_URL');
  }
  const storageDriver = optionalString(config, 'STORAGE_DRIVER') ?? 'local';
  const totpKey = optionalString(config, 'TOTP_ENCRYPTION_KEY');
  if (totpKey && (!/^[a-fA-F0-9]{64}$/.test(totpKey) || totpKey === accessSecret || totpKey === refreshSecret)) {
    throw new Error('Configuracion invalida: TOTP_ENCRYPTION_KEY requiere 32 bytes hexadecimales y debe ser independiente de los secretos JWT');
  }
  if (nodeEnvironment === 'production' && !totpKey) {
    throw new Error('Configuracion invalida: TOTP_ENCRYPTION_KEY es obligatorio en produccion');
  }
  if (!['local', 's3'].includes(storageDriver)) {
    throw new Error('Configuracion invalida: STORAGE_DRIVER debe ser local o s3');
  }
  const publicApiUrl = httpUrl(config, 'PUBLIC_API_URL', `http://localhost:${port}`);
  const publicApiHost = new URL(publicApiUrl).hostname;
  const publicApiLoopback = publicApiHost === 'localhost' || publicApiHost === '127.0.0.1' || publicApiHost === '[::1]';
  if (nodeEnvironment === 'production' && !publicApiLoopback && !publicApiUrl.startsWith('https://')) {
    throw new Error('Configuracion invalida: PUBLIC_API_URL debe usar HTTPS fuera de loopback en produccion');
  }
  const uploadsPerDay = Number(optionalString(config, 'UPLOADS_PER_USER_PER_DAY') ?? '25');
  if (!Number.isInteger(uploadsPerDay) || uploadsPerDay < 1 || uploadsPerDay > 100) {
    throw new Error('Configuracion invalida: UPLOADS_PER_USER_PER_DAY debe estar entre 1 y 100');
  }
  const storageBytesPerUser = Number(optionalString(config, 'STORAGE_BYTES_PER_USER') ?? String(250 * 1024 * 1024));
  if (!Number.isSafeInteger(storageBytesPerUser) || storageBytesPerUser < 10 * 1024 * 1024 || storageBytesPerUser > 10 * 1024 * 1024 * 1024) {
    throw new Error('Configuracion invalida: STORAGE_BYTES_PER_USER debe estar entre 10 MB y 10 GB');
  }
  const cleanOrphanUploadsOnStart = booleanValue(config, 'CLEAN_ORPHAN_UPLOADS_ON_START', true);
  if (storageDriver === 's3') {
    const bucket = requiredString(config, 'S3_BUCKET');
    requiredString(config, 'S3_ACCESS_KEY');
    requiredString(config, 'S3_SECRET_KEY');
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
      throw new Error('Configuracion invalida: S3_BUCKET no tiene un nombre valido');
    }
    if (optionalString(config, 'S3_ENDPOINT')) httpUrl(config, 'S3_ENDPOINT');
    if (optionalString(config, 'S3_PUBLIC_URL')) httpUrl(config, 'S3_PUBLIC_URL');
  }

  Object.assign(process.env, {
    NODE_ENV: nodeEnvironment,
    DATABASE_URL: dbUrl,
    PORT: String(port),
    WEB_ORIGIN: webOrigins.join(','),
    PUBLIC_WEB_URL: publicWebUrl,
    TRUST_PROXY_HOPS: String(trustProxyHops),
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_TTL: accessTtl.value,
    JWT_REFRESH_TTL: refreshTtl.value,
    SESSION_ABSOLUTE_TTL: absoluteSessionTtl.value,
    JWT_ISSUER: issuer,
    JWT_AUDIENCE: audience,
    ENABLE_SWAGGER: String(enableSwagger),
    STORAGE_DRIVER: storageDriver,
    PUBLIC_API_URL: publicApiUrl,
    UPLOADS_PER_USER_PER_DAY: String(uploadsPerDay),
    STORAGE_BYTES_PER_USER: String(storageBytesPerUser),
    CLEAN_ORPHAN_UPLOADS_ON_START: String(cleanOrphanUploadsOnStart),
    AUTH_DEV_LINKS: String(authDevLinks),
  });

  return {
    ...config,
    NODE_ENV: nodeEnvironment,
    DATABASE_URL: dbUrl,
    PORT: port,
    WEB_ORIGINS: webOrigins,
    PUBLIC_WEB_URL: publicWebUrl,
    TRUST_PROXY_HOPS: trustProxyHops,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_TTL: accessTtl.value,
    JWT_REFRESH_TTL: refreshTtl.value,
    JWT_REFRESH_TTL_MS: refreshTtl.ms,
    SESSION_ABSOLUTE_TTL: absoluteSessionTtl.value,
    SESSION_ABSOLUTE_TTL_MS: absoluteSessionTtl.ms,
    JWT_ISSUER: issuer,
    JWT_AUDIENCE: audience,
    ENABLE_SWAGGER: enableSwagger,
    STORAGE_DRIVER: storageDriver as 'local' | 's3',
    PUBLIC_API_URL: publicApiUrl,
    UPLOADS_PER_USER_PER_DAY: uploadsPerDay,
    STORAGE_BYTES_PER_USER: storageBytesPerUser,
    CLEAN_ORPHAN_UPLOADS_ON_START: cleanOrphanUploadsOnStart,
    AUTH_DEV_LINKS: authDevLinks,
    AUTH_EMAIL_WEBHOOK_URL: authEmailWebhookUrl,
    AUTH_EMAIL_WEBHOOK_SECRET: authEmailWebhookSecret,
    SECURITY_ALERT_WEBHOOK_URL: securityAlertWebhookUrl,
    SECURITY_ALERT_WEBHOOK_SECRET: securityAlertWebhookSecret,
    TOTP_ENCRYPTION_KEY: totpKey,
  };
}
