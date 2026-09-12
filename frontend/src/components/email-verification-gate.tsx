'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Button } from './ui/button';

function PendingVerification() {
  const { user, logout, refreshMe } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Abre el enlace de verificación que enviamos a tu correo para activar tu cuenta.');
  const [error, setError] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timeout = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timeout);
  }, [cooldown]);

  const resend = async () => {
    setBusy(true); setError(false);
    try {
      const result = await api.post<{ message: string; previewUrl?: string }>('/auth/email/verification');
      setMessage(result.message); setCooldown(60);
      if (result.previewUrl) {
        const link = new URL(result.previewUrl);
        if (['http:', 'https:'].includes(link.protocol) && link.origin === window.location.origin) window.location.assign(link.toString());
      }
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : 'No se pudo enviar el enlace. Intenta nuevamente.');
    } finally { setBusy(false); }
  };

  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <section className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <MailCheck className="h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Verifica tu correo institucional</h1>
        <p className="break-all font-medium">{user?.email}</p>
        <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-danger' : 'text-sm text-muted-foreground'}>{message}</p>
        <p className="text-sm text-muted-foreground">Revisa también la carpeta de correo no deseado. El enlace vence en 24 horas.</p>
        <div className="flex flex-col gap-3">
          <Button onClick={() => void refreshMe()}>Ya verifiqué mi correo</Button>
          <Button variant="outline" disabled={busy || cooldown > 0} onClick={() => void resend()}>
            {busy && <Loader2 className="animate-spin" />}{cooldown > 0 ? `Reenviar en ${cooldown} s` : 'Reenviar enlace'}
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>Cerrar sesión</Button>
        </div>
      </section>
    </main>
  );
}

export function EmailVerificationGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = !!user && !user.emailVerifiedAt && !['/verificar-correo', '/restablecer-contrasena', '/cambiar-contrasena'].includes(pathname);
  useEffect(() => {
    if (blocked && pathname !== '/cuenta') router.replace('/cuenta?tab=seguridad');
  }, [blocked, pathname, router]);
  return blocked ? <PendingVerification /> : <>{children}</>;
}
