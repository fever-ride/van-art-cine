/**
 * Decade-ish "era" buckets for filtering/faceting by release year. A plain
 * per-year facet (one checkbox per distinct year, like genre/language) was
 * checked against the real catalog first and rejected: of 177 currently
 * upcoming films, 106 are 2025/2026 and nearly every other year has only
 * 1-3 films — a 40-value checklist dominated by one giant bucket and a
 * long thin tail, not a useful filter. Grouping into a handful of decade
 * buckets turns that thin tail into a real "classics" bucket instead.
 *
 * Ordered newest-first; `maxYear: null` means "no upper bound" (the
 * current decade bucket). Deliberately named by decade ("2020s"), not a
 * hardcoded "2025-2026" label, so this doesn't read as stale once 2027
 * titles start showing up — the bucket boundary doesn't change, only
 * which years happen to populate it.
 */
export const YEAR_ERAS = [
  { key: '2020s', label: '2020s', minYear: 2020, maxYear: null },
  { key: '2010s', label: '2010s', minYear: 2010, maxYear: 2019 },
  { key: '2000s', label: '2000s', minYear: 2000, maxYear: 2009 },
  { key: '1990s', label: '1990s', minYear: 1990, maxYear: 1999 },
  { key: 'pre-1990', label: 'Before 1990', minYear: null, maxYear: 1989 },
];

const ERA_BY_KEY = new Map(YEAR_ERAS.map((e) => [e.key, e]));

/** Prisma `year` range condition for one era bucket, or `null` for an
 * unrecognized key (caller should skip it rather than throw — an invalid
 * value here is a bad request, not a server error). */
export function eraYearCondition(key) {
  const era = ERA_BY_KEY.get(key);
  if (!era) return null;
  const cond = {};
  if (era.minYear != null) cond.gte = era.minYear;
  if (era.maxYear != null) cond.lte = era.maxYear;
  return cond;
}

/** Which era bucket a given year falls into, or `null` for a missing year
 * (never bucketed — matches how genre/language facets drop films with no
 * value rather than inventing an "unknown" bucket). */
export function eraForYear(year) {
  if (year == null) return null;
  for (const era of YEAR_ERAS) {
    if (era.minYear != null && year < era.minYear) continue;
    if (era.maxYear != null && year > era.maxYear) continue;
    return era.key;
  }
  return null;
}
