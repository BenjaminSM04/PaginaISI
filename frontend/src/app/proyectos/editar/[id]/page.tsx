'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import type { Community, UserLite } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { ReviewFeedback } from '@/components/review-feedback';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { MediaUploadButton } from '@/components/media-upload-button';

const schema = z.object({
  title: z.string().min(5, 'El título debe tener al menos 5 caracteres').max(140),
  summary: z.string().min(10, 'El resumen debe tener al menos 10 caracteres').max(300),
  description: z.string().min(30, 'La descripción debe tener al menos 30 caracteres'),
  coverUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  videoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  repoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  demoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  subject: z.string().max(80).optional(),
  semester: z.string().optional(),
  phase: z.string().max(80).optional(),
  stage: z.enum(['PROPOSED', 'IN_DEVELOPMENT', 'FINISHED', 'FEATURED']),
  tags: z.string().optional(),
  technologies: z.string().optional(),
  memberUsernames: z.string().optional(),
  reviewerUsername: z.string().min(1, 'Selecciona un docente revisor'),
  communitySlug: z.string().optional(),
  isIncubator: z.boolean(),
  recruiting: z.boolean(),
});

type FormData = z.infer<typeof schema>;

const emptyValues: FormData = {
  title: '', summary: '', description: '', coverUrl: '', videoUrl: '', repoUrl: '', demoUrl: '',
  subject: '', semester: '', phase: '', stage: 'IN_DEVELOPMENT', tags: '', technologies: '',
  memberUsernames: '', reviewerUsername: '', communitySlug: '', isIncubator: false, recruiting: false,
};

