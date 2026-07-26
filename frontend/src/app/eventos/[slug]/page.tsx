import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, CalendarPlus, Download, MapPin, Users, Video } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { EventItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Countdown, CoverPlaceholder } from '@/components/shared';
import { EventRegisterButton } from '@/components/actions';
import { NewsCard } from '@/components/cards';
import { buildGoogleCalendarUrl } from '@/lib/google-calendar';
import { EventGallery } from '@/components/event-gallery';
import { EventAttendees } from '@/components/event-attendees';
import { EventMeetingLink } from '@/components/event-meeting-link';
import { cn, EVENT_CATEGORIES, formatDate } from '@/lib/utils';
import { ExternalResourceLink } from '@/components/external-resource-link';
import { BackButton } from '@/components/back-button';

export const revalidate = 30;

export default async function EventoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await serverGet<EventItem | null>(`/events/${slug}`, null, 15);
  if (!event) notFound();

  const isPast = event.isPast ?? false;
  const googleCalendarUrl = buildGoogleCalendarUrl({
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    isOnline: event.isOnline,
    meetingUrl: event.meetingUrl,
    communityName: event.community?.name,
  });

  return (
    <div className="container max-w-5xl space-y-8 py-10">
      <BackButton fallbackHref="/eventos" label="Volver a eventos" variant="ghost" />

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="relative h-56 md:h-72">
          {event.coverUrl ? (
            <img src={event.coverUrl} alt={event.title} className="h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder label={event.category[0]} accent={event.community?.accentColor} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-8">
            <Badge className="mb-2 border border-white/30 bg-white/15 text-white">{EVENT_CATEGORIES[event.category] ?? event.category}</Badge>
            <h1 className="font-serif-heading text-3xl font-bold leading-tight md:text-4xl">{event.title}</h1>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-serif-heading text-lg font-bold text-primary">Sobre el evento</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
              {event.description.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            </div>
            {event.rulesUrl && (
              <ExternalResourceLink href={event.rulesUrl} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/20">
                <Download className="h-4 w-4" /> Descargar bases / reglamento
              </ExternalResourceLink>
            )}
          </section>

          <EventGallery eventId={event.id} slug={event.slug} title={event.title} initialImages={event.gallery ?? []} />

          {!isPast && (
            <section className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
              <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Comienza en</div>
              <div className="flex justify-center text-primary">
                <Countdown target={event.startsAt} />
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <EventRegisterButton slug={event.slug} initialRegistered={event.registered} isPast={isPast} />
            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            >
              <CalendarPlus /> Agregar a Google Calendar
            </a>
            <div className="space-y-2.5 border-t border-border pt-4 text-sm">
              <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-accent" /> {formatDate(event.startsAt, true)}</div>
              {event.endsAt && <div className="flex items-center gap-2 text-muted-foreground">Hasta: {formatDate(event.endsAt, true)}</div>}
              <div className="flex items-center gap-2">
                {event.isOnline ? <Video className="h-4 w-4 text-accent" /> : <MapPin className="h-4 w-4 text-accent" />}
                {event.isOnline ? 'Evento en línea' : event.location ?? 'Campus'}
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" /> {event._count?.registrations ?? 0} inscritos
                {event.capacity ? ` / ${event.capacity} cupos` : ''}
              </div>
            </div>
            {event.isOnline && <EventMeetingLink slug={event.slug} initialUrl={event.meetingUrl} />}
          </div>

          {event.community && (
            <Link href={`/comunidades/${event.community.slug}`} className="block rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-accent/50">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Organiza</div>
              <div className="mt-1 font-serif-heading font-bold text-primary">{event.community.name}</div>
            </Link>
          )}

          <EventAttendees slug={event.slug} organizerUsername={event.organizer?.username} />
        </aside>
      </div>

      {(event.news?.length ?? 0) > 0 && (
        <section className="space-y-4 border-t border-border pt-8">
          <div>
            <span className="section-kicker">Cobertura y novedades</span>
            <h2 className="mt-1 font-serif-heading text-2xl font-bold text-primary">Noticias relacionadas</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {event.news!.map((news) => <NewsCard key={news.id} news={news} />)}
          </div>
        </section>
      )}
    </div>
  );
}
