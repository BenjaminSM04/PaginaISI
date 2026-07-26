'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { loginHrefFor, safeInternalPath } from '@/lib/navigation';

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const redirectStarted = useRef(false);

  useEffect(() => {
    if (loading || user || redirectStarted.current) return;
    redirectStarted.current = true;
    const currentPath = typeof window === 'undefined'
      ? pathname
      : `${pathname}${window.location.search}${window.location.hash}`;
    router.replace(loginHrefFor(safeInternalPath(currentPath, '/')));
  }, [loading, pathname, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Comprobando sesión</span>
      </div>
    );
  }
  if (!user) return null;
  if (roles && roles.length > 0 && !hasRole(...roles)) {
    return (
      <div className="container py-20 text-center">
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Acceso restringido</h1>
        <p className="mt-2 text-sm text-muted-foreground">No tienes permisos para ver esta sección.</p>
      </div>
    );
  }
  return <>{children}</>;
}
