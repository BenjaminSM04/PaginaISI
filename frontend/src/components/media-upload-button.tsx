'use client';

import { ChangeEvent, useState } from 'react';
import { CheckCircle2, FileUp, ImagePlus, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { MediaAssetLite } from '@/lib/types';

function sizeLabel(bytes?: number | null) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaUploadButton({
  kind,
  onUploaded,
  disabled,
}: {
  kind: 'image' | 'pdf';
  onUploaded: (asset: MediaAssetLite) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setResult(null);
    setError(null);
    const validType = kind === 'pdf' ? file.type === 'application/pdf' : file.type.startsWith('image/');
    if (!validType || file.size > 8 * 1024 * 1024) {
      setError(kind === 'pdf' ? 'Selecciona un PDF de hasta 8 MB.' : 'Selecciona una imagen de hasta 8 MB.');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const asset = await api.post<MediaAssetLite>('/media/upload', body);
      onUploaded(asset);
      setResult(kind === 'image' ? `Imagen optimizada (${sizeLabel(asset.sizeBytes)} WebP)` : `PDF cargado (${sizeLabel(asset.sizeBytes)})`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold transition hover:border-primary/50">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : kind === 'pdf' ? <FileUp className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
        {uploading ? 'Subiendo…' : kind === 'pdf' ? 'Subir PDF' : 'Subir y comprimir imagen'}
        <input
          type="file"
          accept={kind === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg,image/webp,image/gif'}
          className="sr-only"
          disabled={disabled || uploading}
          onChange={upload}
        />
      </label>
      {result && <p role="status" className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> {result}</p>}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
