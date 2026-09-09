'use client';

import { ChangeEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export const MAX_FORUM_TAGS = 5;
export const MAX_FORUM_IMAGES = 2;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function normalizeTag(raw: string) {
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

export function ForumTagInput({
  value,
  onChange,
  suggestions = [],
  disabled,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const commitDraft = () => {
    const chunks = draft.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (!chunks.length) return;
    let next = value;
    for (const chunk of chunks) {
      const tag = normalizeTag(chunk);
      if (!tag || next.includes(tag)) continue;
      if (next.length >= MAX_FORUM_TAGS) {
        setError(`Solo puedes agregar ${MAX_FORUM_TAGS} tags.`);
        break;
      }
      if (tag.length > 30 || !/^[\p{L}\p{N}.][\p{L}\p{N}+#.-]*$/u.test(tag)) {
        setError(`El tag "${chunk}" no es válido.`);
        return;
      }
      next = [...next, tag];
    }
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
    }
    if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };

  return (
    <div className="space-y-2">
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-semibold text-primary">
            #{tag}
            <button type="button" aria-label={`Quitar ${tag}`} disabled={disabled} onClick={() => onChange(value.filter((item) => item !== tag))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={commitDraft}
          disabled={disabled || value.length >= MAX_FORUM_TAGS}
          list={listId}
          placeholder={value.length ? 'Otro tag…' : 'Escribe un tag y presiona Enter'}
          className="min-w-48 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
        <datalist id={listId}>
          {suggestions.filter((tag) => !value.includes(tag)).map((tag) => <option key={tag} value={tag} />)}
        </datalist>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{error ?? 'Puedes crear tags nuevos; no dependen de una lista cerrada.'}</span>
        <span>{value.length}/{MAX_FORUM_TAGS}</span>
      </div>
    </div>
  );
}

function FilePreview({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled?: boolean }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-secondary">
      {url && <img src={url} alt={file.name} className="h-32 w-full object-cover" />}
      <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{file.name}</div>
      <button
        type="button"
        aria-label={`Quitar ${file.name}`}
        disabled={disabled}
        onClick={onRemove}
        className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white transition hover:bg-black disabled:opacity-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ForumImagePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    const invalid = selected.find((file) => !IMAGE_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE);
    if (invalid) {
      setError('Cada archivo debe ser JPG, PNG, WebP o GIF y pesar como máximo 8 MB.');
      return;
    }
    const unique = [...value];
    for (const file of selected) {
      if (!unique.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) unique.push(file);
    }
    if (unique.length > MAX_FORUM_IMAGES) {
      setError(`Puedes adjuntar hasta ${MAX_FORUM_IMAGES} imágenes.`);
      return;
    }
    onChange(unique);
    setError(null);
  };

  return (
    <div className={cn('space-y-3', className)}>
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {value.map((file) => (
            <FilePreview
              key={`${file.name}-${file.lastModified}`}
              file={file}
              disabled={disabled}
              onRemove={() => onChange(value.filter((item) => item !== file))}
            />
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={selectFiles} />
      <button
        type="button"
        disabled={disabled || value.length >= MAX_FORUM_IMAGES}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ImagePlus className="h-4 w-4" /> Adjuntar imágenes ({value.length}/{MAX_FORUM_IMAGES})
      </button>
      <p className={cn('text-xs', error ? 'text-danger' : 'text-muted-foreground')}>
        {error ?? 'Se optimizan automáticamente para reducir espacio y eliminar metadatos.'}
      </p>
    </div>
  );
}

export interface UploadedForumImage {
  id: string;
  url: string;
  mime: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
}

export async function uploadForumImages(files: File[]): Promise<UploadedForumImage[]> {
  const uploaded: UploadedForumImage[] = [];
  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    uploaded.push(await api.post<UploadedForumImage>('/media/upload', form));
  }
  return uploaded;
}
