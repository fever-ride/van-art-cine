import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const queryRawUnsafe = jest.fn();

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafe,
  },
}));

const { lexicalSearch } = await import('../../src/models/lexicalSearch.js');

beforeEach(() => {
  jest.clearAllMocks();
});

function row(overrides = {}) {
  return {
    id: 1,
    title: 'Happy Together',
    start_at_utc: new Date('2026-01-01T20:00:00Z'),
    end_at_utc: new Date('2026-01-01T22:00:00Z'),
    runtime_min: 96,
    tz: 'America/Vancouver',
    cinema_id: 1,
    cinema_name: 'VIFF Centre',
    film_id: 10,
    year: 1997,
    genre: 'Drama',
    language: 'Cantonese',
    country: 'Hong Kong',
    description: 'A relationship drama.',
    rated: null,
    awards: null,
    imdb_rating: '7.7',
    rt_rating_pct: 80,
    imdb_votes: 1000,
    imdb_url: 'https://imdb.example',
    imdb_id: 'tt0118845',
    tmdb_id: 18329,
    source_url: 'https://example.com',
    lexical_rank: 3,
    ...overrides,
  };
}

describe('lexicalSearch', () => {
  test('returns empty array for blank query without SQL call', async () => {
    await expect(lexicalSearch({ query: '   ' })).resolves.toEqual([]);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  test('builds full-text SQL and maps result shape', async () => {
    queryRawUnsafe.mockResolvedValue([row()]);

    const result = await lexicalSearch({
      query: 'happy together',
      limit: 5,
      offset: 0,
      cinemaIds: [1, 2],
      gte: new Date('2026-01-01T00:00:00Z'),
      lt: new Date('2026-01-08T00:00:00Z'),
      runtimeMax: 120,
    });

    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('websearch_to_tsquery');
    expect(sql).toContain('film_search_vector');
    expect(sql).toContain('s.cinema_id = ANY');
    expect(sql).toContain('s.runtime_min <=');
    expect(params[0]).toBe('happy together');
    expect(params).toContainEqual([1, 2]);
    expect(params).toContain(120);
    expect(params.at(-2)).toBe(5);
    expect(params.at(-1)).toBe(0);
    expect(result[0]).toMatchObject({
      title: 'Happy Together',
      imdb_rating: 7.7,
      similarity: null,
      lexical_rank: 3,
      retrieval_source: 'lexical',
    });
  });
});
