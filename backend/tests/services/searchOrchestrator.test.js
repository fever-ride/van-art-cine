import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const semanticSearch = jest.fn();
const lexicalSearch = jest.fn();
const searchByPerson = jest.fn();
const searchByFilm = jest.fn();
const searchByCinema = jest.fn();
const embedQuery = jest.fn();
const resolveCinemaHint = jest.fn();
const verifyMatches = jest.fn();
const prismaFindMany = jest.fn();
const openAICreate = jest.fn();

jest.unstable_mockModule('../../src/models/search.js', () => ({
  semanticSearch,
}));

jest.unstable_mockModule('../../src/models/lexicalSearch.js', () => ({
  lexicalSearch,
}));

jest.unstable_mockModule('../../src/models/structuredSearch.js', () => ({
  searchByPerson,
  searchByFilm,
  searchByCinema,
}));

jest.unstable_mockModule('../../src/services/embeddingService.js', () => ({
  embedQuery,
}));

jest.unstable_mockModule('../../src/services/cinemaResolver.js', () => ({
  resolveCinemaHint,
}));

jest.unstable_mockModule('../../src/services/verificationService.js', () => ({
  verifyMatches,
}));

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: {
    screening: {
      findMany: prismaFindMany,
    },
  },
}));

class MockOpenAI {
  constructor() {
    return {
      chat: {
        completions: {
          create: openAICreate,
        },
      },
    };
  }
}

jest.unstable_mockModule('openai', () => ({
  default: MockOpenAI,
}));

const { orchestrateSearch } = await import('../../src/services/searchOrchestrator.js');

beforeEach(() => {
  jest.clearAllMocks();
  semanticSearch.mockResolvedValue([]);
  lexicalSearch.mockResolvedValue([]);
  searchByPerson.mockResolvedValue([]);
  searchByFilm.mockResolvedValue([]);
  searchByCinema.mockResolvedValue([]);
  embedQuery.mockResolvedValue([0.1, 0.2]);
  resolveCinemaHint.mockResolvedValue([]);
  verifyMatches.mockResolvedValue([]);
  prismaFindMany.mockResolvedValue([]);
});

function screeningRow(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    film_id: overrides.film_id ?? 10,
    title: overrides.title ?? 'The Green Ray',
    start_at_utc: overrides.start_at_utc ?? new Date('2026-06-11T01:30:00Z'),
    end_at_utc: overrides.end_at_utc ?? new Date('2026-06-11T03:00:00Z'),
    runtime_min: overrides.runtime_min ?? 98,
    tz: 'America/Vancouver',
    cinema_id: overrides.cinema_id ?? 1,
    cinema_name: overrides.cinema_name ?? 'The Cinematheque',
    year: overrides.year ?? 1986,
    genre: overrides.genre ?? 'Drama, Romance',
    language: overrides.language ?? 'French',
    country: overrides.country ?? 'France',
    description: overrides.description ?? 'A melancholic romance.',
    rated: null,
    awards: null,
    imdb_rating: null,
    rt_rating_pct: null,
    imdb_votes: null,
    imdb_url: null,
    imdb_id: null,
    tmdb_id: null,
    source_url: overrides.source_url ?? 'https://example.com',
    directors: null,
    similarity: overrides.similarity ?? 0.33,
    lexical_rank: overrides.lexical_rank ?? null,
    retrieval_source: overrides.retrieval_source ?? 'vector',
  };
}

function prismaScreening(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    film_id: overrides.film_id ?? 10,
    cinema_id: overrides.cinema_id ?? 1,
    start_at_utc: overrides.start_at_utc ?? new Date('2026-06-11T01:30:00Z'),
    end_at_utc: overrides.end_at_utc ?? new Date('2026-06-11T03:00:00Z'),
    runtime_min: overrides.runtime_min ?? 88,
    tz: 'America/Vancouver',
    source_url: overrides.source_url ?? 'https://example.com',
    film: {
      title: overrides.title ?? 'Short Film',
      year: overrides.year ?? 2026,
      genre: overrides.genre ?? 'Drama',
    },
    cinema: {
      name: overrides.cinema_name ?? 'The Cinematheque',
    },
  };
}

function mockExtraction(body) {
  openAICreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(body) } }],
  });
}

describe('orchestrateSearch structured responses', () => {
  test('returns film_showtimes grouped by film for known film queries', async () => {
    searchByFilm.mockResolvedValue([
      screeningRow({ id: 1, film_id: 10, title: 'The Green Ray' }),
      screeningRow({ id: 2, film_id: 10, title: 'The Green Ray' }),
    ]);

    const result = await orchestrateSearch({
      query: 'when is The Green Ray playing',
      routing: {
        mode: 'structured',
        intent_type: 'known_film_query',
        entities: { person: null, film: 'The Green Ray', cinema: null },
        date_hint: null,
        runtime_max: null,
      },
      filters: { cinemaIds: [], limit: 5 },
    });

    expect(result.result_type).toBe('film_showtimes');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('The Green Ray');
    expect(result.items[0].showtimes).toHaveLength(2);
  });

  test('returns cinema_schedule for known cinema queries', async () => {
    resolveCinemaHint.mockResolvedValue([1]);
    searchByCinema.mockResolvedValue([
      screeningRow({ id: 1, title: 'A Film', start_at_utc: new Date('2026-01-01T20:00:00Z') }),
      screeningRow({ id: 2, title: 'B Film', start_at_utc: new Date('2026-01-01T19:00:00Z') }),
    ]);

    const result = await orchestrateSearch({
      query: "what's at the Cinematheque",
      routing: {
        mode: 'structured',
        intent_type: 'known_cinema_query',
        entities: { person: null, film: null, cinema: 'Cinematheque' },
        date_hint: null,
        runtime_max: null,
      },
      filters: { cinemaIds: [], limit: 5 },
    });

    expect(result.result_type).toBe('cinema_schedule');
    expect(result.items.map((item) => item.title)).toEqual(['B Film', 'A Film']);
  });

  test('returns empty_with_fallback for structured no results', async () => {
    searchByPerson.mockResolvedValue([]);

    const result = await orchestrateSearch({
      query: 'Tarantino this week',
      routing: {
        mode: 'structured',
        intent_type: 'known_person_query',
        entities: { person: 'Tarantino', film: null, cinema: null },
        date_hint: null,
        runtime_max: null,
      },
      filters: { cinemaIds: [], limit: 5 },
    });

    expect(result.result_type).toBe('empty_with_fallback');
    expect(result.fallback_available).toBe(true);
  });
});

