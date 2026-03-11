import * as svc from '../services/authService.js';
import { AuthError } from '../utils/errors.js';
import {
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
} from '../utils/jwt.js';

/**
 * POST /api/auth/register
 * @body {{ email: string, password: string, name?: string }}
 * @returns {201} {{ user, message }} — sets access_token + refresh_token cookies
 */
export async function registerHandler(req, res, next) {
  try {
    const { email, password, name } = req.body;

    const userAgent = req.get('user-agent') || null;
    const ip = req.ip || req.connection?.remoteAddress || null;

    const result = await svc.register({
      email,
      password,
      name,
      userAgent,
      ip,
    });

    const { user, accessToken, refreshToken } = result;

    res.cookie('access_token', accessToken, accessCookieOptions);
    res.cookie('refresh_token', refreshToken, refreshCookieOptions);

    return res.status(201).json({
      user,
      message: 'Registered successfully',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/login
 * @body {{ email: string, password: string }}
 * @returns {200} {{ user, message }} — sets access_token + refresh_token cookies
 * @returns {401} {{ error: 'INVALID_CREDENTIALS', message }} — bad email or password
 */
export async function loginHandler(req, res, next) {
  try {
    const { email, password } = req.body;
    const userAgent = req.get('user-agent') || null;
    const ip = req.ip || req.connection?.remoteAddress || null;

    const { user, accessToken, refreshToken } =
      await svc.login({ email, password, userAgent, ip });

    res.cookie('access_token', accessToken, accessCookieOptions);
    res.cookie('refresh_token', refreshToken, refreshCookieOptions);

    return res.status(200).json({
      user,
      message: 'Log in successfully',
    });
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'EMAIL_NOT_EXIST' || err.code === 'BAD_CREDENTIALS') {
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Incorrect email or password.',
        });
      }
    }

    return next(err);
  }
}

/**
 * POST /api/auth/refresh
 * @cookie refresh_token — used to rotate tokens
 * @returns {200} {{ user, message }} — sets new access_token + refresh_token cookies
 */
export async function refreshHandler(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token || '';
    const userAgent = req.get('user-agent') || null;
    const ip = req.ip || req.connection?.remoteAddress || null;

    const {
      user,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    } = await svc.refresh({ refreshToken, userAgent, ip });

    res.cookie('access_token', newAccessToken, accessCookieOptions);
    res.cookie('refresh_token', newRefreshToken, refreshCookieOptions);

    return res.status(200).json({
      user,
      message: 'Tokens refreshed',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/logout
 * @cookie refresh_token — revoked server-side
 * @returns {200} {{ ok: true, message }} — clears access_token + refresh_token cookies
 */
export async function logoutHandler(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token || null;

    if (refreshToken) {
      try {
        await svc.logout({ refreshToken });
      } catch (err) {
        console.warn('revoke failed', err);
      }
    }

    res.clearCookie('access_token', clearCookieOptions);
    res.clearCookie('refresh_token', clearCookieOptions);

    return res.status(200).json({ ok: true, message: 'Logged out' });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me
 * @returns {200} {{ user: { uid, role } }}
 * @returns {401} {{ error: 'UNAUTHORIZED', message }}
 */
export async function meHandler(req, res, next) {
  if (!req.user) {
    return next(new AuthError('Not authenticated', 'UNAUTHORIZED', 401));
  }
  return res.json({ user: req.user });
}
