'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Loader2, MessageSquarePlus } from 'lucide-react';
import { api } from '@/lib/api';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { ForumImagePicker, uploadForumImages } from '@/components/forum-inputs';
import { SEMESTERS } from '@/lib/academic';
import { PointReward } from '@/components/point-reward';
import {
  CatalogCombobox,
  CatalogMultiCombobox,
  type CatalogOption,
} from '@/components/remote-selectors';

const schema = z.object({
  title: z.string().min(10, 'Sé más específico (mínimo 10 caracteres)').max(180),
  body: z.string().min(20, 'Describe tu problema con al menos 20 caracteres'),
  subject: z.string().max(80).optional().or(z.literal('')),
  semester: z
    .string()
    .optional()
    .refine((value) => !value || SEMESTERS.includes(Number(value)), 'Selecciona un semestre entre 1º y 8º'),
});

type FormData = z.infer<typeof schema>;

function PreguntarForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tags, setTags] = useState<CatalogOption[]>([]);
  const [subject, setSubject] = useState<CatalogOption | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { subject: '', semester: '' },
  });
  const pendingCatalog = (kind: CatalogOption['kind']) => async (name: string): Promise<CatalogOption> => ({
    id: `pending:${kind}:${name.trim().toLocaleLowerCase('es').replace(/\s+/g, '-')}`,
    kind,
    name: name.trim().replace(/\s+/g, ' '),
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const uploadedImages = await uploadForumImages(images);
      const question = await api.post<{ id: string }>('/forum/questions', {
        title: data.title,
        body: data.body,
        tags: tags.map((tag) => tag.name),
        subject: subject?.name || undefined,
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
          <p className="font-semibold">Consejos para una buena pregunta <PointReward reason="PREGUNTA_PUBLICADA" parentheses />:</p>
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
          {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Detalle del problema *</Label>
          <Textarea rows={8} placeholder="Contexto, código relevante, error exacto y qué intentaste…" {...register('body')} />
          {errors.body && <p className="text-xs text-danger">{errors.body.message}</p>}
        </div>

        <div className="space-y-1.5">
          <CatalogMultiCombobox
            kind="TAG"
            label="Tags (máximo 5)"
            value={tags}
            onChange={setTags}
            disabled={isSubmitting}
            maxSelected={5}
            allowCreate
            onCreate={pendingCatalog('TAG')}
            placeholder="Busca o crea un tag"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <input type="hidden" {...register('subject')} />
            <CatalogCombobox
              kind="SUBJECT"
              label="Materia"
              value={subject}
              onChange={(value) => {
                setSubject(value);
                setValue('subject', value?.name ?? '');
              }}
              allowCreate
              onCreate={pendingCatalog('SUBJECT')}
              placeholder="Busca o crea una materia"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Semestre</Label>
            <Select {...register('semester')}>
              <option value="">—</option>
              {SEMESTERS.map((semester) => (
                <option key={semester} value={semester}>{semester}º</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Capturas o imágenes (opcional)</Label>
          <ForumImagePicker value={images} onChange={setImages} disabled={isSubmitting} />
        </div>

        {serverError && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{serverError}</p>}

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
