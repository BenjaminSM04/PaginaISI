'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { CommunityForm } from '@/components/community-form';
import { CommunityMembersManager } from '@/components/community-members-manager';
import { api } from '@/lib/api';
import type { Community, CommunityMember, Paged } from '@/lib/types';
import type { DirectoryUserOption } from '@/components/remote-selectors';

function EditCommunityContent() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['community-management-detail', id],
    queryFn: async () => {
      const [community, teachersPage] = await Promise.all([
        api.get<Community>(`/communities/management/${id}`),
        api.get<Paged<CommunityMember>>(`/communities/management/${id}/members?role=TEACHER_LEAD&page=1&limit=20`),
      ]);
      const teachers: DirectoryUserOption[] = teachersPage.items.map((member) => ({
        id: member.userId ?? member.user.id ?? '',
        username: member.user.username,
        profile: member.user.profile,
        roles: ['TEACHER'],
      })).filter((teacher) => teacher.id);
      return { community, teachers };
    },
    enabled: !!id,
    retry: false,
  });
  return (
    <div className="container max-w-5xl space-y-8 py-10">
      <div>
        <Link href="/comunidades/gestionar" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Volver a gestión</Link>
        <span className="section-kicker block">Gestión de comunidad</span>
        <h1 className="mt-1 flex items-center gap-2 font-serif-heading text-3xl font-bold text-primary"><Pencil /> {data ? `Editar ${data.community.name}` : 'Editar comunidad'}</h1>
      </div>
      {isLoading && <div className="flex justify-center rounded-xl border border-border py-16"><Loader2 className="animate-spin text-primary" /></div>}
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error instanceof Error ? error.message : 'No se pudo cargar la comunidad'}</p>}
      {data && (
        <>
          <CommunityForm initial={data.community} initialTeachers={data.teachers} />
          <CommunityMembersManager community={data.community} />
        </>
      )}
    </div>
  );
}

export default function EditCommunityPage() {
  return <RequireAuth roles={['ADMIN', 'COMMUNITY_LEADER', 'TEACHER']}><EditCommunityContent /></RequireAuth>;
}
