import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Article, Paged } from '@/lib/types';
import { ArticleCard } from '@/components/cards';
import { EmptyState, SectionHeader } from '@/components/shared';
import { FiltersBar } from '@/components/filters-bar';
import { buttonVariants } from '@/components/ui/button';
import { PointReward } from '@/components/point-reward';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Artículos científicos' };

const AREAS = ['Inteligencia Artificial', 'Ciberseguridad', 'IoT', 'Ingeniería de Software', 'Ciencia de Datos', 'Redes'];

export default async function ArticulosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const qs = new URLSearchParams();
  for (const key of ['search', 'area', 'tag']) {
    if (query[key]) qs.set(key, query[key]!);
  }
  qs.set('limit', '24');
  const articles = await serverGet<Paged<Article>>(`/articles?${qs.toString()}`, { total: 0, items: [] });

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader kicker="Investigación estudiantil" title="Artículos científicos" />
        <Link href="/articulos/nuevo" className={buttonVariants({ variant: 'accent' })}><Plus /> Enviar artículo</Link>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Trabajos de investigación revisados por docentes. Publicar un artículo aprobado otorga{' '}
        <PointReward reason="ARTICULO_APROBADO" suffix="Research Points" className="text-purple-500" />.
      </p>

      <FiltersBar
        searchPlaceholder="Buscar por título o resumen…"
        filters={[{ param: 'area', label: 'Área de investigación', options: AREAS.map((a) => ({ value: a, label: a })) }]}
      />

      {articles.items.length === 0 ? (
        <EmptyState title="No hay artículos que coincidan" subtitle="Ajusta los filtros o envía el primero." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {articles.items.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
