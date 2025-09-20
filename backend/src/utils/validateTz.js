export function normalizeTz(input, fallback = 'America/Vancouver') {
  const tz = String(input || '').trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return fallback;
  }
}