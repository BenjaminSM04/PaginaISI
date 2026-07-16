import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, Calendar, ExternalLink, Eye, Github, GraduationCap, Layers, Newspaper, UserPlus, Users, Video } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Project } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { CoverPlaceholder, StatusBadge, TagList } from '@/components/shared';
import { CommentSection, LikeButton, ReportButton } from '@/components/actions';
import { formatDate, PROJECT_STAGES } from '@/lib/utils';
import { ExternalResourceLink } from '@/components/external-resource-link';
import { ProjectManageShortcut } from '@/components/project-manage-shortcut';
import { NewsCard } from '@/components/cards';

export const revalidate = 30;

export default async function ProyectoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await serverGet<Project | null>(`/projects/${slug}`, null, 15);
  if (!project) notFound();

  return (
    <div className="container max-w-6xl space-y-8 py-10">
      <Link href="/proyectos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Volver a proyectos
      </Link>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{PROJECT_STAGES[project.stage] ?? project.stage}</Badge>
              {project.isIncubator && <Badge variant="gold">Incubadora</Badge>}
              {project.status !== 'APPROVED' && <StatusBadge status={project.status} />}
              {project.community && (
                <Link href={`/comunidades/${project.community.slug}`}>
                  <Badge variant="accent">{project.community.name}</Badge>
                </Link>
              )}
            </div>
            <h1 className="font-serif-heading text-3xl font-bold leading-tight text-primary sm:text-4xl">{project.title}</h1>
            <p className="text-lg text-muted-foreground">{project.summary}</p>
          </header>

          <div className="overflow-hidden rounded-2xl border border-border">
            {project.coverUrl ? (
              <img src={project.coverUrl} alt={project.title} className="max-h-[420px] w-full object-cover" />
            ) : (
              <div className="h-64">
                <CoverPlaceholder label={project.title[0]} accent={project.community?.accentColor} />
              </div>
            )}
          </div>

          {(project.gallery?.length ?? 0) > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {project.gallery!.map((g, index) => (
                <img key={g.id} src={g.url} alt={`${project.title} — imagen ${index + 1} de la galería`} className="h-28 w-full rounded-xl border border-border object-cover" />
              ))}
            </div>
          )}

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-serif-heading text-lg font-bold text-primary">Descripción del proyecto</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
              {(project.description ?? '').split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            </div>
            {project.videoUrl && (
              <ExternalResourceLink href={project.videoUrl} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
                <Video className="h-4 w-4" /> Ver video de demostración
              </ExternalResourceLink>
            )}
          </section>

          {(project.news?.length ?? 0) > 0 && (
            <section className="space-y-4" aria-labelledby="project-news-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="section-kicker">Actualidad del equipo</span>
                  <h2 id="project-news-title" className="mt-1 flex items-center gap-2 font-serif-heading text-xl font-bold text-primary">
                    <Newspaper className="h-5 w-5 text-accent" /> Noticias del proyecto
                  </h2>
                </div>
                <Link href="/noticias" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Ver todas las noticias <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {project.news!.map((news) => <NewsCard key={news.id} news={news} />)}
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <LikeButton
              type="projects"
              id={project.id}
              initialLiked={project.likedByMe}
              initialCount={project.likesCount}
              ownerUsername={project.owner?.username}
            />
            <span className="flex items-center gap-1 text-sm text-muted-foreground"><Eye className="h-4 w-4" /> {project.viewsCount} vistas</span>
            <div className="ml-auto">
              <ReportButton targetType="PROJECT" targetId={project.id} />
            </div>
          </div>

          <CommentSection type="projects" id={project.id} initialComments={project.comments ?? []} />
        </div>

        <aside className="space-y-5">
          <div className="space-y-2.5 rounded-xl border border-border bg-card p-5 shadow-sm">
            <ProjectManageShortcut projectId={project.id} />
            {project.repoUrl && (
              <ExternalResourceLink href={project.repoUrl} className={buttonVariants({ variant: 'secondary', className: 'w-full' })}>
                <Github /> Repositorio en GitHub
              </ExternalResourceLink>
            )}
            {project.demoUrl && (
              <ExternalResourceLink href={project.demoUrl} className={buttonVariants({ variant: 'accent', className: 'mt-2 w-full' })}>
                <ExternalLink /> Ver demo en vivo
              </ExternalResourceLink>
            )}
            {project.recruiting && (
              <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                <UserPlus className="mx-auto mb-1 h-5 w-5 text-emerald-500" />
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Este equipo busca integrantes — contáctalos por su comunidad o el foro.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card p-5 text-sm shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ficha técnica</h3>
            {project.subject && (
              <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-accent" /> {project.subject}{project.semester ? ` · ${project.semester}º sem.` : ''}</div>
            )}
            {project.phase && <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-accent" /> Fase: {project.phase}</div>}
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-accent" /> Publicado: {formatDate(project.publishedAt)}</div>
            {project.reviewer && (
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-accent" /> Revisado por {project.reviewer.profile?.fullName}
              </div>
            )}
            <div className="pt-1">
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Tecnologías</div>
              <div className="flex flex-wrap gap-1.5">
                {(project.technologies ?? []).map((t) => <Badge key={t.id} variant="accent">{t.name}</Badge>)}
              </div>
            </div>
            <TagList tags={project.tags} max={6} />
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Equipo de desarrollo
            </h3>
            <div className="space-y-2">
              {(project.members ?? []).map((m) => (
                <Link key={m.user.username} href={`/perfil/${m.user.username}`} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-secondary">
                  <Avatar src={m.user.profile?.avatarUrl} name={m.user.profile?.fullName} className="h-8 w-8" />
                  <div>
                    <div className="text-sm font-bold">{m.user.profile?.fullName}</div>
                    {m.roleInProject && <div className="text-xs text-muted-foreground">{m.roleInProject}</div>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
