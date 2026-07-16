import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Lightbulb, Rocket, Users } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Paged, Project } from '@/lib/types';
import { ProjectCard } from '@/components/cards';
import { EmptyState } from '@/components/shared';
import { buttonVariants } from '@/components/ui/button';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Incubadora de proyectos' };

export default async function IncubadoraPage() {
  const projects = await serverGet<Paged<Project>>('/projects?incubator=true&limit=24', { total: 0, items: [] });
  const recruiting = projects.items.filter((p) => p.recruiting);

  return (
    <div className="container space-y-10 py-10">
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950 via-[#1a1040] to-[#0C1130] p-8 text-white md:p-12">
        <div className="grid-bg absolute inset-0 opacity-30" />
        <div className="relative max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-400/10 px-3.5 py-1.5 text-xs font-semibold text-purple-300">
            <Lightbulb className="h-4 w-4" /> Incubadora ISI
          </div>
          <h1 className="font-serif-heading text-3xl font-bold leading-tight sm:text-4xl">
            De proyecto de aula a <span className="text-purple-300">producto real</span>
          </h1>
          <p className="text-sm leading-relaxed text-white/80">
            La incubadora acompaña a equipos estudiantiles con mentoría docente, infraestructura y conexión con usuarios
            reales. Estos son los proyectos actualmente incubados — varios buscan nuevos integrantes.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/proyectos/nuevo" className={buttonVariants({ className: 'bg-purple-500 text-white hover:bg-purple-600' })}><Rocket /> Postular mi proyecto</Link>
            <Link href="/comunidades/incubadora" className={buttonVariants({ className: 'border border-white/25 bg-white/10 text-white hover:bg-white/20' })}>
              <Users /> Comunidad de incubadora
            </Link>
          </div>
        </div>
      </div>

      {recruiting.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-serif-heading text-xl font-bold text-primary">Equipos buscando integrantes</h2>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-500">{recruiting.length} abiertos</span>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recruiting.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-serif-heading text-xl font-bold text-primary">Todos los proyectos incubados</h2>
        {projects.items.length === 0 ? (
          <EmptyState title="Aún no hay proyectos en la incubadora" subtitle="Publica el tuyo y márcalo como proyecto de incubadora." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.items.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </section>

      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">¿Tienes una idea con potencial? Solicita una reunión con el equipo de la incubadora.</p>
        <Link href="/comunidades/incubadora" className={buttonVariants({ variant: 'outline' })}>Solicitar reunión <ArrowRight /></Link>
      </div>
    </div>
  );
}
