'use client';

import { useState } from 'react';
import { BookOpen, Calendar, Code2 } from 'lucide-react';
import { ProjectCard, EventCard, NewsCard } from '@/components/cards';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import type { EventItem, News, Project } from '@/lib/types';
import { EmptyState } from '@/components/shared';

const HOME_TABS = [
  { id: 'proyectos' as const, label: 'Proyectos recientes', icon: Code2, panelId: 'home-content-panel' },
  { id: 'eventos' as const, label: 'Próximos eventos', icon: Calendar, panelId: 'home-content-panel' },
  { id: 'noticias' as const, label: 'Noticias destacadas', icon: BookOpen, panelId: 'home-content-panel' },
];

export function HomeTabs({ projects, events, news }: { projects: Project[]; events: EventItem[]; news: News[] }) {
  const [tab, setTab] = useState<'proyectos' | 'eventos' | 'noticias'>('proyectos');
  const hasItems = tab === 'proyectos' ? projects.length > 0 : tab === 'eventos' ? events.length > 0 : news.length > 0;

  return (
    <div className="space-y-6">
      <SegmentedTabs
        items={HOME_TABS}
        value={tab}
        onValueChange={setTab}
        ariaLabel="Contenido destacado del inicio"
        idPrefix="home"
      />
      <div
        id="home-content-panel"
        role="tabpanel"
        aria-labelledby={`home-tab-${tab}`}
        tabIndex={0}
        className="grid animate-fade-in gap-6 focus-visible:outline-none md:grid-cols-3"
        key={tab}
      >
        {!hasItems && (
          <div className="md:col-span-3">
            <EmptyState
              title={tab === 'proyectos' ? 'Aún no hay proyectos destacados' : tab === 'eventos' ? 'No hay eventos próximos' : 'Aún no hay noticias destacadas'}
              subtitle="Vuelve pronto: el contenido aprobado aparecerá aquí automáticamente."
            />
          </div>
        )}
        {tab === 'proyectos' && projects.slice(0, 3).map((p) => <ProjectCard key={p.id} project={p} />)}
        {tab === 'eventos' && events.slice(0, 3).map((e) => <EventCard key={e.id} event={e} />)}
        {tab === 'noticias' && news.slice(0, 3).map((n) => <NewsCard key={n.id} news={n} />)}
      </div>
    </div>
  );
}
