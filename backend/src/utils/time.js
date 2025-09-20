import { fromZonedTime } from 'date-fns-tz';
import { addDays } from 'date-fns';

// Build 'YYYY-MM-DD' safely
function pad(n) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

/** Single local day -> [UTC start, UTC end) as Date objects */
export function localDayToUtcRange(localDate, tz) {
  if (!localDate) return [null, null];

  const startUtc = fromZonedTime(`${localDate} 00:00:00`, tz);

  const localMidnight = new Date(`${localDate}T00:00:00`);
  const nextDayMidnight = addDays(localMidnight, 1);
  const endUtc = fromZonedTime(`${ymd(nextDayMidnight)} 00:00:00`, tz);

  return [startUtc, endUtc];
}

/** Local [from, to] (YYYY-MM-DD) -> [UTC start, UTC end) as Date objects */
export function localRangeToUtc(from, to, tz) {
  const startUtc = from
    ? fromZonedTime(from + ' 00:00:00', tz)
    : null;

  let endUtc = null;
  if (to) {
    const toMidnight = new Date(to + 'T00:00:00');   // local midnight of 'to'
    const nextDayMidnight = addDays(toMidnight, 1);  // next day's local midnight
    const nextDayStr = ymd(nextDayMidnight);         // format YYYY-MM-DD
    endUtc = fromZonedTime(nextDayStr + ' 00:00:00', tz);
  }

  return [startUtc, endUtc];
}