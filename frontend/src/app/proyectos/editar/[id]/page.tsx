'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { History, Loader2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import type { Community, IncubatorClient, ProjectVersionSummary } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { ReviewFeedback } from '@/components/review-feedback';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { MediaUploadButton } from '@/components/media-upload-button';
import { BackButton } from '@/components/back-button';
import {
  CatalogCombobox,
  CatalogMultiCombobox,
  type CatalogOption,
  type DirectoryUserOption,
  UserDirectoryCombobox,
  UserDirectoryMultiCombobox,
} from '@/components/remote-selectors';
import { SEMESTERS } from '@/lib/academic';
import { Badge } from '@/components/ui/badge';
import { formatDate, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils';
import { IncubatorClientSelector } from '@/components/incubator-client-selector';

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
  const [technologies, setTechnologies] = useState<CatalogOption[]>([]);
  const [tags, setTags] = useState<CatalogOption[]>([]);
  const [subject, setSubject] = useState<CatalogOption | null>(null);
  const [reviewer, setReviewer] = useState<DirectoryUserOption | null>(null);
  const [members, setMembers] = useState<DirectoryUserOption[]>([]);
  const [clients, setClients] = useState<IncubatorClient[]>([]);
  const { data: project, isLoading, isError } = useQuery({
    queryKey: ['project-edit', id],
    queryFn: () => api.get<any>(`/projects/mine/${id}`),
    enabled: !!id,
  });
  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ['project-versions', id],
    queryFn: () => api.get<ProjectVersionSummary[]>(`/projects/${id}/versions`),
    enabled: !!id && !!project,
  });
  const { data: communities } = useQuery({ queryKey: ['communities-options'], queryFn: () => api.get<Community[]>('/communities') });
  const { register, handleSubmit, reset, setValue, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });
  const coverUrl = useWatch({ control, name: 'coverUrl' });
  const isIncubator = useWatch({ control, name: 'isIncubator' });
  const pendingCatalog = (kind: CatalogOption['kind']) => async (name: string): Promise<CatalogOption> => ({
    id: `pending:${kind}:${name.trim().toLocaleLowerCase('es').replace(/\s+/g, '-')}`,
    kind,
    name: name.trim().replace(/\s+/g, ' '),
  });

  useEffect(() => {
    if (!project) return;
    const technologyOptions: CatalogOption[] = (project.technologies ?? []).map((technology: any) => ({
      id: technology.catalogValueId ?? technology.id ?? `existing:technology:${technology.name}`,
      kind: 'TECHNOLOGY',
      name: technology.name,
    }));
    const tagOptions: CatalogOption[] = (project.tags ?? []).map((tag: string | { id?: string; name: string }) => {
      const name = typeof tag === 'string' ? tag : tag.name;
      return {
        id: typeof tag === 'string' ? `existing:tag:${name}` : tag.id ?? `existing:tag:${name}`,
        kind: 'TAG',
        name,
      };
    });
    const memberOptions: DirectoryUserOption[] = (project.members ?? [])
      .map((member: any) => member.user)
      .filter((user: DirectoryUserOption | undefined) => user?.username && user.username !== project.owner?.username);
    const reviewerOption: DirectoryUserOption | null = project.reviewer
      ? {
        id: project.reviewer.id,
        username: project.reviewer.username,
        profile: project.reviewer.profile,
        roles: project.reviewer.roles?.map((entry: any) => entry.role?.name ?? entry.name).filter(Boolean),
      }
      : null;
    const subjectOption: CatalogOption | null = project.subject
      ? { id: `existing:subject:${project.subject}`, kind: 'SUBJECT', name: project.subject }
      : null;
    setTechnologies(technologyOptions);
    setTags(tagOptions);
    setMembers(memberOptions);
    setClients(project.clients ?? []);
    setReviewer(reviewerOption);
    setSubject(subjectOption);
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
      tags: tagOptions.map((tag) => tag.name).join(', '),
      technologies: technologyOptions.map((technology) => technology.name).join(', '),
      memberUsernames: memberOptions.map((member) => member.username).join(', '),
      reviewerUsername: project.reviewer?.username ?? '',
      communitySlug: project.community?.slug ?? '',
      isIncubator: !!project.isIncubator,
      recruiting: !!project.recruiting,
    });
  }, [project, reset]);

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const selectedClientIds = clients.map((client) => client.id);
      const previousClientIds = (project.clients ?? []).map((client: IncubatorClient) => client.id);
      const clientsChanged = [...selectedClientIds].sort().join('|') !== [...previousClientIds].sort().join('|');
      await api.patch(`/projects/${id}`, {
        expectedVersion: project.version,
        title: data.title,
        summary: data.summary,
        description: data.description,
        coverUrl: data.coverUrl || null,
        videoUrl: data.videoUrl || null,
        repoUrl: data.repoUrl || null,
        demoUrl: data.demoUrl || null,
        subject: subject?.name || null,
        semester: data.semester ? Number(data.semester) : null,
        phase: data.phase || null,
        stage: data.stage,
        tags: tags.map((tag) => tag.name),
        technologies: technologies.map((technology) => technology.name),
        memberUsernames: members.map((member) => member.username),
        reviewerUsername: reviewer?.username ?? data.reviewerUsername,
        communitySlug: data.communitySlug || null,
        isIncubator: data.isIncubator,
        recruiting: data.recruiting,
        ...(clientsChanged || data.isIncubator !== !!project.isIncubator
          ? { clientIds: data.isIncubator ? selectedClientIds : [] }
          : {}),
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
      <BackButton fallbackHref="/cuenta?tab=proyectos" label="Volver a mis proyectos" variant="ghost" />
      <div>
        <span className="section-kicker">Edición</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">{needsCorrection ? 'Corregir proyecto' : 'Editar proyecto'}</h1>
        {project.publicStatus === 'APPROVED' && (
          <p className="mt-2 text-sm text-muted-foreground">
            La versión pública actual seguirá visible mientras el docente revisa estos cambios.
          </p>
        )}
      </div>

      <ReviewFeedback status={project.status} approvals={project.approvals} />

      <details className="rounded-2xl border border-border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><History className="h-4 w-4 text-accent" /> Historial de versiones</span>
          <span className="text-xs font-normal text-muted-foreground">
            {versionsLoading ? 'Cargando…' : `${versions?.length ?? 0} versión${versions?.length === 1 ? '' : 'es'}`}
          </span>
        </summary>
        <div className="space-y-3 border-t border-border p-5">
          {(versions ?? []).map((version) => (
            <div key={version.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">Versión {version.number}</span>
                  <Badge className={STATUS_COLORS[version.status] ?? ''}>
                    {version.status === 'PUBLISHED' ? 'Publicada' : version.status === 'SUPERSEDED' ? 'Reemplazada' : STATUS_LABELS[version.status] ?? version.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enviada el {formatDate(version.submittedAt, true)}
                  {version.reviewer && ` · Revisor: ${version.reviewer.profile?.fullName ?? version.reviewer.username}`}
                </p>
                {version.reviewComment && <p className="mt-2 text-xs text-foreground/80">Comentario: {version.reviewComment}</p>}
              </div>
              {project.pendingVersion?.id === version.id && (
                <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-warning">
                  Versión de trabajo
                </span>
              )}
            </div>
          ))}
          {!versionsLoading && (versions?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Aún no hay versiones registradas.</p>}
        </div>
      </details>

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
            <MediaUploadButton
              kind="image"
              disabled={isSubmitting}
              previewUrl={coverUrl}
              previewAlt="Vista previa de la portada del proyecto"
              onUploaded={(asset) => setValue('coverUrl', asset.url, { shouldDirty: true, shouldValidate: true })}
              onRemove={() => setValue('coverUrl', '', { shouldDirty: true, shouldValidate: true })}
            />
          </Field>
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
          <Field label="Semestre">
            <Select {...register('semester')}><option value="">Sin especificar</option>{SEMESTERS.map((semester) => <option key={semester} value={semester}>{semester}º semestre</option>)}</Select>
          </Field>
          <Field label="Fase"><Input placeholder="MVP, piloto, producción…" {...register('phase')} /></Field>
          <Field label="Etapa">
            <Select {...register('stage')}><option value="PROPOSED">Propuesto</option><option value="IN_DEVELOPMENT">En desarrollo</option><option value="FINISHED">Finalizado</option><option value="FEATURED">Destacado</option></Select>
          </Field>
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
          <Field label="Comunidad">
            <Select {...register('communitySlug')}><option value="">Ninguna</option>{(communities ?? []).map((community) => <option key={community.slug} value={community.slug}>{community.name}</option>)}</Select>
          </Field>
        </div>

        <div className="space-y-1.5">
          <input type="hidden" {...register('technologies')} />
          <CatalogMultiCombobox
            kind="TECHNOLOGY"
            label="Tecnologías"
            value={technologies}
            onChange={(value) => {
              setTechnologies(value);
              setValue('technologies', value.map((item) => item.name).join(', '));
            }}
            allowCreate
            onCreate={pendingCatalog('TECHNOLOGY')}
            placeholder="Busca o crea tecnologías"
          />
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
            placeholder="Busca o crea tags"
          />
        </div>
        <div className="space-y-1.5">
          <input type="hidden" {...register('memberUsernames')} />
          <UserDirectoryMultiCombobox
            label="Integrantes (sin incluirte)"
            value={members}
            onChange={(value) => {
              setMembers(value);
              setValue('memberUsernames', value.map((member) => member.username).join(', '));
            }}
            placeholder="Busca por nombre o usuario"
          />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-accent" {...register('isIncubator')} /> Proyecto de incubadora</label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-accent" {...register('recruiting')} /> Busca integrantes</label>
        </div>

        {isIncubator && (
          <section className="space-y-3 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
            <div>
              <h2 className="font-serif-heading text-lg font-bold text-primary">Nuestros clientes</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecciona empresas de la cartera o registra una nueva con su logo.
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
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} {needsCorrection ? 'Guardar y reenviar a revisión' : 'Guardar cambios'}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{error && <p className="text-xs text-danger">{error}</p>}</div>;
}

export default function EditarProyectoPage() {
  return <RequireAuth><EditarProyectoForm /></RequireAuth>;
}
