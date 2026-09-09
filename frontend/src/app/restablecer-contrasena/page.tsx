'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo actualizar la contraseña';

function ResetPasswordContent() {
  const { logout } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const queryToken = new URLSearchParams(window.location.search).get('token');
    const fragmentToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    const captured = fragmentToken ?? queryToken ?? '';
    queueMicrotask(() => {
      if (!active) return;
      setToken(captured);
      window.history.replaceState(window.history.state, '', window.location.pathname);
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) return setError('El enlace no contiene un token válido. Solicita uno nuevo.');
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    try {
      const result = await api.post<{ currentSessionInvalidated: boolean }>('/auth/password/reset', { token, newPassword: password });
      if (result.currentSessionInvalidated) await logout();
      setDone(true);
      setPassword('');
      setConfirm('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound className="h-6 w-6" /></div>
          <h1 className="font-serif-heading text-2xl font-bold text-primary">Crear nueva contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">El enlace solo puede utilizarse una vez.</p>
        </div>

        {done ? (
          <div className="space-y-4 rounded-2xl border border-success/30 bg-card p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <div>
              <h2 className="font-bold">Contraseña actualizada</h2>
              <p className="mt-1 text-sm text-muted-foreground">Todas tus sesiones anteriores fueron cerradas por seguridad.</p>
            </div>
            <Link href="/login"><Button className="w-full">Iniciar sesión</Button></Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
            {token === '' && <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Este enlace está incompleto. Solicita una nueva recuperación.</p>}
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">Nueva contraseña</Label>
              <Input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm">Confirmar contraseña</Label>
              <Input id="reset-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
            </div>
            {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={loading || token === null || token === ''}>
              {loading ? <Loader2 className="animate-spin" /> : <KeyRound />} Guardar contraseña
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/olvide-contrasena" className="font-semibold text-primary hover:underline">Solicitar otro enlace</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function RestablecerContrasenaPage() {
  return <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><ResetPasswordContent /></Suspense>;
}
