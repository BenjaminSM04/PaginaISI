'use client';

import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { safeInternalPath } from '@/lib/navigation';

export interface BackButtonProps extends Omit<ButtonProps, 'children' | 'onClick'> {
  fallbackHref?: string;
  label?: string;
  replaceFallback?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

function hasSafePreviousDocument() {
  if (typeof window === 'undefined' || window.history.length <= 1 || !document.referrer) return false;
  try {
    const previous = new URL(document.referrer);
    const current = new URL(window.location.href);
    return previous.origin === current.origin && previous.href !== current.href;
  } catch {
    return false;
  }
}

/**
 * Goes back only when the browser exposes a same-origin previous document.
 * Direct visits and external referrers use a validated application fallback.
 */
export function BackButton({
  fallbackHref = '/',
  label = 'Volver',
  replaceFallback = false,
  variant = 'outline',
  type = 'button',
  onClick,
  ...props
}: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      {...props}
      type={type}
      variant={variant}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;

        if (hasSafePreviousDocument()) {
          router.back();
          return;
        }

        let fallback = safeInternalPath(fallbackHref, '/');
        if (typeof window !== 'undefined') {
          const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          if (fallback === current) fallback = '/';
        }
        if (replaceFallback) router.replace(fallback);
        else router.push(fallback);
      }}
    >
      <ArrowLeft aria-hidden="true" />
      {label}
    </Button>
  );
}
