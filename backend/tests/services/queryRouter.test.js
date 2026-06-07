import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const openAICreate = jest.fn();

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

const { routeQuery } = await import('../../src/services/queryRouter.js');

beforeEach(() => {
  jest.clearAllMocks();
});

function mockRouterResponse(body) {
  openAICreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(body) } }],
  });
}

describe('routeQuery', () => {
  test('returns structured film intent for known film queries', async () => {
    mockRouterResponse({
      mode: 'structured',
      intent_type: 'known_film_query',
      entities: { person: null, film: 'The Green Ray', cinema: null },
      date_hint: null,
      runtime_max: null,
    });

    await expect(routeQuery('when is The Green Ray playing')).resolves.toEqual({
      mode: 'structured',
      intent_type: 'known_film_query',
      entities: { person: null, film: 'The Green Ray', cinema: null },
      date_hint: null,
      runtime_max: null,
    });
  });

  test('returns structured cinema intent for known cinema queries', async () => {
    mockRouterResponse({
      mode: 'structured',
      intent_type: 'known_cinema_query',
      entities: { person: null, film: null, cinema: 'Rio' },
      date_hint: 'tonight',
      runtime_max: null,
    });

    await expect(routeQuery("what's at the Rio tonight")).resolves.toEqual({
      mode: 'structured',
      intent_type: 'known_cinema_query',
      entities: { person: null, film: null, cinema: 'Rio' },
      date_hint: 'tonight',
      runtime_max: null,
    });
  });

  test('routes pure constraint-heavy queries to structured SQL mode', async () => {
    mockRouterResponse({
      mode: 'structured',
      intent_type: 'constraint_heavy_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: 'tonight',
      runtime_max: 90,
    });

    await expect(routeQuery('tonight under 90 minutes')).resolves.toEqual({
      mode: 'structured',
      intent_type: 'constraint_heavy_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: 'tonight',
      runtime_max: 90,
    });
  });

  test('normalizes constraint-heavy intent to structured even if model returns agentic', async () => {
    mockRouterResponse({
      mode: 'agentic',
      intent_type: 'constraint_heavy_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: 'tomorrow',
      runtime_max: 120,
    });

    await expect(routeQuery("what's playing tomorrow under 2 hours")).resolves.toEqual({
      mode: 'structured',
      intent_type: 'constraint_heavy_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: 'tomorrow',
      runtime_max: 120,
    });
  });

  test('keeps subjective constraint-heavy model output on agentic discovery path', async () => {
    mockRouterResponse({
      mode: 'agentic',
      intent_type: 'constraint_heavy_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: 'tonight',
      runtime_max: 120,
    });

    await expect(routeQuery('light comedy tonight under 2 hours')).resolves.toEqual({
      mode: 'agentic',
      intent_type: 'discovery_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: 'tonight',
      runtime_max: 120,
    });
  });

  test('falls back to agentic discovery intent on malformed JSON', async () => {
    openAICreate.mockResolvedValue({
      choices: [{ message: { content: '{not json' } }],
    });

    await expect(routeQuery('dreamy romance')).resolves.toEqual({
      mode: 'agentic',
      intent_type: 'discovery_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: null,
      runtime_max: null,
    });
  });
});
