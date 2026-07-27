'use client';

import { Lightbulb } from 'lucide-react';
import { BackButton } from '@/components/back-button';
import { IdeaForm } from '@/components/idea-form';
import { RequireAuth } from '@/components/require-auth';

function PostularIdeaContent() {
  return (
    <div className="container max-w-5xl space-y-7 py-10">
      <BackButton fallbackHref="/incubadora" label="Volver a incubadora" variant="ghost" />
      <header>
        <span className="section-kicker">Incubadora de Ingeniería de Sistemas</span>
        <h1 className="mt-1 flex items-center gap-3 font-serif-heading text-3xl font-bold text-primary">
          <Lightbulb className="h-8 w-8 text-purple-500" /> Postular idea
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Presenta una necesidad y una solución concreta. La propuesta quedará pendiente hasta que un docente o administrador la revise.
        </p>
      </header>
      <IdeaForm />
    </div>
  );
}

export default function PostularIdeaPage() {
  return (
    <RequireAuth>
      <PostularIdeaContent />
    </RequireAuth>
  );
}
