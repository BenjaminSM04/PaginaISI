'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, FileCheck2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { UserLite } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { ReviewFeedback } from '@/components/review-feedback';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { MediaUploadButton } from '@/components/media-upload-button';

const schema = z.object({
  title: z.string().min(5, 'El título debe tener al menos 5 caracteres').max(200),
  abstract: z.string().min(50, 'El resumen debe tener al menos 50 caracteres').max(2000),
  content: z.string().max(50_000).optional(),
  area: z.string().min(3, 'Indica el área de investigación').max(80),
  impact: z.string().max(300).optional(),
  pdfUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  externalUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  doi: z.string().max(80).optional(),
  coverUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  tags: z.string().optional(),
  authorUsernames: z.string().optional(),
  externalAuthors: z.string().optional(),
  reviewerUsername: z.string().min(1, 'Selecciona un docente revisor'),
});

type FormData = z.infer<typeof schema>;

const emptyValues: FormData = {
  title: '', abstract: '', content: '', area: '', impact: '', pdfUrl: '', externalUrl: '', doi: '',
  coverUrl: '', tags: '', authorUsernames: '', externalAuthors: '', reviewerUsername: '',
};

function EditarArticuloForm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['article-edit', id],
    queryFn: () => api.get<any>(`/articles/mine/${id}`),
    enabled: !!id,
  });
  const { data: teachers } = useQuery({ queryKey: ['teachers'], queryFn: () => api.get<UserLite[]>('/users/directory/teachers') });
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!article) return;
    reset({
      title: article.title ?? '',
      abstract: article.abstract ?? '',
      content: article.content ?? '',
      area: article.area ?? '',
      impact: article.impact ?? '',
      pdfUrl: article.pdfUrl ?? '',
      externalUrl: article.externalUrl ?? '',
      doi: article.doi ?? '',
      coverUrl: article.coverUrl ?? '',
      tags: (article.tags ?? []).join(', '),
      authorUsernames: (article.authors ?? [])
        .map((author: any) => author.user?.username)
        .filter((username: string | undefined) => username && username !== article.owner?.username)
        .join(', '),
      externalAuthors: (article.authors ?? []).map((author: any) => author.externalName).filter(Boolean).join(', '),
      reviewerUsername: article.reviewer?.username ?? '',
    });
  }, [article, reset]);

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const split = (value?: string) => value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
      await api.patch(`/articles/${id}`, {
        title: data.title,
        abstract: data.abstract,
        content: data.content || undefined,
        area: data.area,
        impact: data.impact || null,
        pdfUrl: data.pdfUrl || null,
        externalUrl: data.externalUrl || null,
        doi: data.doi || null,
        coverUrl: data.coverUrl || null,
        tags: split(data.tags).map((tag) => tag.toLowerCase()),
        authorUsernames: split(data.authorUsernames).map((username) => username.toLowerCase()),
        externalAuthors: split(data.externalAuthors),
        reviewerUsername: data.reviewerUsername,
        resubmit: ['OBSERVED', 'REJECTED', 'DRAFT'].includes(article.status),
      });
      router.push('/cuenta?tab=articulos&actualizado=1');
    } catch (error: any) {
      setServerError(error.message);
    }
  };

  if (isLoading) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (isError || !article) return <div className="container max-w-3xl py-16 text-center"><p>No se pudo abrir este artículo o no tienes permiso para editarlo.</p></div>;

  const needsCorrection = ['OBSERVED', 'REJECTED', 'DRAFT'].includes(article.status);

  return (
    <div className="container max-w-3xl space-y-6 py-10">
      <Link href="/cuenta?tab=articulos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Volver a mis artículos
      </Link>
      <div>
        <span className="section-kicker">Investigación</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">{needsCorrection ? 'Corregir artículo científico' : 'Editar artículo científico'}</h1>
        {article.status === 'APPROVED' && <p className="mt-2 text-sm text-muted-foreground">Al modificar una publicación aprobada volverá a revisión antes de hacerse pública nuevamente.</p>}
      </div>

      <ReviewFeedback status={article.status} approvals={article.approvals} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <Field label="Título *" error={errors.title?.message}><Input {...register('title')} /></Field>
        <Field label="Resumen / Abstract *" error={errors.abstract?.message}><Textarea rows={6} {...register('abstract')} /></Field>
        <Field label="Contenido extendido"><Textarea rows={9} placeholder="Metodología, resultados, discusión y conclusiones" {...register('content')} /></Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Área de investigación *" error={errors.area?.message}><Input {...register('area')} /></Field>
          <Field label="Impacto o aporte"><Input {...register('impact')} /></Field>
          <Field label="PDF" error={errors.pdfUrl?.message}>
            <Input placeholder="https://…/articulo.pdf" {...register('pdfUrl')} />
            <MediaUploadButton kind="pdf" disabled={isSubmitting} onUploaded={(asset) => setValue('pdfUrl', asset.url, { shouldDirty: true, shouldValidate: true })} />
          </Field>
          <Field label="Enlace externo" error={errors.externalUrl?.message}><Input placeholder="https://arxiv.org/…" {...register('externalUrl')} /></Field>
          <Field label="DOI"><Input placeholder="10.1234/…" {...register('doi')} /></Field>
          <Field label="Imagen de portada" error={errors.coverUrl?.message}>
            <Input placeholder="https://…/portada.webp" {...register('coverUrl')} />
            <MediaUploadButton kind="image" disabled={isSubmitting} onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true })} />
          </Field>
        </div>

        <Field label="Tags (separados por coma)"><Input placeholder="ia, salud, visión-computacional" {...register('tags')} /></Field>
        <Field label="Coautores registrados (usernames)"><Input placeholder="jmamani, cflores" {...register('authorUsernames')} /></Field>
        <Field label="Coautores externos"><Input placeholder="Dra. Patricia Salazar" {...register('externalAuthors')} /></Field>
        <Field label="Docente revisor *" error={errors.reviewerUsername?.message}>
          <Select {...register('reviewerUsername')}><option value="">Selecciona un docente</option>{(teachers ?? []).map((teacher) => <option key={teacher.username} value={teacher.username}>{teacher.profile?.fullName ?? teacher.username}</option>)}</Select>
        </Field>

        {serverError && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{serverError}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <FileCheck2 />} {needsCorrection ? 'Guardar y reenviar a revisión' : 'Guardar cambios'}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{error && <p className="text-xs text-danger">{error}</p>}</div>;
}

export default function EditarArticuloPage() {
  return <RequireAuth><EditarArticuloForm /></RequireAuth>;
}
