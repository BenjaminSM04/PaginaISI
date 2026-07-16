import { CalendarPlus } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { EventForm } from '@/components/event-form';

export default function NuevoEventoPage() {
  return (
    <RequireAuth roles={['ADMIN', 'TEACHER', 'COMMUNITY_LEADER']}>
      <div className="container max-w-3xl space-y-8 py-10">
        <div>
          <span className="section-kicker">Organización</span>
          <h1 className="mt-1 flex items-center gap-2 font-serif-heading text-3xl font-bold text-primary"><CalendarPlus /> Crear evento</h1>
          <p className="mt-1 text-sm text-muted-foreground">Publica el cronograma, cupos, comunidad, portada optimizada y enlaces oficiales.</p>
        </div>
        <EventForm />
      </div>
    </RequireAuth>
  );
}
