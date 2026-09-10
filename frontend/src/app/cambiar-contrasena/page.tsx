'use client';

import Link from 'next/link';
import { RequireAuth } from '@/components/require-auth';

export default function ChangePasswordPage() {
  // The mandatory form is owned by PasswordChangeGate, including direct navigation.
  return <RequireAuth><div className="container py-12"><p>Tu contraseña está actualizada.</p><Link href="/cuenta?tab=seguridad" className="text-primary underline">Ir a la seguridad de tu cuenta</Link></div></RequireAuth>;
}
