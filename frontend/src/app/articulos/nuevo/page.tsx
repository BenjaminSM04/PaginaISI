'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { FileText, Info, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { UserLite } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { MediaUploadButton } from '@/components/media-upload-button';

const schema = z.object({
  title: z.string().min(5).max(200),
  abstract: z.string().min(50, 'El resumen debe tener al menos 50 caracteres').max(2000),
  content: z.string().optional(),
  area: z.string().min(3, 'Indica el área de investigación').max(80),
  impact: z.string().max(300).optional().or(z.literal('')),
  pdfUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  coverUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  externalUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  doi: z.string().max(80).optional().or(z.literal('')),
  tags: z.string().optional(),
  authorUsernames: z.string().optional(),
  externalAuthors: z.string().optional(),
  reviewerUsername: z.string().min(1, 'Selecciona un docente revisor'),
});

type FormData = z.infer<typeof schema>;

function NuevoArticuloForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: teachers } = useQuery({ queryKey: ['teachers'], queryFn: () => api.get<UserLite[]>('/users/directory/teachers') });

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      await api.post('/articles', {
        title: data.title,
        abstract: data.abstract,
        content: data.content || undefined,
        area: data.area,
        impact: data.impact || undefined,
        pdfUrl: data.pdfUrl || undefined,
        coverUrl: data.coverUrl || undefined,
        externalUrl: data.externalUrl || undefined,
        doi: data.doi || undefined,
        tags: data.tags ? data.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
        authorUsernames: data.authorUsernames ? data.authorUsernames.split(',').map((a) => a.trim()).filter(Boolean) : [],
        externalAuthors: data.externalAuthors ? data.externalAuthors.split(',').map((a) => a.trim()).filter(Boolean) : [],
        reviewerUsername: data.reviewerUsername,
      });
      router.push('/cuenta?tab=articulos&enviado=1');
    } catch (e: any) {
      setServerError(e.message);
    }
  };

  return (
    <div className="container max-w-3xl space-y-8 py-10">
      <div>
        <span className="section-kicker">Investigación</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Enviar artículo científico</h1>
      </div>

      <div className="flex gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
        <Info className="h-5 w-5 shrink-0 text-accent" />
        <p>
          El artículo pasa por revisión docente antes de publicarse. Al aprobarse ganas
          <strong className="text-purple-500"> +35 Research Points</strong> y la insignia «Primer Artículo».
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input placeholder="Título del trabajo de investigación" {...register('title')} />
          {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Resumen / Abstract *</Label>
          <Textarea rows={5} placeholder="Contexto, metodología, resultados y conclusiones en un párrafo" {...register('abstract')} />
          {errors.abstract && <p className="text-xs text-red-500">{errors.abstract.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Contenido extendido (opcional)</Label>
          <Textarea rows={6} placeholder="Puedes incluir secciones adicionales del trabajo" {...register('content')} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Área de investigación *</Label>
            <Input placeholder="Inteligencia Artificial en Salud" {...register('area')} />
            {errors.area && <p className="text-xs text-red-500">{errors.area.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Impacto o aporte</Label>
            <Input placeholder="¿Qué aporta este trabajo?" {...register('impact')} />
          </div>
          <div className="space-y-1.5">
            <Label>PDF (URL)</Label>
            <Input placeholder="https://…/paper.pdf" {...register('pdfUrl')} />
            {errors.pdfUrl && <p className="text-xs text-red-500">{errors.pdfUrl.message}</p>}
            <MediaUploadButton kind="pdf" disabled={isSubmitting} onUploaded={(asset) => setValue('pdfUrl', asset.url, { shouldDirty: true, shouldValidate: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Enlace externo / repositorio</Label>
            <Input placeholder="https://arxiv.org/…" {...register('externalUrl')} />
          </div>
          <div className="space-y-1.5">
            <Label>DOI (opcional)</Label>
            <Input placeholder="10.1234/ejemplo.2026" {...register('doi')} />
          </div>
          <div className="space-y-1.5">
            <Label>Imagen de portada</Label>
            <Input placeholder="https://…/portada.webp" {...register('coverUrl')} />
            {errors.coverUrl && <p className="text-xs text-red-500">{errors.coverUrl.message}</p>}
            <MediaUploadButton kind="image" disabled={isSubmitting} onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Tags (separados por coma)</Label>
            <Input placeholder="cnn, salud, visión-computacional" {...register('tags')} />
          </div>
          <div className="space-y-1.5">
            <Label>Coautores registrados (usernames)</Label>
            <Input placeholder="jmamani, cflores" {...register('authorUsernames')} />
          </div>
          <div className="space-y-1.5">
            <Label>Coautores externos (nombres)</Label>
            <Input placeholder="Dra. Patricia Salazar" {...register('externalAuthors')} />
          </div>
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

        {serverError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{serverError}</p>}

        <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
          {isSubmitting ? <Loader2 className="animate-spin" /> : <FileText />} Enviar a revisión
        </Button>
      </form>
    </div>
  );
}

export default function NuevoArticuloPage() {
  return (
    <RequireAuth>
      <NuevoArticuloForm />
    </RequireAuth>
  );
}
