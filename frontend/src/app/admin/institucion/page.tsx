'use client';

import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, ImagePlus, Loader2, RotateCcw, Save } from 'lucide-react';
import { api } from '@/lib/api';
import {
  DEFAULT_INSTITUTIONAL_SETTINGS,
  type InstitutionalSettings,
  withInstitutionalDefaults,
} from '@/lib/institution';
import { institutionalSettingsQueryKey } from '@/lib/use-institutional-settings';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const ADMIN_QUERY_KEY = ['institution', 'admin'] as const;
const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const MAX_LOGO_SIZE = 8 * 1024 * 1024;

function formatMegabytes(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function LogoEditor({
  kind,
  title,
  description,
  savedUrl,
  alt,
}: {
  kind: 'institutional' | 'career';
  title: string;
  description: string;
  savedUrl: string | null;
  alt: string;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(savedUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const releaseObjectUrl = () => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const commitSettings = (settings: InstitutionalSettings) => {
    queryClient.setQueryData(ADMIN_QUERY_KEY, settings);
    queryClient.setQueryData(institutionalSettingsQueryKey, settings);
  };

  const upload = useMutation({
    mutationFn: async (selected: File) => {
      const body = new FormData();
      body.append('file', selected);
      return api.post<InstitutionalSettings>(`/institution/admin/logos/${kind}`, body);
    },
    onSuccess: (settings) => {
      releaseObjectUrl();
      setFile(null);
      setPreviewUrl(kind === 'institutional' ? settings.institutionalLogoUrl : settings.careerLogoUrl);
      setMessage('Logo guardado y publicado correctamente.');
      setError(null);
      if (inputRef.current) inputRef.current.value = '';
      commitSettings(settings);
    },
    onError: (cause) => {
      releaseObjectUrl();
      setFile(null);
      setPreviewUrl(savedUrl);
      setMessage(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el logo.');
      if (inputRef.current) inputRef.current.value = '';
    },
  });

  const restore = useMutation({
    mutationFn: () => api.patch<InstitutionalSettings>('/institution/admin', {
      [kind === 'institutional' ? 'institutionalLogoUrl' : 'careerLogoUrl']:
        kind === 'institutional' ? DEFAULT_INSTITUTIONAL_SETTINGS.institutionalLogoUrl : null,
    }),
    onSuccess: (settings) => {
      releaseObjectUrl();
      setFile(null);
      setPreviewUrl(kind === 'institutional' ? settings.institutionalLogoUrl : settings.careerLogoUrl);
      setMessage(kind === 'institutional' ? 'Se restauró el logo institucional oficial.' : 'Se retiró la imagen de la carrera.');
      setError(null);
      if (inputRef.current) inputRef.current.value = '';
      commitSettings(settings);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo restaurar la imagen anterior.');
      setMessage(null);
    },
  });

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    setMessage(null);
    setError(null);
    if (!selected) return;
    const extension = selected.name.includes('.')
      ? `.${selected.name.split('.').pop()!.toLocaleLowerCase('es')}`
      : '';
    if (!LOGO_MIMES.includes(selected.type.toLocaleLowerCase('es')) || !LOGO_EXTENSIONS.includes(extension)) {
      event.target.value = '';
      setError('Selecciona un archivo PNG, JPG, WebP o GIF válido.');
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_LOGO_SIZE) {
      event.target.value = '';
      setError(`El archivo debe pesar como máximo ${formatMegabytes(MAX_LOGO_SIZE)}.`);
      return;
    }
    releaseObjectUrl();
    const localUrl = URL.createObjectURL(selected);
    objectUrlRef.current = localUrl;
    setFile(selected);
    setPreviewUrl(localUrl);
  };

  const pending = upload.isPending || restore.isPending;
  const canRestore = kind === 'institutional'
    ? savedUrl !== DEFAULT_INSTITUTIONAL_SETTINGS.institutionalLogoUrl
    : Boolean(savedUrl);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="font-serif-heading text-lg font-bold text-primary">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 p-5">
        {previewUrl ? (
          // El origen puede ser el almacenamiento local, S3 o el dominio institucional.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={alt} className="max-h-40 max-w-full object-contain" referrerPolicy="no-referrer" />
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            <ImagePlus className="mx-auto mb-2 h-8 w-8" />
            Aún no se configuró una imagen.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-semibold transition hover:border-primary/50 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <ImagePlus className="h-4 w-4" />
          {file ? 'Elegir otro archivo' : 'Seleccionar logo'}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={pending}
            onChange={selectFile}
          />
        </label>
        <Button type="button" disabled={!file || pending} onClick={() => file && upload.mutate(file)}>
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Guardar logo
        </Button>
        <Button type="button" variant="ghost" disabled={pending || !canRestore} onClick={() => restore.mutate()}>
          {restore.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {kind === 'institutional' ? 'Restaurar oficial' : 'Retirar imagen'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        PNG, JPG, WebP o GIF · máximo {formatMegabytes(MAX_LOGO_SIZE)}. La imagen actual se conserva si la carga falla.
      </p>
      {message && <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> {message}</p>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </section>
  );
}

function IdentityNamesForm({ settings }: { settings: InstitutionalSettings }) {
  const queryClient = useQueryClient();
  const [institutionName, setInstitutionName] = useState(settings.institutionName);
  const [shortName, setShortName] = useState(settings.shortName);
  const [careerName, setCareerName] = useState(settings.careerName);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.patch<InstitutionalSettings>('/institution/admin', {
      institutionName,
      shortName,
      careerName,
    }),
    onSuccess: (updated) => {
      queryClient.setQueryData(ADMIN_QUERY_KEY, updated);
      queryClient.setQueryData(institutionalSettingsQueryKey, updated);
      setInstitutionName(updated.institutionName);
      setShortName(updated.shortName);
      setCareerName(updated.careerName);
      setMessage('Identidad institucional actualizada.');
      setError(null);
    },
    onError: (cause) => {
      setMessage(null);
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los nombres.');
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  const dirty = institutionName.trim() !== settings.institutionName
    || shortName.trim() !== settings.shortName
    || careerName.trim() !== settings.careerName;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="font-serif-heading text-lg font-bold text-primary">Nombres institucionales</h2>
        <p className="mt-1 text-sm text-muted-foreground">Estos textos se reutilizan en las áreas de identidad del portal.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="institution-name">Nombre completo</Label>
          <Input id="institution-name" value={institutionName} minLength={2} maxLength={160} required onChange={(event) => setInstitutionName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="institution-short-name">Nombre corto</Label>
          <Input id="institution-short-name" value={shortName} minLength={2} maxLength={80} required onChange={(event) => setShortName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="career-name">Carrera</Label>
          <Input id="career-name" value={careerName} minLength={2} maxLength={160} required onChange={(event) => setCareerName(event.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={mutation.isPending || !dirty}>
        {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
        Guardar nombres
      </Button>
      {message && <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> {message}</p>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </form>
  );
}

export default function InstitutionSettingsPage() {
  const query = useQuery({
    queryKey: ADMIN_QUERY_KEY,
    queryFn: () => api.get<InstitutionalSettings>('/institution/admin'),
  });

  if (query.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (query.isError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-300">
        <p>No se pudo cargar la configuración institucional.</p>
        <Button type="button" variant="ghost" className="mt-3" onClick={() => query.refetch()}>Reintentar</Button>
      </div>
    );
  }

  const settings = withInstitutionalDefaults(query.data);

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Building2 className="h-6 w-6" /></div>
        <div>
          <h1 className="font-serif-heading text-2xl font-bold text-primary">Identidad institucional</h1>
          <p className="text-sm text-muted-foreground">Administra la identidad de {settings.institutionName} y de {settings.careerName} sin editar código.</p>
        </div>
      </header>

      <IdentityNamesForm settings={settings} />

      <div className="grid gap-5 xl:grid-cols-2">
        <LogoEditor
          kind="institutional"
          title={`Logo institucional de ${settings.shortName}`}
          description="Imagen principal utilizada en navegación, portada, acceso y pie del portal."
          savedUrl={settings.institutionalLogoUrl}
          alt={`Logo actual de ${settings.institutionName}`}
        />
        <LogoEditor
          kind="career"
          title={`Imagen de ${settings.careerName}`}
          description="Imagen opcional de la carrera. Si no se configura, el portal no inventa ni sustituye este logo."
          savedUrl={settings.careerLogoUrl}
          alt={`Imagen actual de ${settings.careerName}`}
        />
      </div>
    </div>
  );
}
