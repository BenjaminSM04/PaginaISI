'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Loader2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Community, Mentorship, UserLite } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';

const optionalUrl = z.string().url('URL inválida').max(2048).optional().or(z.literal(''));
const schema = z.object({
  title: z.string().trim().min(5, 'Escribe al menos 5 caracteres').max(140),
  description: z.string().trim().min(10, 'Escribe al menos 10 caracteres').max(10_000),
  area: z.string().trim().min(1, 'Indica el área').max(80),
  difficulty: z.enum(['BASICO', 'INTERMEDIO', 'AVANZADO']),
  syllabus: z.string().refine(
    (value) => value.split('\n').map((item) => item.trim()).filter(Boolean).length <= 50,
    'El temario admite hasta 50 puntos',
  ).refine(
    (value) => value.split('\n').every((item) => item.trim().length <= 200),
    'Cada punto del temario admite hasta 200 caracteres',
  ),
  startsAt: z.string().optional(),
  teamsUrl: optionalUrl,
  youtubeUrl: optionalUrl,
  capacity: z.string().refine(
    (value) => !value || (/^\d+$/.test(value) && Number(value) >= 1),
    'La capacidad debe ser un entero mayor a cero',
  ),
  mentorUsername: z.string().optional(),
  mentorName: z.string().max(80).optional(),
  communitySlug: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type TeacherOption = Pick<UserLite, 'username' | 'profile'>;
type CommunityOption = Pick<Community, 'id' | 'slug' | 'name'>;

function toLocalDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function MentorshipForm({ initial, mode }: { initial?: Mentorship; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const communityIsRequired = mode === 'create'
    && !!user?.roles.includes('COMMUNITY_LEADER')
    && !user.roles.some((role) => role === 'ADMIN' || role === 'TEACHER');
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: communities = [], isLoading: loadingCommunities } = useQuery({
    queryKey: ['communities', 'mentorship-editor'],
    queryFn: () => api.get<CommunityOption[]>('/communities'),
  });
  const { data: teachers = [], isLoading: loadingTeachers } = useQuery({
    queryKey: ['teachers', 'mentorship-editor'],
    queryFn: () => api.get<TeacherOption[]>('/users/directory/teachers'),
  });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      area: initial?.area ?? '',
      difficulty: (initial?.difficulty as FormData['difficulty']) ?? 'BASICO',
      syllabus: initial?.syllabus?.join('\n') ?? '',
      startsAt: toLocalDateTime(initial?.startsAt),
      teamsUrl: initial?.teamsUrl ?? '',
      youtubeUrl: initial?.youtubeUrl ?? '',
      capacity: initial?.capacity ? String(initial.capacity) : '',
      mentorUsername: initial?.mentor?.username ?? (mode === 'create' && user?.roles.includes('TEACHER') ? user.username : ''),
      mentorName: initial?.mentorName ?? '',
      communitySlug: initial?.community?.slug ?? '',
    },
  });

  const onSubmit = async (form: FormData) => {
    setServerError(null);
    if (communityIsRequired && !form.communitySlug) {
      setError('communitySlug', { type: 'required', message: 'Selecciona una comunidad que administras' });
      return;
    }
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        area: form.area.trim(),
        difficulty: form.difficulty,
        syllabus: form.syllabus.split('\n').map((item) => item.trim()).filter(Boolean),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        teamsUrl: form.teamsUrl || undefined,
        youtubeUrl: form.youtubeUrl || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        mentorUsername: form.mentorUsername || undefined,
        mentorName: form.mentorName?.trim() || undefined,
        communitySlug: form.communitySlug || undefined,
      };
      const mentorship = mode === 'create'
        ? await api.post<Mentorship>('/mentorships', body)
        : await api.patch<Mentorship>(`/mentorships/${initial!.id}`, body);
      await queryClient.invalidateQueries({ queryKey: ['mentorships'] });
      router.push(mode === 'create' ? `/mentorias/${mentorship.slug}` : '/mentorias/gestionar');
      router.refresh();
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : 'No se pudo guardar la mentoría.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Título *</Label>
          <Input id="title" placeholder="Introducción práctica a Docker" {...register('title')} />
          {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Descripción *</Label>
          <Textarea id="description" rows={5} placeholder="Objetivos, dinámica y conocimientos que obtendrá el estudiante…" {...register('description')} />
          {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="area">Área *</Label>
          <Input id="area" placeholder="DevOps, IA, Programación…" {...register('area')} />
          {errors.area && <p className="text-xs text-red-500">{errors.area.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="difficulty">Nivel *</Label>
          <Select id="difficulty" {...register('difficulty')}>
            <option value="BASICO">Básico</option>
            <option value="INTERMEDIO">Intermedio</option>
            <option value="AVANZADO">Avanzado</option>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="syllabus">Temario</Label>
          <Textarea id="syllabus" rows={6} placeholder={'Un punto por línea\nFundamentos y preparación\nLaboratorio guiado\nProyecto final'} {...register('syllabus')} />
          <p className="text-[11px] text-muted-foreground">Un punto por línea, máximo 50.</p>
          {errors.syllabus && <p className="text-xs text-red-500">{errors.syllabus.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="startsAt">Fecha y hora de inicio</Label>
          <Input id="startsAt" type="datetime-local" {...register('startsAt')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="capacity">Capacidad</Label>
          <Input id="capacity" type="number" min={1} step={1} placeholder="30" {...register('capacity')} />
          {errors.capacity && <p className="text-xs text-red-500">{errors.capacity.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="communitySlug">Comunidad asociada {communityIsRequired ? '*' : ''}</Label>
          <Select id="communitySlug" disabled={loadingCommunities} {...register('communitySlug')}>
            <option value="">Sin comunidad</option>
            {communities.map((community) => (
              <option key={community.id} value={community.slug}>{community.name}</option>
            ))}
          </Select>
          <p className="text-[11px] text-muted-foreground">Los líderes solo pueden usar comunidades que administran.</p>
          {errors.communitySlug && <p className="text-xs text-red-500">{errors.communitySlug.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mentorUsername">Docente o mentor registrado</Label>
          <Select id="mentorUsername" disabled={loadingTeachers} {...register('mentorUsername')}>
            <option value="">Sin mentor registrado</option>
            {teachers.map((teacher) => (
              <option key={teacher.username} value={teacher.username}>
                {teacher.profile?.fullName ?? teacher.username} (@{teacher.username})
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mentorName">Nombre de mentor externo</Label>
          <Input id="mentorName" placeholder="Solo si no tiene cuenta en el portal" {...register('mentorName')} />
          {errors.mentorName && <p className="text-xs text-red-500">{errors.mentorName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="teamsUrl">Canal de Teams / comunicación</Label>
          <Input id="teamsUrl" type="url" placeholder="https://teams.microsoft.com/…" {...register('teamsUrl')} />
          {errors.teamsUrl && <p className="text-xs text-red-500">{errors.teamsUrl.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="youtubeUrl">Video o lista de sesiones en YouTube</Label>
          <Input id="youtubeUrl" type="url" placeholder="https://www.youtube.com/…" {...register('youtubeUrl')} />
          {errors.youtubeUrl && <p className="text-xs text-red-500">{errors.youtubeUrl.message}</p>}
        </div>
      </div>

      {serverError && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{serverError}</p>
      )}

      <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
        <Link href={mode === 'edit' ? '/mentorias/gestionar' : '/mentorias'} className={cn(buttonVariants({ variant: 'outline' }))}>
          Cancelar
        </Link>
        <Button type="submit" disabled={isSubmitting} size="lg">
          {isSubmitting ? <Loader2 className="animate-spin" /> : mode === 'create' ? <GraduationCap /> : <Save />}
          {mode === 'create' ? 'Crear mentoría' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
