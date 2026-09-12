'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Sparkles, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { GuestOnly } from '@/components/guest-only';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { SEMESTERS } from '@/lib/academic';
import { PointReward } from '@/components/point-reward';
import { registrationSchema as schema } from '@/lib/registration-schema';

type FormData = z.infer<typeof schema>;

export default function RegistroPage() {
  const router = useRouter();
  const { register: registerUser, loading: authLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    if (authLoading) return;
    setServerError(null);
    try {
      const result = await registerUser({
        fullName: data.fullName,
        email: data.email,
        username: data.username,
        password: data.password,
        semester: data.semester ? Number(data.semester) : undefined,
      });
      if (result.emailVerificationPreviewUrl) {
        const preview = new URL(result.emailVerificationPreviewUrl);
        if (['http:', 'https:'].includes(preview.protocol)) {
          window.location.assign(preview.toString());
          return;
        }
      }
      router.push('/cuenta?tab=seguridad&registro=1');
    } catch (e: any) {
      setServerError(e.message);
    }
  };

  return (
    <GuestOnly>
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="font-serif-heading text-2xl font-bold text-primary">Únete a Ingeniería de Sistemas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crea tu cuenta, verifica tu correo y gana <PointReward reason="REGISTRO_COMPLETO" suffix="puntos" className="text-success" /> de bienvenida.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="register-name">Nombre completo</Label>
            <Input id="register-name" autoComplete="name" placeholder="Nombres y apellidos" {...register('fullName')} />
            {errors.fullName && <p className="text-xs text-danger">{errors.fullName.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="register-username">Usuario</Label>
              <Input id="register-username" autoComplete="username" placeholder="Nombre de usuario" {...register('username')} />
              {errors.username && <p className="text-xs text-danger">{errors.username.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-semester">Semestre</Label>
              <Select id="register-semester" {...register('semester')}>
                <option value="">—</option>
                {SEMESTERS.map((semester) => (
                  <option key={semester} value={semester}>{semester}º semestre</option>
                ))}
              </Select>
              {errors.semester && <p className="text-xs text-danger">{errors.semester.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="register-email">Correo institucional</Label>
            <Input id="register-email" type="email" autoComplete="email" placeholder="nombre@univalle.edu" aria-describedby="institutional-email-help" {...register('email')} />
            <p id="institutional-email-help" className="text-xs text-muted-foreground">Solo correos @univalle.edu. Recibirás un enlace para confirmar que el correo te pertenece.</p>
            {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="register-password">Contraseña</Label>
            <Input id="register-password" type="password" placeholder="Mínimo 12 caracteres" autoComplete="new-password" {...register('password')} />
            {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="register-confirm">Confirmar contraseña</Label>
            <Input id="register-confirm" type="password" placeholder="Repite tu contraseña" autoComplete="new-password" {...register('confirm')} />
            {errors.confirm && <p className="text-xs text-danger">{errors.confirm.message}</p>}
          </div>
          {serverError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{serverError}</p>}
          <Button type="submit" disabled={isSubmitting || authLoading} className="w-full" size="lg" variant="accent">
            {isSubmitting || authLoading ? <Loader2 className="animate-spin" /> : <UserPlus />} Crear mi cuenta
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
    </GuestOnly>
  );
}
