'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterDef {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}

export function FiltersBar({ filters, searchPlaceholder }: { filters: FilterDef[]; searchPlaceholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParam('search', search.trim() || undefined);
  };

  const hasFilters = Array.from(params.keys()).length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={submitSearch} className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? 'Buscar…'}
            className="h-10 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>
        {filters.map((f) => (
          <select
            key={f.param}
            value={params.get(f.param) ?? ''}
            onChange={(e) => setParam(f.param, e.target.value || undefined)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}
        {hasFilters && (
          <button
            onClick={() => router.push(pathname)}
            className={cn('flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground')}
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
      </div>
    </div>
  );
}
