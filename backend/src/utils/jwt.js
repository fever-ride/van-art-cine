import crypto from 'crypto';
import jwt from 'jsonwebtoken';

function env(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

/**
 * Issues a short-lived Access JWT.
 *
 * Claims contract:
 * - uid   : user id
 * - role  : user role
 */
export function signAccess(user) {
  return jwt.sign(
    { uid: user.uid,
      role: user.role },
    env('JWT_ACCESS_SECRET'),
    { expiresIn: process.env.ACCESS_TTL || '15m',
      issuer: 'cinephilesvan',
      subject: String(user.uid),
      audience: 'web' }
  );
}

/**
 * Sign long-lived Refresh Token.
 * Each call uses a unique jti so the stored token hash is never duplicated (avoids P2002 on refresh_token.token).
 */
export function signRefresh(user) {
  return jwt.sign(
    {
      uid: user.uid,
      jti: crypto.randomUUID(),
    },
    env('JWT_REFRESH_SECRET'),
    { expiresIn: process.env.REFRESH_TTL || '30d' }
  );
}

/**
 * Verify Access Token (throws if invalid)
 */
export function verifyAccess(token) {
  return jwt.verify(token, env('JWT_ACCESS_SECRET'));
}

/**
 * Verify Refresh Token (throws if invalid)
 */
export function verifyRefresh(token) {
  return jwt.verify(token, env('JWT_REFRESH_SECRET'));
}

/**
 * Cookie options — read at call time so NODE_ENV / COOKIE_DOMAIN
 * are always resolved after dotenv has loaded.
 */
function baseCookie() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  };
}

export const accessCookieOptions = {
  ...baseCookie(),
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export const refreshCookieOptions = {
  ...baseCookie(),
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

export const clearCookieOptions = {
  ...baseCookie(),
  expires: new Date(0),
};
