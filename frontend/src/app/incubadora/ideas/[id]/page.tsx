'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  FileText,
  Lightbulb,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { IdeaProposal } from '@/lib/types';
import { BackButton } from '@/components/back-button';
import { IdeaReviewActions } from '@/components/idea-review-actions';
import { ExternalResourceLink } from '@/components/external-resource-link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared';
import { cn, formatDate } from '@/lib/utils';

function Paragraphs({ value }: { value: string }) {
  const parts = value.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  return <>{parts.map((part, index) => <p key={index}>{part}</p>)}</>;
}

export default function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const query = useQuery({
    queryKey: ['ideas', 'detail', id, user?.id],
    queryFn: () => api.get<IdeaProposal>(`/ideas/${id}`),
    enabled: !authLoading && Boolean(id),
    retry: false,
  });
  const archive = useMutation({
    mutationFn: () => api.delete(`/ideas/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ideas'] });
      router.push('/incubadora/mis-ideas');
      router.refresh();
    },
  });
  const idea = query.data;
  const owner = Boolean(user && idea?.owner?.id === user.id);
  const isAdmin = Boolean(user?.roles.includes('ADMIN'));
  const canEdit = Boolean(idea && (owner || isAdmin) && (idea.status !== 'APPROVED' || isAdmin));
  const canArchive = Boolean(idea && (owner || isAdmin) && (idea.status !== 'APPROVED' || isAdmin));
  const canReview = Boolean(
    idea?.status === 'PENDING'
    && user?.roles.some((role) => role === 'TEACHER' || role === 'ADMIN')
    && idea.owner?.id !== user?.id,
  );
  const images = idea?.media?.filter((asset) => asset.mime?.startsWith('image/')) ?? [];
  const documents = idea?.media?.filter((asset) => !asset.mime?.startsWith('image/')) ?? [];

  const confirmArchive = () => {
    if (!idea || !window.confirm(`¿Retirar la idea “${idea.title}”? Dejará de estar disponible.`)) return;
    archive.mutate();
  };

  if (authLoading || query.isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /><span className="sr-only">Cargando idea</span></div>;
  }
  if (query.isError || !idea) {
    return (
      <div className="container max-w-xl space-y-5 py-20 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-amber-500" />
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Idea no disponible</h1>
        <p className="text-sm text-muted-foreground">No existe, no está publicada o tu cuenta no tiene acceso a esta postulación.</p>
        <div className="flex justify-center gap-2">
          <Link href="/incubadora" className={buttonVariants({ variant: 'outline' })}>Volver</Link>
          <Button type="button" onClick={() => void query.refetch()}><RefreshCw /> Reintentar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl space-y-7 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton fallbackHref="/incubadora/ideas" label="Volver" variant="ghost" />
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link href={`/incubadora/ideas/${idea.id}/editar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Pencil /> Editar
            </Link>
          )}
          {canArchive && (
            <Button type="button" variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10" disabled={archive.isPending} onClick={confirmArchive}>
              {archive.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Retirar
            </Button>
          )}
        </div>
      </div>

      <header className="overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950 via-[#1a1040] to-[#0C1130] p-7 text-white md:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={idea.status} />
          {idea.isRealClient && <Badge className="border border-cyan-300/30 bg-cyan-300/15 text-cyan-100"><Building2 /> Cliente real</Badge>}
        </div>
        <h1 className="mt-4 font-serif-heading text-3xl font-bold leading-tight md:text-4xl">{idea.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/75">{idea.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {idea.technologies.map((technology) => <Badge key={technology} className="border border-white/20 bg-white/10 text-white">{technology}</Badge>)}
        </div>
      </header>

      {idea.reviewComment && (
        <section className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-5">
          <h2 className="font-semibold text-orange-700 dark:text-orange-300">Comentario de revisión</h2>
          <p className="mt-2 text-sm text-orange-800/80 dark:text-orange-100/80">{idea.reviewComment}</p>
          {canEdit && ['OBSERVED', 'REJECTED'].includes(idea.status) && (
            <Link href={`/incubadora/ideas/${idea.id}/editar`} className={cn(buttonVariants({ size: 'sm' }), 'mt-4')}>
              <RefreshCw /> Corregir y reenviar
            </Link>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <main className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary"><AlertTriangle className="h-5 w-5 text-purple-500" /> Problema</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90"><Paragraphs value={idea.problem} /></div>
          </section>
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary"><Lightbulb className="h-5 w-5 text-purple-500" /> Solución propuesta</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90"><Paragraphs value={idea.proposedSolution} /></div>
          </section>
          {idea.isRealClient && (
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="flex items-center gap-2 font-serif-heading text-xl font-bold text-primary"><Building2 className="h-5 w-5 text-purple-500" /> Cliente real</h2>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="font-semibold">Organización</dt><dd className="mt-1 text-muted-foreground">{idea.clientName}</dd></div>
                {idea.clientContactName && <div><dt className="font-semibold">Contacto</dt><dd className="mt-1 text-muted-foreground">{idea.clientContactName}</dd></div>}
                {idea.clientContact && <div><dt className="font-semibold">Medio de contacto</dt><dd className="mt-1 text-muted-foreground">{idea.clientContact}</dd></div>}
                <div className="sm:col-span-2"><dt className="font-semibold">Necesidad</dt><dd className="mt-1 text-muted-foreground">{idea.clientNeed}</dd></div>
              </dl>
              {idea.clientAuthorizationUrl && (
                <ExternalResourceLink href={idea.clientAuthorizationUrl} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}>
                  <FileText /> Ver autorización o respaldo
                </ExternalResourceLink>
              )}
            </section>
          )}
          {images.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-serif-heading text-xl font-bold text-primary">Imágenes</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {images.map((asset) => (
                  <a key={asset.id} href={asset.url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border border-border bg-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.url} alt={`Imagen de ${idea.title}`} className="aspect-video w-full object-cover transition hover:scale-[1.02]" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Postulante</h2>
            {idea.owner && (
              <Link href={`/perfil/${idea.owner.username}`} className="mt-3 flex items-center gap-3">
                <Avatar src={idea.owner.profile?.avatarUrl} name={idea.owner.profile?.fullName} className="h-11 w-11" />
                <span><span className="block text-sm font-bold">{idea.owner.profile?.fullName ?? idea.owner.username}</span><span className="text-xs text-muted-foreground">@{idea.owner.username}</span></span>
              </Link>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Postulada el {formatDate(idea.createdAt, true)}</p>
          </section>
          {(idea.members?.length ?? 0) > 0 && (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-purple-500" /> Integrantes</h2>
              <div className="mt-3 space-y-3">
                {idea.members!.map(({ user: member }) => (
                  <Link key={member.id ?? member.username} href={`/perfil/${member.username}`} className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-secondary">
                    <Avatar src={member.profile?.avatarUrl} name={member.profile?.fullName} className="h-8 w-8" />
                    <span className="min-w-0 truncate text-xs font-semibold">{member.profile?.fullName ?? member.username}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {(documents.length > 0 || idea.attachmentUrl) && (
            <section className="space-y-2 rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-bold">Respaldos</h2>
              {documents.map((asset, index) => (
                <ExternalResourceLink key={asset.id} href={asset.url} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}>
                  <FileText /> Documento {index + 1}
                </ExternalResourceLink>
              ))}
              {idea.attachmentUrl && !idea.media?.some((asset) => asset.url === idea.attachmentUrl) && (
                <ExternalResourceLink href={idea.attachmentUrl} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}>
                  <FileText /> Enlace de respaldo
                </ExternalResourceLink>
              )}
            </section>
          )}
        </aside>
      </div>

      {canReview && (
        <IdeaReviewActions
          idea={idea}
          onReviewed={(updated) => {
            queryClient.setQueryData(['ideas', 'detail', id, user?.id], updated);
            void queryClient.invalidateQueries({ queryKey: ['ideas'] });
          }}
        />
      )}
      {archive.error && <p role="alert" className="text-sm font-semibold text-red-500">{archive.error.message}</p>}
    </div>
  );
}
