import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2, GraduationCap, ListChecks, Users, Video } from 'lucide-react';
import { serverGet } from '@/lib/server-api';
import type { Mentorship } from '@/lib/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EnrollMentorshipButton } from '@/components/actions';
import { DIFFICULTY_LABELS, formatDate } from '@/lib/utils';
import { ExternalResourceLink } from '@/components/external-resource-link';

export const revalidate = 60;

export default async function MentoriaDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mentorship = await serverGet<Mentorship | null>(`/mentorships/${slug}`, null, 30);
  if (!mentorship) notFound();

  return (
    <div className="container max-w-4xl space-y-8 py-10">
      <Link href="/mentorias" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Volver a mentorías
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">{mentorship.area}</Badge>
          <Badge variant={mentorship.difficulty === 'AVANZADO' ? 'gold' : 'secondary'}>
            Nivel: {DIFFICULTY_LABELS[mentorship.difficulty] ?? mentorship.difficulty}
          </Badge>
          {mentorship.community && (
            <Link href={`/comunidades/${mentorship.community.slug}`}>
              <Badge variant="outline">{mentorship.community.name}</Badge>
            </Link>
          )}
        </div>
        <h1 className="font-serif-heading text-3xl font-bold leading-tight text-primary">{mentorship.title}</h1>
        <p className="text-muted-foreground">{mentorship.description}</p>
      </header>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-serif-heading text-lg font-bold text-primary">
              <ListChecks className="h-5 w-5" /> Temario
            </h2>
            <ol className="mt-4 space-y-2.5">
              {mentorship.syllabus.map((item, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 font-serif-heading text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  {item}
                </li>
              ))}
              {mentorship.syllabus.length === 0 && <p className="text-sm text-muted-foreground">El temario se publicará pronto.</p>}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <EnrollMentorshipButton slug={mentorship.slug} />
            <div className="space-y-2.5 border-t border-border pt-4 text-sm">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-accent" />
                {mentorship.mentor?.profile?.fullName ?? mentorship.mentorName ?? 'Mentor ISI'}
              </div>
              {mentorship.startsAt && (
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-accent" /> Inicia: {formatDate(mentorship.startsAt)}</div>
              )}
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" /> {mentorship._count?.enrollments ?? 0} inscritos
                {mentorship.capacity ? ` / ${mentorship.capacity} cupos` : ''}
              </div>
            </div>
            {mentorship.teamsUrl && (
              <ExternalResourceLink href={mentorship.teamsUrl} className="flex items-center justify-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-sm font-semibold text-indigo-500 transition hover:bg-indigo-500/20">
                <Video className="h-4 w-4" /> Canal en Teams
              </ExternalResourceLink>
            )}
            {mentorship.youtubeUrl && (
              <ExternalResourceLink href={mentorship.youtubeUrl} className="flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-500 transition hover:bg-red-500/20">
                <Video className="h-4 w-4" /> Ver sesiones en YouTube
              </ExternalResourceLink>
            )}
          </div>

          {mentorship.mentor && (
            <Link href={`/perfil/${mentorship.mentor.username}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-accent/50">
              <Avatar src={mentorship.mentor.profile?.avatarUrl} name={mentorship.mentor.profile?.fullName} className="h-11 w-11" />
              <div>
                <div className="text-sm font-bold">{mentorship.mentor.profile?.fullName}</div>
                <div className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Mentor verificado</div>
              </div>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
