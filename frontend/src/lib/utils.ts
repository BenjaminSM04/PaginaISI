import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date?: string | Date | null, withTime = false): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-BO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function timeAgo(date?: string | Date | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} día${days > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months > 1 ? 'es' : ''}`;
  return `hace ${Math.floor(months / 12)} año(s)`;
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export const NEWS_CATEGORIES: Record<string, string> = {
  CONVENIOS: 'Convenios',
  LOGROS: 'Logros',
  EVENTOS: 'Eventos',
  COMUNIDAD: 'Comunidad',
  INVESTIGACION: 'Investigación',
  PROYECTOS: 'Proyectos',
};

export const EVENT_CATEGORIES: Record<string, string> = {
  CTF: 'CTF',
  TALLER: 'Taller',
  HACKATHON: 'Hackathon',
  MENTORIA: 'Mentoría',
  CHARLA: 'Charla',
  COMPETENCIA: 'Competencia',
};

export const PROJECT_STAGES: Record<string, string> = {
  PROPOSED: 'Propuesto',
  IN_DEVELOPMENT: 'En desarrollo',
  FINISHED: 'Terminado',
  FEATURED: 'Destacado',
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING: 'Pendiente de aprobación',
  APPROVED: 'Aprobado',
  OBSERVED: 'Observado',
  REJECTED: 'Rechazado',
  ARCHIVED: 'Archivado',
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground border-border',
  PENDING: 'bg-warning/15 text-warning border-warning/30',
  APPROVED: 'bg-success/15 text-success border-success/30',
  OBSERVED: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  REJECTED: 'bg-danger/15 text-danger border-danger/30',
  ARCHIVED: 'bg-muted text-muted-foreground border-border',
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  BASICO: 'Básico',
  INTERMEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
};
