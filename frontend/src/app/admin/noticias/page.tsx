'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, FolderKanban, Loader2, Newspaper, Pencil, Plus, Save, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { formatDate, NEWS_CATEGORIES } from '@/lib/utils';
import type { Community, EventItem, News } from '@/lib/types';
import { MediaUploadButton } from '@/components/media-upload-button';

type CommunityOption = Pick<Community, 'id' | 'slug' | 'name'>;
type EventOption = Pick<EventItem, 'id' | 'slug' | 'title'>;
type AdminNews = News & { content: string; status: string; createdAt: string };
type NewsPatch = Record<string, unknown>;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación';

const schema = z.object({
  title: z.string().min(5).max(160),
  summary: z.string().min(10).max(400),
  content: z.string().min(20),
  category: z.string().min(1, 'Selecciona una categoría'),
  coverUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  tags: z.string().optional(),
  communitySlug: z.string().optional(),
  eventSlug: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function AdminNoticiasPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminNews | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-news'],
    queryFn: () => api.get<{ total: number; items: AdminNews[] }>('/news/admin/all?limit=50'),
  });
  const { data: communities = [] } = useQuery({
    queryKey: ['communities', 'news-editor'],
    queryFn: () => api.get<CommunityOption[]>('/communities'),
  });
  const { data: eventsData } = useQuery({
    queryKey: ['events', 'news-editor'],
    queryFn: () => api.get<{ items: EventOption[] }>('/events'),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-news'] });

  const onSubmit = async (form: FormData) => {
    setError(null);
    try {
      const body = {
        title: form.title,
        summary: form.summary,
        content: form.content,
        category: form.category,
        coverUrl: form.coverUrl || (editing ? null : undefined),
        tags: form.tags ? form.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
        communitySlug: form.communitySlug || (editing ? null : undefined),
        eventSlug: form.eventSlug || (editing ? null : undefined),
        expectedVersion: editing?.project?.version,
      };
      if (editing) await api.patch(`/news/${editing.id}`, body);
      else await api.post('/news', body);
      reset();
      setEditing(null);
      setShowForm(false);
      invalidate();
    } catch (submitError: unknown) {
      setError(errorMessage(submitError));
    }
  };

  const closeEditor = () => {
    reset();
    setEditing(null);
    setShowForm(false);
    setError(null);
  };

  const editNews = (news: AdminNews) => {
    setEditing(news);
    setShowForm(true);
    setError(null);
    reset({
      title: news.title,
      summary: news.summary,
      content: news.content,
      category: news.category,
      coverUrl: news.coverUrl ?? '',
      tags: news.tags.join(', '),
      communitySlug: news.community?.slug ?? '',
      eventSlug: news.event?.slug ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: NewsPatch }) => api.patch(`/news/${id}`, body),
    onSuccess: invalidate,
    onError: (mutationError: unknown) => setError(errorMessage(mutationError)),
  });
  const archive = useMutation({
    mutationFn: (item: AdminNews) => api.delete(`/news/${item.id}${item.project?.version ? `?expectedVersion=${item.project.version}` : ''}`),
    onSuccess: invalidate,
    onError: (mutationError: unknown) => setError(errorMessage(mutationError)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif-heading text-2xl font-bold text-primary">Gestión de noticias</h1>
          <p className="text-sm text-muted-foreground">Crea, publica, edita y archiva noticias del portal.</p>
        </div>
        <Button variant="accent" onClick={() => showForm ? closeEditor() : setShowForm(true)}>
          {showForm ? <X /> : <Plus />} {showForm ? 'Cerrar formulario' : 'Nueva noticia'}
        </Button>
      </div>

      {error && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm animate-fade-in">
          <div>
            <span className="section-kicker">{editing ? 'Edición' : 'Publicación'}</span>
            <h2 className="mt-1 font-serif-heading text-xl font-bold text-primary">{editing ? `Editar “${editing.title}”` : 'Crear noticia'}</h2>
            {editing?.project && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-foreground/80">
                <FolderKanban className="h-3.5 w-3.5 text-accent" />
                Esta noticia pertenece a
                <Link href={`/proyectos/gestionar/${editing.project.id}?tab=news`} className="font-bold text-primary hover:underline">
                  {editing.project.title}
                </Link>
                y sus cambios quedarán en la auditoría del proyecto.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Título *</Label>
              <Input {...register('title')} />
              {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Resumen *</Label>
              <Input {...register('summary')} />
              {errors.summary && <p className="text-xs text-danger">{errors.summary.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select {...register('category')}>
                <option value="">Selecciona…</option>
                {Object.entries(NEWS_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
              {errors.category && <p className="text-xs text-danger">{errors.category.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Imagen principal (URL)</Label>
              <Input placeholder="https://…/imagen.jpg" {...register('coverUrl')} />
              {errors.coverUrl && <p className="text-xs text-danger">{errors.coverUrl.message}</p>}
              <MediaUploadButton kind="image" disabled={isSubmitting} onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Comunidad asociada</Label>
              <Select {...register('communitySlug')}>
                <option value="">Sin comunidad</option>
                {communities.map((community) => (
                  <option key={community.id} value={community.slug}>{community.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Evento relacionado</Label>
              <Select {...register('eventSlug')}>
                <option value="">Sin evento</option>
                {(eventsData?.items ?? []).map((event) => (
                  <option key={event.id} value={event.slug}>{event.title}</option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">Si eliges un evento, su comunidad se asociará automáticamente.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Contenido *</Label>
              <Textarea rows={6} {...register('content')} />
              {errors.content && <p className="text-xs text-danger">{errors.content.message}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tags (por coma)</Label>
              <Input placeholder="convenio, prácticas" {...register('tags')} />
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <Send />} {editing ? 'Guardar cambios' : 'Publicar noticia'}
          </Button>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {(data?.items ?? []).map((n) => (
            <div key={n.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <Newspaper className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{n.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {NEWS_CATEGORIES[n.category] ?? n.category} · {formatDate(n.publishedAt ?? n.createdAt)}
                  </div>
                  {(n.project || n.community || n.event) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
                      {n.project && (
                        <Link href={`/proyectos/gestionar/${n.project.id}?tab=news`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                          <FolderKanban className="h-3 w-3" /> {n.project.title}
                        </Link>
                      )}
                      {n.project && (n.community || n.event) && <span aria-hidden="true">·</span>}
                      <span>{[n.community?.name, n.event?.title].filter(Boolean).join(' · ')}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={n.status} />
                <Button size="sm" variant="outline" disabled={patch.isPending || archive.isPending} onClick={() => editNews(n)}>
                  <Pencil /> Editar
                </Button>
                {n.status !== 'APPROVED' && (
                  <Button size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ id: n.id, body: { status: 'APPROVED', ...(n.project?.version ? { expectedVersion: n.project.version } : {}) } })}>
                    Publicar
                  </Button>
                )}
                {n.status !== 'ARCHIVED' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={archive.isPending}
                    aria-label={`Archivar ${n.title}`}
                    onClick={() => {
                      if (window.confirm(`¿Archivar la noticia “${n.title}”?\n\nDejará de mostrarse públicamente, pero se conservará para auditoría.`)) archive.mutate(n);
                    }}
                  >
                    <Archive /> Archivar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
