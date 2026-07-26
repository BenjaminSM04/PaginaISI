'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useInstitutionalSettings } from '@/lib/use-institutional-settings';

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
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const configuredUrl = kind === 'career' ? settings.careerLogoUrl : settings.institutionalLogoUrl;
  const url = configuredUrl || (fallbackToInstitutional ? settings.institutionalLogoUrl : null);

  if (!url || failedUrl === url) return null;

  return (
    // Los logos configurables pueden vivir en el almacenamiento local, S3 o el dominio institucional.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={kind === 'career' && configuredUrl ? `Logo de ${settings.careerName}` : `Logo de ${settings.institutionName}`}
      className={cn('object-contain', className)}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
    />
  );
}
