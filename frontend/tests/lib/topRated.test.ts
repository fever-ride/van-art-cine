import { selectTopRated, TOP_RATED_MIN_RATING, TOP_RATED_MAX_FILMS } from '@/lib/topRated';
import type { Screening } from '@/app/lib/screenings';

const NOW = new Date('2026-09-29T00:00:00.000Z');

function makeScreening(overrides: Partial<Screening> & { film_id: number }): Screening {
  return {
    id: overrides.film_id * 100 + Math.floor(Math.random() * 100),
    title: `Film ${overrides.film_id}`,
    start_at_utc: NOW.toISOString(),
    cinema_id: 1,
    cinema_name: 'Test Cinema',
    imdb_rating: null,
    ...overrides,
  };
}

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('selectTopRated', () => {
  test('excludes films below the rating threshold', () => {
    const items = [
      makeScreening({ film_id: 1, imdb_rating: 7.9, start_at_utc: daysFromNow(1) }),
      makeScreening({ film_id: 2, imdb_rating: 8.0, start_at_utc: daysFromNow(1) }),
    ];
    const { month } = selectTopRated(items, NOW);
    expect(month.map((s) => s.film_id)).toEqual([2]);
  });

  test('excludes films with no rating or an unparseable rating', () => {
    const items = [
      makeScreening({ film_id: 1, imdb_rating: null, start_at_utc: daysFromNow(1) }),
      makeScreening({ film_id: 2, imdb_rating: 'N/A' as unknown as number, start_at_utc: daysFromNow(1) }),
      makeScreening({ film_id: 3, imdb_rating: 8.5, start_at_utc: daysFromNow(1) }),
    ];
    const { month } = selectTopRated(items, NOW);
    expect(month.map((s) => s.film_id)).toEqual([3]);
  });

  test('dedupes a film with multiple showtimes down to its soonest one', () => {
    const items = [
      makeScreening({ film_id: 1, imdb_rating: 8.5, start_at_utc: daysFromNow(20) }),
      makeScreening({ film_id: 1, imdb_rating: 8.5, start_at_utc: daysFromNow(3) }),
      makeScreening({ film_id: 1, imdb_rating: 8.5, start_at_utc: daysFromNow(10) }),
    ];
    const { month } = selectTopRated(items, NOW);
    expect(month).toHaveLength(1);
    expect(month[0].start_at_utc).toBe(daysFromNow(3));
  });

  test('ranks by rating descending, then title ascending as a tiebreak', () => {
    const items = [
      makeScreening({ film_id: 1, title: 'Zeta', imdb_rating: 8.5, start_at_utc: daysFromNow(1) }),
      makeScreening({ film_id: 2, title: 'Alpha', imdb_rating: 9.0, start_at_utc: daysFromNow(1) }),
      makeScreening({ film_id: 3, title: 'Beta', imdb_rating: 8.5, start_at_utc: daysFromNow(1) }),
    ];
    const { month } = selectTopRated(items, NOW);
    expect(month.map((s) => s.title)).toEqual(['Alpha', 'Beta', 'Zeta']);
  });

  test('caps "month" at TOP_RATED_MAX_FILMS', () => {
    const items = Array.from({ length: TOP_RATED_MAX_FILMS + 10 }, (_, i) =>
      makeScreening({ film_id: i, imdb_rating: 9.0, start_at_utc: daysFromNow(1) })
    );
    const { month } = selectTopRated(items, NOW);
    expect(month).toHaveLength(TOP_RATED_MAX_FILMS);
  });

  test('"week" is films from "month" screening within the next 7 days; others are excluded but stay in "month"', () => {
    const items = [
      makeScreening({ film_id: 1, imdb_rating: 8.5, start_at_utc: daysFromNow(3) }),
      makeScreening({ film_id: 2, imdb_rating: 8.4, start_at_utc: daysFromNow(7) }),
      makeScreening({ film_id: 3, imdb_rating: 8.3, start_at_utc: daysFromNow(7.1) }),
      makeScreening({ film_id: 4, imdb_rating: 8.2, start_at_utc: daysFromNow(20) }),
    ];
    const { month, week } = selectTopRated(items, NOW);
    expect(month.map((s) => s.film_id)).toEqual([1, 2, 3, 4]);
    expect(week.map((s) => s.film_id)).toEqual([1, 2]);
  });

  test('empty pool or nothing meeting the threshold yields empty week and month, not an error', () => {
    expect(selectTopRated([], NOW)).toEqual({ month: [], week: [] });
    const lowRated = [makeScreening({ film_id: 1, imdb_rating: 5.0, start_at_utc: daysFromNow(1) })];
    expect(selectTopRated(lowRated, NOW)).toEqual({ month: [], week: [] });
  });

  test('TOP_RATED_MIN_RATING is the documented 8.0 threshold', () => {
    expect(TOP_RATED_MIN_RATING).toBe(8.0);
  });
});
