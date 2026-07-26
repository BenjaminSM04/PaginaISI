'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, Image as ImageIcon, Lightbulb, Loader2, RotateCcw, Send, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { IdeaProposal, MediaAssetLite } from '@/lib/types';
import {
  CatalogMultiCombobox,
  type CatalogOption,
  type DirectoryUserOption,
  UserDirectoryCombobox,
  UserDirectoryMultiCombobox,
} from '@/components/remote-selectors';
import { MediaUploadButton } from '@/components/media-upload-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/shared';
import { cn } from '@/lib/utils';

const optionalUrl = z.string().trim().url('Escribe una URL válida').max(2048).optional().or(z.literal(''));
const ideaSchema = z.object({
  title: z.string().trim().min(5, 'Escribe al menos 5 caracteres').max(160),
  description: z.string().trim().min(20, 'Escribe al menos 20 caracteres').max(8_000),
  problem: z.string().trim().min(20, 'Escribe al menos 20 caracteres').max(8_000),
  proposedSolution: z.string().trim().min(20, 'Escribe al menos 20 caracteres').max(8_000),
  isRealClient: z.boolean(),
  clientName: z.string().trim().max(180).optional(),
  clientContactName: z.string().trim().max(160).optional(),
  clientContact: z.string().trim().max(180).optional(),
  clientNeed: z.string().trim().max(4_000).optional(),
  clientAuthorizationUrl: optionalUrl,
  attachmentUrl: optionalUrl,
}).superRefine((value, context) => {
  if (!value.isRealClient) return;
  const required: Array<[keyof typeof value, string, number]> = [
    ['clientName', 'Indica el nombre o razón social', 2],
    ['clientContactName', 'Indica una persona de contacto', 2],
    ['clientContact', 'Indica un medio de contacto', 3],
    ['clientNeed', 'Describe la necesidad en al menos 10 caracteres', 10],
  ];
  for (const [field, message, minimum] of required) {
    const current = value[field];
    if (typeof current !== 'string' || current.trim().length < minimum) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
  }
});

type IdeaFormValues = z.infer<typeof ideaSchema>;

function catalogOption(name: string, index: number): CatalogOption {
  return { id: `selected-${index}-${name.toLocaleLowerCase('es')}`, kind: 'TECHNOLOGY', name };
}

function directoryOption(user: NonNullable<IdeaProposal['owner']>): DirectoryUserOption | null {
  if (!user.id) return null;
  return {
    id: user.id,
    username: user.username,
    profile: user.profile,
    roles: user.roles,
  };
}

function defaults(initial?: IdeaProposal): IdeaFormValues {
  return {
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    problem: initial?.problem ?? '',
    proposedSolution: initial?.proposedSolution ?? '',
    isRealClient: initial?.isRealClient ?? false,
    clientName: initial?.clientName ?? '',
    clientContactName: initial?.clientContactName ?? '',
    clientContact: initial?.clientContact ?? '',
    clientNeed: initial?.clientNeed ?? '',
    clientAuthorizationUrl: initial?.clientAuthorizationUrl ?? '',
    attachmentUrl: initial?.attachmentUrl ?? '',
  };
}

