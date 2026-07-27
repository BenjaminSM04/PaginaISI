import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Incubadora de proyectos' };

export default function IncubatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
