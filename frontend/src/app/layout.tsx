import type { Metadata, Viewport } from 'next';
import './globals.css';
import { themeCss, DEFAULT_THEME } from '@/lib/theme';
import { serverGet } from '@/lib/server-api';
import { DEFAULT_INSTITUTIONAL_SETTINGS, withInstitutionalDefaults, type InstitutionalSettings } from '@/lib/institution';
import { Providers } from '@/lib/providers';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
// Regenerate build-time fallback metadata/theme once the runtime API is available.
export const revalidate = 60;
const siteTitle = 'Ingeniería de Sistemas · Universidad Privada del Valle';
const siteDescription =
  'Portal académico de la Carrera de Ingeniería de Sistemas de la Universidad Privada del Valle: proyectos, artículos científicos, comunidades, eventos, foro y ranking estudiantil.';

const baseMetadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: 'Portal de Ingeniería de Sistemas · Univalle',
  title: {
    default: siteTitle,
    template: '%s · Univalle',
  },
  description: siteDescription,
  manifest: '/manifest.webmanifest',
  keywords: [
    'Univalle',
    'Universidad Privada del Valle',
    'Ingeniería de Sistemas',
    'portal académico',
    'proyectos estudiantiles',
    'incubadora',
  ],
  authors: [{ name: 'Carrera de Ingeniería de Sistemas · Univalle' }],
  creator: 'Carrera de Ingeniería de Sistemas · Univalle',
  publisher: 'Universidad Privada del Valle',
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    locale: 'es_BO',
    url: '/',
    siteName: 'Portal de Ingeniería de Sistemas · Univalle',
    title: siteTitle,
    description: siteDescription,
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: siteTitle }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/opengraph-image.png'],
  },
  category: 'education',
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = withInstitutionalDefaults(await serverGet<InstitutionalSettings>('/institution/public', DEFAULT_INSTITUTIONAL_SETTINGS));
  const title = `${settings.careerName} · ${settings.institutionName}`;
  return {
    ...baseMetadata,
    applicationName: `${settings.careerName} · ${settings.shortName}`,
    title: { default: title, template: `%s · ${settings.shortName}` },
    publisher: settings.institutionName,
    icons: settings.faviconUrl ? { icon: settings.faviconUrl, shortcut: settings.faviconUrl, apple: settings.faviconUrl } : baseMetadata.icons,
    openGraph: { ...baseMetadata.openGraph, title, siteName: settings.shortName },
    twitter: { ...baseMetadata.twitter, title },
  };
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: DEFAULT_THEME.light.primary,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const institution = withInstitutionalDefaults(await serverGet<InstitutionalSettings>('/institution/public', DEFAULT_INSTITUTIONAL_SETTINGS));
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col overflow-x-hidden">
        <style data-institution-defaults>{themeCss(institution.theme)}</style>
        <Providers institution={institution}>
          <Navbar />
          <main className="min-w-0 flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