export function IdeaForm({ initial }: { initial?: IdeaProposal }) {
  const router = useRouter();
  const { user } = useAuth();
  const editing = Boolean(initial);
  const initialMediaIds = useMemo(() => new Set(initial?.media?.map((asset) => asset.id) ?? []), [initial?.media]);
  const [technologies, setTechnologies] = useState<CatalogOption[]>(
    () => initial?.technologies.map(catalogOption) ?? [],
  );
  const [members, setMembers] = useState<DirectoryUserOption[]>(
    () => initial?.members?.map((entry) => directoryOption(entry.user)).filter((entry): entry is DirectoryUserOption => Boolean(entry)) ?? [],
  );
  const [reviewer, setReviewer] = useState<DirectoryUserOption | null>(
    () => initial?.reviewer ? directoryOption(initial.reviewer) : null,
  );
  const [media, setMedia] = useState<MediaAssetLite[]>(initial?.media ?? []);
  const [uploadVersion, setUploadVersion] = useState(0);
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<IdeaFormValues>({
    resolver: zodResolver(ideaSchema),
    defaultValues: defaults(initial),
  });
  const realClient = useWatch({ control, name: 'isRealClient' });
  const attachmentUrl = useWatch({ control, name: 'attachmentUrl' });
  const canChooseReviewer = user?.roles.some((role) => role === 'TEACHER' || role === 'ADMIN');

  const addMedia = (asset: MediaAssetLite) => {
    setMedia((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset]);
    if (!attachmentUrl) {
      setValue('attachmentUrl', asset.url, { shouldDirty: true, shouldValidate: true });
    }
    setUploadVersion((current) => current + 1);
  };

  const removeMedia = async (asset: MediaAssetLite) => {
    if (!window.confirm('¿Retirar este archivo de la postulación?')) return;
    setBusyMediaId(asset.id);
    setServerError(null);
    try {
      if (initial && initialMediaIds.has(asset.id)) {
        await api.delete(`/ideas/${initial.id}/media/${asset.id}`);
      } else {
        await api.delete(`/media/${asset.id}`);
      }
      setMedia((current) => current.filter((item) => item.id !== asset.id));
      if (attachmentUrl === asset.url) {
        setValue('attachmentUrl', '', { shouldDirty: true, shouldValidate: true });
      }
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : 'No se pudo retirar el archivo.');
    } finally {
      setBusyMediaId(null);
    }
  };

  const onSubmit = async (values: IdeaFormValues) => {
    if (technologies.length === 0) {
      setServerError('Selecciona o agrega al menos una tecnología o área relacionada.');
      return;
    }
    setServerError(null);
    const payload = {
      title: values.title.trim(),
      description: values.description.trim(),
      problem: values.problem.trim(),
      proposedSolution: values.proposedSolution.trim(),
      technologies: technologies.map((option) => option.name),
      memberIds: members.map((member) => member.id),
      mediaIds: media.filter((asset) => !initialMediaIds.has(asset.id)).map((asset) => asset.id),
      isRealClient: values.isRealClient,
      clientName: values.isRealClient ? values.clientName?.trim() || null : null,
      clientContactName: values.isRealClient ? values.clientContactName?.trim() || null : null,
      clientContact: values.isRealClient ? values.clientContact?.trim() || null : null,
      clientNeed: values.isRealClient ? values.clientNeed?.trim() || null : null,
      clientAuthorizationUrl: values.isRealClient ? values.clientAuthorizationUrl?.trim() || null : null,
      attachmentUrl: values.attachmentUrl?.trim() || null,
      reviewerId: reviewer?.id,
      ...(initial && ['OBSERVED', 'REJECTED'].includes(initial.status) ? { resubmit: true } : {}),
    };
    try {
      const result = initial
        ? await api.patch<IdeaProposal>(`/ideas/${initial.id}`, payload)
        : await api.post<IdeaProposal>('/ideas', payload);
      router.push(`/incubadora/ideas/${result.id}`);
      router.refresh();
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : 'No se pudo enviar la idea.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-8">
      {initial && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Estado actual</p>
            <div className="mt-2"><StatusBadge status={initial.status} /></div>
          </div>
          {initial.reviewComment && (
            <div className="max-w-xl text-sm">
              <p className="font-semibold">Observación de revisión</p>
              <p className="mt-1 text-muted-foreground">{initial.reviewComment}</p>
            </div>
          )}
        </div>
      )}

      <fieldset className="space-y-5">
        <legend className="mb-4 font-serif-heading text-xl font-bold text-primary">La propuesta</legend>
        <div className="space-y-1.5">
          <Label htmlFor="idea-title">Título *</Label>
          <Input id="idea-title" placeholder="Plataforma para optimizar…" {...register('title')} />
          {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="idea-description">Descripción de la idea *</Label>
          <Textarea id="idea-description" rows={5} placeholder="Explica el alcance y quién se beneficiaría…" {...register('description')} />
          {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="idea-problem">Problema que busca resolver *</Label>
            <Textarea id="idea-problem" rows={6} placeholder="Situación actual, impacto y evidencia…" {...register('problem')} />
            {errors.problem && <p className="text-xs text-red-500">{errors.problem.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-solution">Propuesta de solución *</Label>
            <Textarea id="idea-solution" rows={6} placeholder="Cómo funcionaría y qué resultado produciría…" {...register('proposedSolution')} />
            {errors.proposedSolution && <p className="text-xs text-red-500">{errors.proposedSolution.message}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <CatalogMultiCombobox
            kind="TECHNOLOGY"
            label="Tecnologías o áreas relacionadas"
            required
            value={technologies}
            onChange={setTechnologies}
            allowCreate
            maxSelected={20}
            placeholder="Busca en el catálogo o escribe una nueva…"
            onCreate={(name) => ({
              id: `new-${name.toLocaleLowerCase('es').replace(/\s+/g, '-')}`,
              kind: 'TECHNOLOGY',
              name,
            })}
          />
          <p className="text-[11px] text-muted-foreground">La búsqueda es remota y los nuevos términos se normalizan al enviar.</p>
        </div>
        <div className="space-y-1.5">
          <UserDirectoryMultiCombobox
            value={members}
            onChange={(next) => {
              if (user && next.some((member) => member.id === user.id)) {
                setServerError('No necesitas agregarte: ya eres la persona responsable de la postulación.');
                return;
              }
              setMembers(next);
            }}
            maxSelected={20}
            label="Integrantes (opcional)"
            placeholder="Busca por nombre o usuario…"
            emptyMessage="No hay usuarios activos que coincidan."
          />
          <p className="text-[11px] text-muted-foreground">Los seleccionados aparecen como chips; el postulante ya forma parte del equipo.</p>
        </div>
        {canChooseReviewer && (
          <UserDirectoryCombobox
            role="TEACHER"
            value={reviewer}
            onChange={setReviewer}
            label="Docente revisor preferido (opcional)"
            placeholder="Buscar docente…"
          />
        )}
      </fieldset>

      <fieldset className="space-y-4 border-t border-border pt-7">
        <legend className="font-serif-heading text-xl font-bold text-primary">Archivo o imagen opcional</legend>
        <p className="text-sm text-muted-foreground">
          Puedes adjuntar hasta 8 respaldos. Las imágenes se optimizan antes de almacenarse.
        </p>
        {media.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((asset) => (
              <div key={asset.id} className="relative overflow-hidden rounded-xl border border-border bg-secondary/40">
                {asset.mime?.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.url} alt="Adjunto de la idea" className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center gap-2 p-4 text-sm font-semibold">
                    <FileText className="h-6 w-6 text-purple-500" /> Documento adjunto
                  </div>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="absolute right-2 top-2"
                  disabled={busyMediaId === asset.id || isSubmitting}
                  onClick={() => void removeMedia(asset)}
                >
                  {busyMediaId === asset.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Retirar
                </Button>
              </div>
            ))}
          </div>
        )}
        {media.length < 8 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-dashed border-border p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-purple-500" /> Imagen</p>
              <MediaUploadButton key={`idea-image-${uploadVersion}`} kind="image" disabled={isSubmitting} onUploaded={addMedia} />
            </div>
            <div className="rounded-xl border border-dashed border-border p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-purple-500" /> Documento</p>
              <MediaUploadButton key={`idea-pdf-${uploadVersion}`} kind="pdf" disabled={isSubmitting} onUploaded={addMedia} />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="idea-attachment-url">Enlace externo de respaldo (opcional)</Label>
          <Input id="idea-attachment-url" type="url" placeholder="https://…" {...register('attachmentUrl')} />
          {errors.attachmentUrl && <p className="text-xs text-red-500">{errors.attachmentUrl.message}</p>}
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-border pt-7">
        <legend className="font-serif-heading text-xl font-bold text-primary">Contexto del proyecto</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-purple-500" {...register('isRealClient')} />
          <span>
            <span className="block text-sm font-bold">Proyecto para cliente real</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Actívalo si existe una organización o persona concreta que necesita la solución.
            </span>
          </span>
        </label>
        {realClient ? (
          <div className="grid gap-5 rounded-xl border border-border bg-secondary/30 p-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="idea-client-name">Nombre o razón social *</Label>
              <Input id="idea-client-name" {...register('clientName')} />
              {errors.clientName && <p className="text-xs text-red-500">{errors.clientName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-contact-name">Persona de contacto *</Label>
              <Input id="idea-contact-name" {...register('clientContactName')} />
              {errors.clientContactName && <p className="text-xs text-red-500">{errors.clientContactName.message}</p>}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="idea-contact">Medio de contacto *</Label>
              <Input id="idea-contact" placeholder="Correo, teléfono u otro canal autorizado" {...register('clientContact')} />
              {errors.clientContact && <p className="text-xs text-red-500">{errors.clientContact.message}</p>}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="idea-client-need">Necesidad planteada *</Label>
              <Textarea id="idea-client-need" rows={4} {...register('clientNeed')} />
              {errors.clientNeed && <p className="text-xs text-red-500">{errors.clientNeed.message}</p>}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="idea-client-authorization">Autorización o respaldo (opcional)</Label>
              <Input id="idea-client-authorization" type="url" placeholder="https://…" {...register('clientAuthorizationUrl')} />
              {errors.clientAuthorizationUrl && <p className="text-xs text-red-500">{errors.clientAuthorizationUrl.message}</p>}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
            La propuesta se tratará como una idea innovadora o proyecto interno.
          </p>
        )}
      </fieldset>

      {serverError && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {serverError}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Link href={editing ? '/incubadora/mis-ideas' : '/incubadora'} className={cn(buttonVariants({ variant: 'outline' }), 'w-full sm:w-auto')}>
          Cancelar
        </Link>
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full bg-purple-600 text-white hover:bg-purple-700 sm:w-auto">
          {isSubmitting
            ? <Loader2 className="animate-spin" />
            : initial && ['OBSERVED', 'REJECTED'].includes(initial.status)
              ? <RotateCcw />
              : editing
                ? <Send />
                : <Lightbulb />}
          {initial && ['OBSERVED', 'REJECTED'].includes(initial.status)
            ? 'Guardar y reenviar'
            : editing
              ? 'Guardar cambios'
              : 'Postular idea'}
        </Button>
      </div>
    </form>
  );
}
