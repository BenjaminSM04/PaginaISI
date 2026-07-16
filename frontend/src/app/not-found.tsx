import Link from 'next/link';
import { Compass } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="grid-bg flex h-24 w-24 items-center justify-center rounded-2xl border border-border">
        <Compass className="h-10 w-10 text-accent" />
      </div>
      <h1 className="font-serif-heading text-4xl font-bold text-primary">404</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Esta página no existe o el contenido aún no fue aprobado para publicación.
      </p>
      <Link href="/" className={buttonVariants()}>Volver al inicio</Link>
    </div>
  );
}