describe('orchestrateSearch agentic responses', () => {
  test('returns film_results with showtimes deduped by film', async () => {
    mockExtraction({
      vibe_keywords: 'dreamy melancholic romance',
      intent_type: 'discovery_query',
      presentation_hint: 'film_results',
      complex: false,
    });
    semanticSearch.mockResolvedValue([
      screeningRow({ id: 1, film_id: 10, title: 'The Green Ray' }),
      screeningRow({ id: 2, film_id: 10, title: 'The Green Ray' }),
      screeningRow({ id: 3, film_id: 11, title: 'The Deep Blue Sea' }),
    ]);
    verifyMatches.mockResolvedValue([
      { film_id: 10, score: 8 },
      { film_id: 11, score: 9 },
    ]);

    const result = await orchestrateSearch({
      query: 'dreamy melancholic romance',
      routing: {
        mode: 'agentic',
        intent_type: 'discovery_query',
        entities: { person: null, film: null, cinema: null },
        date_hint: null,
      },
      filters: { cinemaIds: [], limit: 5 },
    });

    expect(result.result_type).toBe('film_results');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe('The Deep Blue Sea');
    expect(result.items[1].title).toBe('The Green Ray');
    expect(result.items[1].showtimes).toHaveLength(2);
  });

  test('returns screening_results for pure constraint-heavy SQL queries', async () => {
    prismaFindMany.mockResolvedValue([
      prismaScreening({ id: 1, title: 'Short Film', runtime_min: 82 }),
    ]);

    const result = await orchestrateSearch({
      query: 'tonight under 90 minutes',
      routing: {
        mode: 'structured',
        intent_type: 'constraint_heavy_query',
        entities: { person: null, film: null, cinema: null },
        date_hint: 'tonight',
        runtime_max: 90,
      },
      filters: { cinemaIds: [], limit: 5 },
    });

    expect(result.intent_type).toBe('constraint_heavy_query');
    expect(result.result_type).toBe('screening_results');
    expect(result.items[0]).toMatchObject({
      title: 'Short Film',
      runtime_min: 82,
    });
    expect(openAICreate).not.toHaveBeenCalled();
    expect(embedQuery).not.toHaveBeenCalled();
    expect(semanticSearch).not.toHaveBeenCalled();
    expect(lexicalSearch).not.toHaveBeenCalled();
    expect(verifyMatches).not.toHaveBeenCalled();
    expect(prismaFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        runtime_min: { lte: 90 },
      }),
    }));
  });

  test('keeps genre/mood queries on film_results even with hard constraints', async () => {
    mockExtraction({
      vibe_keywords: 'light comedy fun uplifting cheerful date night',
      keyword_terms: 'light comedy',
      intent_type: 'discovery_query',
      presentation_hint: 'film_results',
      runtime_max: 120,
      date_hint: 'tonight',
      complex: false,
    });
    semanticSearch.mockResolvedValue([
      screeningRow({ id: 1, film_id: 12, title: 'Meet Me In St. Louis', runtime_min: 113 }),
    ]);
    verifyMatches.mockResolvedValue([{ film_id: 12, score: 8 }]);

    const result = await orchestrateSearch({
      query: 'light comedy tonight under 2 hours',
      routing: {
        mode: 'agentic',
        intent_type: 'constraint_heavy_query',
        entities: { person: null, film: null, cinema: null },
        date_hint: 'tonight',
      },
      filters: { cinemaIds: [], limit: 5 },
    });

    expect(result.intent_type).toBe('discovery_query');
    expect(result.result_type).toBe('film_results');
    expect(result.items[0].title).toBe('Meet Me In St. Louis');
    expect(semanticSearch).toHaveBeenCalledWith(expect.objectContaining({
      runtimeMax: 120,
    }));
    expect(lexicalSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: 'light comedy',
      runtimeMax: 120,
    }));
  });

  test('uses enriched vibe keywords for vector recall and conservative keyword terms for lexical recall', async () => {
    mockExtraction({
      vibe_keywords: 'dreamy melancholic romance atmospheric emotional art film',
      keyword_terms: 'melancholic romance',
      intent_type: 'discovery_query',
      presentation_hint: 'film_results',
      complex: false,
    });
    semanticSearch.mockResolvedValue([
      screeningRow({ id: 1, film_id: 10, title: 'The Green Ray' }),
    ]);
    verifyMatches.mockResolvedValue([{ film_id: 10, score: 8 }]);

    await orchestrateSearch({
      query: 'dreamy melancholic romance',
      routing: {
        mode: 'agentic',
        intent_type: 'discovery_query',
        entities: { person: null, film: null, cinema: null },
        date_hint: null,
      },
      filters: { cinemaIds: [], limit: 5 },
    });

    expect(embedQuery).toHaveBeenCalledWith(
      'dreamy melancholic romance atmospheric emotional art film'
    );
    expect(lexicalSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: 'melancholic romance',
    }));
  });
});
