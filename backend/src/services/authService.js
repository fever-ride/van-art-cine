import {
  findByEmail,
  createUser,
  storeRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  findById,
} from '../models/userModel.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import jwt from 'jsonwebtoken';
import { AuthError } from '../utils/errors.js';

export async function register({ email, password, name, userAgent, ip }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await findByEmail(normalizedEmail);
  if (existing) {
    throw new AuthError('Email already registered', 'EMAIL_TAKEN', 409);
  }

  const passwordHash = await hashPassword(password);
  const finalName = name?.trim() || 'User';

  const user = await createUser({
    email: normalizedEmail,
    passwordHash,
    name: finalName,
    role: 'user',
  });

  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);

  const decoded = jwt.decode(refreshToken);
  const refreshExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;

  if (refreshExpiresAt) {
    await storeRefreshToken({
      userId: user.uid,
      token: refreshToken,
      expiresAt: refreshExpiresAt,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
    });
  }

  return { user, accessToken, refreshToken };
}

export async function login({ email, password, userAgent, ip }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await findByEmail(normalizedEmail);
  if (!user) {
    throw new AuthError('Email does not exist', 'EMAIL_NOT_EXIST', 404);
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw new AuthError('Incorrect email or password', 'BAD_CREDENTIALS', 401);
  }

  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);

  const decoded = jwt.decode(refreshToken);
  const refreshExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;
  if (refreshExpiresAt) {
    await storeRefreshToken({
      userId: user.uid,
      token: refreshToken,
      expiresAt: refreshExpiresAt,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
    });
  }

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken };
}

export async function refresh({ refreshToken, userAgent, ip }) {
  let payload;
  try {
    payload = verifyRefresh(refreshToken);
  } catch (err) {
    throw new AuthError('Invalid refresh token', 'BAD_REFRESH_TOKEN', 401);
  }

  const row = await findValidRefreshToken(refreshToken);
  if (!row) {
    throw new AuthError('Refresh token not found or revoked', 'REFRESH_REJECTED', 401);
  }

  if (row.user_id !== payload.uid) {
    throw new AuthError('Refresh token/user mismatch', 'REFRESH_MISMATCH', 401);
  }

  const user = await findById(payload.uid);
  if (!user) {
    throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
  }

  const accessToken = signAccess(user);

  const newRefreshToken = signRefresh(user);
  const decoded = jwt.decode(newRefreshToken);
  const refreshExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;

  await revokeRefreshToken(refreshToken);
  if (refreshExpiresAt) {
    await storeRefreshToken({
      userId: user.uid,
      token: newRefreshToken,
      expiresAt: refreshExpiresAt,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
    });
  }

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken: newRefreshToken };
}

export async function logout({ refreshToken }) {
  await revokeRefreshToken(refreshToken);
  return { ok: true };
}
