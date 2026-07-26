'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, GraduationCap, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Community, MediaAssetLite, Mentorship, UserLite } from '@/lib/types';
import {
  type DirectoryUserOption,
  UserDirectoryMultiCombobox,
} from '@/components/remote-selectors';
import { MediaUploadButton } from '@/components/media-upload-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const optionalUrl = z.string().trim().url('Escribe una URL válida').max(2048).optional().or(z.literal(''));
const mentorshipSchema = z.object({
  title: z.string().trim().min(5, 'Escribe al menos 5 caracteres').max(140),
  description: z.string().trim().min(10, 'Escribe al menos 10 caracteres').max(10_000),
  area: z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(80),
  difficulty: z.enum(['BASICO', 'INTERMEDIO', 'AVANZADO']),
  syllabus: z.string().refine(
    (value) => value.split('\n').map((item) => item.trim()).filter(Boolean).length <= 50,
    'El temario admite hasta 50 puntos',
  ).refine(
    (value) => value.split('\n').every((item) => item.trim().length <= 200),
    'Cada punto admite hasta 200 caracteres',
  ),
  startsAt: z.string().min(1, 'Indica la fecha y hora de inicio'),
  endsAt: z.string().optional(),
  coverUrl: optionalUrl,
  modality: z.enum(['IN_PERSON', 'ONLINE', 'HYBRID']),
  location: z.string().trim().max(180).optional(),
  meetingUrl: optionalUrl,
  teamsUrl: optionalUrl,
  youtubeUrl: optionalUrl,
  capacity: z.string().refine(
    (value) => !value || (/^\d+$/.test(value) && Number(value) >= 1),
    'La capacidad debe ser un entero mayor a cero',
  ),
  communitySlug: z.string().optional(),
}).superRefine((value, context) => {
  const start = new Date(value.startsAt);
  const end = value.endsAt ? new Date(value.endsAt) : null;
  if (end && !Number.isNaN(start.getTime()) && end <= start) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'La fecha de fin debe ser posterior al inicio' });
  }
  const hasLocation = Boolean(value.location?.trim());
  const hasOnlineLink = Boolean(value.meetingUrl?.trim() || value.teamsUrl?.trim());
  if (value.modality === 'IN_PERSON' && !hasLocation) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['location'], message: 'Indica el lugar de la mentoría presencial' });
  }
  if (value.modality === 'ONLINE' && !hasOnlineLink) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['meetingUrl'], message: 'Indica el enlace de la mentoría en línea' });
  }
  if (value.modality === 'HYBRID') {
    if (!hasLocation) context.addIssue({ code: z.ZodIssueCode.custom, path: ['location'], message: 'La modalidad híbrida requiere un lugar' });
    if (!hasOnlineLink) context.addIssue({ code: z.ZodIssueCode.custom, path: ['meetingUrl'], message: 'La modalidad híbrida requiere un enlace' });
  }
});

type MentorshipFormValues = z.infer<typeof mentorshipSchema>;
type CommunityOption = Pick<Community, 'id' | 'slug' | 'name'>;

function toLocalDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function directoryOption(user?: UserLite | null): DirectoryUserOption | null {
  if (!user?.id) return null;
  return { id: user.id, username: user.username, profile: user.profile, roles: user.roles };
}

function defaults(initial?: Mentorship): MentorshipFormValues {
  return {
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    area: initial?.area ?? '',
    difficulty: (initial?.difficulty as MentorshipFormValues['difficulty']) ?? 'BASICO',
    syllabus: initial?.syllabus?.join('\n') ?? '',
    startsAt: toLocalDateTime(initial?.startsAt),
    endsAt: toLocalDateTime(initial?.endsAt),
    coverUrl: initial?.coverUrl ?? '',
    modality: initial?.modality ?? 'ONLINE',
    location: initial?.location ?? '',
    meetingUrl: initial?.meetingUrl ?? '',
    teamsUrl: initial?.teamsUrl ?? '',
    youtubeUrl: initial?.youtubeUrl ?? '',
    capacity: initial?.capacity ? String(initial.capacity) : '',
    communitySlug: initial?.community?.slug ?? '',
  };
}

