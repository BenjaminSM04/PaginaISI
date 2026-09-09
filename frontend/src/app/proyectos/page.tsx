import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Community, Paged, Project } from '@/lib/types';
import { ProjectCard } from '@/components/cards';
import { EmptyState, SectionHeader } from '@/components/shared';
import { FiltersBar } from '@/components/filters-bar';
import { buttonVariants } from '@/components/ui/button';
import { PROJECT_STAGES } from '@/lib/utils';
import { SEMESTERS } from '@/lib/academic';
import { PointReward } from '@/components/point-reward';

export const revalidate = 30;
export const metadata: Metadata = { title: 'Proyectos destacados' };

export default async function ProyectosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const qs = new URLSearchParams();
  for (const key of ['search', 'stage', 'semester', 'community', 'tech', 'tag']) {
    const value = query[key];
    if (!value) continue;
    if (key === 'semester' && !SEMESTERS.includes(Number(value))) continue;
    qs.set(key, value);
  }
  qs.set('limit', '24');

  const [projects, communities] = await Promise.all([
    serverGet<Paged<Project>>(`/projects?${qs.toString()}`, { total: 0, items: [] }),
    serverGet<Community[]>('/communities', []),
  ]);

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader kicker="Vitrina de la carrera" title="Proyectos destacados" />
        <Link href="/proyectos/nuevo" className={buttonVariants({ variant: 'accent' })}><Plus /> Publicar mi proyecto</Link>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Todos los proyectos pasaron por revisión docente. Publica el tuyo: al ser aprobado ganas{' '}
        <PointReward reason="PROYECTO_APROBADO" suffix="Dev Points" className="text-success" /> y entra a la vitrina pública.
      </p>

      <FiltersBar
        searchPlaceholder="Buscar por título o resumen…"
        filters={[
          { param: 'stage', label: 'Estado', options: Object.entries(PROJECT_STAGES).map(([value, label]) => ({ value, label })) },
          { param: 'semester', label: 'Semestre', options: SEMESTERS.map((semester) => ({ value: String(semester), label: `${semester}º semestre` })) },
          { param: 'community', label: 'Comunidad', options: communities.map((c) => ({ value: c.slug, label: c.name })) },
        ]}
      />

      {projects.items.length === 0 ? (
        <EmptyState title="No hay proyectos que coincidan" subtitle="Ajusta los filtros o publica el primero." />
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{projects.total} proyecto(s)</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.items.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
