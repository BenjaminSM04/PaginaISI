'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container flex min-h-[55vh] items-center justify-center py-12">
      <section
        role="alert"
        aria-labelledby="global-error-title"
        className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-card p-8 text-center shadow-sm"
      >
        <AlertTriangle aria-hidden="true" className="mx-auto h-10 w-10 text-red-500" />
        <h1 id="global-error-title" className="mt-4 font-serif-heading text-2xl font-bold text-primary">
          No pudimos cargar esta página
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocurrió un problema inesperado. Revisa tu conexión e inténtalo nuevamente.
        </p>
        <Button type="button" onClick={reset} className="mt-6">
          <RefreshCw aria-hidden="true" /> Reintentar
        </Button>
      </section>
    </div>
  );
}
