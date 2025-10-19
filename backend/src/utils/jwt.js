import jwt from 'jsonwebtoken';

const {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TTL = '15m',
  REFRESH_TTL = '30d',
  COOKIE_DOMAIN,
  NODE_ENV,
} = process.env;

/**
 * Sign short-lived Access Token
 */
export function signAccess(user) {
  return jwt.sign(
    {
      uid: user.uid,
      role: user.role,
    },
    JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

/**
 * Sign long-lived Refresh Token
 */
export function signRefresh(user) {
  return jwt.sign(
    {
      uid: user.uid,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

/**
 * Verify Access Token (throws if invalid)
 */
export function verifyAccess(token) {
  return jwt.verify(token, JWT_ACCESS_SECRET);
}

/**
 * Verify Refresh Token (throws if invalid)
 */
export function verifyRefresh(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

/**
 * Base cookie options
 */
const baseCookie = {
  httpOnly: true,
  sameSite: 'strict',
  secure: NODE_ENV === 'production',  // only over HTTPS in prod
  domain: COOKIE_DOMAIN || undefined, // set your domain, skip in dev
  path: '/',
};

/**
 * Token-specific cookie options
 */
export const accessCookieOptions = {
  ...baseCookie,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export const refreshCookieOptions = {
  ...baseCookie,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

export const clearCookieOptions = {
  ...baseCookie,
  expires: new Date(0),
};