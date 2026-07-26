import {
  AppWindow,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  GraduationCap,
  Library,
  Link2,
  Mail,
  Monitor,
  Network,
  School,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const APPLICATION_ICON_OPTIONS = [
  { value: 'app-window', label: 'Aplicación' },
  { value: 'external-link', label: 'Enlace externo' },
  { value: 'building-2', label: 'Institución' },
  { value: 'school', label: 'Facultad' },
  { value: 'graduation-cap', label: 'Educación' },
  { value: 'library', label: 'Biblioteca' },
  { value: 'book-open', label: 'Recursos académicos' },
  { value: 'calendar-days', label: 'Calendario' },
  { value: 'mail', label: 'Correo' },
  { value: 'file-text', label: 'Documentos' },
  { value: 'database', label: 'Datos' },
  { value: 'network', label: 'Red' },
  { value: 'users', label: 'Personas' },
  { value: 'briefcase', label: 'Trabajo' },
  { value: 'shield-check', label: 'Seguridad' },
  { value: 'monitor', label: 'Sistema' },
  { value: 'globe-2', label: 'Sitio web' },
  { value: 'link', label: 'Enlace' },
] as const;

const ICONS: Record<string, LucideIcon> = {
  'app-window': AppWindow,
  'external-link': ExternalLink,
  'building-2': Building2,
  school: School,
  'graduation-cap': GraduationCap,
  library: Library,
  'book-open': BookOpen,
  'calendar-days': CalendarDays,
  mail: Mail,
  'file-text': FileText,
  database: Database,
  network: Network,
  users: Users,
  briefcase: BriefcaseBusiness,
  'shield-check': ShieldCheck,
  monitor: Monitor,
  'globe-2': Globe2,
  link: Link2,
};

export function ApplicationIcon({
  icon,
  className,
  label,
}: {
  icon?: string | null;
  className?: string;
  label?: string;
}) {
  const Icon = ICONS[icon ?? ''] ?? AppWindow;
  return (
    <Icon
      className={cn('h-5 w-5', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}
