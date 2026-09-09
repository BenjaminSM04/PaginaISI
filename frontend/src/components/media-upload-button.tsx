'use client';

import { type ChangeEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, FileText, FileUp, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { MediaAssetLite } from '@/lib/types';
import { cn } from '@/lib/utils';

function sizeLabel(bytes?: number | null) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const FILE_RULES = {
  image: {
    mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
    formatsLabel: 'PNG, JPG, WebP o GIF',
  },
  pdf: {
    mimes: ['application/pdf'],
    extensions: ['.pdf'],
    formatsLabel: 'PDF',
  },
} as const;

export interface MediaUploadButtonProps {
  kind: 'image' | 'pdf';
  onUploaded: (asset: MediaAssetLite) => void;
  disabled?: boolean;
  /** Existing controlled URL, useful when editing an already saved resource. */
  previewUrl?: string | null;
  previewAlt?: string;
  /** Enables the remove action and lets the parent clear its form value. */
  onRemove?: () => void;
  /** Reports temporary and final preview changes without changing the upload contract. */
  onPreviewChange?: (url: string | null, file?: File) => void;
  maxSizeBytes?: number;
  previewShape?: 'video' | 'square';
  previewFit?: 'cover' | 'contain';
  className?: string;
}

export function MediaUploadButton({
  kind,
  onUploaded,
  disabled,
  previewUrl,
  previewAlt = 'Previsualización del archivo seleccionado',
  onRemove,
  onPreviewChange,
  maxSizeBytes = 8 * 1024 * 1024,
  previewShape = 'video',
  previewFit = 'cover',
  className,
}: MediaUploadButtonProps) {
  const inputId = `media-upload-${useId()}`;
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(previewUrl ?? null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokeObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  useEffect(() => {
    if (previewUrl !== objectUrlRef.current) revokeObjectUrl();
    // Keep the internal temporary preview in sync with the controlled saved URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(previewUrl ?? null);
    if (!previewUrl) setSelectedName(null);
  }, [previewUrl, revokeObjectUrl]);

  useEffect(() => revokeObjectUrl, [revokeObjectUrl]);

  const setLocalPreview = (file: File) => {
    revokeObjectUrl();
    setSelectedName(file.name);
    if (kind === 'image') {
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;
      setPreview(objectUrl);
      onPreviewChange?.(objectUrl, file);
    } else {
      setPreview(null);
      onPreviewChange?.(null, file);
    }
  };

  const setUploadedPreview = (asset: MediaAssetLite) => {
    revokeObjectUrl();
    setPreview(asset.url);
    onPreviewChange?.(asset.url);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setResult(null);
    setError(null);

    const rules = FILE_RULES[kind];
    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLocaleLowerCase('es')}` : '';
    const validMime = (rules.mimes as readonly string[]).includes(file.type.toLocaleLowerCase('es'));
    const validExtension = (rules.extensions as readonly string[]).includes(extension);
    const maximumLabel = sizeLabel(maxSizeBytes);

    if (!validMime || !validExtension) {
      setError(`El archivo debe ser ${rules.formatsLabel}; revisa tanto el tipo como la extensión.`);
      return;
    }
    if (file.size <= 0 || file.size > maxSizeBytes) {
      setError(`Selecciona un archivo válido de hasta ${maximumLabel}.`);
      return;
    }

    // The object URL is available before the network request completes.
    setLocalPreview(file);
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const asset = await api.post<MediaAssetLite>('/media/upload', body);
      onUploaded(asset);
      setUploadedPreview(asset);
      setResult(kind === 'image' ? `Imagen optimizada (${sizeLabel(asset.sizeBytes)} WebP)` : `PDF cargado (${sizeLabel(asset.sizeBytes)})`);
    } catch (cause) {
      revokeObjectUrl();
      setPreview(previewUrl ?? null);
      setSelectedName(null);
      onPreviewChange?.(previewUrl ?? null);
      setError(cause instanceof Error ? cause.message : 'No se pudo subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    revokeObjectUrl();
    setPreview(null);
    setSelectedName(null);
    setResult(null);
    setError(null);
    onPreviewChange?.(null);
    onRemove?.();
  };

  const hasPreview = kind === 'image' ? Boolean(preview) : Boolean(selectedName || preview);

  return (
    <div className={cn('space-y-2', className)}>
      {kind === 'image' && preview && (
        <div className={cn(
          'relative w-full max-w-sm overflow-hidden rounded-xl border border-border bg-secondary/40',
          previewShape === 'square' ? 'aspect-square' : 'aspect-video',
        )}>
          {/* Blob URLs and user-provided remote origins cannot be known by Next Image at build time. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={previewAlt}
            className={cn('h-full w-full', previewFit === 'contain' ? 'object-contain p-3' : 'object-cover')}
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-xs font-semibold backdrop-blur-sm" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Optimizando imagen…
            </div>
          )}
        </div>
      )}
      {kind === 'pdf' && (selectedName || preview) && (
        <div className="flex max-w-sm items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs">
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{selectedName ?? 'PDF cargado'}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold transition focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            disabled || uploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary/50',
          )}
        >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : kind === 'pdf' ? <FileUp className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
        {uploading
          ? 'Subiendo…'
          : hasPreview
            ? kind === 'pdf' ? 'Reemplazar PDF' : 'Reemplazar imagen'
            : kind === 'pdf' ? 'Subir PDF' : 'Subir y comprimir imagen'}
        <input
          id={inputId}
          type="file"
          accept={kind === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg,image/webp,image/gif'}
          className="sr-only"
          disabled={disabled || uploading}
          onChange={upload}
        />
        </label>
        {hasPreview && onRemove && (
          <button
            type="button"
            disabled={disabled || uploading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:text-danger"
            onClick={remove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Retirar
          </button>
        )}
      </div>
      {result && <p role="status" className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {result}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
