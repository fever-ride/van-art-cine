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

/** Minimal fixture matching SCREENING_SELECT's shape, for getRelatedFilms tests. */
function screeningRow({
  id,
  filmId,
  title,
  genre = null,
  directorId = null,
  directorName = null,
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
      genre,
      language: null,
      country: null,
      awards: null,
      imdb_rating: rating,
      rt_rating_pct: null,
      imdb_votes: null,
      imdb_url: null,
      poster_path: null,
      film_person: directorId
        ? [{ person: { name: directorName } }]
        : [],
    },
    cinema: { id: cinemaId, name: cinemaName },
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

    test('director bucket alone filling the cap skips the genre and cinema queries entirely', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: 'Drama',
        film_person: [{ person_id: 1 }],
      });
      // Call 1: target's own cinema ids (not used once director bucket fills the cap).
      prisma.screening.findMany.mockResolvedValueOnce([
        { cinema_id: 1 },
      ]);
      // Call 2: director bucket — 6 distinct films, enough to hit the cap alone.
      prisma.screening.findMany.mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, i) =>
          screeningRow({
            id: 100 + i,
            filmId: 200 + i,
            title: `Director Film ${i}`,
            directorId: 1,
            directorName: 'Shared Director',
            startAtUtc: new Date(2026, 9, 10 + i),
          })
        )
      );

      const result = await getRelatedFilms(1, { limit: 6 });

      expect(result).toHaveLength(6);
      expect(result.map((r) => r.film_id)).toEqual([200, 201, 202, 203, 204, 205]);
      // Only the two calls above — genre/cinema buckets never queried.
      expect(prisma.screening.findMany).toHaveBeenCalledTimes(2);
    });

    test('fills remaining slots from genre, then cinema, once director is exhausted', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: 'Drama, Comedy',
        film_person: [{ person_id: 1 }],
      });
      prisma.screening.findMany
        // target's own cinema ids
        .mockResolvedValueOnce([{ cinema_id: 1 }])
        // director bucket: only 2 distinct films
        .mockResolvedValueOnce([
          screeningRow({ id: 1, filmId: 10, title: 'D1', directorId: 1, startAtUtc: new Date(2026, 9, 1) }),
          screeningRow({ id: 2, filmId: 11, title: 'D2', directorId: 1, startAtUtc: new Date(2026, 9, 2) }),
        ])
        // genre bucket: 3 distinct films (one overlaps a director pick, must be excluded)
        .mockResolvedValueOnce([
          screeningRow({ id: 3, filmId: 10, title: 'D1', genre: 'Drama', startAtUtc: new Date(2026, 9, 1) }),
          screeningRow({ id: 4, filmId: 20, title: 'G1', genre: 'Drama', startAtUtc: new Date(2026, 9, 3) }),
          screeningRow({ id: 5, filmId: 21, title: 'G2', genre: 'Comedy', startAtUtc: new Date(2026, 9, 4) }),
        ])
        // cinema bucket: director (2) + genre (2 new) = 4, still short of the
        // limit (5), so this bucket's one new film should also get pulled in.
        .mockResolvedValueOnce([
          screeningRow({ id: 6, filmId: 30, title: 'C1', startAtUtc: new Date(2026, 9, 5) }),
        ]);

      const result = await getRelatedFilms(1, { limit: 5 });

      expect(result.map((r) => r.film_id)).toEqual([10, 11, 20, 21, 30]);
      expect(prisma.screening.findMany).toHaveBeenCalledTimes(4);
    });

    test('dedupes a film with multiple matching screenings down to its soonest one', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: null,
        film_person: [],
      });
      prisma.screening.findMany
        .mockResolvedValueOnce([{ cinema_id: 1 }]) // target cinema ids
        .mockResolvedValueOnce([
          // Same film (id 50), two screenings; query already orders
          // soonest-first, so the first row is the one that should win.
          screeningRow({ id: 1, filmId: 50, title: 'Same Film', startAtUtc: new Date(2026, 9, 1) }),
          screeningRow({ id: 2, filmId: 50, title: 'Same Film', startAtUtc: new Date(2026, 9, 8) }),
        ]);

      const result = await getRelatedFilms(1, { limit: 6 });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    test('a film with no director, no genre, and no cinema (no own upcoming screenings) returns []', async () => {
      prisma.film.findUnique.mockResolvedValue({
        genre: 'N/A',
        film_person: [],
      });
      prisma.screening.findMany.mockResolvedValueOnce([]); // target has no cinema ids either

      const result = await getRelatedFilms(1);

      expect(result).toEqual([]);
      // Only the "target's own cinema ids" call — no bucket has anything to query.
      expect(prisma.screening.findMany).toHaveBeenCalledTimes(1);
    });
  });
});