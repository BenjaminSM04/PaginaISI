'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import {
  Award, Bell, BookOpen, Calendar, CalendarCog, ChevronDown, FlaskConical, Grip, LogOut, Menu, MessageSquare,
  Moon, Rocket, Search, Shield, Sun, Trophy, User, Users, X, GraduationCap, Lightbulb, Newspaper, LayoutDashboard,
  Grid3X3,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { visibleApplicationsQueryKey } from '@/lib/application-query';
import type { InstitutionalApplication } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { ApplicationIcon } from '@/components/application-icon';
import { ApplicationLink } from '@/components/application-link';
import { InstitutionalLogo } from '@/components/institutional-logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useInstitutionalSettings } from '@/lib/use-institutional-settings';

const APPS = [
  { href: '/comunidades', label: 'Sociedad Científica', icon: FlaskConical, color: 'text-cyan-500' },
  { href: '/comunidades?vista=comunidades', label: 'Comunidades', icon: Users, color: 'text-emerald-500' },
  { href: '/proyectos', label: 'Proyectos', icon: Rocket, color: 'text-indigo-500' },
  { href: '/articulos', label: 'Artículos', icon: BookOpen, color: 'text-sky-500' },
  { href: '/eventos', label: 'Eventos', icon: Calendar, color: 'text-orange-500' },
  { href: '/foro', label: 'Foro Q&A', icon: MessageSquare, color: 'text-pink-500' },
  { href: '/ranking', label: 'Ranking', icon: Trophy, color: 'text-amber-500' },
  { href: '/incubadora', label: 'Incubadora', icon: Lightbulb, color: 'text-purple-500' },
  { href: '/mentorias', label: 'Mentorías', icon: GraduationCap, color: 'text-teal-500' },
  { href: '/noticias', label: 'Noticias', icon: Newspaper, color: 'text-red-400' },
];

const NAV_LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/proyectos', label: 'Proyectos' },
  { href: '/comunidades', label: 'Comunidades' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/foro', label: 'Foro' },
  { href: '/ranking', label: 'Ranking' },
];

const subscribeToHydration = () => () => undefined;

function useHydrated() {
  return useSyncExternalStore(subscribeToHydration, () => true, () => false);
}

