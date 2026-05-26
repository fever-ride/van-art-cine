import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const routeQuery = jest.fn();
const orchestrateSearch = jest.fn();

jest.unstable_mockModule('../../src/services/queryRouter.js', () => ({
  routeQuery,
}));

jest.unstable_mockModule('../../src/services/searchOrchestrator.js', () => ({
  orchestrateSearch,
}));

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

beforeEach(() => {
  jest.clearAllMocks();
  routeQuery.mockResolvedValue({
    mode: 'agentic',
    intent_type: 'discovery_query',
    entities: { person: null, film: null, cinema: null },
    date_hint: null,
  });
  orchestrateSearch.mockResolvedValue({
    mode: 'agentic',
    intent_type: 'discovery_query',
    result_type: 'film_results',
    items: [],
  });
});

describe('GET /api/smart-search', () => {
  test('returns orchestrated smart search result', async () => {
    const res = await request(app).get('/api/smart-search?q=dreamy%20romance');

    expect(res.status).toBe(200);
    expect(res.body.result_type).toBe('film_results');
    expect(routeQuery).toHaveBeenCalledWith('dreamy romance');
    expect(orchestrateSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: 'dreamy romance',
      routing: expect.objectContaining({ mode: 'agentic' }),
      filters: expect.objectContaining({
        cinemaIds: [],
        limit: 20,
        offset: 0,
      }),
    }));
  });

  test('parses cinema_ids and numeric pagination filters', async () => {
    await request(app).get('/api/smart-search?q=noir&cinema_ids=1,abc,3&limit=5&offset=2');

    const filters = orchestrateSearch.mock.calls[0][0].filters;
    expect(filters.cinemaIds).toEqual([1, 3]);
    expect(Number(filters.limit)).toBe(5);
    expect(Number(filters.offset)).toBe(2);
  });

  test('sets degraded header when router degrades', async () => {
    routeQuery.mockResolvedValue({
      mode: 'degraded',
      intent_type: null,
      entities: { person: null, film: null, cinema: null },
      date_hint: null,
    });
    orchestrateSearch.mockResolvedValue({
      mode: 'degraded',
      intent_type: null,
      result_type: 'screening_results',
      items: [],
    });

    const res = await request(app).get('/api/smart-search?q=nosferatu');

    expect(res.status).toBe(200);
    expect(res.headers['x-search-degraded']).toBe('true');
  });

  test('rejects missing q with validation error', async () => {
    const res = await request(app).get('/api/smart-search');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(routeQuery).not.toHaveBeenCalled();
  });
});
