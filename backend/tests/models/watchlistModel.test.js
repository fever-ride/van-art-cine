import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const prismaMock = {
  watchlist_screening: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: prismaMock,
}));

const {
  addWatchlistScreening,
  removeWatchlistScreening,
  isInWatchlist,
  listWatchlist,
  addManyWatchlistScreenings,
  countWatchlist,
} = await import('../../src/models/watchlistModel.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('addWatchlistScreening', () => {
  test('returns true when a new row is inserted', async () => {
    prismaMock.watchlist_screening.createMany.mockResolvedValue({ count: 1 });
    const ok = await addWatchlistScreening({ userUid: 5n, screeningId: 10 });
    expect(ok).toBe(true);
    expect(prismaMock.watchlist_screening.createMany).toHaveBeenCalledWith({
      data: [{ user_uid: 5n, screening_id: 10 }],
      skipDuplicates: true,
    });
  });

  test('returns false when duplicate skipped', async () => {
    prismaMock.watchlist_screening.createMany.mockResolvedValue({ count: 0 });
    const ok = await addWatchlistScreening({ userUid: 1, screeningId: 2 });
    expect(ok).toBe(false);
  });
});

describe('removeWatchlistScreening', () => {
  test('returns true when a row was deleted', async () => {
    prismaMock.watchlist_screening.deleteMany.mockResolvedValue({ count: 1 });
    const ok = await removeWatchlistScreening({ userUid: 3, screeningId: 9 });
    expect(ok).toBe(true);
  });

  test('returns false when nothing deleted', async () => {
    prismaMock.watchlist_screening.deleteMany.mockResolvedValue({ count: 0 });
    const ok = await removeWatchlistScreening({ userUid: 3, screeningId: 9 });
    expect(ok).toBe(false);
  });
});

describe('isInWatchlist', () => {
  test('returns true when row exists', async () => {
    prismaMock.watchlist_screening.findFirst.mockResolvedValue({ screening_id: 1 });
    await expect(isInWatchlist({ userUid: 1, screeningId: 1 })).resolves.toBe(true);
  });

  test('returns false when missing', async () => {
    prismaMock.watchlist_screening.findFirst.mockResolvedValue(null);
    await expect(isInWatchlist({ userUid: 1, screeningId: 2 })).resolves.toBe(false);
  });
});

describe('addManyWatchlistScreenings', () => {
  test('returns inserted count', async () => {
    prismaMock.watchlist_screening.createMany.mockResolvedValue({ count: 2 });
    const out = await addManyWatchlistScreenings({
      userUid: 7n,
      screeningIds: [1, 2, 2],
    });
    expect(out.inserted).toBe(2);
  });

  test('returns 0 for empty ids', async () => {
    const out = await addManyWatchlistScreenings({ userUid: 1, screeningIds: [] });
    expect(out.inserted).toBe(0);
    expect(prismaMock.watchlist_screening.createMany).not.toHaveBeenCalled();
  });
});

describe('countWatchlist', () => {
  test('returns numeric count', async () => {
    prismaMock.watchlist_screening.count.mockResolvedValue(4);
    await expect(countWatchlist({ userUid: 1 })).resolves.toBe(4);
  });
});

describe('listWatchlist', () => {
  const now = new Date('2025-06-15T12:00:00.000Z');

  test('maps rows and sorts by status priority', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    prismaMock.watchlist_screening.findMany.mockResolvedValue([
      {
        screening_id: 1,
        screening: {
          id: 1,
          start_at_utc: new Date('2025-06-20T10:00:00.000Z'),
          end_at_utc: new Date('2025-06-20T12:00:00.000Z'),
          runtime_min: 120,
          tz: 'America/Vancouver',
          is_active: true,
          source_url: 'https://x',
          film: { id: 9, title: 'A', year: 2024, imdb_rating: 7, rt_rating_pct: 80 },
          cinema: { id: 3, name: 'Cine' },
        },
      },
      {
        screening_id: 2,
        screening: null,
      },
    ]);

    const rows = await listWatchlist({ userUid: 1n, includePast: true, limit: 10, offset: 0 });

    expect(rows[0].status).toBe('upcoming');
    expect(rows[1].status).toBe('missing');

    jest.useRealTimers();
  });
});
