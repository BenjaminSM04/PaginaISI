'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LogIn, LogOut, Loader2, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { loginHrefFor } from '@/lib/navigation';
import { Button } from '@/components/ui/button';

interface JoinResult {
  joined: boolean;
  alreadyMember?: boolean;
  pointsAwarded?: number;
}

export function CommunityJoinButton({
  slug,
  memberIds = [],
  memberUsernames = [],
}: {
  slug: string;
  memberIds?: string[];
  memberUsernames?: string[];
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const joinedFromPage = !!user && (
    memberIds.includes(user.id)
    || memberUsernames.includes(user.username)
  );
  const membershipScope = `${slug}:${user?.id ?? 'anonymous'}`;
  const [localState, setLocalState] = useState<{ scope: string; joined: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const joined = localState?.scope === membershipScope ? localState.joined : joinedFromPage;

  const act = async () => {
    if (!user) {
      router.push(loginHrefFor(`/comunidades/${encodeURIComponent(slug)}`));
      return;
    }
    if (joined && !window.confirm('¿Salir de esta comunidad? Perderás el acceso como miembro, aunque podrás volver a unirte después.')) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (joined) {
        await api.post<JoinResult>(`/communities/${encodeURIComponent(slug)}/leave`);
        setLocalState({ scope: membershipScope, joined: false });
        setMessage('Saliste de la comunidad.');
      } else {
        const result = await api.post<JoinResult>(`/communities/${encodeURIComponent(slug)}/join`);
        setLocalState({ scope: membershipScope, joined: true });
        setMessage(
          result.alreadyMember
            ? 'Ya pertenecías a esta comunidad.'
            : result.pointsAwarded
              ? `Te uniste correctamente. +${result.pointsAwarded} puntos de comunidad.`
              : 'Te uniste correctamente.',
        );
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar tu membresía');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={act}
        disabled={loading || busy}
        variant={joined ? 'outline' : 'accent'}
        className="w-full"
        aria-pressed={user ? joined : undefined}
      >
        {loading || busy
          ? <Loader2 className="animate-spin" />
          : !user
            ? <LogIn />
            : joined
              ? <LogOut />
              : <UserPlus />}
        {loading
          ? 'Comprobando sesión…'
          : !user
            ? 'Quiero unirme'
            : joined
              ? 'Salir de la comunidad'
              : 'Unirme a la comunidad'}
      </Button>
      {!loading && !user && (
        <p className="text-xs text-muted-foreground">Inicia sesión para unirte; volverás a esta comunidad al terminar.</p>
      )}
      {message && (
        <p role="status" className="flex items-start gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {message}
        </p>
      )}
      {error && <p role="alert" className="text-xs font-semibold text-red-500">{error}</p>}
    </div>
  );
}
