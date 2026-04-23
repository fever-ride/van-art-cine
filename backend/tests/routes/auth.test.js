import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const svcMock = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
};

jest.unstable_mockModule('../../src/services/authService.js', () => svcMock);

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

const { AuthError } = await import('../../src/utils/errors.js');
const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/register', () => {
  test('returns 201 and sets cookies on success', async () => {
    svcMock.register.mockResolvedValue({
      user: { uid: 1, email: 'a@b.com' },
      accessToken: 'acc-token',
      refreshToken: 'ref-token',
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('a@b.com');
    expect(res.body.message).toBe('Registered successfully');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('rejects missing email with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects short password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects invalid email with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  test('returns 200 and sets cookies on success', async () => {
    svcMock.login.mockResolvedValue({
      user: { uid: 1 },
      accessToken: 'acc',
      refreshToken: 'ref',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Log in successfully');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('returns 401 for bad credentials', async () => {
    svcMock.login.mockRejectedValue(
      new AuthError('Wrong', 'BAD_CREDENTIALS', 401)
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  test('returns 401 for non-existent email', async () => {
    svcMock.login.mockRejectedValue(
      new AuthError('Not found', 'EMAIL_NOT_EXIST', 401)
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@y.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /api/auth/refresh', () => {
  test('returns 200 with new tokens via cookie', async () => {
    svcMock.refresh.mockResolvedValue({
      user: { uid: 1 },
      accessToken: 'new-acc',
      refreshToken: 'new-ref',
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=a-valid-refresh-token-that-is-long-enough');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Tokens refreshed');
  });

  test('returns 400 when no refresh token provided', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/logout', () => {
  test('returns 401 without access token', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns 401 without access token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});
