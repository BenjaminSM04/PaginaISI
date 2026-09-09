'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { IncubatorClient, MediaAssetLite, Paged } from '@/lib/types';
import { cn } from '@/lib/utils';
import { IncubatorClientLogo } from '@/components/incubator-client-logo';
import { MediaUploadButton } from '@/components/media-upload-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const PAGE_SIZE = 12;

type ClientList = Paged<IncubatorClient> | IncubatorClient[];

function asPage(result: ClientList, page: number): Paged<IncubatorClient> {
  if (!Array.isArray(result)) return result;
  return {
    items: result,
    total: result.length,
    page,
    limit: PAGE_SIZE,
    pages: result.length < PAGE_SIZE ? page : page + 1,
    hasMore: result.length === PAGE_SIZE,
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminIncubatorClientsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<IncubatorClient | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingLogoRef = useRef<MediaAssetLite | null>(null);

  const clientsQuery = useQuery({
    queryKey: ['admin-incubator-clients', search, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set('q', search);
      return asPage(
        await api.get<ClientList>(`/admin/incubator/clients?${params.toString()}`),
        page,
      );
    },
    retry: false,
  });

  useEffect(() => () => {
    const pending = pendingLogoRef.current;
    if (pending) void api.delete(`/media/${pending.id}`).catch(() => undefined);
  }, []);

  const removePendingLogo = () => {
    const pending = pendingLogoRef.current;
    pendingLogoRef.current = null;
    if (pending) void api.delete(`/media/${pending.id}`).catch(() => undefined);
  };

  const closeEditor = (removeUpload = true) => {
    if (removeUpload) removePendingLogo();
    else pendingLogoRef.current = null;
    setEditing(null);
    setShowEditor(false);
    setName('');
    setLogoUrl('');
    setIsActive(true);
    setError(null);
  };

  const openNew = () => {
    closeEditor(true);
    setShowEditor(true);
    setMessage(null);
  };

  const openEdit = (client: IncubatorClient) => {
    closeEditor(true);
    setEditing(client);
    setName(client.name);
    setLogoUrl(client.logoUrl ?? '');
    setIsActive(client.isActive !== false);
    setShowEditor(true);
    setMessage(null);
  };

  const uploaded = (asset: MediaAssetLite) => {
    const previous = pendingLogoRef.current;
    pendingLogoRef.current = asset;
    setLogoUrl(asset.url);
    setError(null);
    if (previous?.id && previous.id !== asset.id) {
      void api.delete(`/media/${previous.id}`).catch(() => undefined);
    }
  };

  const removeLogo = () => {
    removePendingLogo();
    setLogoUrl(editing?.logoUrl ?? '');
  };

  const refreshLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-incubator-clients'] }),
      queryClient.invalidateQueries({ queryKey: ['incubator-clients'] }),
    ]);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    setError(null);
    setMessage(null);
    if (normalizedName.length < 2 || normalizedName.length > 160) {
      setError('El nombre de la empresa debe tener entre 2 y 160 caracteres.');
      return;
    }
    if (!logoUrl) {
      setError('Carga un logo para la empresa.');
      return;
    }
    setSaving(true);
    try {
      const client = editing
        ? await api.patch<IncubatorClient>(`/admin/incubator/clients/${editing.id}`, {
          name: normalizedName,
          logoUrl,
          isActive,
        })
        : await api.post<IncubatorClient>('/incubator/clients', {
          name: normalizedName,
          logoUrl,
        });
      closeEditor(false);
      setMessage(editing ? `“${client.name}” fue actualizada.` : `“${client.name}” fue registrada.`);
      await refreshLists();
    } catch (cause) {
      if (editing && pendingLogoRef.current) {
        removePendingLogo();
        setLogoUrl(editing.logoUrl ?? '');
      }
      setError(errorMessage(cause, 'No se pudo guardar el cliente.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (client: IncubatorClient) => {
    const nextActive = client.isActive === false;
    if (!nextActive && !window.confirm(
      `¿Desactivar “${client.name}”? Ya no aparecerá para nuevas asociaciones, pero conservará sus proyectos actuales.`,
    )) return;
    setBusyId(client.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.patch<IncubatorClient>(`/admin/incubator/clients/${client.id}`, {
        isActive: nextActive,
      });
      setMessage(updated.isActive ? `“${updated.name}” fue activada.` : `“${updated.name}” fue desactivada.`);
      await refreshLists();
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo cambiar el estado del cliente.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (client: IncubatorClient) => {
    const linkedProjects = client.projectCount ?? client._count?.projects ?? 0;
    const warning = linkedProjects > 0
      ? `¿Desactivar “${client.name}”? Sus vínculos con ${linkedProjects} proyecto(s) se conservarán.`
      : `¿Desactivar “${client.name}”? Ya no aparecerá en nuevas búsquedas.`;
    if (!window.confirm(warning)) return;
    setBusyId(client.id);
    setError(null);
    setMessage(null);
    try {
      await api.delete(`/admin/incubator/clients/${client.id}`);
      setMessage(`“${client.name}” fue desactivada sin perder sus relaciones.`);
      await refreshLists();
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo retirar el cliente. Puedes desactivarlo para conservar su historial.'));
    } finally {
      setBusyId(null);
    }
  };

  const clients = clientsQuery.data?.items ?? [];
  const totalPages = clientsQuery.data?.pages
    ?? Math.max(1, Math.ceil((clientsQuery.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/incubadora" className="mb-3 inline-flex text-xs font-semibold text-primary hover:underline">
            ← Volver a la incubadora
          </Link>
          <h1 className="flex items-center gap-2 font-serif-heading text-2xl font-bold text-primary">
            <Building2 className="h-6 w-6 text-purple-500" /> Clientes de Incubadora
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Administra la cartera reutilizable de empresas y los logos que se muestran en los proyectos vinculados.
          </p>
        </div>
        <Button type="button" onClick={openNew}><Plus /> Nuevo cliente</Button>
      </header>

      <div aria-live="polite" className="space-y-2">
        {message && (
          <p className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {showEditor && (
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-purple-500/25 bg-purple-500/5 p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif-heading text-lg font-bold text-primary">
                {editing ? `Editar ${editing.name}` : 'Registrar cliente'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                El nombre se normaliza para evitar empresas duplicadas por mayúsculas o espacios.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" aria-label="Cerrar editor" disabled={saving} onClick={() => closeEditor(true)}>
              <X />
            </Button>
          </div>

          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-1.5">
              <Label htmlFor="admin-incubator-client-name">Nombre o razón social *</Label>
              <Input
                id="admin-incubator-client-name"
                value={name}
                required
                minLength={2}
                maxLength={160}
                disabled={saving}
                placeholder="Nombre de la empresa"
                onChange={(event) => setName(event.target.value)}
              />
              {editing && (
                <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={saving}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    onChange={(event) => setIsActive(event.target.checked)}
                  />
                  <span>
                    <span className="block font-semibold">Cliente activo</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Los clientes inactivos permanecen en proyectos existentes, pero no aparecen en búsquedas nuevas.
                    </span>
                  </span>
                </label>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Logo de la empresa *</Label>
              <MediaUploadButton
                kind="image"
                disabled={saving}
                previewUrl={logoUrl}
                previewAlt={name.trim() ? `Vista previa del logo de ${name.trim()}` : 'Vista previa del logo del cliente'}
                previewShape="square"
                previewFit="contain"
                onUploaded={uploaded}
                onRemove={removeLogo}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving || name.trim().length < 2 || !logoUrl}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {editing ? 'Guardar cambios' : 'Registrar cliente'}
            </Button>
          </div>
        </form>
      )}

      <form
        className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchText.trim());
          setPage(1);
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Label htmlFor="admin-incubator-client-search" className="sr-only">Buscar clientes</Label>
          <Input
            id="admin-incubator-client-search"
            type="search"
            value={searchText}
            maxLength={100}
            className="pl-9"
            placeholder="Buscar por nombre de empresa"
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>

      {clientsQuery.isLoading && (
        <div role="status" className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-purple-500" /> Cargando clientes…
        </div>
      )}
      {clientsQuery.isError && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-5 text-sm text-danger">
          <p>No se pudo cargar la cartera de clientes.</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void clientsQuery.refetch()}>
            <RefreshCw /> Reintentar
          </Button>
        </div>
      )}
      {clientsQuery.isSuccess && clients.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border py-14 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {search ? 'No hay empresas que coincidan con la búsqueda.' : 'Aún no hay clientes registrados.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {clients.map((client) => {
          const active = client.isActive !== false;
          const linkedProjects = client.projectCount ?? client._count?.projects;
          return (
            <article key={client.id} className={cn(
              'rounded-2xl border border-border bg-card p-4 shadow-sm',
              !active && 'opacity-70',
            )}>
              <div className="flex items-start gap-4">
                <IncubatorClientLogo client={client} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words font-bold text-primary">{client.name}</h2>
                    <Badge variant={active ? 'success' : 'secondary'}>{active ? 'Activo' : 'Inactivo'}</Badge>
                  </div>
                  {typeof linkedProjects === 'number' && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {linkedProjects} proyecto{linkedProjects === 1 ? '' : 's'} vinculado{linkedProjects === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                <Button type="button" size="sm" variant="ghost" disabled={busyId === client.id} onClick={() => openEdit(client)}>
                  <Pencil /> Editar
                </Button>
                {!active && (
                  <Button type="button" size="sm" variant="outline" disabled={busyId === client.id} onClick={() => void toggleActive(client)}>
                    <Eye /> Activar
                  </Button>
                )}
                {active && (
                  <Button type="button" size="sm" variant="destructive" disabled={busyId === client.id} onClick={() => void remove(client)}>
                    {busyId === client.id ? <Loader2 className="animate-spin" /> : <EyeOff />} Desactivar
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {clientsQuery.isSuccess && totalPages > 1 && (
        <nav aria-label="Paginación de clientes" className="flex items-center justify-center gap-3">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1 || clientsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
          <Button type="button" size="sm" variant="outline" disabled={page >= totalPages || clientsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>
            Siguiente
          </Button>
        </nav>
      )}
    </div>
  );
}
