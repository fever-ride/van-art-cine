import { describe, test, expect, jest } from '@jest/globals';

/**
 * Mock the Prisma client module.
 * Only mock the pieces used by `listCinemas()` to keep the mock minimal.
 */
jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: {
    cinema: {
      findMany: jest.fn(),
    },
  },
}));

/**
 * Load modules After mocking so the model receives the mocked Prisma client.
 */
const { prisma } = await import('../../src/lib/prismaClient.js');
const { listCinemas } = await import('../../src/models/cinemas.js');

describe('listCinemas model', () => {
  test('returns cinemas ordered by name and filters out empty or whitespace-only names', async () => {
    /**
     * Define the mocked return value for prisma.cinema.findMany.
     */
    prisma.cinema.findMany.mockResolvedValue([
      { id: 1, name: 'Vancity Theatre' },
      { id: 2, name: '' },
      { id: 3, name: '   ' },
      { id: 4, name: 'Rio Theatre' },
    ]);

    /**
     * Call the model function.
     */
    const result = await listCinemas();

    /**
     * Verify we query Prisma with the expected shape.
     */
    expect(prisma.cinema.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      where: { name: { not: '' } },
      orderBy: { name: 'asc' },
    });

    /**
     * Ensure that:
     * - cinemas with empty names are removed
     * - cinemas with whitespace-only names are removed
     * - valid cinemas remain (in the same order returned by Prisma)
     */
    expect(result).toEqual([
      { id: 1, name: 'Vancity Theatre' },
      { id: 4, name: 'Rio Theatre' },
    ]);
  });
});