import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { jest } from '@jest/globals';

// Prisma client mock
const prismaMock = {
  app_user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  watchlist_screening: {
    deleteMany: jest.fn(),
  },
  refresh_token: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/lib/prismaClient.js', () => ({
  prisma: prismaMock,
}));

class PrismaClientKnownRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = 'PrismaClientKnownRequestError';
  }
}

jest.unstable_mockModule('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError },
}));

//token hashing mock: keep deterministic assertions
const hashTokenMock = jest.fn((t) => `hash:${String(t)}`);

jest.unstable_mockModule('../../src/utils/tokenHash.js', () => ({
  hashToken: hashTokenMock,
}));

// Import the module under test after mocks are registered.
const userModel = await import('../../src/models/userModel.js');

const {
  mapUserRow,
  mapUserSafeRow,
  findByEmail,
  findById,
  findSafeById,
  createUser,
  deleteUserById,
  deleteUserWatchlist,
  updateName,
  updatePassword,
  storeRefreshToken,
  revokeRefreshToken,
  findValidRefreshToken,
  revokeAllRefreshTokens,
} = userModel;

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Freeze time for tests that depend on "now".
 */
jest.useFakeTimers();
jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
afterAll(() => {
  jest.useRealTimers();
});

describe('userModel: row mappers', () => {
  test('mapUserRow coerces bigint uid to number and preserves fields', () => {
    const row = {
      uid: 123n,
      name: 'Wendy',
      email: 'wendy@example.com',
      password_hash: 'hash',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    };

    expect(mapUserRow(row)).toEqual({
      uid: 123,
      name: 'Wendy',
      email: 'wendy@example.com',
      password_hash: 'hash',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
  });

  test('mapUserSafeRow excludes password_hash and coerces bigint uid', () => {
    const row = {
      uid: 9n,
      name: 'Wendy',
      email: 'wendy@example.com',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    };

    expect(mapUserSafeRow(row)).toEqual({
      uid: 9,
      name: 'Wendy',
      email: 'wendy@example.com',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
  });
});

describe('userModel: finders', () => {
  test('findByEmail normalizes email (trim + lowercase) and returns mapped row', async () => {
    prismaMock.app_user.findFirst.mockResolvedValue({
      uid: 7n,
      name: 'Wendy',
      email: 'wendy@example.com',
      password_hash: 'hash',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    });

    const result = await findByEmail('  Wendy@Example.com  ');

    expect(prismaMock.app_user.findFirst).toHaveBeenCalledWith({
      where: { email: 'wendy@example.com' },
      select: {
        uid: true,
        name: true,
        email: true,
        password_hash: true,
        role: true,
        created_at: true,
      },
    });

    expect(result).toMatchObject({
      uid: 7,
      email: 'wendy@example.com',
      password_hash: 'hash',
    });
  });

  test('findByEmail returns null when no row', async () => {
    prismaMock.app_user.findFirst.mockResolvedValue(null);
    await expect(findByEmail('a@b.com')).resolves.toBeNull();
  });

  test('findById returns null when id is falsy', async () => {
    await expect(findById(null)).resolves.toBeNull();
    await expect(findById(undefined)).resolves.toBeNull();
    await expect(findById(0)).resolves.toBeNull();
    expect(prismaMock.app_user.findUnique).not.toHaveBeenCalled();
  });

  test('findSafeById returns safe mapped row', async () => {
    prismaMock.app_user.findUnique.mockResolvedValue({
      uid: 22n,
      name: 'Wendy',
      email: 'wendy@example.com',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    });

    const result = await findSafeById(22);

    expect(prismaMock.app_user.findUnique).toHaveBeenCalledWith({
      where: { uid: 22 },
      select: {
        uid: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    expect(result).toEqual({
      uid: 22,
      name: 'Wendy',
      email: 'wendy@example.com',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
  });
});

describe('userModel: create/update/delete', () => {
  test('createUser normalizes email and returns safe user', async () => {
    prismaMock.app_user.create.mockResolvedValue({ uid: 101n });
    prismaMock.app_user.findUnique.mockResolvedValue({
      uid: 101n,
      email: 'wendy@example.com',
      name: 'Wendy',
      role: 'user',
      created_at: new Date('2025-01-01T00:00:00Z'),
    });

    const result = await createUser({
      email: '  Wendy@Example.com ',
      passwordHash: 'pw-hash',
      name: 'Wendy',
      role: 'user',
    });

    const createArg = prismaMock.app_user.create.mock.calls[0][0];
    expect(createArg.data.email).toBe('wendy@example.com');
    expect(createArg.data.password_hash).toBe('pw-hash');
    expect(createArg.select).toEqual({ uid: true });

    expect(prismaMock.app_user.findUnique).toHaveBeenCalledWith({
      where: { uid: 101 },
      select: {
        uid: true,
        email: true,
        name: true,
        role: true,
        created_at: true,
      },
    });

    expect(result).toEqual({
      uid: 101,
      email: 'wendy@example.com',
      name: 'Wendy',
      role: 'user',
      created_at: new Date('2025-01-01T00:00:00Z'),
    });
  });

  test('deleteUserById returns false when record not found (P2025)', async () => {
    prismaMock.app_user.delete.mockRejectedValue(
      new PrismaClientKnownRequestError('not found', 'P2025')
    );

    await expect(deleteUserById(999)).resolves.toBe(false);
  });

  test('deleteUserById returns true when delete succeeds', async () => {
    prismaMock.app_user.delete.mockResolvedValue({});

    await expect(deleteUserById(5)).resolves.toBe(true);
    expect(prismaMock.app_user.delete).toHaveBeenCalledWith({
      where: { uid: 5 },
    });
  });

  test('deleteUserById rethrows non-P2025 errors', async () => {
    prismaMock.app_user.delete.mockRejectedValue(new Error('db down'));
    await expect(deleteUserById(5)).rejects.toThrow('db down');
  });

  test('deleteUserWatchlist deletes all watchlist rows for user', async () => {
    prismaMock.watchlist_screening.deleteMany.mockResolvedValue({ count: 3 });

    await deleteUserWatchlist(77);

    expect(prismaMock.watchlist_screening.deleteMany).toHaveBeenCalledWith({
      where: { user_uid: 77 },
    });
  });

  test('updateName returns null on P2025 (no such user)', async () => {
    prismaMock.app_user.update.mockRejectedValue(
      new PrismaClientKnownRequestError('not found', 'P2025')
    );

    await expect(updateName(123, { name: 'New Name' })).resolves.toBeNull();
  });

  test('updateName returns safe row on success', async () => {
    prismaMock.app_user.update.mockResolvedValue({
      uid: 12n,
      name: 'New Name',
      email: 'wendy@example.com',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    });

    const result = await updateName(12, { name: 'New Name' });

    expect(prismaMock.app_user.update).toHaveBeenCalledWith({
      where: { uid: 12 },
      data: { name: 'New Name' },
      select: {
        uid: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    expect(result).toMatchObject({ uid: 12, name: 'New Name' });
  });

  test('updatePassword returns null on P2025 (no such user)', async () => {
    prismaMock.app_user.update.mockRejectedValue(
      new PrismaClientKnownRequestError('not found', 'P2025')
    );

    await expect(updatePassword(123, { passwordHash: 'x' })).resolves.toBeNull();
  });

  test('updatePassword returns safe row on success', async () => {
    prismaMock.app_user.update.mockResolvedValue({
      uid: 33n,
      name: 'Wendy',
      email: 'wendy@example.com',
      role: 'user',
      created_at: new Date('2024-01-01T00:00:00Z'),
    });

    const result = await updatePassword(33, { passwordHash: 'pw-hash' });

    expect(prismaMock.app_user.update).toHaveBeenCalledWith({
      where: { uid: 33 },
      data: { password_hash: 'pw-hash' },
      select: {
        uid: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    expect(result).toMatchObject({ uid: 33, email: 'wendy@example.com' });
  });
});

describe('userModel: refresh token operations', () => {
  test('storeRefreshToken hashes token and stores it', async () => {
    prismaMock.refresh_token.create.mockResolvedValue({ id: 1n });

    await storeRefreshToken({
      userId: 9,
      token: 'raw-token',
      expiresAt: '2025-01-10T00:00:00Z',
      userAgent: 'ua',
      ip: '127.0.0.1',
    });

    expect(hashTokenMock).toHaveBeenCalledWith('raw-token');

    const arg = prismaMock.refresh_token.create.mock.calls[0][0];
    expect(arg.data.user_id).toBe(9);
    expect(arg.data.token).toBe('hash:raw-token');
    expect(arg.data.user_agent).toBe('ua');
    expect(arg.data.ip).toBe('127.0.0.1');
  });

  test('revokeRefreshToken hashes token and updates only non-revoked rows', async () => {
    prismaMock.refresh_token.updateMany.mockResolvedValue({ count: 1 });

    await revokeRefreshToken('raw-token');

    expect(hashTokenMock).toHaveBeenCalledWith('raw-token');
    expect(prismaMock.refresh_token.updateMany).toHaveBeenCalledWith({
      where: { token: 'hash:raw-token', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  test('findValidRefreshToken returns null when no row', async () => {
    prismaMock.refresh_token.findFirst.mockResolvedValue(null);
    await expect(findValidRefreshToken('t')).resolves.toBeNull();
  });

  test('findValidRefreshToken returns null when revoked', async () => {
    prismaMock.refresh_token.findFirst.mockResolvedValue({
      user_id: 10n,
      token: 'hash:t',
      expires_at: new Date('2025-02-01T00:00:00Z'),
      revoked_at: new Date('2025-01-01T00:00:00Z'),
    });

    await expect(findValidRefreshToken('t')).resolves.toBeNull();
  });

  test('findValidRefreshToken returns null when expired', async () => {
    prismaMock.refresh_token.findFirst.mockResolvedValue({
      user_id: 10n,
      token: 'hash:t',
      expires_at: new Date('2024-12-31T23:59:59Z'),
      revoked_at: null,
    });

    await expect(findValidRefreshToken('t')).resolves.toBeNull();
  });

  test('findValidRefreshToken returns row with coerced user_id when valid', async () => {
    prismaMock.refresh_token.findFirst.mockResolvedValue({
      user_id: 10n,
      token: 'hash:t',
      expires_at: new Date('2025-02-01T00:00:00Z'),
      revoked_at: null,
    });

    const result = await findValidRefreshToken('t');

    expect(hashTokenMock).toHaveBeenCalledWith('t');
    expect(result).toEqual({
      user_id: 10,
      token: 'hash:t',
      expires_at: new Date('2025-02-01T00:00:00Z'),
      revoked_at: null,
    });
  });

  test('revokeAllRefreshTokens revokes all active tokens for a user', async () => {
    prismaMock.refresh_token.updateMany.mockResolvedValue({ count: 2 });

    await revokeAllRefreshTokens(88);

    expect(prismaMock.refresh_token.updateMany).toHaveBeenCalledWith({
      where: { user_id: 88, revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });
});