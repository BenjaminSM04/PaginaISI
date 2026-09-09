/** Default palette only. ADMIN overrides are persisted in InstitutionalSettings.theme. */
export const DEFAULT_THEME = {
  light: {
    primary: '#0c447d', secondary: '#f1f5f9', accent: '#087e8b',
    background: '#f8fafc', surface: '#ffffff', text: '#1d293a', muted: '#64748b', border: '#cbd5e1',
    success: '#15803d', warning: '#a16207', danger: '#dc2626', info: '#0369a1', gold: '#86640b',
  },
  dark: {
    primary: '#3abff8', secondary: '#1d293a', accent: '#22d3ee',
    background: '#0b111e', surface: '#111827', text: '#f8fafc', muted: '#9caec5', border: '#475569',
    success: '#4ade80', warning: '#facc15', danger: '#f87171', info: '#7dd3fc', gold: '#facc15',
  },
};

export type ThemeMode = keyof typeof DEFAULT_THEME;
export type ThemeColor = keyof typeof DEFAULT_THEME.light;
export type ThemePalette = Record<ThemeColor, string>;
export type ThemeSettings = Record<ThemeMode, Partial<ThemePalette>>;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function resolveTheme(value?: Partial<ThemeSettings> | null): Record<ThemeMode, ThemePalette> {
  return Object.fromEntries((['light', 'dark'] as const).map((mode) => [mode,
    Object.fromEntries(Object.entries(DEFAULT_THEME[mode]).map(([key, fallback]) => {
      const candidate = value?.[mode]?.[key as ThemeColor];
      return [key, typeof candidate === 'string' && HEX_COLOR.test(candidate) ? candidate : fallback];
    })),
  ])) as Record<ThemeMode, ThemePalette>;
}

function rgb(hex: string) { return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)); }
function mix(hex: string, target: number, amount: number) {
  return '#' + rgb(hex).map((v) => Math.round(v + (target - v) * amount).toString(16).padStart(2, '0')).join('');
}
export function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function foreground(color: string) {
  return contrastRatio(color, '#ffffff') >= contrastRatio(color, '#000000') ? '#ffffff' : '#000000';
}
export function hslChannels(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  const h = delta === 0 ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return `${+(h * 60).toFixed(2)} ${+(s * 100).toFixed(2)}% ${+(l * 100).toFixed(2)}%`;
}

export function themeCss(settings?: Partial<ThemeSettings> | null) {
  const themes = resolveTheme(settings);
  return (['light', 'dark'] as const).map((mode) => {
    const p = themes[mode];
    const tokens: Record<string, string> = {
      background: p.background, foreground: p.text, card: p.surface, 'card-foreground': p.text,
      popover: p.surface, 'popover-foreground': p.text, muted: p.secondary, 'muted-foreground': p.muted,
      border: p.border, input: p.border, ring: p.primary,
      hero: mix(p.primary, 0, 0.45), 'hero-end': mix(p.primary, 0, 0.65),
      'hero-foreground': '#ffffff', 'hero-accent': mix(p.accent, 255, 0.7),
    };
    for (const name of ['primary', 'secondary', 'accent', 'success', 'warning', 'danger', 'info', 'gold'] as const) {
      tokens[name] = p[name];
      tokens[`${name}-foreground`] = foreground(p[name]);
      // Keep foreground contrast during interactions by moving away from its luminance.
      const target = tokens[`${name}-foreground`] === '#ffffff' ? 0 : 255;
      tokens[`${name}-hover`] = mix(p[name], target, 0.12);
      tokens[`${name}-active`] = mix(p[name], target, 0.22);
    }
    for (const suffix of ['', '-foreground', '-hover', '-active']) tokens[`destructive${suffix}`] = tokens[`danger${suffix}`];
    return `${mode === 'light' ? ':root' : ':root.dark'}{${Object.entries(tokens).map(([key, hex]) => `--${key}:${hslChannels(hex)};`).join('')}}`;
  }).join('\n');
}
