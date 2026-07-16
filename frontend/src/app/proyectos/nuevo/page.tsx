'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Info, Loader2, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import type { Community, UserLite } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { MediaUploadButton } from '@/components/media-upload-button';

const schema = z.object({
  title: z.string().min(5, 'Mínimo 5 caracteres').max(140),
  summary: z.string().min(10, 'Mínimo 10 caracteres').max(300),
  description: z.string().min(30, 'Describe tu proyecto con al menos 30 caracteres'),
  technologies: z.string().min(2, 'Indica al menos una tecnología'),
  repoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  demoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  videoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  coverUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  subject: z.string().max(80).optional().or(z.literal('')),
  semester: z.string().optional(),
  reviewerUsername: z.string().min(1, 'Selecciona un docente revisor'),
  communitySlug: z.string().optional(),
  memberUsernames: z.string().optional(),
  tags: z.string().optional(),
  isIncubator: z.boolean().optional(),
  recruiting: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

function NuevoProyectoForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: teachers } = useQuery({ queryKey: ['teachers'], queryFn: () => api.get<UserLite[]>('/users/directory/teachers') });
  const { data: communities } = useQuery({ queryKey: ['communities'], queryFn: () => api.get<Community[]>('/communities') });

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      await api.post('/projects', {
        title: data.title,
        summary: data.summary,
        description: data.description,
        technologies: data.technologies.split(',').map((t) => t.trim()).filter(Boolean),
        memberUsernames: data.memberUsernames ? data.memberUsernames.split(',').map((m) => m.trim()).filter(Boolean) : [],
        tags: data.tags ? data.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
        repoUrl: data.repoUrl || undefined,
        demoUrl: data.demoUrl || undefined,
        videoUrl: data.videoUrl || undefined,
        coverUrl: data.coverUrl || undefined,
        subject: data.subject || undefined,
        semester: data.semester ? Number(data.semester) : undefined,
        reviewerUsername: data.reviewerUsername,
        communitySlug: data.communitySlug || undefined,
        isIncubator: !!data.isIncubator,
        recruiting: !!data.recruiting,
      });
      router.push('/cuenta?tab=proyectos&enviado=1');
    } catch (e: any) {
      setServerError(e.message);
    }
  };

  return (
    <div className="container max-w-3xl space-y-8 py-10">
      <div>
        <span className="section-kicker">Vitrina de proyectos</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Publicar mi proyecto</h1>
      </div>

      <div className="flex gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
        <Info className="h-5 w-5 shrink-0 text-accent" />
        <p>
          Tu proyecto quedará <strong>pendiente de aprobación</strong> y no será visible públicamente hasta que el docente
          revisor lo apruebe. Al aprobarse ganas <strong className="text-emerald-500">+40 Dev Points</strong> y la insignia
          «Primer Proyecto» si es el primero.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input placeholder="Sistema de gestión de laboratorios" {...register('title')} />
          {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Resumen corto *</Label>
          <Input placeholder="Una frase que describa qué hace y para quién" {...register('summary')} />
          {errors.summary && <p className="text-xs text-red-500">{errors.summary.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Descripción completa *</Label>
          <Textarea rows={6} placeholder="Problema, solución, arquitectura, resultados…" {...register('description')} />
          {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tecnologías * (separadas por coma)</Label>
            <Input placeholder="React, NestJS, PostgreSQL" {...register('technologies')} />
            {errors.technologies && <p className="text-xs text-red-500">{errors.technologies.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Tags (separados por coma)</Label>
            <Input placeholder="web, iot, salud" {...register('tags')} />
          </div>
          <div className="space-y-1.5">
            <Label>Repositorio (GitHub)</Label>
            <Input placeholder="https://github.com/usuario/repo" {...register('repoUrl')} />
            {errors.repoUrl && <p className="text-xs text-red-500">{errors.repoUrl.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Demo desplegada</Label>
            <Input placeholder="https://mi-demo.vercel.app" {...register('demoUrl')} />
            {errors.demoUrl && <p className="text-xs text-red-500">{errors.demoUrl.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Video corto (YouTube u otro)</Label>
            <Input placeholder="https://youtu.be/…" {...register('videoUrl')} />
          </div>
          <div className="space-y-1.5">
            <Label>Imagen de portada (URL)</Label>
            <Input placeholder="https://…/captura.png" {...register('coverUrl')} />
            {errors.coverUrl && <p className="text-xs text-red-500">{errors.coverUrl.message}</p>}
            <MediaUploadButton kind="image" disabled={isSubmitting} onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Materia</Label>
            <Input placeholder="Ingeniería de Software II" {...register('subject')} />
          </div>
          <div className="space-y-1.5">
            <Label>Semestre</Label>
            <Select {...register('semester')}>
              <option value="">Sin especificar</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}º semestre</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Docente revisor *</Label>
            <Select {...register('reviewerUsername')}>
              <option value="">Selecciona un docente</option>
              {(teachers ?? []).map((t) => (
                <option key={t.username} value={t.username}>{t.profile?.fullName ?? t.username}</option>
              ))}
            </Select>
            {errors.reviewerUsername && <p className="text-xs text-red-500">{errors.reviewerUsername.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Comunidad asociada</Label>
            <Select {...register('communitySlug')}>
              <option value="">Ninguna</option>
              {(communities ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Integrantes (usernames separados por coma)</Label>
          <Input placeholder="jmamani, cflores (tú ya estás incluido como líder)" {...register('memberUsernames')} />
        </div>

        <div className="flex flex-wrap gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[#06B6D4]" {...register('isIncubator')} /> Es proyecto de incubadora
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[#06B6D4]" {...register('recruiting')} /> Buscamos integrantes
          </label>
        </div>

        {serverError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{serverError}</p>}

        <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Rocket />} Enviar a revisión docente
        </Button>
      </form>
    </div>
  );
}

export default function NuevoProyectoPage() {
  return (
    <RequireAuth>
      <NuevoProyectoForm />
    </RequireAuth>
  );
}
