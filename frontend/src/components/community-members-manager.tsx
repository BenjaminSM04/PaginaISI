'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type {
  Community,
  CommunityMember,
  CommunityMembershipRole,
  Paged,
} from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import {
  RemoteCombobox,
  type RemoteOptionsLoader,
} from '@/components/ui/remote-combobox';
import type { DirectoryUserOption } from '@/components/remote-selectors';

const PAGE_SIZE = 12;

const ROLE_LABELS: Record<CommunityMembershipRole, string> = {
  MEMBER: 'Miembro',
  STUDENT_LEAD: 'Líder estudiantil',
  TEACHER_LEAD: 'Docente responsable',
};

interface RawCandidate extends Omit<DirectoryUserOption, 'roles'> {
  roles?: string[] | { role: { name: string } }[];
}

function roleNames(user: CommunityMember['user'] | RawCandidate) {
  const roles = user.roles ?? [];
  return roles.map((entry) => (typeof entry === 'string' ? entry : entry.role.name));
}

function candidateOption(candidate: RawCandidate): DirectoryUserOption {
  return { ...candidate, roles: roleNames(candidate) };
}

function readableSystemRoles(roles: string[] = []) {
  return roles
    .map((role) => ({
      ADMIN: 'Administrador',
      TEACHER: 'Docente',
      STUDENT: 'Estudiante',
      COMMUNITY_LEADER: 'Líder de comunidad',
    })[role] ?? role)
    .join(', ');
}

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value.trim()), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

function formatJoinedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(date);
}

