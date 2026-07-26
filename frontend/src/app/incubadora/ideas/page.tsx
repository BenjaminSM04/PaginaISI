'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Lightbulb, Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { IdeaProposal, Paged } from '@/lib/types';
import { IdeaCard } from '@/components/cards';
import { BackButton } from '@/components/back-button';
import { IncubatorPrivateActions } from '@/components/incubator-private-actions';
import { CatalogCombobox, type CatalogOption } from '@/components/remote-selectors';
import { EmptyState } from '@/components/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function IdeasIncubadoraPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [technology, setTechnology] = useState<CatalogOption | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const query = useQuery({
    queryKey: ['ideas', 'public', debouncedSearch, technology?.name, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (technology) params.set('technology', technology.name);
      return api.get<Paged<IdeaProposal>>(`/ideas?${params.toString()}`);
    },
  });

  return (
    <div className="container space-y-7 py-10">
      <BackButton fallbackHref="/incubadora" label="Volver a incubadora" variant="ghost" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="section-kicker">Incubadora ISI</span>
          <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Ideas aprobadas</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Propuestas revisadas que pueden convertirse en proyectos, alianzas o equipos interdisciplinarios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <IncubatorPrivateActions />
          <Link href="/incubadora/postular" className={buttonVariants({ className: 'bg-purple-600 text-white hover:bg-purple-700' })}>
            <Lightbulb /> Postular idea
          </Link>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
        <div className="relative">
          <label htmlFor="ideas-search" className="sr-only">Buscar ideas</label>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="ideas-search"
            type="search"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por título, problema o solución…"
          />
        </div>
        <CatalogCombobox
          kind="TECHNOLOGY"
          value={technology}
          onChange={(next) => {
            setTechnology(next);
            setPage(1);
          }}
          ariaLabel="Filtrar por tecnología"
          placeholder="Filtrar por tecnología…"
        />
      </div>

      {query.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Cargando ideas">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-xl border border-border bg-secondary/50" />)}
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">No pudimos cargar las ideas.</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
              <Loader2 className={query.isFetching ? 'animate-spin' : ''} /> Reintentar
            </Button>
          </div>
        </div>
      ) : !query.data?.items.length ? (
        <EmptyState title="No encontramos ideas" subtitle="Prueba otra búsqueda o limpia el filtro de tecnología." />
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{query.data.total} idea(s) aprobada(s)</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.items.map((idea) => <IdeaCard key={idea.id} idea={idea} />)}
          </div>
          {(query.data.pages ?? 1) > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Paginación de ideas">
              <Button type="button" variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => current - 1)}>
                <ChevronLeft /> Anterior
              </Button>
              <span className="text-sm font-semibold">Página {page} de {query.data.pages}</span>
              <Button type="button" variant="outline" disabled={page >= (query.data.pages ?? 1) || query.isFetching} onClick={() => setPage((current) => current + 1)}>
                Siguiente <ChevronRight />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
