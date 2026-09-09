'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, BookCheck, CalendarCheck, Check, CheckCheck, ChevronLeft, ChevronRight,
  GraduationCap, Loader2, MessageSquareReply, RefreshCw, Settings,
} from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { api } from '@/lib/api';
import type {
  NotificationItem, NotificationPreferences, NotificationsPage, NotificationType,
} from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';

type View = 'all' | 'unread' | 'preferences';

const VIEWS = [
  { id: 'all' as const, label: 'Todas', icon: Bell, panelId: 'notification-panel-all' },
  { id: 'unread' as const, label: 'No leídas', icon: Check, panelId: 'notification-panel-unread' },
  { id: 'preferences' as const, label: 'Preferencias', icon: Settings, panelId: 'notification-panel-preferences' },
];

const ICONS: Record<NotificationType, typeof Bell> = {
  CONTENT_REVIEW: BookCheck,
  FORUM_ANSWER: MessageSquareReply,
  FORUM_ACCEPTED: CheckCheck,
  EVENT_REGISTRATION: CalendarCheck,
  MENTORSHIP_ENROLLMENT: GraduationCap,
  SYSTEM: Bell,
};

const ICON_STYLES: Record<NotificationType, string> = {
  CONTENT_REVIEW: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  FORUM_ANSWER: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  FORUM_ACCEPTED: 'bg-success/10 text-success',
  EVENT_REGISTRATION: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  MENTORSHIP_ENROLLMENT: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  SYSTEM: 'bg-primary/10 text-primary',
};

function NotificationRow({
  item,
  pending,
  onOpen,
}: {
  item: NotificationItem;
  pending: boolean;
  onOpen: (item: NotificationItem) => void;
}) {
  const Icon = ICONS[item.type] ?? Bell;
  const unread = !item.readAt;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      disabled={pending}
      className={cn(
        'group flex w-full items-start gap-3 border-b border-border px-4 py-4 text-left transition last:border-b-0 hover:bg-secondary/55 disabled:opacity-70 sm:px-5',
        unread && 'bg-primary/[0.035]',
      )}
    >
      <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ICON_STYLES[item.type])}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <span className={cn('text-sm', unread ? 'font-bold text-foreground' : 'font-semibold text-foreground/80')}>
            {item.title}
          </span>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{timeAgo(item.createdAt)}</span>
        </span>
        {item.body && <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{item.body}</span>}
        {item.href && <span className="mt-1.5 block text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">Abrir detalle →</span>}
      </span>
      {unread && <span aria-label="No leída" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}
    </button>
  );
}

const PREFERENCE_ROWS: Array<{
  key: keyof Omit<NotificationPreferences, 'updatedAt'>;
  title: string;
  description: string;
}> = [
  { key: 'contentReview', title: 'Revisión de publicaciones', description: 'Resultados y observaciones de proyectos y artículos.' },
  { key: 'forumActivity', title: 'Actividad del foro', description: 'Nuevas respuestas y respuestas aceptadas.' },
  { key: 'eventRegistrations', title: 'Inscripciones a eventos', description: 'Confirmaciones y nuevas inscripciones en tus eventos.' },
  { key: 'mentorships', title: 'Mentorías', description: 'Confirmaciones y nuevas personas inscritas en tus mentorías.' },
];

function PreferencesPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => api.get<NotificationPreferences>('/notifications/preferences'),
  });
  const mutation = useMutation({
    mutationFn: (values: Partial<NotificationPreferences>) => api.patch<NotificationPreferences>('/notifications/preferences', values),
    onSuccess: (data) => queryClient.setQueryData(['notifications', 'preferences'], data),
  });

  if (query.isLoading) return <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">No se pudieron cargar tus preferencias.</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw /> Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {PREFERENCE_ROWS.map((row) => {
        const enabled = query.data[row.key];
        const isPending = mutation.isPending && mutation.variables?.[row.key] !== undefined;
        return (
          <div key={row.key} className="flex items-center justify-between gap-5 border-b border-border px-4 py-4 last:border-0 sm:px-5">
            <div>
              <p className="text-sm font-bold">{row.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{row.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${enabled ? 'Desactivar' : 'Activar'} ${row.title}`}
              disabled={isPending}
              onClick={() => mutation.mutate({ [row.key]: !enabled })}
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                enabled ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
            >
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>
        );
      })}
      {mutation.isError && <p role="alert" className="border-t border-destructive/20 bg-destructive/5 px-5 py-3 text-xs text-destructive">No se pudo guardar el cambio. Inténtalo nuevamente.</p>}
    </div>
  );
}

function NotificationsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('all');
  const [page, setPage] = useState(1);
  const filter = view === 'unread' ? 'unread' : 'all';
  const list = useQuery({
    queryKey: ['notifications', 'list', filter, page],
    queryFn: () => api.get<NotificationsPage>(`/notifications?page=${page}&limit=15&filter=${filter}`),
    enabled: view !== 'preferences',
  });
  const markRead = useMutation({
    mutationFn: (item: NotificationItem) => item.readAt ? Promise.resolve(item) : api.patch(`/notifications/${item.id}/read`),
    onSuccess: (_data, item) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (item.href) router.push(item.href);
    },
  });
  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const changeView = (next: View) => {
    setView(next);
    setPage(1);
  };

  return (
    <div className="container max-w-4xl space-y-7 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="section-kicker">Tu actividad</span>
          <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Notificaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">Novedades relevantes de tus publicaciones, foro e inscripciones.</p>
        </div>
        {view !== 'preferences' && (list.data?.unreadCount ?? 0) > 0 && (
          <Button size="sm" variant="outline" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
            {markAll.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />} Marcar todas como leídas
          </Button>
        )}
      </div>

      <SegmentedTabs items={VIEWS} value={view} onValueChange={changeView} ariaLabel="Vistas de notificaciones" idPrefix="notification-view" />

      {view === 'preferences' ? (
        <section id="notification-panel-preferences" role="tabpanel" aria-labelledby="notification-view-tab-preferences">
          <PreferencesPanel />
        </section>
      ) : (
        <section
          id={`notification-panel-${view}`}
          role="tabpanel"
          aria-labelledby={`notification-view-tab-${view}`}
          className="space-y-4"
        >
          {list.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>}
          {list.isError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-7 text-center">
              <p className="text-sm font-semibold text-destructive">No se pudieron cargar tus notificaciones.</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => list.refetch()}><RefreshCw /> Reintentar</Button>
            </div>
          )}
          {list.data && list.data.items.length === 0 && (
            <EmptyState
              title={view === 'unread' ? 'Estás al día' : 'Todavía no tienes notificaciones'}
              subtitle={view === 'unread' ? 'No quedan novedades pendientes de lectura.' : 'Las novedades importantes aparecerán aquí.'}
            />
          )}
          {list.data && list.data.items.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {list.data.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  pending={markRead.isPending && markRead.variables?.id === item.id}
                  onOpen={(selected) => markRead.mutate(selected)}
                />
              ))}
            </div>
          )}
          {list.data && list.data.pages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Página {list.data.page} de {list.data.pages} · {list.data.total} notificaciones</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft /> Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= list.data.pages} onClick={() => setPage((current) => current + 1)}>Siguiente <ChevronRight /></Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return <RequireAuth><NotificationsContent /></RequireAuth>;
}
