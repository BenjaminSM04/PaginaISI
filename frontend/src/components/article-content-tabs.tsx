'use client';

import { useState } from 'react';
import { BookOpenText, Download, ExternalLink, FileText, Lightbulb } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';

type ArticleTab = 'summary' | 'pdf';

interface ArticleContentTabsProps {
  title: string;
  abstract: string;
  content?: string | null;
  impact?: string | null;
  pdfUrl?: string | null;
  externalUrl?: string | null;
}

const TABS = [
  { id: 'summary' as const, label: 'Resumen', icon: BookOpenText, panelId: 'article-content-panel-summary' },
  { id: 'pdf' as const, label: 'Visor de PDF', icon: FileText, panelId: 'article-content-panel-pdf' },
];

function safeWebUrl(value?: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function ArticleContentTabs({
  title,
  abstract,
  content,
  impact,
  pdfUrl,
  externalUrl,
}: ArticleContentTabsProps) {
  const [activeTab, setActiveTab] = useState<ArticleTab>('summary');
  const safePdfUrl = safeWebUrl(pdfUrl);
  const safeExternalUrl = safeWebUrl(externalUrl);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-secondary/20 p-3 sm:p-4">
        <SegmentedTabs
          items={TABS}
          value={activeTab}
          onValueChange={setActiveTab}
          ariaLabel="Contenido del artículo científico"
          idPrefix="article-content"
        />
      </div>

      <div
        id="article-content-panel-summary"
        role="tabpanel"
        aria-labelledby="article-content-tab-summary"
        tabIndex={0}
        hidden={activeTab !== 'summary'}
        className="space-y-6 p-6 focus-visible:outline-none"
      >
        <div>
          <h2 className="flex items-center gap-2 font-serif-heading text-lg font-bold text-primary">
            <FileText className="h-5 w-5" /> Resumen
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{abstract}</p>
          {impact && (
            <div className="mt-4 flex gap-3 rounded-lg border border-gold/30 bg-gold/10 p-4">
              <Lightbulb className="h-5 w-5 shrink-0 text-gold" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-gold">Impacto y aporte</div>
                <p className="mt-1 whitespace-pre-line text-sm">{impact}</p>
              </div>
            </div>
          )}
        </div>

        {content && (
          <div className="border-t border-border pt-5">
            <h2 className="font-serif-heading text-lg font-bold text-primary">Contenido</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/90">
              {content.split('\n').filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </div>
        )}
      </div>

      <div
        id="article-content-panel-pdf"
        role="tabpanel"
        aria-labelledby="article-content-tab-pdf"
        tabIndex={0}
        hidden={activeTab !== 'pdf'}
        className="p-4 focus-visible:outline-none sm:p-6"
      >
        {safePdfUrl ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Si el proveedor bloquea la vista integrada, abre el documento en una pestaña nueva.
              </p>
              <div className="flex flex-wrap gap-2">
                {safeExternalUrl && (
                  <a
                    href={safeExternalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    <ExternalLink /> Publicación externa
                  </a>
                )}
                <a
                  href={safePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <Download /> Abrir PDF
                </a>
              </div>
            </div>
            <iframe
              title={`Visor PDF: ${title}`}
              src={safePdfUrl}
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-same-origin allow-downloads"
              className="h-[70vh] min-h-[480px] w-full rounded-lg border border-border bg-secondary/20"
            />
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-secondary/20 p-8 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="font-serif-heading text-lg font-bold text-primary">PDF no disponible</h2>
              <p className="mt-1 text-sm text-muted-foreground">El documento todavía no fue adjuntado a este artículo.</p>
            </div>
            {safeExternalUrl && (
              <a
                href={safeExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'outline' })}
              >
                <ExternalLink /> Abrir publicación externa
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
