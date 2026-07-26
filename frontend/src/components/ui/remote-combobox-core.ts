'use client';

import { useEffect, useRef, useState } from 'react';

export interface RemoteOptionsRequest {
  query: string;
  page: number;
  limit: number;
}

export interface RemoteOptionsPage<T> {
  items: T[];
  page?: number;
  total?: number;
  hasMore?: boolean;
}

export type RemoteOptionsLoader<T> = (request: RemoteOptionsRequest) => Promise<RemoteOptionsPage<T>>;

export function normalizeComboboxText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function mergeUnique<T>(current: T[], incoming: T[], getKey: (option: T) => string) {
  const options = new Map(current.map((option) => [getKey(option), option]));
  for (const option of incoming) options.set(getKey(option), option);
  return [...options.values()];
}

export function useRemoteOptions<T>({
  open,
  query,
  loadOptions,
  getOptionKey,
  debounceMs,
  pageSize,
  minQueryLength,
  requestKey,
}: {
  open: boolean;
  query: string;
  loadOptions: RemoteOptionsLoader<T>;
  getOptionKey: (option: T) => string;
  debounceMs: number;
  pageSize: number;
  minQueryLength: number;
  requestKey?: string;
}) {
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const loaderRef = useRef(loadOptions);
  const getKeyRef = useRef(getOptionKey);

  useEffect(() => {
    loaderRef.current = loadOptions;
    getKeyRef.current = getOptionKey;
  }, [getOptionKey, loadOptions]);

  useEffect(() => {
    requestSequence.current += 1;
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query.trim());
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, query, requestKey]);

  useEffect(() => {
    if (open) return;
    requestSequence.current += 1;
  }, [open]);

  useEffect(() => {
    if (!open || debouncedQuery.length < minQueryLength) return;

    const sequence = ++requestSequence.current;
    // The effect synchronizes component state with the remote data source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    void loaderRef.current({ query: debouncedQuery, page, limit: pageSize })
      .then((result) => {
        if (requestSequence.current !== sequence) return;
        const incoming = Array.isArray(result.items) ? result.items : [];
        setOptions((current) => (
          page === 1 ? mergeUnique([], incoming, getKeyRef.current) : mergeUnique(current, incoming, getKeyRef.current)
        ));
        setHasMore(result.hasMore ?? incoming.length === pageSize);
        setResolvedQuery(debouncedQuery);
      })
      .catch((cause: unknown) => {
        if (requestSequence.current !== sequence) return;
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las opciones.');
        setHasMore(false);
      })
      .finally(() => {
        if (requestSequence.current === sequence) setLoading(false);
      });
  }, [debouncedQuery, minQueryLength, open, page, pageSize, requestKey]);

  const trimmedQuery = query.trim();
  const settled = trimmedQuery === debouncedQuery;
  const currentError = settled ? error : null;
  const resolved = settled && resolvedQuery === debouncedQuery;
  const visibleLoading = open
    && trimmedQuery.length >= minQueryLength
    && (!settled || loading || (!resolved && !currentError));

  return {
    options: resolved ? options : [],
    loading: visibleLoading,
    error: currentError,
    hasMore: resolved && hasMore,
    ready: resolved && !visibleLoading && !currentError,
    belowMinimum: trimmedQuery.length < minQueryLength,
    loadMore: () => {
      if (!visibleLoading && resolved && hasMore) setPage((current) => current + 1);
    },
  };
}
