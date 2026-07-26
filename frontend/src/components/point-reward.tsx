'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PointRule } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PointReward({
  reason,
  suffix = 'pts',
  className,
  parentheses = false,
}: {
  reason: string;
  suffix?: string;
  className?: string;
  parentheses?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ['point-rules-public'],
    queryFn: () => api.get<PointRule[]>('/points/rules'),
    staleTime: 5 * 60 * 1000,
  });
  const rule = data?.find((item) => item.reason === reason && item.isActive);
  if (!rule || rule.points === 0) return null;

  const value = `${rule.points > 0 ? '+' : ''}${rule.points} ${suffix}`.trim();
  return (
    <span className={cn('font-semibold', className)} title={rule.label}>
      {parentheses ? `(${value})` : value}
    </span>
  );
}
