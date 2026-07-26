'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils';

export function SectionHeader({
  kicker,
  title,
  href,
  linkLabel,
  className,
}: {
  kicker?: string;
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        {kicker && <span className="section-kicker">{kicker}</span>}
        <h2 className="mt-1 font-serif-heading text-2xl font-bold text-primary sm:text-3xl">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {linkLabel ?? 'Ver todo'} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="font-semibold">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold', STATUS_COLORS[status] ?? '')}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function TagList({ tags, max = 4 }: { tags?: string[]; max?: number }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, max).map((t) => (
        <Badge key={t} variant="secondary" className="font-mono text-[10px] lowercase">
          #{t}
        </Badge>
      ))}
    </div>
  );
}

export function CoverPlaceholder({ label, accent, className }: { label?: string; accent?: string | null; className?: string }) {
  return (
    <div
      className={cn('grid-bg flex h-full w-full items-center justify-center', className)}
      style={{ backgroundColor: accent ? `${accent}14` : undefined }}
    >
      <span className="font-serif-heading text-4xl font-bold opacity-25" style={{ color: accent ?? 'hsl(var(--primary))' }}>
        {label ?? 'ISI'}
      </span>
    </div>
  );
}

export function Countdown({ target }: { target: string }) {
  const [left, setLeft] = useState<{ d: number; h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        setLeft(null);
        return;
      }
      setLeft({
        d: Math.floor(diff / 86_400_000),
        h: Math.floor((diff % 86_400_000) / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!left) return <span className="font-mono text-sm font-bold text-emerald-400">¡En curso o finalizado!</span>;

  const cell = (value: number, label: string) => (
    <div className="flex flex-col items-center rounded-lg border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm min-w-[60px]">
      <span className="font-mono text-2xl font-bold tabular-nums">{String(value).padStart(2, '0')}</span>
      <span className="text-[10px] uppercase tracking-widest opacity-80">{label}</span>
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex">
      {cell(left.d, 'días')}
      {cell(left.h, 'hrs')}
      {cell(left.m, 'min')}
      {cell(left.s, 'seg')}
    </div>
  );
}
