'use client';

import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Check,
  Coins,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldOff,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DEFAULT_THEME } from '@/lib/theme';
import type { Badge as BadgeType, BadgeRuleType, Paged, PointRule } from '@/lib/types';
import { BADGE_RULE_OPTIONS, badgeRuleExplanation, badgeRuleLabel } from '@/lib/badge-rules';
import { BADGE_ICON_OPTIONS, BadgeIcon, isGeneratedBadgeIcon } from '@/components/badge-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { cn, formatDate } from '@/lib/utils';

type GamificationTab = 'badges' | 'points';

interface AdminBadge extends BadgeType {
  _count?: { users: number };
}

interface BadgeDraft {
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  ruleType: BadgeRuleType | '';
  targetValue: string;
  isActive: boolean;
  isRetroactive: boolean;
}

interface BadgeEvaluation {
  badgeId: string;
  evaluatedUsers: number;
  awarded: number;
}

const EMPTY_BADGE: BadgeDraft = {
  code: '',
  name: '',
  description: '',
  icon: 'award',
  color: DEFAULT_THEME.light.primary,
  ruleType: '',
  targetValue: '',
  isActive: true,
  isRetroactive: false,
};
const MAX_BADGE_SOURCE_SIZE = 512 * 1024;
const PAGE_SIZE = 12;

