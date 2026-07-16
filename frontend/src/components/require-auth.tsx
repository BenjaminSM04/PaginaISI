'use client';

import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
