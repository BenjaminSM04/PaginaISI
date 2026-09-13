/** Solo un 404 representa un perfil inexistente u oculto; otros fallos permiten reintentar. */
export async function fetchPublicProfile<T>(origin: string, username: string): Promise<T | null> {
  const response = await fetch(`${origin}/api/users/${encodeURIComponent(username)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('No se pudo cargar el perfil. Intenta nuevamente.');
  return await response.json() as T;
}

export function ownProfileHref(user: { username: string; emailVerifiedAt?: string | null }): string {
  return user.emailVerifiedAt ? `/perfil/${encodeURIComponent(user.username)}` : '/cuenta?tab=seguridad';
}
