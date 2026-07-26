'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ExternalResourceLink } from '@/components/external-resource-link';

interface EventAccess {
  registered?: boolean;
  meetingUrl?: string | null;
}

export function EventMeetingLink({ slug, initialUrl }: { slug: string; initialUrl?: string | null }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['event-access', slug, user?.id ?? 'guest'],
    queryFn: () => api.get<EventAccess>(`/events/${slug}`),
    enabled: !!user,
    retry: false,
  });
  if (!user) return <p className="rounded-lg bg-secondary px-3 py-2 text-center text-xs text-muted-foreground">Inicia sesión e inscríbete para acceder al enlace.</p>;
  if (isLoading) return <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>;
  const meetingUrl = data?.meetingUrl ?? initialUrl;
  if (meetingUrl) {
    return (
      <ExternalResourceLink href={meetingUrl} className="flex items-center justify-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-sm font-semibold text-indigo-500 transition hover:bg-indigo-500/20">
        <Video className="h-4 w-4" /> Entrar a la reunión <ExternalLink className="h-3.5 w-3.5" />
      </ExternalResourceLink>
    );
  }
  return <p className="rounded-lg bg-secondary px-3 py-2 text-center text-xs text-muted-foreground">{data?.registered ? 'El organizador todavía no publicó el enlace.' : 'El enlace se habilita al confirmar tu inscripción.'}</p>;
}
