import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const getFilmByIdMock = jest.fn();
const getFilmPeopleMock = jest.fn();
const getUpcomingForFilmMock = jest.fn();

jest.unstable_mockModule('../../src/models/films.js', () => ({
  getFilmById: getFilmByIdMock,
  getFilmPeople: getFilmPeopleMock,
  getUpcomingForFilm: getUpcomingForFilmMock,
}));

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/films/:id', () => {
  test('returns film with people and upcoming screenings', async () => {
    getFilmByIdMock.mockResolvedValue({ id: 1, title: 'Test Film' });
    getFilmPeopleMock.mockResolvedValue({
      directors: ['Director A'],
      writers: ['Writer B'],
      cast: ['Actor C'],
    });
    getUpcomingForFilmMock.mockResolvedValue([{ id: 10, start_at_utc: '2025-06-01T10:00:00Z' }]);

    const res = await request(app).get('/api/films/1');

    expect(res.status).toBe(200);
    expect(res.body.film.title).toBe('Test Film');
    expect(res.body.film.directors).toEqual(['Director A']);
    expect(res.body.film.writers).toEqual(['Writer B']);
    expect(res.body.film.cast).toEqual(['Actor C']);
    expect(res.body.upcoming).toHaveLength(1);
  });

  test('returns 404 when film not found', async () => {
    getFilmByIdMock.mockResolvedValue(null);

    const res = await request(app).get('/api/films/999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('rejects non-integer id with 400', async () => {
    const res = await request(app).get('/api/films/abc');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects negative id with 400', async () => {
    const res = await request(app).get('/api/films/-1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
