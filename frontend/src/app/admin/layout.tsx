'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Coins, FileClock, Flag, LayoutDashboard, Newspaper, Users } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/usuarios', label: 'Usuarios y roles', icon: Users },
  { href: '/admin/noticias', label: 'Noticias', icon: Newspaper },
  { href: '/admin/auditoria', label: 'Auditoría de proyectos', icon: FileClock },
  { href: '/admin/reportes', label: 'Reportes', icon: Flag },
  { href: '/admin/gamificacion', label: 'Puntos e insignias', icon: Coins },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth roles={['ADMIN']}>
      <div className="container grid gap-8 py-10 lg:grid-cols-5">
        <aside className="lg:col-span-1">
          <div className="sticky top-24 space-y-1 rounded-xl border border-border bg-card p-2 shadow-sm">
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Administración</p>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  pathname === l.href ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                )}
              >
                <l.icon className="h-4 w-4" /> {l.label}
              </Link>
            ))}
            <Link href="/revision" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary">
              → Revisión de contenidos
            </Link>
          </div>
        </aside>
        <div className="lg:col-span-4">{children}</div>
      </div>
    </RequireAuth>
  );
}
