import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const verifyAccessMock = jest.fn();

jest.unstable_mockModule('../../src/utils/jwt.js', () => ({
  verifyAccess: verifyAccessMock,
}));

const { requireAuth, optionalAuth } = await import('../../src/middleware/auth.js');
const { AuthError } = await import('../../src/utils/errors.js');

function reqWithBearer(token) {
  return {
    get: (name) => (String(name).toLowerCase() === 'authorization' ? `Bearer ${token}` : ''),
    cookies: {},
  };
}

function reqWithCookie(token) {
  return {
    get: () => '',
    cookies: { access_token: token },
  };
}

function reqEmpty() {
  return {
    get: () => '',
    cookies: {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireAuth', () => {
  test('calls next(AuthError) when no token', () => {
    const next = jest.fn();
    requireAuth(reqEmpty(), {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('NO_ACCESS_TOKEN');
    expect(verifyAccessMock).not.toHaveBeenCalled();
  });

  test('sets req.user and calls next() when token valid', () => {
    verifyAccessMock.mockReturnValue({ uid: 42, role: 'admin' });
    const next = jest.fn();
    const req = reqWithBearer('good');
    requireAuth(req, {}, next);
    expect(verifyAccessMock).toHaveBeenCalledWith('good');
    expect(req.user).toEqual({ uid: 42, role: 'admin' });
    expect(next).toHaveBeenCalledWith();
  });

  test('defaults role to user when payload omits role', () => {
    verifyAccessMock.mockReturnValue({ uid: 7 });
    const next = jest.fn();
    const req = reqWithCookie('c');
    requireAuth(req, {}, next);
    expect(req.user).toEqual({ uid: 7, role: 'user' });
    expect(next).toHaveBeenCalledWith();
  });

  test('calls next(AuthError BAD_ACCESS_TOKEN) when verifyAccess throws', () => {
    verifyAccessMock.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const next = jest.fn();
    requireAuth(reqWithBearer('x'), {}, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('BAD_ACCESS_TOKEN');
  });

  test('calls next(AuthError) when verify throws AuthError (preserved)', () => {
    verifyAccessMock.mockImplementation(() => {
      throw new AuthError('custom', 'CUSTOM', 401);
    });
    const next = jest.fn();
    requireAuth(reqWithBearer('x'), {}, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('CUSTOM');
  });
});

describe('optionalAuth', () => {
  test('calls next() with no req.user when no token', () => {
    const next = jest.fn();
    const req = reqEmpty();
    optionalAuth(req, {}, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
    expect(verifyAccessMock).not.toHaveBeenCalled();
  });

  test('calls next() and ignores invalid token (no error)', () => {
    verifyAccessMock.mockImplementation(() => {
      throw new Error('expired');
    });
    const next = jest.fn();
    const req = reqWithBearer('bad');
    optionalAuth(req, {}, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  test('sets req.user and calls next() when token valid', () => {
    verifyAccessMock.mockReturnValue({ uid: 99, role: 'user' });
    const next = jest.fn();
    const req = reqWithBearer('ok');
    optionalAuth(req, {}, next);
    expect(req.user).toEqual({ uid: 99, role: 'user' });
    expect(next).toHaveBeenCalledWith();
  });
});
