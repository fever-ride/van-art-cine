import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const logout = jest.fn();
jest.unstable_mockModule('../../src/services/authService.js', () => ({
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout,
}));

const { logoutHandler } = await import('../../src/controllers/authController.js');
const { default: authRouter } = await import('../../src/routes/auth.js');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.clearCookie = jest.fn(() => res);
  return res;
}

describe('POST /api/auth/logout is idempotent', () => {
  beforeEach(() => logout.mockReset());

  test('route is public — no requireAuth in front of the handler', () => {
    const layer = authRouter.stack.find(
      (l) => l.route?.path === '/logout' && l.route.methods.post,
    );
    expect(layer).toBeDefined();
    const handlers = layer.route.stack.map((s) => s.handle);
    expect(handlers).toEqual([logoutHandler]);
  });

  test('with a refresh cookie: revokes it, clears both cookies, 200', async () => {
    const res = mockRes();
    const next = jest.fn();
    await logoutHandler({ cookies: { refresh_token: 'rt' } }, res, next);

    expect(logout).toHaveBeenCalledWith({ refreshToken: 'rt' });
    expect(res.clearCookie.mock.calls.map((c) => c[0])).toEqual(['access_token', 'refresh_token']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('already logged out (no cookies, no user): still clears and returns 200', async () => {
    const res = mockRes();
    const next = jest.fn();
    await logoutHandler({ cookies: {} }, res, next);

    expect(logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('revocation failure does not block logout', async () => {
    logout.mockRejectedValueOnce(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = mockRes();
    await logoutHandler({ cookies: { refresh_token: 'rt' } }, res, jest.fn());

    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    warn.mockRestore();
  });
});
