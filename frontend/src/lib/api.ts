'use client';

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

// Browser requests always use the public origin; the server owns API routing.
const BASE = '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const data = await res.json();
    if (typeof data.accessToken !== 'string' || !data.accessToken) {
      accessToken = null;
      return false;
    }
    accessToken = data.accessToken;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function request<T>(method: string, path: string, body?: unknown, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  if (res.status === 401) {
    const canRefresh = !['/auth/login', '/auth/register', '/auth/refresh', '/auth/two-factor/verify'].includes(path);
    if (!isRetry && canRefresh) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(method, path, body, true);
    }
    if (canRefresh) {
      accessToken = null;
      sessionExpiredHandler?.();
    }
  }

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(', ') : data.message || message;
    } catch {}
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  refresh: tryRefresh,
};
