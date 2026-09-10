'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth, type AuthSession } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { Input, Label } from './ui/input';

interface Setup { secret: string; qrCode: string; expiresAt: string; }

export function TwoFactorSecurity() {
  const { user, acceptSession } = useAuth();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const begin = useMutation({
    mutationFn: () => api.post<Setup>('/auth/two-factor/setup', { password }),
    onSuccess: result => { setSetup(result); setCode(''); setMessage(''); },
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) => api.post<AuthSession & { recoveryCodes?: string[] }>(`/auth/two-factor/${enabled ? 'enable' : 'disable'}`, { password, code }),
    onSuccess: (result, enabled) => {
      setRecoveryCodes(result.recoveryCodes ?? []); setSetup(null); setPassword(''); setCode('');
      setMessage(enabled ? 'La autenticación en dos factores está activa.' : 'La autenticación en dos factores se desactivó.');
      acceptSession(result);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault(); begin.reset(); update.reset();
    if (user?.twoFactorEnabled) update.mutate(false);
    else if (setup) update.mutate(true);
    else begin.mutate();
  };
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div><h2 className="font-bold">Autenticación en dos factores</h2><p className="mt-1 text-sm text-muted-foreground">Protege tu cuenta con Google Authenticator, Microsoft Authenticator, Authy u otra aplicación TOTP.</p></div>
      <p className={user?.twoFactorEnabled ? 'text-sm text-success' : 'text-sm text-muted-foreground'}>Estado: {user?.twoFactorEnabled ? 'Activa' : 'Sin activar'}</p>
      {recoveryCodes.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-4" role="status">
          <p className="font-semibold">Guarda estos códigos de recuperación</p>
          <p className="text-sm">Cada código funciona una sola vez si pierdes acceso a tu aplicación. Solo se muestran ahora; guárdalos en un lugar privado.</p>
          <div className="grid gap-2 font-mono text-sm sm:grid-cols-2">{recoveryCodes.map(value => <code key={value} className="select-all break-all">{value}</code>)}</div>
          <Button type="button" onClick={() => setRecoveryCodes([])}>Ya guardé mis códigos</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="totp-password">Confirma tu contraseña actual</Label><Input id="totp-password" type="password" autoComplete="current-password" maxLength={72} required value={password} onChange={e => setPassword(e.target.value)} /></div>
          {setup && <div className="space-y-3">
            <p className="text-sm">Escanea el código QR y escribe el código de 6 dígitos para activar la protección. La configuración vence en diez minutos.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrCode} width={256} height={256} alt="Código QR para configurar la aplicación de autenticación" className="max-w-full rounded-lg" />
            <details><summary className="cursor-pointer text-sm text-primary">Introducir la clave manualmente</summary><code className="mt-2 block select-all break-all text-sm">{setup.secret}</code></details>
          </div>}
          {(setup || user?.twoFactorEnabled) && <div><Label htmlFor="totp-code">{setup ? 'Código de 6 dígitos' : 'Código de autenticación o recuperación'}</Label><Input id="totp-code" type="text" autoComplete="one-time-code" inputMode={setup ? 'numeric' : 'text'} pattern={setup ? '[0-9]{6}' : '(?:[0-9]{6}|[a-fA-F0-9]{20})'} maxLength={setup ? 6 : 20} required value={code} onChange={e => setCode(e.target.value.trim())} /></div>}
          {user?.twoFactorEnabled && <p className="text-sm text-muted-foreground">Desactivar esta protección requiere tu contraseña y un código válido. Se cerrarán tus otras sesiones.</p>}
          <div className="flex flex-wrap gap-2"><Button disabled={begin.isPending || update.isPending} type="submit" variant={user?.twoFactorEnabled ? 'destructive' : 'default'}>{begin.isPending || update.isPending ? 'Procesando…' : user?.twoFactorEnabled ? 'Desactivar 2FA' : setup ? 'Confirmar y activar 2FA' : 'Configurar 2FA'}</Button>
            {setup && <Button type="button" variant="ghost" onClick={() => { setSetup(null); setPassword(''); setCode(''); begin.reset(); update.reset(); }}>Cancelar</Button>}</div>
        </form>
      )}
      {(begin.isError || update.isError) && <p role="alert" className="text-sm text-danger">{begin.error?.message || update.error?.message}</p>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
    </section>
  );
}
