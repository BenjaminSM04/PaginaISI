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
  const { login, loading: authLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    if (authLoading) return;
    setServerError(null);
    try {
      await login(data.identifier, data.password);
      router.replace(callbackFromLocation('/cuenta'));
    } catch (e: any) {
      setServerError(e.message);
    }
  };

  return (
    <GuestOnly>
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1 shadow-md">
            <InstitutionalLogo className="h-full w-full" />
          </div>
          <h1 className="font-serif-heading text-2xl font-bold text-primary">Bienvenido de vuelta</h1>
          <p className="mt-1 text-sm text-muted-foreground"><InstitutionalText field="careerName" /> · <InstitutionalText field="institutionName" /></p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label>Email o usuario</Label>
            <Input placeholder="avargas@est.isi.edu.bo" autoComplete="username" {...register('identifier')} />
            {errors.identifier && <p className="text-xs text-red-500">{errors.identifier.message}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label>Contraseña</Label>
              <Link href="/olvide-contrasena" className="text-xs font-semibold text-primary hover:underline">¿La olvidaste?</Link>
            </div>
            <Input type="password" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>
          {serverError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{serverError}</p>}
          <Button type="submit" disabled={isSubmitting || authLoading} className="w-full" size="lg">
            {isSubmitting || authLoading ? <Loader2 className="animate-spin" /> : <LogIn />} Iniciar sesión
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          ¿Aún no tienes cuenta?{' '}
          <Link href="/registro" className="font-semibold text-primary hover:underline">Regístrate <PointReward reason="REGISTRO_COMPLETO" parentheses /></Link>
        </p>
        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
          <p className="font-semibold">Cuentas demo (seed):</p>
          <p className="mt-1 font-mono">admin@isi.edu.bo · rmendoza@isi.edu.bo · avargas@est.isi.edu.bo</p>
          <p className="font-mono">contraseña: password123</p>
        </div>
      </div>
    </div>
    </GuestOnly>
  );
}
