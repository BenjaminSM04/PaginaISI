'use client';

import { useMemo } from 'react';
import { api } from '@/lib/api';
import {
  RemoteCombobox,
  type RemoteComboboxProps,
  type RemoteOptionsLoader,
  type RemoteOptionsPage,
  type RemoteOptionsRequest,
} from '@/components/ui/remote-combobox';
import {
  RemoteMultiCombobox,
  type RemoteMultiComboboxProps,
} from '@/components/ui/remote-multi-combobox';

export type DirectoryRole = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'COMMUNITY_LEADER';
export type CatalogKind = 'TECHNOLOGY' | 'TAG' | 'CATEGORY' | 'SUBJECT';

interface ApiPage<T> {
  items: T[];
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
  hasMore?: boolean;
}

export interface DirectoryUserOption {
  id: string;
  username: string;
  profile?: {
    fullName?: string | null;
    avatarUrl?: string | null;
  } | null;
  roles?: string[];
}

export interface CatalogOption {
  id: string;
  kind: CatalogKind;
  name: string;
}

function toRemotePage<T>(result: ApiPage<T> | T[], request: RemoteOptionsRequest): RemoteOptionsPage<T> {
  if (Array.isArray(result)) {
    return { items: result, page: request.page, hasMore: result.length === request.limit };
  }
  const page = result.page ?? request.page;
  const hasMore = result.hasMore
    ?? (result.pages !== undefined
      ? page < result.pages
      : result.total !== undefined
        ? page * (result.limit ?? request.limit) < result.total
        : result.items.length === request.limit);
  return { items: result.items, page, total: result.total, hasMore };
}

export function createUserDirectoryLoader(role?: DirectoryRole): RemoteOptionsLoader<DirectoryUserOption> {
  return async (request) => {
    const query = new URLSearchParams({
      q: request.query,
      page: String(request.page),
      limit: String(request.limit),
    });
    if (role) query.set('role', role);
    const result = await api.get<ApiPage<DirectoryUserOption> | DirectoryUserOption[]>(
      `/users/directory/search?${query.toString()}`,
    );
    return toRemotePage(result, request);
  };
}

export function createCatalogLoader(kind: CatalogKind): RemoteOptionsLoader<CatalogOption> {
  return async (request) => {
    const query = new URLSearchParams({
      q: request.query,
      page: String(request.page),
      limit: String(request.limit),
    });
    const result = await api.get<ApiPage<CatalogOption> | CatalogOption[]>(
      `/catalogs/${encodeURIComponent(kind)}?${query.toString()}`,
    );
    return toRemotePage(result, request);
  };
}

type DirectorySingleProps = Omit<
  RemoteComboboxProps<DirectoryUserOption>,
  'loadOptions' | 'getOptionKey' | 'getOptionLabel' | 'getOptionDescription'
> & {
  role?: DirectoryRole;
};

export function UserDirectoryCombobox({ role, requestKey, ...props }: DirectorySingleProps) {
  const loader = useMemo(() => createUserDirectoryLoader(role), [role]);
  return (
    <RemoteCombobox
      minQueryLength={2}
      {...props}
      requestKey={`directory:${role ?? 'ALL'}:${requestKey ?? ''}`}
      loadOptions={loader}
      getOptionKey={(option) => option.id}
      getOptionLabel={(option) => option.profile?.fullName?.trim() || option.username}
      getOptionDescription={(option) => `@${option.username}${option.roles?.length ? ` · ${option.roles.join(', ')}` : ''}`}
    />
  );
}

type DirectoryMultiProps = Omit<
  RemoteMultiComboboxProps<DirectoryUserOption>,
  'loadOptions' | 'getOptionKey' | 'getOptionLabel' | 'getOptionDescription'
> & {
  role?: DirectoryRole;
};

export function UserDirectoryMultiCombobox({ role, requestKey, ...props }: DirectoryMultiProps) {
  const loader = useMemo(() => createUserDirectoryLoader(role), [role]);
  return (
    <RemoteMultiCombobox
      minQueryLength={2}
      {...props}
      requestKey={`directory:${role ?? 'ALL'}:${requestKey ?? ''}`}
      loadOptions={loader}
      getOptionKey={(option) => option.id}
      getOptionLabel={(option) => option.profile?.fullName?.trim() || option.username}
      getOptionDescription={(option) => `@${option.username}${option.roles?.length ? ` · ${option.roles.join(', ')}` : ''}`}
    />
  );
}

type CatalogSingleProps = Omit<
  RemoteComboboxProps<CatalogOption>,
  'loadOptions' | 'getOptionKey' | 'getOptionLabel'
> & {
  kind: CatalogKind;
};

export function CatalogCombobox({ kind, requestKey, ...props }: CatalogSingleProps) {
  const loader = useMemo(() => createCatalogLoader(kind), [kind]);
  return (
    <RemoteCombobox
      {...props}
      requestKey={`catalog:${kind}:${requestKey ?? ''}`}
      loadOptions={loader}
      getOptionKey={(option) => option.id}
      getOptionLabel={(option) => option.name}
    />
  );
}

type CatalogMultiProps = Omit<
  RemoteMultiComboboxProps<CatalogOption>,
  'loadOptions' | 'getOptionKey' | 'getOptionLabel'
> & {
  kind: CatalogKind;
};

export function CatalogMultiCombobox({ kind, requestKey, ...props }: CatalogMultiProps) {
  const loader = useMemo(() => createCatalogLoader(kind), [kind]);
  return (
    <RemoteMultiCombobox
      {...props}
      requestKey={`catalog:${kind}:${requestKey ?? ''}`}
      loadOptions={loader}
      getOptionKey={(option) => option.id}
      getOptionLabel={(option) => option.name}
    />
  );
}
