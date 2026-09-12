'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, ReactNode } from 'react';
import { PasswordChangeGate } from '@/components/password-change-gate';
import { EmailVerificationGate } from '@/components/email-verification-gate';
import { AuthProvider } from './auth-context';
import { InstitutionalTheme } from '@/components/institutional-theme';
import { InstitutionalSettings } from './institution';
import { institutionalSettingsQueryKey } from './use-institutional-settings';

export function Providers({ children, institution }: { children: ReactNode; institution: InstitutionalSettings }) {
  const [queryClient] = useState(
    () => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      });
      client.setQueryData(institutionalSettingsQueryKey, institution);
      return client;
    },
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <InstitutionalTheme />
        <AuthProvider><PasswordChangeGate><EmailVerificationGate>{children}</EmailVerificationGate></PasswordChangeGate></AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
