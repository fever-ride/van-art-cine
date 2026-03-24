import { describe, test, expect, beforeAll } from '@jest/globals';

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-32bytes!!';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32bytes!!';
});

const jwtUtils = await import('../../src/utils/jwt.js');

describe('jwt utils', () => {
  const user = { uid: 1001, role: 'user' };

  test('signAccess + verifyAccess round-trip', () => {
    const token = jwtUtils.signAccess(user);
    const payload = jwtUtils.verifyAccess(token);
    expect(payload.uid).toBe(1001);
    expect(payload.role).toBe('user');
  });

  test('signRefresh + verifyRefresh round-trip', () => {
    const token = jwtUtils.signRefresh(user);
    const payload = jwtUtils.verifyRefresh(token);
    expect(payload.uid).toBe(1001);
    expect(payload.jti).toBeDefined();
  });

  test('verifyAccess throws on wrong secret / tampered token', () => {
    const token = jwtUtils.signAccess(user);
    process.env.JWT_ACCESS_SECRET = 'different-access-secret-key-32bytes';
    expect(() => jwtUtils.verifyAccess(token)).toThrow();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-32bytes!!';
  });

  test('cookie option objects expose expected keys', () => {
    expect(jwtUtils.accessCookieOptions).toMatchObject({
      httpOnly: true,
      path: '/',
    });
    expect(jwtUtils.refreshCookieOptions.maxAge).toBeGreaterThan(0);
    expect(jwtUtils.clearCookieOptions.expires).toEqual(new Date(0));
  });
});
