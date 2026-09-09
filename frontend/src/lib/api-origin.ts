/** Server-only destination, evaluated at runtime (never a browser URL). */
export function apiInternalOrigin() {
  const value = process.env.API_INTERNAL_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:4000');
  if (!value) throw new Error('API_INTERNAL_URL is required in production');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API_INTERNAL_URL must be an HTTP(S) origin without a path or credentials');
  }
  return url.origin;
}
