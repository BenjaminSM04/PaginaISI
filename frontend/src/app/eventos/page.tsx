import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, CalendarDays, Download, MapPin, Video } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { EventItem } from '@/lib/types';
import { Countdown, EmptyState, SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn, EVENT_CATEGORIES, formatDate } from '@/lib/utils';
import { EventManagementShortcut } from '@/components/event-management-shortcut';
import { ExternalResourceLink } from '@/components/external-resource-link';
import { PointReward } from '@/components/point-reward';
import { EventRegistrationIndicator, RegisteredEventGrid } from '@/components/event-registration-list';

export const revalidate = 30;
export const metadata: Metadata = { title: 'Eventos, CTF y talleres' };

export default async function EventosPage({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const query = await searchParams;
  const category = query.categoria;
  const catQs = category ? `&category=${category}` : '';
  const [upcoming, past] = await Promise.all([
    serverGet<{ items: EventItem[] }>(`/events?when=upcoming${catQs}`, { items: [] }),
    serverGet<{ items: EventItem[] }>(`/events?when=past${catQs}`, { items: [] }),
  ]);

  const featured = upcoming.items.find((e) => e.isFeatured) ?? upcoming.items[0];
  const rest = upcoming.items.filter((e) => e.id !== featured?.id);

  return (
    <div className="container space-y-10 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader kicker="Agenda de la carrera" title="Eventos, CTF y talleres" />
        <EventManagementShortcut />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/eventos"
          className={cn(
            'rounded-full border px-4 py-1.5 text-xs font-semibold transition',
            !category ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary',
          )}
        >
          Todos
        </Link>
        {Object.entries(EVENT_CATEGORIES).map(([key, label]) => (
          <Link
            key={key}
            href={`/eventos?categoria=${key}`}
            className={cn(
              'rounded-full border px-4 py-1.5 text-xs font-semibold transition',
              category === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary',
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Evento principal con cuenta regresiva */}
      {featured && (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-hero via-hero to-hero-end text-white shadow-xl">
          <div className="grid-bg absolute inset-0 opacity-40" />
          <div className="relative grid gap-8 p-7 md:p-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-4">
              <Badge className="border border-cyan-400/40 bg-cyan-400/15 text-cyan-300">Evento principal · {EVENT_CATEGORIES[featured.category] ?? featured.category}</Badge>
              <h2 className="font-serif-heading text-3xl font-bold leading-tight">{featured.title}</h2>
              <p className="max-w-xl text-sm leading-relaxed text-white/80 line-clamp-3">{featured.description}</p>
              <div className="flex flex-wrap gap-4 text-sm text-white/85">
                <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-cyan-400" /> {formatDate(featured.startsAt, true)}</span>
                <span className="flex items-center gap-1.5">
                  {featured.isOnline ? <Video className="h-4 w-4 text-cyan-400" /> : <MapPin className="h-4 w-4 text-cyan-400" />}
                  {featured.isOnline ? 'En línea' : featured.location}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link href={`/eventos/${featured.slug}`} className={buttonVariants({ variant: 'accent' })}>Ver detalle e inscribirme <ArrowRight /></Link>
                {featured.rulesUrl && (
                  <ExternalResourceLink href={featured.rulesUrl} className={cn(buttonVariants(), 'border border-white/25 bg-white/10 text-white hover:bg-white/20')}>
                    <Download /> Bases del evento
                  </ExternalResourceLink>
                )}
                <EventRegistrationIndicator eventId={featured.id} category={category} />
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 lg:items-end">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300">Cuenta regresiva</span>
              <Countdown target={featured.startsAt} />
              <span className="text-xs text-white/60">{featured._count?.registrations ?? 0} inscritos · <PointReward reason="INSCRIPCION_EVENTO" suffix="pts por inscribirte" /></span>
            </div>
          </div>
        </div>
      )}

      {/* Próximos */}
      <section className="space-y-5">
        <h2 className="font-serif-heading text-xl font-bold text-primary">Próximos eventos</h2>
        {rest.length === 0 && !featured ? (
          <EmptyState title="No hay eventos próximos en esta categoría" />
        ) : (
          <RegisteredEventGrid initialItems={rest} when="upcoming" category={category} excludeId={featured?.id} />
        )}
      </section>

      {/* Pasados */}
      {past.items.length > 0 && (
        <section className="space-y-5">
          <h2 className="font-serif-heading text-xl font-bold text-muted-foreground">Eventos pasados</h2>
          <RegisteredEventGrid initialItems={past.items.slice(0, 6)} when="past" category={category} maxItems={6} />
        </section>
      )}
    </div>
  );
}
