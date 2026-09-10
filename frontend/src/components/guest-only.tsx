'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { callbackFromLocation, safeAuthCallback } from '@/lib/navigation';

export function GuestOnly({
  children,
  fallback = '/cuenta',
}: {
  children: ReactNode;
  fallback?: string;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const redirectStarted = useRef(false);

  useEffect(() => {
    if (loading || !user || redirectStarted.current) return;
    redirectStarted.current = true;
    router.replace(user.mustChangePassword ? '/cambiar-contrasena' : callbackFromLocation(safeAuthCallback(fallback, '/cuenta')));
  }, [fallback, loading, router, user]);

  if (loading || user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">{loading ? 'Comprobando sesión' : 'Redirigiendo a tu cuenta'}</span>
      </div>
    );
  }

  return <>{children}</>;
}
