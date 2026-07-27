import Link from 'next/link';
import {
  ArrowRight, BookOpen, Calendar, FlaskConical, GraduationCap, Lightbulb, MessageSquare,
  Newspaper, Rocket, ShieldCheck, Sparkles, Trophy, Users,
} from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Community, EventItem, News, Paged, Project, RankingRow } from '@/lib/types';
import { buttonVariants } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState, SectionHeader } from '@/components/shared';
import { CommunityCard } from '@/components/cards';
import { HomeTabs } from '@/components/home-tabs';
import { cn, formatDate } from '@/lib/utils';
import { PointReward } from '@/components/point-reward';
import { InstitutionalLogo, InstitutionalText } from '@/components/institutional-logo';

export const revalidate = 60;

const QUICK_APPS = [
  { href: '/comunidades', label: 'Sociedad Científica', icon: FlaskConical, color: 'text-cyan-500', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  { href: '/comunidades?vista=comunidades', label: 'Comunidades', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { href: '/proyectos', label: 'Proyectos', icon: Rocket, color: 'text-indigo-500', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  { href: '/articulos', label: 'Artículos', icon: BookOpen, color: 'text-sky-500', bg: 'bg-sky-500/10 border-sky-500/20' },
  { href: '/eventos', label: 'Eventos', icon: Calendar, color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20' },
  { href: '/foro', label: 'Foro Q&A', icon: MessageSquare, color: 'text-pink-500', bg: 'bg-pink-500/10 border-pink-500/20' },
  { href: '/ranking', label: 'Ranking', icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
  { href: '/incubadora', label: 'Incubadora', icon: Lightbulb, color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20' },
  { href: '/mentorias', label: 'Mentorías', icon: GraduationCap, color: 'text-teal-500', bg: 'bg-teal-500/10 border-teal-500/20' },
  { href: '/noticias', label: 'Noticias', icon: Newspaper, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
];

export default async function HomePage() {
  const [projects, events, news, ranking, communities] = await Promise.all([
    serverGet<Paged<Project>>('/projects?limit=6', { total: 0, items: [] }),
    serverGet<{ items: EventItem[] }>('/events?when=upcoming', { items: [] }),
    serverGet<Paged<News>>('/news?limit=3&sort=top', { total: 0, items: [] }),
    serverGet<RankingRow[]>('/ranking?limit=5', []),
    serverGet<Community[]>('/communities', []),
  ]);

  const totalMembers = communities.reduce((acc, c) => acc + (c._count?.members ?? 0), 0);
  const featuredEvent = events.items.find((e) => e.isFeatured) ?? events.items[0];

  return (
    <div className="space-y-16 pb-12">
      {/* HERO */}
      <section className="container min-w-0 max-w-full pt-6">
        <div className="relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0C447C] via-[#093561] to-[#082F54] text-white shadow-xl">
          <div className="grid-bg absolute inset-0 opacity-40" />
          <div className="relative grid min-w-0 grid-cols-1 items-center gap-10 px-6 py-12 md:py-16 lg:grid-cols-12 lg:px-10">
            <div className="min-w-0 space-y-6 lg:col-span-7">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 backdrop-blur-sm">
                <Sparkles className="h-4 w-4" /> <InstitutionalText field="institutionName" />
              </div>
              <h1 className="break-words font-serif-heading text-3xl font-bold leading-tight tracking-tight min-[420px]:text-4xl sm:text-5xl">
                <InstitutionalText field="careerName" compact className="break-words" />: <span className="block text-cyan-400 sm:inline">innovación y comunidad<span className="text-white">.</span></span>
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
                Bienvenido al portal de la <strong className="text-white"><InstitutionalText field="careerName" /></strong> de <InstitutionalText field="shortName" />:
                publica tus proyectos, únete a comunidades de ciberseguridad y programación, comparte investigación,
                resuelve dudas en el foro y escala en el ranking.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link href="/proyectos" className={buttonVariants({ variant: 'accent', size: 'lg' })}>
                  Explorar proyectos <ArrowRight />
                </Link>
                <Link href="/comunidades?vista=comunidades" className={buttonVariants({ size: 'lg', className: 'border border-white/25 bg-white/10 text-white hover:bg-white/20' })}>
                  <Users /> Unirme a una comunidad
                </Link>
                <Link href="/eventos" className={buttonVariants({ size: 'lg', variant: 'ghost', className: 'text-white hover:bg-white/10' })}>
                  <Calendar /> Ver eventos
                </Link>
              </div>
            </div>

            <div className="min-w-0 lg:col-span-5">
              <div className="glass relative min-w-0 space-y-4 overflow-hidden rounded-2xl p-4 shadow-2xl sm:p-6">
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rotate-12 rounded-2xl border-2 border-cyan-400/25" />
                <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 -rotate-6 rounded-2xl border-2 border-amber-300/20" />
                <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
                      <InstitutionalLogo className="h-full w-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold">Ecosistema <InstitutionalText field="shortName" /></div>
                      <div className="text-xs text-cyan-300">Datos publicados en el portal</div>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">● En vivo</span>
                </div>
                <div className="relative grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                    <div className="text-2xl font-bold text-cyan-400">{totalMembers}</div>
                    <div className="text-[11px] uppercase tracking-wider text-white/75">Miembros en comunidades</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                    <div className="text-2xl font-bold text-amber-300">{projects.total}</div>
                    <div className="text-[11px] uppercase tracking-wider text-white/75">Proyectos publicados</div>
                  </div>
                </div>
                {featuredEvent && (
                  <Link href={`/eventos/${featuredEvent.slug}`} className="relative block space-y-2 rounded-xl border border-white/10 bg-white/5 p-3.5 transition hover:bg-white/10">
                    <div className="flex min-w-0 justify-between gap-2 text-xs font-semibold">
                      <span className="min-w-0 line-clamp-1">{featuredEvent.title}</span>
                      <span className="shrink-0 text-cyan-300">{formatDate(featuredEvent.startsAt)}</span>
                    </div>
                    {featuredEvent.capacity && (
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-white/20"
                        role="progressbar"
                        aria-label="Cupos ocupados"
                        aria-valuemin={0}
                        aria-valuemax={featuredEvent.capacity}
                        aria-valuenow={featuredEvent._count?.registrations ?? 0}
                      >
                        <div
                          className="h-full bg-gradient-to-r from-cyan-400 to-amber-300"
                          style={{ width: `${Math.min(100, ((featuredEvent._count?.registrations ?? 0) / featuredEvent.capacity) * 100)}%` }}
                        />
                      </div>
                    )}
                    <div className="flex justify-between text-[11px] text-white/70">
                      <span>{featuredEvent._count?.registrations ?? 0} inscritos</span>
                      <PointReward reason="INSCRIPCION_EVENTO" suffix="pts por inscribirte" />
                    </div>
                  </Link>
                )}
                <div className="relative flex items-center justify-between pt-1 text-xs text-white/80">
                  <span>¿Tienes dudas técnicas?</span>
                  <Link href="/foro" className="font-semibold text-cyan-300 underline hover:text-white">Ir al foro Q&A →</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="container">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { icon: Users, value: `${totalMembers}`, label: 'Membresías en comunidades', color: 'text-primary' },
            { icon: Rocket, value: `${projects.total}`, label: 'Proyectos y demos', color: 'text-gold' },
            { icon: ShieldCheck, value: `${communities.length}`, label: 'Comunidades activas', color: 'text-accent' },
            { icon: Trophy, value: `${ranking.length > 0 ? ranking[0].points : 0}`, label: 'Puntos del líder actual', color: 'text-emerald-500' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/50">
              <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary', s.color)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-serif-heading text-xl font-bold sm:text-2xl">{s.value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ACCESOS RÁPIDOS */}
      <section className="container space-y-6">
        <SectionHeader kicker="Todo el ecosistema" title="Accesos rápidos" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_APPS.map((app) => (
            <Link
              key={app.href}
              href={app.href}
              className={cn('group flex flex-col items-center gap-2.5 rounded-xl border bg-card p-5 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md', app.bg)}
            >
              <app.icon className={cn('h-7 w-7 transition group-hover:scale-110', app.color)} />
              <span className="text-xs font-semibold leading-tight">{app.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* SOBRE LA CARRERA */}
      <section className="container">
        <div className="grid gap-8 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-10 lg:grid-cols-2">
          <div className="space-y-4">
            <span className="section-kicker">Sobre la carrera</span>
            <h2 className="font-serif-heading text-2xl font-bold text-primary sm:text-3xl">Formamos ingenieros que construyen, investigan y comparten</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              En <InstitutionalText field="institutionName" />, la <InstitutionalText field="careerName" /> forma profesionales capaces de diseñar, desarrollar y
              operar soluciones de software con impacto real. Este portal es la vitrina de lo que hacen sus estudiantes:
              proyectos de materia y de incubadora, artículos científicos, comunidades técnicas y competencias.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <h3 className="text-sm font-bold text-primary">Propósito del portal</h3>
                <p className="mt-1 text-xs text-muted-foreground">Dar visibilidad al talento estudiantil y reunir proyectos, investigación y participación académica en un solo espacio.</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <h3 className="text-sm font-bold text-primary">Proyección del portal</h3>
                <p className="mt-1 text-xs text-muted-foreground">Conectar estudiantes, docentes, comunidades y aliados alrededor de la innovación en Ingeniería de Sistemas.</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Objetivos del portal</h3>
            {[
              ['Visibilizar proyectos', 'Los mejores trabajos del semestre, con demo y repositorio, validados por docentes.'],
              ['Fomentar investigación', 'Artículos científicos estudiantiles con revisión y publicación abierta.'],
              ['Incentivar participación', 'Puntos, insignias y rankings por aportar a la comunidad académica.'],
              ['Conectar personas', 'Docentes descubren talento; estudiantes encuentran equipo y mentores.'],
            ].map(([title, desc], i) => (
              <div key={title} className="flex gap-3 rounded-xl border border-border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-serif-heading text-sm font-bold text-primary">{i + 1}</div>
                <div>
                  <div className="text-sm font-bold">{title}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DESTACADOS */}
      <section className="container space-y-6">
        <SectionHeader kicker="Actualidad" title="Lo más destacado" href="/proyectos" linkLabel="Ver vitrina completa" />
        <HomeTabs projects={projects.items} events={events.items} news={news.items} />
      </section>

      {/* COMUNIDADES */}
      <section className="container space-y-6">
        <SectionHeader kicker="Especialización y práctica" title="Comunidades activas" href="/comunidades?vista=comunidades" linkLabel="Ver todas" />
        <div className="no-scrollbar flex gap-5 overflow-x-auto pb-2 pt-1">
          {communities.map((c) => (
            <div key={c.id} className="w-72 shrink-0">
              <CommunityCard community={c} />
            </div>
          ))}
        </div>
        {communities.length === 0 && <EmptyState title="Aún no hay comunidades activas" subtitle="Las comunidades publicadas aparecerán en esta sección." />}
      </section>

      {/* RANKING */}
      <section className="container">
        <div className="grid items-center gap-8 rounded-2xl border border-border bg-gradient-to-r from-secondary/60 via-card to-secondary/60 p-6 shadow-sm md:p-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/15 px-3 py-1 text-xs font-bold text-gold">
              <Trophy className="h-4 w-4" /> Cuadro de honor del portal
            </div>
            <h2 className="font-serif-heading text-2xl font-bold leading-tight text-primary sm:text-3xl">Top 5 del ranking general</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              La gamificación premia el mérito: publica proyectos, responde en el foro, comparte investigación y
              participa en eventos para sumar <strong className="text-accent">Dev</strong>,{' '}
              <strong className="text-purple-500">Research</strong> y <strong className="text-emerald-500">Community Points</strong>.
              <span className="mt-1 block text-xs italic">* Reconocimiento del sistema de gamificación, no es el cuadro de honor académico oficial.</span>
            </p>
            <Link href="/ranking" className={buttonVariants()}>Ver ranking completo <ArrowRight /></Link>
          </div>
          <div className="space-y-2.5 rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-7">
            {ranking.map((r, idx) => (
              <Link
                key={r.userId}
                href={`/perfil/${r.username}`}
                className={cn(
                  'flex items-center justify-between rounded-lg border p-3 transition hover:scale-[1.01]',
                  idx === 0 ? 'border-gold/50 bg-gold/10' : 'border-border bg-secondary/40',
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-extrabold',
                      idx === 0 ? 'bg-gold text-black/80' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    #{r.position}
                  </div>
                  <Avatar src={r.avatarUrl} name={r.fullName} className="h-9 w-9 rounded-md" />
                  <div>
                    <div className="text-sm font-bold">{r.fullName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.semester ? `${r.semester}º semestre` : 'Estudiante'} · {r.badgesCount} insignias
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-primary">{r.points} pts</div>
                </div>
              </Link>
            ))}
            {ranking.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay datos de ranking.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
