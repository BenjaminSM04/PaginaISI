'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleHelp, Crown, Loader2, Medal, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { Badge as BadgeType, PointRule, RankingRow } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { BadgeIcon } from '@/components/badge-icon';
import { SectionHeader } from '@/components/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { badgeRuleExplanation } from '@/lib/badge-rules';

const CATEGORIES = [
  { id: 'general', label: 'General', color: 'text-primary' },
  { id: 'dev', label: 'Dev Points', color: 'text-accent' },
  { id: 'research', label: 'Research Points', color: 'text-purple-500' },
  { id: 'community', label: 'Community Points', color: 'text-emerald-500' },
];

export default function RankingPage() {
  const [category, setCategory] = useState('general');
  const [period, setPeriod] = useState<'all' | 'month'>('all');

  const rankingQuery = useQuery({
    queryKey: ['ranking', category, period],
    queryFn: () => api.get<RankingRow[]>(`/ranking?category=${category}&period=${period}&limit=30`),
    retry: false,
  });
  const { data: rows, isLoading, isError } = rankingQuery;
  const badgesQuery = useQuery({
    queryKey: ['badges'],
    queryFn: () => api.get<(BadgeType & { _count: { users: number } })[]>('/badges'),
    retry: false,
  });
  const badges = badgesQuery.data;
  const rulesQuery = useQuery({
    queryKey: ['point-rules-public'],
    queryFn: () => api.get<PointRule[]>('/points/rules'),
    retry: false,
  });

  const podium = (rows ?? []).slice(0, 3);
  const rest = (rows ?? []).slice(3);
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);

  return (
    <div className="container space-y-10 py-10">
      <div className="text-center">
        <span className="section-kicker">Gamificación académica</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary sm:text-4xl">Ranking estudiantil</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Cuadro de honor del sistema de gamificación del portal (no es el cuadro de honor académico oficial de la carrera).
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <div role="group" aria-label="Categoría del ranking" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-secondary/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                'shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                category === c.id ? 'border border-border bg-card shadow-sm ' + c.color : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Periodo del ranking" className="flex items-center gap-1 rounded-xl border border-border bg-secondary/60 p-1">
          {[
            { id: 'all' as const, label: 'Histórico' },
            { id: 'month' as const, label: 'Este mes' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                period === p.id ? 'border border-border bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <details className="group mx-auto max-w-3xl rounded-2xl border border-accent/30 bg-accent/5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-sm font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><CircleHelp className="h-5 w-5 text-accent" aria-hidden="true" /> ¿Cómo se ganan puntos?</span>
          <span className="text-xs font-semibold text-muted-foreground transition group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>
        <div className="border-t border-accent/20 px-5 py-4">
          <p className="mb-4 text-xs text-muted-foreground">
            Estas son las reglas activas configuradas por administración. Los valores se leen directamente del sistema.
          </p>
          {rulesQuery.isLoading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando reglas…</p>
          ) : rulesQuery.isError ? (
            <p role="alert" className="text-sm text-danger">No se pudieron consultar las reglas de puntuación.</p>
          ) : (rulesQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No hay reglas de puntuación activas.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {rulesQuery.data?.map((rule) => (
                <li key={rule.reason} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                  <span className="flex min-w-0 items-start gap-2 text-sm">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span>
                      <span className="block font-semibold">{rule.label}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{rule.category}</span>
                    </span>
                  </span>
                  <span className={cn('shrink-0 text-sm font-extrabold', rule.points >= 0 ? 'text-success' : 'text-danger')}>
                    {rule.points >= 0 ? '+' : ''}{rule.points} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {isLoading ? (
        <div role="status" className="flex justify-center py-16"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">Cargando ranking</span></div>
      ) : isError ? (
        <div role="alert" className="mx-auto max-w-3xl rounded-xl border border-danger/30 bg-danger/10 p-5 text-sm text-danger">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">No pudimos cargar el ranking.</p>
              <p className="mt-1">Comprueba la conexión con el servidor y vuelve a intentarlo.</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void rankingQuery.refetch()}><RefreshCw aria-hidden="true" /> Reintentar</Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Podio */}
          <div className="mx-auto grid max-w-3xl items-end gap-4 sm:grid-cols-3">
            {podiumOrder.map((r) => {
              const isFirst = r.position === 1;
              return (
                <Link
                  key={r.userId}
                  href={`/perfil/${r.username}`}
                  className={cn(
                    'group relative flex flex-col items-center rounded-2xl border bg-card p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg',
                    isFirst ? 'border-gold/60 sm:scale-105 sm:pb-10' : r.position === 2 ? 'border-slate-400/50' : 'border-warning/50',
                  )}
                >
                  <span className="absolute right-3 top-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                    RANK_{String(r.position).padStart(2, '0')}
                  </span>
                  {isFirst ? (
                    <Crown className="mb-2 h-6 w-6 text-gold" />
                  ) : (
                    <Medal className={cn('mb-2 h-5 w-5', r.position === 2 ? 'text-slate-400' : 'text-warning')} />
                  )}
                  <Avatar src={r.avatarUrl} name={r.fullName} className={cn('mb-3', isFirst ? 'h-20 w-20 text-xl' : 'h-16 w-16 text-lg')} />
                  <div className="font-serif-heading text-lg font-bold transition group-hover:text-primary">{r.fullName}</div>
                  <div className="text-xs text-muted-foreground">@{r.username}{r.semester ? ` · ${r.semester}º sem.` : ''}</div>
                  <div className={cn('mt-3 font-serif-heading text-3xl font-bold', isFirst ? 'text-gold' : 'text-primary')}>{r.points}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">puntos</div>
                </Link>
              );
            })}
            {podium.length === 0 && <p className="col-span-3 text-center text-sm text-muted-foreground">Sin datos para este periodo todavía.</p>}
          </div>

          {/* Tabla */}
          {rest.length > 0 && (
            <div className="mx-auto max-w-3xl space-y-2">
              {rest.map((r) => (
                <Link
                  key={r.userId}
                  href={`/perfil/${r.username}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm transition hover:border-primary/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-extrabold text-muted-foreground">
                      {r.position}
                    </span>
                    <Avatar src={r.avatarUrl} name={r.fullName} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{r.fullName}</div>
                      <div className="truncate text-[11px] text-muted-foreground">@{r.username} · {r.badgesCount} insignias</div>
                    </div>
                  </div>
                  <div className="text-right font-bold text-primary">{r.points} pts</div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Insignias */}
      <section className="space-y-5">
        <SectionHeader kicker="Colecciónalas todas" title="Insignias del portal" />
        {badgesQuery.isLoading && <div role="status" className="flex justify-center py-10"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" /><span className="sr-only">Cargando insignias</span></div>}
        {badgesQuery.isError && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            No se pudo cargar el catálogo de insignias. <button type="button" className="font-bold underline" onClick={() => void badgesQuery.refetch()}>Reintentar</button>
          </p>
        )}
        {badgesQuery.isSuccess && (badges?.length ?? 0) === 0 && (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">Aún no hay insignias publicadas.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(badges ?? []).map((b) => (
            <div key={b.id} className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
              <div
                className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full border"
                style={{ backgroundColor: 'color-mix(in srgb, ' + (b.color ?? 'hsl(var(--primary))') + ' 13%, transparent)', borderColor: 'color-mix(in srgb, ' + (b.color ?? 'hsl(var(--primary))') + ' 33%, transparent)', color: b.color ?? 'hsl(var(--primary))' }}
              >
                <BadgeIcon icon={b.icon} label={b.name} />
              </div>
              <div className="text-sm font-bold">{b.name}</div>
              <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{b.description}</div>
              <div className="mt-2 rounded-lg bg-secondary/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {badgeRuleExplanation(b)}
              </div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-accent">{b._count?.users ?? 0} otorgadas</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
