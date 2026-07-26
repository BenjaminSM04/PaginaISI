'use client';

import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Grid3X3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { InstitutionalApplication, Paged } from '@/lib/types';
import { APPLICATION_ICON_OPTIONS, ApplicationIcon } from '@/components/application-icon';
import { ApplicationLink } from '@/components/application-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type ApplicationRole = 'STUDENT' | 'TEACHER' | 'COMMUNITY_LEADER' | 'ADMIN';

interface ApplicationDraft {
  name: string;
  description: string;
  icon: string;
  url: string;
  category: string;
  sortOrder: string;
  visibleRoles: ApplicationRole[];
  openInNewTab: boolean;
  isActive: boolean;
}

const EMPTY_DRAFT: ApplicationDraft = {
  name: '',
  description: '',
  icon: 'app-window',
  url: '',
  category: '',
  sortOrder: '0',
  visibleRoles: [],
  openInNewTab: true,
  isActive: true,
};
const PAGE_SIZE = 12;
const ROLES: Array<{ value: ApplicationRole; label: string }> = [
  { value: 'STUDENT', label: 'Estudiantes' },
  { value: 'TEACHER', label: 'Docentes' },
  { value: 'COMMUNITY_LEADER', label: 'Líderes de comunidad' },
  { value: 'ADMIN', label: 'Administración' },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function validApplicationUrl(value: string) {
  const url = value.trim();
  if (
    !url
    || url.length > 2_048
    || /[\u0000-\u001F\u007F\\]/.test(url)
    || /%(?:2f|5c)/i.test(url)
  ) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export default function AdminAplicacionesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'true' | 'false'>('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<InstitutionalApplication | null>(null);
  const [draft, setDraft] = useState<ApplicationDraft>(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ['admin-applications', search, status, page],
    queryFn: () => api.get<Paged<InstitutionalApplication>>(
      `/admin/applications?page=${page}&limit=${PAGE_SIZE}`
      + `${search ? `&search=${encodeURIComponent(search)}` : ''}`
      + `${status === 'all' ? '' : `&isActive=${status}`}`,
    ),
    retry: false,
  });

  const showSuccess = (text: string) => {
    setError(null);
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3_500);
  };

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-applications'] }),
      queryClient.invalidateQueries({ queryKey: ['applications'] }),
    ]);
  };

  const save = useMutation({
    mutationFn: (value: ApplicationDraft) => {
      const payload = {
        name: value.name.trim(),
        description: value.description.trim(),
        icon: value.icon,
        url: value.url.trim(),
        category: value.category.trim(),
        sortOrder: Number(value.sortOrder),
        visibleRoles: value.visibleRoles,
        openInNewTab: value.openInNewTab,
        isActive: value.isActive,
      };
      return editing
        ? api.patch<InstitutionalApplication>(`/admin/applications/${editing.id}`, payload)
        : api.post<InstitutionalApplication>('/admin/applications', payload);
    },
    onSuccess: async () => {
      await invalidate();
      setShowEditor(false);
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      showSuccess(editing ? 'Aplicación actualizada.' : 'Aplicación creada.');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo guardar la aplicación.')),
  });

  const toggleActive = useMutation({
    mutationFn: (application: InstitutionalApplication) =>
      api.patch<InstitutionalApplication>(`/admin/applications/${application.id}`, {
        isActive: !application.isActive,
      }),
    onSuccess: async (application) => {
      await invalidate();
      showSuccess(application.isActive ? 'Aplicación activada.' : 'Aplicación desactivada.');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo cambiar el estado.')),
  });

  const remove = useMutation({
    mutationFn: (application: InstitutionalApplication) =>
      api.delete<{ deleted: true }>(`/admin/applications/${application.id}`),
    onSuccess: async () => {
      await invalidate();
      showSuccess('Aplicación eliminada.');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo eliminar la aplicación.')),
  });

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
    setShowEditor(true);
    setError(null);
  }

  function openEdit(application: InstitutionalApplication) {
    setDraft({
      name: application.name,
      description: application.description,
      icon: application.icon || 'app-window',
      url: application.url,
      category: application.category,
      sortOrder: String(application.sortOrder),
      visibleRoles: application.visibleRoles as ApplicationRole[],
      openInNewTab: application.openInNewTab,
      isActive: application.isActive,
    });
    setEditing(application);
    setShowEditor(true);
    setError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validApplicationUrl(draft.url)) {
      setError('La URL debe ser una ruta interna que empiece por / o una URL HTTPS sin credenciales.');
      return;
    }
    const order = Number(draft.sortOrder);
    if (!Number.isInteger(order) || order < -10_000 || order > 10_000) {
      setError('El orden debe ser un número entero entre -10000 y 10000.');
      return;
    }
    if (editing?.isActive && !draft.isActive && !window.confirm(
      `“${editing.name}” dejará de mostrarse a los usuarios. ¿Guardar como inactiva?`,
    )) return;
    save.mutate(draft);
  }

  function requestToggle(application: InstitutionalApplication) {
    if (application.isActive && !window.confirm(
      `¿Desactivar “${application.name}”? Dejará de mostrarse en el hub y el lanzador de aplicaciones.`,
    )) return;
    toggleActive.mutate(application);
  }

  function requestDelete(application: InstitutionalApplication) {
    if (!window.confirm(
      `¿Eliminar definitivamente “${application.name}”? Si solo quieres ocultarla temporalmente, cancela y usa Desactivar.`,
    )) return;
    remove.mutate(application);
  }

  function toggleRole(role: ApplicationRole) {
    setDraft((current) => ({
      ...current,
      visibleRoles: current.visibleRoles.includes(role)
        ? current.visibleRoles.filter((item) => item !== role)
        : [...current.visibleRoles, role],
    }));
  }

  const order = Number(draft.sortOrder);
  const draftValid = draft.name.trim().length > 0
    && draft.name.trim().length <= 80
    && draft.description.trim().length > 0
    && draft.description.trim().length <= 500
    && draft.category.trim().length > 0
    && draft.category.trim().length <= 60
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.icon)
    && validApplicationUrl(draft.url)
    && Number.isInteger(order)
    && order >= -10_000
    && order <= 10_000;
  const applications = applicationsQuery.data?.items ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif-heading text-2xl font-bold text-primary">Aplicaciones institucionales</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona enlaces, orden, audiencia y forma de apertura. El hub público solo recibe entradas activas autorizadas.
          </p>
        </div>
        <Button onClick={openNew}><Plus /> Nueva aplicación</Button>
      </div>

      <div aria-live="polite" className="space-y-2">
        {message && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      {showEditor && (
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif-heading text-lg font-bold text-primary">
                {editing ? `Editar ${editing.name}` : 'Crear aplicación'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Usa HTTPS para destinos externos o una ruta absoluta como /biblioteca para secciones internas.
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" aria-label="Cerrar editor" onClick={() => setShowEditor(false)}>
              <X />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="application-name">Nombre</Label>
              <Input
                id="application-name"
                value={draft.name}
                maxLength={80}
                required
                placeholder="Biblioteca virtual"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="application-category">Categoría</Label>
              <Input
                id="application-category"
                value={draft.category}
                maxLength={60}
                required
                placeholder="Recursos académicos"
                onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="application-description">Descripción</Label>
              <Textarea
                id="application-description"
                value={draft.description}
                maxLength={500}
                rows={3}
                required
                placeholder="Explica qué recurso encontrará el usuario."
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              />
              <p className="text-right text-[11px] text-muted-foreground">{draft.description.length}/500</p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="application-url">URL</Label>
              <Input
                id="application-url"
                type="text"
                value={draft.url}
                maxLength={2_048}
                required
                aria-describedby="application-url-help"
                placeholder="https://servicio.universidad.edu o /ruta-interna"
                onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
              />
              <p id="application-url-help" className={cn(
                'text-[11px]',
                draft.url && !validApplicationUrl(draft.url) ? 'text-red-500' : 'text-muted-foreground',
              )}>
                Solo HTTPS externo o rutas internas que empiecen por una barra. No se permiten credenciales ni URLs relativas ambiguas.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="application-icon">Icono</Label>
              <Select
                id="application-icon"
                value={draft.icon}
                onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))}
              >
                {APPLICATION_ICON_OPTIONS.map((icon) => (
                  <option key={icon.value} value={icon.value}>{icon.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="application-order">Orden</Label>
              <Input
                id="application-order"
                type="number"
                min={-10_000}
                max={10_000}
                step={1}
                value={draft.sortOrder}
                required
                onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Los valores menores aparecen primero dentro de la categoría.</p>
            </div>
          </div>

          <fieldset className="space-y-3 rounded-xl border border-border bg-card p-4">
            <legend className="px-1 text-sm font-semibold">Visibilidad por rol</legend>
            <p className="text-xs text-muted-foreground">
              Sin roles seleccionados será visible para cualquier visitante. Al seleccionar roles, solo esos usuarios la recibirán.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((role) => (
                <label key={role.value} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.visibleRoles.includes(role.value)}
                    onChange={() => toggleRole(role.value)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  {role.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
              <input
                type="checkbox"
                checked={draft.openInNewTab}
                onChange={(event) => setDraft((current) => ({ ...current, openInNewTab: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
              />
              <span>
                <span className="block font-semibold">Abrir en pestaña nueva</span>
                <span className="text-xs text-muted-foreground">Recomendado para servicios externos.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
              />
              <span>
                <span className="block font-semibold">Aplicación activa</span>
                <span className="text-xs text-muted-foreground">Solo las activas pueden mostrarse a su audiencia.</span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ApplicationIcon icon={draft.icon} label={draft.name || 'Vista previa'} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{draft.name || 'Vista previa'}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {draft.visibleRoles.length ? draft.visibleRoles.map((role) => ROLES.find((item) => item.value === role)?.label).join(', ') : 'Visible para todos'}
                </p>
              </div>
            </div>
            <Button type="submit" disabled={!draftValid || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {editing ? 'Guardar cambios' : 'Crear aplicación'}
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchText.trim());
            setPage(1);
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Label htmlFor="application-search" className="sr-only">Buscar aplicaciones</Label>
            <Input
              id="application-search"
              type="search"
              value={searchText}
              maxLength={100}
              placeholder="Buscar por nombre, descripción o categoría"
              className="pl-9"
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="application-status" className="sr-only">Filtrar por estado</Label>
            <Select
              id="application-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
            >
              <option value="all">Todos los estados</option>
              <option value="true">Activas</option>
              <option value="false">Inactivas</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
      </div>

      {applicationsQuery.isLoading && (
        <div role="status" className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando aplicaciones…
        </div>
      )}
      {applicationsQuery.isError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
          <p>No se pudo cargar el listado administrativo.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void applicationsQuery.refetch()}>
            <RefreshCw /> Reintentar
          </Button>
        </div>
      )}
      {applicationsQuery.isSuccess && applications.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border py-14 text-center">
          <Grid3X3 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {search || status !== 'all' ? 'No hay aplicaciones que coincidan con los filtros.' : 'Aún no hay aplicaciones configuradas.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {applications.map((application) => (
          <article key={application.id} className={cn(
            'rounded-2xl border border-border bg-card p-4 shadow-sm',
            !application.isActive && 'opacity-70',
          )}>
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <ApplicationIcon icon={application.icon} label={application.name} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold">{application.name}</h2>
                  <Badge variant={application.isActive ? 'success' : 'secondary'}>
                    {application.isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <Badge variant="outline">Orden {application.sortOrder}</Badge>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-accent">{application.category}</p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{application.description}</p>
                <p className="mt-2 truncate text-[11px] text-muted-foreground">{application.url}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {application.visibleRoles.length === 0 ? (
                    <Badge variant="secondary">Todos los visitantes</Badge>
                  ) : application.visibleRoles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {ROLES.find((item) => item.value === role)?.label ?? role}
                    </Badge>
                  ))}
                  {application.openInNewTab && <Badge variant="outline">Nueva pestaña</Badge>}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              <ApplicationLink
                url={application.url}
                openInNewTab
                className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowUpRight className="h-4 w-4" /> Probar enlace
              </ApplicationLink>
              <Button size="sm" variant="ghost" onClick={() => openEdit(application)}>
                <Pencil /> Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={toggleActive.isPending}
                onClick={() => requestToggle(application)}
              >
                {application.isActive ? <EyeOff /> : <Eye />}
                {application.isActive ? 'Desactivar' : 'Activar'}
              </Button>
              <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => requestDelete(application)}>
                <Trash2 /> Eliminar
              </Button>
            </div>
          </article>
        ))}
      </div>

      {applicationsQuery.isSuccess && (applicationsQuery.data.pages ?? 1) > 1 && (
        <nav aria-label="Paginación de aplicaciones" className="flex items-center justify-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {applicationsQuery.data.page ?? page} de {applicationsQuery.data.pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= (applicationsQuery.data.pages ?? 1)}
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </div>
  );
}
