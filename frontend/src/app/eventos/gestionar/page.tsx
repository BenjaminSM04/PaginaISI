'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, CalendarDays, CalendarPlus, Eye, Loader2, MapPin, Pencil, Users, Video,
} from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { Community, EventItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn, EVENT_CATEGORIES, formatDate } from '@/lib/utils';

interface EventsResponse {
  items: EventItem[];
  myRegistrations: string[];
}

function EventManagementContent() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['events', 'management'],
    queryFn: async () => {
      const [upcoming, past, communities] = await Promise.all([
        api.get<EventsResponse>('/events?when=upcoming'),
        api.get<EventsResponse>('/events?when=past'),
        api.get<Community[]>('/communities/management/mine'),
      ]);
      const unique = new Map<string, EventItem>();
      [...upcoming.items, ...past.items].forEach((event) => unique.set(event.id, event));
      return { events: [...unique.values()], communities };
    },
    retry: false,
  });

  const isAdmin = !!user?.roles.includes('ADMIN');
  const managedCommunitySlugs = new Set((query.data?.communities ?? []).map((community) => community.slug));
  const manageable = (query.data?.events ?? [])
    .filter((event) => (
      isAdmin
      || event.organizer?.username === user?.username
      || (!!event.community?.slug && managedCommunitySlugs.has(event.community.slug))
    ))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const upcoming = manageable.filter((event) => !event.isPast);
  const past = manageable.filter((event) => event.isPast).reverse();

  const renderEvent = (event: EventItem) => (
    <article key={event.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Badge variant="accent">{EVENT_CATEGORIES[event.category] ?? event.category}</Badge>
          <span className="text-xs font-semibold text-muted-foreground">{event._count?.registrations ?? 0} inscritos</span>
        </div>
        <div>
          <h2 className="font-serif-heading text-xl font-bold leading-snug text-primary">{event.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="h-4 w-4 text-accent" />{formatDate(event.startsAt, true)}</span>
          <span className="flex items-center gap-1.5">
            {event.isOnline ? <Video aria-hidden="true" className="h-4 w-4 text-accent" /> : <MapPin aria-hidden="true" className="h-4 w-4 text-accent" />}
            {event.isOnline ? 'En línea' : event.location ?? 'Lugar por confirmar'}
          </span>
          {event.community && <span className="flex items-center gap-1.5"><Users aria-hidden="true" className="h-4 w-4 text-accent" />{event.community.name}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Link href={`/eventos/${event.slug}`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
          <Eye aria-hidden="true" /> Ver evento
        </Link>
        <Link href={`/eventos/${event.slug}/editar`} className={cn(buttonVariants({ size: 'sm' }))}>
          <Pencil aria-hidden="true" /> Editar y gestionar
        </Link>
      </div>
    </article>
  );

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/eventos" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Volver a la agenda
          </Link>
          <span className="section-kicker block">Panel operativo</span>
          <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Gestión de eventos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Edita tus eventos publicados o los de las comunidades que administras. Desde cada evento también puedes gestionar galería y asistencia.
          </p>
        </div>
        <Link href="/eventos/nuevo" className={cn(buttonVariants({ variant: 'accent' }))}>
          <CalendarPlus aria-hidden="true" /> Crear evento
        </Link>
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-xs text-sky-700 dark:text-sky-300">
        Este panel muestra eventos visibles en la agenda. Si un contenido fue eliminado o aún no es público, no aparecerá en esta lista.
      </div>

      {query.isLoading && (
        <div role="status" className="flex justify-center rounded-xl border border-border py-16">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
          <span className="sr-only">Cargando eventos administrables</span>
        </div>
      )}

      {query.isError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">No pudimos cargar tus eventos.</p>
              <p className="mt-1">Comprueba que el servidor esté disponible y vuelve a intentarlo.</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </div>
          </div>
        </div>
      )}

      {query.isSuccess && manageable.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <CalendarDays aria-hidden="true" className="mb-3 h-9 w-9 text-muted-foreground" />
          <p className="font-semibold">Aún no tienes eventos para gestionar</p>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">Crea el primer evento o solicita que te asignen como responsable de la comunidad organizadora.</p>
          <Link href="/eventos/nuevo" className={cn('mt-5', buttonVariants({ variant: 'accent' }))}>Crear mi primer evento</Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-4" aria-labelledby="managed-upcoming-title">
          <h2 id="managed-upcoming-title" className="font-serif-heading text-2xl font-bold text-primary">Próximos y en curso</h2>
          <div className="grid gap-5 lg:grid-cols-2">{upcoming.map(renderEvent)}</div>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-4" aria-labelledby="managed-past-title">
          <h2 id="managed-past-title" className="font-serif-heading text-2xl font-bold text-primary">Eventos pasados</h2>
          <div className="grid gap-5 lg:grid-cols-2">{past.map(renderEvent)}</div>
        </section>
      )}
    </div>
  );
}

export default function EventManagementPage() {
  return (
    <RequireAuth roles={['ADMIN', 'COMMUNITY_LEADER', 'TEACHER']}>
      <EventManagementContent />
    </RequireAuth>
  );
}
