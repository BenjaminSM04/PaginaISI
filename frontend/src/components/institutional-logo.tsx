'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import { DEFAULT_INSTITUTIONAL_SETTINGS } from '@/lib/institution';
import { cn } from '@/lib/utils';
import { useInstitutionalSettings } from '@/lib/use-institutional-settings';

const LOCAL_INSTITUTIONAL_LOGO = DEFAULT_INSTITUTIONAL_SETTINGS.institutionalLogoUrl;

interface InstitutionalLogoProps {
  kind?: 'institutional' | 'career';
  className?: string;
  fallbackToInstitutional?: boolean;
}

export function InstitutionalText({
  field,
  className,
  compact = false,
}: {
  field: 'institutionName' | 'shortName' | 'careerName';
  className?: string;
  compact?: boolean;
}) {
  const { settings } = useInstitutionalSettings();
  const value = compact && field === 'careerName'
    ? settings[field].replace(/^Carrera\s+de\s+/i, '')
    : settings[field];
  return <span className={className}>{value}</span>;
}

export function InstitutionalLogo({
  kind = 'institutional',
  className,
  fallbackToInstitutional = false,
}: InstitutionalLogoProps) {
  const { settings } = useInstitutionalSettings();
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const { resolvedTheme } = useTheme();
  const configuredUrl = kind === 'career' ? settings.careerLogoUrl : settings.institutionalLogoUrl;
  const darkUrl = kind === 'career' ? settings.careerLogoDarkUrl : settings.institutionalLogoDarkUrl;
  const candidates = [
    ...(resolvedTheme === 'dark' ? [darkUrl] : []),
    configuredUrl,
    ...(kind === 'institutional' || fallbackToInstitutional
      ? [settings.institutionalLogoUrl, LOCAL_INSTITUTIONAL_LOGO]
      : []),
  ].filter((candidate, index, values): candidate is string =>
    Boolean(candidate) && values.indexOf(candidate) === index,
  );
  const url = candidates.find((candidate) => !failedUrls.includes(candidate)) ?? null;

  if (!url) return null;

  return (
    // Los logos configurables pueden vivir en el almacenamiento local, S3 o el dominio institucional.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={kind === 'career' && configuredUrl ? `Logo de ${settings.careerName}` : `Logo de ${settings.institutionName}`}
      className={cn('block h-auto w-auto shrink-0', className)}
      style={{ maxHeight: settings.logoMaxHeight, maxWidth: `min(${settings.logoMaxWidth}px, 30vw)`, objectFit: settings.logoObjectFit }}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrls((current) => current.includes(url) ? current : [...current, url])}
    />
  );
}
