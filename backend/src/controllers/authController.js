import * as svc from '../services/authService.js';
import { AuthError } from '../utils/errors.js';
import {
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
} from '../utils/jwt.js';


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
    next(err);
  }
}

export async function loginHandler(req, res, next) {
  try {
    const { email, password } = req.body;
    const userAgent = req.get('user-agent') || null;
    const ip = req.ip || req.connection?.remoteAddress || null;

    const { user, accessToken, refreshToken, refreshExpiresAt } =
      await svc.login({ email, password, userAgent, ip });

    res.cookie('access_token', accessToken, accessCookieOptions);
    res.cookie('refresh_token', refreshToken, refreshCookieOptions);

    return res.status(200).json({
      user,
      message: 'Log in successfully',
    });
  } catch (err) {
    if (err instanceof AuthError) {
      // Normalize anything credential-related to one public error
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

export async function refreshHandler(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token || '';
    const userAgent = req.get('user-agent') || null;
    const ip = req.ip || req.connection?.remoteAddress || null;

    const { 
      user, 
      accessToken: newAccessToken, 
      refreshToken: newRefreshToken, 
      refreshExpiresAt 
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

export async function logoutHandler(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token || null;

    // Try to revoke, but don't let failures block cookie clearing
    if (refreshToken) {
      try {
        await svc.logout({ refreshToken });
      } catch (e) {
        console.warn('revoke failed', e);
      }
    }

    res.clearCookie('access_token', clearCookieOptions);
    res.clearCookie('refresh_token', clearCookieOptions);

    return res.status(200).json({ ok: true, message: 'Logged out' });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/auth/me */
export async function meHandler(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ user: req.user });
}
