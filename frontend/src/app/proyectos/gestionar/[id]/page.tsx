'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { ProjectManagementPanel, type ProjectManagementTab } from '@/components/project-management-panel';

const VALID_TABS = new Set<ProjectManagementTab>(['data', 'calendar', 'news', 'gallery', 'history']);

export default function ProjectManagementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab') as ProjectManagementTab | null;
  const initialTab = requestedTab && VALID_TABS.has(requestedTab) ? requestedTab : 'data';
  return <RequireAuth><ProjectManagementPanel projectId={id} initialTab={initialTab} /></RequireAuth>;
}
