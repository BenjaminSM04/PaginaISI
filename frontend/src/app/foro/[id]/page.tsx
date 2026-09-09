'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronUp, Eye, Loader2, RefreshCw, Send } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Answer, MediaAssetLite, Question } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { TagList } from '@/components/shared';
import { ReportButton } from '@/components/actions';
import { cn, timeAgo } from '@/lib/utils';
import { ForumImagePicker, uploadForumImages } from '@/components/forum-inputs';
import { BackButton } from '@/components/back-button';
import { PointReward } from '@/components/point-reward';

function QuestionNotFoundState() {
  return (
    <div className="container flex min-h-[50vh] max-w-2xl items-center justify-center py-12 text-center">
      <section className="w-full rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Pregunta no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">Puede que haya sido eliminada o que el enlace sea incorrecto.</p>
        <Link href="/foro" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Volver al foro
        </Link>
      </section>
    </div>
  );
}

function VoteBox({
  score,
  myVote,
  onVote,
  disabled,
  compact,
}: {
  score: number;
  myVote: number;
  onVote: (value: 1 | -1) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex shrink-0 flex-col items-center gap-1', compact ? 'w-10' : 'w-12')}>
      <button
        onClick={() => onVote(1)}
        disabled={disabled}
        title="Voto positivo"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-40',
          myVote === 1 ? 'border-accent bg-accent/15 text-accent' : 'border-border hover:border-accent hover:text-accent',
        )}
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <span className={cn('font-bold tabular-nums', score > 0 ? 'text-accent' : score < 0 ? 'text-danger' : 'text-muted-foreground')}>
        {score}
      </span>
      <button
        onClick={() => onVote(-1)}
        disabled={disabled}
        title="Voto negativo"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-40',
          myVote === -1 ? 'border-danger bg-danger/15 text-danger' : 'border-border hover:border-danger hover:text-danger',
        )}
      >
        <ChevronDown className="h-5 w-5" />
      </button>
    </div>
  );
}

