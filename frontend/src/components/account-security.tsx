'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, Laptop, Loader2, LogOut, MailCheck, ShieldCheck, Smartphone } from 'lucide-react';
import { api, setAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

interface SessionItem {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  isCurrent: boolean;
}

interface ActionResult {
  ok: true;
  message: string;
  previewUrl?: string;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Ocurrió un error inesperado';

function deviceName(userAgent?: string | null) {
  if (!userAgent) return 'Dispositivo desconocido';
  const browser = userAgent.includes('Edg/') ? 'Edge'
    : userAgent.includes('Firefox/') ? 'Firefox'
      : userAgent.includes('Chrome/') ? 'Chrome'
        : userAgent.includes('Safari/') ? 'Safari'
          : 'Navegador';
  const system = userAgent.includes('Windows') ? 'Windows'
    : userAgent.includes('Android') ? 'Android'
      : /iPhone|iPad/.test(userAgent) ? 'iOS'
        : userAgent.includes('Mac OS') ? 'macOS'
          : userAgent.includes('Linux') ? 'Linux'
            : 'sistema desconocido';
  return `${browser} en ${system}`;
}

function safePreviewUrl(value?: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function AccountSecurity() {
  const { user, logout, refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.get<SessionItem[]>('/auth/sessions'),
  });

  const verification = useMutation({
    mutationFn: () => api.post<ActionResult>('/auth/email/verification'),
    onSuccess: () => void refreshMe(),
  });

  const password = useMutation({
    mutationFn: () => api.post<ActionResult & { accessToken: string }>('/auth/password/change', {
      currentPassword,
      newPassword,
    }),
    onSuccess: async (result) => {
      setAccessToken(result.accessToken);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(result.message);
      await queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (session: SessionItem) => api.delete<{ ok: true; currentSessionRevoked: boolean }>(`/auth/sessions/${session.id}`),
    onSuccess: async (result) => {
      if (result.currentSessionRevoked) {
        await logout();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
    },
  });

  const revokeOthers = useMutation({
    mutationFn: () => api.post<{ ok: true; revoked: number }>('/auth/sessions/revoke-others'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth-sessions'] }),
  });

  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('Las contraseñas nuevas no coinciden.');
      return;
    }
    password.mutate();
  };

  const previewUrl = safePreviewUrl(verification.data?.previewUrl);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
              <MailCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold">Correo electrónico</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {user?.emailVerifiedAt ? `Verificado el ${formatDate(user.emailVerifiedAt, true)}` : 'Aún no está verificado.'}
              </p>
            </div>
          </div>
          {user?.emailVerifiedAt ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Verificado
            </span>
          ) : (
            <Button variant="outline" size="sm" disabled={verification.isPending} onClick={() => verification.mutate()}>
              {verification.isPending ? <Loader2 className="animate-spin" /> : <MailCheck />} Generar enlace
            </Button>
          )}
        </div>
        {verification.isError && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
            {errorMessage(verification.error)}
          </p>
        )}
        {verification.data && (
          <div role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            <p>{verification.data.message}</p>
            {previewUrl && (
              <p className="mt-2">
                <Link href={previewUrl} className="font-bold underline">Abrir enlace de verificación de la demo</Link>
                <span className="ml-2 text-xs opacity-75">Solo aparece en localhost.</span>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold">Cambiar contraseña</h2>
            <p className="text-sm text-muted-foreground">Al cambiarla se cerrarán automáticamente tus otras sesiones.</p>
          </div>
        </div>
        <form onSubmit={submitPassword} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="current-password">Contraseña actual</Label>
            <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={password.isPending}>
              {password.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Actualizar contraseña
            </Button>
            {(passwordMessage || password.isError) && (
              <p role={password.isError ? 'alert' : 'status'} className={password.isError ? 'text-sm text-red-500' : 'text-sm text-emerald-500'}>
                {password.isError ? errorMessage(password.error) : passwordMessage}
              </p>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <Laptop className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold">Sesiones activas</h2>
              <p className="text-sm text-muted-foreground">Revisa dónde está abierta tu cuenta y cierra accesos que no reconozcas.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
            {revokeOthers.isPending ? <Loader2 className="animate-spin" /> : <LogOut />} Cerrar las demás
          </Button>
        </div>

        {sessions.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : sessions.isError ? (
          <p role="alert" className="text-sm text-red-500">{errorMessage(sessions.error)}</p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {(sessions.data ?? []).map((session) => (
              <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 bg-card p-4">
                <div className="flex min-w-0 items-start gap-3">
                  {/Android|iPhone|iPad/.test(session.userAgent ?? '') ? <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /> : <Laptop className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {deviceName(session.userAgent)}
                      {session.isCurrent && <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">Esta sesión</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Última actividad: {formatDate(session.lastUsedAt, true)}{session.ipAddress ? ` · IP ${session.ipAddress}` : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Expiración máxima: {formatDate(session.absoluteExpiresAt, true)}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-red-500" disabled={revoke.isPending} onClick={() => revoke.mutate(session)}>
                  <LogOut /> Cerrar
                </Button>
              </div>
            ))}
            {(sessions.data?.length ?? 0) === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No hay sesiones activas.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
