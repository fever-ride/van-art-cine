import { fromZonedTime } from 'date-fns-tz';

/*
 * Local calendar day(s) -> UTC instants.
 *
 * Vancouver is special-cased: BC moved to permanent UTC-7 on 2026-11-01
 * (tzdata 2026c). Node's bundled ICU may carry older tzdata that still
 * falls back to UTC-8, which would shift every "day" filter boundary by
 * an hour. So for America/Vancouver we pin the post-change offset instead
 * of trusting the runtime. See TROUBLESHOOTING.md → "Showtimes off by one hour".
 */
const VANCOUVER = 'America/Vancouver';
const VANCOUVER_PERMANENT_UTC7_FROM = Date.UTC(2026, 10, 1, 9, 0, 0);
const UTC_MINUS_7_MS = 7 * 60 * 60 * 1000;

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

/** 'YYYY-MM-DD' -> the following day as 'YYYY-MM-DD' (pure calendar math, no host tz). */
function nextYmd(localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Local midnight of 'YYYY-MM-DD' in `tz`, as a UTC Date. */
export function localMidnightToUtc(localDate, tz) {
  if (tz === VANCOUVER) {
    const [y, m, d] = localDate.split('-').map(Number);
    const asUtcMinus7 = Date.UTC(y, m - 1, d) + UTC_MINUS_7_MS;
    if (asUtcMinus7 >= VANCOUVER_PERMANENT_UTC7_FROM) return new Date(asUtcMinus7);
  }
  return fromZonedTime(`${localDate} 00:00:00`, tz);
}

/** Single local day -> [UTC start, UTC end) as Date objects */
export function localDayToUtcRange(localDate, tz) {
  if (!localDate) return [null, null];
  return [localMidnightToUtc(localDate, tz), localMidnightToUtc(nextYmd(localDate), tz)];
}

/** Local [from, to] (YYYY-MM-DD) -> [UTC start, UTC end) as Date objects */
export function localRangeToUtc(from, to, tz) {
  const startUtc = from ? localMidnightToUtc(from, tz) : null;
  const endUtc = to ? localMidnightToUtc(nextYmd(to), tz) : null;
  return [startUtc, endUtc];
}
