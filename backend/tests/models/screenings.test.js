import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Mock Prisma client module
 */
jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: {
    screening: {
      findMany: jest.fn(),
    },
  },
}));

/**
 * Mock the time utilities used by fetchScreenings.
 */
jest.unstable_mockModule('../../src/utils/time.js', () => ({
  localDayToUtcRange: jest.fn(),
  localRangeToUtc: jest.fn(),
}));

// Import mocked module
const { prisma } = await import('../../src/lib/prismaClient.js');
const { localDayToUtcRange, localRangeToUtc } = await import('../../src/utils/time.js');

// Import the module under test after mocks are registered.
const { fetchScreenings, findByIds } = await import('../../src/models/screenings.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchScreenings', () => {
  test('builds UTC window using localDayToUtcRange when date is provided', async () => {
    const utcStart = new Date('2025-01-01T08:00:00.000Z');
    const utcEnd = new Date('2025-01-02T08:00:00.000Z');

    localDayToUtcRange.mockReturnValue([utcStart, utcEnd]);

    prisma.screening.findMany.mockResolvedValue([
      {
        id: 1,
        start_at_utc: new Date('2025-01-01T20:00:00.000Z'),
        end_at_utc: new Date('2025-01-01T22:00:00.000Z'),
        runtime_min: 120,
        tz: 'America/Vancouver',
        source_url: 'https://cinema.example/tickets',
        film: {
          id: 10,
          title: 'Test Film',
          imdb_id: 'tt123',
          tmdb_id: 999,
          year: 2024,
          description: 'Desc',
          rated: 'PG',
          genre: 'Drama',
          language: 'English',
          country: 'Canada',
          awards: null,
          imdb_rating: 8.2,
          rt_rating_pct: 95,
          imdb_votes: 1000,
          imdb_url: 'https://imdb.example',
          film_person: [
            { person: { name: 'Z Director' } },
            { person: { name: 'A Director' } },
          ],
        },
        cinema: { id: 7, name: 'Rio Theatre' },
      },
    ]);

    const result = await fetchScreenings({
      date: '2025-01-01',
      tz: 'America/Vancouver',
      sort: 'time',
      order: 'ASC',
      limit: 50,
      offset: 0,
    });

    // Ensure the correct time util branch is used.
    expect(localDayToUtcRange).toHaveBeenCalledWith('2025-01-01', 'America/Vancouver');
    expect(localRangeToUtc).not.toHaveBeenCalled();

    // Validate the Prisma query was built correctly.
    expect(prisma.screening.findMany).toHaveBeenCalledTimes(1);
    const callArg = prisma.screening.findMany.mock.calls[0][0];

    expect(callArg.where).toMatchObject({
      is_active: true,
      start_at_utc: { gte: utcStart, lt: utcEnd },
    });

    // Default sort "time" => orderBy start_at_utc asc/desc based on safeOrder.
    expect(callArg.orderBy).toEqual([{ start_at_utc: 'asc' }]);
    expect(callArg.take).toBe(50);
    expect(callArg.skip).toBe(0);

    // Validate flattening + directors sorting.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      title: 'Test Film',
      cinema_id: 7,
      cinema_name: 'Rio Theatre',
      film_id: 10,
      directors: 'A Director, Z Director',
      source_url: 'https://cinema.example/tickets',
    });
  });

  test('builds UTC window using localRangeToUtc when date is not provided', async () => {
    // Freeze time so "new Date()" used inside fetchScreenings is deterministic.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));

    const utcRangeStart = new Date('2025-01-02T00:00:00.000Z');
    const utcRangeEnd = new Date('2025-01-03T00:00:00.000Z');
    localRangeToUtc.mockReturnValue([utcRangeStart, utcRangeEnd]);

    prisma.screening.findMany.mockResolvedValue([]);

    await fetchScreenings({
      from: '2025-01-02',
      to: '2025-01-03',
      tz: 'America/Vancouver',
    });

    expect(localRangeToUtc).toHaveBeenCalledWith('2025-01-02', '2025-01-03', 'America/Vancouver');
    expect(localDayToUtcRange).not.toHaveBeenCalled();

    const callArg = prisma.screening.findMany.mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      is_active: true,
      start_at_utc: { gte: utcRangeStart, lt: utcRangeEnd },
    });

    jest.useRealTimers();
  });

  test('applies cinemaIds filter (takes precedence over cinemaId) and filmId + q filters', async () => {
    localRangeToUtc.mockReturnValue([new Date('2025-01-01T00:00:00.000Z'), null]);
    prisma.screening.findMany.mockResolvedValue([]);

    await fetchScreenings({
      cinemaId: 123,
      cinemaIds: ['7', '9'],
      filmId: 42,
      q: 'inception',
      sort: 'title',
      order: 'DESC',
    });

    const callArg = prisma.screening.findMany.mock.calls[0][0];

    // cinemaIds wins, cinemaId should not be used.
    expect(callArg.where).toMatchObject({
      cinema_id: { in: [7, 9] },
      film_id: 42,
      film: { normalized_title: { contains: 'inception' } },
    });

    // sort "title" => film.title desc + start_at_utc asc
    expect(callArg.orderBy).toEqual([
      { film: { title: 'desc' } },
      { start_at_utc: 'asc' },
    ]);
  });

  test('normalizes order to asc/desc safely and builds rating-based orderBy for imdb/rt/votes/year', async () => {
    localRangeToUtc.mockReturnValue([new Date('2025-01-01T00:00:00.000Z'), null]);
    prisma.screening.findMany.mockResolvedValue([]);

    await fetchScreenings({ sort: 'imdb', order: 'DESC' });
    let callArg = prisma.screening.findMany.mock.calls.at(-1)[0];
    expect(callArg.orderBy[0]).toEqual({ film: { imdb_rating: { sort: 'desc', nulls: 'last' } } });

    await fetchScreenings({ sort: 'rt', order: 'ASC' });
    callArg = prisma.screening.findMany.mock.calls.at(-1)[0];
    expect(callArg.orderBy[0]).toEqual({ film: { rt_rating_pct: { sort: 'asc', nulls: 'last' } } });

    await fetchScreenings({ sort: 'votes', order: 'DESC' });
    callArg = prisma.screening.findMany.mock.calls.at(-1)[0];
    expect(callArg.orderBy[0]).toEqual({ film: { imdb_votes: { sort: 'desc', nulls: 'last' } } });

    await fetchScreenings({ sort: 'year', order: 'DESC' });
    callArg = prisma.screening.findMany.mock.calls.at(-1)[0];
    expect(callArg.orderBy[0]).toEqual({ film: { year: { sort: 'desc', nulls: 'last' } } });

    // Unsafe order values should fall back to "asc"
    await fetchScreenings({ sort: 'time', order: 'DROP TABLE' });
    callArg = prisma.screening.findMany.mock.calls.at(-1)[0];
    expect(callArg.orderBy).toEqual([{ start_at_utc: 'asc' }]);
  });
});

