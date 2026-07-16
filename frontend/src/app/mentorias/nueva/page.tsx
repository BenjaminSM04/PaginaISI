'use client';

import { MentorshipForm } from '@/components/mentorship-form';
import { RequireAuth } from '@/components/require-auth';

function NuevaMentoriaContent() {
  return (
    <div className="container max-w-4xl space-y-8 py-10">
      <div>
        <span className="section-kicker">Formación colaborativa</span>
        <h1 className="mt-1 font-serif-heading text-3xl font-bold text-primary">Crear mentoría</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Publica una mentoría, asigna un docente o mentor externo y enlázala con la comunidad que la organiza.
        </p>
      </div>
      <MentorshipForm mode="create" />
    </div>
  );
}

export default function NuevaMentoriaPage() {
  return (
    <RequireAuth roles={['ADMIN', 'TEACHER', 'COMMUNITY_LEADER']}>
      <NuevaMentoriaContent />
    </RequireAuth>
  );
}
