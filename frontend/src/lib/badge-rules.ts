import type { Badge, BadgeRuleType } from '@/lib/types';

export const BADGE_RULE_OPTIONS: Array<{
  value: BadgeRuleType;
  label: string;
  unit: string;
}> = [
  { value: 'ANSWERS_COUNT', label: 'Cantidad de respuestas', unit: 'respuestas publicadas' },
  { value: 'ACCEPTED_ANSWERS_COUNT', label: 'Cantidad de mejores respuestas', unit: 'mejores respuestas' },
  { value: 'TOTAL_POINTS', label: 'Puntos acumulados', unit: 'puntos acumulados' },
  { value: 'APPROVED_PROJECTS_COUNT', label: 'Proyectos aprobados', unit: 'proyectos aprobados' },
  { value: 'ATTENDED_EVENTS_COUNT', label: 'Eventos completados', unit: 'eventos completados' },
  { value: 'COMPLETED_MENTORSHIPS_COUNT', label: 'Mentorías realizadas', unit: 'mentorías completadas' },
  { value: 'COMMUNITY_MEMBERSHIPS_COUNT', label: 'Participación en comunidades', unit: 'comunidades en las que participa' },
];

export function badgeRuleLabel(ruleType?: BadgeRuleType | null) {
  return BADGE_RULE_OPTIONS.find((option) => option.value === ruleType)?.label ?? 'Asignación manual';
}

export function badgeRuleExplanation(
  badge: Pick<Badge, 'ruleType' | 'targetValue' | 'isRetroactive'>,
) {
  if (!badge.ruleType || !badge.targetValue) {
    return 'Se otorga manualmente por administración o mediante una acción especial del sistema.';
  }
  const option = BADGE_RULE_OPTIONS.find((item) => item.value === badge.ruleType);
  const scope = badge.isRetroactive
    ? 'Cuenta también la actividad anterior a la creación de la insignia.'
    : 'Cuenta la actividad registrada desde la creación de la insignia.';
  return `Se obtiene al alcanzar ${badge.targetValue} ${option?.unit ?? 'acciones válidas'}. ${scope}`;
}