const GAMIFICATION_TABS = [
  { id: 'badges' as const, label: 'Insignias', icon: Award, panelId: 'gamification-panel-badges' },
  { id: 'points' as const, label: 'Puntos', icon: Coins, panelId: 'gamification-panel-points' },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminGamificacionPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<GamificationTab>('badges');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [grantUser, setGrantUser] = useState('');
  const [grantBadge, setGrantBadge] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [badgeDraft, setBadgeDraft] = useState<BadgeDraft>(EMPTY_BADGE);
  const [editingBadge, setEditingBadge] = useState<AdminBadge | null>(null);
  const [showBadgeEditor, setShowBadgeEditor] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const rulesQuery = useQuery({
    queryKey: ['point-rules'],
    queryFn: () => api.get<PointRule[]>('/points/rules'),
    retry: false,
  });
  const badgesQuery = useQuery({
    queryKey: ['admin-badges', search, page],
    queryFn: () => api.get<Paged<AdminBadge>>(
      `/admin/badges?page=${page}&limit=${PAGE_SIZE}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    ),
    retry: false,
  });
  const grantBadgesQuery = useQuery({
    queryKey: ['badges'],
    queryFn: () => api.get<AdminBadge[]>('/badges'),
    retry: false,
  });

  const showSuccess = (text: string) => {
    setError(null);
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3_500);
  };

  const invalidateBadges = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] }),
      queryClient.invalidateQueries({ queryKey: ['badges'] }),
    ]);
  };

  const updateRule = useMutation({
    mutationFn: ({ reason, points }: { reason: string; points: number }) =>
      api.patch(`/admin/points/rules/${reason}`, { points }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['point-rules'] });
      showSuccess('Regla de puntos actualizada.');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo actualizar la regla.')),
  });

  const grant = useMutation({
    mutationFn: () => api.post<{ granted: boolean; already: boolean }>(
      `/admin/badges/${encodeURIComponent(grantBadge)}/grant/${encodeURIComponent(grantUser.trim())}`,
    ),
    onSuccess: async (result) => {
      await invalidateBadges();
      showSuccess(result.already
        ? `@${grantUser.trim()} ya tenía esta insignia; no se creó un duplicado.`
        : `Insignia otorgada a @${grantUser.trim()}.`);
      setGrantUser('');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo otorgar la insignia.')),
  });

  const saveBadge = useMutation({
    mutationFn: async (draft: BadgeDraft) => {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        icon: draft.icon,
        color: draft.color,
        ruleType: draft.ruleType || null,
        targetValue: draft.ruleType ? Number(draft.targetValue) : null,
        isActive: draft.isActive,
        isRetroactive: draft.ruleType ? draft.isRetroactive : false,
      };
      if (editingBadge) {
        return api.patch<AdminBadge & { retroactiveEvaluation?: BadgeEvaluation }>(
          `/admin/badges/${editingBadge.id}`,
          payload,
        );
      }
      return api.post<AdminBadge & { retroactiveEvaluation?: BadgeEvaluation }>('/admin/badges', {
        code: draft.code,
        ...payload,
      });
    },
    onSuccess: async (saved) => {
      await invalidateBadges();
      setGrantBadge(saved.code);
      setBadgeDraft(EMPTY_BADGE);
      setEditingBadge(null);
      setShowBadgeEditor(false);
      const evaluated = saved.retroactiveEvaluation;
      showSuccess(evaluated
        ? `Insignia guardada. Se evaluaron ${evaluated.evaluatedUsers} usuarios y se otorgaron ${evaluated.awarded} insignias.`
        : 'Insignia guardada.');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo guardar la insignia.')),
  });

  const convertIcon = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<{ icon: string; sourceWidth: number; sourceHeight: number }>(
        '/admin/badges/convert-icon',
        form,
      );
    },
    onSuccess: ({ icon }) => {
      setBadgeDraft((current) => ({ ...current, icon }));
      showSuccess('Imagen convertida a un SVG seguro.');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo convertir la imagen.')),
  });

  const evaluateBadge = useMutation({
    mutationFn: (badge: AdminBadge) => api.post<BadgeEvaluation>(`/admin/badges/${badge.id}/evaluate`),
    onSuccess: async (result) => {
      await invalidateBadges();
      showSuccess(`Reevaluación terminada: ${result.evaluatedUsers} usuarios revisados y ${result.awarded} nuevas asignaciones.`);
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo reevaluar la insignia.')),
  });

  const deactivateBadge = useMutation({
    mutationFn: (badge: AdminBadge) => api.patch<AdminBadge>(`/admin/badges/${badge.id}`, { isActive: false }),
    onSuccess: async () => {
      await invalidateBadges();
      showSuccess('Insignia desactivada. Las asignaciones históricas se conservaron.');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo desactivar la insignia.')),
  });

  const deleteBadge = useMutation({
    mutationFn: (badge: AdminBadge) => api.delete<{ deleted: true }>(`/admin/badges/${badge.id}`),
    onSuccess: async () => {
      await invalidateBadges();
      showSuccess('Insignia eliminada.');
    },
    onError: (mutationError: unknown) => setError(errorMessage(mutationError, 'No se pudo eliminar la insignia.')),
  });

  function openNewBadge() {
    setBadgeDraft(EMPTY_BADGE);
    setEditingBadge(null);
    setShowBadgeEditor(true);
    setError(null);
  }

  function openBadge(badge: AdminBadge) {
    setBadgeDraft({
      code: badge.code,
      name: badge.name,
      description: badge.description,
      icon: badge.icon || 'award',
      color: badge.color || DEFAULT_THEME.light.primary,
      ruleType: badge.ruleType || '',
      targetValue: badge.targetValue ? String(badge.targetValue) : '',
      isActive: badge.isActive ?? true,
      isRetroactive: badge.isRetroactive ?? false,
    });
    setEditingBadge(badge);
    setShowBadgeEditor(true);
    setError(null);
  }

  function uploadBadgeRaster(file?: File) {
    setError(null);
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Selecciona una imagen PNG, JPEG o WebP.');
      return;
    }
    if (file.size > MAX_BADGE_SOURCE_SIZE) {
      setError('La imagen para insignia no puede superar 512 KB.');
      return;
    }
    convertIcon.mutate(file);
  }

  function submitBadge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (badgeDraft.ruleType && badgeDraft.isActive && badgeDraft.isRetroactive) {
      const ruleChanged = !editingBadge
        || editingBadge.ruleType !== badgeDraft.ruleType
        || editingBadge.targetValue !== Number(badgeDraft.targetValue)
        || !editingBadge.isRetroactive
        || !editingBadge.isActive;
      if (ruleChanged && !window.confirm(
        'Esta regla es retroactiva. Al guardarla se evaluará a todos los usuarios activos y podrían otorgarse insignias de inmediato. ¿Continuar?',
      )) return;
    }
    saveBadge.mutate(badgeDraft);
  }

  function requestEvaluation(badge: AdminBadge) {
    if (!window.confirm(
      `Se revisará la actividad de todos los usuarios activos para “${badge.name}”. La operación es idempotente y no duplicará asignaciones. ¿Continuar?`,
    )) return;
    evaluateBadge.mutate(badge);
  }

  function requestRemoval(badge: AdminBadge) {
    const awarded = badge._count?.users ?? 0;
    if (awarded > 0) {
      if (window.confirm(
        `“${badge.name}” ya fue otorgada ${awarded} ${awarded === 1 ? 'vez' : 'veces'} y no se puede eliminar sin perder historial. ¿Desactivarla?`,
      )) deactivateBadge.mutate(badge);
      return;
    }
    if (window.confirm(`¿Eliminar definitivamente la insignia “${badge.name}”? Esta acción no se puede deshacer.`)) {
      deleteBadge.mutate(badge);
    }
  }

  const target = Number(badgeDraft.targetValue);
  const badgeCanSave = /^[A-Z0-9_]+$/.test(badgeDraft.code)
    && badgeDraft.code.length <= 40
    && badgeDraft.name.trim().length > 0
    && badgeDraft.name.trim().length <= 60
    && badgeDraft.description.trim().length > 0
    && badgeDraft.description.trim().length <= 200
    && (!badgeDraft.ruleType || (Number.isInteger(target) && target >= 1 && target <= 1_000_000));
  const badgeBusy = saveBadge.isPending || convertIcon.isPending;
  const badges = badgesQuery.data?.items ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Puntos e insignias</h1>
        <p className="text-sm text-muted-foreground">
          Configura reglas automáticas auditables, conserva asignaciones históricas y administra los valores reales de puntos.
        </p>
      </div>

      <div aria-live="polite" className="space-y-2">
        {message && (
          <p className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-secondary/20 p-3 sm:p-4">
          <SegmentedTabs
            items={GAMIFICATION_TABS}
            value={activeTab}
            onValueChange={setActiveTab}
            ariaLabel="Administración de gamificación"
            idPrefix="gamification"
          />
        </div>

        <section
          id="gamification-panel-badges"
          role="tabpanel"
          aria-labelledby="gamification-tab-badges"
          tabIndex={0}
          hidden={activeTab !== 'badges'}
          className="space-y-6 p-4 focus-visible:outline-none sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-serif-heading text-lg font-bold text-primary">
                <Award className="h-5 w-5" /> Catálogo y reglas
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Una insignia sin regla conserva el flujo manual; una insignia con regla se evalúa tras la actividad pertinente.
              </p>
            </div>
            <Button variant="outline" onClick={openNewBadge}><Plus /> Nueva insignia</Button>
          </div>

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchText.trim());
              setPage(1);
            }}
          >
            <Label htmlFor="badge-search" className="sr-only">Buscar insignias</Label>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="badge-search"
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                maxLength={100}
                placeholder="Buscar por código, nombre o descripción"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">Buscar</Button>
            {search && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setSearchText('');
                  setPage(1);
                }}
              >
                Limpiar
              </Button>
            )}
          </form>

          {badgesQuery.isLoading && (
            <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Cargando insignias…
            </div>
          )}
          {badgesQuery.isError && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              <p>No se pudo cargar el catálogo administrativo.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => void badgesQuery.refetch()}>
                <RefreshCw /> Reintentar
              </Button>
            </div>
          )}
          {badgesQuery.isSuccess && badges.length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              {search ? 'No hay insignias que coincidan con la búsqueda.' : 'Aún no hay insignias configuradas.'}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {badges.map((badge) => {
              const awarded = badge._count?.users ?? 0;
              const isActive = badge.isActive ?? true;
              return (
                <article key={badge.id} className={cn(
                  'rounded-xl border border-border bg-secondary/15 p-4',
                  !isActive && 'opacity-70',
                )}>
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${badge.color || 'hsl(var(--primary))'} 13%, transparent)`,
                        borderColor: `color-mix(in srgb, ${badge.color || 'hsl(var(--primary))'} 33%, transparent)`,
                        color: badge.color || 'hsl(var(--primary))',
                      }}
                    >
                      <BadgeIcon icon={badge.icon} label={badge.name} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">{badge.name}</h3>
                        <Badge variant={isActive ? 'success' : 'secondary'}>
                          {isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                        {badge.isRetroactive && <Badge variant="outline">Retroactiva</Badge>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {badge.code} · {awarded} {awarded === 1 ? 'asignación' : 'asignaciones'}
                        {badge.createdAt ? ` · creada ${formatDate(badge.createdAt)}` : ''}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{badge.description}</p>
                      <p className="mt-2 text-xs font-semibold">{badgeRuleLabel(badge.ruleType)}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {badgeRuleExplanation(badge)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                    {isActive && badge.ruleType && badge.targetValue && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={evaluateBadge.isPending}
                        onClick={() => requestEvaluation(badge)}
                      >
                        {evaluateBadge.isPending && evaluateBadge.variables?.id === badge.id
                          ? <Loader2 className="animate-spin" />
                          : <RefreshCw />}
                        Reevaluar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openBadge(badge)}>
                      <Pencil /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant={awarded > 0 ? 'outline' : 'destructive'}
                      disabled={deleteBadge.isPending || deactivateBadge.isPending || !isActive && awarded > 0}
                      onClick={() => requestRemoval(badge)}
                    >
                      {awarded > 0 ? <ShieldOff /> : <Trash2 />}
                      {awarded > 0 ? (isActive ? 'Desactivar' : 'Desactivada') : 'Eliminar'}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          {badgesQuery.isSuccess && (badgesQuery.data.pages ?? 1) > 1 && (
            <nav aria-label="Paginación de insignias" className="flex items-center justify-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {badgesQuery.data.page ?? page} de {badgesQuery.data.pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= (badgesQuery.data.pages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
              </Button>
            </nav>
          )}

          {showBadgeEditor && (
            <form onSubmit={submitBadge} className="space-y-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{editingBadge ? `Editar ${editingBadge.code}` : 'Crear insignia'}</h3>
                  <p className="text-xs text-muted-foreground">
                    El código identifica automatizaciones existentes y no cambia después de crear la insignia.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Cerrar editor"
                  onClick={() => setShowBadgeEditor(false)}
                >
                  <X />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="badge-code">Código</Label>
                  <Input
                    id="badge-code"
                    value={badgeDraft.code}
                    disabled={Boolean(editingBadge)}
                    maxLength={40}
                    required
                    placeholder="APORTE_DESTACADO"
                    onChange={(event) => setBadgeDraft((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                    }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="badge-name">Nombre</Label>
                  <Input
                    id="badge-name"
                    value={badgeDraft.name}
                    maxLength={60}
                    required
                    placeholder="Aporte destacado"
                    onChange={(event) => setBadgeDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="badge-color">Color</Label>
                  <input
                    id="badge-color"
                    type="color"
                    value={badgeDraft.color}
                    onChange={(event) => setBadgeDraft((current) => ({ ...current, color: event.target.value }))}
                    className="h-10 w-full min-w-20 cursor-pointer rounded-lg border border-input bg-card p-1"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="badge-description">Descripción</Label>
                <Textarea
                  id="badge-description"
                  value={badgeDraft.description}
                  maxLength={200}
                  rows={3}
                  required
                  placeholder="Describe el logro representado por esta insignia."
                  onChange={(event) => setBadgeDraft((current) => ({ ...current, description: event.target.value }))}
                />
                <p className="text-right text-[11px] text-muted-foreground">{badgeDraft.description.length}/200</p>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Icono SVG</legend>
                <div className="flex flex-wrap gap-2">
                  {BADGE_ICON_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      title={option.label}
                      aria-label={`Usar icono ${option.label}`}
                      aria-pressed={badgeDraft.icon === option.value}
                      onClick={() => setBadgeDraft((current) => ({ ...current, icon: option.value }))}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        badgeDraft.icon === option.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:text-primary',
                      )}
                    >
                      <BadgeIcon icon={option.value} className="h-4 w-4" />
                    </button>
                  ))}
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-card px-3 text-xs font-semibold text-primary hover:bg-secondary focus-within:ring-2 focus-within:ring-ring">
                    {convertIcon.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Convertir imagen
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={convertIcon.isPending}
                      onChange={(event) => {
                        uploadBadgeRaster(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  PNG, JPEG o WebP de hasta 512 KB. El servidor lo convierte a un SVG de gramática cerrada.
                </p>
              </fieldset>

              <div className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="badge-rule">Condición automática</Label>
                  <Select
                    id="badge-rule"
                    value={badgeDraft.ruleType}
                    onChange={(event) => setBadgeDraft((current) => ({
                      ...current,
                      ruleType: event.target.value as BadgeRuleType | '',
                      targetValue: event.target.value ? current.targetValue || '1' : '',
                      isRetroactive: event.target.value ? current.isRetroactive : false,
                    }))}
                  >
                    <option value="">Sin regla (asignación manual)</option>
                    {BADGE_RULE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="badge-target">Valor objetivo</Label>
                  <Input
                    id="badge-target"
                    type="number"
                    min={1}
                    max={1_000_000}
                    step={1}
                    required={Boolean(badgeDraft.ruleType)}
                    disabled={!badgeDraft.ruleType}
                    value={badgeDraft.targetValue}
                    onChange={(event) => setBadgeDraft((current) => ({ ...current, targetValue: event.target.value }))}
                  />
                </div>
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={badgeDraft.isActive}
                    onChange={(event) => setBadgeDraft((current) => ({ ...current, isActive: event.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>
                    <span className="block font-semibold">Insignia activa</span>
                    <span className="text-xs text-muted-foreground">
                      Se muestra en el catálogo y, si tiene regla, puede otorgarse automáticamente.
                    </span>
                  </span>
                </label>
                <label className={cn(
                  'flex items-start gap-3 rounded-lg border border-border p-3 text-sm',
                  !badgeDraft.ruleType && 'opacity-60',
                )}>
                  <input
                    type="checkbox"
                    checked={badgeDraft.isRetroactive}
                    disabled={!badgeDraft.ruleType}
                    onChange={(event) => setBadgeDraft((current) => ({ ...current, isRetroactive: event.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>
                    <span className="block font-semibold">Contar actividad anterior</span>
                    <span className="text-xs text-muted-foreground">
                      Al activar o modificar una regla retroactiva se evalúa a todos los usuarios activos.
                    </span>
                  </span>
                </label>
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs leading-relaxed text-muted-foreground lg:col-span-2">
                  <strong className="text-foreground">Cómo se obtiene:</strong>{' '}
                  {badgeRuleExplanation({
                    ruleType: badgeDraft.ruleType || null,
                    targetValue: badgeDraft.ruleType ? Number(badgeDraft.targetValue) || null : null,
                    isRetroactive: badgeDraft.isRetroactive,
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      color: badgeDraft.color,
                      borderColor: `${badgeDraft.color}66`,
                      backgroundColor: `${badgeDraft.color}18`,
                    }}
                  >
                    <BadgeIcon icon={badgeDraft.icon} label="Vista previa" className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{badgeDraft.name || 'Vista previa'}</p>
                    <Badge variant="secondary">
                      {isGeneratedBadgeIcon(badgeDraft.icon) ? 'SVG convertido' : 'Icono Lucide'}
                    </Badge>
                  </div>
                </div>
                <Button type="submit" disabled={!badgeCanSave || badgeBusy}>
                  {saveBadge.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  Guardar insignia
                </Button>
              </div>
            </form>
          )}

          <div className="rounded-xl border border-border bg-secondary/15 p-4">
            <h3 className="font-bold">Asignación manual</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Conserva el flujo excepcional. La razón y el administrador quedan registrados, y una segunda asignación no crea duplicados.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="grant-user">Usuario</Label>
                <Input
                  id="grant-user"
                  value={grantUser}
                  maxLength={30}
                  placeholder="nombre.usuario"
                  onChange={(event) => setGrantUser(event.target.value.trimStart())}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grant-badge">Insignia activa</Label>
                <Select id="grant-badge" value={grantBadge} onChange={(event) => setGrantBadge(event.target.value)}>
                  <option value="">Selecciona una insignia</option>
                  {(grantBadgesQuery.data ?? []).map((badge) => (
                    <option key={badge.id} value={badge.code}>{badge.name} ({badge.code})</option>
                  ))}
                </Select>
              </div>
              <Button
                className="self-end"
                disabled={!grantUser.trim() || !grantBadge || grant.isPending}
                onClick={() => grant.mutate()}
              >
                {grant.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                Otorgar
              </Button>
            </div>
            {grantBadgesQuery.isError && (
              <p role="alert" className="mt-3 text-xs text-danger">No se pudieron cargar las insignias activas.</p>
            )}
          </div>
        </section>

        <section
          id="gamification-panel-points"
          role="tabpanel"
          aria-labelledby="gamification-tab-points"
          tabIndex={0}
          hidden={activeTab !== 'points'}
          className="space-y-5 p-4 focus-visible:outline-none sm:p-6"
        >
          <div>
            <h2 className="flex items-center gap-2 font-serif-heading text-lg font-bold text-primary">
              <Coins className="h-5 w-5" /> Reglas de puntos activas
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estos son los valores que consumen el ranking y las recompensas. No se muestran puntuaciones inventadas.
            </p>
          </div>

          {rulesQuery.isLoading && (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando reglas…
            </div>
          )}
          {rulesQuery.isError && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              <p>No se pudieron cargar las reglas de puntos.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => void rulesQuery.refetch()}>
                <RefreshCw /> Reintentar
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {(rulesQuery.data ?? []).map((rule) => {
              const raw = edits[rule.reason] ?? String(rule.points);
              const value = Number(raw);
              const valid = Number.isInteger(value) && value >= -1_000 && value <= 1_000;
              return (
                <div key={rule.reason} className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{rule.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {rule.reason} · {rule.category}
                      {rule.dailyLimit ? ` · límite diario ${rule.dailyLimit}` : ' · sin límite diario'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`points-${rule.reason}`} className="sr-only">Puntos para {rule.label}</Label>
                    <Input
                      id={`points-${rule.reason}`}
                      type="number"
                      min={-1_000}
                      max={1_000}
                      step={1}
                      className="w-24"
                      value={raw}
                      onChange={(event) => setEdits((current) => ({ ...current, [rule.reason]: event.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={!valid || value === rule.points || updateRule.isPending}
                      onClick={() => updateRule.mutate({ reason: rule.reason, points: value })}
                    >
                      {updateRule.isPending && updateRule.variables?.reason === rule.reason
                        ? <Loader2 className="animate-spin" />
                        : <Save />}
                      Guardar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {rulesQuery.isSuccess && rulesQuery.data.length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No hay reglas de puntos activas.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
