'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, GraduationCap, Loader2, Plus, RefreshCw, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Mentorship } from '@/lib/types';
import { MentorshipCard } from '@/components/cards';
import { EmptyState, SectionHeader } from '@/components/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function MentoriasPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('ADMIN', 'TEACHER', 'COMMUNITY_LEADER');
  const query = useQuery({
    queryKey: ['mentorships'],
    queryFn: () => api.get<{ items: Mentorship[]; myEnrollments: string[] }>('/mentorships'),
    retry: false,
  });
  const { data, isLoading, isError } = query;

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader kicker="Aprende con la comunidad" title="Mentorías y cursos" />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Link href="/mentorias/gestionar" className={cn(buttonVariants({ variant: 'outline' }))}>
              <Settings /> Gestionar
            </Link>
            <Link href="/mentorias/nueva" className={cn(buttonVariants({ variant: 'accent' }))}>
              <Plus /> Nueva mentoría
            </Link>
          </div>
        )}
      </div>
      <div className="flex gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 p-4 text-sm">
        <GraduationCap className="h-5 w-5 shrink-0 text-teal-500" />
        <p>
          Estudiantes seniors y docentes comparten lo que saben: nivelación, certificaciones y especialización.
          Los cupos son limitados; al inscribirte recibirás el enlace del canal (Teams/WhatsApp) de la mentoría.
          <span className="mt-1 block text-xs text-muted-foreground">Cuando existan grabaciones, encontrarás el acceso a YouTube dentro de la mentoría.</span>
        </p>
      </div>

      {isLoading ? (
        <div role="status" className="flex justify-center py-16"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">Cargando mentorías</span></div>
      ) : isError ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">No pudimos cargar las mentorías.</p>
              <p className="mt-1">Comprueba la conexión con el servidor y vuelve a intentarlo.</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void query.refetch()}><RefreshCw aria-hidden="true" /> Reintentar</Button>
            </div>
          </div>
        </div>
      ) : (data?.items?.length ?? 0) === 0 ? (
        <EmptyState title="No hay mentorías activas" subtitle="Vuelve pronto o propón una en tu comunidad." />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data!.items.map((m) => (
            <MentorshipCard key={m.id} mentorship={m} enrolled={data!.myEnrollments?.includes(m.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
