const BASE = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** Fetch del lado servidor para páginas públicas (SSR/ISR). Nunca lanza: devuelve fallback. */
export async function serverGet<T>(path: string, fallback: T, revalidate = 60): Promise<T> {
  try {
    const res = await fetch(`${BASE}/api${path}`, { next: { revalidate } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
