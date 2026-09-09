'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Info, Loader2, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import type { Community, IncubatorClient } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { MediaUploadButton } from '@/components/media-upload-button';
import {
  CatalogCombobox,
  CatalogMultiCombobox,
  type CatalogOption,
  type DirectoryUserOption,
  UserDirectoryCombobox,
  UserDirectoryMultiCombobox,
} from '@/components/remote-selectors';
import { SEMESTERS } from '@/lib/academic';
import { PointReward } from '@/components/point-reward';
import { IncubatorClientSelector } from '@/components/incubator-client-selector';

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
  const [technologies, setTechnologies] = useState<CatalogOption[]>([]);
  const [tags, setTags] = useState<CatalogOption[]>([]);
  const [subject, setSubject] = useState<CatalogOption | null>(null);
  const [reviewer, setReviewer] = useState<DirectoryUserOption | null>(null);
  const [members, setMembers] = useState<DirectoryUserOption[]>([]);
  const [clients, setClients] = useState<IncubatorClient[]>([]);
  const { data: communities } = useQuery({ queryKey: ['communities'], queryFn: () => api.get<Community[]>('/communities') });

  const { register, handleSubmit, setValue, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      technologies: '',
      reviewerUsername: '',
      memberUsernames: '',
      tags: '',
      subject: '',
      semester: '',
      coverUrl: '',
      isIncubator: false,
      recruiting: false,
    },
  });
  const coverUrl = useWatch({ control, name: 'coverUrl' });
  const isIncubator = useWatch({ control, name: 'isIncubator' });
  const pendingCatalog = (kind: CatalogOption['kind']) => async (name: string): Promise<CatalogOption> => ({
    id: `pending:${kind}:${name.trim().toLocaleLowerCase('es').replace(/\s+/g, '-')}`,
    kind,
    name: name.trim().replace(/\s+/g, ' '),
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      await api.post('/projects', {
        title: data.title,
        summary: data.summary,
        description: data.description,
        technologies: technologies.map((item) => item.name),
        memberUsernames: members.map((member) => member.username),
        tags: tags.map((item) => item.name),
        repoUrl: data.repoUrl || undefined,
        demoUrl: data.demoUrl || undefined,
        videoUrl: data.videoUrl || undefined,
        coverUrl: data.coverUrl || undefined,
        subject: subject?.name || undefined,
        semester: data.semester ? Number(data.semester) : undefined,
        reviewerUsername: reviewer?.username ?? data.reviewerUsername,
        communitySlug: data.communitySlug || undefined,
        isIncubator: !!data.isIncubator,
        recruiting: !!data.recruiting,
        clientIds: data.isIncubator ? clients.map((client) => client.id) : [],
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
          revisor lo apruebe. Al aprobarse ganas <PointReward reason="PROYECTO_APROBADO" suffix="Dev Points" className="text-success" /> y podrás cumplir reglas de insignias activas.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input placeholder="Sistema de gestión de laboratorios" {...register('title')} />
          {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Resumen corto *</Label>
          <Input placeholder="Una frase que describa qué hace y para quién" {...register('summary')} />
          {errors.summary && <p className="text-xs text-danger">{errors.summary.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Descripción completa *</Label>
          <Textarea rows={6} placeholder="Problema, solución, arquitectura, resultados…" {...register('description')} />
          {errors.description && <p className="text-xs text-danger">{errors.description.message}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <input type="hidden" {...register('technologies')} />
            <CatalogMultiCombobox
              kind="TECHNOLOGY"
              label="Tecnologías"
              required
              value={technologies}
              onChange={(value) => {
                setTechnologies(value);
                setValue('technologies', value.map((item) => item.name).join(', '), { shouldValidate: true });
              }}
              allowCreate
              onCreate={pendingCatalog('TECHNOLOGY')}
              placeholder="Busca o crea una tecnología"
            />
            {errors.technologies && <p className="text-xs text-danger">{errors.technologies.message}</p>}
          </div>
          <div className="space-y-1.5">
            <input type="hidden" {...register('tags')} />
            <CatalogMultiCombobox
              kind="TAG"
              label="Tags"
              value={tags}
              onChange={(value) => {
                setTags(value);
                setValue('tags', value.map((item) => item.name).join(', '));
              }}
              allowCreate
              onCreate={pendingCatalog('TAG')}
              placeholder="Busca o crea un tag"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Repositorio (GitHub)</Label>
            <Input placeholder="https://github.com/usuario/repo" {...register('repoUrl')} />
            {errors.repoUrl && <p className="text-xs text-danger">{errors.repoUrl.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Demo desplegada</Label>
            <Input placeholder="https://mi-demo.vercel.app" {...register('demoUrl')} />
            {errors.demoUrl && <p className="text-xs text-danger">{errors.demoUrl.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Video corto (YouTube u otro)</Label>
            <Input placeholder="https://youtu.be/…" {...register('videoUrl')} />
          </div>
          <div className="space-y-1.5">
            <Label>Imagen de portada (URL)</Label>
            <Input placeholder="https://…/captura.png" {...register('coverUrl')} />
            {errors.coverUrl && <p className="text-xs text-danger">{errors.coverUrl.message}</p>}
            <MediaUploadButton
              kind="image"
              disabled={isSubmitting}
              previewUrl={coverUrl}
              previewAlt="Vista previa de la portada del proyecto"
              onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true })}
              onRemove={() => setValue('coverUrl', '', { shouldDirty: true, shouldValidate: true })}
            />
          </div>
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
              <option value="">Sin especificar</option>
              {SEMESTERS.map((semester) => (
                <option key={semester} value={semester}>{semester}º semestre</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <input type="hidden" {...register('reviewerUsername')} />
            <UserDirectoryCombobox
              role="TEACHER"
              label="Docente revisor"
              required
              value={reviewer}
              onChange={(value) => {
                setReviewer(value);
                setValue('reviewerUsername', value?.username ?? '', { shouldValidate: true });
              }}
              placeholder="Escribe al menos 2 caracteres"
            />
            {errors.reviewerUsername && <p className="text-xs text-danger">{errors.reviewerUsername.message}</p>}
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
          <input type="hidden" {...register('memberUsernames')} />
          <UserDirectoryMultiCombobox
            label="Integrantes"
            value={members}
            onChange={(value) => {
              setMembers(value);
              setValue('memberUsernames', value.map((member) => member.username).join(', '));
            }}
            placeholder="Busca por nombre o usuario; tú ya estás incluido"
          />
        </div>

        <div className="flex flex-wrap gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-accent" {...register('isIncubator')} /> Es proyecto de incubadora
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-accent" {...register('recruiting')} /> Buscamos integrantes
          </label>
        </div>

        {isIncubator && (
          <section className="space-y-3 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
            <div>
              <h2 className="font-serif-heading text-lg font-bold text-primary">Nuestros clientes</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Vincula empresas registradas o agrega una nueva con su logo para reutilizarla en otros proyectos.
              </p>
            </div>
            <IncubatorClientSelector
              value={clients}
              onChange={setClients}
              disabled={isSubmitting}
            />
          </section>
        )}

        {serverError && <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{serverError}</p>}

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
