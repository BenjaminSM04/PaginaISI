import type { AnchorHTMLAttributes, ReactNode } from 'react';

function isDemoPlaceholder(href: string) {
  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const firstPathSegment = path.split('/').filter(Boolean)[0] ?? '';
    return (
      host === 'example.com'
      || host.endsWith('.example.com')
      || (host === 'github.com' && (path.startsWith('/isi-demo/') || firstPathSegment.endsWith('-demo')))
      || ((host === 'teams.microsoft.com' || host === 'chat.whatsapp.com') && path.includes('demo'))
    );
  } catch {
    return true;
  }
}

interface ExternalResourceLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> {
  href: string;
  children: ReactNode;
}

/** Evita abrir enlaces ilustrativos del seed que intencionalmente no existen. */
export function ExternalResourceLink({ href, children, className, 'aria-label': ariaLabel, ...props }: ExternalResourceLinkProps) {
  if (isDemoPlaceholder(href)) {
    return null;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} className={className} {...props}>
      {children}
    </a>
  );
}
