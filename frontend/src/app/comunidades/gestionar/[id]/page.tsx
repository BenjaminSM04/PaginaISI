'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { CommunityForm } from '@/components/community-form';
import { api } from '@/lib/api';
import type { Community } from '@/lib/types';

function EditCommunityContent() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['community-management-detail', id],
    queryFn: () => api.get<Community>(`/communities/management/${id}`),
    enabled: !!id,
    retry: false,
  });
  return (
    <div className="container max-w-3xl space-y-8 py-10">
      <div>
        <Link href="/comunidades/gestionar" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Volver a gestión</Link>
        <span className="section-kicker block">Gestión de comunidad</span>
        <h1 className="mt-1 flex items-center gap-2 font-serif-heading text-3xl font-bold text-primary"><Pencil /> {data ? `Editar ${data.name}` : 'Editar comunidad'}</h1>
      </div>
      {isLoading && <div className="flex justify-center rounded-xl border border-border py-16"><Loader2 className="animate-spin text-primary" /></div>}
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error instanceof Error ? error.message : 'No se pudo cargar la comunidad'}</p>}
      {data && <CommunityForm initial={data} />}
    </div>
  );
}

export default function EditCommunityPage() {
  return <RequireAuth roles={['ADMIN', 'COMMUNITY_LEADER', 'TEACHER']}><EditCommunityContent /></RequireAuth>;
}
