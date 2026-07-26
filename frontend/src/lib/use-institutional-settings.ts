'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  type InstitutionalSettings,
  withInstitutionalDefaults,
} from '@/lib/institution';

export const institutionalSettingsQueryKey = ['institution', 'public'] as const;

export function useInstitutionalSettings() {
  const query = useQuery({
    queryKey: institutionalSettingsQueryKey,
    queryFn: () => api.get<InstitutionalSettings>('/institution/public'),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    settings: withInstitutionalDefaults(query.data),
  };
}
