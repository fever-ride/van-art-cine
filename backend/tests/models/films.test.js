import { describe, test, expect, jest, beforeEach } from '@jest/globals';

/**
 * Mock the Prisma client module.
 */
jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: {
    film: {
      findUnique: jest.fn(),
    },
    film_person: {
      findMany: jest.fn(),
    },
    screening: {
      findMany: jest.fn(),
    },
  },
}));

const { prisma } = await import('../../src/lib/prismaClient.js');
const { getFilmById, getFilmPeople, getUpcomingForFilm, getRelatedFilms } = await import(
  '../../src/models/films.js'
);

/** Minimal fixture matching SCREENING_SELECT's shape, for the final
 * "winner rows" fetch in getRelatedFilms tests. */
function screeningRow({
  id,
  filmId,
  title,
  rating = null,
  startAtUtc,
  cinemaId = 1,
  cinemaName = 'Test Cinema',
}) {
  return {
    id,
    start_at_utc: startAtUtc,
    end_at_utc: null,
    runtime_min: null,
    tz: 'America/Vancouver',
    source_url: null,
    film: {
      id: filmId,
      title,
      imdb_id: null,
      tmdb_id: null,
      year: null,
      description: null,
      rated: null,
      genre: null,
      language: null,
      country: null,
      awards: null,
      imdb_rating: rating,
      rt_rating_pct: null,
      imdb_votes: null,
      imdb_url: null,
      poster_path: null,
      film_person: [],
    },
    cinema: { id: cinemaId, name: cinemaName },
  };
}

/** Fixture for a row in getRelatedFilms's candidate "pool" query — the
 * lighter shape used purely for scoring, distinct from SCREENING_SELECT's
 * full shape used for the final winner rows. */
