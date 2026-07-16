'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Mentorship } from '@/lib/types';
import { MentorshipForm } from '@/components/mentorship-form';
import { RequireAuth } from '@/components/require-auth';

function EditarMentoriaContent() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['mentorships', 'management'],
    queryFn: () => api.get<{ items: Mentorship[]; myEnrollments: string[] }>('/mentorships'),
  });
  const mentorship = data?.items.find((item) => item.id === id);

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (error || !mentorship || !mentorship.canManage) {
    return (
      <div className="container max-w-2xl py-20 text-center">
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Mentoría no disponible para edición</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No existe, fue desactivada o no tienes permisos para administrarla.
        </p>
        <Link href="/mentorias/gestionar" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Volver a gestión
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl space-y-8 py-10">
      <div>
        <Link href="/mentorias/gestionar" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Volver a gestión
        </Link>
        <span className="section-kicker block">Panel de formación</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Editar mentoría</h1>
        <p className="mt-2 text-sm text-muted-foreground">Actualiza los datos públicos, enlaces, cupos, mentor y comunidad.</p>
      </div>
      <MentorshipForm mode="edit" initial={mentorship} />
    </div>
  );
}

export default function EditarMentoriaPage() {
  return (
    <RequireAuth roles={['ADMIN', 'TEACHER', 'COMMUNITY_LEADER']}>
      <EditarMentoriaContent />
    </RequireAuth>
  );
}