function useRouteScopedBoolean(pathname: string) {
  const [state, setState] = useState({ pathname, value: false });
  const value = state.pathname === pathname ? state.value : false;
  const setValue = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setState((current) => {
      const currentValue = current.pathname === pathname ? current.value : false;
      return {
        pathname,
        value: typeof next === 'function' ? next(currentValue) : next,
      };
    });
  }, [pathname]);
  return [value, setValue] as const;
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, hasRole } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { settings: institution } = useInstitutionalSettings();
  const mounted = useHydrated();
  const [launcherOpen, setLauncherOpen] = useRouteScopedBoolean(pathname);
  const [userOpen, setUserOpen] = useRouteScopedBoolean(pathname);
  const [mobileOpen, setMobileOpen] = useRouteScopedBoolean(pathname);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLElement>(null);
  const unreadNotifications = useQuery({
    queryKey: ['notifications', 'unread-count', user?.id],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 20_000,
    retry: false,
  });
  const institutionalApplications = useQuery({
    queryKey: visibleApplicationsQueryKey(user?.roles),
    queryFn: () => api.get<InstitutionalApplication[]>('/applications'),
    staleTime: 60_000,
    retry: false,
  });
  const launcherApplications = (institutionalApplications.data ?? []).slice(0, 6);
  const canManageAcademicSpaces = hasRole('ADMIN', 'COMMUNITY_LEADER', 'TEACHER');
  const roleLabel = user?.roles?.includes('ADMIN')
    ? 'Administrador'
    : user?.roles?.includes('TEACHER')
      ? 'Docente'
      : user?.roles?.includes('COMMUNITY_LEADER')
        ? 'Líder de comunidad'
        : 'Estudiante';

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setLauncherOpen(false);
        setUserOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLauncherOpen(false);
        setUserOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [setLauncherOpen, setMobileOpen, setUserOpen]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setMobileOpen(false);
      router.push(`/buscar?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <header ref={ref} className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Launcher estilo M365 */}
          <div className="relative">
            <button
              type="button"
              aria-label="Abrir aplicaciones del portal"
              aria-expanded={launcherOpen}
              aria-controls="portal-app-launcher"
              onClick={() => {
                setLauncherOpen((v) => !v);
                setUserOpen(false);
              }}
              title="Aplicaciones del portal"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Grip aria-hidden="true" className="h-5 w-5" />
            </button>
            {launcherOpen && (
              <div id="portal-app-launcher" className="absolute left-0 top-11 z-50 max-h-[min(680px,calc(100vh-5rem))] w-[min(360px,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-border bg-popover p-3 shadow-2xl animate-fade-in">
                <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Portal {institution.shortName}</p>
                <div className="grid grid-cols-3 gap-1">
                  {APPS.map((app) => (
                    <Link
                      key={app.href}
                      href={app.href}
                      aria-current={pathname === app.href.split('?')[0] ? 'page' : undefined}
                      className="flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <app.icon className={cn('h-6 w-6', app.color)} />
                      <span className="text-[11px] font-medium leading-tight">{app.label}</span>
                    </Link>
                  ))}
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-3 px-1 pb-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Institucionales</p>
                    <Link
                      href="/aplicaciones"
                      onClick={() => setLauncherOpen(false)}
                      className="text-[11px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver todas
                    </Link>
                  </div>
                  {institutionalApplications.isLoading && (
                    <div role="status" aria-label="Cargando aplicaciones institucionales" className="grid grid-cols-3 gap-1">
                      {[0, 1, 2].map((item) => <span key={item} className="h-20 animate-pulse rounded-lg bg-secondary" />)}
                    </div>
                  )}
                  {institutionalApplications.isSuccess && launcherApplications.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      No hay enlaces disponibles para tu perfil.
                    </p>
                  )}
                  {launcherApplications.length > 0 && (
                    <div className="grid grid-cols-3 gap-1">
                      {launcherApplications.map((application) => (
                        <ApplicationLink
                          key={application.id}
                          url={application.url}
                          openInNewTab={application.openInNewTab}
                          onClick={() => setLauncherOpen(false)}
                          title={`Abrir ${application.name}${application.openInNewTab ? ' en una pestaña nueva' : ''}`}
                          className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg p-3 text-center transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ApplicationIcon icon={application.icon} className="h-6 w-6 text-primary" />
                          <span className="line-clamp-2 text-[11px] font-medium leading-tight">{application.name}</span>
                        </ApplicationLink>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <Link href="/" aria-label={`Ir al inicio de ${institution.institutionName}`} className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <InstitutionalLogo />
            <div className="hidden sm:block">
              <div className="font-serif-heading text-base font-bold leading-tight text-primary">{institution.shortName}</div>
              <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground" title={institution.careerName}>
                {institution.careerName.replace(/^Carrera\s+de\s+/i, '')}
              </div>
            </div>
          </Link>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={(link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)) ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-secondary',
                (link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)) ? 'text-primary font-bold' : 'text-foreground/70',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <form onSubmit={submitSearch} className="hidden md:block">
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent" />
              <label htmlFor="desktop-portal-search" className="sr-only">Buscar en el portal</label>
              <input
                id="desktop-portal-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en el portal…"
                className="h-9 w-44 rounded-lg border border-border bg-secondary/50 pl-8 pr-3 text-xs focus:w-56 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
          </form>

          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={mounted && resolvedTheme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
            title={mounted && resolvedTheme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/50 text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mounted && resolvedTheme === 'dark' ? <Sun className="h-4 w-4 text-gold" /> : <Moon className="h-4 w-4 text-primary" />}
          </button>

          {user && (
            <Link
              href="/notificaciones"
              aria-label={`${unreadNotifications.data?.count ?? 0} notificaciones no leídas`}
              title="Notificaciones"
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/50 text-foreground transition hover:bg-secondary',
                pathname.startsWith('/notificaciones') && 'border-primary/30 bg-primary/10 text-primary',
              )}
            >
              <Bell className="h-4 w-4" />
              {(unreadNotifications.data?.count ?? 0) > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-accent px-1 text-[9px] font-extrabold leading-none text-accent-foreground">
                  {(unreadNotifications.data?.count ?? 0) > 99 ? '99+' : unreadNotifications.data?.count}
                </span>
              )}
            </Link>
          )}

          {user ? (
            <div className="relative">
              <button
                type="button"
                aria-label={`Abrir menú de ${user.profile?.fullName ?? user.username}`}
                aria-expanded={userOpen}
                aria-controls="portal-user-menu"
                onClick={() => {
                  setUserOpen((v) => !v);
                  setLauncherOpen(false);
                }}
                className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 py-1 pl-1 pr-2 transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar src={user.profile?.avatarUrl} name={user.profile?.fullName} className="h-7 w-7" />
                <div className="hidden text-left sm:block">
                  <div className="text-xs font-bold leading-tight">{user.profile?.fullName?.split(' ')[0]}</div>
                  <div className="text-[10px] font-bold text-gold">{user.profile?.totalPoints ?? 0} pts</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {userOpen && (
                <div id="portal-user-menu" className="absolute right-0 top-12 z-50 max-h-[calc(100vh-5rem)] w-72 overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-2xl animate-fade-in">
                  <div className="border-b border-border p-3">
                    <div className="text-sm font-bold">{user.profile?.fullName}</div>
                    <div className="text-xs text-muted-foreground">@{user.username}</div>
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs">
                      <span className="font-semibold text-primary">{roleLabel}</span>
                      <span className="font-bold text-gold">{user.profile?.totalPoints ?? 0} pts</span>
                    </div>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <Link href={`/perfil/${user.username}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary transition">
                      <User className="h-4 w-4 text-primary" /> Mi perfil público
                    </Link>
                    <Link href="/cuenta" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary transition">
                      <Award className="h-4 w-4 text-accent" /> Mi cuenta y publicaciones
                    </Link>
                    <Link href="/notificaciones" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary transition">
                      <Bell className="h-4 w-4 text-orange-500" /> Notificaciones
                    </Link>
                    <Link href="/incubadora/mis-ideas" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary transition">
                      <Lightbulb className="h-4 w-4 text-purple-500" /> Mis ideas
                    </Link>
                    {canManageAcademicSpaces && (
                      <div className="my-1 border-y border-border py-1">
                        <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gestión académica</p>
                        <Link href="/comunidades/gestionar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-secondary">
                          <Users className="h-4 w-4 text-success" /> Gestionar comunidades
                        </Link>
                        <Link href="/eventos/gestionar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-secondary">
                          <CalendarCog className="h-4 w-4 text-orange-500" /> Gestionar eventos
                        </Link>
                        <Link href="/mentorias/gestionar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-secondary">
                          <GraduationCap className="h-4 w-4 text-teal-500" /> Gestionar mentorías
                        </Link>
                      </div>
                    )}
                    {hasRole('TEACHER', 'ADMIN') && (
                      <>
                        <Link href="/revision" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary transition">
                          <Shield className="h-4 w-4 text-success" /> Revisión de contenidos
                        </Link>
                        <Link href="/incubadora/revision" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary transition">
                          <Lightbulb className="h-4 w-4 text-purple-500" /> Revisión de ideas
                        </Link>
                      </>
                    )}
                    {hasRole('ADMIN') && (
                      <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary transition">
                        <LayoutDashboard className="h-4 w-4 text-orange-500" /> Panel de administración
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <LogOut className="h-4 w-4" /> Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Entrar</Link>
              <Link href="/registro" className={buttonVariants({ variant: 'accent', size: 'sm' })}>Crear cuenta</Link>
            </div>
          )}

          <button
            type="button"
            aria-label={mobileOpen ? 'Cerrar navegación' : 'Abrir navegación'}
            aria-expanded={mobileOpen}
            aria-controls="portal-mobile-navigation"
            onClick={() => {
              setMobileOpen((v) => !v);
              setLauncherOpen(false);
              setUserOpen(false);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div id="portal-mobile-navigation" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-border bg-card px-4 py-3 lg:hidden animate-fade-in">
          <form onSubmit={submitSearch} className="mb-3 md:hidden">
            <label htmlFor="mobile-portal-search" className="sr-only">Buscar en el portal</label>
            <input
              id="mobile-portal-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en el portal…"
              className="h-9 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </form>
          <div className="grid grid-cols-2 gap-1">
            {APPS.map((app) => (
              <Link key={app.href} href={app.href} aria-current={pathname === app.href.split('?')[0] ? 'page' : undefined} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary">
                <app.icon className={cn('h-4 w-4', app.color)} /> {app.label}
              </Link>
            ))}
            <Link
              href="/aplicaciones"
              aria-current={pathname.startsWith('/aplicaciones') ? 'page' : undefined}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
            >
              <Grid3X3 className="h-4 w-4 text-primary" /> Aplicaciones
            </Link>
          </div>
          {launcherApplications.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Enlaces institucionales</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {launcherApplications.map((application) => (
                  <ApplicationLink
                    key={application.id}
                    url={application.url}
                    openInNewTab={application.openInNewTab}
                    onClick={() => setMobileOpen(false)}
                    className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ApplicationIcon icon={application.icon} className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{application.name}</span>
                  </ApplicationLink>
                ))}
              </div>
            </div>
          )}
          {user && canManageAcademicSpaces && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gestión académica</p>
              <div className="grid gap-1 sm:grid-cols-3">
                <Link href="/comunidades/gestionar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><Users className="h-4 w-4 text-success" /> Comunidades</Link>
                <Link href="/eventos/gestionar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><CalendarCog className="h-4 w-4 text-orange-500" /> Eventos</Link>
                <Link href="/mentorias/gestionar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><GraduationCap className="h-4 w-4 text-teal-500" /> Mentorías</Link>
              </div>
            </div>
          )}
          {!user && (
            <div className="mt-3 flex gap-2 border-t border-border pt-3">
              <Link href="/login" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1')}>Entrar</Link>
              <Link href="/registro" className={cn(buttonVariants({ variant: 'accent', size: 'sm' }), 'flex-1')}>Crear cuenta</Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
