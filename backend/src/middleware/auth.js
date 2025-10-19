import { verifyAccess } from '../utils/jwt.js';
import { AuthError } from '../utils/errors.js';

/**
 * Pull the access token from:
 *   1) Authorization: Bearer <token>
 *   2) cookies.access_token
 */
function extractAccessToken(req) {
  const auth = req.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }
  return null;
}

/**
 * requireAuth
 * - Verifies access JWT
 * - On success: attaches claims to req.user and calls next()
 * - On failure: throws AuthError (caught by Express error handler)
 */
export function requireAuth(req, res, next) {
  try {
    const token = extractAccessToken(req);
    if (!token) {
      throw new AuthError('Missing access token', 'NO_ACCESS_TOKEN', 401);
    }

    const payload = verifyAccess(token); // throws if invalid/expired
    req.user = {
      uid: payload.uid,
      role: payload.role,
      email: payload.email ?? undefined,
    };
    return next();
  } catch (err) {
    // Pass AuthError forward (don’t respond here)
    return next(
      err instanceof AuthError
        ? err
        : new AuthError('Invalid or expired access token', 'BAD_ACCESS_TOKEN', 401)
    );
  }
}

/**
 * optionalAuth
 * - Tries to verify access JWT.
 * - If present & valid -> sets req.user; if not -> continues without error.
 */
export function optionalAuth(req, _res, next) {
  const token = extractAccessToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccess(token);
    req.user = {
      uid: payload.uid,
      role: payload.role,
      email: payload.email ?? undefined,
    };
  } catch {
    // ignore invalid token; treat as anonymous
  }
  return next();
}