function ForumImages({ images, label }: { images?: MediaAssetLite[]; label: string }) {
  if (!images?.length) return null;
  return (
    <div className={cn('grid gap-3', images.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
      {images.map((image, index) => (
        <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border bg-secondary">
          <img
            src={image.url}
            alt={`${label} ${index + 1}`}
            loading="lazy"
            className="max-h-[460px] w-full object-contain transition hover:scale-[1.01]"
          />
        </a>
      ))}
    </div>
  );
}

export default function PreguntaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [answerBody, setAnswerBody] = useState('');
  const [answerImages, setAnswerImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    data: question,
    error: queryError,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['question', id],
    queryFn: () => api.get<Question>(`/forum/questions/${id}`),
    retry: (failureCount, cause) => !(cause instanceof ApiError && cause.status === 404) && failureCount < 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['question', id] });

  const voteMutation = useMutation({
    mutationFn: ({ type, targetId, value }: { type: 'questions' | 'answers'; targetId: string; value: 1 | -1 }) =>
      api.post(`/forum/${type}/${targetId}/vote`, { value }),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.message),
  });

  const answerMutation = useMutation({
    mutationFn: async ({ body, files }: { body: string; files: File[] }) => {
      const uploaded = await uploadForumImages(files);
      return api.post(`/forum/questions/${id}/answers`, { body, imageIds: uploaded.map((image) => image.id) });
    },
    onSuccess: () => {
      setAnswerBody('');
      setAnswerImages([]);
      invalidate();
    },
    onError: (e: any) => setError(e.message),
  });

  const acceptMutation = useMutation({
    mutationFn: (answerId: string) => api.post(`/forum/questions/${id}/accept/${answerId}`),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.message),
  });

  if (isLoading) {
    return (
      <div role="status" className="flex min-h-[50vh] items-center justify-center">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Cargando pregunta</span>
      </div>
    );
  }

  const missing = (queryError instanceof ApiError && queryError.status === 404) || (!isError && !question);
  if (missing) {
    return <QuestionNotFoundState />;
  }

  if (isError) {
    return (
      <div className="container flex min-h-[50vh] max-w-2xl items-center justify-center py-12">
        <section role="alert" aria-labelledby="question-error-title" className="w-full rounded-2xl border border-danger/30 bg-card p-8 text-center shadow-sm">
          <AlertTriangle aria-hidden="true" className="mx-auto h-9 w-9 text-danger" />
          <h1 id="question-error-title" className="mt-4 font-serif-heading text-2xl font-bold text-primary">No pudimos cargar la pregunta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {queryError instanceof Error ? queryError.message : 'Comprueba tu conexión e inténtalo nuevamente.'}
          </p>
          <Button type="button" className="mt-5" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            Reintentar
          </Button>
        </section>
      </div>
    );
  }

  if (!question) return <QuestionNotFoundState />;

  const vote = (type: 'questions' | 'answers', targetId: string, value: 1 | -1) => {
    setError(null);
    if (!user) return router.push('/login');
    voteMutation.mutate({ type, targetId, value });
  };

  const isAsker = user?.username === question.author?.username;
  const myVotes = question.myVotes ?? {};
  const answers = [...(question.answers ?? [])].sort((left, right) => Number(right.isAccepted) - Number(left.isAccepted));

  const markBestAnswer = (answerId: string) => {
    const changing = Boolean(question.acceptedAnswerId && question.acceptedAnswerId !== answerId);
    const confirmed = window.confirm(
      changing
        ? '¿Cambiar la mejor respuesta? La selección y la recompensa anterior se reasignarán.'
        : '¿Marcar esta como la respuesta que más te sirvió?',
    );
    if (confirmed) acceptMutation.mutate(answerId);
  };

  return (
    <div className="container max-w-4xl space-y-6 py-10">
      <BackButton fallbackHref="/foro" label="Volver al foro" variant="ghost" />

      {/* Pregunta */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex gap-5">
          <VoteBox
            score={question.votesScore}
            myVote={myVotes[`QUESTION:${question.id}`] ?? 0}
            onVote={(v) => vote('questions', question.id, v)}
            disabled={isAsker}
          />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-serif-heading text-2xl font-bold leading-tight text-primary">{question.title}</h1>
              {question.acceptedAnswerId && (
                <Badge variant="success" className="shrink-0"><CheckCircle2 className="h-3 w-3" /> Resuelta</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {question.viewsCount} vistas</span>
              <span>· {timeAgo(question.createdAt)}</span>
              {question.subject && <Badge variant="outline">{question.subject}</Badge>}
              {question.semester && <Badge variant="outline">{question.semester}º semestre</Badge>}
            </div>
            <div className="space-y-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{question.body}</div>
            <ForumImages images={question.images} label="Imagen adjunta a la pregunta" />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <TagList tags={question.tags} max={5} />
              <div className="flex items-center gap-3">
                <ReportButton targetType="QUESTION" targetId={question.id} />
                <Link href={`/perfil/${question.author?.username}`} className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-1.5 transition hover:bg-secondary">
                  <Avatar src={question.author?.profile?.avatarUrl} name={question.author?.profile?.fullName} className="h-7 w-7 text-[9px]" />
                  <div className="text-xs">
                    <div className="font-bold">{question.author?.profile?.fullName}</div>
                    <div className="text-muted-foreground">{question.author?.profile?.totalPoints ?? 0} pts</div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {/* Respuestas */}
      <h2 className="font-serif-heading text-xl font-bold text-primary">
        {question.answers?.length ?? 0} Respuesta{(question.answers?.length ?? 0) !== 1 ? 's' : ''}
      </h2>

      <div className="space-y-4">
        {answers.map((answer: Answer) => {
          const mine = user?.username === answer.author?.username;
          return (
            <div
              key={answer.id}
              className={cn(
                'rounded-xl border bg-card p-5 shadow-sm',
                answer.isAccepted ? 'border-success/50 ring-1 ring-success/30' : 'border-border',
              )}
            >
              {answer.isAccepted && (
                <div className="mb-3 flex items-center gap-2 text-xs font-bold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Mejor respuesta elegida por quien preguntó
                </div>
              )}
              <div className="flex gap-4">
                <VoteBox
                  compact
                  score={answer.votesScore}
                  myVote={myVotes[`ANSWER:${answer.id}`] ?? 0}
                  onVote={(v) => vote('answers', answer.id, v)}
                  disabled={mine}
                />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{answer.body}</div>
                  <ForumImages images={answer.images} label="Imagen adjunta a la respuesta" />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <div className="flex items-center gap-3">
                      {isAsker && !answer.isAccepted && !mine && (
                        <Button size="sm" variant="outline" onClick={() => markBestAnswer(answer.id)} disabled={acceptMutation.isPending}>
                          <Check className="text-success" /> Marcar como mejor respuesta
                        </Button>
                      )}
                      <ReportButton targetType="ANSWER" targetId={answer.id} />
                    </div>
                    <Link href={`/perfil/${answer.author?.username}`} className="flex items-center gap-2 text-xs">
                      <Avatar src={answer.author?.profile?.avatarUrl} name={answer.author?.profile?.fullName} className="h-6 w-6 text-[8px]" />
                      <span className="font-bold">{answer.author?.profile?.fullName}</span>
                      <span className="text-muted-foreground">· {timeAgo(answer.createdAt)}</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Responder */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="font-serif-heading text-lg font-bold text-primary">Tu respuesta <PointReward reason="RESPUESTA_PUBLICADA" className="text-sm font-normal text-success" parentheses /></h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!user) return router.push('/login');
            if (answerBody.trim().length >= 10) answerMutation.mutate({ body: answerBody, files: answerImages });
          }}
          className="mt-3 space-y-3"
        >
          <Textarea
            rows={5}
            value={answerBody}
            onChange={(e) => setAnswerBody(e.target.value)}
            placeholder={user ? 'Comparte tu solución con detalle. Puedes pegar código y enlaces a capturas…' : 'Inicia sesión para responder'}
            disabled={!user || answerMutation.isPending}
          />
          {user && <ForumImagePicker value={answerImages} onChange={setAnswerImages} disabled={answerMutation.isPending} />}
          <Button type="submit" disabled={!user || answerMutation.isPending || answerBody.trim().length < 10}>
            {answerMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />} Publicar respuesta
          </Button>
        </form>
      </div>
    </div>
  );
}
