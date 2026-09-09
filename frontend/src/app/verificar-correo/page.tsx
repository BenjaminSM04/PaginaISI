'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

type State = { status: 'idle' | 'loading' | 'success' | 'error'; message: string };

function VerifyEmailContent() {
  const [token, setToken] = useState<string | null>(null);
  const { user, refreshMe } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading', message: 'Preparando el enlace…' });

  useEffect(() => {
    let active = true;
    const queryToken = new URLSearchParams(window.location.search).get('token');
    const fragmentToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    const captured = fragmentToken ?? queryToken ?? '';
    queueMicrotask(() => {
      if (!active) return;
      setToken(captured);
      setState(captured
        ? { status: 'idle', message: 'Confirma la acción para verificar tu dirección de correo.' }
        : { status: 'error', message: 'El enlace no contiene un token válido.' });
      window.history.replaceState(window.history.state, '', window.location.pathname);
    });
    return () => { active = false; };
  }, []);

  const verify = async () => {
    if (!token || state.status === 'loading') return;
    setState({ status: 'loading', message: 'Verificando el enlace…' });
    try {
      const result = await api.post<{ message: string }>('/auth/email/verify', { token });
      setState({ status: 'success', message: result.message });
      await refreshMe();
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'No se pudo verificar el correo.',
      });
    }
  };

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {state.status === 'idle' && <MailCheck className="mx-auto h-10 w-10 text-primary" />}
        {state.status === 'loading' && <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />}
        {state.status === 'success' && <CheckCircle2 className="mx-auto h-10 w-10 text-success" />}
        {state.status === 'error' && <XCircle className="mx-auto h-10 w-10 text-danger" />}
        <h1 className="mt-4 font-serif-heading text-2xl font-bold text-primary">
          {state.status === 'idle' ? 'Verificar correo' : state.status === 'loading' ? 'Verificando correo' : state.status === 'success' ? 'Correo verificado' : 'No pudimos verificarlo'}
        </h1>
        <p role="status" className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        {state.status === 'idle' && (
          <div className="mt-6"><Button className="w-full" onClick={verify}><MailCheck /> Verificar mi correo</Button></div>
        )}
        {(state.status === 'success' || state.status === 'error') && (
          <div className="mt-6">
            <Link href={user ? '/cuenta?tab=seguridad' : '/login'}>
              <Button className="w-full">{user ? <MailCheck /> : null}{user ? 'Volver a seguridad' : 'Iniciar sesión'}</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerificarCorreoPage() {
  return <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><VerifyEmailContent /></Suspense>;
}
