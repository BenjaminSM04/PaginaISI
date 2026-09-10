'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setAccessToken, setSessionExpiredHandler } from './api';
import type { Me } from './types';

export type LoginResult = { requiresTwoFactor: true; challengeToken: string } | { requiresTwoFactor: false; mustChangePassword: boolean };
export interface AuthSession { user: Me; accessToken: string; }

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<Me>;
  acceptSession: (session: AuthSession) => void;
  register: (data: { email: string; username: string; fullName: string; password: string; semester?: number }) => Promise<{ emailVerificationPreviewUrl?: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => ({ requiresTwoFactor: false, mustChangePassword: false }),
  verifyTwoFactor: async () => { throw new Error('Sin proveedor de autenticación'); },
  acceptSession: () => {},
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

  const acceptSession = useCallback((session: AuthSession) => {
    setAccessToken(session.accessToken);
    queryClient.clear();
    setUser(session.user);
  }, [queryClient]);

  const verifyTwoFactor = useCallback(async (challengeToken: string, code: string) => {
    const session = await api.post<AuthSession>('/auth/two-factor/verify', { challengeToken, code });
    acceptSession(session);
    return session.user;
  }, [acceptSession]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await api.post<AuthSession | { requiresTwoFactor: true; challengeToken: string }>('/auth/login', { identifier, password });
    if ('requiresTwoFactor' in data) return data;
    acceptSession(data);
    return { requiresTwoFactor: false as const, mustChangePassword: data.user.mustChangePassword };
  }, [acceptSession]);

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
    <AuthContext.Provider value={{ user, loading, login, verifyTwoFactor, acceptSession, register, logout, refreshMe, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
