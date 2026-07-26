'use client';

import Link from 'next/link';
import { Building2, ClipboardCheck, FolderOpen } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function IncubatorPrivateActions({ inverse = false }: { inverse?: boolean }) {
  const { user } = useAuth();
  if (!user) return null;
  const classes = inverse
    ? 'border border-white/25 bg-white/10 text-white hover:bg-white/20'
    : undefined;
  return (
    <>
      <Link href="/incubadora/mis-ideas" className={cn(buttonVariants({ variant: inverse ? 'default' : 'outline' }), classes)}>
        <FolderOpen /> Mis ideas
      </Link>
      {user.roles.some((role) => role === 'TEACHER' || role === 'ADMIN') && (
        <Link href="/incubadora/revision" className={cn(buttonVariants({ variant: inverse ? 'default' : 'outline' }), classes)}>
          <ClipboardCheck /> Revisar ideas
        </Link>
      )}
      {user.roles.includes('ADMIN') && (
        <Link href="/admin/incubadora/clientes" className={cn(buttonVariants({ variant: inverse ? 'default' : 'outline' }), classes)}>
          <Building2 /> Gestionar clientes
        </Link>
      )}
    </>
  );
}
