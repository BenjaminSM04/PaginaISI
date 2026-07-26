import { Building2 } from 'lucide-react';
import type { IncubatorClient } from '@/lib/types';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-9 w-9 rounded-lg',
  md: 'h-12 w-12 rounded-xl',
  lg: 'h-20 w-20 rounded-2xl',
} as const;

export function IncubatorClientLogo({
  client,
  size = 'md',
  className,
}: {
  client: Pick<IncubatorClient, 'name' | 'logoUrl'>;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden border border-border bg-white text-muted-foreground shadow-sm',
        SIZES[size],
        className,
      )}
    >
      {client.logoUrl ? (
        // Logos come from the configured media storage and may use a remote origin.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={client.logoUrl}
          alt={`Logo de ${client.name}`}
          className="h-full w-full object-contain p-1.5"
          referrerPolicy="no-referrer"
        />
      ) : (
        <Building2 className={cn(size === 'lg' ? 'h-8 w-8' : 'h-5 w-5')} aria-hidden="true" />
      )}
    </span>
  );
}
