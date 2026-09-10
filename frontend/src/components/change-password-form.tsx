'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, setAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Me } from '@/lib/types';
import { Button } from './ui/button';
import { Input, Label } from './ui/input';

export function ChangePasswordForm({ mandatory = false }: { mandatory?: boolean }) {
  const { acceptSession } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await api.post<{ accessToken: string }>('/auth/password/change', { currentPassword, newPassword });
      setAccessToken(result.accessToken);
      const user = await api.get<Me>('/auth/me');
      acceptSession({ ...result, user });
    },
    onSuccess: () => {
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
      if (mandatory) router.replace('/cuenta?tab=seguridad');
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (newPassword !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (new TextEncoder().encode(newPassword).length > 72) { setError('La contraseña no puede superar 72 bytes UTF-8.'); return; }
    mutation.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">Usa al menos 12 caracteres. Una frase larga y única es una buena opción. Se cerrarán tus otras sesiones.</p>
      <div><Label htmlFor="current-password">Contraseña actual</Label><Input id="current-password" type="password" autoComplete="current-password" maxLength={72} required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></div>
      <div><Label htmlFor="new-password">Nueva contraseña</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
      <div><Label htmlFor="confirm-password">Confirmar nueva contraseña</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
      {(error || mutation.isError) && <p role="alert" className="text-sm text-danger">{error || mutation.error?.message}</p>}
      {mutation.isSuccess && <p role="status" className="text-sm text-success">Contraseña actualizada.</p>}
      <Button disabled={mutation.isPending} type="submit">{mutation.isPending ? 'Actualizando…' : 'Actualizar contraseña'}</Button>
    </form>
  );
}
