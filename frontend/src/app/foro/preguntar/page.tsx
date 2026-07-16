'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Loader2, MessageSquarePlus } from 'lucide-react';
import { api } from '@/lib/api';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { ForumImagePicker, ForumTagInput, uploadForumImages } from '@/components/forum-inputs';

const schema = z.object({
  title: z.string().min(10, 'Sé más específico (mínimo 10 caracteres)').max(180),
  body: z.string().min(20, 'Describe tu problema con al menos 20 caracteres'),
  subject: z.string().max(80).optional().or(z.literal('')),
  semester: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function PreguntarForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });
  const { data: popularTags } = useQuery({
    queryKey: ['forum-tags'],
    queryFn: () => api.get<{ tag: string; count: number }[]>('/forum/tags'),
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const uploadedImages = await uploadForumImages(images);
      const question = await api.post<{ id: string }>('/forum/questions', {
        title: data.title,
        body: data.body,
        tags,
        subject: data.subject || undefined,
        semester: data.semester ? Number(data.semester) : undefined,
        imageIds: uploadedImages.map((image) => image.id),
      });
      router.push(`/foro/${question.id}`);
    } catch (e: any) {
      setServerError(e.message);
    }
  };

  return (
    <div className="container max-w-3xl space-y-8 py-10">
      <div>
        <span className="section-kicker">Foro Q&A</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Hacer una pregunta</h1>
      </div>

      <div className="flex gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
        <Info className="h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="font-semibold">Consejos para una buena pregunta (+5 pts):</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
            <li>Título específico: qué intentas, qué falla.</li>
            <li>Incluye código, mensajes de error y lo que ya probaste.</li>
            <li>Agrega hasta 5 tags para que la persona indicada la encuentre.</li>
            <li>Puedes adjuntar hasta 2 imágenes; se comprimen automáticamente.</li>
          </ul>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input placeholder="¿Cómo evitar el error N+1 con Prisma en NestJS?" {...register('title')} />
          {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Detalle del problema *</Label>
          <Textarea rows={8} placeholder="Contexto, código relevante, error exacto y qué intentaste…" {...register('body')} />
          {errors.body && <p className="text-xs text-red-500">{errors.body.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Tags (máximo 5)</Label>
          <ForumTagInput
            value={tags}
            onChange={setTags}
            suggestions={(popularTags ?? []).map((item) => item.tag)}
            disabled={isSubmitting}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Materia</Label>
            <Input placeholder="Base de Datos II" {...register('subject')} />
          </div>
          <div className="space-y-1.5">
            <Label>Semestre</Label>
            <Select {...register('semester')}>
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}º</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Capturas o imágenes (opcional)</Label>
          <ForumImagePicker value={images} onChange={setImages} disabled={isSubmitting} />
        </div>

        {serverError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{serverError}</p>}

        <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
          {isSubmitting ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />} Publicar pregunta
        </Button>
      </form>
    </div>
  );
}

export default function PreguntarPage() {
  return (
    <RequireAuth>
      <PreguntarForm />
    </RequireAuth>
  );
}
