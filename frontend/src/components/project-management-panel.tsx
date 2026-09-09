'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import {
  Archive, ArrowLeft, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileClock, History, ImagePlus, Images,
  Loader2, MapPin, Newspaper, Pencil, Plus, RefreshCcw, RotateCcw, Save, Settings2, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import type {
  IncubatorClient, MediaAssetLite, News, ProjectAuditEntry, ProjectManagementDetail, ProjectMilestone,
} from '@/lib/types';
import { cn, formatDate, NEWS_CATEGORIES, PROJECT_STAGES } from '@/lib/utils';
import { buildGoogleCalendarUrl } from '@/lib/google-calendar';
import { MediaUploadButton } from '@/components/media-upload-button';
import { StatusBadge } from '@/components/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import {
  CatalogMultiCombobox,
  type CatalogOption,
  type DirectoryUserOption,
  UserDirectoryMultiCombobox,
} from '@/components/remote-selectors';
import { IncubatorClientSelector } from '@/components/incubator-client-selector';

const TABS = [
  { id: 'data' as const, label: 'Datos', icon: Settings2, panelId: 'project-manage-panel' },
  { id: 'calendar' as const, label: 'Calendario', icon: CalendarDays, panelId: 'project-manage-panel' },
  { id: 'news' as const, label: 'Noticias', icon: Newspaper, panelId: 'project-manage-panel' },
  { id: 'gallery' as const, label: 'Imágenes', icon: Images, panelId: 'project-manage-panel' },
  { id: 'history' as const, label: 'Historial', icon: History, panelId: 'project-manage-panel' },
] as const;

export type ProjectManagementTab = (typeof TABS)[number]['id'];
type TabId = ProjectManagementTab;

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return 'El proyecto cambió, recarga antes de guardar.';
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function AccessSummary({ detail }: { detail: ProjectManagementDetail }) {
  const role = detail.access.role
    ?? (detail.access.isAdmin ? 'ADMIN' : detail.access.isOwner ? 'Líder' : 'Colaborador');
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-xs">
      <span className="flex items-center gap-1.5 font-bold text-primary">
        {detail.access.isAdmin ? <ShieldCheck className="h-4 w-4 text-orange-500" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
        Acceso: {role === 'ADMIN' ? 'Administrador' : role}
      </span>
      <span className="text-muted-foreground">Versión {detail.version}</span>
      <span className="text-muted-foreground">Todas las acciones de este panel quedan registradas.</span>
    </div>
  );
}

type ProjectDataForm = {
  title: string;
  summary: string;
  description: string;
  coverUrl: string;
  repoUrl: string;
  demoUrl: string;
  videoUrl: string;
  phase: string;
  stage: string;
  tags: string;
  technologies: string;
  memberUsernames: string;
  recruiting: boolean;
  isIncubator: boolean;
};

