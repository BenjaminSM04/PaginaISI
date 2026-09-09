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

export interface RemoteMultiComboboxProps<T> {
  value: T[];
  onChange: (value: T[]) => void;
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
  maxSelected?: number;
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

export function RemoteMultiCombobox<T>({
  value,
  onChange,
  loadOptions,
  getOptionKey,
  getOptionLabel,
  getOptionDescription,
  renderOption,
  label,
  ariaLabel,
  placeholder = 'Buscar y seleccionar…',
  disabled = false,
  required = false,
  maxSelected,
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
}: RemoteMultiComboboxProps<T>) {
  const generatedId = useId();
  const id = inputId ?? `remote-multi-combobox-${generatedId}`;
  const listboxId = `${id}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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

  const selectedKeys = new Set(value.map(getOptionKey));
  const availableOptions = options.filter((option) => !selectedKeys.has(getOptionKey(option)));
  const reachedLimit = maxSelected !== undefined && value.length >= maxSelected;
  const trimmedQuery = query.trim().replace(/\s+/g, ' ');
  const exactOptionExists = [...options, ...value].some(
    (option) => normalizeComboboxText(getOptionLabel(option)) === normalizeComboboxText(trimmedQuery),
  );
  const canCreate = Boolean(
    allowCreate
    && onCreate
    && !reachedLimit
    && trimmedQuery
    && trimmedQuery.length >= minQueryLength
    && ready
    && !exactOptionExists,
  );
  const interactiveCount = availableOptions.length + (canCreate ? 1 : 0);
  const resolvedActiveIndex = interactiveCount === 0
    ? -1
    : activeIndex >= 0 && activeIndex < interactiveCount
      ? activeIndex
      : 0;

  const add = (option: T) => {
    if (reachedLimit || selectedKeys.has(getOptionKey(option))) return;
    const nextValue = [...value, option];
    onChange(nextValue);
    setQuery('');
    setCreateError(null);
    setOpen(maxSelected === undefined || nextValue.length < maxSelected);
    inputRef.current?.focus();
  };

  const remove = (key: string) => {
    onChange(value.filter((option) => getOptionKey(option) !== key));
    inputRef.current?.focus();
  };

  const create = async () => {
    if (!canCreate || !onCreate || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      add(await onCreate(trimmedQuery));
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
      if (resolvedActiveIndex < availableOptions.length) add(availableOptions[resolvedActiveIndex]);
      else void create();
    } else if (event.key === 'Backspace' && !query && value.length > 0) {
      event.preventDefault();
      remove(getOptionKey(value[value.length - 1]));
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const statusContent = (() => {
    if (reachedLimit) return `Puedes seleccionar hasta ${maxSelected} opciones.`;
    if (belowMinimum) {
      const remaining = Math.max(0, minQueryLength - query.trim().length);
      return `Escribe ${remaining} carácter${remaining === 1 ? '' : 'es'} más para buscar.`;
    }
    if (loading && availableOptions.length === 0) return loadingMessage;
    if (error) return error;
    if (!loading && availableOptions.length === 0 && !canCreate) return emptyMessage;
    return null;
  })();

  const activeDescendant = resolvedActiveIndex < 0
    ? undefined
    : resolvedActiveIndex < availableOptions.length
      ? `${listboxId}-option-${resolvedActiveIndex}`
      : `${listboxId}-create`;

  return (
    <div
      ref={rootRef}
      className={cn('relative space-y-1.5', className)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {label && <label htmlFor={id} className="text-sm font-semibold leading-none">{label}{required ? ' *' : ''}</label>}
      <div
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((option) => (
          <span
            key={getOptionKey(option)}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-secondary px-2 py-1 text-xs font-semibold"
          >
            <span className="truncate">{getOptionLabel(option)}</span>
            {!disabled && (
              <button
                type="button"
                className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Quitar ${getOptionLabel(option)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(getOptionKey(option));
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          type="text"
          value={query}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled || reachedLimit}
          autoComplete="off"
          aria-label={label ? undefined : ariaLabel ?? placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open ? activeDescendant : undefined}
          aria-required={required}
          className="h-7 min-w-28 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setCreateError(null);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          disabled={disabled || reachedLimit}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label={open ? 'Cerrar opciones' : 'Mostrar opciones'}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            const nextOpen = !open;
            setOpen(nextOpen);
            if (nextOpen) inputRef.current?.focus();
          }}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          <ul id={listboxId} role="listbox" aria-multiselectable="true" aria-label={label ?? ariaLabel ?? 'Opciones'}>
            {availableOptions.map((option, index) => (
              <li
                id={`${listboxId}-option-${index}`}
                key={getOptionKey(option)}
                role="option"
                aria-selected="false"
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm',
                  resolvedActiveIndex === index && 'bg-secondary',
                )}
                onPointerMove={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(option)}
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
                <Check className="h-4 w-4 shrink-0 opacity-0" aria-hidden="true" />
              </li>
            ))}
            {canCreate && (
              <li
                id={`${listboxId}-create`}
                role="option"
                aria-selected="false"
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-primary',
                  resolvedActiveIndex === availableOptions.length && 'bg-secondary',
                )}
                onPointerMove={() => setActiveIndex(availableOptions.length)}
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
              className={cn('px-3 py-3 text-center text-xs text-muted-foreground', error && 'text-danger')}
            >
              {loading && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {statusContent}
            </p>
          )}
          {createError && <p role="alert" className="px-3 py-2 text-xs text-danger">{createError}</p>}
          {hasMore && !belowMinimum && !reachedLimit && (
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
