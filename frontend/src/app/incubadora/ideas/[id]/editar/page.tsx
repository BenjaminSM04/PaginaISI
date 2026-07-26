'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { IdeaProposal } from '@/lib/types';
import { BackButton } from '@/components/back-button';
import { IdeaForm } from '@/components/idea-form';
import { RequireAuth } from '@/components/require-auth';
import { buttonVariants } from '@/components/ui/button';

function EditarIdeaContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['ideas', 'detail', id, user?.id],
    queryFn: () => api.get<IdeaProposal>(`/ideas/${id}`),
    retry: false,
  });
  if (query.isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /><span className="sr-only">Cargando idea</span></div>;
  }
  const idea = query.data;
  const authorized = idea && (idea.owner?.id === user?.id || user?.roles.includes('ADMIN'));
  const editable = authorized && (idea.status !== 'APPROVED' || user?.roles.includes('ADMIN'));
  if (query.isError || !idea || !editable) {
    return (
      <div className="container max-w-xl space-y-4 py-20 text-center">
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Idea no disponible para edición</h1>
        <p className="text-sm text-muted-foreground">No existe, ya fue aprobada o tu cuenta no es la responsable de la postulación.</p>
        <Link href="/incubadora/mis-ideas" className={buttonVariants({ variant: 'outline' })}>Volver a mis ideas</Link>
      </div>
    );
  }
  return (
    <div className="container max-w-5xl space-y-7 py-10">
      <BackButton fallbackHref="/incubadora/mis-ideas" label="Volver a mis ideas" variant="ghost" />
      <header>
        <span className="section-kicker">Incubadora ISI</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Editar postulación</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {['OBSERVED', 'REJECTED'].includes(idea.status)
            ? 'Corrige la propuesta según la revisión. Al guardar, volverá a estado pendiente.'
            : 'Actualiza la propuesta antes de que el equipo docente emita una decisión.'}
        </p>
      </header>
      <IdeaForm initial={idea} />
    </div>
  );
}

export default function EditarIdeaPage() {
  return <RequireAuth><EditarIdeaContent /></RequireAuth>;
}
