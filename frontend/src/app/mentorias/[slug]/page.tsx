import { notFound } from 'next/navigation';
import { serverGet } from '@/lib/server-api';
import type { Mentorship } from '@/lib/types';
import { BackButton } from '@/components/back-button';
import { MentorshipDetail } from '@/components/mentorship-detail';

export const revalidate = 30;

export default async function MentoriaDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mentorship = await serverGet<Mentorship | null>(`/mentorships/${slug}`, null, 15);
  if (!mentorship) notFound();
  return (
    <div className="container max-w-6xl space-y-8 py-10">
      <BackButton fallbackHref="/mentorias" label="Volver a mentorías" variant="ghost" />
      <MentorshipDetail initial={mentorship} />
    </div>
  );
}
