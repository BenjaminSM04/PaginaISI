import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: {
    default: 'Ingeniería de Sistemas · Universidad Privada del Valle',
    template: '%s · Univalle',
  },
  description:
    'Portal académico de la Carrera de Ingeniería de Sistemas de la Universidad Privada del Valle: proyectos, artículos científicos, comunidades, eventos, foro y ranking estudiantil.',
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
