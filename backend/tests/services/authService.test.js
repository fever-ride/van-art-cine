import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const findByEmail = jest.fn();
const createUser = jest.fn();
const storeRefreshToken = jest.fn();
const consumeRefreshToken = jest.fn();
const revokeRefreshToken = jest.fn();
const findById = jest.fn();

jest.unstable_mockModule('../../src/models/userModel.js', () => ({
  findByEmail,
  createUser,
  storeRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  findById,
}));

const hashPassword = jest.fn();
const verifyPassword = jest.fn();

jest.unstable_mockModule('../../src/utils/password.js', () => ({
  hashPassword,
  verifyPassword,
}));

const signAccess = jest.fn(() => 'signed.access');
const signRefresh = jest.fn(() => 'signed.refresh');
const verifyRefresh = jest.fn();

jest.unstable_mockModule('../../src/utils/jwt.js', () => ({
  signAccess,
  signRefresh,
  verifyRefresh,
}));

const jwtDecode = jest.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 86400 }));

jest.unstable_mockModule('jsonwebtoken', () => ({
  __esModule: true,
  default: { decode: jwtDecode },
}));

const { register, login, refresh, logout } = await import('../../src/services/authService.js');
const { AuthError } = await import('../../src/utils/errors.js');

const safeUser = {
  uid: 1,
  name: 'Test',
  email: 't@example.com',
  role: 'user',
  created_at: new Date('2025-01-01'),
};

const userWithPassword = {
  ...safeUser,
  email: 'a@b.com',
  password_hash: 'hash',
};

beforeEach(() => {
  jest.clearAllMocks();
  jwtDecode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 86400 });
});

describe('register', () => {
  test('throws EMAIL_TAKEN when email exists', async () => {
    findByEmail.mockResolvedValue(safeUser);
    await expect(
      register({ email: ' A@B.COM ', password: 'x', name: 'N' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 409 });
    expect(createUser).not.toHaveBeenCalled();
  });

  test('creates user, signs tokens, stores refresh', async () => {
    findByEmail.mockResolvedValue(null);
    hashPassword.mockResolvedValue('hashed');
    createUser.mockResolvedValue(safeUser);

    const out = await register({
      email: ' NEW@EXAMPLE.COM ',
      password: 'secret',
      name: ' Alice ',
      userAgent: 'ua',
      ip: '127.0.0.1',
    });

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        passwordHash: 'hashed',
        name: 'Alice',
        role: 'user',
      }),
    );
    expect(signAccess).toHaveBeenCalledWith(safeUser);
    expect(signRefresh).toHaveBeenCalledWith(safeUser);
    expect(storeRefreshToken).toHaveBeenCalled();
    expect(out.user).toEqual(safeUser);
    expect(out.accessToken).toBe('signed.access');
    expect(out.refreshToken).toBe('signed.refresh');
  });
});

describe('login', () => {
  test('throws EMAIL_NOT_EXIST when user missing', async () => {
    findByEmail.mockResolvedValue(null);
    await expect(login({ email: 'a@b.com', password: 'x' })).rejects.toMatchObject({
      code: 'EMAIL_NOT_EXIST',
      status: 404,
    });
  });

  test('throws BAD_CREDENTIALS when password wrong', async () => {
    findByEmail.mockResolvedValue(userWithPassword);
    verifyPassword.mockResolvedValue(false);
    await expect(login({ email: 'a@b.com', password: 'wrong' })).rejects.toMatchObject({
      code: 'BAD_CREDENTIALS',
      status: 401,
    });
  });

  test('returns safe user and tokens on success', async () => {
    findByEmail.mockResolvedValue(userWithPassword);
    verifyPassword.mockResolvedValue(true);

    const out = await login({
      email: 'A@B.COM',
      password: 'ok',
      userAgent: 'ua',
      ip: '1.2.3.4',
    });

    expect(out.user.password_hash).toBeUndefined();
    expect(out.user.email).toBe('a@b.com');
    expect(out.accessToken).toBe('signed.access');
    expect(storeRefreshToken).toHaveBeenCalled();
  });
});

describe('refresh', () => {
  test('throws BAD_REFRESH_TOKEN when verifyRefresh fails', async () => {
    verifyRefresh.mockImplementation(() => {
      throw new Error('jwt invalid');
    });
    await expect(refresh({ refreshToken: 'rt' })).rejects.toMatchObject({
      code: 'BAD_REFRESH_TOKEN',
      status: 401,
    });
    expect(consumeRefreshToken).not.toHaveBeenCalled();
  });

  test('throws REFRESH_REJECTED when consume returns false', async () => {
    verifyRefresh.mockReturnValue({ uid: 1 });
    consumeRefreshToken.mockResolvedValue(false);
    await expect(refresh({ refreshToken: 'rt' })).rejects.toMatchObject({
      code: 'REFRESH_REJECTED',
      status: 401,
    });
  });

  test('throws USER_NOT_FOUND when user deleted after consume', async () => {
    verifyRefresh.mockReturnValue({ uid: 99 });
    consumeRefreshToken.mockResolvedValue(true);
    findById.mockResolvedValue(null);
    await expect(refresh({ refreshToken: 'rt' })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      status: 404,
    });
  });

  test('returns new tokens and safe user on success', async () => {
    verifyRefresh.mockReturnValue({ uid: 1 });
    consumeRefreshToken.mockResolvedValue(true);
    findById.mockResolvedValue(userWithPassword);

    const out = await refresh({
      refreshToken: 'old.rt',
      userAgent: 'ua',
      ip: '::1',
    });

    expect(out.user.password_hash).toBeUndefined();
    expect(out.accessToken).toBe('signed.access');
    expect(out.refreshToken).toBe('signed.refresh');
    expect(storeRefreshToken).toHaveBeenCalled();
  });
});

describe('logout', () => {
  test('revokes refresh token and returns ok', async () => {
    revokeRefreshToken.mockResolvedValue(undefined);
    const out = await logout({ refreshToken: 'rt' });
    expect(revokeRefreshToken).toHaveBeenCalledWith('rt');
    expect(out).toEqual({ ok: true });
  });
});
