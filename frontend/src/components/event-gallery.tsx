/* eslint-disable @next/next/no-img-element */
'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Camera, CheckCircle2, ExternalLink, ImagePlus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

const MAX_GALLERY_IMAGES = 12;
const MAX_SOURCE_SIZE = 8 * 1024 * 1024;

export interface EventGalleryImage {
  id: string;
  url: string;
  mime?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
}

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function EventGallery({ eventId, slug, title, initialImages = [] }: { eventId: string; slug: string; title: string; initialImages?: EventGalleryImage[] }) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { data: access } = useQuery({
    queryKey: ['event-gallery-access', eventId],
    queryFn: () => api.get<{ canManage: boolean }>(`/events/${eventId}/gallery/manage`),
    enabled: !!user,
    retry: false,
  });

  const remaining = MAX_GALLERY_IMAGES - images.length;

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selected.length) return;
    setError(null);
    setResult(null);
    if (selected.length > remaining) {
      setError(`Solo quedan ${remaining} espacios en la galería.`);
      return;
    }
    const invalid = selected.find((file) => !file.type.startsWith('image/') || file.size > MAX_SOURCE_SIZE);
    if (invalid) {
      setError('Cada archivo debe ser una imagen PNG, JPG, WebP o GIF de hasta 8 MB.');
      return;
    }

    setUploading(true);
    const uploaded: EventGalleryImage[] = [];
    const rawBytes = selected.reduce((total, file) => total + file.size, 0);
    let uploadError: string | null = null;
    try {
      for (const file of selected) {
        try {
          const form = new FormData();
          form.append('file', file);
          uploaded.push(await api.post<EventGalleryImage>('/media/upload', form));
        } catch (cause) {
          uploadError = cause instanceof Error ? cause.message : 'No se pudo subir una imagen';
          break;
        }
      }
      if (uploaded.length) {
        const gallery = await api.post<EventGalleryImage[]>(`/events/${eventId}/gallery`, { imageIds: uploaded.map((image) => image.id) });
        setImages(gallery);
        const storedBytes = uploaded.reduce((total, image) => total + (image.sizeBytes ?? 0), 0);
        setResult(`Fotos optimizadas y guardadas: ${readableSize(rawBytes)} → ${readableSize(storedBytes)} en WebP.`);
      }
      if (uploadError) setError(`Se guardaron ${uploaded.length} foto(s), pero otra falló: ${uploadError}`);
    } catch (cause) {
      await Promise.allSettled(uploaded.map((image) => api.delete(`/media/${image.id}`)));
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la galería');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (image: EventGalleryImage) => {
    if (!window.confirm('¿Quitar esta foto de la galería y liberar su archivo?')) return;
    setDeletingId(image.id);
    setError(null);
    setResult(null);
    try {
      const gallery = await api.delete<EventGalleryImage[]>(`/events/${eventId}/gallery/${image.id}`);
      setImages(gallery);
      setResult('La foto se eliminó de la galería y del almacenamiento.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar la foto');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-serif-heading text-lg font-bold text-primary"><Camera className="h-5 w-5" /> Galería del evento</h2>
          <p className="mt-1 text-xs text-muted-foreground">{images.length} de {MAX_GALLERY_IMAGES} fotos</p>
        </div>
        {access?.canManage && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/eventos/${slug}/editar`} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition hover:bg-secondary">
              <Pencil className="h-4 w-4" /> Editar evento
            </Link>
            {remaining > 0 && <>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" onChange={upload} />
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} Agregar fotos
            </Button>
            </>}
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {result && <p role="status" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> {result}</p>}

      {images.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <div
              key={image.id}
              className={`group relative overflow-hidden rounded-xl border border-border bg-secondary ${index === 0 && images.length > 2 ? 'col-span-2 row-span-2' : ''}`}
            >
              <a href={image.url} target="_blank" rel="noopener noreferrer" title="Abrir imagen completa" className="block h-full">
                <img src={image.url} alt={`${title} — foto ${index + 1}`} loading="lazy" className="h-full min-h-32 w-full object-cover transition duration-300 group-hover:scale-105" />
                <span className="absolute right-2 top-2 rounded-md bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"><ExternalLink className="h-3.5 w-3.5" /></span>
              </a>
              {access?.canManage && (
                <button
                  type="button"
                  aria-label={`Eliminar foto ${index + 1}`}
                  disabled={deletingId === image.id}
                  onClick={() => void removeImage(image)}
                  className="absolute left-2 top-2 rounded-md bg-danger/90 p-1.5 text-danger-foreground opacity-0 shadow transition hover:bg-danger-hover active:bg-danger-active focus:opacity-100 disabled:opacity-70 group-hover:opacity-100"
                >
                  {deletingId === image.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Todavía no se publicaron fotografías de este evento.
        </div>
      )}

      {access?.canManage && <p className="text-xs text-muted-foreground">Las imágenes se reescalan a un máximo de 1920 px, eliminan metadatos y se guardan como WebP.</p>}
    </section>
  );
}
