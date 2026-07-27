import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  Clock3,
  Eye,
  Lightbulb,
  MapPin,
  Monitor,
  ThumbsUp,
  Users,
  Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { CoverPlaceholder, TagList } from '@/components/shared';
import { cn, EVENT_CATEGORIES, NEWS_CATEGORIES, PROJECT_STAGES, formatDate, timeAgo, DIFFICULTY_LABELS } from '@/lib/utils';
import type { Article, Community, EventItem, IdeaProposal, Mentorship, News, Project, Question } from '@/lib/types';
import { PointReward } from '@/components/point-reward';

export function ProjectCard({ project }: { project: Project | any }) {
  return (
    <Link
      href={`/proyectos/${project.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative h-40 overflow-hidden border-b border-border bg-secondary">
        {project.coverUrl ? (
          <img src={project.coverUrl} alt={project.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <CoverPlaceholder label={project.title?.[0]} accent={project.community?.accentColor} />
        )}
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-white/20 bg-primary/90 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
          <ThumbsUp className="h-3 w-3 text-cyan-300" /> {project.likesCount ?? 0}
        </div>
        {project.isFeatured && (
          <div className="absolute left-3 top-3 rounded-md bg-gold px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-black/80">
            Destacado
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(project.technologies ?? []).slice(0, 3).map((t: any) => (
              <Badge key={t.name ?? t} variant="accent">{t.name ?? t}</Badge>
            ))}
            <Badge variant="secondary">{PROJECT_STAGES[project.stage] ?? project.stage}</Badge>
          </div>
          <h3 className="font-serif-heading text-base font-bold leading-snug text-primary transition group-hover:text-accent line-clamp-2">
            {project.title}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2">{project.summary}</p>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 truncate">
            <Avatar src={project.owner?.profile?.avatarUrl} name={project.owner?.profile?.fullName} className="h-5 w-5 text-[8px]" />
            {project.owner?.profile?.fullName ?? 'Equipo de Ingeniería de Sistemas'}
          </span>
          <span className="flex shrink-0 items-center gap-1"><Eye className="h-3.5 w-3.5" /> {project.viewsCount ?? 0}</span>
        </div>
      </div>
    </Link>
  );
}

export function NewsCard({ news }: { news: News }) {
  return (
    <Link
      href={`/noticias/${news.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative h-40 overflow-hidden border-b border-border bg-secondary">
        {news.coverUrl ? (
          <img src={news.coverUrl} alt={news.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <CoverPlaceholder label={news.title?.[0]} />
        )}
        <div className="absolute right-3 top-3 rounded-md bg-gold px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-black/80">
          {NEWS_CATEGORIES[news.category] ?? news.category}
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div>
          <h3 className="font-serif-heading text-base font-bold leading-snug text-primary transition group-hover:text-accent line-clamp-2">
            {news.title}
          </h3>
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{news.summary}</p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="truncate" title={news.project?.title ?? news.community?.name ?? news.author?.profile?.fullName ?? undefined}>
            {news.project?.title ?? news.community?.name ?? news.author?.profile?.fullName ?? 'Redacción de Ingeniería de Sistemas'}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {news.likesCount ?? 0}</span>
            <span>{formatDate(news.publishedAt)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function EventCard({ event, registered }: { event: EventItem; registered?: boolean }) {
  const isPast = event.isPast ?? false;
  return (
    <Link
      href={`/eventos/${event.slug}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg',
        isPast && 'opacity-75',
      )}
    >
      <div className="relative h-36 overflow-hidden border-b border-border bg-secondary">
        {event.coverUrl ? (
          <img src={event.coverUrl} alt={event.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <CoverPlaceholder label={event.category?.[0]} accent={event.community?.accentColor} />
        )}
        <div className="absolute left-3 top-3 rounded-md bg-primary px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
          {EVENT_CATEGORIES[event.category] ?? event.category}
        </div>
        {registered && (
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white">
            <CheckCircle2 className="h-3 w-3" /> Inscrito
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-1 text-xs font-bold text-accent">
            <Calendar className="h-3.5 w-3.5" /> {formatDate(event.startsAt, true)}
          </div>
          <h3 className="mt-1 font-serif-heading text-base font-bold leading-snug text-primary transition group-hover:text-accent line-clamp-2">
            {event.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{event.description}</p>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
          <span className="flex items-center gap-1 truncate text-muted-foreground">
            {event.isOnline ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
            {event.isOnline ? 'En línea' : event.location ?? 'Campus'}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
            <Users className="h-3.5 w-3.5" /> {event._count?.registrations ?? 0} inscritos
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CommunityCard({ community }: { community: Community }) {
  const accent = community.accentColor ?? '#06B6D4';
  return (
    <Link
      href={`/comunidades/${community.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative h-28 overflow-hidden border-b border-border">
        {community.coverUrl ? (
          <img src={community.coverUrl} alt={community.name} className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder label={community.name?.[0]} accent={accent} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <h3 className="absolute bottom-3 left-4 right-4 font-serif-heading text-base font-bold leading-tight text-white">
          {community.name}
        </h3>
        <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <p className="text-xs text-muted-foreground line-clamp-2">{community.description}</p>
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-primary">
            <Users className="h-3.5 w-3.5" /> {community._count?.members ?? 0} miembros
          </span>
          <Badge variant="secondary"><PointReward reason="UNIRSE_COMUNIDAD" suffix="pts al unirte" /></Badge>
        </div>
      </div>
    </Link>
  );
}

export function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href={`/articulos/${article.slug}`}
      className="group flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{article.area}</Badge>
          {article.doi && <Badge variant="secondary" className="font-mono text-[10px]">DOI</Badge>}
        </div>
        <h3 className="font-serif-heading text-base font-bold leading-snug text-primary transition group-hover:text-accent line-clamp-2">
          {article.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-3">{article.abstract}</p>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="truncate">
          {(article.authors ?? [])
            .map((a) => a.user?.profile?.fullName ?? a.externalName)
            .filter(Boolean)
            .slice(0, 2)
            .join(', ') || article.owner?.profile?.fullName}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {article.likesCount}</span>
          <span>{formatDate(article.publishedAt)}</span>
        </span>
      </div>
    </Link>
  );
}

export function QuestionCard({ question }: { question: Question }) {
  const solved = !!question.acceptedAnswerId;
  return (
    <Link
      href={`/foro/${question.id}`}
      className="group flex gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex w-14 shrink-0 flex-col items-center gap-2 text-center">
        <div className={cn('w-full rounded-lg border py-1.5', question.votesScore > 0 ? 'border-accent/40 bg-accent/10' : 'border-border bg-secondary/50')}>
          <div className="text-sm font-bold">{question.votesScore}</div>
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">votos</div>
        </div>
        <div className={cn('w-full rounded-lg border py-1.5', solved ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-border bg-secondary/50')}>
          <div className="text-sm font-bold">{question.answersCount}</div>
          <div className="text-[9px] uppercase tracking-wide opacity-80">resp.</div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug transition group-hover:text-primary line-clamp-2">{question.title}</h3>
          {solved && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <TagList tags={question.tags} max={4} />
          {question.subject && <Badge variant="outline" className="text-[10px]">{question.subject}</Badge>}
        </div>
        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Avatar src={question.author?.profile?.avatarUrl} name={question.author?.profile?.fullName} className="h-5 w-5 text-[8px]" />
            {question.author?.profile?.fullName} · {timeAgo(question.createdAt)}
          </span>
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {question.viewsCount}</span>
        </div>
      </div>
    </Link>
  );
}

export function MentorshipCard({ mentorship, enrolled }: { mentorship: Mentorship; enrolled?: boolean }) {
  const isEnrolled = enrolled ?? mentorship.enrolled;
  const modality = mentorship.modality ?? 'ONLINE';
  const modalityLabel = modality === 'IN_PERSON' ? 'Presencial' : modality === 'HYBRID' ? 'Híbrida' : 'En línea';
  const statusLabel = mentorship.status === 'IN_PROGRESS'
    ? 'En curso'
    : mentorship.status === 'COMPLETED'
      ? 'Finalizada'
      : mentorship.status === 'INACTIVE'
        ? 'Inactiva'
        : 'Próxima';
  const statusClass = mentorship.status === 'IN_PROGRESS'
    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : mentorship.status === 'COMPLETED' || mentorship.status === 'INACTIVE'
      ? 'border-border bg-secondary text-muted-foreground'
      : 'border-cyan-500/30 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400';

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/mentorias/${mentorship.slug}`} className="relative block h-44 overflow-hidden border-b border-border bg-secondary">
        {mentorship.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mentorship.coverUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <CoverPlaceholder label={mentorship.title[0]} accent={mentorship.community?.accentColor ?? '#14b8a6'} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
        <span className={cn('absolute left-3 top-3 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur', statusClass)}>
          {statusLabel}
        </span>
        {isEnrolled && (
          <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-emerald-300/40 bg-emerald-950/80 px-2 py-1 text-[10px] font-bold text-emerald-200 backdrop-blur">
            <CheckCircle2 className="h-3.5 w-3.5" /> Inscrito
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="accent">{mentorship.area}</Badge>
          <Badge variant={mentorship.difficulty === 'AVANZADO' ? 'gold' : 'secondary'}>
            {DIFFICULTY_LABELS[mentorship.difficulty] ?? mentorship.difficulty}
          </Badge>
          <Badge variant="outline">{modalityLabel}</Badge>
        </div>
        <Link href={`/mentorias/${mentorship.slug}`} className="font-serif-heading text-lg font-bold leading-snug text-primary transition hover:text-accent">
          {mentorship.title}
        </Link>
        <p className="text-xs text-muted-foreground line-clamp-2">{mentorship.description}</p>
        <div className="mt-auto space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-accent" /> {formatDate(mentorship.startsAt, true)}
          </span>
          <span className="flex items-center gap-1.5">
            {modality === 'ONLINE' ? <Monitor className="h-4 w-4 text-accent" /> : <MapPin className="h-4 w-4 text-accent" />}
            {modality === 'ONLINE' ? 'Sesión virtual' : mentorship.location ?? modalityLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-accent" />
            {mentorship._count?.enrollments ?? 0}{mentorship.capacity ? ` / ${mentorship.capacity}` : ''} participantes
          </span>
        </div>
        <Link href={`/mentorias/${mentorship.slug}`} className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90">
          Ver detalles y acciones
        </Link>
      </div>
    </article>
  );
}

export function IdeaCard({ idea }: { idea: IdeaProposal }) {
  const cover = idea.media?.find((asset) => asset.mime?.startsWith('image/'));
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/incubadora/ideas/${idea.id}`} className="relative block h-36 overflow-hidden border-b border-border bg-purple-500/10">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <CoverPlaceholder label={idea.title[0]} accent="#a855f7" />
        )}
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-md border border-purple-300/30 bg-purple-950/75 px-2 py-1 text-[10px] font-bold text-purple-100 backdrop-blur">
          <Lightbulb className="h-3.5 w-3.5" /> Idea aprobada
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {idea.technologies.slice(0, 4).map((technology) => <Badge key={technology} variant="secondary">{technology}</Badge>)}
        </div>
        <Link href={`/incubadora/ideas/${idea.id}`} className="font-serif-heading text-lg font-bold leading-snug text-primary transition hover:text-purple-500">
          {idea.title}
        </Link>
        <p className="text-xs text-muted-foreground line-clamp-3">{idea.description}</p>
        <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <Users className="h-4 w-4 text-purple-500" />
            {idea.owner?.profile?.fullName ?? idea.owner?.username ?? 'Equipo de Ingeniería de Sistemas'}
          </span>
          <span className="flex shrink-0 items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {formatDate(idea.decidedAt ?? idea.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}
