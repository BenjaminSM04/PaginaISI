import { cn, initials } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

export function Avatar({ src, name, className }: AvatarProps) {
  if (src) {
    return <img src={src} alt={name ?? 'avatar'} className={cn('h-9 w-9 rounded-full object-cover border border-border', className)} />;
  }
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold',
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
