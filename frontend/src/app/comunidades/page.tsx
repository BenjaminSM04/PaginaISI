import type { Metadata } from 'next';
import { serverGet } from '@/lib/server-api';
import type { Community } from '@/lib/types';
import { CommunityCard } from '@/components/cards';
import { EmptyState, SectionHeader } from '@/components/shared';
import { CommunityViewTabs } from '@/components/community-view-tabs';
import { CommunityManagementShortcut } from '@/components/community-management-shortcut';
import SociedadCientificaContent from '../sociedad-cientifica/page';

export const revalidate = 60;
export const metadata: Metadata = { title: 'Sociedad Científica y comunidades' };

type Vista = 'sociedad' | 'comunidades';

export default async function ComunidadesPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const query = await searchParams;
  const vista: Vista = query.vista === 'comunidades' ? 'comunidades' : 'sociedad';

  return (
    <CommunityViewTabs
      initialView={vista}
      society={<SociedadCientificaContent />}
      communities={<CommunitiesDirectory />}
    />
  );
}

async function CommunitiesDirectory() {
  const communities = await serverGet<Community[]>('/communities', []);

  return (
    <div className="container space-y-8 py-10">
      <SectionHeader kicker="Encuentra tu tribu técnica" title="Comunidades de la carrera" />
      <p className="max-w-2xl text-sm text-muted-foreground">
        Cada comunidad tiene un docente asesor, un líder estudiantil y canales oficiales. Unirte suma
        <strong className="text-emerald-500"> +5 puntos</strong> y te conecta con proyectos, eventos y mentorías de esa área.
      </p>
      <CommunityManagementShortcut />
      {communities.length === 0 ? (
        <EmptyState title="Aún no hay comunidades publicadas" />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      )}
    </div>
  );
}
