import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const queryRawUnsafe = jest.fn();

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafe,
  },
}));

const { semanticSearch } = await import('../../src/models/search.js');

beforeEach(() => {
  jest.clearAllMocks();
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
    similarity: 0.42,
    ...overrides,
  };
}

describe('semanticSearch', () => {
  test('pushes date, cinema, and runtime filters into vector SQL', async () => {
    queryRawUnsafe.mockResolvedValue([row()]);

    const result = await semanticSearch({
      queryVec: [0.1, 0.2],
      minSimilarity: 0.2,
      limit: 5,
      offset: 0,
      cinemaIds: [1],
      gte: new Date('2026-01-01T00:00:00Z'),
      lt: new Date('2026-01-08T00:00:00Z'),
      runtimeMax: 120,
    });

    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('s.start_at_utc >=');
    expect(sql).toContain('s.start_at_utc <');
    expect(sql).toContain('s.cinema_id = ANY');
    expect(sql).toContain('s.runtime_min <=');
    expect(params).toContainEqual([1]);
    expect(params).toContain(120);
    expect(result[0]).toMatchObject({
      title: 'The Green Ray',
      imdb_rating: 7.6,
      similarity: 0.42,
      lexical_rank: null,
      retrieval_source: 'vector',
    });
  });
});
