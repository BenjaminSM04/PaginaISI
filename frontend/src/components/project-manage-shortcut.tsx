'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ProjectManagementDetail } from '@/lib/types';
import { buttonVariants } from '@/components/ui/button';

export function ProjectManageShortcut({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['project-manage-access', projectId, user?.id],
    queryFn: () => api.get<ProjectManagementDetail>(`/projects/${projectId}/manage`),
    enabled: !!user,
    retry: false,
    staleTime: 30_000,
  });
  if (!user || !data?.access || !(data.access.isAdmin || data.access.isOwner || data.access.isMember)) return null;
  return <Link href={`/proyectos/gestionar/${projectId}`} className={buttonVariants({ variant: 'outline', className: 'w-full' })}><FolderKanban /> Gestionar proyecto</Link>;
}
