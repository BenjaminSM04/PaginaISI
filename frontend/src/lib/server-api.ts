import { apiInternalOrigin } from './api-origin';

/** Fetch del lado servidor para páginas públicas (SSR/ISR). Nunca lanza: devuelve fallback. */
export async function serverGet<T>(path: string, fallback: T, revalidate = 60): Promise<T> {
  try {
    const res = await fetch(`${apiInternalOrigin()}/api${path}`, { next: { revalidate }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
