'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowDown,
  ArrowUp,
  Github,
  Globe2,
  Instagram,
  Link2,
  Linkedin,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  Send,
  Trash2,
  Video,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Community, CommunityLink } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { MediaUploadButton } from '@/components/media-upload-button';
import {
  UserDirectoryCombobox,
  UserDirectoryMultiCombobox,
  type DirectoryUserOption,
} from '@/components/remote-selectors';

const optionalWebUrl = z
  .string()
  .max(2048)
  .refine((value) => !value || isSafeWebUrl(value), 'Usa una URL HTTP o HTTPS válida, sin credenciales');

const schema = z.object({
  name: z.string().min(3, 'Usa al menos 3 caracteres').max(80),
  description: z.string().min(10, 'Usa al menos 10 caracteres').max(300),
  longDescription: z.string().max(5000).optional(),
  logoUrl: optionalWebUrl,
  coverUrl: optionalWebUrl,
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color hexadecimal como #06B6D4'),
  isActive: z.boolean(),
});

type CommunityFormData = z.infer<typeof schema>;

interface PlatformOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface EditableLink {
  clientId: string;
  platformChoice: string;
  customPlatform: string;
  url: string;
  label: string;
  isActive: boolean;
}

interface LinkFieldErrors {
  platform?: string;
  url?: string;
  label?: string;
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  { value: 'WhatsApp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'Microsoft Teams', label: 'Microsoft Teams', icon: Video },
  { value: 'Discord', label: 'Discord', icon: MessageCircle },
  { value: 'Telegram', label: 'Telegram', icon: Send },
  { value: 'GitHub', label: 'GitHub', icon: Github },
  { value: 'LinkedIn', label: 'LinkedIn', icon: Linkedin },
  { value: 'Instagram', label: 'Instagram', icon: Instagram },
  { value: 'YouTube', label: 'YouTube', icon: Youtube },
  { value: 'Sitio web', label: 'Sitio web', icon: Globe2 },
];

const CUSTOM_PLATFORM = '__custom__';
const MAX_LINKS = 30;

function isSafeWebUrl(raw: string) {
  try {
    const parsed = new URL(raw.trim());
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function normalizedUrl(raw: string) {
  try {
    return new URL(raw.trim()).toString().toLocaleLowerCase('es');
  } catch {
    return raw.trim().toLocaleLowerCase('es');
  }
}

function platformOption(platform: string) {
  return PLATFORM_OPTIONS.find((option) => option.value.toLocaleLowerCase('es') === platform.toLocaleLowerCase('es'));
}

function linkPlatform(link: EditableLink) {
  return link.platformChoice === CUSTOM_PLATFORM ? link.customPlatform.trim() : link.platformChoice;
}

function makeEditableLink(link: CommunityLink, index: number): EditableLink {
  const known = platformOption(link.platform);
  return {
    clientId: link.id ?? `stored-link-${index}`,
    platformChoice: known?.value ?? CUSTOM_PLATFORM,
    customPlatform: known ? '' : link.platform,
    url: link.url,
    label: link.label ?? '',
    isActive: link.isActive,
  };
}

function initialLinks(initial?: Community) {
  const stored = [...(initial?.links ?? [])].sort(
    (a, b) => (a.order ?? a.sortOrder ?? 0) - (b.order ?? b.sortOrder ?? 0),
  );
  if (stored.length) return stored.map(makeEditableLink);

  const legacy: CommunityLink[] = [];
  if (initial?.whatsappUrl) {
    legacy.push({ platform: 'WhatsApp', url: initial.whatsappUrl, label: 'WhatsApp', sortOrder: 0, isActive: true });
  }
  if (initial?.teamsUrl) {
    legacy.push({ platform: 'Microsoft Teams', url: initial.teamsUrl, label: 'Teams', sortOrder: 1, isActive: true });
  }
  if (initial?.discordUrl) {
    legacy.push({ platform: 'Discord', url: initial.discordUrl, label: 'Discord', sortOrder: 2, isActive: true });
  }
  return legacy.map(makeEditableLink);
}

function defaults(initial?: Community): CommunityFormData {
  return {
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    longDescription: initial?.longDescription ?? '',
    logoUrl: initial?.logoUrl ?? '',
    coverUrl: initial?.coverUrl ?? '',
    accentColor: initial?.accentColor ?? '#06B6D4',
    isActive: initial?.isActive ?? true,
  };
}

function initialTeacherOptions(initial?: Community, provided: DirectoryUserOption[] = []) {
  const byId = new Map(provided.map((teacher) => [teacher.id, teacher]));
  if (initial?.teacherLead?.id) {
    byId.set(initial.teacherLead.id, {
      id: initial.teacherLead.id,
      username: initial.teacherLead.username,
      profile: initial.teacherLead.profile,
      roles: ['TEACHER'],
    });
  }
  for (const id of initial?.teacherIds ?? []) {
    if (!byId.has(id)) byId.set(id, { id, username: id, roles: ['TEACHER'] });
  }
  return [...byId.values()];
}

function validateLinks(links: EditableLink[]) {
  const errors: Record<string, LinkFieldErrors> = {};
  const seenUrls = new Map<string, string>();
  const payload = links.map((link, index) => {
    const entry: LinkFieldErrors = {};
    const platform = linkPlatform(link);
    const url = link.url.trim();
    const label = link.label.trim();

    if (platform.length < 2 || platform.length > 50 || /[<>\u0000-\u001f\u007f]/.test(platform)) {
      entry.platform = 'Indica una plataforma válida de 2 a 50 caracteres.';
    }
    if (!isSafeWebUrl(url)) {
      entry.url = 'Usa una URL HTTP o HTTPS válida, sin credenciales.';
    } else {
      const key = normalizedUrl(url);
      const previousId = seenUrls.get(key);
      if (previousId) {
        entry.url = 'Este enlace ya fue agregado.';
        errors[previousId] = { ...errors[previousId], url: 'Este enlace está repetido.' };
      } else {
        seenUrls.set(key, link.clientId);
      }
    }
    if (label.length > 80) entry.label = 'La etiqueta admite hasta 80 caracteres.';
    if (Object.keys(entry).length) errors[link.clientId] = { ...errors[link.clientId], ...entry };

    return {
      platform,
      url,
      label: label || null,
      order: index,
      isActive: link.isActive,
    };
  });
  return { payload, errors };
}

function LinkIcon({ platform }: { platform: string }) {
  const Icon = platformOption(platform)?.icon ?? Link2;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}

export function CommunityForm({
  initial,
  initialTeachers = [],
}: {
  initial?: Community;
  initialTeachers?: DirectoryUserOption[];
}) {
  const router = useRouter();
  const { user } = useAuth();
  const editing = !!initial;
  const isAdmin = !!user?.roles.includes('ADMIN');
  const [serverError, setServerError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [teachers, setTeachers] = useState<DirectoryUserOption[]>(() => initialTeacherOptions(initial, initialTeachers));
  const [studentLead, setStudentLead] = useState<DirectoryUserOption | null>(() => (
    initial?.studentLead?.id
      ? {
          id: initial.studentLead.id,
          username: initial.studentLead.username,
          profile: initial.studentLead.profile,
          roles: ['COMMUNITY_LEADER'],
        }
      : null
  ));
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const [links, setLinks] = useState<EditableLink[]>(() => initialLinks(initial));
  const linkSequence = useRef(links.length);
  const [linkErrors, setLinkErrors] = useState<Record<string, LinkFieldErrors>>({});
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CommunityFormData>({ resolver: zodResolver(schema), defaultValues: defaults(initial) });
  const logoUrl = useWatch({ control, name: 'logoUrl' });
  const coverUrl = useWatch({ control, name: 'coverUrl' });

  const teacherIds = useMemo(() => new Set(teachers.map((teacher) => teacher.id)), [teachers]);

  const updateLink = (clientId: string, patch: Partial<EditableLink>) => {
    setLinks((current) => current.map((link) => (link.clientId === clientId ? { ...link, ...patch } : link)));
    setLinkErrors((current) => {
      if (!current[clientId]) return current;
      const next = { ...current };
      delete next[clientId];
      return next;
    });
  };

  const addLink = () => {
    if (links.length >= MAX_LINKS) return;
    setLinks((current) => [
      ...current,
      {
        clientId: `new-link-${++linkSequence.current}`,
        platformChoice: 'WhatsApp',
        customPlatform: '',
        url: '',
        label: '',
        isActive: true,
      },
    ]);
  };

  const removeLink = (clientId: string) => {
    setLinks((current) => current.filter((link) => link.clientId !== clientId));
    setLinkErrors((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
  };

  const moveLink = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= links.length) return;
    setLinks((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const onSubmit = async (data: CommunityFormData) => {
    setServerError(null);
    setTeacherError(null);
    const validatedLinks = validateLinks(links);
    setLinkErrors(validatedLinks.errors);
    if (Object.keys(validatedLinks.errors).length) {
      setServerError('Revisa los enlaces marcados antes de guardar.');
      return;
    }
    if (isAdmin && teachers.length === 0) {
      setTeacherError('Debes asignar al menos un docente responsable.');
      return;
    }
    if (isAdmin && studentLead && teacherIds.has(studentLead.id)) {
      setTeacherError('Una misma persona no puede ser docente responsable y líder estudiantil.');
      return;
    }

    const payload: Record<string, unknown> = {
      name: data.name.trim(),
      description: data.description.trim(),
      longDescription: data.longDescription?.trim() || null,
      logoUrl: data.logoUrl?.trim() || null,
      coverUrl: data.coverUrl?.trim() || null,
      accentColor: data.accentColor,
      links: validatedLinks.payload,
    };
    if (isAdmin) {
      payload.teacherIds = teachers.map((teacher) => teacher.id);
      payload.studentLeadId = studentLead?.id ?? null;
      if (editing) payload.isActive = data.isActive;
    }

    try {
      const community = editing
        ? await api.patch<Community>(`/communities/${initial.id}`, payload)
        : await api.post<Community>('/communities', payload);
      router.push(community.isActive === false ? '/comunidades/gestionar' : `/comunidades/${community.slug}`);
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo guardar la comunidad');
    }
  };

  const deactivate = async () => {
    if (!initial || !window.confirm(`¿Desactivar “${initial.name}”? Dejará de aparecer públicamente, pero sus datos se conservarán.`)) return;
    setDeactivating(true);
    setServerError(null);
    try {
      await api.delete(`/communities/${initial.id}`);
      router.push('/comunidades/gestionar');
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'No se pudo desactivar la comunidad');
      setDeactivating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-7 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 md:p-8">
      <section className="space-y-5" aria-labelledby="community-general-heading">
        <div>
          <h2 id="community-general-heading" className="font-serif-heading text-xl font-bold text-primary">Información general</h2>
          <p className="mt-1 text-xs text-muted-foreground">Esta información identifica la comunidad en el directorio público.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="community-name">Nombre *</Label>
          <Input id="community-name" {...register('name')} />
          {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="community-description">Descripción breve *</Label>
          <Textarea id="community-description" rows={3} {...register('description')} />
          {errors.description && <p className="text-xs text-danger">{errors.description.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="community-long-description">Presentación completa</Label>
          <Textarea id="community-long-description" rows={6} {...register('longDescription')} />
        </div>
      </section>

      <section className="space-y-5 border-t border-border pt-7" aria-labelledby="community-media-heading">
        <div>
          <h2 id="community-media-heading" className="font-serif-heading text-xl font-bold text-primary">Identidad visual</h2>
          <p className="mt-1 text-xs text-muted-foreground">Las imágenes se validan, comprimen y muestran antes de guardar.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
            <Label htmlFor="community-logo-url">Logotipo</Label>
            <MediaUploadButton
              kind="image"
              previewUrl={logoUrl}
              previewAlt="Vista previa del logotipo de la comunidad"
              disabled={isSubmitting || deactivating}
              onUploaded={(asset) => setValue('logoUrl', asset.url, { shouldDirty: true, shouldValidate: true })}
              onRemove={() => setValue('logoUrl', '', { shouldDirty: true, shouldValidate: true })}
            />
            <Input id="community-logo-url" aria-label="URL del logotipo" placeholder="O pega una URL HTTPS…" {...register('logoUrl')} />
            {errors.logoUrl && <p className="text-xs text-danger">{errors.logoUrl.message}</p>}
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
            <Label htmlFor="community-cover-url">Portada</Label>
            <MediaUploadButton
              kind="image"
              previewUrl={coverUrl}
              previewAlt="Vista previa de la portada de la comunidad"
              disabled={isSubmitting || deactivating}
              onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true })}
              onRemove={() => setValue('coverUrl', '', { shouldDirty: true, shouldValidate: true })}
            />
            <Input id="community-cover-url" aria-label="URL de la portada" placeholder="O pega una URL HTTPS…" {...register('coverUrl')} />
            {errors.coverUrl && <p className="text-xs text-danger">{errors.coverUrl.message}</p>}
          </div>
        </div>
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="community-color">Color identificador</Label>
          <div className="flex gap-2">
            <Input id="community-color" type="color" className="w-14 p-1" {...register('accentColor')} />
            <Input aria-label="Color hexadecimal" {...register('accentColor')} />
          </div>
          {errors.accentColor && <p className="text-xs text-danger">{errors.accentColor.message}</p>}
        </div>
      </section>

      <section className="space-y-5 border-t border-border pt-7" aria-labelledby="community-links-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="community-links-heading" className="font-serif-heading text-xl font-bold text-primary">Canales y enlaces</h2>
            <p className="mt-1 text-xs text-muted-foreground">Publica hasta {MAX_LINKS} recursos. Solo los enlaces activos serán visibles.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLink} disabled={links.length >= MAX_LINKS || isSubmitting}>
            <Plus /> Agregar enlace
          </Button>
        </div>

        {links.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No hay enlaces configurados. Puedes guardar la comunidad así o agregar el primero.
          </div>
        )}

        <div className="space-y-3">
          {links.map((link, index) => {
            const platform = linkPlatform(link);
            const errorsForLink = linkErrors[link.clientId];
            return (
              <fieldset key={link.clientId} className="rounded-xl border border-border bg-secondary/15 p-4">
                <legend className="sr-only">Enlace {index + 1}</legend>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-primary">
                    <LinkIcon platform={platform} />
                    <span className="truncate">{platform || `Enlace ${index + 1}`}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Subir enlace ${index + 1}`} disabled={index === 0} onClick={() => moveLink(index, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Bajar enlace ${index + 1}`} disabled={index === links.length - 1} onClick={() => moveLink(index, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Eliminar enlace ${index + 1}`} onClick={() => removeLink(link.clientId)} className="text-danger hover:text-danger">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`community-link-platform-${link.clientId}`}>Plataforma *</Label>
                    <Select
                      id={`community-link-platform-${link.clientId}`}
                      value={link.platformChoice}
                      onChange={(event) => updateLink(link.clientId, { platformChoice: event.target.value })}
                    >
                      {PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      <option value={CUSTOM_PLATFORM}>Otra plataforma…</option>
                    </Select>
                    {link.platformChoice === CUSTOM_PLATFORM && (
                      <Input
                        aria-label={`Nombre personalizado del enlace ${index + 1}`}
                        value={link.customPlatform}
                        maxLength={50}
                        placeholder="Ej. Moodle"
                        onChange={(event) => updateLink(link.clientId, { customPlatform: event.target.value })}
                      />
                    )}
                    {errorsForLink?.platform && <p className="text-xs text-danger">{errorsForLink.platform}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`community-link-label-${link.clientId}`}>Etiqueta visible</Label>
                    <Input
                      id={`community-link-label-${link.clientId}`}
                      value={link.label}
                      maxLength={80}
                      placeholder="Ej. Grupo principal"
                      onChange={(event) => updateLink(link.clientId, { label: event.target.value })}
                    />
                    {errorsForLink?.label && <p className="text-xs text-danger">{errorsForLink.label}</p>}
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor={`community-link-url-${link.clientId}`}>URL *</Label>
                    <Input
                      id={`community-link-url-${link.clientId}`}
                      type="url"
                      value={link.url}
                      maxLength={2048}
                      placeholder="https://…"
                      onChange={(event) => updateLink(link.clientId, { url: event.target.value })}
                    />
                    {errorsForLink?.url && <p className="text-xs text-danger">{errorsForLink.url}</p>}
                  </div>
                </div>
                <label className="mt-4 flex w-fit items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={link.isActive}
                    onChange={(event) => updateLink(link.clientId, { isActive: event.target.checked })}
                  />
                  Enlace activo y visible
                </label>
              </fieldset>
            );
          })}
        </div>
      </section>

      {isAdmin ? (
        <section className="space-y-5 border-t border-border pt-7" aria-labelledby="community-responsibles-heading">
          <div>
            <h2 id="community-responsibles-heading" className="font-serif-heading text-xl font-bold text-primary">Responsables</h2>
            <p className="mt-1 text-xs text-muted-foreground">Toda comunidad debe conservar al menos un docente. La búsqueda es remota y paginada.</p>
          </div>
          <UserDirectoryMultiCombobox
            role="TEACHER"
            label="Docentes responsables"
            required
            value={teachers}
            onChange={(value) => {
              setTeachers(value);
              setTeacherError(null);
            }}
            maxSelected={20}
            placeholder="Busca docentes por nombre o usuario…"
            emptyMessage="No se encontraron docentes activos."
            requestKey={initial?.id ?? 'new-community'}
          />
          <UserDirectoryCombobox
            role="COMMUNITY_LEADER"
            label="Líder estudiantil (opcional)"
            value={studentLead}
            onChange={(value) => {
              setStudentLead(value);
              setTeacherError(null);
            }}
            placeholder="Busca líderes por nombre o usuario…"
            emptyMessage="No se encontraron líderes elegibles."
            requestKey={initial?.id ?? 'new-community'}
          />
          {teacherError && <p role="alert" className="text-sm text-danger">{teacherError}</p>}
          {editing && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-accent" {...register('isActive')} />
              Comunidad activa y visible públicamente
            </label>
          )}
        </section>
      ) : editing ? (
        <p className="rounded-xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
          Puedes actualizar la presentación y los canales. Solo administración puede cambiar responsables o el estado de la comunidad.
        </p>
      ) : null}

      {serverError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{serverError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" size="lg" className="flex-1" disabled={isSubmitting || deactivating}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} {isSubmitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear comunidad'}
        </Button>
        {isAdmin && editing && initial.isActive !== false && (
          <Button type="button" size="lg" variant="destructive" disabled={deactivating || isSubmitting} onClick={deactivate}>
            {deactivating ? <Loader2 className="animate-spin" /> : <Trash2 />} {deactivating ? 'Desactivando…' : 'Desactivar'}
          </Button>
        )}
      </div>
    </form>
  );
}