function poolRow({
  filmId,
  cinemaId = 1,
  startAtUtc,
  genre = null,
  country = null,
  language = null,
  directorIds = [],
  castIds = [],
  rating = null,
}) {
  return {
    film_id: filmId,
    cinema_id: cinemaId,
    start_at_utc: startAtUtc,
    film: {
      genre,
      country,
      language,
      imdb_rating: rating,
      film_person: [
        ...directorIds.map((person_id) => ({ person_id, role: 'director' })),
        ...castIds.map((person_id) => ({ person_id, role: 'cast' })),
      ],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('films model', () => {
  describe('getFilmById', () => {
    test('returns null when film is not found', async () => {
      prisma.film.findUnique.mockResolvedValue(null);

      const result = await getFilmById(123);

      expect(prisma.film.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.film.findUnique).toHaveBeenCalledWith({
        where: { id: Number(123) },
        select: {
          id: true,
          title: true,
          year: true,
          description: true,
          rated: true,
          genre: true,
          language: true,
          country: true,
          awards: true,
          imdb_id: true,
          tmdb_id: true,
          imdb_url: true,
          imdb_rating: true,
          rt_rating_pct: true,
          imdb_votes: true,
          poster_path: true,
        },
      });

      expect(result).toBeNull();
    });

    test('returns film with derived poster_url when poster_path exists', async () => {
      prisma.film.findUnique.mockResolvedValue({
        id: 175,
        title: 'Test Film',
        year: 2025,
        description: 'Desc',
        rated: 'PG',
        genre: 'Drama',
        language: 'English',
        country: 'Canada',
        awards: null,
        imdb_id: 'tt123',
        tmdb_id: 999,
        imdb_url: 'https://imdb.com/title/tt123',
        imdb_rating: 8.1,
        rt_rating_pct: 95,
        imdb_votes: 1000,
        poster_path: '/abc123.jpg',
      });

      const result = await getFilmById('175');

      expect(result).toEqual({
        id: 175,
        title: 'Test Film',
        year: 2025,
        description: 'Desc',
        rated: 'PG',
        genre: 'Drama',
        language: 'English',
        country: 'Canada',
        awards: null,
        imdb_id: 'tt123',
        tmdb_id: 999,
        imdb_url: 'https://imdb.com/title/tt123',
        imdb_rating: 8.1,
        rt_rating_pct: 95,
        imdb_votes: 1000,
        poster_url: 'https://image.tmdb.org/t/p/w342/abc123.jpg',
      });
    });

    test('returns film with poster_url = null when poster_path is missing', async () => {
      prisma.film.findUnique.mockResolvedValue({
        id: 176,
        title: 'No Poster Film',
        year: 2024,
        description: null,
        rated: null,
        genre: null,
        language: null,
        country: null,
        awards: null,
        imdb_id: null,
        tmdb_id: null,
        imdb_url: null,
        imdb_rating: null,
        rt_rating_pct: null,
        imdb_votes: null,
        poster_path: null,
      });

      const result = await getFilmById(176);

      expect(result).toMatchObject({
        id: 176,
        title: 'No Poster Film',
        poster_url: null,
      });

      // The model strips poster_path from the returned object.
      expect(result).not.toHaveProperty('poster_path');
    });
  });

  describe('getFilmPeople', () => {
    test('groups people by role and ignores missing/empty names', async () => {
      prisma.film_person.findMany.mockResolvedValue([
        { role: 'cast', person: { name: 'Zoe Actor' } },
        { role: 'director', person: { name: 'Amy Director' } },
        { role: 'writer', person: { name: 'Ben Writer' } },
        { role: 'cast', person: { name: '' } },
        { role: 'unknown', person: { name: 'Mystery Person' } },
        { role: 'director', person: null },
      ]);

      const result = await getFilmPeople('175');

      expect(prisma.film_person.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.film_person.findMany).toHaveBeenCalledWith({
        where: { film_id: Number(175) },
        select: {
          role: true,
          person: { select: { name: true } },
        },
        orderBy: [{ person: { name: 'asc' } }],
      });

      expect(result).toEqual({
        directors: ['Amy Director'],
        writers: ['Ben Writer'],
        cast: ['Zoe Actor'],
      });
    });

    test('returns empty arrays when no people rows exist', async () => {
      prisma.film_person.findMany.mockResolvedValue([]);

      const result = await getFilmPeople(1);

      expect(result).toEqual({ directors: [], writers: [], cast: [] });
    });
  });

  describe('getUpcomingForFilm', () => {
    test('maps screenings to the expected response shape', async () => {
      prisma.screening.findMany.mockResolvedValue([
        {
          id: 10,
          start_at_utc: new Date('2026-01-01T20:00:00Z'),
          end_at_utc: new Date('2026-01-01T22:00:00Z'),
          runtime_min: 120,
          source_url: 'https://cinema.example/tickets',
          film: { title: 'Test Film' },
          cinema: { id: 7, name: 'Test Cinema', website: 'https://testcinema.example' },
        },
      ]);

      const result = await getUpcomingForFilm('175', { limit: 50 });

      expect(prisma.screening.findMany).toHaveBeenCalledTimes(1);

      const callArg = prisma.screening.findMany.mock.calls[0][0];
      expect(callArg.where.film_id).toBe(Number(175));
      expect(callArg.where.is_active).toBe(true);
      expect(callArg.where.start_at_utc.gte).toBeInstanceOf(Date);

      expect(callArg.orderBy).toEqual({ start_at_utc: 'asc' });
      expect(callArg.take).toBe(Number(50));
      expect(callArg.select).toEqual({
        id: true,
        start_at_utc: true,
        end_at_utc: true,
        runtime_min: true,
        source_url: true,
        film: { select: { title: true } },
        cinema: { select: { id: true, name: true, website: true } },
      });

      expect(result).toEqual([
        {
          id: 10,
          title: 'Test Film',
          start_at_utc: new Date('2026-01-01T20:00:00Z'),
          end_at_utc: new Date('2026-01-01T22:00:00Z'),
          runtime_min: 120,
          cinema_id: 7,
          cinema_name: 'Test Cinema',
          cinema_website: 'https://testcinema.example',
          source_url: 'https://cinema.example/tickets',
        },
      ]);
    });

    test('handles missing nested film/cinema safely', async () => {
      prisma.screening.findMany.mockResolvedValue([
        {
          id: 11,
          start_at_utc: new Date('2026-01-02T20:00:00Z'),
          end_at_utc: new Date('2026-01-02T22:00:00Z'),
          runtime_min: null,
          source_url: 'https://example.com',
          film: null,
          cinema: null,
        },
      ]);

      const result = await getUpcomingForFilm(999);

      expect(result).toEqual([
        {
          id: 11,
          title: null,
          start_at_utc: new Date('2026-01-02T20:00:00Z'),
          end_at_utc: new Date('2026-01-02T22:00:00Z'),
          runtime_min: null,
          cinema_id: null,
          cinema_name: null,
          cinema_website: null,
          source_url: 'https://example.com',
        },
      ]);
    });
  });

  describe('getRelatedFilms', () => {
    test('returns [] when the target film is not found', async () => {
      prisma.film.findUnique.mockResolvedValue(null);

      const result = await getRelatedFilms(999);

      expect(result).toEqual([]);
      expect(prisma.screening.findMany).not.toHaveBeenCalled();
    });

    test('returns [] when the target has no director/cast/genre/country/language and no own upcoming screenings', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: 'N/A',
        country: null,
        language: null,
        film_person: [],
      });
      prisma.screening.findMany.mockResolvedValueOnce([]); // target's own cinema ids: none

      const result = await getRelatedFilms(1);

      expect(result).toEqual([]);
      // Only the "target's own cinema ids" call — no signal to score a pool against.
      expect(prisma.screening.findMany).toHaveBeenCalledTimes(1);
    });

    test('a film matching on several weaker signals outranks one matching only on director', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: 'Drama, Romance',
        country: 'France',
        language: 'French',
        film_person: [{ person_id: 1, role: 'director' }],
      });
      prisma.screening.findMany
        .mockResolvedValueOnce([{ cinema_id: 9 }]) // target's own cinema ids
        .mockResolvedValueOnce([
          // Shares only the director (score: 3).
          poolRow({ filmId: 100, cinemaId: 1, startAtUtc: new Date(2026, 9, 1), directorIds: [1] }),
          // Shares genre + country + language but no director (score: 2 + 1 + 1 = 4).
          poolRow({
            filmId: 200,
            cinemaId: 1,
            startAtUtc: new Date(2026, 9, 2),
            genre: 'Drama, Romance',
            country: 'France',
            language: 'French',
          }),
          // Shares only the cinema (score: 0.5).
          poolRow({ filmId: 300, cinemaId: 9, startAtUtc: new Date(2026, 9, 3) }),
        ])
        // Winner rows come back in a different order than score order, to
        // confirm the function re-sorts by score rather than query order.
        .mockResolvedValueOnce([
          screeningRow({ id: 3, filmId: 300, title: 'Cinema Only', startAtUtc: new Date(2026, 9, 3) }),
          screeningRow({ id: 1, filmId: 100, title: 'Director Only', startAtUtc: new Date(2026, 9, 1) }),
          screeningRow({ id: 2, filmId: 200, title: 'Genre+Country+Language', startAtUtc: new Date(2026, 9, 2) }),
        ]);

      const result = await getRelatedFilms(1, { limit: 3 });

      expect(result.map((r) => r.film_id)).toEqual([200, 100, 300]);
    });

    test('ties on score are broken by soonest screening, then by higher imdb_rating', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: null,
        country: null,
        language: null,
        film_person: [{ person_id: 1, role: 'director' }],
      });
      prisma.screening.findMany
        .mockResolvedValueOnce([]) // target's own cinema ids
        .mockResolvedValueOnce([
          // All three share only the director (score: 3 each).
          poolRow({ filmId: 10, startAtUtc: new Date(2026, 9, 10), directorIds: [1], rating: 9 }),
          poolRow({ filmId: 20, startAtUtc: new Date(2026, 9, 5), directorIds: [1], rating: 2 }),
          poolRow({ filmId: 30, startAtUtc: new Date(2026, 9, 5), directorIds: [1], rating: 9 }),
        ])
        .mockResolvedValueOnce([
          screeningRow({ id: 1, filmId: 10, title: 'Latest', startAtUtc: new Date(2026, 9, 10) }),
          screeningRow({ id: 2, filmId: 20, title: 'Soonest, lower rating', startAtUtc: new Date(2026, 9, 5) }),
          screeningRow({ id: 3, filmId: 30, title: 'Soonest, higher rating', startAtUtc: new Date(2026, 9, 5) }),
        ]);

      const result = await getRelatedFilms(1, { limit: 3 });

      // 30 and 20 tie for soonest start; 30 wins on rating. 10 is later, so it's last.
      expect(result.map((r) => r.film_id)).toEqual([30, 20, 10]);
    });

    test('dedupes a film with screenings at multiple cinemas, unioning them for the cinema-match bonus', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: null,
        country: null,
        language: null,
        film_person: [],
      });
      prisma.screening.findMany
        .mockResolvedValueOnce([{ cinema_id: 9 }]) // target plays at cinema 9
        .mockResolvedValueOnce([
          // Same film (id 50), two screenings at different cinemas; only the
          // second matches the target's cinema, but that's enough for the bonus.
          poolRow({ filmId: 50, cinemaId: 1, startAtUtc: new Date(2026, 9, 1) }),
          poolRow({ filmId: 50, cinemaId: 9, startAtUtc: new Date(2026, 9, 8) }),
        ])
        .mockResolvedValueOnce([
          screeningRow({ id: 1, filmId: 50, title: 'Same Film', startAtUtc: new Date(2026, 9, 1) }),
        ]);

      const result = await getRelatedFilms(1, { limit: 6 });

      expect(result).toHaveLength(1);
      expect(result[0].film_id).toBe(50);
    });

    test('caps results at `limit` even when more candidates score above zero', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: null,
        country: null,
        language: null,
        film_person: [{ person_id: 1, role: 'director' }],
      });
      prisma.screening.findMany
        .mockResolvedValueOnce([]) // target's own cinema ids
        .mockResolvedValueOnce(
          Array.from({ length: 4 }, (_, i) =>
            poolRow({ filmId: 100 + i, startAtUtc: new Date(2026, 9, 1 + i), directorIds: [1] })
          )
        )
        .mockResolvedValueOnce(
          Array.from({ length: 2 }, (_, i) =>
            screeningRow({ id: i + 1, filmId: 100 + i, title: `Film ${i}`, startAtUtc: new Date(2026, 9, 1 + i) })
          )
        );

      const result = await getRelatedFilms(1, { limit: 2 });

      expect(result.map((r) => r.film_id)).toEqual([100, 101]);
    });
  });
});