function DataTab({ detail, refresh }: { detail: ProjectManagementDetail; refresh: () => Promise<unknown> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [technologies, setTechnologies] = useState<CatalogOption[]>([]);
  const [tags, setTags] = useState<CatalogOption[]>([]);
  const [members, setMembers] = useState<DirectoryUserOption[]>([]);
  const [clients, setClients] = useState<IncubatorClient[]>([]);
  const { register, handleSubmit, reset, setValue, control, formState: { isSubmitting } } = useForm<ProjectDataForm>();
  const coverUrl = useWatch({ control, name: 'coverUrl' });
  const isIncubator = useWatch({ control, name: 'isIncubator' });
  const pendingCatalog = (kind: CatalogOption['kind']) => async (name: string): Promise<CatalogOption> => ({
    id: `pending:${kind}:${name.trim().toLocaleLowerCase('es').replace(/\s+/g, '-')}`,
    kind,
    name: name.trim().replace(/\s+/g, ' '),
  });

  useEffect(() => {
    const technologyOptions: CatalogOption[] = (detail.technologies ?? []).map((technology) => ({
      id: technology.id ?? `existing:technology:${technology.name}`,
      kind: 'TECHNOLOGY',
      name: technology.name,
    }));
    const tagOptions: CatalogOption[] = detail.tags.map((name) => ({
      id: `existing:tag:${name}`,
      kind: 'TAG',
      name,
    }));
    const memberOptions: DirectoryUserOption[] = (detail.members ?? [])
      .map((member) => member.user)
      .filter((member) => member.username !== detail.owner?.username)
      .map((member) => ({
        id: member.id,
        username: member.username,
        profile: member.profile,
        roles: member.roles,
      }));
    setTechnologies(technologyOptions);
    setTags(tagOptions);
    setMembers(memberOptions);
    setClients(detail.clients ?? []);
    reset({
      title: detail.title,
      summary: detail.summary,
      description: detail.description ?? '',
      coverUrl: detail.coverUrl ?? '',
      repoUrl: detail.repoUrl ?? '',
      demoUrl: detail.demoUrl ?? '',
      videoUrl: detail.videoUrl ?? '',
      phase: detail.phase ?? '',
      stage: detail.stage,
      tags: tagOptions.map((tag) => tag.name).join(', '),
      technologies: technologyOptions.map((technology) => technology.name).join(', '),
      memberUsernames: memberOptions.map((member) => member.username).join(', '),
      recruiting: detail.recruiting,
      isIncubator: detail.isIncubator,
    });
  }, [detail, reset]);

  const submit = async (form: ProjectDataForm) => {
    setError(null);
    setMessage(null);
    const selectedClientIds = clients.map((client) => client.id);
    const previousClientIds = (detail.clients ?? []).map((client) => client.id);
    const clientsChanged = [...selectedClientIds].sort().join('|') !== [...previousClientIds].sort().join('|');
    const body: Record<string, unknown> = {
      expectedVersion: detail.version,
      title: form.title,
      summary: form.summary,
      description: form.description,
      coverUrl: form.coverUrl || null,
      repoUrl: form.repoUrl || null,
      demoUrl: form.demoUrl || null,
      videoUrl: form.videoUrl || null,
      phase: form.phase || null,
      stage: form.stage,
      tags: tags.map((tag) => tag.name),
      technologies: technologies.map((technology) => technology.name),
      recruiting: form.recruiting,
      isIncubator: form.isIncubator,
      resubmit: ['OBSERVED', 'REJECTED', 'DRAFT'].includes(detail.status),
    };
    if (clientsChanged || form.isIncubator !== detail.isIncubator) {
      body.clientIds = form.isIncubator ? selectedClientIds : [];
    }
    if (detail.access.canManageMembers) {
      body.memberUsernames = members.map((member) => member.username);
    }
    try {
      await api.patch(`/projects/${detail.id}`, body);
      setMessage('Cambios guardados y registrados correctamente.');
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) await refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7">
      {detail.publicStatus === 'APPROVED' && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          La publicación actual seguirá visible. Estos cambios crearán una versión separada que requiere aprobación.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field className="sm:col-span-2" label="Título"><Input required minLength={5} maxLength={140} {...register('title')} /></Field>
        <Field className="sm:col-span-2" label="Resumen"><Textarea required minLength={10} maxLength={300} rows={3} {...register('summary')} /></Field>
        <Field className="sm:col-span-2" label="Descripción"><Textarea required minLength={30} rows={8} {...register('description')} /></Field>
        <Field label="Etapa">
          <Select {...register('stage')}>
            {Object.entries(PROJECT_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Fase"><Input maxLength={80} placeholder="MVP, piloto, producción…" {...register('phase')} /></Field>
        <Field label="Repositorio"><Input type="url" placeholder="https://github.com/…" {...register('repoUrl')} /></Field>
        <Field label="Demo"><Input type="url" placeholder="https://…" {...register('demoUrl')} /></Field>
        <Field label="Video"><Input type="url" placeholder="https://…" {...register('videoUrl')} /></Field>
        <Field label="Portada">
          <Input type="url" placeholder="https://…/portada.webp" {...register('coverUrl')} />
          <MediaUploadButton
            kind="image"
            disabled={isSubmitting}
            previewUrl={coverUrl}
            previewAlt="Vista previa de la portada del proyecto"
            onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true })}
            onRemove={() => setValue('coverUrl', '', { shouldDirty: true })}
          />
        </Field>
        <div className="space-y-1.5 sm:col-span-2">
          <input type="hidden" {...register('technologies')} />
          <CatalogMultiCombobox
            kind="TECHNOLOGY"
            label="Tecnologías"
            value={technologies}
            onChange={(value) => {
              setTechnologies(value);
              setValue('technologies', value.map((item) => item.name).join(', '));
            }}
            allowCreate
            onCreate={pendingCatalog('TECHNOLOGY')}
            placeholder="Busca o crea tecnologías"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <input type="hidden" {...register('tags')} />
          <CatalogMultiCombobox
            kind="TAG"
            label="Tags"
            value={tags}
            onChange={(value) => {
              setTags(value);
              setValue('tags', value.map((item) => item.name).join(', '));
            }}
            allowCreate
            onCreate={pendingCatalog('TAG')}
            placeholder="Busca o crea tags"
          />
        </div>
        {detail.access.canManageMembers && (
          <div className="space-y-1.5 sm:col-span-2">
            <input type="hidden" {...register('memberUsernames')} />
            <UserDirectoryMultiCombobox
              label="Integrantes (sin incluir al líder)"
              value={members}
              onChange={(value) => {
                setMembers(value);
                setValue('memberUsernames', value.map((member) => member.username).join(', '));
              }}
              placeholder="Busca por nombre o usuario"
            />
            <p className="text-[11px] text-muted-foreground">Solo el líder y el administrador pueden cambiar el equipo.</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-accent" {...register('recruiting')} /> Busca integrantes</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-accent" {...register('isIncubator')} /> Proyecto de incubadora</label>
      </div>
      {isIncubator && (
        <section className="space-y-3 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
          <div>
            <h3 className="font-serif-heading text-lg font-bold text-primary">Nuestros clientes</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Asocia empresas existentes o registra una nueva para incorporarla a la cartera.
            </p>
          </div>
          <IncubatorClientSelector
            value={clients}
            onChange={setClients}
            disabled={isSubmitting}
          />
        </section>
      )}
      <OperationResult message={message} error={error} />
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} Guardar datos</Button>
    </form>
  );
}

type MilestoneForm = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  status: ProjectMilestone['status'];
  location: string;
  url: string;
};

const EMPTY_MILESTONE: MilestoneForm = {
  title: '', description: '', startsAt: '', endsAt: '', allDay: false, status: 'PLANNED', location: '', url: '',
};

const MILESTONE_STATUS: Record<ProjectMilestone['status'], string> = {
  PLANNED: 'Planificado', IN_PROGRESS: 'En curso', COMPLETED: 'Completado', CANCELLED: 'Cancelado',
};

function CalendarTab({ detail, refresh }: { detail: ProjectManagementDetail; refresh: () => Promise<unknown> }) {
  const [editing, setEditing] = useState<ProjectMilestone | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<MilestoneForm>({ defaultValues: EMPTY_MILESTONE });

  const close = () => { setEditing(null); setShowForm(false); setError(null); reset(EMPTY_MILESTONE); };
  const edit = (milestone: ProjectMilestone) => {
    setEditing(milestone);
    setShowForm(true);
    setError(null);
    reset({
      title: milestone.title,
      description: milestone.description ?? '',
      startsAt: localDateTime(milestone.startsAt),
      endsAt: localDateTime(milestone.endsAt),
      allDay: milestone.allDay,
      status: milestone.status,
      location: milestone.location ?? '',
      url: milestone.url ?? '',
    });
  };
  const submit = async (form: MilestoneForm) => {
    setError(null);
    if (form.endsAt && new Date(form.endsAt) < new Date(form.startsAt)) {
      setError('La fecha final no puede ser anterior a la inicial.');
      return;
    }
    const body = {
      expectedVersion: detail.version,
      title: form.title,
      description: form.description || null,
      startsAt: toIso(form.startsAt),
      endsAt: toIso(form.endsAt),
      allDay: form.allDay,
      status: form.status,
      location: form.location || null,
      url: form.url || null,
    };
    try {
      if (editing) await api.patch(`/projects/${detail.id}/milestones/${editing.id}`, body);
      else await api.post(`/projects/${detail.id}/milestones`, body);
      close();
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) await refresh();
    }
  };
  const remove = async (milestone: ProjectMilestone) => {
    if (!window.confirm(`¿Eliminar el hito “${milestone.title}”? Esta acción quedará registrada.`)) return;
    setError(null);
    try {
      await api.delete(`/projects/${detail.id}/milestones/${milestone.id}?expectedVersion=${detail.version}`);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) await refresh();
    }
  };

  const milestones = [...detail.milestones].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-serif-heading text-xl font-bold text-primary">Calendario del proyecto</h2><p className="text-sm text-muted-foreground">Registra entregas, reuniones y fechas clave.</p></div>
        <Button variant="accent" onClick={() => showForm ? close() : setShowForm(true)}>{showForm ? <X /> : <Plus />} {showForm ? 'Cerrar' : 'Agregar hito'}</Button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit(submit)} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-bold">{editing ? 'Editar hito' : 'Nuevo hito'}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Título"><Input required minLength={3} maxLength={140} {...register('title')} /></Field>
            <Field className="sm:col-span-2" label="Descripción"><Textarea maxLength={600} rows={3} {...register('description')} /></Field>
            <Field label="Inicio"><Input required type="datetime-local" {...register('startsAt')} /></Field>
            <Field label="Fin"><Input type="datetime-local" {...register('endsAt')} /></Field>
            <Field label="Estado"><Select {...register('status')}>{Object.entries(MILESTONE_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Lugar"><Input maxLength={160} placeholder="Laboratorio, sala virtual…" {...register('location')} /></Field>
            <Field className="sm:col-span-2" label="Enlace"><Input type="url" placeholder="https://…" {...register('url')} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-accent" {...register('allDay')} /> Es un evento de todo el día</label>
          <OperationResult error={error} />
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} {editing ? 'Guardar hito' : 'Crear hito'}</Button>
        </form>
      )}
      {!showForm && error && <OperationResult error={error} />}
      {milestones.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Todavía no hay fechas" text="Agrega el primer hito para que el equipo tenga claro el siguiente paso." />
      ) : (
        <div className="space-y-3">
          {milestones.map((milestone) => (
            <article key={milestone.id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{milestone.title}</h3><span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold">{MILESTONE_STATUS[milestone.status]}</span></div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> {formatDate(milestone.startsAt, !milestone.allDay)}{milestone.endsAt ? ` — ${formatDate(milestone.endsAt, !milestone.allDay)}` : ''}</p>
                {milestone.location && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {milestone.location}</p>}
                {milestone.description && <p className="pt-1 text-sm text-foreground/80">{milestone.description}</p>}
                <div className="flex flex-wrap gap-3 pt-1">
                  {milestone.url && <a href={milestone.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Abrir enlace <ExternalLink className="h-3 w-3" /></a>}
                  <a
                    href={buildGoogleCalendarUrl({
                      title: `${detail.title}: ${milestone.title}`,
                      description: milestone.description || `Hito del proyecto ${detail.title}`,
                      startsAt: milestone.startsAt,
                      endsAt: milestone.endsAt,
                      location: milestone.location,
                      isOnline: false,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <CalendarDays className="h-3.5 w-3.5" /> Agregar a Google Calendar
                  </a>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => edit(milestone)}><Pencil /> Editar</Button>
                <Button size="icon" variant="ghost" className="text-danger" aria-label={`Eliminar ${milestone.title}`} onClick={() => void remove(milestone)}><Trash2 /></Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

type ProjectNews = News & { createdAt?: string };
type NewsResponse = ProjectNews[] | { items: ProjectNews[] };
type NewsForm = { title: string; summary: string; content: string; category: string; coverUrl: string; tags: string };
const EMPTY_NEWS: NewsForm = { title: '', summary: '', content: '', category: '', coverUrl: '', tags: '' };

function NewsTab({ detail, refreshProject }: { detail: ProjectManagementDetail; refreshProject: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProjectNews | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project-manage-news', detail.id],
    queryFn: () => api.get<NewsResponse>(`/projects/${detail.id}/news`),
    retry: false,
  });
  const news = Array.isArray(data) ? data : data?.items ?? [];
  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm<NewsForm>({ defaultValues: EMPTY_NEWS });
  const close = () => { setEditing(null); setShowForm(false); setError(null); reset(EMPTY_NEWS); };
  const edit = (item: ProjectNews) => {
    setEditing(item); setShowForm(true); setError(null);
    reset({ title: item.title, summary: item.summary, content: item.content ?? '', category: item.category, coverUrl: item.coverUrl ?? '', tags: item.tags.join(', ') });
  };
  const submit = async (form: NewsForm) => {
    setError(null);
    const body = {
      expectedVersion: detail.version,
      title: form.title,
      summary: form.summary,
      content: form.content,
      category: form.category,
      coverUrl: form.coverUrl || null,
      tags: form.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    };
    try {
      if (editing) await api.patch(`/projects/${detail.id}/news/${editing.id}`, body);
      else await api.post(`/projects/${detail.id}/news`, body);
      close();
      await Promise.all([refetch(), refreshProject()]);
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) await refreshProject();
    }
  };
  const archive = async (item: ProjectNews) => {
    if (!window.confirm(`¿Archivar la noticia “${item.title}”?\n\nDejará de mostrarse públicamente, pero se conservará en el historial y un administrador podrá revertir la acción.`)) return;
    setError(null);
    try {
      await api.delete(`/projects/${detail.id}/news/${item.id}?expectedVersion=${detail.version}`);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['project-manage-news', detail.id] }), refreshProject()]);
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) await refreshProject();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-serif-heading text-xl font-bold text-primary">Noticias del proyecto</h2><p className="text-sm text-muted-foreground">Comparte avances, resultados y novedades del equipo.</p></div>
        <Button variant="accent" onClick={() => showForm ? close() : setShowForm(true)}>{showForm ? <X /> : <Plus />} {showForm ? 'Cerrar' : 'Nueva noticia'}</Button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit(submit)} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-bold">{editing ? 'Editar noticia' : 'Agregar noticia'}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Título"><Input required minLength={5} maxLength={160} {...register('title')} /></Field>
            <Field className="sm:col-span-2" label="Resumen"><Textarea required minLength={10} maxLength={400} rows={3} {...register('summary')} /></Field>
            <Field label="Categoría"><Select required {...register('category')}><option value="">Selecciona…</option>{Object.entries(NEWS_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Portada"><Input type="url" {...register('coverUrl')} /><MediaUploadButton kind="image" disabled={isSubmitting} onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true })} /></Field>
            <Field className="sm:col-span-2" label="Contenido"><Textarea required minLength={20} rows={7} {...register('content')} /></Field>
            <Field className="sm:col-span-2" label="Tags (separados por coma)"><Input {...register('tags')} /></Field>
          </div>
          <OperationResult error={error} />
          {!editing && <p className="text-xs text-muted-foreground">Si el proyecto ya está publicado, la noticia será visible de inmediato; de lo contrario quedará como borrador.</p>}
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} {editing ? 'Guardar noticia' : 'Agregar noticia'}</Button>
        </form>
      )}
      {!showForm && error && <OperationResult error={error} />}
      {isLoading && <LoadingLabel text="Cargando noticias…" />}
      {isError && !isLoading && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm"><p>No se pudieron cargar las noticias del proyecto.</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void refetch()}><RefreshCcw /> Reintentar</Button></div>
      )}
      {!isLoading && !isError && news.length === 0 && <EmptyState icon={Newspaper} title="Sin noticias todavía" text="Publica el primer avance del proyecto." />}
      {!isLoading && !isError && news.length > 0 && (
        <div className="space-y-3">
          {news.map((item) => (
            <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item.title}</h3>{item.status && <StatusBadge status={item.status} />}</div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p><p className="mt-1 text-xs text-muted-foreground">{NEWS_CATEGORIES[item.category] ?? item.category} · {formatDate(item.publishedAt ?? item.createdAt)}</p></div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => edit(item)}><Pencil /> Editar</Button>
                {item.status !== 'ARCHIVED' && (
                  <Button size="sm" variant="ghost" aria-label={`Archivar ${item.title}`} onClick={() => void archive(item)}><Archive /> Archivar</Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryTab({ detail, refresh }: { detail: ProjectManagementDetail; refresh: () => Promise<unknown> }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    if (detail.gallery.length + files.length > 12) {
      setError('La galería admite un máximo de 12 imágenes.');
      return;
    }
    const invalid = files.find((file) => !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024);
    if (invalid) { setError('Selecciona imágenes válidas de hasta 8 MB cada una.'); return; }
    setUploading(true); setError(null); setMessage(null);
    try {
      let expectedVersion = detail.version;
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        const asset = await api.post<MediaAssetLite>('/media/upload', body);
        try {
          const linked = await api.post<{ version?: number }>(`/projects/${detail.id}/gallery`, { mediaId: asset.id, expectedVersion });
          if (typeof linked?.version === 'number') expectedVersion = linked.version;
          else expectedVersion += 1;
        } catch (cause) {
          await api.delete(`/media/${asset.id}`).catch(() => undefined);
          throw cause;
        }
      }
      setMessage(`${files.length === 1 ? 'Imagen agregada' : `${files.length} imágenes agregadas`} y optimizada${files.length === 1 ? '' : 's'} correctamente.`);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) await refresh();
    } finally {
      setUploading(false);
    }
  };
  const remove = async (asset: MediaAssetLite) => {
    if (!window.confirm('¿Eliminar esta imagen de la galería? La acción quedará registrada.')) return;
    setError(null); setMessage(null);
    try {
      await api.delete(`/projects/${detail.id}/gallery/${asset.id}?expectedVersion=${detail.version}`);
      setMessage('Imagen eliminada correctamente.');
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) await refresh();
    }
  };
  const setAsCover = async (asset: MediaAssetLite) => {
    setError(null); setMessage(null);
    try {
      await api.patch(`/projects/${detail.id}`, { coverUrl: asset.url, expectedVersion: detail.version });
      setMessage('La portada del proyecto fue actualizada.');
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) await refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-serif-heading text-xl font-bold text-primary">Galería de imágenes</h2><p className="text-sm text-muted-foreground">Las imágenes se comprimen automáticamente para ahorrar almacenamiento.</p></div>
        <label className={cn(buttonVariants({ variant: 'accent' }), uploading && 'pointer-events-none opacity-50')}>
          {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} {uploading ? 'Procesando…' : 'Agregar imágenes'}
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={uploading} onChange={upload} />
        </label>
      </div>
      <OperationResult message={message} error={error} />
      {detail.gallery.length === 0 ? (
        <EmptyState icon={Images} title="La galería está vacía" text="Sube capturas, resultados o fotografías del equipo." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {detail.gallery.map((asset, index) => (
            <figure key={asset.id} className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="relative h-44 w-full">
                <Image
                  src={asset.url}
                  alt={`${detail.title} — imagen ${index + 1}`}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  unoptimized
                  className="object-cover"
                />
              </div>
              <figcaption className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="text-[11px] text-muted-foreground">{asset.width && asset.height ? `${asset.width}×${asset.height}` : 'Imagen optimizada'}</span>
                <div className="flex gap-1"><Button size="sm" variant="outline" disabled={detail.coverUrl === asset.url} onClick={() => void setAsCover(asset)}>{detail.coverUrl === asset.url ? 'Es portada' : 'Usar de portada'}</Button><Button size="icon" variant="ghost" className="text-danger" aria-label={`Eliminar imagen ${index + 1}`} onClick={() => void remove(asset)}><Trash2 /></Button></div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{detail.gallery.length}/12 imágenes utilizadas.</p>
    </div>
  );
}

type AuditResponse = ProjectAuditEntry[] | { items: ProjectAuditEntry[] };

function AuditDeliveryBadge({ delivery }: { delivery: ProjectAuditEntry['delivery'] }) {
  if (!delivery) return null;
  const labels = {
    PENDING: 'Aviso pendiente',
    PROCESSING: 'Enviando aviso',
    SENT: 'Alerta externa enviada',
    SKIPPED: 'Aviso interno enviado',
    FAILED: 'Falló la alerta',
  } as const;
  const isFailure = delivery.status === 'FAILED';
  return (
    <span
      title={isFailure && delivery.lastError ? delivery.lastError : undefined}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-bold',
        isFailure
          ? 'border-danger/30 bg-danger/10 text-danger'
          : 'border-border bg-secondary text-muted-foreground',
      )}
    >
      {labels[delivery.status]}
    </span>
  );
}

function HistoryTab({ detail, refreshProject, highlightedAuditId }: { detail: ProjectManagementDetail; refreshProject: () => Promise<unknown>; highlightedAuditId?: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project-audit', detail.id],
    queryFn: () => api.get<AuditResponse>(`/projects/${detail.id}/audit`),
    enabled: detail.access.isAdmin,
    retry: false,
  });
  const entries = Array.isArray(data) ? data : data?.items ?? [];
  useEffect(() => {
    if (!highlightedAuditId || isLoading || entries.length === 0) return;
    const target = document.getElementById(`project-audit-${highlightedAuditId}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  }, [entries.length, highlightedAuditId, isLoading]);
  const rollback = useMutation({
    mutationFn: ({ entry, reason }: { entry: ProjectAuditEntry; reason: string }) => api.post(`/projects/${detail.id}/audit/${entry.id}/rollback`, { expectedVersion: detail.version, reason }),
    onSuccess: async () => { setError(null); await Promise.all([refetch(), refreshProject()]); },
    onError: async (cause: unknown) => { setError(errorMessage(cause)); if (cause instanceof ApiError && cause.status === 409) await refreshProject(); },
  });
  const confirmRollback = (entry: ProjectAuditEntry) => {
    const actor = entry.actorNameSnapshot ?? entry.actor?.profile?.fullName ?? entry.actorUsernameSnapshot ?? entry.actor?.username ?? 'usuario desconocido';
    const email = entry.actorEmailSnapshot ?? entry.actorEmail ?? entry.actor?.email ?? 'correo no disponible';
    const reason = window.prompt(`Motivo del rollback de la edición de ${actor} (${email}).\nEs obligatorio e irá al registro de auditoría (10 a 300 caracteres):`);
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (cleanReason.length < 10 || cleanReason.length > 300) {
      setError('El motivo del rollback debe tener entre 10 y 300 caracteres.');
      return;
    }
    if (window.confirm(`¿Confirmas el rollback?\n\nSe restaurarán los valores anteriores y se creará una nueva entrada de auditoría.`)) {
      rollback.mutate({ entry, reason: cleanReason });
    }
  };

  if (!detail.access.isAdmin) return null;
  if (isLoading) return <LoadingLabel text="Cargando historial protegido…" />;
  if (isError) return <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm">No se pudo cargar el historial.<Button size="sm" variant="outline" className="mt-3" onClick={() => void refetch()}><RefreshCcw /> Reintentar</Button></div>;
  return (
    <div className="space-y-4">
      <div><h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary"><ShieldCheck className="h-5 w-5 text-orange-500" /> Registro de ediciones</h2><p className="text-sm text-muted-foreground">Vista privada para administradores. Identifica quién cambió qué y permite revertir ediciones compatibles.</p></div>
      <OperationResult error={error} />
      {entries.length === 0 ? <EmptyState icon={FileClock} title="Sin ediciones registradas" text="Los próximos cambios aparecerán aquí." /> : (
        <ol className="space-y-3">
          {entries.map((entry) => {
            const actorName = entry.actorNameSnapshot ?? entry.actor?.profile?.fullName ?? entry.actorUsernameSnapshot ?? entry.actor?.username ?? 'Usuario eliminado';
            const email = entry.actorEmailSnapshot ?? entry.actorEmail ?? entry.actor?.email;
            const ip = entry.metadata?.request?.ip ?? entry.ipAddress;
            const userAgent = entry.metadata?.request?.userAgent ?? entry.userAgent;
            const risks = entry.metadata?.security?.riskSignals ?? [];
            const changedKeys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
            const wasRolledBack = !!entry.rolledBackAt || (entry.rollbackEntries?.length ?? 0) > 0;
            return (
              <li
                key={entry.id}
                id={`project-audit-${entry.id}`}
                tabIndex={-1}
                className={cn(
                  'rounded-xl border border-border bg-card p-4 shadow-sm outline-none transition',
                  highlightedAuditId === entry.id && 'border-orange-500/60 ring-2 ring-orange-500/20',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{entry.summary || entry.action}</span>{(entry.entityType || entry.section) && <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase">{entry.entityType || entry.section}</span>}{risks.length > 0 && <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">Riesgo: {risks.join(', ')}</span>}<AuditDeliveryBadge delivery={entry.delivery} /></div>
                    <p className="mt-1 text-sm">
                      <span className="font-semibold">{actorName}</span>
                      {entry.actorDeleted && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">cuenta eliminada</span>}
                      {email && <> · <a className="text-primary hover:underline" href={`mailto:${email}`}>{email}</a></>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.createdAt, true)}{ip ? ` · IP ${ip}` : ''}</p>
                    {userAgent && <p className="mt-0.5 max-w-3xl truncate text-[11px] text-muted-foreground" title={userAgent}>Dispositivo: {userAgent}</p>}
                    {changedKeys.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Campos: {changedKeys.join(', ')}</p>}
                  </div>
                  {entry.canRollback && !wasRolledBack && (
                    <Button size="sm" variant="outline" disabled={rollback.isPending} onClick={() => confirmRollback(entry)}><RotateCcw /> Revertir</Button>
                  )}
                  {wasRolledBack && <span className="rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-bold">Revertido</span>}
                </div>
                {(entry.before || entry.after) && (
                  <details className="mt-3 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                    <summary className="cursor-pointer font-semibold">Ver valores auditados</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <AuditValues label="Antes" value={entry.before} />
                      <AuditValues label="Después" value={entry.after} />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function AuditValues({ label, value }: { label: string; value?: Record<string, unknown> | null }) {
  return <div><h4 className="mb-1 font-bold text-primary">{label}</h4><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-2 font-mono text-[10px]">{value ? JSON.stringify(value, null, 2) : '—'}</pre></div>;
}

function OperationResult({ message, error }: { message?: string | null; error?: string | null }) {
  return <>{message && <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">{message}</p>}{error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}</>;
}

function LoadingLabel({ text }: { text: string }) {
  return <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" /> {text}</div>;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Images; title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-9 text-center"><Icon className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-bold text-primary">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={cn('space-y-1.5', className)}><Label>{label}</Label>{children}</div>;
}

export function ProjectManagementPanel({ projectId, initialTab = 'data' }: { projectId: string; initialTab?: TabId }) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const searchParams = useSearchParams();
  const highlightedAuditId = searchParams.get('audit');
  const { data: detail, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['project-manage', projectId],
    queryFn: () => api.get<ProjectManagementDetail>(`/projects/${projectId}/manage`),
    enabled: !!projectId,
    retry: false,
  });
  const tabs = useMemo(() => detail?.access.isAdmin ? TABS : TABS.filter((item) => item.id !== 'history'), [detail?.access.isAdmin]);

  if (isLoading) return <LoadingLabel text="Abriendo gestión del proyecto…" />;
  if (isError || !detail) {
    return (
      <main className="container max-w-4xl py-16">
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 p-7 text-center">
          <h1 className="font-serif-heading text-2xl font-bold text-primary">No se pudo abrir este proyecto</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error instanceof ApiError && [403, 404].includes(error.status) ? 'No está asociado a tu cuenta o ya no tienes permisos para gestionarlo.' : errorMessage(error)}</p>
          <div className="mt-5 flex justify-center gap-2"><Link href="/proyectos/gestionar" className={buttonVariants({ variant: 'outline' })}><ArrowLeft /> Volver</Link><Button onClick={() => void refetch()}><RefreshCcw /> Reintentar</Button></div>
        </div>
      </main>
    );
  }

  const refresh = () => refetch().then((result) => result.data);
  const selectedTab: TabId = tab === 'history' && !detail.access.isAdmin ? 'data' : tab;
  const changeTab = (nextTab: TabId) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    if (nextTab === 'data') url.searchParams.delete('tab');
    else url.searchParams.set('tab', nextTab);
    if (nextTab !== 'history') url.searchParams.delete('audit');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };
  return (
    <main className="container max-w-6xl space-y-6 py-10">
      <Link href="/proyectos/gestionar" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Mis proyectos gestionables</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><span className="section-kicker">Gestión colaborativa</span><h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">{detail.title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{detail.summary}</p></div>
        <div className="flex items-center gap-2"><StatusBadge status={detail.status} />{detail.status === 'APPROVED' && <Link href={`/proyectos/${detail.slug}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>Ver publicación <ExternalLink /></Link>}</div>
      </header>
      <AccessSummary detail={detail} />
      <SegmentedTabs items={tabs} value={selectedTab} onValueChange={changeTab} ariaLabel="Secciones de gestión del proyecto" idPrefix="project-manage" />
      <section id="project-manage-panel" role="tabpanel" aria-labelledby={`project-manage-tab-${selectedTab}`} tabIndex={0} className="min-h-64 focus-visible:outline-none">
        {selectedTab === 'data' && <DataTab detail={detail} refresh={refresh} />}
        {selectedTab === 'calendar' && <CalendarTab detail={detail} refresh={refresh} />}
        {selectedTab === 'news' && <NewsTab detail={detail} refreshProject={refresh} />}
        {selectedTab === 'gallery' && <GalleryTab detail={detail} refresh={refresh} />}
        {selectedTab === 'history' && detail.access.isAdmin && <HistoryTab detail={detail} refreshProject={refresh} highlightedAuditId={highlightedAuditId} />}
      </section>
    </main>
  );
}
