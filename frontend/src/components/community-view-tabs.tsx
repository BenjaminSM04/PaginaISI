'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { FlaskConical, Users } from 'lucide-react';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';

type CommunityView = 'sociedad' | 'comunidades';

const COMMUNITY_TABS = [
  { id: 'sociedad' as const, label: 'Sociedad Científica', icon: FlaskConical, panelId: 'community-panel-sociedad' },
  { id: 'comunidades' as const, label: 'Comunidades', icon: Users, panelId: 'community-panel-comunidades' },
];

export function CommunityViewTabs({
  initialView,
  society,
  communities,
}: {
  initialView: CommunityView;
  society: ReactNode;
  communities: ReactNode;
}) {
  const [view, setView] = useState<CommunityView>(initialView);

  useEffect(() => {
    const syncFromHistory = () => {
      const value = new URLSearchParams(window.location.search).get('vista');
      setView(value === 'comunidades' ? 'comunidades' : 'sociedad');
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);

  function changeView(next: CommunityView) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === 'comunidades') url.searchParams.set('vista', 'comunidades');
    else url.searchParams.delete('vista');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div>
      <nav className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur" aria-label="Secciones de Sociedad Científica">
        <div className="container py-3">
          <SegmentedTabs
            items={COMMUNITY_TABS}
            value={view}
            onValueChange={changeView}
            ariaLabel="Secciones de Sociedad Científica"
            idPrefix="community-view"
          />
        </div>
      </nav>

      <section
        id="community-panel-sociedad"
        role="tabpanel"
        aria-labelledby="community-view-tab-sociedad"
        hidden={view !== 'sociedad'}
      >
        {society}
      </section>
      <section
        id="community-panel-comunidades"
        role="tabpanel"
        aria-labelledby="community-view-tab-comunidades"
        hidden={view !== 'comunidades'}
      >
        {communities}
      </section>
    </div>
  );
}
