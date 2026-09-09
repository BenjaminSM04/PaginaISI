'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, ShieldCheck, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ALL_ROLES = ['STUDENT', 'TEACHER', 'COMMUNITY_LEADER', 'ADMIN'];
const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Estudiante',
  TEACHER: 'Docente',
  COMMUNITY_LEADER: 'Líder',
  ADMIN: 'Admin',
};

export default function AdminUsuariosPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', submitted],
    queryFn: () => api.get<{ total: number; items: any[] }>(`/admin/users?limit=50${submitted ? `&search=${encodeURIComponent(submitted)}` : ''}`),
  });

  const update = useMutation({
    mutationFn: ({ id, roles, isActive }: { id: string; roles: string[]; isActive?: boolean }) =>
      api.patch(`/admin/users/${id}`, { roles, isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (e: any) => setError(e.message),
  });

  const toggleRole = (u: any, role: string) => {
    const roles = u.roles.includes(role) ? u.roles.filter((r: string) => r !== role) : [...u.roles, role];
    if (roles.length === 0) return setError('El usuario debe tener al menos un rol');
    setError(null);
    update.mutate({ id: u.id, roles });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Usuarios y roles</h1>
        <p className="text-sm text-muted-foreground">Haz clic en un rol para asignarlo o quitarlo. Un usuario puede tener varios roles.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(search.trim());
        }}
        className="relative max-w-sm"
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o usuario…"
          className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </form>

      {error && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {(data?.items ?? []).map((u) => (
            <div key={u.id} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm', !u.isActive && 'opacity-60')}>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar src={u.profile?.avatarUrl} name={u.profile?.fullName} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    {u.profile?.fullName}
                    {!u.isActive && <Badge variant="outline" className="text-danger border-danger/40">Desactivado</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">@{u.username} · {u.email} · {u.profile?.totalPoints ?? 0} pts</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {ALL_ROLES.map((role) => (
                  <button
                    key={role}
                    onClick={() => toggleRole(u, role)}
                    disabled={update.isPending}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-[11px] font-bold transition',
                      u.roles.includes(role)
                        ? role === 'ADMIN'
                          ? 'border-danger/50 bg-danger/15 text-danger'
                          : 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: u.id, roles: u.roles, isActive: !u.isActive })}
                  className={u.isActive ? 'text-danger hover:bg-danger/10' : 'text-success hover:bg-success/10'}
                >
                  {u.isActive ? <UserX /> : <ShieldCheck />}
                  {u.isActive ? 'Desactivar' : 'Reactivar'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
