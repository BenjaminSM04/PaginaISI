'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CommunityManagementShortcut() {
  const { user } = useAuth();
  if (!user?.roles.some((role) => ['ADMIN', 'COMMUNITY_LEADER', 'TEACHER'].includes(role))) return null;
  return (
    <Link href="/comunidades/gestionar" className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}>
      <Settings /> Gestionar comunidades
    </Link>
  );
}
