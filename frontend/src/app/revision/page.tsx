'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronUp, Eye, ExternalLink, FileText, Github, Loader2, Rocket, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Project } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { formatDate } from '@/lib/utils';
import { ExternalResourceLink } from '@/components/external-resource-link';
import { ProjectDetailView } from '@/components/project-detail-view';
import { PointReward } from '@/components/point-reward';

const REVIEW_TABS = [
  { id: 'projects' as const, label: 'Proyectos', icon: Rocket, panelId: 'review-content-panel' },
  { id: 'articles' as const, label: 'Artículos', icon: FileText, panelId: 'review-content-panel' },
];

function ReviewList({ kind }: { kind: 'projects' | 'articles' }) {
  const queryClient = useQueryClient();
  const pendingQuery = useQuery({
    queryKey: ['pending', kind],
    queryFn: () => api.get<any[]>(`/${kind}/review/pending`),
    retry: false,
  });
  const { data, isLoading, isError } = pendingQuery;
  const [comments, setComments] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewQuery = useQuery({
    queryKey: ['project-review-preview', previewId],
    queryFn: () => api.get<Project>(`/projects/${previewId}/review-preview`),
    enabled: kind === 'projects' && !!previewId,
    retry: false,
  });

  const review = useMutation({
    mutationFn: ({ id, decision, expectedVersion }: { id: string; decision: string; expectedVersion?: number }) =>
      api.post(`/${kind}/${id}/review`, {
        decision,
        comment: comments[id] || undefined,
        ...(kind === 'projects' ? { expectedVersion } : {}),
      }),
    onSuccess: (_, variables) => {
      setError(null);
      setPreviewId(null);
      setComments((current) => ({ ...current, [variables.id]: '' }));
      return queryClient.invalidateQueries({ queryKey: ['pending', kind] });
    },
    onError: (e: any) => setError(e.message),
  });

  if (isLoading) return <div role="status" className="flex justify-center py-10"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" /><span className="sr-only">Cargando contenidos pendientes</span></div>;

  if (isError) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
        <div className="flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">No pudimos cargar la bandeja de revisión.</p>
            <p className="mt-1">Comprueba la conexión con el servidor y vuelve a intentarlo.</p>
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void pendingQuery.refetch()}>Reintentar</Button>
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'projects' && previewId) {
    const preview = previewQuery.data;
    return (
      <div className="space-y-5">
        <Button type="button" variant="outline" onClick={() => setPreviewId(null)}>
          <ArrowLeft /> Volver a la bandeja de revisión
        </Button>
        {previewQuery.isLoading && (
          <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" /> Preparando vista previa…
          </div>
        )}
        {previewQuery.isError && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
            <p className="font-bold">No se pudo cargar la versión sometida.</p>
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void previewQuery.refetch()}>Reintentar</Button>
          </div>
        )}
        {preview && (
          <ProjectDetailView
            project={preview}
            preview
            reviewActions={(
              <section className="space-y-3 rounded-xl border border-primary/30 bg-card p-5 shadow-sm" aria-label="Decisión de revisión">
                <h2 className="font-serif-heading text-lg font-bold text-primary">Decisión sobre esta versión</h2>
                <Textarea
                  rows={3}
                  aria-label="Comentario para el autor"
                  placeholder="Comentario obligatorio al observar o rechazar…"
                  value={comments[preview.id] ?? ''}
                  onChange={(event) => setComments((current) => ({ ...current, [preview.id]: event.target.value }))}
                />
                {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => review.mutate({ id: preview.id, decision: 'APPROVED', expectedVersion: preview.version })}
                    disabled={review.isPending}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Check /> Aprobar versión
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => review.mutate({ id: preview.id, decision: 'OBSERVED', expectedVersion: preview.version })}
                    disabled={review.isPending || !(comments[preview.id] ?? '').trim()}
                    className="border-amber-500/50 text-amber-700 dark:text-amber-300"
                  >
                    Observar / solicitar cambios
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => review.mutate({ id: preview.id, decision: 'REJECTED', expectedVersion: preview.version })}
                    disabled={review.isPending || !(comments[preview.id] ?? '').trim()}
                    className="border-red-500/50 text-red-600 dark:text-red-400"
                  >
                    <X /> Rechazar
                  </Button>
                </div>
              </section>
            )}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}
      {(data ?? []).map((item) => (
        <div key={item.id} className="space-y-3 rounded-xl border border-amber-500/30 bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-serif-heading text-lg font-bold text-primary">{item.title}</h3>
                <Badge variant="secondary">Pendiente</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.summary ?? item.abstract}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Por <strong>{item.owner?.profile?.fullName}</strong> (@{item.owner?.username})</span>
                <span>· {formatDate(item.createdAt)}</span>
                {item.subject && <span>· {item.subject}</span>}
                {item.area && <span>· {item.area}</span>}
                {item.reviewer && <span>· Asignado a: {item.reviewer.profile?.fullName}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {item.repoUrl && (
                  <ExternalResourceLink href={item.repoUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                    <Github className="h-3.5 w-3.5" /> Repositorio
                  </ExternalResourceLink>
                )}
                {item.demoUrl && (
                  <ExternalResourceLink href={item.demoUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> Demo
                  </ExternalResourceLink>
                )}
                {item.pdfUrl && (
                  <ExternalResourceLink href={item.pdfUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </ExternalResourceLink>
                )}
                {item.externalUrl && (
                  <ExternalResourceLink href={item.externalUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> Fuente externa
                  </ExternalResourceLink>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((current) => ({ ...current, [item.id]: !current[item.id] }))}
            aria-expanded={!!expanded[item.id]}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left text-xs font-bold text-primary transition hover:bg-secondary"
          >
            {expanded[item.id] ? 'Ocultar contenido completo' : 'Revisar contenido completo'}
            {expanded[item.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expanded[item.id] && (
            <div className="space-y-4 rounded-lg border border-border bg-background p-4 text-sm">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {kind === 'projects' ? 'Descripción completa' : 'Contenido extendido'}
                </h4>
                <div className="mt-2 whitespace-pre-line leading-relaxed">
                  {item.description ?? item.content ?? 'No se proporcionó contenido extendido.'}
                </div>
              </div>
              {item.impact && (
                <div><strong>Impacto o aporte:</strong> {item.impact}</div>
              )}
              {item.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag: string) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}
                </div>
              )}
              {item.technologies?.length > 0 && (
                <div><strong>Tecnologías:</strong> {item.technologies.map((tech: any) => tech.name).join(', ')}</div>
              )}
              {item.authors?.length > 0 && (
                <div>
                  <strong>Autores:</strong>{' '}
                  {item.authors.map((author: any) => author.user?.profile?.fullName ?? author.externalName).filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          )}
          <Textarea
            rows={2}
            placeholder="Comentario para el autor (obligatorio al observar o rechazar)…"
            value={comments[item.id] ?? ''}
            onChange={(e) => setComments((prev) => ({ ...prev, [item.id]: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
            {kind === 'projects' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPreviewId(item.id)}
                disabled={review.isPending}
              >
                <Eye /> Vista previa publicada
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => review.mutate({ id: item.id, decision: 'APPROVED', expectedVersion: kind === 'projects' ? item.version : undefined })}
              disabled={review.isPending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Check /> Aprobar <PointReward reason={kind === 'projects' ? 'PROYECTO_APROBADO' : 'ARTICULO_APROBADO'} suffix="pts al autor" parentheses />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => review.mutate({ id: item.id, decision: 'OBSERVED', expectedVersion: kind === 'projects' ? item.version : undefined })}
              disabled={review.isPending || !(comments[item.id] ?? '').trim()}
              className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
            >
              Observar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => review.mutate({ id: item.id, decision: 'REJECTED', expectedVersion: kind === 'projects' ? item.version : undefined })}
              disabled={review.isPending || !(comments[item.id] ?? '').trim()}
              className="border-red-500/50 text-red-500 hover:bg-red-500/10"
            >
              <X /> Rechazar
            </Button>
          </div>
        </div>
      ))}
      {(data?.length ?? 0) === 0 && (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No hay {kind === 'projects' ? 'proyectos' : 'artículos'} pendientes de revisión. 🎉
        </p>
      )}
    </div>
  );
}

function RevisionContent() {
  const [tab, setTab] = useState<'projects' | 'articles'>('projects');

  return (
    <div className="container max-w-6xl space-y-8 py-10">
      <div>
        <span className="section-kicker">Panel docente</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Revisión de contenidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aprueba, observa (devuelve con comentarios) o rechaza los envíos de estudiantes. Todo queda registrado en el historial de aprobaciones.
        </p>
      </div>

      <SegmentedTabs
        items={REVIEW_TABS}
        value={tab}
        onValueChange={setTab}
        ariaLabel="Tipos de contenido pendientes"
        idPrefix="review"
      />

      <section
        id="review-content-panel"
        role="tabpanel"
        aria-labelledby={`review-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none"
      >
        <ReviewList kind={tab} />
      </section>
    </div>
  );
}

export default function RevisionPage() {
  return (
    <RequireAuth roles={['TEACHER', 'ADMIN']}>
      <RevisionContent />
    </RequireAuth>
  );
}
