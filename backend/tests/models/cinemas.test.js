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

/** Helper: a cinema row shaped like what our Prisma select actually returns. */
const row = (id, name, screeningCount) => ({
  id,
  name,
  _count: { screening: screeningCount },
});

describe('listCinemas model', () => {
  test('queries Prisma with an unfiltered screening count, ordered by name', async () => {
    prisma.cinema.findMany.mockResolvedValue([]);

    await listCinemas();

    expect(prisma.cinema.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        _count: { select: { screening: true } },
      },
      where: { name: { not: '' } },
      orderBy: { name: 'asc' },
    });
  });

  test('filters out empty/whitespace-only names and cinemas that never had any screening', async () => {
    prisma.cinema.findMany.mockResolvedValue([
      row(1, 'Vancity Theatre', 3),
      row(2, '', 5),
      row(3, '   ', 5),
      row(4, 'Rio Theatre', 2),
      row(5, 'VIFF Centre', 0), // real example: exists in the DB, 0 screenings ever
    ]);

    const result = await listCinemas();

    // 'Rio Theatre' is pinned, so it sorts first even though 'Vancity Theatre'
    // is alphabetically earlier and both have screenings.
    expect(result).toEqual([
      { id: 4, name: 'Rio Theatre' },
      { id: 1, name: 'Vancity Theatre' },
    ]);
  });

  test('keeps a cinema with no upcoming screenings as long as it has had one at some point', async () => {
    // This is the behavior distinction that matters: the filter is "has this
    // cinema ever had a screening" (permanent, only excludes stray empty
    // placeholder rows), not "does it have something on right now" (which
    // would make cinemas flicker in and out of the list as bookings expire).
    prisma.cinema.findMany.mockResolvedValue([
      row(1, 'Rio Theatre', 1), // e.g. a single past screening, nothing upcoming
    ]);

    const result = await listCinemas();

    expect(result).toEqual([{ id: 1, name: 'Rio Theatre' }]);
  });

  test('pins known high-traffic cinemas first, alphabetically within each group', async () => {
    prisma.cinema.findMany.mockResolvedValue([
      row(1, 'Chan Centre for the Performing Arts', 1),
      row(2, 'Rio Theatre', 1),
      row(3, 'The Cinematheque', 1),
      row(4, 'The Pearl', 1),
      row(5, 'VIFF Centre - Lochmaddy Studio Theatre', 1),
      row(6, 'VIFF Centre - VIFF Cinema', 1),
    ]);

    const result = await listCinemas();

    expect(result.map((c) => c.name)).toEqual([
      // pinned group, alphabetical
      'Rio Theatre',
      'The Cinematheque',
      'VIFF Centre - Lochmaddy Studio Theatre',
      'VIFF Centre - VIFF Cinema',
      // everything else, alphabetical
      'Chan Centre for the Performing Arts',
      'The Pearl',
    ]);
  });
});
