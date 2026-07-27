import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Portal de Ingeniería de Sistemas · Universidad Privada del Valle',
    short_name: 'Univalle Sistemas',
    description:
      'Proyectos, investigación, comunidades, eventos e Incubadora de la Carrera de Ingeniería de Sistemas de Univalle.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F8FAFC',
    theme_color: '#0B4778',
    orientation: 'any',
    lang: 'es-BO',
    categories: ['education', 'productivity'],
    icons: [
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
