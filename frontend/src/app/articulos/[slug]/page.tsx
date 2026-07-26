import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Article } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, TagList } from '@/components/shared';
import { CommentSection, LikeButton, ReportButton } from '@/components/actions';
import { ArticleContentTabs } from '@/components/article-content-tabs';
import { formatDate } from '@/lib/utils';
import { BackButton } from '@/components/back-button';

export const revalidate = 30;

export default async function ArticuloDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await serverGet<Article | null>(`/articles/${slug}`, null, 15);
  if (!article) notFound();

  const authors = (article.authors ?? []).map((a) => ({
    name: a.user?.profile?.fullName ?? a.externalName ?? 'Autor',
    username: a.user?.username,
    avatarUrl: a.user?.profile?.avatarUrl,
  }));

  return (
    <div className="container max-w-5xl space-y-8 py-10">
      <BackButton fallbackHref="/articulos" label="Volver a artículos" variant="ghost" />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">{article.area}</Badge>
              {article.status !== 'APPROVED' && <StatusBadge status={article.status} />}
              {article.doi && <Badge variant="secondary" className="font-mono text-[10px]">DOI: {article.doi}</Badge>}
            </div>
            <h1 className="font-serif-heading text-3xl font-bold leading-tight text-primary">{article.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {authors.map((a) =>
                a.username ? (
                  <Link key={a.name} href={`/perfil/${a.username}`} className="flex items-center gap-1.5 hover:text-primary">
                    <Avatar src={a.avatarUrl} name={a.name} className="h-6 w-6 text-[8px]" /> {a.name}
                  </Link>
                ) : (
                  <span key={a.name} className="flex items-center gap-1.5">
                    <Avatar name={a.name} className="h-6 w-6 text-[8px]" /> {a.name}
                  </span>
                ),
              )}
              <span>· {formatDate(article.publishedAt)}</span>
            </div>
          </header>

          <ArticleContentTabs
            title={article.title}
            abstract={article.abstract}
            content={article.content}
            impact={article.impact}
            pdfUrl={article.pdfUrl}
            externalUrl={article.externalUrl}
          />

          <div className="flex flex-wrap items-center gap-3">
            <LikeButton
              type="articles"
              id={article.id}
              initialLiked={article.likedByMe}
              initialCount={article.likesCount}
              ownerUsername={article.owner?.username}
            />
            <div className="ml-auto">
              <ReportButton targetType="ARTICLE" targetId={article.id} />
            </div>
          </div>

          <CommentSection type="articles" id={article.id} initialComments={article.comments ?? []} />
        </div>

        <aside className="space-y-5">
          <div className="space-y-3 rounded-xl border border-border bg-card p-5 text-sm shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ficha</h3>
            <div><span className="font-semibold">Área:</span> {article.area}</div>
            {article.reviewer && (
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-accent" /> Aprobado por {article.reviewer.profile?.fullName}
              </div>
            )}
            <TagList tags={article.tags} max={8} />
          </div>
        </aside>
      </div>
    </div>
  );
}
