'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertCircle, CheckCircle2, Coins, FileText, FolderKanban, Loader2, MessageSquareText, Pencil, Rocket, Save, ShieldCheck, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/shared';
import { AccountSecurity } from '@/components/account-security';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { cn, formatDate } from '@/lib/utils';
import { isValidSemester, SEMESTERS } from '@/lib/academic';

const TABS = [
  { id: 'perfil', label: 'Mi perfil', icon: User },
  { id: 'proyectos', label: 'Mis proyectos', icon: Rocket },
  { id: 'articulos', label: 'Mis artículos', icon: FileText },
  { id: 'puntos', label: 'Historial de puntos', icon: Coins },
  { id: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

function PerfilTab() {
  const { user, refreshMe } = useAuth();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: {
      fullName: user?.profile?.fullName ?? '',
      bio: user?.profile?.bio ?? '',
      semester: user?.profile?.semester ? String(user.profile.semester) : '',
      avatarUrl: user?.profile?.avatarUrl ?? '',
      githubUrl: user?.profile?.githubUrl ?? '',
      linkedinUrl: user?.profile?.linkedinUrl ?? '',
      websiteUrl: user?.profile?.websiteUrl ?? '',
      skills: '',
    },
  });
  const { data: me } = useQuery({ queryKey: ['me-full'], queryFn: () => api.get<any>(`/users/${user!.username}`), enabled: !!user });

  const mutation = useMutation({
    mutationFn: (data: any) => api.patch('/users/me/profile', data),
    onSuccess: async () => {
      setSaved(true);
      await refreshMe();
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const onSubmit = (data: any) => {
    mutation.mutate({
      fullName: data.fullName || undefined,
      bio: data.bio || undefined,
      semester: data.semester && isValidSemester(Number(data.semester)) ? Number(data.semester) : undefined,
      avatarUrl: data.avatarUrl || undefined,
      githubUrl: data.githubUrl || undefined,
      linkedinUrl: data.linkedinUrl || undefined,
      websiteUrl: data.websiteUrl || undefined,
      skills: data.skills ? data.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nombre completo</Label>
          <Input {...register('fullName')} />
        </div>
        <div className="space-y-1.5">
          <Label>Semestre</Label>
          <Select {...register('semester')}>
            <option value="">—</option>
            {SEMESTERS.map((semester) => (
              <option key={semester} value={semester}>{semester}º semestre</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Biografía corta</Label>
        <Textarea rows={3} placeholder="Cuéntanos qué te apasiona…" {...register('bio')} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Foto (URL)</Label>
          <Input placeholder="https://…/foto.jpg" {...register('avatarUrl')} />
        </div>
        <div className="space-y-1.5">
          <Label>GitHub</Label>
          <Input placeholder="https://github.com/usuario" {...register('githubUrl')} />
        </div>
        <div className="space-y-1.5">
          <Label>LinkedIn</Label>
          <Input placeholder="https://linkedin.com/in/usuario" {...register('linkedinUrl')} />
        </div>
        <div className="space-y-1.5">
          <Label>Sitio web</Label>
          <Input placeholder="https://miportafolio.dev" {...register('websiteUrl')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Habilidades técnicas (separadas por coma — reemplaza tu lista actual)</Label>
        <Input placeholder={me?.skills?.map((s: any) => s.skill.name).join(', ') || 'React, PostgreSQL, Docker'} {...register('skills')} />
        {me?.skills?.length > 0 && (
          <p className="text-xs text-muted-foreground">Actuales: {me.skills.map((s: any) => s.skill.name).join(', ')}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
        </Button>
        {saved && <span className="flex items-center gap-1 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Guardado</span>}
      </div>
    </form>
  );
}

function ListaContenido({ kind }: { kind: 'proyectos' | 'articulos' }) {
  const path = kind === 'proyectos' ? '/projects/mine' : '/articles/mine';
  const { data, isLoading } = useQuery({ queryKey: ['mine', kind], queryFn: () => api.get<any[]>(path) });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        {kind === 'proyectos' && (
          <Link href="/proyectos/gestionar" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            <FolderKanban /> Gestionar colaboraciones
          </Link>
        )}
        <Link href={kind === 'proyectos' ? '/proyectos/nuevo' : '/articulos/nuevo'} className={buttonVariants({ size: 'sm', variant: 'accent' })}>
          {kind === 'proyectos' ? 'Publicar proyecto' : 'Enviar artículo'}
        </Link>
      </div>
      {(data ?? []).map((item) => {
        const latestDecision = item.approvals?.find((approval: any) => approval.decision);
        const needsCorrection = ['OBSERVED', 'REJECTED'].includes(item.status);
        const resource = kind === 'proyectos' ? 'proyectos' : 'articulos';
        return (
          <article key={item.id} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {item.status === 'APPROVED' ? (
                  <Link href={`/${resource}/${item.slug}`} className="font-bold hover:text-primary">{item.title}</Link>
                ) : (
                  <h3 className="font-bold">{item.title}</h3>
                )}
                <div className="mt-0.5 text-xs text-muted-foreground">Enviado: {formatDate(item.createdAt)}</div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={item.status} />
                {item.status === 'APPROVED' && <span className="text-xs font-semibold text-success">+{kind === 'proyectos' ? 40 : 35} pts</span>}
              </div>
            </div>

            {latestDecision?.comment && (
              <div className={cn(
                'flex gap-2 rounded-lg border p-3 text-sm',
                needsCorrection
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-border bg-secondary/40 text-muted-foreground',
              )}>
                {needsCorrection ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />}
                <div>
                  <p className="font-semibold">Comentario de revisión</p>
                  <p className="mt-0.5 whitespace-pre-line">{latestDecision.comment}</p>
                  {latestDecision.reviewer?.profile?.fullName && (
                    <p className="mt-1 text-xs opacity-75">— {latestDecision.reviewer.profile.fullName}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {item.status === 'APPROVED' && (
                <Link href={`/${resource}/${item.slug}`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>Ver publicación</Link>
              )}
              <Link href={`/${resource}/editar/${item.id}`} className={buttonVariants({ size: 'sm', variant: needsCorrection ? 'accent' : 'outline' })}>
                <Pencil /> {needsCorrection ? 'Corregir y reenviar' : 'Editar'}
              </Link>
            </div>
          </article>
        );
      })}
      {(data?.length ?? 0) === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aún no tienes {kind}. ¡Publica el primero y gana puntos!
        </p>
      )}
    </div>
  );
}

const REASON_LABELS: Record<string, string> = {
  REGISTRO_COMPLETO: 'Registro completo',
  UNIRSE_COMUNIDAD: 'Te uniste a una comunidad',
  INSCRIPCION_EVENTO: 'Inscripción a evento',
  PREGUNTA_PUBLICADA: 'Pregunta publicada',
  RESPUESTA_PUBLICADA: 'Respuesta publicada',
  RESPUESTA_ACEPTADA: 'Respuesta aceptada',
  PROYECTO_APROBADO: 'Proyecto aprobado',
  ARTICULO_APROBADO: 'Artículo aprobado',
  LIKE_RECIBIDO: 'Like recibido',
  REPORTE_VALIDO: 'Reporte válido',
  PENALIZACION_SPAM: 'Penalización por spam',
  AJUSTE_ADMIN: 'Ajuste administrativo',
};

function PuntosTab() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['my-activity'], queryFn: () => api.get<any>('/users/me/activity') });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: user?.profile?.totalPoints ?? 0, cls: 'text-gold border-gold/40 bg-gold/10' },
          { label: 'Dev', value: user?.profile?.devPoints ?? 0, cls: 'text-accent border-accent/40 bg-accent/10' },
          { label: 'Research', value: user?.profile?.researchPoints ?? 0, cls: 'text-purple-500 border-purple-500/40 bg-purple-500/10' },
          { label: 'Community', value: user?.profile?.communityPoints ?? 0, cls: 'text-success border-success/40 bg-success/10' },
        ].map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-4 text-center', c.cls)}>
            <div className="font-serif-heading text-2xl font-bold">{c.value}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {(data?.transactions ?? []).map((t: any, i: number) => (
            <div key={t.id} className={cn('flex items-center justify-between px-4 py-3 text-sm', i % 2 === 0 ? 'bg-card' : 'bg-secondary/40')}>
              <div>
                <div className="font-semibold">{REASON_LABELS[t.reason] ?? t.reason}</div>
                <div className="text-xs text-muted-foreground">{formatDate(t.createdAt, true)} · {t.category}</div>
              </div>
              <span className={cn('font-bold tabular-nums', t.points >= 0 ? 'text-success' : 'text-danger')}>
                {t.points >= 0 ? '+' : ''}{t.points}
              </span>
            </div>
          ))}
          {(data?.transactions?.length ?? 0) === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Todavía no tienes transacciones de puntos.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CuentaContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const requested: TabId = isTabId(requestedTab) ? requestedTab : 'perfil';
  const verified = !!user?.emailVerifiedAt;
  const tab: TabId = !verified && ['proyectos', 'articulos', 'puntos'].includes(requested) ? 'seguridad' : requested;
  const sent = searchParams.get('enviado') === '1';
  const updated = searchParams.get('actualizado') === '1';
  const justRegistered = searchParams.get('registro') === '1';

  return (
    <div className="container max-w-4xl space-y-8 py-10">
      <div>
        <span className="section-kicker">Tu espacio</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Mi cuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          @{user?.username} · <Link className="text-primary hover:underline" href={`/perfil/${user?.username}`}>ver mi perfil público</Link>
        </p>
      </div>

      {!verified && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-800 dark:text-sky-200">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>{justRegistered ? 'Tu cuenta fue creada. ' : ''}Verifica tu correo para continuar.</strong>{' '}
              Mientras tanto puedes completar tu perfil y administrar la seguridad de la cuenta.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => router.replace('/cuenta?tab=seguridad')}>Verificar ahora</Button>
        </div>
      )}

      {sent && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" />
          {tab === 'articulos'
            ? 'Artículo enviado correctamente. Ahora está pendiente de revisión docente.'
            : 'Proyecto enviado correctamente. Ahora está pendiente de revisión docente.'}
        </p>
      )}

      {updated && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" />
          Cambios guardados correctamente. Si el contenido requería correcciones, ya fue reenviado a revisión docente.
        </p>
      )}

      <div role="tablist" aria-label="Secciones de mi cuenta" className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-secondary/60 p-1">
        {TABS.map((t) => (
          (() => {
            const locked = !verified && ['proyectos', 'articulos', 'puntos'].includes(t.id);
            return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-disabled={locked}
            title={locked ? 'Verifica tu correo para acceder' : undefined}
            onClick={() => router.replace(locked ? '/cuenta?tab=seguridad' : `/cuenta?tab=${t.id}`)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition',
              tab === t.id ? 'border border-border bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              locked && 'opacity-50',
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
            );
          })()
        ))}
      </div>

      {tab === 'perfil' && <PerfilTab />}
      {tab === 'proyectos' && <ListaContenido kind="proyectos" />}
      {tab === 'articulos' && <ListaContenido kind="articulos" />}
      {tab === 'puntos' && <PuntosTab />}
      {tab === 'seguridad' && <AccountSecurity />}
    </div>
  );
}

export default function CuentaPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <CuentaContent />
      </Suspense>
    </RequireAuth>
  );
}
