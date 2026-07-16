'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Check, Coins, ImagePlus, Loader2, Pencil, Plus, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { BADGE_ICON_OPTIONS, BadgeIcon, isGeneratedBadgeIcon } from '@/components/badge-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { cn } from '@/lib/utils';

type GamificationTab = 'badges' | 'points';

interface PointRule {
  reason: string;
  label: string;
  points: number;
  category: string;
  dailyLimit?: number | null;
}

interface BadgeOption {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color?: string | null;
  _count?: { users: number };
}

interface BadgeDraft {
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

const EMPTY_BADGE: BadgeDraft = { code: '', name: '', description: '', icon: 'award', color: '#0C447C' };
const MAX_BADGE_SOURCE_SIZE = 512 * 1024;

const GAMIFICATION_TABS = [
  { id: 'badges' as const, label: 'Insignias', icon: Award, panelId: 'gamification-panel-badges' },
  { id: 'points' as const, label: 'Puntos', icon: Coins, panelId: 'gamification-panel-points' },
];

export default function AdminGamificacionPage() {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [grantUser, setGrantUser] = useState('');
  const [grantBadge, setGrantBadge] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GamificationTab>('badges');
  const [badgeDraft, setBadgeDraft] = useState<BadgeDraft>(EMPTY_BADGE);
  const [editingBadgeCode, setEditingBadgeCode] = useState<string | null>(null);
  const [showBadgeEditor, setShowBadgeEditor] = useState(false);

  const { data: rules, isLoading } = useQuery({ queryKey: ['point-rules'], queryFn: () => api.get<PointRule[]>('/points/rules') });
  const { data: badges } = useQuery({ queryKey: ['badges'], queryFn: () => api.get<BadgeOption[]>('/badges') });

  const updateRule = useMutation({
    mutationFn: ({ reason, points }: { reason: string; points: number }) =>
      api.patch(`/admin/points/rules/${reason}`, { points }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['point-rules'] });
      setMsg('Regla actualizada');
      setTimeout(() => setMsg(null), 2000);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo actualizar la regla'),
  });

