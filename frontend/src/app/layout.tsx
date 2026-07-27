import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
const siteTitle = 'Ingeniería de Sistemas · Universidad Privada del Valle';
const siteDescription =
  'Portal académico de la Carrera de Ingeniería de Sistemas de la Universidad Privada del Valle: proyectos, artículos científicos, comunidades, eventos, foro y ranking estudiantil.';

export const metadata: Metadata = {
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

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0B4778' },
    { media: '(prefers-color-scheme: dark)', color: '#082F55' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col overflow-x-hidden">
        <Providers>
          <Navbar />
          <main className="min-w-0 flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
