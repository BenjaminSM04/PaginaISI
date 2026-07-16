'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { EventForm } from '@/components/event-form';
import { api } from '@/lib/api';
import type { EventItem } from '@/lib/types';

function EditarEventoContent() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['event-edit', slug],
    queryFn: () => api.get<EventItem>(`/events/${slug}`),
    enabled: !!slug,
    retry: false,
  });

  return (
    <div className="container max-w-3xl space-y-8 py-10">
      <div>
        <Link href={`/eventos/${slug}`} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Volver al evento
        </Link>
        <span className="section-kicker block">Gestión del evento</span>
        <h1 className="mt-1 flex items-center gap-2 font-serif-heading text-3xl font-bold text-primary"><Pencil /> Editar evento</h1>
      </div>
      {isLoading && <div className="flex justify-center rounded-xl border border-border py-16"><Loader2 className="animate-spin text-primary" /></div>}
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error instanceof Error ? error.message : 'No se pudo cargar el evento'}</p>}
      {data && <EventForm initial={data} />}
    </div>
  );
}

export default function EditarEventoPage() {
  return (
    <RequireAuth roles={['ADMIN', 'TEACHER', 'COMMUNITY_LEADER']}>
      <EditarEventoContent />
    </RequireAuth>
  );
}
