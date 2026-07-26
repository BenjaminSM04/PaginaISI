import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { InstitutionalApplication } from '@/lib/types';

export function isInternalApplicationUrl(url: string) {
  return url.startsWith('/')
    && !url.startsWith('//')
    && !url.includes('\\')
    && !/%(?:2f|5c)/i.test(url)
    && !/[\u0000-\u001f\u007f]/.test(url);
}

type ApplicationLinkProps = Pick<InstitutionalApplication, 'url' | 'openInNewTab'> & {
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: ComponentProps<'a'>['onClick'];
};

export function ApplicationLink({
  url,
  openInNewTab,
  children,
  className,
  title,
  onClick,
}: ApplicationLinkProps) {
  const target = openInNewTab ? '_blank' : undefined;
  const rel = openInNewTab || !isInternalApplicationUrl(url) ? 'noopener noreferrer' : undefined;

  if (isInternalApplicationUrl(url)) {
    return (
      <Link href={url} target={target} rel={rel} className={className} title={title} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <a href={url} target={target} rel={rel} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  );
}
