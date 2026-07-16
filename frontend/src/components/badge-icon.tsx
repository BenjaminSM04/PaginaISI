/* eslint-disable @next/next/no-img-element */
import {
  Award, Bug, CheckCircle2, Code2, FileText, GraduationCap, MessageCircle, Microscope,
  Rocket, Trophy, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const BADGE_ICON_OPTIONS = [
  { value: 'award', label: 'Medalla' },
  { value: 'rocket', label: 'Cohete' },
  { value: 'file-text', label: 'Artículo' },
  { value: 'message-circle', label: 'Conversación' },
  { value: 'graduation-cap', label: 'Mentoría' },
  { value: 'bug', label: 'Depuración' },
  { value: 'microscope', label: 'Investigación' },
  { value: 'code', label: 'Código' },
  { value: 'users', label: 'Comunidad' },
  { value: 'trophy', label: 'Trofeo' },
  { value: 'check-circle', label: 'Logro aprobado' },
] as const;

const ICONS = {
  award: Award,
  rocket: Rocket,
  'file-text': FileText,
  'message-circle': MessageCircle,
  'graduation-cap': GraduationCap,
  bug: Bug,
  microscope: Microscope,
  code: Code2,
  users: Users,
  trophy: Trophy,
  'check-circle': CheckCircle2,
} as const;

const GENERATED_ICON_PREFIX = 'data:image/svg+xml;base64,';

export function isGeneratedBadgeIcon(icon?: string | null) {
  return Boolean(icon?.startsWith(GENERATED_ICON_PREFIX) && icon.length <= 64 * 1024);
}

/** Los iconos Lucide son SVG reales, ligeros, accesibles y sin contenido ejecutable. */
export function BadgeIcon({ icon, className, label }: { icon?: string | null; className?: string; label?: string }) {
  if (icon && isGeneratedBadgeIcon(icon)) {
    // El API solo persiste SVG producidos por su conversor de gramática cerrada.
    // Se usa el contexto de imagen del navegador y nunca se inserta el XML en el DOM.
    return (
      <img
        src={icon}
        alt={label ?? ''}
        aria-hidden={label ? undefined : true}
        className={cn('h-5 w-5 object-contain', className)}
        decoding="async"
        width={48}
        height={48}
      />
    );
  }
  const Icon = ICONS[(icon ?? 'award') as keyof typeof ICONS] ?? Award;
  return <Icon aria-label={label} aria-hidden={label ? undefined : true} className={cn('h-5 w-5', className)} />;
}
