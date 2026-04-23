import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const fetchScreeningsMock = jest.fn();
const findByIdsMock = jest.fn();

jest.unstable_mockModule('../../src/models/screenings.js', () => ({
  fetchScreenings: fetchScreeningsMock,
  findByIds: findByIdsMock,
}));

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/screenings', () => {
  test('returns items from fetchScreenings', async () => {
    const rows = [{ id: 1, title: 'Test Film' }];
    fetchScreeningsMock.mockResolvedValue(rows);

    const res = await request(app).get('/api/screenings');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(rows);
    expect(fetchScreeningsMock).toHaveBeenCalledTimes(1);
  });

  test('passes query params to fetchScreenings', async () => {
    fetchScreeningsMock.mockResolvedValue([]);

    await request(app).get('/api/screenings?date=2025-01-01&cinema_ids=1,2&q=noir&sort=title&order=desc&limit=10&offset=5');

    const opts = fetchScreeningsMock.mock.calls[0][0];
    expect(opts.date).toBe('2025-01-01');
    expect(opts.cinemaIds).toEqual([1, 2]);
    expect(opts.q).toBe('noir');
    expect(opts.sort).toBe('title');
    expect(opts.order).toBe('desc');
    expect(Number(opts.limit)).toBe(10);
    expect(Number(opts.offset)).toBe(5);
  });

  test('rejects invalid sort value with 400', async () => {
    const res = await request(app).get('/api/screenings?sort=invalid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects invalid date with 400', async () => {
    const res = await request(app).get('/api/screenings?date=not-a-date');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects limit out of range', async () => {
    const res = await request(app).get('/api/screenings?limit=999');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('returns 500 when model throws', async () => {
    fetchScreeningsMock.mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/screenings');

    expect(res.status).toBe(500);
  });
});

describe('POST /api/screenings/bulk', () => {
  test('returns items in requested order', async () => {
    const rows = [
      { id: 3, title: 'C' },
      { id: 1, title: 'A' },
    ];
    findByIdsMock.mockResolvedValue(rows);

    const res = await request(app)
      .post('/api/screenings/bulk')
      .send({ ids: [1, 3] });

    expect(res.status).toBe(200);
    expect(res.body.items[0].id).toBe(1);
    expect(res.body.items[1].id).toBe(3);
  });

  test('returns empty items for empty ids array', async () => {
    const res = await request(app)
      .post('/api/screenings/bulk')
      .send({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects missing ids', async () => {
    const res = await request(app)
      .post('/api/screenings/bulk')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects non-integer ids', async () => {
    const res = await request(app)
      .post('/api/screenings/bulk')
      .send({ ids: ['abc'] });

    expect(res.status).toBe(400);
  });
});
