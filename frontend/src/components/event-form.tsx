'use client';

import { ChangeEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api } from '@/lib/api';
import type { Community, EventItem, MediaAssetLite } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { EVENT_CATEGORIES } from '@/lib/utils';

const schema = z.object({
  title: z.string().min(5, 'Usa al menos 5 caracteres').max(140),
  description: z.string().min(10, 'Usa al menos 10 caracteres').max(10_000),
  category: z.string().min(1, 'Selecciona una categoría'),
  startsAt: z.string().min(1, 'Indica fecha y hora'),
  endsAt: z.string().optional(),
  location: z.string().max(120).optional().or(z.literal('')),
  isOnline: z.boolean().optional(),
  meetingUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  rulesUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  coverUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  capacity: z.string().optional(),
  isFeatured: z.boolean().optional(),
  communitySlug: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function defaults(initial?: EventItem): FormData {
  return {
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? '',
    startsAt: localDateTime(initial?.startsAt),
    endsAt: localDateTime(initial?.endsAt),
    location: initial?.location ?? '',
    isOnline: initial?.isOnline ?? false,
    meetingUrl: initial?.meetingUrl ?? '',
    rulesUrl: initial?.rulesUrl ?? '',
    coverUrl: initial?.coverUrl ?? '',
    capacity: initial?.capacity ? String(initial.capacity) : '',
    isFeatured: initial?.isFeatured ?? false,
    communitySlug: initial?.community?.slug ?? '',
  };
}

export function EventForm({ initial }: { initial?: EventItem }) {
  const router = useRouter();
  const editing = !!initial;
  const [serverError, setServerError] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: communities } = useQuery({ queryKey: ['communities'], queryFn: () => api.get<Community[]>('/communities') });
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: defaults(initial) });
  const coverUrl = useWatch({ control, name: 'coverUrl' });

  const uploadCover = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setServerError(null);
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setServerError('La portada debe ser una imagen de hasta 8 MB.');
      return;
    }
    setCoverUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const asset = await api.post<MediaAssetLite>('/media/upload', body);
      setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo optimizar la portada');
    } finally {
      setCoverUploading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const payload = {
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category,
        startsAt: new Date(data.startsAt).toISOString(),
        endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
        location: data.location?.trim() || null,
        isOnline: !!data.isOnline,
        meetingUrl: data.meetingUrl?.trim() || null,
        rulesUrl: data.rulesUrl?.trim() || null,
        coverUrl: data.coverUrl?.trim() || null,
        capacity: data.capacity ? Number(data.capacity) : null,
        isFeatured: !!data.isFeatured,
        communitySlug: data.communitySlug || null,
      };
      const event = editing
        ? await api.patch<{ slug: string }>(`/events/${initial.id}`, payload)
        : await api.post<{ slug: string }>('/events', payload);
      router.push(`/eventos/${event.slug}`);
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo guardar el evento');
    }
  };

  const remove = async () => {
    if (!initial || !window.confirm(`¿Eliminar definitivamente el evento “${initial.title}”? También se quitará su galería.`)) return;
    setDeleting(true);
    setServerError(null);
    try {
      await api.delete(`/events/${initial.id}`);
      router.push('/eventos');
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo eliminar el evento');
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
      <div className="space-y-1.5">
        <Label htmlFor="event-title">Título *</Label>
        <Input id="event-title" placeholder="CTF ISI 2026" {...register('title')} />
        {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="event-description">Descripción *</Label>
        <Textarea id="event-description" rows={5} {...register('description')} />
        {errors.description && <p className="text-xs text-danger">{errors.description.message}</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="event-category">Categoría *</Label>
          <Select id="event-category" {...register('category')}>
            <option value="">Selecciona…</option>
            {Object.entries(EVENT_CATEGORIES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
          </Select>
          {errors.category && <p className="text-xs text-danger">{errors.category.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-community">Comunidad organizadora</Label>
          <Select id="event-community" {...register('communitySlug')}>
            <option value="">Ninguna</option>
            {(communities ?? []).map((community) => <option key={community.slug} value={community.slug}>{community.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-start">Inicio *</Label>
          <Input id="event-start" type="datetime-local" {...register('startsAt')} />
          {errors.startsAt && <p className="text-xs text-danger">{errors.startsAt.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-end">Fin (opcional)</Label>
          <Input id="event-end" type="datetime-local" {...register('endsAt')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-location">Lugar</Label>
          <Input id="event-location" placeholder="Laboratorio 3" {...register('location')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-capacity">Capacidad (cupos)</Label>
          <Input id="event-capacity" type="number" min={1} placeholder="40" {...register('capacity')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-rules">Bases / reglamento (URL)</Label>
          <Input id="event-rules" placeholder="https://…/bases.pdf" {...register('rulesUrl')} />
          {errors.rulesUrl && <p className="text-xs text-danger">{errors.rulesUrl.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-meeting">Enlace de reunión</Label>
          <Input id="event-meeting" placeholder="https://teams.microsoft.com/…" {...register('meetingUrl')} />
          {errors.meetingUrl && <p className="text-xs text-danger">{errors.meetingUrl.message}</p>}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-4">
        <Label htmlFor="event-cover">Portada</Label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:border-primary/50">
            {coverUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {coverUploading ? 'Optimizando…' : 'Subir y comprimir'}
            <input id="event-cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={coverUploading} onChange={uploadCover} />
          </label>
          <span className="text-xs text-muted-foreground">Se convierte a WebP, sin metadatos y máximo 1920 px.</span>
        </div>
        <Input aria-label="URL de portada" placeholder="O pega una URL https://…" {...register('coverUrl')} />
        {errors.coverUrl && <p className="text-xs text-danger">{errors.coverUrl.message}</p>}
        {coverUrl && <img src={coverUrl} alt="Vista previa de portada" className="h-36 w-full rounded-lg border border-border object-cover" />}
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-accent" {...register('isOnline')} /> Evento en línea
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-accent" {...register('isFeatured')} /> Destacar como evento principal
        </label>
      </div>
      {serverError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{serverError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isSubmitting || coverUploading || deleting} size="lg" className="flex-1">
          {isSubmitting ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <CalendarPlus />}
          {isSubmitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear evento'}
        </Button>
        {editing && (
          <Button type="button" variant="destructive" size="lg" disabled={isSubmitting || deleting} onClick={remove}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} {deleting ? 'Eliminando…' : 'Eliminar'}
          </Button>
        )}
      </div>
    </form>
  );
}