function EditarProyectoForm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: project, isLoading, isError } = useQuery({
    queryKey: ['project-edit', id],
    queryFn: () => api.get<any>(`/projects/mine/${id}`),
    enabled: !!id,
  });
  const { data: teachers } = useQuery({ queryKey: ['teachers'], queryFn: () => api.get<UserLite[]>('/users/directory/teachers') });
  const { data: communities } = useQuery({ queryKey: ['communities-options'], queryFn: () => api.get<Community[]>('/communities') });
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!project) return;
    reset({
      title: project.title ?? '',
      summary: project.summary ?? '',
      description: project.description ?? '',
      coverUrl: project.coverUrl ?? '',
      videoUrl: project.videoUrl ?? '',
      repoUrl: project.repoUrl ?? '',
      demoUrl: project.demoUrl ?? '',
      subject: project.subject ?? '',
      semester: project.semester ? String(project.semester) : '',
      phase: project.phase ?? '',
      stage: project.stage ?? 'IN_DEVELOPMENT',
      tags: (project.tags ?? []).join(', '),
      technologies: (project.technologies ?? []).map((tech: any) => tech.name).join(', '),
      memberUsernames: (project.members ?? [])
        .map((member: any) => member.user?.username)
        .filter((username: string | undefined) => username && username !== project.owner?.username)
        .join(', '),
      reviewerUsername: project.reviewer?.username ?? '',
      communitySlug: project.community?.slug ?? '',
      isIncubator: !!project.isIncubator,
      recruiting: !!project.recruiting,
    });
  }, [project, reset]);

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const split = (value?: string) => value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
      await api.patch(`/projects/${id}`, {
        expectedVersion: project.version,
        title: data.title,
        summary: data.summary,
        description: data.description,
        coverUrl: data.coverUrl || null,
        videoUrl: data.videoUrl || null,
        repoUrl: data.repoUrl || null,
        demoUrl: data.demoUrl || null,
        subject: data.subject || null,
        semester: data.semester ? Number(data.semester) : null,
        phase: data.phase || null,
        stage: data.stage,
        tags: split(data.tags).map((tag) => tag.toLowerCase()),
        technologies: split(data.technologies),
        memberUsernames: split(data.memberUsernames).map((username) => username.toLowerCase()),
        reviewerUsername: data.reviewerUsername,
        communitySlug: data.communitySlug || null,
        isIncubator: data.isIncubator,
        recruiting: data.recruiting,
        resubmit: ['OBSERVED', 'REJECTED', 'DRAFT'].includes(project.status),
      });
      router.push('/cuenta?tab=proyectos&actualizado=1');
    } catch (error: any) {
      setServerError(error.message);
    }
  };

  if (isLoading) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (isError || !project) return <div className="container max-w-3xl py-16 text-center"><p>No se pudo abrir este proyecto o no tienes permiso para editarlo.</p></div>;

  const needsCorrection = ['OBSERVED', 'REJECTED', 'DRAFT'].includes(project.status);

  return (
    <div className="container max-w-3xl space-y-6 py-10">
      <Link href="/cuenta?tab=proyectos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Volver a mis proyectos
      </Link>
      <div>
        <span className="section-kicker">Edición</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">{needsCorrection ? 'Corregir proyecto' : 'Editar proyecto'}</h1>
        {project.status === 'APPROVED' && <p className="mt-2 text-sm text-muted-foreground">Al modificar una publicación aprobada volverá a revisión antes de hacerse pública nuevamente.</p>}
      </div>

      <ReviewFeedback status={project.status} approvals={project.approvals} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <Field label="Título *" error={errors.title?.message}><Input {...register('title')} /></Field>
        <Field label="Resumen corto *" error={errors.summary?.message}><Textarea rows={3} {...register('summary')} /></Field>
        <Field label="Descripción completa *" error={errors.description?.message}><Textarea rows={8} {...register('description')} /></Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Repositorio" error={errors.repoUrl?.message}><Input placeholder="https://github.com/…" {...register('repoUrl')} /></Field>
          <Field label="Demo en vivo" error={errors.demoUrl?.message}><Input placeholder="https://…" {...register('demoUrl')} /></Field>
          <Field label="Video" error={errors.videoUrl?.message}><Input placeholder="https://youtu.be/…" {...register('videoUrl')} /></Field>
          <Field label="Imagen de portada" error={errors.coverUrl?.message}>
            <Input placeholder="https://…/portada.webp" {...register('coverUrl')} />
            <MediaUploadButton kind="image" disabled={isSubmitting} onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true })} />
          </Field>
          <Field label="Materia"><Input {...register('subject')} /></Field>
          <Field label="Semestre">
            <Select {...register('semester')}><option value="">Sin especificar</option>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}º semestre</option>)}</Select>
          </Field>
          <Field label="Fase"><Input placeholder="MVP, piloto, producción…" {...register('phase')} /></Field>
          <Field label="Etapa">
            <Select {...register('stage')}><option value="PROPOSED">Propuesto</option><option value="IN_DEVELOPMENT">En desarrollo</option><option value="FINISHED">Finalizado</option><option value="FEATURED">Destacado</option></Select>
          </Field>
          <Field label="Docente revisor *" error={errors.reviewerUsername?.message}>
            <Select {...register('reviewerUsername')}><option value="">Selecciona un docente</option>{(teachers ?? []).map((teacher) => <option key={teacher.username} value={teacher.username}>{teacher.profile?.fullName ?? teacher.username}</option>)}</Select>
          </Field>
          <Field label="Comunidad">
            <Select {...register('communitySlug')}><option value="">Ninguna</option>{(communities ?? []).map((community) => <option key={community.slug} value={community.slug}>{community.name}</option>)}</Select>
          </Field>
        </div>

        <Field label="Tecnologías (separadas por coma)"><Input placeholder="React, NestJS, PostgreSQL" {...register('technologies')} /></Field>
        <Field label="Tags (separados por coma)"><Input placeholder="web, gestión, educación" {...register('tags')} /></Field>
        <Field label="Integrantes por username (sin incluirte)"><Input placeholder="jmamani, cflores" {...register('memberUsernames')} /></Field>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-[#06B6D4]" {...register('isIncubator')} /> Proyecto de incubadora</label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-[#06B6D4]" {...register('recruiting')} /> Busca integrantes</label>
        </div>

        {serverError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{serverError}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} {needsCorrection ? 'Guardar y reenviar a revisión' : 'Guardar cambios'}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{error && <p className="text-xs text-red-500">{error}</p>}</div>;
}

export default function EditarProyectoPage() {
  return <RequireAuth><EditarProyectoForm /></RequireAuth>;
}
