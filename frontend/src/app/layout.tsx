import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: {
    default: 'Ingeniería de Sistemas Informáticos — Portal Académico',
    template: '%s · Portal ISI',
  },
  description:
    'Portal académico gamificado de la carrera de Ingeniería de Sistemas Informáticos: proyectos, artículos científicos, comunidades, eventos, foro Q&A y ranking estudiantil.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
