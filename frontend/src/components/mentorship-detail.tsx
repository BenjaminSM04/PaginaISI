'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  GraduationCap,
  ListChecks,
  MapPin,
  Monitor,
  Pencil,
  Users,
  Video,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { buildGoogleCalendarUrl } from '@/lib/google-calendar';
import type { Mentorship } from '@/lib/types';
import { EnrollMentorshipButton } from '@/components/actions';
import { ExternalResourceLink } from '@/components/external-resource-link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { CoverPlaceholder } from '@/components/shared';
import { cn, DIFFICULTY_LABELS, formatDate } from '@/lib/utils';

const MODALITY_LABELS = {
  IN_PERSON: 'Presencial',
  ONLINE: 'En línea',
  HYBRID: 'Híbrida',
} as const;

const STATUS_LABELS = {
  UPCOMING: 'Próxima',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizada',
  INACTIVE: 'Inactiva',
} as const;

export function MentorshipDetail({ initial }: { initial: Mentorship }) {
  const { user, loading } = useAuth();
  const query = useQuery({
    queryKey: ['mentorship', initial.slug, user?.id],
    queryFn: () => api.get<Mentorship>(`/mentorships/${initial.slug}`),
    initialData: initial,
    enabled: !loading,
    retry: false,
  });
  const mentorship = query.data;
  const modality = mentorship.modality ?? 'ONLINE';
  const status = mentorship.status ?? 'UPCOMING';
  const participantCount = mentorship._count?.enrollments ?? mentorship.participants?.length ?? 0;
  const full = Boolean(mentorship.capacity && participantCount >= mentorship.capacity);
  const disabledReason = status === 'COMPLETED' || status === 'INACTIVE'
    ? 'Esta mentoría ya no recibe inscripciones.'
    : full
      ? 'La mentoría alcanzó su capacidad.'
      : user && !user.roles.includes('STUDENT')
        ? 'La inscripción está disponible para estudiantes.'
        : null;
  const calendarUrl = mentorship.startsAt ? buildGoogleCalendarUrl({
    title: mentorship.title,
    description: mentorship.description,
    startsAt: mentorship.startsAt,
    endsAt: mentorship.endsAt,
    location: mentorship.location,
    isOnline: modality === 'ONLINE',
    meetingUrl: mentorship.meetingUrl ?? mentorship.teamsUrl,
    communityName: mentorship.community?.name,
  }) : null;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative h-60 md:h-80">
          {mentorship.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mentorship.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder label={mentorship.title[0]} accent={mentorship.community?.accentColor ?? '#14b8a6'} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-8">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge className="border border-white/30 bg-white/15 text-white">{mentorship.area}</Badge>
              <Badge className="border border-white/30 bg-white/15 text-white">{DIFFICULTY_LABELS[mentorship.difficulty] ?? mentorship.difficulty}</Badge>
              <Badge className="border border-teal-300/40 bg-teal-300/20 text-teal-100">{STATUS_LABELS[status]}</Badge>
            </div>
            <h1 className="font-serif-heading text-3xl font-bold leading-tight md:text-4xl">{mentorship.title}</h1>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <main className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-serif-heading text-xl font-bold text-primary">Sobre la mentoría</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
              {mentorship.description.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary"><ListChecks className="h-5 w-5 text-teal-500" /> Temario</h2>
            {mentorship.syllabus.length ? (
              <ol className="mt-4 space-y-2.5">
                {mentorship.syllabus.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 font-serif-heading text-xs font-bold text-primary">{index + 1}</span>
                    {item}
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-muted-foreground">El temario se publicará pronto.</p>}
          </section>

          {(mentorship.gallery?.length ?? 0) > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif-heading text-xl font-bold text-primary">Galería</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {mentorship.gallery!.map((image) => (
                  <a key={image.id} href={image.url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border border-border bg-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={`Galería de ${mentorship.title}`} className="aspect-video w-full object-cover transition hover:scale-[1.02]" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {(mentorship.participants?.length ?? 0) > 0 && (
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary"><Users className="h-5 w-5 text-teal-500" /> Participantes</h2>
              <p className="mt-1 text-xs text-muted-foreground">Visible para personas inscritas y gestores.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {mentorship.participants!.map((participant) => (
                  <Link key={participant.id ?? participant.username} href={`/perfil/${participant.username}`} className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:bg-secondary">
                    <Avatar src={participant.profile?.avatarUrl} name={participant.profile?.fullName} className="h-9 w-9" />
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{participant.profile?.fullName ?? participant.username}</span><span className="block text-xs text-muted-foreground">@{participant.username}</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="space-y-5">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <EnrollMentorshipButton
              slug={mentorship.slug}
              title={mentorship.title}
              initialEnrolled={mentorship.enrolled}
              disabledReason={loading ? 'Comprobando tu sesión…' : disabledReason}
            />
            {mentorship.canManage && (
              <Link href={`/mentorias/gestionar/${mentorship.id}`} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
                <Pencil /> Gestionar mentoría
              </Link>
            )}
            {calendarUrl && (
              <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
                <CalendarPlus /> Agregar al calendario
              </a>
            )}
            <dl className="space-y-3 border-t border-border pt-4 text-sm">
              <div className="flex gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" /><div><dt className="font-semibold">Inicio</dt><dd className="text-muted-foreground">{formatDate(mentorship.startsAt, true)}</dd></div></div>
              {mentorship.endsAt && <div className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" /><div><dt className="font-semibold">Finaliza</dt><dd className="text-muted-foreground">{formatDate(mentorship.endsAt, true)}</dd></div></div>}
              <div className="flex gap-2">
                {modality === 'ONLINE' ? <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />}
                <div><dt className="font-semibold">{MODALITY_LABELS[modality]}</dt><dd className="text-muted-foreground">{modality === 'ONLINE' ? 'Acceso privado para inscritos' : mentorship.location ?? 'Lugar por confirmar'}</dd></div>
              </div>
              <div className="flex gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" /><div><dt className="font-semibold">Participantes</dt><dd className="text-muted-foreground">{participantCount}{mentorship.capacity ? ` / ${mentorship.capacity}` : ''} inscritos</dd></div></div>
            </dl>
            {(mentorship.meetingUrl || mentorship.teamsUrl) && (
              <div className="space-y-2 border-t border-border pt-4">
                {mentorship.meetingUrl && (
                  <ExternalResourceLink href={mentorship.meetingUrl} className={cn(buttonVariants({ variant: 'accent' }), 'w-full')}>
                    <Video /> Entrar a la sesión
                  </ExternalResourceLink>
                )}
                {mentorship.teamsUrl && mentorship.teamsUrl !== mentorship.meetingUrl && (
                  <ExternalResourceLink href={mentorship.teamsUrl} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
                    <Monitor /> Abrir canal de Teams
                  </ExternalResourceLink>
                )}
              </div>
            )}
            {mentorship.youtubeUrl && (
              <ExternalResourceLink href={mentorship.youtubeUrl} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
                <Video /> Ver grabaciones
              </ExternalResourceLink>
            )}
            {query.isError && <p role="alert" className="text-xs text-red-500">No se pudo actualizar tu acceso. Se muestran los datos públicos.</p>}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold"><GraduationCap className="h-4 w-4 text-teal-500" /> Docentes responsables</h2>
            <div className="mt-3 space-y-3">
              {(mentorship.mentors?.length ? mentorship.mentors.map((entry) => entry.user) : mentorship.mentor ? [mentorship.mentor] : []).map((mentor) => (
                <Link key={mentor.id ?? mentor.username} href={`/perfil/${mentor.username}`} className="flex items-center gap-3 rounded-lg p-1 transition hover:bg-secondary">
                  <Avatar src={mentor.profile?.avatarUrl} name={mentor.profile?.fullName} className="h-10 w-10" />
                  <span><span className="block text-sm font-bold">{mentor.profile?.fullName ?? mentor.username}</span><span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Docente verificado</span></span>
                </Link>
              ))}
            </div>
          </section>

          {mentorship.community && (
            <Link href={`/comunidades/${mentorship.community.slug}`} className="block rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-teal-500/50">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Comunidad organizadora</span>
              <span className="mt-1 block font-serif-heading font-bold text-primary">{mentorship.community.name}</span>
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
