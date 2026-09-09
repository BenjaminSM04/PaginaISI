import type { MetadataRoute } from 'next';
import { serverGet } from '@/lib/server-api';
import { DEFAULT_INSTITUTIONAL_SETTINGS, withInstitutionalDefaults, type InstitutionalSettings } from '@/lib/institution';
import { resolveTheme } from '@/lib/theme';

export const revalidate = 60;
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const institution = withInstitutionalDefaults(await serverGet<InstitutionalSettings>('/institution/public', DEFAULT_INSTITUTIONAL_SETTINGS));
  const palette = resolveTheme(institution.theme).light;
  return {
    name: `${institution.careerName} · ${institution.institutionName}`,
    short_name: institution.shortName,
    description:
      'Proyectos, investigación, comunidades, eventos e Incubadora de la Carrera de Ingeniería de Sistemas de Univalle.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: palette.background,
    theme_color: palette.primary,
    orientation: 'any',
    lang: 'es-BO',
    categories: ['education', 'productivity'],
    icons: institution.faviconUrl ? [{ src: institution.faviconUrl, purpose: 'any' }] : [
      {
        src: '/icons/univalle-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/univalle-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/univalle-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Proyectos', short_name: 'Proyectos', url: '/proyectos' },
      { name: 'Incubadora', short_name: 'Incubadora', url: '/incubadora' },
      { name: 'Comunidades', short_name: 'Comunidades', url: '/comunidades?vista=comunidades' },
    ],
  };
}
