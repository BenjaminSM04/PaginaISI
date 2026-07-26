const INTERNAL_ORIGIN = 'https://sistema-isi.local';
const AUTH_ENTRY_PATHS = new Set(['/login', '/registro']);

function normalizedPathname(pathname: string) {
  let decoded = pathname;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  const normalized = decoded.replace(/\/+$/, '') || '/';
  return normalized.toLocaleLowerCase('es');
}

function parseInternalPath(value: string | null | undefined) {
  if (!value) return null;
  const candidate = value.trim();
  if (
    !candidate.startsWith('/')
    || candidate.startsWith('//')
    || candidate.includes('\\')
    || /%(?:2f|5c)/i.test(candidate)
    || /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return null;
  }

  try {
    const base = new URL(INTERNAL_ORIGIN);
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin || parsed.username || parsed.password) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/**
 * Accepts only same-application absolute paths. Protocol-relative URLs,
 * backslashes and encoded path separators are rejected to avoid open redirects.
 */
export function safeInternalPath(value: string | null | undefined, fallback = '/') {
  return parseInternalPath(value) ?? parseInternalPath(fallback) ?? '/';
}

/**
 * Authentication callbacks additionally exclude the guest-only entry routes,
 * otherwise a successful login could redirect straight back to login/register.
 */
export function safeAuthCallback(value: string | null | undefined, fallback = '/cuenta') {
  const parsedFallback = safeInternalPath(fallback, '/cuenta');
  const safeFallback = AUTH_ENTRY_PATHS.has(normalizedPathname(new URL(parsedFallback, INTERNAL_ORIGIN).pathname))
    ? '/cuenta'
    : parsedFallback;
  const safe = safeInternalPath(value, safeFallback);
  try {
    const pathname = new URL(safe, INTERNAL_ORIGIN).pathname;
    return AUTH_ENTRY_PATHS.has(normalizedPathname(pathname)) ? safeFallback : safe;
  } catch {
    return safeFallback;
  }
}

export function loginHrefFor(currentPath: string) {
  const callbackUrl = safeAuthCallback(currentPath, '/');
  return callbackUrl === '/' ? '/login' : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function callbackFromLocation(fallback = '/cuenta') {
  if (typeof window === 'undefined') return fallback;
  const raw = new URLSearchParams(window.location.search).get('callbackUrl');
  return safeAuthCallback(raw, fallback);
}
