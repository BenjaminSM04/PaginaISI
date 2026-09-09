'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Loader2, Pencil, Plus, Settings, Users } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { Community } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function CommunityManagementContent() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['community-management'],
    queryFn: () => api.get<Community[]>('/communities/management/mine'),
    retry: false,
  });
  const isAdmin = !!user?.roles.includes('ADMIN');

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/comunidades?vista=comunidades" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Volver a comunidades</Link>
          <span className="section-kicker block">Panel operativo</span>
          <h1 className="mt-1 flex items-center gap-2 font-serif-heading text-3xl font-bold text-primary"><Settings /> Gestión de comunidades</h1>
          <p className="mt-2 text-sm text-muted-foreground">Actualiza presentación, responsables, canales, miembros y estado desde un solo lugar.</p>
        </div>
        {isAdmin && <Link href="/comunidades/gestionar/nueva" className={buttonVariants()}><Plus /> Nueva comunidad</Link>}
      </div>

      {isLoading && <div className="flex justify-center rounded-xl border border-border py-16"><Loader2 className="animate-spin text-primary" /></div>}
      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error instanceof Error ? error.message : 'No se pudo cargar el panel'}</p>}
      {data && !data.length && <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">No tienes comunidades asignadas para gestionar.</div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((community) => (
          <article key={community.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="h-24" style={{ background: community.coverUrl ? `url(${community.coverUrl}) center/cover` : `linear-gradient(135deg, ${community.accentColor ?? '#06B6D4'}55, transparent)` }} />
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-2">
                <div><h2 className="font-serif-heading text-lg font-bold text-primary">{community.name}</h2><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{community.description}</p></div>
                <Badge variant={community.isActive === false ? 'outline' : 'success'}>{community.isActive === false ? 'Inactiva' : 'Activa'}</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> {community._count?.members ?? 0} miembros · {community._count?.events ?? 0} eventos</div>
              <div className="flex gap-2">
                <Link href={`/comunidades/gestionar/${community.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1')}><Pencil /> Gestionar</Link>
                {community.isActive !== false && <Link href={`/comunidades/${community.slug}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })} aria-label={`Ver ${community.name}`}><ExternalLink /></Link>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function CommunityManagementPage() {
  return <RequireAuth roles={['ADMIN', 'COMMUNITY_LEADER', 'TEACHER']}><CommunityManagementContent /></RequireAuth>;
}
