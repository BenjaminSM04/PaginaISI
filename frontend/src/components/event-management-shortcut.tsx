'use client';

import Link from 'next/link';
import { CalendarCog, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function EventManagementShortcut() {
  const { user } = useAuth();
  if (!user?.roles.some((role) => ['ADMIN', 'COMMUNITY_LEADER', 'TEACHER'].includes(role))) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/eventos/gestionar" className={cn(buttonVariants({ variant: 'outline' }))}>
        <CalendarCog aria-hidden="true" /> Gestionar eventos
      </Link>
      <Link href="/eventos/nuevo" className={cn(buttonVariants({ variant: 'accent' }))}>
        <Plus aria-hidden="true" /> Nuevo evento
      </Link>
    </div>
  );
}
