'use client';

import { useId, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  panelId?: string;
  disabled?: boolean;
}

interface SegmentedTabsProps<T extends string> {
  items: readonly SegmentedTabItem<T>[];
  value: T;
  onValueChange: (value: NoInfer<T>) => void;
  ariaLabel: string;
  idPrefix?: string;
  className?: string;
  tabClassName?: string;
}

/**
 * Selector segmentado para alternar vistas dentro de una misma página.
 * Conserva el patrón visual del portal y ofrece navegación completa por teclado.
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  idPrefix,
  className,
  tabClassName,
}: SegmentedTabsProps<T>) {
  const generatedId = useId().replace(/:/g, '');
  const prefix = idPrefix ?? `segmented-${generatedId}`;

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, current: T) {
    const enabledItems = items.filter((item) => !item.disabled);
    const currentIndex = enabledItems.findIndex((item) => item.id === current);
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % enabledItems.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = enabledItems.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = enabledItems[nextIndex].id;
    onValueChange(nextTab);
    document.getElementById(`${prefix}-tab-${nextTab}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      className={cn(
        'flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border/80 bg-secondary/60 p-1.5 shadow-inner',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const selected = value === item.id;

        return (
          <button
            key={item.id}
            id={`${prefix}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={item.panelId}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.id)}
            onKeyDown={(event) => selectFromKeyboard(event, item.id)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent px-4 py-2.5 text-sm font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary',
              'disabled:pointer-events-none disabled:opacity-45',
              selected
                ? 'border-border/90 bg-card text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-card/45 hover:text-foreground',
              tabClassName,
            )}
          >
            {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
