import { DISPLAY_TIMEZONE } from './constants';

const LOCALE = 'en-US';

/** e.g. "Mon, Jan 6" for screening list date. */
export function formatScreeningDate(d: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: DISPLAY_TIMEZONE,
  }).format(d);
}

/** e.g. "7:30 PM" for screening list time. */
export function formatScreeningTime(d: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: DISPLAY_TIMEZONE,
  }).format(d);
}

/** e.g. "Mon, Jan 6, 7:30 PM" for detail / full datetime. */
export function formatScreeningDateTime(d: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: DISPLAY_TIMEZONE,
  }).format(d);
}
