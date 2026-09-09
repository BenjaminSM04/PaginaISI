'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FileClock, FileText, Flag, Loader2, MessageSquare, Newspaper, Rocket, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => api.get<any>('/admin/dashboard') });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const c = data?.counts ?? {};
  const cards = [
    { label: 'Usuarios', value: c.users, icon: Users, href: '/admin/usuarios', color: 'text-primary' },
    { label: 'Proyectos aprobados', value: c.projects, icon: Rocket, href: '/proyectos', color: 'text-indigo-500' },
    { label: 'Artículos aprobados', value: c.articles, icon: FileText, href: '/articulos', color: 'text-sky-500' },
    { label: 'Preguntas en el foro', value: c.questions, icon: MessageSquare, href: '/foro', color: 'text-pink-500' },
    { label: 'Eventos', value: c.events, icon: Newspaper, href: '/eventos', color: 'text-orange-500' },
    { label: 'Comunidades', value: c.communities, icon: Users, href: '/comunidades?vista=comunidades', color: 'text-success' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Estado general del portal.</p>
      </div>

      {/* Pendientes */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/revision" className="rounded-xl border border-warning/40 bg-warning/10 p-5 transition hover:border-warning">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-warning">Proyectos pendientes</span>
            <AlertCircle className="h-4 w-4 text-warning" />
          </div>
          <div className="mt-1 font-serif-heading text-3xl font-bold">{c.pendingProjects ?? 0}</div>
        </Link>
        <Link href="/revision" className="rounded-xl border border-warning/40 bg-warning/10 p-5 transition hover:border-warning">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-warning">Artículos pendientes</span>
            <AlertCircle className="h-4 w-4 text-warning" />
          </div>
          <div className="mt-1 font-serif-heading text-3xl font-bold">{c.pendingArticles ?? 0}</div>
        </Link>
        <Link href="/admin/reportes" className="rounded-xl border border-danger/40 bg-danger/10 p-5 transition hover:border-danger">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-danger">Reportes sin resolver</span>
            <Flag className="h-4 w-4 text-danger" />
          </div>
          <div className="mt-1 font-serif-heading text-3xl font-bold">{c.pendingReports ?? 0}</div>
        </Link>
      </div>

      <Link href="/admin/auditoria" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-5 transition hover:border-orange-500">
        <div className="flex items-center gap-3">
          <FileClock className="h-6 w-6 text-orange-500" />
          <div><div className="font-bold text-primary">Auditoría de proyectos</div><p className="text-xs text-muted-foreground">Revisa ediciones, correos, IP, señales de riesgo y rollbacks.</p></div>
        </div>
        <span className="text-sm font-semibold text-primary">Abrir registro →</span>
      </Link>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40">
            <card.icon className={cn('h-5 w-5', card.color)} />
            <div className="mt-2 font-serif-heading text-2xl font-bold">{card.value ?? 0}</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</div>
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-serif-heading text-lg font-bold text-primary">Últimas transacciones de puntos</h2>
        <div className="overflow-hidden rounded-xl border border-border">
          {(data?.recentTransactions ?? []).map((t: any, i: number) => (
            <div key={t.id} className={cn('flex items-center justify-between px-4 py-2.5 text-sm', i % 2 === 0 ? 'bg-card' : 'bg-secondary/40')}>
              <div>
                <span className="font-semibold">{t.user?.profile?.fullName}</span>
                <span className="text-muted-foreground"> · {t.reason} · {formatDate(t.createdAt, true)}</span>
              </div>
              <span className={cn('font-bold', t.points >= 0 ? 'text-success' : 'text-danger')}>
                {t.points >= 0 ? '+' : ''}{t.points}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
