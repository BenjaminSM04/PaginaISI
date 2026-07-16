'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Download, Loader2, Mail, RotateCcw, UserRoundCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

interface Registration {
  id: string;
  createdAt: string;
  status: 'REGISTERED' | 'ATTENDED' | 'CANCELLED';
  user: {
    username: string;
    email: string;
    profile?: { fullName?: string; semester?: number | null } | null;
  };
}

function csvCell(value: unknown) {
  let text = String(value ?? '');
  // Evita fórmulas al abrir el CSV en Excel/Sheets.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function EventAttendees({ slug, organizerUsername }: { slug: string; organizerUsername?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canAttempt = !!user && (
    user.username === organizerUsername
    || user.roles.some((role) => ['ADMIN', 'TEACHER', 'COMMUNITY_LEADER'].includes(role))
  );
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['event-attendees', slug],
    queryFn: () => api.get<Registration[]>(`/events/${slug}/attendees`),
    enabled: open && canAttempt,
    retry: false,
  });

  if (!canAttempt) return null;

  const downloadCsv = () => {
    if (!data?.length) return;
    const rows = [
      ['Nombre', 'Username', 'Correo', 'Semestre', 'Estado', 'Fecha de inscripción'],
      ...data.map((registration) => [
        registration.user.profile?.fullName,
        registration.user.username,
        registration.user.email,
        registration.user.profile?.semester,
        registration.status === 'ATTENDED' ? 'Asistió' : 'Inscrito',
        registration.createdAt,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `inscritos-${slug}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleAttendance = async (registration: Registration) => {
    setUpdatingId(registration.id);
    setActionError(null);
    try {
      await api.patch(`/events/${slug}/attendees/${registration.id}`, {
        status: registration.status === 'ATTENDED' ? 'REGISTERED' : 'ATTENDED',
      });
      await refetch();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo actualizar la asistencia');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-primary"><UserRoundCheck className="h-4 w-4" /> Gestión de inscritos</h3>
          <p className="mt-1 text-xs text-muted-foreground">Visible solo para responsables autorizados.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>{open ? 'Ocultar' : 'Ver lista'}</Button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {isLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
          {error && <p className="text-sm text-red-500">{error instanceof Error ? error.message : 'No tienes permiso para ver esta lista.'}</p>}
          {actionError && <p role="alert" className="text-sm text-red-500">{actionError}</p>}
          {data && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <Users className="h-3.5 w-3.5" /> {data.length} personas · {data.filter((item) => item.status === 'ATTENDED').length} asistieron
                </span>
                <Button size="sm" variant="secondary" disabled={!data.length} onClick={downloadCsv}><Download /> CSV</Button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {data.map((registration) => (
                  <div key={registration.id} className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                    <p className="font-bold">{registration.user.profile?.fullName ?? registration.user.username}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-muted-foreground">@{registration.user.username}{registration.user.profile?.semester ? ` · ${registration.user.profile.semester}º semestre` : ''}</p>
                      <Button
                        size="sm"
                        variant={registration.status === 'ATTENDED' ? 'secondary' : 'outline'}
                        disabled={updatingId === registration.id}
                        onClick={() => void toggleAttendance(registration)}
                      >
                        {updatingId === registration.id
                          ? <Loader2 className="animate-spin" />
                          : registration.status === 'ATTENDED' ? <RotateCcw /> : <Check />}
                        {registration.status === 'ATTENDED' ? 'Desmarcar' : 'Marcar asistencia'}
                      </Button>
                    </div>
                    <a href={`mailto:${registration.user.email}`} className="mt-1 flex items-center gap-1 text-accent hover:underline"><Mail className="h-3 w-3" /> {registration.user.email}</a>
                  </div>
                ))}
                {!data.length && <p className="py-3 text-center text-xs text-muted-foreground">Todavía no hay personas inscritas.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
