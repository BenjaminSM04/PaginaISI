'use client';

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  normalizeComboboxText,
  type RemoteOptionsLoader,
  useRemoteOptions,
} from './remote-combobox-core';

export type { RemoteOptionsLoader, RemoteOptionsPage, RemoteOptionsRequest } from './remote-combobox-core';

export interface RemoteComboboxProps<T> {
  value: T | null;
  onChange: (value: T | null) => void;
  loadOptions: RemoteOptionsLoader<T>;
  getOptionKey: (option: T) => string;
  getOptionLabel: (option: T) => string;
  getOptionDescription?: (option: T) => string | null | undefined;
  renderOption?: (option: T) => ReactNode;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  debounceMs?: number;
  pageSize?: number;
  minQueryLength?: number;
  allowCreate?: boolean;
  onCreate?: (label: string) => Promise<T> | T;
  createLabel?: (label: string) => ReactNode;
  emptyMessage?: string;
  loadingMessage?: string;
  className?: string;
  inputId?: string;
  requestKey?: string;
}

export function RemoteCombobox<T>({
  value,
  onChange,
  loadOptions,
  getOptionKey,
  getOptionLabel,
  getOptionDescription,
  renderOption,
  label,
  ariaLabel,
  placeholder = 'Buscar…',
  disabled = false,
  required = false,
  clearable = true,
  debounceMs = 300,
  pageSize = 20,
  minQueryLength = 0,
  allowCreate = false,
  onCreate,
  createLabel,
  emptyMessage = 'No se encontraron opciones.',
  loadingMessage = 'Buscando…',
  className,
  inputId,
  requestKey,
}: RemoteComboboxProps<T>) {
  const generatedId = useId();
  const id = inputId ?? `remote-combobox-${generatedId}`;
  const listboxId = `${id}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ? getOptionLabel(value) : '');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const { options, loading, error, hasMore, ready, belowMinimum, loadMore } = useRemoteOptions({
    open,
    query,
    loadOptions,
    getOptionKey,
    debounceMs,
    pageSize,
    minQueryLength,
    requestKey,
  });

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  const trimmedQuery = query.trim().replace(/\s+/g, ' ');
  const exactOptionExists = options.some(
    (option) => normalizeComboboxText(getOptionLabel(option)) === normalizeComboboxText(trimmedQuery),
  );
  const canCreate = Boolean(
    allowCreate
    && onCreate
    && trimmedQuery
    && trimmedQuery.length >= minQueryLength
    && ready
    && !exactOptionExists,
  );
  const interactiveCount = options.length + (canCreate ? 1 : 0);
  const resolvedActiveIndex = interactiveCount === 0
    ? -1
    : activeIndex >= 0 && activeIndex < interactiveCount
      ? activeIndex
      : 0;

  const activeDescendant = resolvedActiveIndex < 0
    ? undefined
    : resolvedActiveIndex < options.length
      ? `${listboxId}-option-${resolvedActiveIndex}`
      : `${listboxId}-create`;

  const choose = (option: T) => {
    onChange(option);
    setQuery(getOptionLabel(option));
    setCreateError(null);
    setOpen(false);
  };

  const create = async () => {
    if (!canCreate || !onCreate || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      choose(await onCreate(trimmedQuery));
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'No se pudo crear la opción.');
    } finally {
      setCreating(false);
    }
  };

  const moveActive = (direction: 1 | -1) => {
    if (!open) setOpen(true);
    if (!interactiveCount) return;
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : interactiveCount - 1;
      return (current + direction + interactiveCount) % interactiveCount;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter' && open && resolvedActiveIndex >= 0) {
      event.preventDefault();
      if (resolvedActiveIndex < options.length) choose(options[resolvedActiveIndex]);
      else void create();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery(value ? getOptionLabel(value) : '');
    }
  };

  const statusContent = (() => {
    if (belowMinimum) {
      const remaining = Math.max(0, minQueryLength - query.trim().length);
      return `Escribe ${remaining} carácter${remaining === 1 ? '' : 'es'} más para buscar.`;
    }
    if (loading && options.length === 0) return loadingMessage;
    if (error) return error;
    if (!loading && options.length === 0 && !canCreate) return emptyMessage;
    return null;
  })();

  return (
    <div
      ref={rootRef}
      className={cn('relative space-y-1.5', className)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {label && <label htmlFor={id} className="text-sm font-semibold leading-none">{label}{required ? ' *' : ''}</label>}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          type="text"
          value={open ? query : value ? getOptionLabel(value) : ''}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          aria-label={label ? undefined : ariaLabel ?? placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open ? activeDescendant : undefined}
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 pr-16 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          onFocus={() => {
            if (!open) setQuery(value ? getOptionLabel(value) : '');
            setOpen(true);
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            setCreateError(null);
            if (value && normalizeComboboxText(nextQuery) !== normalizeComboboxText(getOptionLabel(value))) onChange(null);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {clearable && value && !disabled && (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Quitar ${getOptionLabel(value)}`}
              onClick={() => {
                onChange(null);
                setOpen(true);
                inputRef.current?.focus();
                setQuery('');
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-label={open ? 'Cerrar opciones' : 'Mostrar opciones'}
            tabIndex={-1}
            onClick={() => {
              const nextOpen = !open;
              setOpen(nextOpen);
              if (nextOpen) inputRef.current?.focus();
            }}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </button>
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          <ul id={listboxId} role="listbox" aria-label={label ?? ariaLabel ?? 'Opciones'}>
            {options.map((option, index) => {
              const selected = value ? getOptionKey(value) === getOptionKey(option) : false;
              return (
                <li
                  id={`${listboxId}-option-${index}`}
                  key={getOptionKey(option)}
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm',
                    resolvedActiveIndex === index ? 'bg-secondary text-foreground' : 'text-foreground',
                  )}
                  onPointerMove={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <span className="min-w-0">
                    {renderOption ? renderOption(option) : (
                      <>
                        <span className="block truncate font-medium">{getOptionLabel(option)}</span>
                        {getOptionDescription?.(option) && (
                          <span className="block truncate text-xs text-muted-foreground">{getOptionDescription(option)}</span>
                        )}
                      </>
                    )}
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </li>
              );
            })}
            {canCreate && (
              <li
                id={`${listboxId}-create`}
                role="option"
                aria-selected="false"
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-primary',
                  resolvedActiveIndex === options.length && 'bg-secondary',
                )}
                onPointerMove={() => setActiveIndex(options.length)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void create()}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {createLabel ? createLabel(trimmedQuery) : <>Crear “{trimmedQuery}”</>}
              </li>
            )}
          </ul>

          {statusContent && (
            <p
              role={error ? 'alert' : 'status'}
              className={cn('px-3 py-3 text-center text-xs text-muted-foreground', error && 'text-red-500')}
            >
              {loading && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {statusContent}
            </p>
          )}
          {createError && <p role="alert" className="px-3 py-2 text-xs text-red-500">{createError}</p>}
          {hasMore && !belowMinimum && (
            <button
              type="button"
              className="mt-1 w-full rounded-md px-3 py-2 text-xs font-semibold text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={loading}
              onClick={loadMore}
            >
              {loading ? 'Cargando…' : 'Cargar más resultados'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
