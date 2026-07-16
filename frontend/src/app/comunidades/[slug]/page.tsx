import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, GraduationCap, MessageCircle, Users, Video } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Community } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CoverPlaceholder } from '@/components/shared';
import { EventCard, MentorshipCard, NewsCard, ProjectCard } from '@/components/cards';
import { JoinCommunityButton } from '@/components/actions';
import { ExternalResourceLink } from '@/components/external-resource-link';

export const revalidate = 30;

export default async function ComunidadDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const community = await serverGet<Community | null>(`/communities/${slug}`, null);
  if (!community) notFound();

  const accent = community.accentColor ?? '#06B6D4';
  const memberUsernames = (community.members ?? []).map((m) => m.user.username);

  return (
    <div className="pb-12">
      {/* Cabecera */}
      <div className="relative h-52 overflow-hidden border-b border-border md:h-64">
        {community.coverUrl ? (
          <img src={community.coverUrl} alt={community.name} className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder label={community.name[0]} accent={accent} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="container absolute inset-x-0 bottom-0 pb-6 text-white">
          <Link href="/comunidades?vista=comunidades" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Comunidades
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif-heading text-3xl font-bold sm:text-4xl">{community.name}</h1>
              <p className="mt-1 max-w-xl text-sm text-white/85">{community.description}</p>
            </div>
            <span className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
              <Users className="h-3.5 w-3.5" style={{ color: accent }} /> {community._count?.members ?? community.members?.length ?? 0} miembros
            </span>
          </div>
        </div>
      </div>

      <div className="container grid gap-8 py-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {community.longDescription && (
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-serif-heading text-lg font-bold text-primary">Sobre la comunidad</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{community.longDescription}</p>
            </section>
          )}

          {(community.projects?.length ?? 0) > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif-heading text-xl font-bold text-primary">Proyectos de la comunidad</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {community.projects!.map((p: any) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}

          {(community.events?.length ?? 0) > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif-heading text-xl font-bold text-primary">Eventos</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {community.events!.map((e) => <EventCard key={e.id} event={e} />)}
              </div>
            </section>
          )}

          {(community.news?.length ?? 0) > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif-heading text-xl font-bold text-primary">Noticias de la comunidad</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {community.news!.map((news) => <NewsCard key={news.id} news={news} />)}
              </div>
            </section>
          )}

          {(community.mentorships?.length ?? 0) > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif-heading text-xl font-bold text-primary">Mentorías activas</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {community.mentorships!.map((m) => <MentorshipCard key={m.id} mentorship={m} />)}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <JoinCommunityButton slug={community.slug} memberUsernames={memberUsernames} />
            <div className="mt-4 space-y-2">
              {community.whatsappUrl && (
                <ExternalResourceLink href={community.whatsappUrl} className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400">
                  <MessageCircle className="h-4 w-4" /> Grupo de WhatsApp
                </ExternalResourceLink>
              )}
              {community.teamsUrl && (
                <ExternalResourceLink href={community.teamsUrl} className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-500/20 dark:text-indigo-400">
                  <Video className="h-4 w-4" /> Equipo en Teams
                </ExternalResourceLink>
              )}
              {community.discordUrl && (
                <ExternalResourceLink href={community.discordUrl} className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2.5 text-sm font-semibold text-violet-600 transition hover:bg-violet-500/20 dark:text-violet-400">
                  <MessageCircle className="h-4 w-4" /> Servidor de Discord
                </ExternalResourceLink>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Responsables</h3>
            <div className="space-y-3">
              {community.teacherLead && (
                <Link href={`/perfil/${community.teacherLead.username}`} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-secondary">
                  <Avatar src={community.teacherLead.profile?.avatarUrl} name={community.teacherLead.profile?.fullName} />
                  <div>
                    <div className="text-sm font-bold">{community.teacherLead.profile?.fullName}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><GraduationCap className="h-3 w-3" /> Docente asesor</div>
                  </div>
                </Link>
              )}
              {community.studentLead && (
                <Link href={`/perfil/${community.studentLead.username}`} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-secondary">
                  <Avatar src={community.studentLead.profile?.avatarUrl} name={community.studentLead.profile?.fullName} />
                  <div>
                    <div className="text-sm font-bold">{community.studentLead.profile?.fullName}</div>
                    <div className="text-xs text-muted-foreground">Líder estudiantil</div>
                  </div>
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Miembros ({community.members?.length ?? 0})
            </h3>
            <div className="space-y-2">
              {(community.members ?? []).slice(0, 12).map((m) => (
                <Link key={m.user.username} href={`/perfil/${m.user.username}`} className="flex items-center justify-between rounded-lg p-1.5 transition hover:bg-secondary">
                  <span className="flex items-center gap-2 text-sm">
                    <Avatar src={m.user.profile?.avatarUrl} name={m.user.profile?.fullName} className="h-7 w-7 text-[9px]" />
                    {m.user.profile?.fullName}
                  </span>
                  {m.role !== 'MEMBER' && <Badge variant="accent" className="text-[9px]">{m.role === 'STUDENT_LEAD' ? 'Líder' : 'Docente'}</Badge>}
                </Link>
              ))}
              {(community.members?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Sé el primero en unirte.</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
