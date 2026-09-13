'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function ProfileError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <section role="alert" className="container space-y-4 py-12 text-center">
      <h1 className="font-serif-heading text-2xl font-bold text-primary">No pudimos cargar el perfil</h1>
      <p>El servicio no está disponible en este momento. Intenta nuevamente.</p>
      <Button onClick={() => { router.refresh(); reset(); }}>Reintentar</Button>
    </section>
  );
}
