import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Award, Cpu, FlaskConical, Globe, MessageCircle, Radar, Rocket, Shield, Target, Users } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Community } from '@/lib/types';
import { buttonVariants } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { CommunityCard } from '@/components/cards';
import { EmptyState } from '@/components/shared';

export const revalidate = 120;
export const metadata: Metadata = { title: 'Sociedad Científica' };

const LOGROS = [
  { year: '2026', title: 'Primer lugar CTF nacional universitario', desc: 'El equipo de HackLab venció a 32 universidades en la final nacional.', icon: Shield },
  { year: '2026', title: 'Artículo aceptado en congreso internacional', desc: 'Investigación estudiantil sobre detección de retinopatía diabética con CNN.', icon: FlaskConical },
  { year: '2025', title: 'Sistema de biblioteca en producción', desc: 'Proyecto de la incubadora adoptado oficialmente por la facultad.', icon: Rocket },
  { year: '2025', title: 'Semillero de programación competitiva', desc: 'Dos equipos clasificados a la regional del ICPC.', icon: Target },
];

async function SociedadCientificaContent() {
  const communities = await serverGet<Community[]>('/communities', []);
  const leads = communities
    .flatMap((c) => [
      c.studentLead ? { ...c.studentLead, role: `Líder estudiantil · ${c.name}` } : null,
      c.teacherLead ? { ...c.teacherLead, role: `Asesor docente · ${c.name}` } : null,
    ])
    .filter(Boolean) as any[];
  const directiva = leads.filter((v, i, arr) => arr.findIndex((x) => x.username === v.username) === i).slice(0, 6);

  return (
    <div className="pb-12">
      {/* Hero cyber */}
      <section className="relative overflow-hidden border-b border-border bg-hero-end text-white">
        <div className="grid-bg absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute left-8 top-16 hidden h-28 w-px bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent lg:block" />
        <div className="pointer-events-none absolute bottom-16 right-8 hidden h-28 w-px bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent lg:block" />
        <div className="pointer-events-none absolute right-10 top-24 hidden font-mono text-[9px] uppercase tracking-[0.3em] text-hero-accent/30 lg:block">
          SYS_CORE: STABLE<br />NODE_SYNC: 100%
        </div>

        <div className="container relative py-16 text-center md:py-24">
          <div className="hud-chip mx-auto mb-8 border-hero-accent/40 bg-cyan-400/10 text-hero-accent">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            Sociedad_Científica // Convocatoria_abierta
          </div>
          <h1 className="mx-auto max-w-3xl font-serif-heading text-4xl font-bold leading-tight sm:text-5xl">
            Donde la curiosidad se convierte en <span className="text-hero-accent">investigación aplicada</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/80">
            La Sociedad Científica de Ingeniería de Sistemas agrupa a las comunidades técnicas de la carrera:
            organizamos competencias, publicamos investigación estudiantil y llevamos proyectos de aula a producción.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/registro" className={buttonVariants({ variant: 'accent', size: 'lg' })}>Quiero unirme <ArrowRight /></Link>
            <Link href="/comunidades?vista=comunidades" className={buttonVariants({ size: 'lg', className: 'border border-white/25 bg-white/10 text-white hover:bg-white/20' })}>
              Explorar comunidades
            </Link>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Users, value: communities.length, label: 'Comunidades' },
              { icon: Radar, value: '12+', label: 'Eventos por año' },
              { icon: FlaskConical, value: '8+', label: 'Papers estudiantiles' },
              { icon: Globe, value: '3', label: 'Competencias intl.' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <s.icon className="mx-auto mb-1.5 h-5 w-5 text-hero-accent" />
                <div className="font-mono text-xl font-bold">{s.value}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/60">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container pt-6" aria-label="Aviso sobre el contenido demostrativo">
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-xs text-warning">
          Presentación demostrativa: los logros e indicadores de esta sección son datos de muestra y deben reemplazarse por información institucional validada antes de una publicación oficial.
        </p>
      </section>

      {/* Misión */}
      <section className="container grid gap-6 py-14 lg:grid-cols-3">
        {[
          { icon: Target, title: 'Misión', desc: 'Impulsar la investigación y la práctica tecnológica estudiantil, conectando aulas, laboratorios y problemas reales del entorno.' },
          { icon: Cpu, title: 'Qué hacemos', desc: 'CTFs, hackathons, semilleros de investigación, mentorías entre pares, clubes de especialización y publicación de artículos.' },
          { icon: Award, title: 'Qué obtienes', desc: 'Experiencia demostrable, red de contactos, insignias y puntos en el portal, y visibilidad ante docentes y empresas.' },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <item.icon className="h-5 w-5" />
            </div>
            <h2 className="font-serif-heading text-lg font-bold text-primary">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </section>

      {/* Directiva */}
      <section className="container space-y-6 pb-14">
        <div className="text-center">
          <span className="section-kicker">Personas al frente</span>
          <h2 className="mt-1 font-serif-heading text-2xl font-bold text-primary sm:text-3xl">Directiva y responsables</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {directiva.map((m) => (
            <Link
              key={m.username + m.role}
              href={`/perfil/${m.username}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-accent/50"
            >
              <Avatar src={m.profile?.avatarUrl} name={m.profile?.fullName} className="h-12 w-12" />
              <div className="min-w-0">
                <div className="font-bold transition group-hover:text-accent">{m.profile?.fullName}</div>
                <div className="truncate text-xs text-muted-foreground">{m.role}</div>
              </div>
            </Link>
          ))}
          {directiva.length === 0 && <p className="col-span-full text-center text-sm text-muted-foreground">La directiva se publicará pronto.</p>}
        </div>
      </section>

      {/* Logros */}
      <section className="border-y border-border bg-secondary/40 py-14">
        <div className="container space-y-8">
          <div className="text-center">
            <span className="section-kicker">Historial</span>
            <h2 className="mt-1 font-serif-heading text-2xl font-bold text-primary sm:text-3xl">Logros recientes</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {LOGROS.map((l) => (
              <div key={l.title} className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
                  <l.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent">{l.year}</div>
                  <h3 className="font-bold">{l.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{l.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comunidades asociadas */}
      <section className="container space-y-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="section-kicker">Ecosistema</span>
            <h2 className="mt-1 font-serif-heading text-2xl font-bold text-primary sm:text-3xl">Comunidades asociadas</h2>
          </div>
          <Link href="/comunidades?vista=comunidades" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Ver todas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {communities.slice(0, 6).map((c) => (
            <CommunityCard key={c.id} community={c} />
          ))}
        </div>
        {communities.length === 0 && <EmptyState title="Aún no hay comunidades asociadas" subtitle="Las comunidades activas aparecerán aquí." />}
      </section>

      {/* CTA canales */}
      <section className="container">
        <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-hero-end p-8 text-center text-white md:p-12">
          <div className="grid-bg absolute inset-0 opacity-50" />
          <div className="relative space-y-4">
            <MessageCircle className="mx-auto h-8 w-8 text-hero-accent" />
            <h2 className="font-serif-heading text-2xl font-bold sm:text-3xl">¿Listo para sumarte?</h2>
            <p className="mx-auto max-w-xl text-sm text-white/75">
              Crea tu cuenta, únete a una comunidad y entra a los canales oficiales. La sociedad científica está abierta
              a todos los semestres — solo necesitas ganas de construir.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link href="/registro" className={buttonVariants({ variant: 'accent' })}>Crear mi cuenta</Link>
              <Link href="/comunidades?vista=comunidades" className={buttonVariants({ className: 'border border-white/25 bg-white/10 text-white hover:bg-white/20' })}>Canales oficiales por comunidad</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default SociedadCientificaContent;
