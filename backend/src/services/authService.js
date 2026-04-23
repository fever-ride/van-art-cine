/**
 * Authentication service layer.
 *
 * Responsibilities:
 *  - user registration and login (email/password)
 *  - issuing access/refresh JWTs
 *  - persisting refresh tokens (hashed in the model layer)
 *  - validating and rotating refresh tokens
 *
 * Important details:
 *  - emails are normalized (trimmed + lowercased) before lookup and insert
 *  - passwords are always stored as bcrypt hashes (via password utils)
 *  - refresh tokens are validated both cryptographically (verifyRefresh)
 *    and consumed atomically in the DB (consumeRefreshToken), then rotated on use
 *  - all error conditions throw AuthError with stable error codes/statuses
 */
import {
  findByEmail,
  createUser,
  storeRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  findById,
} from '../models/userModel.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import jwt from 'jsonwebtoken';
import { AuthError } from '../utils/errors.js';

/**
 * Register a new user account and issue initial access/refresh tokens.
 *
 * - normalizes email
 * - rejects if an account already exists for that email
 * - hashes the password before persisting
 * - stores the refresh token (hashed in the model) with expiry and metadata
 */
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

/**
 * Log a user in with email + password and issue fresh access/refresh tokens.
 *
 * - normalizes email
 * - uses bcrypt to verify the password
 * - throws AuthError with specific codes for \"email not found\" and
 *   \"bad credentials\" so controllers/front-end can map friendly messages
 * - returns a safe user shape with password_hash stripped
 */
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

  const { password_hash: _, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken };
}

/**
 * Refresh tokens using a long-lived refresh token.
 *
 * Flow:
 *  1. Cryptographically validate the refresh JWT (signature, expiry).
 *  2. Atomically consume the refresh row (consumeRefreshToken): updateMany with a strict
 *     WHERE; success only if count === 1 (revokes only if hash + user_id match, still valid).
 *     Concurrent refreshes: at most one succeeds per token; others get REFRESH_REJECTED.
 *  3. Load the user, issue a new access token and a new refresh token.
 *  4. Persist the new refresh token (rotation), preserving user-agent and IP metadata.
 *
 * On any validation failure, an AuthError with a specific code is thrown
 * so controllers can surface 401/404 appropriately.
 */
export async function refresh({ refreshToken, userAgent, ip }) {
  let payload;
  try {
    payload = verifyRefresh(refreshToken);
  } catch (_err) {
    throw new AuthError('Invalid refresh token', 'BAD_REFRESH_TOKEN', 401);
  }

  const consumed = await consumeRefreshToken(refreshToken, payload.uid);
  if (!consumed) {
    throw new AuthError('Refresh token not found or revoked', 'REFRESH_REJECTED', 401);
  }

  const user = await findById(payload.uid);
  if (!user) {
    throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
  }

  const accessToken = signAccess(user);

  const newRefreshToken = signRefresh(user);
  const decoded = jwt.decode(newRefreshToken);
  const refreshExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;

  if (refreshExpiresAt) {
    await storeRefreshToken({
      userId: user.uid,
      token: newRefreshToken,
      expiresAt: refreshExpiresAt,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
    });
  }

  const { password_hash: _hash, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken: newRefreshToken };
}

/**
 * Log a user out by revoking the provided refresh token.
 *
 * Access tokens are short-lived and not explicitly revoked; once the
 * refresh token is revoked, no new access tokens can be minted.
 */
export async function logout({ refreshToken }) {
  await revokeRefreshToken(refreshToken);
  return { ok: true };
}
