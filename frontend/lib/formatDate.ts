/**
 * Date/time formatting helpers for screening display.
 * All outputs are in Vancouver time, never the visitor's own zone.
 *
 * Vancouver's offset is pinned here rather than looked up in the runtime's
 * tzdata: BC moved to permanent UTC-7 on 2026-11-01, and Node / older
 * browsers with stale tzdata would otherwise render times an hour early
 * (and cause SSR/client hydration mismatches).
 * See TROUBLESHOOTING.md → "Showtimes off by one hour".
 */
import {
  DISPLAY_TIMEZONE,
  FIXED_UTC_MINUS_7,
  VANCOUVER_PERMANENT_UTC7_FROM,
} from './constants';

/**
 * The Intl `timeZone` to use when showing instant `d` as Vancouver time.
 * Before the 2026 change every tzdata version agrees on America/Vancouver;
 * from then on it is a fixed UTC-7.
 */
export function displayTimeZoneFor(d: Date): string {
  return d.getTime() >= VANCOUVER_PERMANENT_UTC7_FROM ? FIXED_UTC_MINUS_7 : DISPLAY_TIMEZONE;
}

const LOCALE = 'en-US';

/** e.g. "Mon, Jan 6" for screening list date. */
export function formatScreeningDate(d: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: displayTimeZoneFor(d),
  }).format(d);
}

/** e.g. "7:30 PM" for screening list time. */
export function formatScreeningTime(d: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: displayTimeZoneFor(d),
  }).format(d);
}

/** Today's calendar date in Vancouver as YYYY-MM-DD (for `<input type="date">` min). */
export function todayYmdInDisplayTimezone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: displayTimeZoneFor(now),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
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
    timeZone: displayTimeZoneFor(d),
  }).format(d);
}
