import { addDays, nextSaturday, nextFriday, isFriday, isSaturday, isSunday } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveDateHint(hint, tz = 'America/Vancouver') {
  if (!hint) return {};

  const now = toZonedTime(new Date(), tz);
  const h = hint.toLowerCase().trim();

  if (h === 'today' || h === 'tonight') {
    return { date: fmt(now), evening: h === 'tonight' };
  }

  if (h === 'tomorrow') {
    return { date: fmt(addDays(now, 1)) };
  }

  if (h === 'this weekend') {
    let fri;
    if (isFriday(now)) fri = now;
    else if (isSaturday(now) || isSunday(now)) fri = now;
    else fri = nextFriday(now);

    const sun = isSunday(now) ? now : isSaturday(now) ? addDays(now, 1) : addDays(isFriday(now) ? now : nextFriday(now), 2);

    const from = fmt(isSunday(now) ? now : isSaturday(now) ? now : fri);
    const to = fmt(sun);
    return { from, to };
  }

  if (h === 'next week') {
    const daysUntilMon = (8 - now.getDay()) % 7 || 7;
    const mon = addDays(now, daysUntilMon);
    return { from: fmt(mon), to: fmt(addDays(mon, 6)) };
  }

  if (h === 'next weekend') {
    let sat = nextSaturday(now);
    if (isSaturday(now) || isSunday(now)) sat = nextSaturday(addDays(now, 1));
    return { from: fmt(sat), to: fmt(addDays(sat, 1)) };
  }

  return {};
}
