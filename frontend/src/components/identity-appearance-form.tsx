'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { type InstitutionalSettings } from '@/lib/institution';
import { institutionalSettingsQueryKey } from '@/lib/use-institutional-settings';
import { resolveTheme, themeCss, contrastRatio, type ThemeColor } from '@/lib/theme';
import { Button } from './ui/button';
import { Input, Label, Select } from './ui/input';

const LABELS: Record<ThemeColor, string> = {
  primary: 'Primario', secondary: 'Secundario', accent: 'Acento', background: 'Fondo', surface: 'Tarjetas y menús',
  text: 'Texto', muted: 'Texto secundario', border: 'Bordes', success: 'Éxito', warning: 'Advertencia', danger: 'Error', info: 'Información', gold: 'Premios',
};

export function IdentityAppearanceForm({ settings }: { settings: InstitutionalSettings }) {
  const client = useQueryClient();
  const [theme, setTheme] = useState(resolveTheme(settings.theme));
  const [height, setHeight] = useState(settings.logoMaxHeight);
  const [width, setWidth] = useState(settings.logoMaxWidth);
  const [fit, setFit] = useState(settings.logoObjectFit);
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState(false);
  const save = useMutation({
    mutationFn: () => api.patch<InstitutionalSettings>('/institution/admin', {
      theme: reset ? null : theme, logoMaxHeight: height, logoMaxWidth: width, logoObjectFit: fit,
    }),
    onSuccess: (updated) => {
      client.setQueryData(['institution', 'admin'], updated);
      client.setQueryData(institutionalSettingsQueryKey, updated);
      setSaved(true);
    },
  });
  const contrastWarnings = (['light', 'dark'] as const).flatMap(mode => {
    const p = theme[mode];
    return (['background', 'surface'] as const).flatMap(bg =>
      (['text', 'muted', 'primary', 'accent', 'success', 'warning', 'danger', 'info', 'gold'] as const)
        .filter(fg => contrastRatio(p[fg], p[bg]) < 4.5)
        .map(fg => `${mode === 'light' ? 'Claro' : 'Oscuro'}: ${LABELS[fg]} / ${LABELS[bg]}`));
  });
  const submit = (event: FormEvent) => { event.preventDefault(); setSaved(false); save.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-card p-5">
      <div><h2 className="font-serif-heading text-lg font-bold text-primary">Colores y proporciones</h2>
        <p className="text-sm text-muted-foreground">Configura cada modo. Los estados de interacción y el texto sobre botones se calculan a partir de estos colores.</p></div>
      <div className="grid gap-6 lg:grid-cols-2">
        {(['light', 'dark'] as const).map(mode => (
          <fieldset key={mode} className="space-y-3"><legend className="mb-3 font-semibold">{mode === 'light' ? 'Modo claro' : 'Modo oscuro'}</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{(Object.keys(LABELS) as ThemeColor[]).map(color => (
              <label key={color} className="flex items-center gap-2 text-xs"><input aria-label={`${mode} ${LABELS[color]}`} type="color" className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent" value={theme[mode][color]}
                onChange={event => { setReset(false); setSaved(false); setTheme(current => ({ ...current, [mode]: { ...current[mode], [color]: event.target.value } })); }} />{LABELS[color]}</label>
            ))}</div>
            <div className={`identity-preview-${mode} rounded-lg border bg-background p-4 text-foreground`}>
              <style>{themeCss({ light: theme[mode], dark: theme[mode] }).replaceAll(':root.dark', `.identity-preview-${mode}`).replaceAll(':root', `.identity-preview-${mode}`)}</style>
              <p className="font-bold text-primary">{settings.shortName}</p><p className="mb-3 text-sm text-muted-foreground">Vista previa del portal</p>
              <Button type="button">Botón principal</Button> <span className="text-sm text-danger">Error</span>
            </div>
          </fieldset>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="logo-height">Altura máxima (px)</Label><Input id="logo-height" type="number" min={24} max={96} required value={height} onChange={e => setHeight(Number(e.target.value))} /></div>
        <div><Label htmlFor="logo-width">Ancho máximo (px)</Label><Input id="logo-width" type="number" min={48} max={240} required value={width} onChange={e => setWidth(Number(e.target.value))} /></div>
        <div><Label htmlFor="logo-fit">Ajuste del logo</Label><Select id="logo-fit" value={fit} onChange={e => setFit(e.target.value as typeof fit)}><option value="contain">Ajustar conservando proporción</option><option value="scale-down">Reducir sin ampliar</option></Select></div>
      </div>
      <p className="text-xs text-muted-foreground">El ancho se limita también en móviles. Para evitar márgenes internos, carga el archivo recortado al contenido; el portal conserva la imagen completa.</p>
      {contrastWarnings.length > 0 && <p role="alert" className="text-sm text-warning">Mejora el contraste antes de guardar (mínimo 4,5:1): {contrastWarnings.join('; ')}.</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={save.isPending || contrastWarnings.length > 0}>{save.isPending ? 'Guardando…' : 'Guardar apariencia'}</Button>
        <Button type="button" variant="outline" onClick={() => { setTheme(resolveTheme()); setReset(true); setSaved(false); }}>Restaurar paleta predeterminada</Button></div>
      {save.isError && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
      {saved && <p role="status" className="text-sm text-success">Apariencia guardada.</p>}
    </form>
  );
}