describe('findByIds', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns [] when ids is empty', async () => {
    const result = await findByIds({ ids: [], includePast: true });
    expect(result).toEqual([]);
    expect(prisma.screening.findMany).not.toHaveBeenCalled();
  });

  test('when includePast is false, adds is_active=true and start_at_utc>=now to where clause', async () => {
    jest.useFakeTimers();
    const now = new Date('2025-01-10T12:00:00.000Z');
    jest.setSystemTime(now);

    prisma.screening.findMany.mockResolvedValue([]);

    await findByIds({ ids: [1, 2, 3], includePast: false });

    const callArg = prisma.screening.findMany.mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      id: { in: [1, 2, 3] },
      is_active: true,
      start_at_utc: { gte: now },
    });

    expect(callArg.orderBy).toEqual([{ start_at_utc: 'asc' }]);
  });

  test('computes status (inactive/past/upcoming) and maps flattened shape', async () => {
    jest.useFakeTimers();
    const now = new Date('2025-01-10T12:00:00.000Z');
    jest.setSystemTime(now);

    prisma.screening.findMany.mockResolvedValue([
      {
        id: 10,
        start_at_utc: new Date('2025-01-09T12:00:00.000Z'), // past
        end_at_utc: new Date('2025-01-09T14:00:00.000Z'),
        runtime_min: 120,
        tz: 'America/Vancouver',
        is_active: true,
        source_url: 'https://cinema.example/a',
        film: { id: 1, title: 'Past Film', year: 2020, imdb_rating: 7.1, rt_rating_pct: 80 },
        cinema: { id: 100, name: 'Cinema A' },
      },
      {
        id: 11,
        start_at_utc: new Date('2025-01-11T12:00:00.000Z'), // upcoming
        end_at_utc: new Date('2025-01-11T14:00:00.000Z'),
        runtime_min: 90,
        tz: 'America/Vancouver',
        is_active: true,
        source_url: 'https://cinema.example/b',
        film: { id: 2, title: 'Future Film', year: 2025, imdb_rating: null, rt_rating_pct: null },
        cinema: { id: 101, name: 'Cinema B' },
      },
      {
        id: 12,
        start_at_utc: new Date('2025-01-11T12:00:00.000Z'),
        end_at_utc: new Date('2025-01-11T14:00:00.000Z'),
        runtime_min: null,
        tz: 'America/Vancouver',
        is_active: false, // inactive wins over time
        source_url: 'https://cinema.example/c',
        film: { id: 3, title: 'Inactive Film', year: 2024, imdb_rating: 6.0, rt_rating_pct: 50 },
        cinema: { id: 102, name: 'Cinema C' },
      },
    ]);

    const result = await findByIds({ ids: [10, 11, 12], includePast: true });

    expect(result).toEqual([
      {
        id: 10,
        start_at_utc: new Date('2025-01-09T12:00:00.000Z'),
        end_at_utc: new Date('2025-01-09T14:00:00.000Z'),
        runtime_min: 120,
        tz: 'America/Vancouver',
        film_id: 1,
        title: 'Past Film',
        year: 2020,
        imdb_rating: 7.1,
        rt_rating_pct: 80,
        cinema_id: 100,
        cinema_name: 'Cinema A',
        source_url: 'https://cinema.example/a',
        status: 'past',
      },
      {
        id: 11,
        start_at_utc: new Date('2025-01-11T12:00:00.000Z'),
        end_at_utc: new Date('2025-01-11T14:00:00.000Z'),
        runtime_min: 90,
        tz: 'America/Vancouver',
        film_id: 2,
        title: 'Future Film',
        year: 2025,
        imdb_rating: null,
        rt_rating_pct: null,
        cinema_id: 101,
        cinema_name: 'Cinema B',
        source_url: 'https://cinema.example/b',
        status: 'upcoming',
      },
      {
        id: 12,
        start_at_utc: new Date('2025-01-11T12:00:00.000Z'),
        end_at_utc: new Date('2025-01-11T14:00:00.000Z'),
        runtime_min: null,
        tz: 'America/Vancouver',
        film_id: 3,
        title: 'Inactive Film',
        year: 2024,
        imdb_rating: 6.0,
        rt_rating_pct: 50,
        cinema_id: 102,
        cinema_name: 'Cinema C',
        source_url: 'https://cinema.example/c',
        status: 'inactive',
      },
    ]);
  });
});