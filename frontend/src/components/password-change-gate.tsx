'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ChangePasswordForm } from './change-password-form';
import { Button } from './ui/button';

export function PasswordChangeGate({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (user?.mustChangePassword && pathname !== '/cambiar-contrasena') router.replace('/cambiar-contrasena');
  }, [user?.mustChangePassword, pathname, router]);
  if (!user?.mustChangePassword) return <>{children}</>;
  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <section className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Actualiza tu contraseña</h1>
        <p className="text-sm">Por seguridad, debes reemplazar tu contraseña inicial antes de acceder al portal.</p>
        <ChangePasswordForm mandatory />
        <Button variant="ghost" onClick={() => void logout()}>Cerrar sesión</Button>
      </section>
    </main>
  );
}
