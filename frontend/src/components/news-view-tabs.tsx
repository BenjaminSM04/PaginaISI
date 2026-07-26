'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, ChevronDown, ChevronUp, Clock3, Loader2, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import type { News } from '@/lib/types';
import { NEWS_CATEGORIES, cn, formatDate } from '@/lib/utils';
import { EmptyState } from '@/components/shared';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { Badge } from '@/components/ui/badge';

type NewsSort = 'recent' | 'top';

const NEWS_TABS = [
  { id: 'recent' as const, label: '10 más recientes', icon: Clock3, panelId: 'news-content-panel' },
  { id: 'top' as const, label: 'Más valoradas', icon: TrendingUp, panelId: 'news-content-panel' },
];

function NewsInlineContent({ item, expanded }: { item: News; expanded: boolean }) {
  const details = useQuery({
    queryKey: ['news', 'detail', item.slug],
    queryFn: () => api.get<News>(`/news/${item.slug}`),
    enabled: expanded && !item.content,
    initialData: item.content ? item : undefined,
    staleTime: 60_000,
    retry: false,
  });

  if (!expanded) return null;
  if (details.isLoading) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando contenido…
      </p>
    );
  }
  if (details.isError) {
    return (
      <p role="alert" className="text-sm text-red-500">
        No se pudo cargar el contenido. Usa el enlace permanente o vuelve a intentarlo.
      </p>
    );
  }
  const content = details.data?.content ?? item.content ?? '';
  return (
    <>
      {content.split('\n').filter(Boolean).map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex}>{paragraph}</p>
      ))}
    </>
  );
}

export function NewsViewTabs({
  initialSort,
  category,
  recent,
  top,
}: {
  initialSort: NewsSort;
  category?: string;
  recent: News[];
  top: News[];
}) {
  const [sort, setSort] = useState<NewsSort>(initialSort);
  const initialItems = initialSort === 'top' ? top : recent;
  const [expandedId, setExpandedId] = useState<string | null>(initialItems[0]?.id ?? null);

  useEffect(() => {
    const syncFromHistory = () => {
      const value = new URLSearchParams(window.location.search).get('orden');
      const next = value === 'top' ? 'top' : 'recent';
      setSort(next);
      setExpandedId((next === 'top' ? top : recent)[0]?.id ?? null);
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, [recent, top]);

  function changeSort(next: NewsSort) {
    setSort(next);
    setExpandedId((next === 'top' ? top : recent)[0]?.id ?? null);
    const url = new URL(window.location.href);
    if (next === 'top') url.searchParams.set('orden', 'top');
    else url.searchParams.delete('orden');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  const selectedItems = sort === 'top' ? top : recent;

  return (
    <div className="space-y-8">
      <SegmentedTabs
        items={NEWS_TABS}
        value={sort}
        onValueChange={changeSort}
        ariaLabel="Orden de noticias"
        idPrefix="news-view"
      />

      <div className="flex flex-wrap gap-2" aria-label="Categorías de noticias">
        <Link
          href={sort === 'top' ? '/noticias?orden=top' : '/noticias'}
          className={cn(
            'rounded-full border px-4 py-1.5 text-xs font-semibold transition',
            !category ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary',
          )}
        >
          Todas
        </Link>
        {Object.entries(NEWS_CATEGORIES).map(([key, label]) => (
          <Link
            key={key}
            href={`/noticias?categoria=${key}${sort === 'top' ? '&orden=top' : ''}`}
            className={cn(
              'rounded-full border px-4 py-1.5 text-xs font-semibold transition',
              category === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary',
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <section
        id="news-content-panel"
        role="tabpanel"
        aria-labelledby={`news-view-tab-${sort}`}
        tabIndex={0}
        className="focus-visible:outline-none"
      >
        {selectedItems.length === 0 ? (
          <EmptyState title="No hay noticias en esta categoría" subtitle="Prueba con otra categoría o vuelve pronto." />
        ) : (
          <div className="animate-fade-in space-y-4" key={sort}>
            {selectedItems.map((item, index) => {
              const expanded = expandedId === item.id;
              const panelId = `news-inline-${item.id}`;
              return (
                <article
                  key={item.id}
                  className={cn(
                    'overflow-hidden rounded-2xl border bg-card shadow-sm transition',
                    expanded ? 'border-primary/35 shadow-md' : 'border-border hover:border-primary/30',
                  )}
                >
                  <div className="grid sm:grid-cols-[180px_1fr]">
                    <div className={cn('overflow-hidden bg-secondary', expanded ? 'min-h-48 sm:min-h-full' : 'h-36 sm:h-full')}>
                      {item.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.coverUrl}
                          alt=""
                          loading={index === 0 ? 'eager' : 'lazy'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full min-h-36 items-center justify-center bg-gradient-to-br from-primary/20 to-accent/15 font-serif-heading text-4xl font-bold text-primary/60">
                          {item.title.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 p-5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{NEWS_CATEGORIES[item.category] ?? item.category}</Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {formatDate(item.publishedAt)}
                        </span>
                      </div>
                      <h2 className="font-serif-heading text-xl font-bold leading-snug text-primary">{item.title}</h2>
                      <p className={cn('mt-2 text-sm leading-relaxed text-muted-foreground', !expanded && 'line-clamp-2')}>
                        {item.summary}
                      </p>
                      <div
                        id={panelId}
                        hidden={!expanded}
                        className="mt-4 space-y-3 border-t border-border pt-4 text-sm leading-relaxed text-foreground/90"
                      >
                        <NewsInlineContent item={item} expanded={expanded} />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-4">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setExpandedId(expanded ? null : item.id)}
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {expanded ? 'Contraer noticia' : 'Leer noticia aquí'}
                        </button>
                        <Link href={`/noticias/${item.slug}`} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary hover:underline">
                          Enlace permanente <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
