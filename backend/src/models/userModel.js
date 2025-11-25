// src/models/userModel.js
import { prisma } from '../lib/prismaClient.js';
import { Prisma } from '@prisma/client';
import { hashToken } from '../utils/tokenHash.js';

// helpers
const toNum = (v) => (typeof v === 'bigint' ? Number(v) : v);

export function mapUserRow(row) {
  return {
    uid: toNum(row.uid),
    name: row.name,
    email: row.email,
    password_hash: row.password_hash,
    role: row.role,
    created_at: row.created_at,
  };
}

export function mapUserSafeRow(row) {
  return {
    uid: toNum(row.uid),
    name: row.name,
    email: row.email,
    role: row.role,
    created_at: row.created_at,
  };
}

export async function findByEmail(email = '') {
  const normalized = email.trim().toLowerCase();
  const row = await prisma.app_user.findFirst({
    where: { email: normalized },
    select: {
      uid: true,
      name: true,
      email: true,
      password_hash: true,
      role: true,
      created_at: true,
    },
  });
  return row ? mapUserRow(row) : null;
}

export async function findById(id) {
  if (!id) return null;
  const row = await prisma.app_user.findUnique({
    where: { uid: Number(id) },
    select: {
      uid: true,
      name: true,
      email: true,
      password_hash: true,
      role: true,
      created_at: true,
    },
  });
  return row ? mapUserRow(row) : null;
}

// NEW: safe version for profile, admin lists, etc.
export async function findSafeById(id) {
  if (!id) return null;
  const row = await prisma.app_user.findUnique({
    where: { uid: Number(id) },
    select: {
      uid: true,
      name: true,
      email: true,
      role: true,
      created_at: true,
    },
  });
  return row ? mapUserSafeRow(row) : null;
}

export async function createUser({ email, passwordHash, name = null, role = 'user' }) {
  const normalizedEmail = email.trim().toLowerCase();

  const created = await prisma.app_user.create({
    data: {
      email: normalizedEmail,
      password_hash: passwordHash,
      name,
      role,
      created_at: new Date(),
    },
    select: { uid: true },
  });

  const row = await prisma.app_user.findUnique({
    where: { uid: Number(created.uid) },
    select: {
      uid: true,
      email: true,
      name: true,
      role: true,
      created_at: true,
    },
  });

  return row ? mapUserSafeRow(row) : null;
}

export async function deleteUserById(id) {
  if (!id) return false;

  try {
    await prisma.app_user.delete({
      where: { uid: Number(id) },
    });
    return true;
  } catch (err) {
    // “record not found”
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return false;
    }
    throw err;
  }
}

export async function deleteUserWatchlist(userId) {
  if (!userId) return;

  await prisma.watchlist_screening.deleteMany({
    where: { user_uid: Number(userId) },
  });
}

export async function updateName(id, { name }) {
  if (!id) return null;

  try {
    const row = await prisma.app_user.update({
      where: { uid: Number(id) },
      data: { name },
      select: {
        uid: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    return mapUserSafeRow(row);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      // “record not found” → “no such user”
      return null;
    }
    throw err; // DB error, let it bubble
  }
}

export async function updatePassword(id, { passwordHash }) {
  if (!id) return null;

  try {
    const row = await prisma.app_user.update({
      where: { uid: Number(id) },
      data: {
        password_hash: passwordHash,
      },
      select: {
        uid: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    return mapUserSafeRow(row);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      // record not found → no such user
      return null;
    }
    throw err; // DB error, let it bubble
  }
}

export async function storeRefreshToken({ userId, token, expiresAt, userAgent = null, ip = null }) {
  const tokenHash = hashToken(token);
  await prisma.refresh_token.create({
    data: {
      user_id: Number(userId),
      token: tokenHash,
      expires_at: new Date(expiresAt),
      user_agent: userAgent,
      ip,
      created_at: new Date(),
    },
  });
}

export async function revokeRefreshToken(token) {
  const tokenHash = hashToken(token);
  await prisma.refresh_token.updateMany({
    where: { token: tokenHash, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export async function findValidRefreshToken(token) {
  const tokenHash = hashToken(token);
  const row = await prisma.refresh_token.findFirst({
    where: { token: tokenHash },
    select: {
      user_id: true,
      token: true,
      expires_at: true,
      revoked_at: true,
    },
  });
  if (!row) return null;

  const expired = new Date(row.expires_at) <= new Date();
  if (row.revoked_at || expired) return null;

  // coerce user_id before returning
  return { ...row, user_id: toNum(row.user_id) };
}

export async function revokeAllRefreshTokens(userId) {
  await prisma.refresh_token.updateMany({
    where: { user_id: Number(userId), revoked_at: null },
    data: { revoked_at: new Date() },
  });
}