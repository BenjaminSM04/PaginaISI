'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { GuestOnly } from '@/components/guest-only';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { callbackFromLocation } from '@/lib/navigation';
import { PointReward } from '@/components/point-reward';
import { InstitutionalLogo, InstitutionalText } from '@/components/institutional-logo';

const schema = z.object({
  identifier: z.string().min(3, 'Ingresa tu email o usuario'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyTwoFactor, loading: authLoading } = useAuth();
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    if (authLoading) return;
    setServerError(null);
    try {
      const result = await login(data.identifier, data.password);
      if (result.requiresTwoFactor) { setChallengeToken(result.challengeToken); reset(); return; }
      router.replace('mustChangePassword' in result && result.mustChangePassword ? '/cambiar-contrasena' : callbackFromLocation('/cuenta'));
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault(); if (!challengeToken) return;
    setVerifying(true); setServerError(null);
    try {
      const user = await verifyTwoFactor(challengeToken, code);
      router.replace(user.mustChangePassword ? '/cambiar-contrasena' : callbackFromLocation('/cuenta'));
    } catch (error) { setServerError(error instanceof Error ? error.message : 'No se pudo verificar el código'); }
    finally { setVerifying(false); setCode(''); }
  };

  return (
    <GuestOnly>
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <InstitutionalLogo className="mx-auto mb-4" />
          <h1 className="font-serif-heading text-2xl font-bold text-primary">Bienvenido de vuelta</h1>
          <p className="mt-1 text-sm text-muted-foreground"><InstitutionalText field="careerName" /> · <InstitutionalText field="institutionName" /></p>
        </div>

        {challengeToken ? <form onSubmit={verify} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Verificación en dos pasos</h2>
          <p className="text-sm text-muted-foreground">Ingresa el código de tu aplicación o un código de recuperación. La verificación vence en cinco minutos.</p>
          <div><Label htmlFor="login-code">Código de autenticación</Label><Input id="login-code" type="text" autoComplete="one-time-code" pattern="(?:[0-9]{6}|[a-fA-F0-9]{20})" maxLength={20} required value={code} onChange={e => setCode(e.target.value.trim())} /></div>
          {serverError && <p role="alert" className="text-sm text-danger">{serverError}</p>}
          <Button disabled={verifying} className="w-full">{verifying ? 'Verificando…' : 'Verificar e ingresar'}</Button>
          <Button type="button" variant="ghost" disabled={verifying} onClick={() => { setChallengeToken(null); setCode(''); setServerError(null); }}>Volver al inicio de sesión</Button>
        </form> : <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="login-identifier">Correo o usuario</Label>
            <Input id="login-identifier" placeholder="Correo electrónico o nombre de usuario" autoComplete="username" {...register('identifier')} />
            {errors.identifier && <p className="text-xs text-danger">{errors.identifier.message}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="login-password">Contraseña</Label>
              <Link href="/olvide-contrasena" className="text-xs font-semibold text-primary hover:underline">¿La olvidaste?</Link>
            </div>
            <Input id="login-password" type="password" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
            {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
          </div>
          {serverError && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{serverError}</p>}
          <Button type="submit" disabled={isSubmitting || authLoading} className="w-full" size="lg">
            {isSubmitting || authLoading ? <Loader2 className="animate-spin" /> : <LogIn />} Iniciar sesión
          </Button>
        </form>}

        <p className="text-center text-sm text-muted-foreground">
          ¿Aún no tienes cuenta?{' '}
          <Link href="/registro" className="font-semibold text-primary hover:underline">Regístrate <PointReward reason="REGISTRO_COMPLETO" parentheses /></Link>
        </p>

      </div>
    </div>
    </GuestOnly>
  );
}
