'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock3, TrendingUp } from 'lucide-react';
import type { News } from '@/lib/types';
import { NEWS_CATEGORIES, cn } from '@/lib/utils';
import { NewsCard } from '@/components/cards';
import { EmptyState } from '@/components/shared';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';

type NewsSort = 'recent' | 'top';

const NEWS_TABS = [
  { id: 'recent' as const, label: '10 más recientes', icon: Clock3, panelId: 'news-content-panel' },
  { id: 'top' as const, label: 'Más valoradas', icon: TrendingUp, panelId: 'news-content-panel' },
];

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

  useEffect(() => {
    const syncFromHistory = () => {
      const value = new URLSearchParams(window.location.search).get('orden');
      setSort(value === 'top' ? 'top' : 'recent');
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);

  function changeSort(next: NewsSort) {
    setSort(next);
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
          <div className="grid animate-fade-in gap-6 sm:grid-cols-2 lg:grid-cols-3" key={sort}>
            {selectedItems.map((item) => <NewsCard key={item.id} news={item} />)}
          </div>
        )}
      </section>
    </div>
  );
}
