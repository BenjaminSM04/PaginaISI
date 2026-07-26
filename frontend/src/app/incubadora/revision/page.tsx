'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Eye, Loader2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { IdeaProposal, Paged } from '@/lib/types';
import { BackButton } from '@/components/back-button';
import { IdeaReviewActions } from '@/components/idea-review-actions';
import { RequireAuth } from '@/components/require-auth';
import { EmptyState } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

function RevisionIdeasContent() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['ideas', 'review', 'pending'],
    queryFn: () => api.get<Paged<IdeaProposal>>('/ideas/review/pending?limit=30'),
  });
  const selected = query.data?.items.find((idea) => idea.id === selectedId) ?? null;

  return (
    <div className="container space-y-7 py-10">
      <BackButton fallbackHref="/incubadora" label="Volver a incubadora" variant="ghost" />
      <div>
        <span className="section-kicker">Revisión académica</span>
        <h1 className="mt-1 flex items-center gap-2 font-serif-heading text-3xl font-bold text-primary"><ClipboardCheck className="h-8 w-8 text-purple-500" /> Ideas pendientes</h1>
        <p className="mt-2 text-sm text-muted-foreground">Revisa el problema, la solución, el equipo y los respaldos antes de emitir una decisión.</p>
      </div>
      {query.isLoading ? (
        <div className="flex justify-center py-16" role="status"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /><span className="sr-only">Cargando ideas pendientes</span></div>
      ) : query.isError ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{query.error.message}</p>
      ) : !query.data?.items.length ? (
        <EmptyState title="No hay ideas pendientes" subtitle="La bandeja de revisión está al día." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-3">
            {query.data.items.map((idea) => (
              <article key={idea.id} className={`rounded-xl border bg-card p-4 transition ${selectedId === idea.id ? 'border-purple-500 ring-2 ring-purple-500/15' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif-heading text-lg font-bold text-primary">{idea.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{idea.owner?.profile?.fullName ?? `@${idea.owner?.username}`} · {formatDate(idea.createdAt)}</p>
                  </div>
                  {idea.isRealClient && <Badge variant="accent">Cliente real</Badge>}
                </div>
                <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{idea.description}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-4 w-4" /> {(idea.members?.length ?? 0) + 1} integrante(s)</span>
                  <Button type="button" size="sm" variant={selectedId === idea.id ? 'default' : 'outline'} onClick={() => setSelectedId(idea.id)}>
                    <Eye /> Revisar
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <div className="lg:sticky lg:top-24 lg:self-start">
            {selected ? (
              <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div>
                  <div className="flex flex-wrap gap-1.5">{selected.technologies.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div>
                  <h2 className="mt-3 font-serif-heading text-2xl font-bold text-primary">{selected.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p>
                </div>
                <section>
                  <h3 className="font-bold">Problema</h3>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{selected.problem}</p>
                </section>
                <section>
                  <h3 className="font-bold">Solución propuesta</h3>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{selected.proposedSolution}</p>
                </section>
                <Link href={`/incubadora/ideas/${selected.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}><Eye /> Abrir detalle y respaldos</Link>
                <IdeaReviewActions
                  idea={selected}
                  onReviewed={async () => {
                    setSelectedId(null);
                    await queryClient.invalidateQueries({ queryKey: ['ideas'] });
                  }}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Selecciona una idea para revisar su contenido.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RevisionIdeasPage() {
  return <RequireAuth roles={['TEACHER', 'ADMIN']}><RevisionIdeasContent /></RequireAuth>;
}
