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
const { getFilmById, getFilmPeople, getUpcomingForFilm } = await import(
  '../../src/models/films.js'
);

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
          cinema: { id: 7, name: 'Test Cinema' },
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
        cinema: { select: { id: true, name: true } },
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
          source_url: 'https://example.com',
        },
      ]);
    });
  });
});