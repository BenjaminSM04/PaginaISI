'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, Loader2, MessageSquare, Newspaper, RefreshCw, Rocket, Search, Users, User, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';

interface SearchResults {
  projects: { slug: string; title: string; summary?: string }[];
  articles: { slug: string; title: string; area?: string }[];
  news: { slug: string; title: string }[];
  questions: { id: string; title: string; votesScore: number; answersCount: number }[];
  communities: { slug: string; name: string; description?: string }[];
  users: {
    username: string;
    profile?: { fullName?: string; avatarUrl?: string | null; totalPoints?: number } | null;
  }[];
}

function ResultGroup({ title, icon: Icon, children, count }: { title: string; icon: LucideIcon; children: ReactNode; count: number }) {
  if (!count) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" /> {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ href, title, subtitle }: { href: string; title: string; subtitle?: string }) {
  return (
    <Link href={href} className="block rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm transition hover:border-primary/40">
      <div className="text-sm font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground line-clamp-1">{subtitle}</div>}
    </Link>
  );
}

function BuscarContent() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get('q') ?? '';
  const [input, setInput] = useState(initial);
  const q = params.get('q') ?? '';

  const searchQuery = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    retry: false,
  });
  const { data, isFetching, isError } = searchQuery;

  const total = data
    ? (data.projects?.length ?? 0) + (data.articles?.length ?? 0) + (data.news?.length ?? 0) +
      (data.questions?.length ?? 0) + (data.communities?.length ?? 0) + (data.users?.length ?? 0)
    : 0;

  return (
    <div className="container max-w-3xl space-y-8 py-10">
      <div>
        <span className="section-kicker">Buscador global</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Buscar en el portal</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/buscar?q=${encodeURIComponent(input.trim())}`);
        }}
        className="relative"
      >
        <Search aria-hidden="true" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-accent" />
        <label htmlFor="global-search-input" className="sr-only">Buscar proyectos, artículos, preguntas o personas</label>
        <input
          id="global-search-input"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Proyectos, artículos, preguntas, personas…"
          aria-describedby="global-search-help"
          className="h-14 w-full rounded-2xl border border-border bg-card pl-12 pr-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <span id="global-search-help" className="sr-only">Escribe al menos dos caracteres y presiona Enter.</span>
      </form>

      {isFetching && (
        <div role="status" className="flex justify-center py-10">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
          <span className="sr-only">Buscando en el portal</span>
        </div>
      )}

      {!isFetching && isError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">No pudimos completar la búsqueda.</p>
              <p className="mt-1">Comprueba la conexión con el servidor e inténtalo nuevamente.</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void searchQuery.refetch()}>
                <RefreshCw aria-hidden="true" /> Reintentar
              </Button>
            </div>
          </div>
        </div>
      )}

      {!q && <EmptyState title="¿Qué quieres encontrar?" subtitle="Busca proyectos, artículos, preguntas, comunidades o personas desde un solo lugar." />}

      {!isFetching && q.length > 0 && q.trim().length < 2 && (
        <EmptyState title="Escribe al menos 2 caracteres" subtitle="Así podremos ofrecerte resultados relevantes." />
      )}

      {!isFetching && !isError && q.trim().length >= 2 && total === 0 && (
        <EmptyState title={`Sin resultados para "${q}"`} subtitle="Prueba con otros términos o revisa la ortografía." />
      )}

      {!isFetching && !isError && data && total > 0 && (
        <div className="space-y-8">
          <ResultGroup title="Proyectos" icon={Rocket} count={data.projects?.length}>
            {data.projects.map((p) => <Row key={p.slug} href={`/proyectos/${p.slug}`} title={p.title} subtitle={p.summary} />)}
          </ResultGroup>
          <ResultGroup title="Artículos" icon={BookOpen} count={data.articles?.length}>
            {data.articles.map((a) => <Row key={a.slug} href={`/articulos/${a.slug}`} title={a.title} subtitle={a.area} />)}
          </ResultGroup>
          <ResultGroup title="Noticias" icon={Newspaper} count={data.news?.length}>
            {data.news.map((n) => <Row key={n.slug} href={`/noticias/${n.slug}`} title={n.title} />)}
          </ResultGroup>
          <ResultGroup title="Foro" icon={MessageSquare} count={data.questions?.length}>
            {data.questions.map((qq) => (
              <Row key={qq.id} href={`/foro/${qq.id}`} title={qq.title} subtitle={`${qq.votesScore} votos · ${qq.answersCount} respuestas`} />
            ))}
          </ResultGroup>
          <ResultGroup title="Comunidades" icon={Users} count={data.communities?.length}>
            {data.communities.map((c) => <Row key={c.slug} href={`/comunidades/${c.slug}`} title={c.name} subtitle={c.description} />)}
          </ResultGroup>
          {(data.users?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <User className="h-4 w-4 text-accent" /> Personas
              </h2>
              <div className="space-y-1.5">
                {data.users.map((u) => (
                  <Link key={u.username} href={`/perfil/${u.username}`} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm transition hover:border-primary/40">
                    <Avatar src={u.profile?.avatarUrl} name={u.profile?.fullName} className="h-8 w-8" />
                    <div>
                      <div className="text-sm font-semibold">{u.profile?.fullName}</div>
                      <div className="text-xs text-muted-foreground">@{u.username} · {u.profile?.totalPoints ?? 0} pts</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function BuscarPage() {
  return (
    <Suspense fallback={<div role="status" className="flex justify-center py-20"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">Preparando el buscador</span></div>}>
      <BuscarContent />
    </Suspense>
  );
}
