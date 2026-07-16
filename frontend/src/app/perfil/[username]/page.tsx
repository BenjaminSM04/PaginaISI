import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, CheckCircle2, Code2, ExternalLink, FlaskConical, Github, Linkedin, MessageSquare, Users } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArticleCard, ProjectCard, QuestionCard } from '@/components/cards';
import { BadgeIcon } from '@/components/badge-icon';
import { ExternalResourceLink } from '@/components/external-resource-link';

export const revalidate = 30;

export default async function PerfilPublicoPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await serverGet<any>(`/users/${username}`, null, 15);
  if (!user) notFound();

  const p = user.profile ?? {};
  const stats = user.stats ?? {};

  return (
    <div className="container space-y-8 py-10">
      {/* Cabecera de perfil */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid-bg h-28 bg-gradient-to-r from-[#0C447C] to-[#082F54]" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <Avatar src={p.avatarUrl} name={p.fullName} className="h-24 w-24 border-4 border-card text-2xl shadow-lg" />
              <div className="pb-1">
                <h1 className="font-serif-heading text-2xl font-bold">{p.fullName}</h1>
                <p className="text-sm text-muted-foreground">
                  @{user.username} · {p.career ?? 'Ingeniería de Sistemas Informáticos'}{p.semester ? ` · ${p.semester}º semestre` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pb-1">
              {p.githubUrl && (
                <ExternalResourceLink href={p.githubUrl} aria-label={`GitHub de ${p.fullName}`} title="GitHub" className="flex h-9 min-w-9 items-center justify-center gap-1 px-2 rounded-lg border border-border hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Github aria-hidden="true" className="h-4 w-4" />
                </ExternalResourceLink>
              )}
              {p.linkedinUrl && (
                <ExternalResourceLink href={p.linkedinUrl} aria-label={`LinkedIn de ${p.fullName}`} title="LinkedIn" className="flex h-9 min-w-9 items-center justify-center gap-1 px-2 rounded-lg border border-border hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Linkedin aria-hidden="true" className="h-4 w-4" />
                </ExternalResourceLink>
              )}
              {p.websiteUrl && (
                <ExternalResourceLink href={p.websiteUrl} aria-label={`Sitio web de ${p.fullName}`} title="Sitio web" className="flex h-9 min-w-9 items-center justify-center gap-1 px-2 rounded-lg border border-border hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                </ExternalResourceLink>
              )}
            </div>
          </div>
          {p.bio && <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{p.bio}</p>}

          {/* Puntos */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-center">
              <div className="font-serif-heading text-2xl font-bold text-gold">{p.totalPoints ?? 0}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total</div>
            </div>
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-center">
              <div className="font-serif-heading text-2xl font-bold text-accent">{p.devPoints ?? 0}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dev</div>
            </div>
            <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-3 text-center">
              <div className="font-serif-heading text-2xl font-bold text-purple-500">{p.researchPoints ?? 0}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Research</div>
            </div>
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-center">
              <div className="font-serif-heading text-2xl font-bold text-emerald-500">{p.communityPoints ?? 0}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Community</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {/* Proyectos */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary">
              <Code2 className="h-5 w-5" /> Proyectos publicados ({stats.projectsCount ?? 0})
            </h2>
            {(user.projectsOwned ?? []).length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {user.projectsOwned.map((pr: any) => <ProjectCard key={pr.id} project={pr} />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no tiene proyectos aprobados.</p>
            )}
          </section>

          {/* Artículos */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary">
              <FlaskConical className="h-5 w-5" /> Artículos ({stats.articlesCount ?? 0})
            </h2>
            {(user.articlesOwned ?? []).length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2">
                {user.articlesOwned.map((a: any) => <ArticleCard key={a.id} article={a} />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no tiene artículos aprobados.</p>
            )}
          </section>

          {/* Actividad en foro */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary">
              <MessageSquare className="h-5 w-5" /> Actividad en el foro
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <div className="text-xl font-bold">{stats.questionsCount ?? 0}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Preguntas</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <div className="text-xl font-bold">{stats.answersCount ?? 0}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Respuestas</div>
              </div>
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xl font-bold text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> {stats.acceptedCount ?? 0}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Aceptadas</div>
              </div>
            </div>
            <div className="space-y-3">
              {(user.questions ?? []).slice(0, 4).map((q: any) => <QuestionCard key={q.id} question={q} />)}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          {/* Insignias */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Award className="h-3.5 w-3.5" /> Insignias ({user.badges?.length ?? 0})
            </h3>
            <div className="space-y-2.5">
              {(user.badges ?? []).map((ub: any) => (
                <div key={ub.badge.id} className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
                    style={{ backgroundColor: `${ub.badge.color ?? '#0C447C'}22`, borderColor: `${ub.badge.color ?? '#0C447C'}55`, color: ub.badge.color ?? '#0C447C' }}
                  >
                    <BadgeIcon icon={ub.badge.icon} label={ub.badge.name} className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">{ub.badge.name}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">{ub.badge.description}</div>
                  </div>
                </div>
              ))}
              {(user.badges?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Aún sin insignias.</p>}
            </div>
          </div>

          {/* Habilidades */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Habilidades técnicas</h3>
            <div className="flex flex-wrap gap-1.5">
              {(user.skills ?? []).map((s: any) => (
                <Badge key={s.skill.id} variant="accent">{s.skill.name}</Badge>
              ))}
              {(user.skills?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Sin habilidades registradas.</p>}
            </div>
          </div>

          {/* Comunidades */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Comunidades
            </h3>
            <div className="space-y-2">
              {(user.communityMemberships ?? []).map((m: any) => (
                <Link key={m.community.id} href={`/comunidades/${m.community.slug}`} className="flex items-center gap-2 rounded-lg p-1.5 text-sm transition hover:bg-secondary">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.community.accentColor ?? '#06B6D4' }} />
                  {m.community.name}
                </Link>
              ))}
              {(user.communityMemberships?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">No pertenece a comunidades aún.</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