export function MentorshipForm({ initial, mode }: { initial?: Mentorship; mode: 'create' | 'edit' }) {
  const editing = mode === 'edit';
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userAsTeacher = useMemo<DirectoryUserOption | null>(() => {
    if (!user?.roles.includes('TEACHER')) return null;
    return {
      id: user.id,
      username: user.username,
      profile: user.profile,
      roles: user.roles,
    };
  }, [user]);
  const initialMentors = useMemo(() => {
    const values = initial?.mentors?.map((entry) => directoryOption(entry.user)).filter((entry): entry is DirectoryUserOption => Boolean(entry)) ?? [];
    if (values.length) return values;
    const legacy = directoryOption(initial?.mentor);
    if (legacy) return [legacy];
    return mode === 'create' && userAsTeacher ? [userAsTeacher] : [];
  }, [initial, mode, userAsTeacher]);
  const initialStudents = useMemo(() => {
    const users = initial?.participants ?? initial?.enrollments?.map((entry) => entry.user) ?? [];
    return users.map(directoryOption).filter((entry): entry is DirectoryUserOption => Boolean(entry));
  }, [initial]);
  const initialGalleryIds = useMemo(() => new Set(initial?.gallery?.map((asset) => asset.id) ?? []), [initial?.gallery]);
  const [mentors, setMentors] = useState<DirectoryUserOption[]>(initialMentors);
  const [students, setStudents] = useState<DirectoryUserOption[]>(initialStudents);
  const [gallery, setGallery] = useState<MediaAssetLite[]>(initial?.gallery ?? []);
  const [coverAsset, setCoverAsset] = useState<MediaAssetLite | null>(null);
  const [galleryUploadVersion, setGalleryUploadVersion] = useState(0);
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: communities = [], isLoading: loadingCommunities } = useQuery({
    queryKey: ['communities', 'mentorship-editor'],
    queryFn: () => api.get<CommunityOption[]>('/communities'),
  });
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MentorshipFormValues>({
    resolver: zodResolver(mentorshipSchema),
    defaultValues: defaults(initial),
  });
  const modality = useWatch({ control, name: 'modality' });
  const coverUrl = useWatch({ control, name: 'coverUrl' });
  const capacity = useWatch({ control, name: 'capacity' });
  const communityIsRequired = mode === 'create'
    && Boolean(user?.roles.includes('COMMUNITY_LEADER'))
    && !user?.roles.some((role) => role === 'ADMIN' || role === 'TEACHER');

  const addGalleryImage = (asset: MediaAssetLite) => {
    if (gallery.length >= 12) {
      setServerError('La galería admite hasta 12 imágenes.');
      void api.delete(`/media/${asset.id}`).catch(() => undefined);
      return;
    }
    setGallery((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset]);
    setGalleryUploadVersion((current) => current + 1);
  };

  const removeGalleryImage = async (asset: MediaAssetLite) => {
    if (!window.confirm('¿Retirar esta imagen de la galería?')) return;
    setBusyMediaId(asset.id);
    setServerError(null);
    try {
      if (initial && initialGalleryIds.has(asset.id)) {
        await api.delete(`/mentorships/${initial.id}/gallery/${asset.id}`);
      } else {
        await api.delete(`/media/${asset.id}`);
      }
      setGallery((current) => current.filter((item) => item.id !== asset.id));
      if (coverUrl === asset.url) setValue('coverUrl', '', { shouldDirty: true, shouldValidate: true });
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : 'No se pudo retirar la imagen.');
    } finally {
      setBusyMediaId(null);
    }
  };

  const removeCover = async () => {
    const asset = coverAsset;
    setCoverAsset(null);
    setValue('coverUrl', '', { shouldDirty: true, shouldValidate: true });
    if (asset) {
      try {
        await api.delete(`/media/${asset.id}`);
      } catch (cause) {
        setServerError(cause instanceof Error ? cause.message : 'No se pudo retirar la portada.');
      }
    }
  };

  const onSubmit = async (values: MentorshipFormValues) => {
    if (!mentors.length) {
      setServerError('Selecciona al menos un docente responsable.');
      return;
    }
    if (students.some((student) => mentors.some((mentor) => mentor.id === student.id))) {
      setServerError('Una misma persona no puede ser docente y estudiante de la mentoría.');
      return;
    }
    if (values.capacity && students.length > Number(values.capacity)) {
      setServerError('La cantidad de estudiantes seleccionados supera la capacidad.');
      return;
    }
    if (communityIsRequired && !values.communitySlug) {
      setServerError('Selecciona una comunidad que administras.');
      return;
    }
    setServerError(null);
    const payload = {
      title: values.title.trim(),
      description: values.description.trim(),
      area: values.area.trim(),
      difficulty: values.difficulty,
      syllabus: values.syllabus.split('\n').map((item) => item.trim()).filter(Boolean),
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
      coverUrl: values.coverUrl?.trim() || null,
      modality: values.modality,
      location: values.location?.trim() || null,
      meetingUrl: values.meetingUrl?.trim() || null,
      teamsUrl: values.teamsUrl?.trim() || null,
      youtubeUrl: values.youtubeUrl?.trim() || null,
      capacity: values.capacity ? Number(values.capacity) : null,
      mentorIds: mentors.map((mentor) => mentor.id),
      studentIds: students.map((student) => student.id),
      galleryImageIds: gallery.filter((asset) => !initialGalleryIds.has(asset.id)).map((asset) => asset.id),
      communitySlug: values.communitySlug || null,
    };
    try {
      const mentorship = editing
        ? await api.patch<Mentorship>(`/mentorships/${initial!.id}`, payload)
        : await api.post<Mentorship>('/mentorships', payload);
      await queryClient.invalidateQueries({ queryKey: ['mentorships'] });
      router.push(`/mentorias/${mentorship.slug}`);
      router.refresh();
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : 'No se pudo guardar la mentoría.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-8">
      <fieldset className="space-y-5">
        <legend className="mb-4 font-serif-heading text-xl font-bold text-primary">Información pública</legend>
        <div className="space-y-1.5">
          <Label htmlFor="mentorship-title">Título *</Label>
          <Input id="mentorship-title" placeholder="Introducción práctica a Docker" {...register('title')} />
          {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mentorship-description">Resumen y descripción *</Label>
          <Textarea id="mentorship-description" rows={5} placeholder="Objetivos, dinámica y resultados de aprendizaje…" {...register('description')} />
          {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mentorship-area">Área *</Label>
            <Input id="mentorship-area" placeholder="DevOps, IA, Programación…" {...register('area')} />
            {errors.area && <p className="text-xs text-red-500">{errors.area.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mentorship-difficulty">Nivel *</Label>
            <Select id="mentorship-difficulty" {...register('difficulty')}>
              <option value="BASICO">Básico</option>
              <option value="INTERMEDIO">Intermedio</option>
              <option value="AVANZADO">Avanzado</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mentorship-syllabus">Temario</Label>
          <Textarea id="mentorship-syllabus" rows={6} placeholder={'Un punto por línea\nFundamentos y preparación\nLaboratorio guiado\nProyecto final'} {...register('syllabus')} />
          <p className="text-[11px] text-muted-foreground">Un punto por línea, máximo 50.</p>
          {errors.syllabus && <p className="text-xs text-red-500">{errors.syllabus.message}</p>}
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-border pt-7">
        <legend className="font-serif-heading text-xl font-bold text-primary">Fecha, modalidad y acceso</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mentorship-start">Inicio *</Label>
            <Input id="mentorship-start" type="datetime-local" {...register('startsAt')} />
            {errors.startsAt && <p className="text-xs text-red-500">{errors.startsAt.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mentorship-end">Fin (opcional)</Label>
            <Input id="mentorship-end" type="datetime-local" {...register('endsAt')} />
            {errors.endsAt && <p className="text-xs text-red-500">{errors.endsAt.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mentorship-modality">Modalidad *</Label>
            <Select id="mentorship-modality" {...register('modality')}>
              <option value="IN_PERSON">Presencial</option>
              <option value="ONLINE">En línea</option>
              <option value="HYBRID">Híbrida / mixta</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mentorship-capacity">Capacidad</Label>
            <Input id="mentorship-capacity" type="number" min={1} step={1} placeholder="30" {...register('capacity')} />
            <p className="text-[11px] text-muted-foreground">{students.length} estudiante(s) seleccionado(s){capacity ? ` de ${capacity}` : ''}.</p>
            {errors.capacity && <p className="text-xs text-red-500">{errors.capacity.message}</p>}
          </div>
          {(modality === 'IN_PERSON' || modality === 'HYBRID') && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mentorship-location">Lugar *</Label>
              <Input id="mentorship-location" placeholder="Laboratorio, aula o dirección" {...register('location')} />
              {errors.location && <p className="text-xs text-red-500">{errors.location.message}</p>}
            </div>
          )}
          {(modality === 'ONLINE' || modality === 'HYBRID') && (
            <div className="space-y-1.5">
              <Label htmlFor="mentorship-meeting-url">Enlace de sesión *</Label>
              <Input id="mentorship-meeting-url" type="url" placeholder="https://meet.example/…" {...register('meetingUrl')} />
              {errors.meetingUrl && <p className="text-xs text-red-500">{errors.meetingUrl.message}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mentorship-teams-url">Canal de Teams (opcional)</Label>
            <Input id="mentorship-teams-url" type="url" placeholder="https://teams.microsoft.com/…" {...register('teamsUrl')} />
            {errors.teamsUrl && <p className="text-xs text-red-500">{errors.teamsUrl.message}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mentorship-youtube-url">Grabación o lista de sesiones (opcional)</Label>
            <Input id="mentorship-youtube-url" type="url" placeholder="https://youtube.com/…" {...register('youtubeUrl')} />
            {errors.youtubeUrl && <p className="text-xs text-red-500">{errors.youtubeUrl.message}</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-border pt-7">
        <legend className="font-serif-heading text-xl font-bold text-primary">Responsables y participantes</legend>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-1.5">
            <UserDirectoryMultiCombobox
              role="TEACHER"
              value={mentors}
              onChange={(next) => {
                const studentIds = new Set(students.map((student) => student.id));
                if (next.some((teacher) => studentIds.has(teacher.id))) {
                  setServerError('Una persona seleccionada como estudiante no puede ser docente responsable.');
                  return;
                }
                setMentors(next);
              }}
              maxSelected={12}
              required
              label="Docentes responsables"
              placeholder="Buscar docentes…"
              emptyMessage="No hay docentes activos que coincidan."
            />
            <p className="text-[11px] text-muted-foreground">El primer chip es el responsable principal. Debe existir al menos uno.</p>
          </div>
          <div className="space-y-1.5">
            <UserDirectoryMultiCombobox
              role="STUDENT"
              value={students}
              onChange={(next) => {
                const mentorIds = new Set(mentors.map((mentor) => mentor.id));
                if (next.some((student) => mentorIds.has(student.id))) {
                  setServerError('Una persona seleccionada como docente no puede ser estudiante.');
                  return;
                }
                if (capacity && next.length > Number(capacity)) {
                  setServerError('La selección supera la capacidad indicada.');
                  return;
                }
                setStudents(next);
              }}
              maxSelected={100}
              label="Estudiantes inscritos"
              placeholder="Buscar estudiantes…"
              emptyMessage="No hay estudiantes activos que coincidan."
            />
            <p className="text-[11px] text-muted-foreground">Agregar o retirar chips administra las inscripciones al guardar.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mentorship-community">Comunidad asociada {communityIsRequired ? '*' : ''}</Label>
          <Select id="mentorship-community" disabled={loadingCommunities} {...register('communitySlug')}>
            <option value="">Sin comunidad</option>
            {communities.map((community) => <option key={community.id} value={community.slug}>{community.name}</option>)}
          </Select>
          <p className="text-[11px] text-muted-foreground">Los líderes solo pueden asociarla a una comunidad que administran.</p>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-border pt-7">
        <legend className="font-serif-heading text-xl font-bold text-primary">Portada y galería</legend>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold"><ImagePlus className="h-4 w-4 text-teal-500" /> Portada</h3>
            <MediaUploadButton
              kind="image"
              disabled={isSubmitting}
              previewUrl={coverUrl}
              previewAlt="Vista previa de la portada"
              onUploaded={(asset) => {
                if (coverAsset && coverAsset.id !== asset.id) {
                  void api.delete(`/media/${coverAsset.id}`).catch(() => undefined);
                }
                setCoverAsset(asset);
                setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true });
              }}
              onRemove={() => void removeCover()}
            />
            <input type="hidden" {...register('coverUrl')} />
            {errors.coverUrl && <p className="text-xs text-red-500">{errors.coverUrl.message}</p>}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold">Agregar a la galería</h3>
            <p className="text-xs text-muted-foreground">Hasta 12 imágenes; cada archivo se comprime y muestra antes de guardar.</p>
            {gallery.length < 12 && (
              <MediaUploadButton
                key={`mentorship-gallery-${galleryUploadVersion}`}
                kind="image"
                disabled={isSubmitting}
                onUploaded={addGalleryImage}
              />
            )}
          </div>
        </div>
        {gallery.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((asset) => (
              <div key={asset.id} className="group relative overflow-hidden rounded-xl border border-border bg-secondary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.url} alt="Imagen de la galería" className="aspect-video w-full object-cover" />
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="absolute right-2 top-2"
                  disabled={busyMediaId === asset.id || isSubmitting}
                  onClick={() => void removeGalleryImage(asset)}
                >
                  {busyMediaId === asset.id ? <Loader2 className="animate-spin" /> : <Trash2 />} Retirar
                </Button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {serverError && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{serverError}</p>
      )}
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Link href={editing ? '/mentorias/gestionar' : '/mentorias'} className={cn(buttonVariants({ variant: 'outline' }), 'w-full sm:w-auto')}>Cancelar</Link>
        <Button type="submit" disabled={isSubmitting} size="lg" className="w-full sm:w-auto">
          {isSubmitting ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <GraduationCap />}
          {editing ? 'Guardar cambios' : 'Crear mentoría'}
        </Button>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarClock className="h-4 w-4" /> Los enlaces de acceso solo se muestran a personas inscritas y gestores.
      </p>
    </form>
  );
}
