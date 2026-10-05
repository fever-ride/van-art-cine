/**
 * Pure selection logic for the "Top Rated" hub page
 * (`frontend/app/whats-on/top-rated/page.tsx`): given a pool of upcoming
 * screenings, pick the highest rated distinct films and split them into
 * "this week" (has a screening within the next 7 days) and "this month"
 * (the fuller ranked list). Kept free of React/Next so it's directly unit
 * testable — see frontend/tests/lib/topRated.test.ts.
 */
import { parseImdbRating } from '@/app/lib/displayText';
import type { Screening } from '@/app/lib/screenings';

export const TOP_RATED_MIN_RATING = 8.0;
export const TOP_RATED_MAX_FILMS = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type TopRatedSelection = {
  /** Ranked, deduped-by-film, capped at TOP_RATED_MAX_FILMS. Always a
   * superset of `week` — both come from the same ranked list, `week` is
   * just the subset screening soon. */
  month: Screening[];
  /** Films from `month` with a screening within the next 7 days. Can be
   * empty (nothing highly rated happens to run this week) without that
   * being an error — the caller just skips rendering that section. */
  week: Screening[];
};

/**
 * @param items A pool of upcoming screenings (any order, may include
 *   multiple rows per film — one per showtime). Every row's `start_at_utc`
 *   is assumed to already be `>= now`, matching how the backend's default
 *   query for `/api/screenings` filters (no `date`/`from`/`to` given).
 * @param now Injectable for tests; defaults to the real current time.
 */
export function selectTopRated(items: Screening[], now: Date = new Date()): TopRatedSelection {
  // One entry per film: the row for its soonest upcoming showtime, since
  // that's what "can I catch this this week/month" needs to check against.
  const soonestByFilm = new Map<number, Screening>();

  for (const s of items) {
    const rating = parseImdbRating(s.imdb_rating);
    if (rating == null || rating < TOP_RATED_MIN_RATING) continue;

    const existing = soonestByFilm.get(s.film_id);
    if (!existing || new Date(s.start_at_utc) < new Date(existing.start_at_utc)) {
      soonestByFilm.set(s.film_id, s);
    }
  }

  const ranked = [...soonestByFilm.values()].sort((a, b) => {
    const ratingDiff = parseImdbRating(b.imdb_rating)! - parseImdbRating(a.imdb_rating)!;
    if (ratingDiff !== 0) return ratingDiff;
    return a.title.localeCompare(b.title);
  });

  const month = ranked.slice(0, TOP_RATED_MAX_FILMS);
  const nowMs = now.getTime();
  const week = month.filter(
    (s) => new Date(s.start_at_utc).getTime() - nowMs <= WEEK_MS
  );

  return { month, week };
}
