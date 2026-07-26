import { notFound } from 'next/navigation';
import type { Project } from '@/lib/types';
import { serverGet } from '@/lib/server-api';
import { ProjectDetailView } from '@/components/project-detail-view';
import { BackButton } from '@/components/back-button';

export const revalidate = 30;

export default async function ProyectoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await serverGet<Project | null>(`/projects/${slug}`, null, 15);
  if (!project) notFound();

  return (
    <div className="container max-w-6xl space-y-8 py-10">
      <BackButton fallbackHref="/proyectos" label="Volver a proyectos" />
      <ProjectDetailView project={project} />
    </div>
  );
}
