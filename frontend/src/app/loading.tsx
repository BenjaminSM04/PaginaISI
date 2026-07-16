import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div role="status" className="flex min-h-[50vh] items-center justify-center">
      <Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-primary" />
      <span className="sr-only">Cargando contenido</span>
    </div>
  );
}