  const grant = useMutation({
    mutationFn: () => api.post(`/admin/badges/${grantBadge}/grant/${grantUser}`),
    onSuccess: () => {
      setMsg(`Insignia otorgada a @${grantUser}`);
      setGrantUser('');
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo otorgar la insignia'),
  });

  const saveBadge = useMutation({
    mutationFn: () => api.post<BadgeOption>('/admin/badges', badgeDraft),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['badges'] });
      setGrantBadge(saved.code);
      setBadgeDraft(EMPTY_BADGE);
      setEditingBadgeCode(null);
      setShowBadgeEditor(false);
      setMsg('Insignia guardada');
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo guardar la insignia'),
  });

  const convertIcon = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<{ icon: string; sourceWidth: number; sourceHeight: number }>('/admin/badges/convert-icon', form);
    },
    onSuccess: ({ icon }) => {
      setBadgeDraft((current) => ({ ...current, icon }));
      setMsg('Imagen convertida a SVG seguro');
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo convertir la imagen'),
  });

  function openNewBadge() {
    setBadgeDraft(EMPTY_BADGE);
    setEditingBadgeCode(null);
    setShowBadgeEditor(true);
    setError(null);
  }

  function openBadge(badge: BadgeOption) {
    setBadgeDraft({
      code: badge.code,
      name: badge.name,
      description: badge.description,
      icon: badge.icon || 'award',
      color: badge.color || '#0C447C',
    });
    setEditingBadgeCode(badge.code);
    setShowBadgeEditor(true);
    setError(null);
  }

  function uploadBadgeRaster(file?: File) {
    setError(null);
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Selecciona una imagen PNG, JPEG o WebP');
      return;
    }
    if (file.size > MAX_BADGE_SOURCE_SIZE) {
      setError('La imagen para insignia no puede superar 512 KB');
      return;
    }
    convertIcon.mutate(file);
  }

  const badgeCanSave = /^[A-Z0-9_]+$/.test(badgeDraft.code)
    && badgeDraft.code.length <= 40
    && badgeDraft.name.trim().length > 0
    && badgeDraft.description.trim().length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif-heading text-2xl font-bold text-primary">Puntos e insignias</h1>
        <p className="text-sm text-muted-foreground">Ajusta los valores de las reglas de puntos y otorga insignias manualmente.</p>
      </div>

      {msg && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}

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
          className="space-y-5 p-5 focus-visible:outline-none sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-serif-heading text-lg font-bold text-primary"><Award className="h-5 w-5" /> Catálogo de insignias</h2>
              <p className="mt-1 text-sm text-muted-foreground">Crea insignias con iconos SVG del catálogo o convierte una imagen pequeña.</p>
            </div>
            <Button variant="outline" onClick={openNewBadge}><Plus /> Nueva insignia</Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(badges ?? []).map((badge) => (
              <article key={badge.code} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/15 p-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    backgroundColor: `${badge.color || '#0C447C'}22`,
                    borderColor: `${badge.color || '#0C447C'}55`,
                    color: badge.color || '#0C447C',
                  }}
                >
                  <BadgeIcon icon={badge.icon} label={badge.name} className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{badge.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{badge.code} · {badge._count?.users ?? 0} otorgadas</p>
                </div>
                <Button size="sm" variant="ghost" aria-label={`Editar ${badge.name}`} onClick={() => openBadge(badge)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </article>
            ))}
          </div>

          {showBadgeEditor && (
            <div className="space-y-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">{editingBadgeCode ? `Editar ${editingBadgeCode}` : 'Crear insignia'}</h3>
                  <p className="text-xs text-muted-foreground">Los códigos se usan para automatizar la entrega y no se pueden cambiar después.</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Cerrar editor"
                  onClick={() => setShowBadgeEditor(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="badge-code">Código</Label>
                  <Input
                    id="badge-code"
                    value={badgeDraft.code}
                    disabled={Boolean(editingBadgeCode)}
                    maxLength={40}
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
                <textarea
                  id="badge-description"
                  value={badgeDraft.description}
                  maxLength={200}
                  rows={2}
                  placeholder="Explica claramente cómo se obtiene esta insignia."
                  onChange={(event) => setBadgeDraft((current) => ({ ...current, description: event.target.value }))}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-right text-[11px] text-muted-foreground">{badgeDraft.description.length}/200</p>
              </div>

              <div className="space-y-3">
                <Label>Icono SVG</Label>
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
                        badgeDraft.icon === option.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-primary',
                      )}
                    >
                      <BadgeIcon icon={option.value} className="h-4 w-4" />
                    </button>
                  ))}
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-card px-3 text-xs font-semibold text-primary hover:bg-primary/5">
                    {convertIcon.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Convertir imagen
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={convertIcon.isPending}
                      onChange={(event) => {
                        uploadBadgeRaster(event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">PNG, JPEG o WebP · máximo 512 KB y 1024×1024 px. El servidor lo reduce y genera rutas SVG sin conservar metadatos.</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full border"
                    style={{ color: badgeDraft.color, borderColor: `${badgeDraft.color}66`, backgroundColor: `${badgeDraft.color}18` }}
                  >
                    <BadgeIcon icon={badgeDraft.icon} label="Vista previa" className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{badgeDraft.name || 'Vista previa'}</p>
                    <Badge variant="secondary">{isGeneratedBadgeIcon(badgeDraft.icon) ? 'SVG convertido' : 'SVG Lucide'}</Badge>
                  </div>
                </div>
                <Button disabled={!badgeCanSave || saveBadge.isPending || convertIcon.isPending} onClick={() => saveBadge.mutate()}>
                  {saveBadge.isPending ? <Loader2 className="animate-spin" /> : <Save />} Guardar insignia
                </Button>
              </div>
            </div>
          )}

          <div className="border-t border-border pt-5">
            <h2 className="flex items-center gap-2 font-serif-heading text-lg font-bold text-primary"><Award className="h-5 w-5" /> Otorgar manualmente</h2>
            <p className="mt-1 text-sm text-muted-foreground">Asigna una insignia existente mediante el nombre de usuario.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-secondary/20 p-5">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input placeholder="avargas" value={grantUser} onChange={(e) => setGrantUser(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1.5">
              <Label>Insignia</Label>
              <select
                value={grantBadge}
                onChange={(e) => setGrantBadge(e.target.value)}
                className="flex h-10 w-56 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm"
              >
                <option value="">Selecciona…</option>
                {(badges ?? []).map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
            </div>
            <Button disabled={!grantUser || !grantBadge || grant.isPending} onClick={() => grant.mutate()}>
              {grant.isPending ? <Loader2 className="animate-spin" /> : <Award />} Otorgar
            </Button>
          </div>
        </section>

        <section
          id="gamification-panel-points"
          role="tabpanel"
          aria-labelledby="gamification-tab-points"
          tabIndex={0}
          hidden={activeTab !== 'points'}
          className="space-y-4 p-5 focus-visible:outline-none sm:p-6"
        >
          <div>
            <h2 className="flex items-center gap-2 font-serif-heading text-lg font-bold text-primary"><Coins className="h-5 w-5" /> Reglas de puntos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Configura cuántos puntos entrega cada acción de la plataforma.</p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {(rules ?? []).map((r, i) => (
                <div key={r.reason} className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3', i % 2 === 0 ? 'bg-card' : 'bg-secondary/40')}>
                  <div>
                    <div className="text-sm font-semibold">{r.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.reason} · {r.category}{r.dailyLimit ? ` · límite diario: ${r.dailyLimit}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      aria-label={`Puntos para ${r.label}`}
                      className="h-9 w-20 rounded-lg border border-border bg-card px-2 text-center text-sm font-bold"
                      value={edits[r.reason] ?? String(r.points)}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [r.reason]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateRule.isPending || (edits[r.reason] ?? String(r.points)) === String(r.points)}
                      onClick={() => updateRule.mutate({ reason: r.reason, points: Number(edits[r.reason]) })}
                    >
                      <Check /> Guardar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
