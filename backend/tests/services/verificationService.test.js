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

const { verifyMatches } = await import('../../src/services/verificationService.js');

beforeEach(() => {
  jest.clearAllMocks();
});

const candidates = [
  { film_id: 10, title: 'The Green Ray', year: 1986, genre: 'Drama', description: 'A summer romance.' },
  { film_id: 11, title: 'Happy Together', year: 1997, genre: 'Drama', description: 'A breakup drama.' },
];

function mockScores(scores) {
  openAICreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ scores }) } }],
  });
}

describe('verifyMatches', () => {
  test('maps LLM indices to film ids for simple verification', async () => {
    mockScores([
      { index: 1, score: 8 },
      { index: 2, score: 2 },
    ]);

    const result = await verifyMatches({
      query: 'light romance',
      candidates,
      complex: false,
    });

    expect(openAICreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-mini',
    }));
    expect(result).toEqual([
      { film_id: 10, score: 8, explanation: null },
      { film_id: 11, score: 2, explanation: null },
    ]);
  });

  test('uses gpt-4o and includes explanations for complex queries', async () => {
    mockScores([{ index: 1, score: 9, explanation: 'A thoughtful fit.' }]);

    const result = await verifyMatches({
      query: 'movie my film-buff friend would respect',
      candidates,
      complex: true,
    });

    expect(openAICreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o',
    }));
    expect(result).toEqual([
      { film_id: 10, score: 9, explanation: 'A thoughtful fit.' },
    ]);
  });

  test('filters invalid LLM indices', async () => {
    mockScores([
      { index: 0, score: 10 },
      { index: 3, score: 10 },
      { index: 1, score: 7 },
    ]);

    const result = await verifyMatches({
      query: 'romance',
      candidates,
      complex: false,
    });

    expect(result).toEqual([{ film_id: 10, score: 7, explanation: null }]);
  });

  test('returns empty array on malformed JSON', async () => {
    openAICreate.mockResolvedValue({
      choices: [{ message: { content: '{bad json' } }],
    });

    await expect(verifyMatches({
      query: 'romance',
      candidates,
      complex: false,
    })).resolves.toEqual([]);
  });

  test('does not call OpenAI for empty candidates', async () => {
    await expect(verifyMatches({
      query: 'romance',
      candidates: [],
      complex: false,
    })).resolves.toEqual([]);
    expect(openAICreate).not.toHaveBeenCalled();
  });
});
