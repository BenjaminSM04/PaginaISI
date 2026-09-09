'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { IdeaProposal, Paged } from '@/lib/types';
import { BackButton } from '@/components/back-button';
import { RequireAuth } from '@/components/require-auth';
import { EmptyState, StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

function MisIdeasContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['ideas', 'mine', page],
    queryFn: () => api.get<Paged<IdeaProposal>>(`/ideas/mine?page=${page}&limit=12`),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/ideas/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });
  const remove = (idea: IdeaProposal) => {
    if (!window.confirm(`¿Retirar la postulación “${idea.title}”? Esta acción la archivará.`)) return;
    archive.mutate(idea.id);
  };

  return (
    <div className="container space-y-7 py-10">
      <BackButton fallbackHref="/incubadora" label="Volver a incubadora" variant="ghost" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="section-kicker">Seguimiento</span>
          <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Mis ideas</h1>
          <p className="mt-2 text-sm text-muted-foreground">Consulta el estado de tus postulaciones y aquellas donde eres integrante.</p>
        </div>
        <Link href="/incubadora/postular" className={buttonVariants({ className: 'bg-purple-600 text-white hover:bg-purple-700' })}>
          <Plus /> Postular idea
        </Link>
      </div>

      {(query.error || archive.error) && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {(archive.error as Error | null)?.message ?? (query.error as Error | null)?.message}
        </p>
      )}
      {query.isLoading ? (
        <div className="flex justify-center py-16" role="status"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /><span className="sr-only">Cargando postulaciones</span></div>
      ) : !query.data?.items.length ? (
        <EmptyState title="Todavía no tienes postulaciones" subtitle="Registra una idea para iniciar la revisión docente." />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {query.data.items.map((idea) => {
              const isOwner = idea.owner?.id === user?.id;
              const editable = isOwner && idea.status !== 'APPROVED';
              const removable = isOwner && idea.status !== 'APPROVED';
              return (
                <article key={idea.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={idea.status} />
                        {!isOwner && <Badge variant="outline"><Users /> Integrante</Badge>}
                        {idea.isRealClient && <Badge variant="accent">Cliente real</Badge>}
                      </div>
                      <h2 className="mt-3 font-serif-heading text-xl font-bold text-primary">{idea.title}</h2>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(idea.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3">{idea.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {idea.technologies.slice(0, 5).map((technology) => <Badge key={technology} variant="secondary">{technology}</Badge>)}
                  </div>
                  {idea.reviewComment && (
                    <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-xs">
                      <span className="font-bold text-orange-700 dark:text-orange-300">Revisión:</span>{' '}
                      <span className="text-muted-foreground">{idea.reviewComment}</span>
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
                    <Link href={`/incubadora/ideas/${idea.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}><Eye /> Ver detalle</Link>
                    {editable && (
                      <Link href={`/incubadora/ideas/${idea.id}/editar`} className={buttonVariants({ size: 'sm' })}>
                        <Pencil /> {['OBSERVED', 'REJECTED'].includes(idea.status) ? 'Corregir y reenviar' : 'Editar'}
                      </Link>
                    )}
                    {removable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-danger hover:bg-danger/10"
                        disabled={archive.isPending}
                        onClick={() => remove(idea)}
                      >
                        {archive.isPending && archive.variables === idea.id ? <Loader2 className="animate-spin" /> : <Trash2 />} Retirar
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {(query.data.pages ?? 1) > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Paginación de mis ideas">
              <Button type="button" variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft /> Anterior</Button>
              <span className="text-sm font-semibold">Página {page} de {query.data.pages}</span>
              <Button type="button" variant="outline" disabled={page >= (query.data.pages ?? 1) || query.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente <ChevronRight /></Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export default function MisIdeasPage() {
  return <RequireAuth><MisIdeasContent /></RequireAuth>;
}
