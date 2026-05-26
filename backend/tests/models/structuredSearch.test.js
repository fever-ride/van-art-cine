import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const queryRawUnsafe = jest.fn();

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafe,
  },
}));

const {
  searchByPerson,
  searchByFilm,
  searchByCinema,
} = await import('../../src/models/structuredSearch.js');

beforeEach(() => {
  jest.clearAllMocks();
  queryRawUnsafe.mockResolvedValue([]);
});

function row(overrides = {}) {
  return {
    id: 1,
    title: 'The Green Ray',
    start_at_utc: new Date('2026-01-01T20:00:00Z'),
    end_at_utc: new Date('2026-01-01T22:00:00Z'),
    runtime_min: 98,
    tz: 'America/Vancouver',
    cinema_id: 1,
    cinema_name: 'The Cinematheque',
    film_id: 10,
    year: 1986,
    genre: 'Drama',
    language: 'French',
    country: 'France',
    description: 'A summer story.',
    rated: null,
    awards: null,
    imdb_rating: '7.6',
    rt_rating_pct: 95,
    imdb_votes: 1000,
    imdb_url: 'https://imdb.example',
    imdb_id: 'tt0091830',
    tmdb_id: 123,
    source_url: 'https://example.com',
    ...overrides,
  };
}

describe('structuredSearch', () => {
  test('searchByPerson joins person table and maps rows', async () => {
    queryRawUnsafe.mockResolvedValue([row()]);

    const result = await searchByPerson({
      personName: 'Rohmer',
      cinemaIds: [1],
      gte: new Date('2026-01-01T00:00:00Z'),
      lt: new Date('2026-01-08T00:00:00Z'),
    });

    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('JOIN film_person');
    expect(sql).toContain('JOIN person');
    expect(sql).toContain('p.name ILIKE');
    expect(sql).toContain('s.cinema_id = ANY');
    expect(params[0]).toBe('%Rohmer%');
    expect(result[0]).toMatchObject({
      title: 'The Green Ray',
      imdb_rating: 7.6,
      similarity: null,
    });
  });

  test('searchByFilm normalizes smart quotes for normalized_title matching', async () => {
    await searchByFilm({ filmTitle: 'It’s Such a Beautiful Day' });

    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('f.normalized_title ILIKE');
    expect(params).toEqual([
      '%It’s Such a Beautiful Day%',
      "%it's such a beautiful day%",
    ]);
  });

  test('searchByCinema filters by cinema ids and date range', async () => {
    await searchByCinema({
      cinemaIds: [1, 2],
      gte: new Date('2026-01-01T00:00:00Z'),
      lt: new Date('2026-01-08T00:00:00Z'),
    });

    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('s.cinema_id = ANY');
    expect(sql).toContain('s.start_at_utc >=');
    expect(sql).toContain('s.start_at_utc <');
    expect(params[0]).toEqual([1, 2]);
  });
});
