'use client';

import { AlertCircle, CheckCircle2, Clock3, History, XCircle } from 'lucide-react';
import { StatusBadge } from '@/components/shared';
import { cn, formatDate } from '@/lib/utils';

interface ApprovalEntry {
  id: string;
  decision?: 'APPROVED' | 'OBSERVED' | 'REJECTED' | null;
  comment?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  reviewer?: { username?: string; profile?: { fullName?: string } } | null;
}

const DECISION_LABELS = {
  APPROVED: 'Aprobado',
  OBSERVED: 'Observado',
  REJECTED: 'Rechazado',
} as const;

export function ReviewFeedback({ status, approvals = [] }: { status: string; approvals?: ApprovalEntry[] }) {
  const latestDecision = approvals.find((entry) => entry.decision);
  const Icon = status === 'APPROVED'
    ? CheckCircle2
    : status === 'REJECTED'
      ? XCircle
      : status === 'OBSERVED'
        ? AlertCircle
        : Clock3;

  return (
    <section className={cn(
      'space-y-3 rounded-xl border p-4',
      ['OBSERVED', 'REJECTED'].includes(status)
        ? 'border-warning/40 bg-warning/10'
        : 'border-border bg-secondary/40',
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-bold">Estado de revisión</h2>
        <StatusBadge status={status} />
      </div>

      {latestDecision?.comment ? (
        <div className="text-sm">
          <p className="font-semibold">Última devolución del docente</p>
          <p className="mt-1 whitespace-pre-line leading-relaxed">{latestDecision.comment}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {latestDecision.reviewer?.profile?.fullName ?? latestDecision.reviewer?.username ?? 'Docente revisor'}
            {' · '}{formatDate(latestDecision.decidedAt ?? latestDecision.createdAt, true)}
          </p>
        </div>
      ) : status === 'PENDING' ? (
        <p className="text-sm text-muted-foreground">El contenido está en la bandeja del docente y aún no tiene una decisión.</p>
      ) : null}

      {approvals.length > 1 && (
        <details className="text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-primary">
            <History className="h-4 w-4" /> Ver historial ({approvals.length})
          </summary>
          <div className="mt-3 space-y-2 border-l border-border pl-3">
            {approvals.map((entry) => (
              <div key={entry.id}>
                <p className="text-xs font-bold">
                  {entry.decision ? DECISION_LABELS[entry.decision] : 'Enviado a revisión'}
                  {' · '}{formatDate(entry.decidedAt ?? entry.createdAt, true)}
                </p>
                {entry.comment && <p className="mt-0.5 text-xs text-muted-foreground">{entry.comment}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
