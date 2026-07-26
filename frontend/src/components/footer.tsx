import Link from 'next/link';
import { FlaskConical, MapPin, ShieldCheck } from 'lucide-react';
import { InstitutionalLogo, InstitutionalText } from '@/components/institutional-logo';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="container grid gap-8 py-10 md:grid-cols-4">
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-0.5">
              <InstitutionalLogo className="h-full w-full" />
            </div>
            <div>
              <div className="font-serif-heading font-bold text-primary"><InstitutionalText field="institutionName" /></div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"><InstitutionalText field="careerName" /></div>
            </div>
            <InstitutionalLogo kind="career" className="hidden h-11 w-11 rounded-lg border border-border bg-white p-0.5 sm:block" />
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            <InstitutionalText field="careerName" /> en <InstitutionalText field="shortName" />: proyectos, investigación estudiantil, comunidades técnicas y gamificación académica.
          </p>
          <div className="flex items-center gap-3 pt-1 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="text-xs">Campus universitario — Laboratorios de Sistemas</span>
          </div>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-bold">Explora</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/proyectos" className="hover:text-primary">Proyectos destacados</Link></li>
            <li><Link href="/articulos" className="hover:text-primary">Artículos científicos</Link></li>
            <li><Link href="/eventos" className="hover:text-primary">Eventos y CTF</Link></li>
            <li><Link href="/noticias" className="hover:text-primary">Noticias</Link></li>
            <li><Link href="/ranking" className="hover:text-primary">Ranking estudiantil</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-bold">Comunidad</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/comunidades" className="hover:text-primary">Sociedad científica</Link></li>
            <li><Link href="/comunidades?vista=comunidades" className="hover:text-primary">Comunidades</Link></li>
            <li><Link href="/mentorias" className="hover:text-primary">Mentorías</Link></li>
            <li><Link href="/incubadora" className="hover:text-primary">Incubadora</Link></li>
            <li><Link href="/foro" className="hover:text-primary">Foro Q&A</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-4">
        <div className="container flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} <InstitutionalText field="institutionName" /> · <InstitutionalText field="careerName" />.</span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
            <span className="flex items-center gap-1"><FlaskConical className="h-3.5 w-3.5 text-accent" /> Hecho por estudiantes ISI</span>
            <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Entorno académico de demostración</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
