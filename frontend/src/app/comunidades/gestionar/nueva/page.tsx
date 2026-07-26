import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { CommunityForm } from '@/components/community-form';

export default function NewCommunityPage() {
  return (
    <RequireAuth roles={['ADMIN']}>
      <div className="container max-w-5xl space-y-8 py-10">
        <div>
          <Link href="/comunidades/gestionar" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Volver a gestión</Link>
          <span className="section-kicker block">Administración</span>
          <h1 className="mt-1 flex items-center gap-2 font-serif-heading text-3xl font-bold text-primary"><Plus /> Nueva comunidad</h1>
        </div>
        <CommunityForm />
      </div>
    </RequireAuth>
  );
}
