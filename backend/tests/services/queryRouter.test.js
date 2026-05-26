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
    });

    await expect(routeQuery('when is The Green Ray playing')).resolves.toEqual({
      mode: 'structured',
      intent_type: 'known_film_query',
      entities: { person: null, film: 'The Green Ray', cinema: null },
      date_hint: null,
    });
  });

  test('returns structured cinema intent for known cinema queries', async () => {
    mockRouterResponse({
      mode: 'structured',
      intent_type: 'known_cinema_query',
      entities: { person: null, film: null, cinema: 'Rio' },
      date_hint: 'tonight',
    });

    await expect(routeQuery("what's at the Rio tonight")).resolves.toEqual({
      mode: 'structured',
      intent_type: 'known_cinema_query',
      entities: { person: null, film: null, cinema: 'Rio' },
      date_hint: 'tonight',
    });
  });

  test('normalizes valid agentic constraint-heavy intent', async () => {
    mockRouterResponse({
      mode: 'agentic',
      intent_type: 'constraint_heavy_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: 'tonight',
    });

    await expect(routeQuery('tonight under 90 minutes')).resolves.toEqual({
      mode: 'agentic',
      intent_type: 'constraint_heavy_query',
      entities: { person: null, film: null, cinema: null },
      date_hint: 'tonight',
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
    });
  });
});
