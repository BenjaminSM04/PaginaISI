import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Github,
  Globe2,
  GraduationCap,
  Instagram,
  Link2,
  Linkedin,
  MessageCircle,
  Send,
  Users,
  Video,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Community, CommunityLink, UserLite } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CoverPlaceholder } from '@/components/shared';
import { EventCard, MentorshipCard, NewsCard, ProjectCard } from '@/components/cards';
import { CommunityJoinButton } from '@/components/community-join-button';
import { ExternalResourceLink } from '@/components/external-resource-link';

export const revalidate = 30;

const LINK_ICONS: Array<{ keys: string[]; icon: LucideIcon }> = [
  { keys: ['whatsapp', 'discord'], icon: MessageCircle },
  { keys: ['teams', 'microsoft teams'], icon: Video },
  { keys: ['telegram'], icon: Send },
  { keys: ['github'], icon: Github },
  { keys: ['linkedin'], icon: Linkedin },
  { keys: ['instagram'], icon: Instagram },
  { keys: ['youtube'], icon: Youtube },
  { keys: ['web', 'sitio web', 'website'], icon: Globe2 },
];

function iconForPlatform(platform: string) {
  const normalized = platform.trim().toLocaleLowerCase('es');
  return LINK_ICONS.find((entry) => entry.keys.some((key) => normalized.includes(key)))?.icon ?? Link2;
}

function isPublicWebUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function visibleLinks(community: Community): CommunityLink[] {
  if (community.links?.length) {
    return [...community.links]
      .filter((link) => link.isActive && isPublicWebUrl(link.url))
      .sort((a, b) => (a.order ?? a.sortOrder ?? 0) - (b.order ?? b.sortOrder ?? 0));
  }
  const legacy: CommunityLink[] = [];
  if (community.whatsappUrl && isPublicWebUrl(community.whatsappUrl)) legacy.push({ platform: 'WhatsApp', label: 'Grupo de WhatsApp', url: community.whatsappUrl, order: 0, isActive: true });
  if (community.teamsUrl && isPublicWebUrl(community.teamsUrl)) legacy.push({ platform: 'Microsoft Teams', label: 'Equipo en Teams', url: community.teamsUrl, order: 1, isActive: true });
  if (community.discordUrl && isPublicWebUrl(community.discordUrl)) legacy.push({ platform: 'Discord', label: 'Servidor de Discord', url: community.discordUrl, order: 2, isActive: true });
  return legacy;
}

function responsibleUsers(community: Community, role: 'TEACHER_LEAD' | 'STUDENT_LEAD') {
  const byUsername = new Map<string, UserLite>();
  for (const member of community.members ?? []) {
    if (member.role === role) {
      byUsername.set(member.user.username, {
        id: member.user.id,
        username: member.user.username,
        profile: member.user.profile,
      });
    }
  }
  const legacy = role === 'TEACHER_LEAD' ? community.teacherLead : community.studentLead;
  if (legacy) byUsername.set(legacy.username, legacy);
  return [...byUsername.values()];
}

export default async function ComunidadDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const community = await serverGet<Community | null>(`/communities/${slug}`, null);
  if (!community) notFound();

  const accent = community.accentColor ?? '#06B6D4';
  const memberUsernames = (community.members ?? []).map((m) => m.user.username);
  const memberIds = (community.members ?? []).map((m) => m.user.id).filter((id): id is string => !!id);
  const links = visibleLinks(community);
  const teachers = responsibleUsers(community, 'TEACHER_LEAD');
  const studentLeads = responsibleUsers(community, 'STUDENT_LEAD');

  return (
    <div className="pb-12">
      {/* Cabecera */}
      <div className="relative h-52 overflow-hidden border-b border-border md:h-64">
        {community.coverUrl ? (
          // La portada admite orígenes administrables que no pueden declararse estáticamente en Next Image.
          // eslint-disable-next-line @next/next/no-img-element
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
                {community.projects!.map((project) => <ProjectCard key={project.id} project={project} />)}
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
            <CommunityJoinButton slug={community.slug} memberIds={memberIds} memberUsernames={memberUsernames} />
            {links.length > 0 && (
              <div className="mt-4 space-y-2">
                {links.map((resource, index) => {
                  const Icon = iconForPlatform(resource.platform);
                  return (
                    <ExternalResourceLink
                      key={resource.id ?? `${resource.platform}:${resource.url}:${index}`}
                      href={resource.url}
                      aria-label={`${resource.label || resource.platform} (abre en una pestaña nueva)`}
                      className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10"
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{resource.label || resource.platform}</span>
                    </ExternalResourceLink>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Responsables</h3>
            <div className="space-y-3">
              {teachers.map((teacher) => (
                <Link key={`teacher:${teacher.username}`} href={`/perfil/${teacher.username}`} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-secondary">
                  <Avatar src={teacher.profile?.avatarUrl} name={teacher.profile?.fullName} />
                  <div>
                    <div className="text-sm font-bold">{teacher.profile?.fullName ?? `@${teacher.username}`}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><GraduationCap className="h-3 w-3" /> Docente responsable</div>
                  </div>
                </Link>
              ))}
              {studentLeads.map((leader) => (
                <Link key={`student:${leader.username}`} href={`/perfil/${leader.username}`} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-secondary">
                  <Avatar src={leader.profile?.avatarUrl} name={leader.profile?.fullName} />
                  <div>
                    <div className="text-sm font-bold">{leader.profile?.fullName ?? `@${leader.username}`}</div>
                    <div className="text-xs text-muted-foreground">Líder estudiantil</div>
                  </div>
                </Link>
              ))}
              {teachers.length === 0 && studentLeads.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay responsables visibles.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Miembros ({community._count?.members ?? community.members?.length ?? 0})
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
