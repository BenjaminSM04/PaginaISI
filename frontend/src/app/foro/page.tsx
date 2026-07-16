'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, MessageSquarePlus, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { Paged, Question } from '@/lib/types';
import { QuestionCard } from '@/components/cards';
import { EmptyState, SectionHeader } from '@/components/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ForumTagInput, MAX_FORUM_TAGS } from '@/components/forum-inputs';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';

const SORTS = [
  { id: 'recent' as const, label: 'Recientes', panelId: 'forum-questions-panel' },
  { id: 'votes' as const, label: 'Más votadas', panelId: 'forum-questions-panel' },
  { id: 'unanswered' as const, label: 'Sin responder', panelId: 'forum-questions-panel' },
  { id: 'solved' as const, label: 'Resueltas', panelId: 'forum-questions-panel' },
];

type ForumMode = (typeof SORTS)[number]['id'];

export default function ForoPage() {
  const [mode, setMode] = useState<ForumMode>('recent');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const sort = mode === 'votes' ? 'votes' : 'recent';
  const filter = mode === 'unanswered' || mode === 'solved' ? mode : '';

  const questionsQuery = useQuery({
    queryKey: ['forum', mode, selectedTags.join(','), submitted],
    queryFn: () => {
      const qs = new URLSearchParams({ sort, limit: '30' });
      if (filter) qs.set('filter', filter);
      if (selectedTags.length) qs.set('tags', selectedTags.join(','));
      if (submitted) qs.set('search', submitted);
      return api.get<Paged<Question>>(`/forum/questions?${qs.toString()}`);
    },
    retry: false,
  });
  const { data, isLoading, isError } = questionsQuery;
  const { data: tags } = useQuery({
    queryKey: ['forum-tags'],
    queryFn: () => api.get<{ tag: string; count: number }[]>('/forum/tags'),
  });

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader kicker="Comunidad que se ayuda" title="Foro de preguntas y respuestas" />
        <Link href="/foro/preguntar" className={buttonVariants({ variant: 'accent' })}><MessageSquarePlus /> Hacer una pregunta</Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-3">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedTabs
              items={SORTS}
              value={mode}
              onValueChange={setMode}
              ariaLabel="Orden y estado de las preguntas"
              idPrefix="forum-sort"
              className="w-full xl:w-auto"
              tabClassName="px-3.5 py-2 text-xs"
            />
            <form
              className="w-full sm:w-auto"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(search.trim());
              }}
            >
              <label htmlFor="forum-search" className="sr-only">Buscar preguntas en el foro</label>
              <input
                id="forum-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar preguntas…"
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-56"
              />
            </form>
            {selectedTags.length > 0 && (
              <button type="button" aria-label="Quitar todos los filtros por tag" onClick={() => setSelectedTags([])} className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Limpiar {selectedTags.length} tag{selectedTags.length === 1 ? '' : 's'} ✕
              </button>
            )}
          </div>

          <section
            id="forum-questions-panel"
            role="tabpanel"
            aria-labelledby={`forum-sort-tab-${mode}`}
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            {isLoading ? (
              <div role="status" className="flex justify-center py-16"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">Cargando preguntas</span></div>
            ) : isError ? (
              <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
                <div className="flex items-start gap-3">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">No pudimos cargar las preguntas.</p>
                    <p className="mt-1">Comprueba la conexión con el servidor y vuelve a intentarlo.</p>
                    <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void questionsQuery.refetch()}><RefreshCw aria-hidden="true" /> Reintentar</Button>
                  </div>
                </div>
              </div>
            ) : (data?.items.length ?? 0) === 0 ? (
              <EmptyState title="No hay preguntas aquí todavía" subtitle="Sé quien rompa el hielo: pregunta y gana +5 puntos." />
            ) : (
              <div className="space-y-3">
                {data!.items.map((q) => <QuestionCard key={q.id} question={q} />)}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Filtrar por tags</h3>
            <ForumTagInput
              value={selectedTags}
              onChange={setSelectedTags}
              suggestions={(tags ?? []).map((item) => item.tag)}
            />
            {selectedTags.length > 1 && <p className="mt-2 text-xs text-muted-foreground">Se muestran preguntas que contienen todos los tags elegidos.</p>}
            <h4 className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Populares</h4>
            <div className="flex flex-wrap gap-1.5">
              {(tags ?? []).map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  aria-pressed={selectedTags.includes(t.tag)}
                  aria-label={`${selectedTags.includes(t.tag) ? 'Quitar' : 'Filtrar por'} tag ${t.tag}, ${t.count} preguntas`}
                  onClick={() => {
                    if (selectedTags.includes(t.tag)) setSelectedTags(selectedTags.filter((tag) => tag !== t.tag));
                    else if (selectedTags.length < MAX_FORUM_TAGS) setSelectedTags([...selectedTags, t.tag]);
                  }}
                  className={cn(
                    'rounded-md border px-2 py-1 font-mono text-[11px] font-semibold transition',
                    selectedTags.includes(t.tag) ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  #{t.tag} <span className="opacity-60">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 text-sm shadow-sm">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Cómo ganar puntos</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex justify-between"><span>Publicar pregunta válida</span><strong className="text-emerald-500">+5</strong></li>
              <li className="flex justify-between"><span>Responder una pregunta</span><strong className="text-emerald-500">+10</strong></li>
              <li className="flex justify-between"><span>Respuesta aceptada</span><strong className="text-emerald-500">+30</strong></li>
              <li className="flex justify-between"><span>Reporte válido</span><strong className="text-emerald-500">+5</strong></li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
