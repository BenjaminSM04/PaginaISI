'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Flag, Heart, Loader2, Send, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { cn, timeAgo } from '@/lib/utils';
import type { CommentItem } from '@/lib/types';

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}

function useMountedRef() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

function useScopedState<T>(scope: string, fallback: T) {
  const [state, setState] = useState<{ scope: string; value: T }>({ scope, value: fallback });
  const value = state.scope === scope ? state.value : fallback;
  const setValue = useCallback((next: T | ((current: T) => T)) => {
    setState((current) => {
      const currentValue = current.scope === scope ? current.value : fallback;
      return {
        scope,
        value: typeof next === 'function' ? (next as (current: T) => T)(currentValue) : next,
      };
    });
  }, [fallback, scope]);
  return [value, setValue] as const;
}

export function JoinCommunityButton({
  slug,
  initialJoined,
  memberUsernames,
}: {
  slug: string;
  initialJoined?: boolean;
  memberUsernames?: string[];
}) {
  const { user } = useAuth();
  const router = useRouter();
  const joinedFromProps = !!initialJoined || (!!user && !!memberUsernames?.includes(user.username));
  const [joined, setJoined] = useScopedState(`${slug}:${user?.username ?? 'anonymous'}:${joinedFromProps}`, joinedFromProps);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = async () => {
    if (!user) return router.push('/login');
    setBusy(true);
    setMsg(null);
    try {
      if (joined) {
        await api.post(`/communities/${slug}/leave`);
        setJoined(false);
      } else {
        const res = await api.post<{ pointsAwarded?: number }>(`/communities/${slug}/join`);
        setJoined(true);
        if (res.pointsAwarded) setMsg(`+${res.pointsAwarded} puntos de comunidad`);
      }
      router.refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button onClick={toggle} disabled={busy} variant={joined ? 'outline' : 'accent'}>
        {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
        {joined ? 'Salir de la comunidad' : 'Unirme a la comunidad'}
      </Button>
      {msg && <span className="text-xs font-semibold text-emerald-500">{msg}</span>}
    </div>
  );
}

export function EventRegisterButton({ slug, initialRegistered, isPast }: { slug: string; initialRegistered?: boolean; isPast?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const mounted = useMountedRef();
  const queryClient = useQueryClient();
  const registeredFromProps = !!initialRegistered;
  const registrationScope = `${slug}:${user?.id ?? 'anonymous'}:${isPast ? 'past' : 'active'}:${registeredFromProps}`;
  const [registered, setRegistered] = useScopedState(registrationScope, registeredFromProps);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useScopedState<string | null>(registrationScope, null);

  useEffect(() => {
    let cancelled = false;
    if (!user || isPast) return;

    void api
      .get<{ registered: boolean }>(`/events/${slug}`)
      .then((event) => {
        if (!cancelled) {
          setRegistered(!!event.registered);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageFrom(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [isPast, setError, setRegistered, slug, user]);

  if (isPast) return <Button variant="secondary" disabled>Evento finalizado</Button>;

  const toggle = async () => {
    if (!user) return router.push('/login');
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      if (registered) {
        await api.post(`/events/${slug}/unregister`);
        if (!mounted.current) return;
        setRegistered(false);
      } else {
        const res = await api.post<{ pointsAwarded?: number }>(`/events/${slug}/register`);
        if (!mounted.current) return;
        setRegistered(true);
        if (res.pointsAwarded) setMsg(`+${res.pointsAwarded} puntos por inscribirte`);
      }
      void queryClient.invalidateQueries({ queryKey: ['event-access', slug] });
      router.refresh();
    } catch (cause: unknown) {
      if (mounted.current) setError(messageFrom(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button onClick={toggle} disabled={busy} variant={registered ? 'outline' : 'accent'} size="lg">
        {busy ? <Loader2 className="animate-spin" /> : registered ? <CheckCircle2 /> : null}
        {registered ? 'Inscrito — cancelar inscripción' : 'Inscribirme al evento'}
      </Button>
      {msg && <span role="status" className="text-xs font-semibold text-emerald-500">{msg}</span>}
      {error && <span role="alert" className="text-xs font-semibold text-red-500">{error}</span>}
    </div>
  );
}

export function EnrollMentorshipButton({ slug, initialEnrolled }: { slug: string; initialEnrolled?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const mounted = useMountedRef();
  const enrolledFromProps = !!initialEnrolled;
  const enrollmentScope = `${slug}:${user?.id ?? 'anonymous'}:${enrolledFromProps}`;
  const [enrolled, setEnrolled] = useScopedState(enrollmentScope, enrolledFromProps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useScopedState<string | null>(enrollmentScope, null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;

    void api
      .get<{ enrolled: boolean }>(`/mentorships/${slug}`)
      .then((mentorship) => {
        if (!cancelled) {
          setEnrolled(!!mentorship.enrolled);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageFrom(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [setEnrolled, setError, slug, user]);

  const enroll = async () => {
    if (!user) return router.push('/login');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/mentorships/${slug}/enroll`);
      if (mounted.current) setEnrolled(true);
    } catch (cause: unknown) {
      if (mounted.current) setError(messageFrom(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button onClick={enroll} disabled={busy || enrolled} variant={enrolled ? 'outline' : 'accent'}>
        {busy ? <Loader2 className="animate-spin" /> : enrolled ? <CheckCircle2 /> : null}
        {enrolled ? 'Ya estás inscrito' : 'Inscribirme'}
      </Button>
      {error && <span role="alert" className="text-xs font-semibold text-red-500">{error}</span>}
    </div>
  );
}

export function LikeButton({
  type,
  id,
  initialLiked,
  initialCount,
  ownerUsername,
}: {
  type: 'projects' | 'articles' | 'news';
  id: string;
  initialLiked?: boolean;
  initialCount: number;
  ownerUsername?: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const mounted = useMountedRef();
  const likeScope = `${type}:${id}:${user?.id ?? 'anonymous'}:${!!initialLiked}:${initialCount}`;
  const [liked, setLiked] = useScopedState(likeScope, !!initialLiked);
  const [count, setCount] = useScopedState(likeScope, initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useScopedState<string | null>(likeScope, null);
  const isOwner = user && ownerUsername === user.username;

  useEffect(() => {
    let cancelled = false;
    if (!user) return;

    void api
      .get<{ liked: boolean; likesCount: number }>(`/${type}/${id}/like-status`)
      .then((status) => {
        if (cancelled) return;
        setLiked(!!status.liked);
        setCount(status.likesCount);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageFrom(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [id, setCount, setError, setLiked, type, user]);

  const toggle = async () => {
    if (!user) return router.push('/login');
    if (isOwner) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ liked: boolean; likesCount: number }>(`/${type}/${id}/like`);
      if (!mounted.current) return;
      setLiked(res.liked);
      setCount(res.likesCount);
    } catch (cause: unknown) {
      if (mounted.current) setError(messageFrom(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        onClick={toggle}
        disabled={busy || !!isOwner}
        aria-pressed={liked}
        title={isOwner ? 'No puedes dar like a tu propio contenido' : 'Me gusta'}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition',
          liked
            ? 'border-red-400/50 bg-red-500/10 text-red-500'
            : 'border-border bg-card hover:border-red-400/50 hover:text-red-500',
          isOwner && 'cursor-not-allowed opacity-60',
        )}
      >
        <Heart className={cn('h-4 w-4', liked && 'fill-current')} /> {count}
      </button>
      {error && <span role="alert" className="text-xs font-semibold text-red-500">{error}</span>}
    </div>
  );
}

export function CommentSection({
  type,
  id,
  initialComments,
}: {
  type: 'projects' | 'articles';
  id: string;
  initialComments: CommentItem[];
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return router.push('/login');
    if (body.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<CommentItem>(`/${type}/${id}/comments`, { body });
      setComments((prev) => [created, ...prev]);
      setBody('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="font-serif-heading text-xl font-bold text-primary">Comentarios ({comments.length})</h2>
      <form onSubmit={submit} className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={user ? 'Escribe un comentario…' : 'Inicia sesión para comentar'}
          disabled={!user || busy}
          className="min-h-[80px]"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <Button type="submit" disabled={!user || busy || body.trim().length < 2} size="sm">
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Comentar
        </Button>
      </form>
      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3 rounded-xl border border-border bg-card p-4">
            <Avatar src={c.author?.profile?.avatarUrl} name={c.author?.profile?.fullName} className="h-8 w-8" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold">{c.author?.profile?.fullName ?? 'Usuario'}</span>
                <span className="text-muted-foreground">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-foreground/90 whitespace-pre-line">{c.body}</p>
            </div>
          </div>
        ))}
        {comments.length === 0 && <p className="text-sm text-muted-foreground">Sé el primero en comentar.</p>}
      </div>
    </section>
  );
}

export function ReportButton({ targetType, targetId }: { targetType: string; targetId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!user) return router.push('/login');
    setBusy(true);
    setError(null);
    try {
      await api.post('/reports', { targetType, targetId, reason });
      setDone(true);
      setOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) return <span className="text-xs font-semibold text-emerald-500">Reporte enviado, gracias</span>;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => (user ? setOpen((v) => !v) : router.push('/login'))}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition"
      >
        <Flag className="h-3.5 w-3.5" /> Reportar
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-popover p-3 shadow-xl">
          <p className="mb-2 text-xs font-bold">¿Por qué reportas este contenido?</p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[70px] text-xs" placeholder="Describe el problema (mínimo 10 caracteres)" />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={busy || reason.trim().length < 10} onClick={submit}>
              {busy ? <Loader2 className="animate-spin" /> : 'Enviar reporte'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
