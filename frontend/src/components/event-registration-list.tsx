'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { EventItem } from '@/lib/types';
import { EventCard } from '@/components/cards';

type EventListResponse = {
  items: EventItem[];
  myRegistrations?: string[];
};

function useEventList(when: 'upcoming' | 'past', category?: string) {
  const { user } = useAuth();
  const query = new URLSearchParams({ when });
  if (category) query.set('category', category);
  return useQuery({
    queryKey: ['events', 'registration-status', when, category ?? 'all', user?.id ?? 'anonymous'],
    queryFn: () => api.get<EventListResponse>(`/events?${query.toString()}`),
    enabled: Boolean(user),
    staleTime: 30_000,
  });
}

export function EventRegistrationIndicator({
  eventId,
  category,
}: {
  eventId: string;
  category?: string;
}) {
  const { user } = useAuth();
  const query = useEventList('upcoming', category);
  if (!user) return null;
  if (query.isLoading) {
    return <span role="status" className="inline-flex items-center gap-1 text-xs text-white/70"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando inscripción…</span>;
  }
  if (!query.data?.myRegistrations?.includes(eventId)) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200">
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Inscrito
    </span>
  );
}

export function RegisteredEventGrid({
  initialItems,
  when,
  category,
  excludeId,
  maxItems,
}: {
  initialItems: EventItem[];
  when: 'upcoming' | 'past';
  category?: string;
  excludeId?: string;
  maxItems?: number;
}) {
  const { user } = useAuth();
  const query = useEventList(when, category);
  const items = (query.data?.items ?? initialItems)
    .filter((event) => event.id !== excludeId)
    .slice(0, maxItems);
  const registered = new Set(query.data?.myRegistrations ?? []);

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          registered={Boolean(user) && registered.has(event.id)}
        />
      ))}
    </div>
  );
}
