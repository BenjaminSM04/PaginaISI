import type { Metadata } from 'next';
import { serverGet } from '@/lib/server-api';
import type { News, Paged } from '@/lib/types';
import { SectionHeader } from '@/components/shared';
import { NewsViewTabs } from '@/components/news-view-tabs';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Noticias' };

export default async function NoticiasPage({ searchParams }: { searchParams: Promise<{ categoria?: string; orden?: string }> }) {
  const query = await searchParams;
  const category = query.categoria;
  const sort = query.orden === 'top' ? 'top' : 'recent';
  const categoryQuery = category ? `&category=${category}` : '';
  const [recent, top] = await Promise.all([
    serverGet<Paged<News>>(`/news?limit=10&sort=recent${categoryQuery}`, { total: 0, items: [] }),
    serverGet<Paged<News>>(`/news?limit=10&sort=top${categoryQuery}`, { total: 0, items: [] }),
  ]);

  return (
    <div className="container space-y-8 py-10">
      <SectionHeader kicker="Actualidad de la carrera" title="Noticias" />
      <NewsViewTabs initialSort={sort} category={category} recent={recent.items} top={top.items} />
    </div>
  );
}
