'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Eye, GraduationCap, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { Mentorship } from '@/lib/types';
import { cn, DIFFICULTY_LABELS, formatDate } from '@/lib/utils';
import { RequireAuth } from '@/components/require-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/back-button';

function GestionMentoriasContent() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['mentorships', 'management'],
    queryFn: () => api.get<{ items: Mentorship[]; total: number; pages: number }>('/mentorships/management?limit=50'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/mentorships/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mentorships'] });
    },
  });

  const manageable = data?.items ?? [];

  const deactivate = (mentorship: Mentorship) => {
    if (!window.confirm(`¿Desactivar la mentoría “${mentorship.title}”? Dejará de mostrarse y recibir inscripciones.`)) return;
    remove.mutate(mentorship.id);
  };

  return (
    <div className="container space-y-8 py-10">
      <BackButton fallbackHref="/mentorias" label="Volver a mentorías" variant="ghost" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="section-kicker">Panel de formación</span>
          <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Gestionar mentorías</h1>
          <p className="mt-2 text-sm text-muted-foreground">Edita las mentorías asignadas a ti o a las comunidades que administras.</p>
        </div>
        <Link href="/mentorias/nueva" className={cn(buttonVariants({ variant: 'accent' }))}>
          <Plus /> Nueva mentoría
        </Link>
      </div>

      {(error || remove.error) && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          {(remove.error as Error | null)?.message ?? (error as Error | null)?.message ?? 'No se pudieron cargar las mentorías.'}
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : manageable.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <GraduationCap className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">No tienes mentorías para gestionar</p>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Crea una nueva mentoría o solicita que te asignen como mentor o líder de la comunidad organizadora.
          </p>
          <Link href="/mentorias/nueva" className={cn('mt-5', buttonVariants({ variant: 'accent' }))}>Crear mentoría</Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {manageable.map((mentorship) => (
            <article key={mentorship.id} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant="accent">{mentorship.area}</Badge>
                    <Badge variant="secondary">{DIFFICULTY_LABELS[mentorship.difficulty] ?? mentorship.difficulty}</Badge>
                    <Badge variant="outline">{mentorship.status === 'IN_PROGRESS' ? 'En curso' : mentorship.status === 'COMPLETED' ? 'Finalizada' : mentorship.status === 'INACTIVE' ? 'Inactiva' : 'Próxima'}</Badge>
                    {mentorship.community && <Badge variant="outline">{mentorship.community.name}</Badge>}
                  </div>
                  <h2 className="font-serif-heading text-xl font-bold text-primary">{mentorship.title}</h2>
                </div>
              </div>

              <p className="line-clamp-2 text-sm text-muted-foreground">{mentorship.description}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4 text-accent" />
                  {mentorship.mentors?.map((entry) => entry.user.profile?.fullName ?? entry.user.username).join(', ')
                    || mentorship.mentor?.profile?.fullName
                    || 'Sin docente asignado'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-accent" />
                  {mentorship._count?.enrollments ?? 0}{mentorship.capacity ? ` / ${mentorship.capacity}` : ''} inscritos
                </span>
                {mentorship.startsAt && (
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-accent" />{formatDate(mentorship.startsAt)}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {mentorship.status !== 'INACTIVE' && (
                  <Link href={`/mentorias/${mentorship.slug}`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
                    <Eye /> Ver
                  </Link>
                )}
                <Link href={`/mentorias/gestionar/${mentorship.id}`} className={cn(buttonVariants({ size: 'sm' }))}>
                  <Pencil /> Editar
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-red-500 hover:bg-red-500/10"
                  disabled={remove.isPending || mentorship.status === 'INACTIVE'}
                  onClick={() => deactivate(mentorship)}
                >
                  {remove.isPending && remove.variables === mentorship.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {mentorship.status === 'INACTIVE' ? 'Inactiva' : 'Desactivar'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GestionMentoriasPage() {
  return (
    <RequireAuth roles={['ADMIN', 'TEACHER', 'COMMUNITY_LEADER']}>
      <GestionMentoriasContent />
    </RequireAuth>
  );
}
