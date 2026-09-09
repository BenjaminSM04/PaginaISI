import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        ...Object.fromEntries(['primary', 'secondary', 'accent', 'destructive', 'success', 'warning', 'danger', 'info', 'gold'].flatMap(name => [
          [name + '-hover', 'hsl(var(--' + name + '-hover) / <alpha-value>)'],
          [name + '-active', 'hsl(var(--' + name + '-active) / <alpha-value>)'],
        ])),
        ...Object.fromEntries(['success', 'warning', 'danger', 'info'].map(name => [name, {
          DEFAULT: 'hsl(var(--' + name + ') / <alpha-value>)',
          foreground: 'hsl(var(--' + name + '-foreground) / <alpha-value>)',
        }])),
        hero: { DEFAULT: 'hsl(var(--hero) / <alpha-value>)', end: 'hsl(var(--hero-end) / <alpha-value>)', foreground: 'hsl(var(--hero-foreground) / <alpha-value>)', accent: 'hsl(var(--hero-accent) / <alpha-value>)' },
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: { DEFAULT: 'hsl(var(--card) / <alpha-value>)', foreground: 'hsl(var(--card-foreground) / <alpha-value>)' },
        popover: { DEFAULT: 'hsl(var(--popover) / <alpha-value>)', foreground: 'hsl(var(--popover-foreground) / <alpha-value>)' },
        primary: { DEFAULT: 'hsl(var(--primary) / <alpha-value>)', foreground: 'hsl(var(--primary-foreground) / <alpha-value>)' },
        secondary: { DEFAULT: 'hsl(var(--secondary) / <alpha-value>)', foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)' },
        muted: { DEFAULT: 'hsl(var(--muted) / <alpha-value>)', foreground: 'hsl(var(--muted-foreground) / <alpha-value>)' },
        accent: { DEFAULT: 'hsl(var(--accent) / <alpha-value>)', foreground: 'hsl(var(--accent-foreground) / <alpha-value>)' },
        destructive: { DEFAULT: 'hsl(var(--destructive) / <alpha-value>)', foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)' },
        gold: { DEFAULT: 'hsl(var(--gold) / <alpha-value>)', foreground: 'hsl(var(--gold-foreground) / <alpha-value>)' },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Georgia', 'Times New Roman', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out',
        'pulse-soft': 'pulse-soft 2.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
