const DEFAULT_EVENT_TIME_ZONE = 'America/La_Paz';

interface CalendarEventData {
  title: string;
  description: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  isOnline: boolean;
  meetingUrl?: string | null;
  communityName?: string | null;
}

function toGoogleTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildGoogleCalendarUrl(event: CalendarEventData, timeZone = DEFAULT_EVENT_TIME_ZONE) {
  const startsAt = new Date(event.startsAt);
  const configuredEnd = event.endsAt ? new Date(event.endsAt) : null;
  const endsAt = configuredEnd && configuredEnd > startsAt
    ? configuredEnd
    : new Date(startsAt.getTime() + 60 * 60 * 1000);
  const details = [
    event.description,
    event.communityName ? `Organiza: ${event.communityName}` : null,
    event.isOnline && event.meetingUrl ? `Enlace de la reunión: ${event.meetingUrl}` : null,
  ].filter(Boolean).join('\n\n');
  const location = event.isOnline
    ? event.meetingUrl || 'Evento en línea'
    : event.location || 'Campus ISI';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toGoogleTimestamp(startsAt)}/${toGoogleTimestamp(endsAt)}`,
    details,
    location,
    ctz: timeZone,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
