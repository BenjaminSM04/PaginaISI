'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareWarning, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { IdeaProposal } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/input';

type Decision = 'APPROVED' | 'OBSERVED' | 'REJECTED';

export function IdeaReviewActions({
  idea,
  onReviewed,
}: {
  idea: IdeaProposal;
  onReviewed?: (idea: IdeaProposal) => void | Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = async (nextDecision: Decision) => {
    const cleanComment = comment.trim();
    if (nextDecision !== 'APPROVED' && !cleanComment) {
      setError('Explica el motivo antes de observar o rechazar.');
      return;
    }
    const verb = nextDecision === 'APPROVED' ? 'aprobar' : nextDecision === 'OBSERVED' ? 'observar' : 'rechazar';
    if (!window.confirm(`¿Confirmas que deseas ${verb} la idea “${idea.title}”?`)) return;
    setDecision(nextDecision);
    setError(null);
    try {
      const updated = await api.post<IdeaProposal>(`/ideas/${idea.id}/review`, {
        decision: nextDecision,
        comment: cleanComment || undefined,
      });
      await onReviewed?.(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la revisión.');
    } finally {
      setDecision(null);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div>
        <h2 className="font-serif-heading text-lg font-bold text-primary">Decisión docente</h2>
        <p className="mt-1 text-xs text-muted-foreground">La decisión se audita y se notificará a la persona postulante.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`idea-review-${idea.id}`}>Comentario de revisión</Label>
        <Textarea
          id={`idea-review-${idea.id}`}
          rows={4}
          maxLength={1_000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Obligatorio al observar o rechazar; opcional al aprobar."
        />
        <p className="text-right text-[11px] text-muted-foreground">{comment.length}/1000</p>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={Boolean(decision)} onClick={() => void review('OBSERVED')}>
          {decision === 'OBSERVED' ? <Loader2 className="animate-spin" /> : <MessageSquareWarning />} Observar
        </Button>
        <Button type="button" variant="destructive" disabled={Boolean(decision)} onClick={() => void review('REJECTED')}>
          {decision === 'REJECTED' ? <Loader2 className="animate-spin" /> : <XCircle />} Rechazar
        </Button>
        <Button type="button" className="sm:ml-auto" disabled={Boolean(decision)} onClick={() => void review('APPROVED')}>
          {decision === 'APPROVED' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Aprobar
        </Button>
      </div>
    </section>
  );
}
