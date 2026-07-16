'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setAccessToken, setSessionExpiredHandler } from './api';
import type { Me } from './types';

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { email: string; username: string; fullName: string; password: string; semester?: number }) => Promise<{ emailVerificationPreviewUrl?: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => ({}),
  logout: async () => {},
  refreshMe: async () => {},
  hasRole: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await api.refresh();
      if (ok && mounted) {
        try {
          const me = await api.get<Me>('/auth/me');
          if (mounted) {
            setUser(me);
            void queryClient.invalidateQueries();
          }
        } catch {}
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [queryClient]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await api.post<{ user: Me; accessToken: string }>('/auth/login', { identifier, password });
    setAccessToken(data.accessToken);
    queryClient.clear();
    setUser(data.user);
  }, [queryClient]);

  const register = useCallback(async (payload: { email: string; username: string; fullName: string; password: string; semester?: number }) => {
    const data = await api.post<{ user: Me; accessToken: string; emailVerificationPreviewUrl?: string }>('/auth/register', payload);
    setAccessToken(data.accessToken);
    queryClient.clear();
    setUser(data.user);
    return { emailVerificationPreviewUrl: data.emailVerificationPreviewUrl };
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // La sesión local siempre se cierra, incluso si el servidor ya la expiró.
    } finally {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.get<Me>('/auth/me');
      setUser(me);
    } catch {}
  }, []);

  const hasRole = useCallback(
    (...roles: string[]) => !!user && roles.some((r) => user.roles?.includes(r)),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshMe, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
