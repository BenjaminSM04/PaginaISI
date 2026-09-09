'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Grid3X3, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { visibleApplicationsQueryKey } from '@/lib/application-query';
import type { InstitutionalApplication } from '@/lib/types';
import { ApplicationIcon } from '@/components/application-icon';
import { ApplicationLink, isInternalApplicationUrl } from '@/components/application-link';
import { Button } from '@/components/ui/button';

export default function AplicacionesPage() {
  const { user } = useAuth();
  const applicationsQuery = useQuery({
    queryKey: visibleApplicationsQueryKey(user?.roles),
    queryFn: () => api.get<InstitutionalApplication[]>('/applications'),
    retry: false,
    staleTime: 60_000,
  });

  const groups = useMemo(() => {
    const byCategory = new Map<string, InstitutionalApplication[]>();
    for (const application of applicationsQuery.data ?? []) {
      const items = byCategory.get(application.category) ?? [];
      items.push(application);
      byCategory.set(application.category, items);
    }
    return [...byCategory.entries()];
  }, [applicationsQuery.data]);

  return (
    <div className="container space-y-10 py-10">
      <header className="mx-auto max-w-2xl text-center">
        <span className="section-kicker">Servicios y recursos</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary sm:text-4xl">
          Aplicaciones institucionales
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Accede a los sistemas y enlaces habilitados para tu perfil. La disponibilidad se actualiza desde la
          configuración institucional del portal.
        </p>
      </header>

      {applicationsQuery.isLoading && (
        <div role="status" aria-label="Cargando aplicaciones" className="space-y-8">
          {[0, 1].map((group) => (
            <section key={group} className="space-y-4">
              <div className="h-6 w-40 animate-pulse rounded bg-secondary" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((card) => (
                  <div key={card} className="h-36 animate-pulse rounded-2xl border border-border bg-secondary/60" />
                ))}
              </div>
            </section>
          ))}
          <span className="sr-only">Cargando aplicaciones institucionales…</span>
        </div>
      )}

      {applicationsQuery.isError && (
        <div role="alert" className="mx-auto max-w-2xl rounded-xl border border-danger/30 bg-danger/10 p-5 text-sm text-danger">
          <p className="font-bold">No pudimos cargar las aplicaciones.</p>
          <p className="mt-1">Comprueba la conexión y vuelve a intentarlo.</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void applicationsQuery.refetch()}>
            <RefreshCw /> Reintentar
          </Button>
        </div>
      )}

      {applicationsQuery.isSuccess && groups.length === 0 && (
        <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-border bg-card py-14 text-center">
          <Grid3X3 className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-bold">No hay aplicaciones disponibles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No existen enlaces activos visibles para tu perfil en este momento.
          </p>
        </div>
      )}

      {groups.map(([category, applications], index) => (
        <section key={category} aria-labelledby={`application-category-${index}`} className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 id={`application-category-${index}`} className="font-serif-heading text-xl font-bold text-primary">
              {category}
            </h2>
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {applications.length}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {applications.map((application) => (
              <ApplicationLink
                key={application.id}
                url={application.url}
                openInNewTab={application.openInNewTab}
                title={`Abrir ${application.name}${application.openInNewTab ? ' en una pestaña nueva' : ''}`}
                className="group flex min-h-36 items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <ApplicationIcon icon={application.icon} label={application.name} className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-bold transition group-hover:text-primary">{application.name}</span>
                    {(!isInternalApplicationUrl(application.url) || application.openInNewTab) && (
                      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
                    {application.description}
                  </span>
                  <span className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-accent">
                    {application.openInNewTab ? 'Abre en una pestaña nueva' : 'Abrir aplicación'}
                  </span>
                </span>
              </ApplicationLink>
            ))}
          </div>
        </section>
      ))}

      {applicationsQuery.isFetching && !applicationsQuery.isLoading && (
        <p role="status" className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Actualizando aplicaciones…
        </p>
      )}
    </div>
  );
}