export function CommunityMembersManager({ community }: { community: Pick<Community, 'id' | 'name'> }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = !!user?.roles.includes('ADMIN');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [candidate, setCandidate] = useState<DirectoryUserOption | null>(null);
  const [newRole, setNewRole] = useState<CommunityMembershipRole>('MEMBER');
  const [candidateRevision, setCandidateRevision] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ['community-members', community.id, debouncedSearch, page],
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) query.set('search', debouncedSearch);
      return api.get<Paged<CommunityMember>>(`/communities/management/${community.id}/members?${query.toString()}`);
    },
    placeholderData: (previous) => previous,
    retry: false,
  });

  const candidateLoader = useMemo<RemoteOptionsLoader<DirectoryUserOption>>(() => async (request) => {
    const query = new URLSearchParams({
      search: request.query,
      page: String(request.page),
      limit: String(request.limit),
    });
    if (newRole !== 'MEMBER') query.set('role', newRole);
    const result = await api.get<Paged<RawCandidate>>(
      `/communities/management/${community.id}/candidates?${query.toString()}`,
    );
    return {
      items: result.items.map(candidateOption),
      page: result.page ?? request.page,
      total: result.total,
      hasMore: result.pages !== undefined
        ? (result.page ?? request.page) < result.pages
        : (result.page ?? request.page) * (result.limit ?? request.limit) < result.total,
    };
  }, [community.id, newRole]);

  const refreshMembers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['community-members', community.id] });
    await queryClient.invalidateQueries({ queryKey: ['community-management'] });
    setCandidateRevision((current) => current + 1);
  }, [community.id, queryClient]);

  const addMember = async () => {
    if (!candidate || busyAction) return;
    setBusyAction('add');
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/communities/management/${community.id}/members`, {
        userId: candidate.id,
        role: newRole,
      });
      setSuccess(`${candidate.profile?.fullName?.trim() || `@${candidate.username}`} fue agregado como ${ROLE_LABELS[newRole].toLocaleLowerCase('es')}.`);
      setCandidate(null);
      await refreshMembers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo agregar al miembro');
    } finally {
      setBusyAction(null);
    }
  };

  const updateRole = async (member: CommunityMember, nextRole: CommunityMembershipRole) => {
    if (member.role === nextRole || busyAction) return;
    const name = member.user.profile?.fullName?.trim() || `@${member.user.username}`;
    if (!window.confirm(`¿Cambiar el rol de ${name} de “${ROLE_LABELS[member.role]}” a “${ROLE_LABELS[nextRole]}”?`)) return;
    setBusyAction(`role:${member.userId ?? member.user.id}`);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/communities/management/${community.id}/members/${member.userId ?? member.user.id}`, {
        role: nextRole,
      });
      setSuccess(`El rol de ${name} se actualizó correctamente.`);
      await refreshMembers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el rol');
    } finally {
      setBusyAction(null);
    }
  };

  const removeMember = async (member: CommunityMember) => {
    if (busyAction) return;
    const name = member.user.profile?.fullName?.trim() || `@${member.user.username}`;
    if (!window.confirm(`¿Quitar a ${name} de “${community.name}”? Esta acción elimina su membresía.`)) return;
    setBusyAction(`remove:${member.userId ?? member.user.id}`);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/communities/management/${community.id}/members/${member.userId ?? member.user.id}`);
      setSuccess(`${name} ya no pertenece a la comunidad.`);
      const remainingOnPage = (membersQuery.data?.items.length ?? 1) - 1;
      if (remainingOnPage <= 0 && page > 1) setPage((current) => current - 1);
      await refreshMembers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo quitar al miembro');
    } finally {
      setBusyAction(null);
    }
  };

  const allowedRoles = (member: CommunityMember) => {
    const systemRoles = roleNames(member.user);
    const roles: CommunityMembershipRole[] = ['MEMBER'];
    if (systemRoles.includes('COMMUNITY_LEADER') || member.role === 'STUDENT_LEAD') roles.push('STUDENT_LEAD');
    if (isAdmin && (systemRoles.includes('TEACHER') || member.role === 'TEACHER_LEAD')) roles.push('TEACHER_LEAD');
    return roles;
  };

  const total = membersQuery.data?.total ?? 0;
  const pages = Math.max(1, membersQuery.data?.pages ?? Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 md:p-8" aria-labelledby="community-members-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="section-kicker">Administración</span>
          <h2 id="community-members-heading" className="mt-1 flex items-center gap-2 font-serif-heading text-2xl font-bold text-primary">
            <Users /> Miembros
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Busca, incorpora o reasigna miembros. El servidor impide duplicados y protege al último responsable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {membersQuery.isFetching && !membersQuery.isLoading && (
            <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Actualizando…
            </span>
          )}
          <Badge variant="outline">{total} {total === 1 ? 'miembro' : 'miembros'}</Badge>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-border bg-secondary/20 p-4 lg:grid-cols-[minmax(0,1fr)_12rem_auto] lg:items-end">
        <RemoteCombobox<DirectoryUserOption>
          value={candidate}
          onChange={(value) => setCandidate(value)}
          loadOptions={candidateLoader}
          getOptionKey={(option) => option.id}
          getOptionLabel={(option) => option.profile?.fullName?.trim() || option.username}
          getOptionDescription={(option) => `@${option.username}${option.roles?.length ? ` · ${readableSystemRoles(option.roles)}` : ''}`}
          label="Buscar usuario"
          placeholder="Nombre o usuario…"
          emptyMessage="No hay usuarios elegibles fuera de la comunidad."
          debounceMs={300}
          pageSize={20}
          requestKey={`${community.id}:${newRole}:${candidateRevision}`}
        />
        <div className="space-y-1.5">
          <Label htmlFor="new-community-member-role">Rol en la comunidad</Label>
          <Select
            id="new-community-member-role"
            value={newRole}
            onChange={(event) => {
              setNewRole(event.target.value as CommunityMembershipRole);
              setCandidate(null);
            }}
          >
            <option value="MEMBER">Miembro</option>
            <option value="STUDENT_LEAD">Líder estudiantil</option>
            {isAdmin && <option value="TEACHER_LEAD">Docente responsable</option>}
          </Select>
        </div>
        <Button type="button" onClick={addMember} disabled={!candidate || !!busyAction}>
          {busyAction === 'add' ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Agregar
        </Button>
      </div>

      <div className="relative">
        <Label htmlFor="community-member-search" className="sr-only">Buscar entre los miembros actuales</Label>
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          id="community-member-search"
          value={search}
          className="pl-9"
          placeholder="Buscar entre los miembros actuales…"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
      {success && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}
      {membersQuery.error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          {membersQuery.error instanceof Error ? membersQuery.error.message : 'No se pudieron cargar los miembros'}
        </p>
      )}

      {membersQuery.isLoading ? (
        <div className="flex justify-center rounded-xl border border-border py-14" role="status">
          <Loader2 className="animate-spin text-primary" />
          <span className="sr-only">Cargando miembros</span>
        </div>
      ) : (membersQuery.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {debouncedSearch ? 'No se encontraron miembros con esa búsqueda.' : 'La comunidad aún no tiene miembros.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">Usuario</th>
                <th scope="col" className="px-4 py-3">Ingreso</th>
                <th scope="col" className="px-4 py-3">Rol interno</th>
                <th scope="col" className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(membersQuery.data?.items ?? []).map((member) => {
                const memberId = member.userId ?? member.user.id ?? '';
                const isSelfResponsible = memberId === user?.id && member.role !== 'MEMBER';
                const teacherRestricted = member.role === 'TEACHER_LEAD' && !isAdmin;
                const actionBusy = busyAction?.endsWith(memberId);
                return (
                  <tr key={member.id ?? `${memberId}:${member.role}`} className="bg-card">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={member.user.profile?.avatarUrl} name={member.user.profile?.fullName} className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{member.user.profile?.fullName ?? member.user.username}</p>
                          <p className="truncate text-xs text-muted-foreground">@{member.user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatJoinedAt(member.joinedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          aria-label={`Rol de ${member.user.profile?.fullName ?? member.user.username}`}
                          disabled={!!busyAction || isSelfResponsible || teacherRestricted}
                          title={
                            isSelfResponsible
                              ? 'Otro responsable debe reasignar tu rol'
                              : teacherRestricted
                                ? 'Solo administración puede cambiar docentes responsables'
                                : undefined
                          }
                          onChange={(event) => void updateRole(member, event.target.value as CommunityMembershipRole)}
                          className="w-52"
                        >
                          {allowedRoles(member).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                        </Select>
                        {actionBusy && busyAction?.startsWith('role:') && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="Actualizando rol" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600"
                        disabled={!!busyAction || isSelfResponsible || teacherRestricted}
                        title={
                          isSelfResponsible
                            ? 'No puedes quitarte mientras conservas un rol responsable'
                            : teacherRestricted
                              ? 'Solo administración puede quitar docentes responsables'
                              : 'Quitar de la comunidad'
                        }
                        onClick={() => void removeMember(member)}
                      >
                        {actionBusy && busyAction?.startsWith('remove:') ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        Quitar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Página {Math.min(page, pages)} de {pages}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1 || membersQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ChevronLeft /> Anterior
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={page >= pages || membersQuery.isFetching} onClick={() => setPage((current) => current + 1)}>
            Siguiente <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
