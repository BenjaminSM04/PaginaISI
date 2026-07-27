import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Foro académico' };

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
