'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Flag, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import { PointReward } from '@/components/point-reward';

export default function AdminReportesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports', status],
    queryFn: () => api.get<any[]>(`/reports?status=${status}`),
  });

  const resolve = useMutation({
    mutationFn: ({ id, decision, penalize }: { id: string; decision: 'VALID' | 'DISMISSED'; penalize?: boolean }) =>
      api.patch(`/reports/${id}/resolve`, { status: decision, penalizeAuthor: penalize }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reports'] }),
    onError: (e: any) => setError(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Moderación de reportes</h1>
        <p className="text-sm text-muted-foreground">
          Reporte válido: <PointReward reason="REPORTE_VALIDO" suffix="pts al reportante" /> (con opción de penalizar al autor con{' '}
          <PointReward reason="PENALIZACION_SPAM" suffix="pts" />). Descartado: sin efectos.
        </p>
      </div>

      <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-secondary/60 p-1">
        {[
          { id: 'PENDING', label: 'Pendientes' },
          { id: 'VALID', label: 'Válidos' },
          { id: 'DISMISSED', label: 'Descartados' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setStatus(t.id)}
            className={cn(
              'rounded-lg px-4 py-2 text-xs font-semibold transition',
              status === t.id ? 'border border-border bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((r) => (
            <div key={r.id} className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-red-500" />
                  <Badge variant="outline">{r.targetType}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{r.targetId}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Reportado por @{r.reporter?.username} · {formatDate(r.createdAt, true)}
                </span>
              </div>
              <p className="rounded-lg bg-secondary/50 p-3 text-sm">{r.reason}</p>
              {r.resolutionNote && <p className="text-xs text-muted-foreground">Resolución: {r.resolutionNote}</p>}
              {r.status === 'PENDING' && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => resolve.mutate({ id: r.id, decision: 'VALID' })} disabled={resolve.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <Check /> Válido <PointReward reason="REPORTE_VALIDO" suffix="al reportante" parentheses />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: r.id, decision: 'VALID', penalize: true })} disabled={resolve.isPending} className="border-red-500/50 text-red-500 hover:bg-red-500/10">
                    Válido + penalizar autor <PointReward reason="PENALIZACION_SPAM" parentheses />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, decision: 'DISMISSED' })} disabled={resolve.isPending}>
                    <X /> Descartar
                  </Button>
                </div>
              )}
            </div>
          ))}
          {(data?.length ?? 0) === 0 && (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No hay reportes en este estado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
