'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, FileClock, Loader2, Search, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { ProjectAuditEntry } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AuditPage = {
  items: ProjectAuditEntry[];
  total: number;
  page: number;
  pages: number;
};

const ACTION_LABELS: Record<string, string> = {
  PROJECT_CREATED: 'Proyecto creado',
  PROJECT_UPDATED: 'Proyecto actualizado',
  PROJECT_ARCHIVED: 'Proyecto archivado',
  PROJECT_REVIEWED: 'Proyecto revisado',
  MEMBERS_UPDATED: 'Equipo actualizado',
  MILESTONE_CREATED: 'Hito creado',
  MILESTONE_UPDATED: 'Hito actualizado',
  MILESTONE_DELETED: 'Hito eliminado',
  GALLERY_ATTACHED: 'Imagen agregada',
  GALLERY_ARCHIVED: 'Imagen archivada',
  MEDIA_UPLOADED: 'Archivo subido',
  NEWS_CREATED: 'Noticia creada',
  NEWS_UPDATED: 'Noticia actualizada',
  NEWS_ARCHIVED: 'Noticia archivada',
  ROLLBACK: 'Rollback realizado',
  PROJECT_VERSION_SUBMITTED: 'Versión enviada a revisión',
  PROJECT_VERSION_OBSERVED: 'Versión observada',
  PROJECT_VERSION_REJECTED: 'Versión rechazada',
  PROJECT_VERSION_PUBLISHED: 'Versión publicada',
  COMMUNITY_CREATED: 'Comunidad creada',
  COMMUNITY_UPDATED: 'Comunidad actualizada',
  COMMUNITY_MEMBER_ADDED: 'Miembro agregado',
  COMMUNITY_MEMBER_UPDATED: 'Rol de miembro actualizado',
  COMMUNITY_MEMBER_REMOVED: 'Miembro retirado',
  EVENT_REGISTERED: 'Inscripción a evento',
  EVENT_UNREGISTERED: 'Cancelación de inscripción',
  FORUM_BEST_ANSWER_CHANGED: 'Mejor respuesta actualizada',
  BADGE_AWARDED: 'Insignia otorgada',
};

const actionLabel = (action: string) => ACTION_LABELS[action] ?? action.toLowerCase().replaceAll('_', ' ');

function DeliveryBadge({ delivery }: { delivery: ProjectAuditEntry['delivery'] }) {
  if (!delivery) return null;
  const labels = {
    PENDING: 'Aviso pendiente',
    PROCESSING: 'Enviando aviso',
    SENT: 'Alerta externa enviada',
    SKIPPED: 'Aviso interno enviado',
    FAILED: 'Falló la alerta',
  } as const;
  return (
    <span
      title={delivery.status === 'FAILED' && delivery.lastError ? delivery.lastError : undefined}
      className={delivery.status === 'FAILED'
        ? 'rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400'
        : 'rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground'}
    >
      {labels[delivery.status]}
    </span>
  );
}

export default function AdminProjectAuditPage() {
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'audit', search, page],
    queryFn: () => api.get<AuditPage>(`/admin/audit?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    retry: false,
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(draftSearch.trim());
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header>
        <span className="section-kicker">Seguridad y trazabilidad</span>
        <h1 className="mt-1 flex items-center gap-2 font-serif-heading text-2xl font-bold text-primary"><ShieldCheck className="h-6 w-6 text-orange-500" /> Auditoría del sistema</h1>
        <p className="mt-1 text-sm text-muted-foreground">Registro privado de acciones, identidades históricas y señales de riesgo. Los actores se resuelven en bloque y conservan sus snapshots.</p>
      </header>

      <form onSubmit={submitSearch} role="search" className="flex gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <label htmlFor="audit-search" className="sr-only">Buscar por proyecto, persona o correo</label>
        <Input id="audit-search" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Proyecto, usuario o correo…" />
        <Button type="submit"><Search /> Buscar</Button>
      </form>

      {isLoading && <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" /> Cargando auditoría…</div>}
      {isError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm">
          <p className="font-bold text-red-600 dark:text-red-400">No se pudo cargar el registro.</p>
          <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : 'Intenta nuevamente.'}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void refetch()}>Reintentar</Button>
        </div>
      )}

      {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><FileClock className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-bold text-primary">No hay registros para mostrar</h2><p className="mt-1 text-sm text-muted-foreground">Prueba con otra búsqueda o realiza una edición controlada.</p></div>
      )}

      {!isLoading && !isError && (data?.items.length ?? 0) > 0 && (
        <div className="space-y-3">
          {data!.items.map((entry) => {
            const email = entry.actorEmailSnapshot ?? entry.actorEmail ?? entry.actor?.email;
            const actor = entry.actorNameSnapshot ?? entry.actor?.profile?.fullName ?? entry.actorUsernameSnapshot ?? entry.actor?.username ?? 'Usuario eliminado';
            const actorId = entry.actorIdSnapshot ?? entry.actorId ?? entry.actorUserId ?? entry.actor?.id;
            const roles = entry.actorRolesSnapshot ?? entry.actor?.roles ?? [];
            const risks = entry.metadata?.security?.riskSignals ?? [];
            const ip = entry.metadata?.request?.ip ?? entry.ipAddress;
            const projectId = entry.project?.id ?? entry.projectId;
            return (
              <article key={entry.id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold">{entry.project?.title ?? entry.entityType ?? 'Sistema'}</h2>
                    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase">{actionLabel(entry.action)}</span>
                    {risks.length > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400"><AlertTriangle className="h-3 w-3" /> {risks.join(', ')}</span>}
                    <DeliveryBadge delivery={entry.delivery} />
                  </div>
                  <p className="text-sm">
                    <span className="font-semibold">{actor}</span>
                    {entry.actorDeleted && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">cuenta eliminada</span>}
                    {email && <> · <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a></>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {actorId ? `ID ${actorId}` : 'Actor del sistema'}
                    {roles.length ? ` · ${roles.join(', ')}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt, true)}{ip ? ` · IP ${ip}` : ''}{entry.entityType ? ` · ${entry.entityType}` : ''}</p>
                  {entry.summary && <p className="pt-1 text-sm text-foreground/80">{entry.summary}</p>}
                </div>
                {projectId && <Link href={`/proyectos/gestionar/${projectId}?tab=history`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>Ver historial</Link>}
              </article>
            );
          })}
        </div>
      )}

      {!isLoading && !isError && (data?.pages ?? 1) > 1 && (
        <nav aria-label="Paginación de auditoría" className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft /> Anterior</Button>
          <span>Página {data?.page ?? page} de {data?.pages}</span>
          <Button size="sm" variant="outline" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((value) => value + 1)}>Siguiente <ChevronRight /></Button>
        </nav>
      )}
    </div>
  );
}
