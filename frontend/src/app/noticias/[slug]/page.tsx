import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarDays, FolderKanban, Tag, Users } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { News } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CoverPlaceholder } from '@/components/shared';
import { LikeButton } from '@/components/actions';
import { formatDate, NEWS_CATEGORIES } from '@/lib/utils';
import { BackButton } from '@/components/back-button';

export const revalidate = 120;

export default async function NoticiaDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const news = await serverGet<News | null>(`/news/${slug}`, null);
  if (!news) notFound();

  return (
    <article className="container max-w-4xl space-y-8 py-10">
      <BackButton fallbackHref="/noticias" label="Volver a noticias" variant="ghost" />

      <header className="space-y-4">
        <Badge variant="gold">{NEWS_CATEGORIES[news.category] ?? news.category}</Badge>
        <h1 className="font-serif-heading text-3xl font-bold leading-tight text-primary sm:text-4xl">{news.title}</h1>
        <p className="text-lg text-muted-foreground">{news.summary}</p>
        <div className="flex flex-wrap items-center gap-4 border-y border-border py-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Avatar src={news.author?.profile?.avatarUrl} name={news.author?.profile?.fullName} className="h-7 w-7" />
            {news.author?.profile?.fullName ?? 'Redacción de Ingeniería de Sistemas'}
          </span>
          <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {formatDate(news.publishedAt)}</span>
          <LikeButton
            type="news"
            id={news.id}
            initialLiked={news.likedByMe}
            initialCount={news.likesCount ?? 0}
            ownerUsername={news.author?.username}
          />
        </div>
      </header>

      {(news.project || news.community || news.event) && (
        <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Contenido relacionado">
          {news.project && (
            <Link
              href={`/proyectos/${news.project.slug}`}
              className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/50"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <FolderKanban className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Proyecto asociado</span>
                  <span className="block truncate text-sm font-bold text-primary">{news.project.title}</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-1" />
            </Link>
          )}
          {news.community && (
            <Link
              href={`/comunidades/${news.community.slug}`}
              className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/50"
            >
              <span className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary"
                  style={{ color: news.community.accentColor ?? undefined }}
                >
                  <Users className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Comunidad asociada</span>
                  <span className="text-sm font-bold text-primary">{news.community.name}</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          )}
          {news.event && (
            <Link
              href={`/eventos/${news.event.slug}`}
              className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/50"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-accent">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Evento relacionado</span>
                  <span className="line-clamp-1 text-sm font-bold text-primary">{news.event.title}</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-1" />
            </Link>
          )}
        </aside>
      )}

      <div className="overflow-hidden rounded-2xl border border-border">
        {news.coverUrl ? (
          <img src={news.coverUrl} alt={news.title} className="max-h-[420px] w-full object-cover" />
        ) : (
          <div className="h-56">
            <CoverPlaceholder label={news.title[0]} />
          </div>
        )}
      </div>

      <div className="prose-sm max-w-none space-y-4 text-[15px] leading-relaxed text-foreground/90">
        {(news.content ?? '').split('\n').filter(Boolean).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {news.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Tag className="h-4 w-4 text-muted-foreground" />
          {news.tags.map((t) => (
            <Badge key={t} variant="secondary" className="font-mono lowercase">#{t}</Badge>
          ))}
        </div>
      )}
    </article>
  );
}
