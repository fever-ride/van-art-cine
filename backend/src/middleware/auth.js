import { verifyAccess } from '../utils/jwt.js';
import { AuthError } from '../utils/errors.js';

/**
 * Extract the access token from the request.
 * 
 * Supported sources (checked in order):
 *   1) Authorization header using the standard format:
 *         Authorization: Bearer <token>
 *      Retained to support API clients and testing tools
 *      (curl, Postman, server-to-server calls) that follow the
 *      OAuth2 Bearer Token specification.
 *   2) Cookie: access_token
 *      Used by the browser client.
 * If both exist, the Authorization header takes precedence.
 */
function extractAccessToken(req) {
  const auth = req.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    // "Bearer " is 7 characters long
    // Skips first 7 characters to extract the token
    return auth.slice(7).trim();
  }
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }
  return null;
}

/**
 * Verifies the Access JWT and populates req.user.
 *
 * Success: Attaches `req.user = { uid, role }` and calls next().
 * Failure: For missing/invalid/expired tokens, 
 *   forwards an AuthError (401) to the global handler.
 *
 * Notes: Access tokens intentionally carry only { uid, role } to minimize PII.
 *   Do not expect email here—fetch profile fields from the DB when needed.
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
      role: payload.role ?? 'user',
    };
    return next();
  } catch (err) {
    return next(
      err instanceof AuthError
        ? err
        : new AuthError('Invalid or expired access token', 'BAD_ACCESS_TOKEN', 401)
    );
  }
}

/**
 * Attempt to read & verify an access JWT
 * If the token is present and valid → attach { uid, role } to req.user and continue.
 * If the token is missing/invalid → DO NOT error; continue as anonymous.
 *
 * Use cases (READ-only endpoints):
 *  Endpoints that work anonymously but can personalize when logged in,
 *  e.g. GET /screenings, GET /films/:id, or a “resolve watchlist” read endpoint.
 *
 * Do NOT use for:
 *  Any write/mutation endpoints.
 *
 * Currently unused; 
 * kept for future read endpoints to reduce 401 noise and enable optional personalization.
 */
export function optionalAuth(req, _res, next) {
  const token = extractAccessToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccess(token);
    req.user = { uid: payload.uid, 
      role: payload.role };
  } catch {
    // ignore invalid/expired token; proceed as anonymous
  }
  return next();
}