'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FolderKanban, Loader2, ShieldCheck } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/shared';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { ManageableProject } from '@/lib/types';
import { formatDate, PROJECT_STAGES } from '@/lib/utils';

type ManageableResponse = ManageableProject[] | { items: ManageableProject[] };

function ProjectManagementList() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['projects', 'manageable'],
    queryFn: () => api.get<ManageableResponse>('/projects/manage/mine'),
    retry: false,
  });
  const projects = Array.isArray(data) ? data : data?.items ?? [];

  return (
    <main className="container max-w-5xl space-y-7 py-10">
      <header className="space-y-2">
        <span className="section-kicker">Trabajo en equipo</span>
        <h1 className="font-serif-heading text-3xl font-bold text-primary">Mis proyectos gestionables</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Actualiza la información, el calendario, las noticias y las imágenes de los proyectos donde participas. Cada cambio queda registrado.
        </p>
      </header>

      {isLoading && (
        <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Cargando proyectos…
        </div>
      )}

      {isError && (
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 p-6 text-sm">
          <h2 className="font-bold text-danger">No se pudieron cargar tus proyectos</h2>
          <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : 'Intenta nuevamente.'}</p>
          <button type="button" className={buttonVariants({ size: 'sm', variant: 'outline', className: 'mt-4' })} onClick={() => void refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {!isLoading && !isError && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FolderKanban className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-3 font-serif-heading text-xl font-bold text-primary">No tienes proyectos para gestionar</h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            Cuando seas líder o colaborador de un proyecto aparecerá aquí. También puedes proponer uno nuevo.
          </p>
          <Link href="/proyectos/nuevo" className={buttonVariants({ variant: 'accent', className: 'mt-5' })}>Publicar un proyecto</Link>
        </div>
      )}

      {!isLoading && !isError && projects.length > 0 && (
        <section aria-label="Proyectos que puedes gestionar" className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <article key={project.id} className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-serif-heading text-xl font-bold text-primary">{project.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.summary}</p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Acceso</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-semibold">
                    {project.access?.isAdmin && <ShieldCheck className="h-3.5 w-3.5 text-orange-500" />}
                    {project.access?.isAdmin ? 'Administrador' : project.access?.isOwner ? 'Líder' : 'Colaborador'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Etapa</dt>
                  <dd className="mt-0.5 font-semibold">{PROJECT_STAGES[project.stage] ?? project.stage}</dd>
                </div>
                {project.community && (
                  <div>
                    <dt className="text-muted-foreground">Comunidad</dt>
                    <dd className="mt-0.5 truncate font-semibold">{project.community.name}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Última edición</dt>
                  <dd className="mt-0.5 font-semibold">{formatDate(project.updatedAt)}</dd>
                </div>
              </dl>
              <div className="mt-auto flex justify-end pt-5">
                <Link href={`/proyectos/gestionar/${project.id}`} className={buttonVariants({ size: 'sm', variant: 'accent' })}>
                  Abrir gestión <ArrowRight />
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default function ProjectManagementPage() {
  return <RequireAuth><ProjectManagementList /></RequireAuth>;
}
