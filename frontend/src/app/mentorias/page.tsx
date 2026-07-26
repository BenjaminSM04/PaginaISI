'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Mentorship, Paged } from '@/lib/types';
import { MentorshipCard } from '@/components/cards';
import { EmptyState, SectionHeader } from '@/components/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type MentorshipPage = Paged<Mentorship> & { myEnrollments: string[] };

export default function MentoriasPage() {
  const { hasRole, loading: authLoading } = useAuth();
  const canManage = hasRole('ADMIN', 'TEACHER', 'COMMUNITY_LEADER');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [modality, setModality] = useState('');
  const [when, setWhen] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const query = useQuery({
    queryKey: ['mentorships', 'public', debouncedSearch, difficulty, modality, when, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (difficulty) params.set('difficulty', difficulty);
      if (modality) params.set('modality', modality);
      if (when) params.set('when', when);
      return api.get<MentorshipPage>(`/mentorships?${params.toString()}`);
    },
    enabled: !authLoading,
    retry: false,
  });

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="container space-y-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader kicker="Aprende con la comunidad" title="Mentorías y cursos" />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Link href="/mentorias/gestionar" className={cn(buttonVariants({ variant: 'outline' }))}><Settings /> Gestionar</Link>
            <Link href="/mentorias/nueva" className={cn(buttonVariants({ variant: 'accent' }))}><Plus /> Nueva mentoría</Link>
          </div>
        )}
      </div>
      <div className="flex gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 p-4 text-sm">
        <GraduationCap className="h-5 w-5 shrink-0 text-teal-500" />
        <p>
          Docentes y comunidades comparten formación práctica en sesiones presenciales, virtuales o híbridas.
          Los enlaces privados aparecen después de confirmar la inscripción.
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(150px,0.35fr))]">
        <div className="relative">
          <label htmlFor="mentorship-search" className="sr-only">Buscar mentorías</label>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="mentorship-search" type="search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, área o docente…" />
        </div>
        <Select aria-label="Filtrar por nivel" value={difficulty} onChange={(event) => updateFilter(setDifficulty, event.target.value)}>
          <option value="">Todos los niveles</option>
          <option value="BASICO">Básico</option>
          <option value="INTERMEDIO">Intermedio</option>
          <option value="AVANZADO">Avanzado</option>
        </Select>
        <Select aria-label="Filtrar por modalidad" value={modality} onChange={(event) => updateFilter(setModality, event.target.value)}>
          <option value="">Todas las modalidades</option>
          <option value="IN_PERSON">Presencial</option>
          <option value="ONLINE">En línea</option>
          <option value="HYBRID">Híbrida</option>
        </Select>
        <Select aria-label="Filtrar por fecha" value={when} onChange={(event) => updateFilter(setWhen, event.target.value)}>
          <option value="current">En curso</option>
          <option value="upcoming">Próximas</option>
          <option value="past">Finalizadas</option>
          <option value="">Todas</option>
        </Select>
      </div>

      {authLoading || query.isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Cargando mentorías">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[420px] animate-pulse rounded-xl border border-border bg-secondary/50" />)}
        </div>
      ) : query.isError ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">No pudimos cargar las mentorías.</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void query.refetch()}><RefreshCw /> Reintentar</Button>
            </div>
          </div>
        </div>
      ) : !query.data?.items.length ? (
        <EmptyState title="No hay mentorías que coincidan" subtitle="Ajusta los filtros o vuelve pronto." />
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{query.data.total} mentoría(s)</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.items.map((mentorship) => (
              <MentorshipCard key={mentorship.id} mentorship={mentorship} enrolled={query.data.myEnrollments?.includes(mentorship.id)} />
            ))}
          </div>
          {(query.data.pages ?? 1) > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Paginación de mentorías">
              <Button type="button" variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft /> Anterior</Button>
              <span className="text-sm font-semibold">Página {page} de {query.data.pages}</span>
              <Button type="button" variant="outline" disabled={page >= (query.data.pages ?? 1) || query.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente <ChevronRight /></Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
