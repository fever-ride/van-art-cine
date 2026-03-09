import * as svc from '../services/userService.js';
import { clearCookieOptions } from '../utils/jwt.js';

/**
 * GET /api/user/me
 * @returns {200} {{ user: { uid, name, email, role, created_at } }}
 */
export async function getMyProfile(req, res, next) {
  try {
    const { uid, role } = req.user;
    const user = await svc.findUserByIdAndRole(uid, role);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/user/me
 * @body {{ name: string }}
 * @returns {200} {{ user: { uid, name, email, role, created_at } }}
 */
export async function updateMyName(req, res, next) {
  try {
    const { uid } = req.user;
    const { name } = req.body;

    const updated = await svc.updateUserName(uid, { name });

    return res.json({ user: updated });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/user/me/password
 * @body {{ password: string }}
 * @returns {200} {{ ok: true }}
 */
export async function updateMyPassword(req, res, next) {
  try {
    const { uid } = req.user;
    const { password } = req.body;

    await svc.updateUserPassword(uid, { password });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/user/me
 * @returns {200} {{ ok: true }} — clears auth cookies
 */
export async function deleteMyAccount(req, res, next) {
  try {
    const { uid } = req.user;

    await svc.deleteUserAccount(uid);

    res.clearCookie('access_token', clearCookieOptions);
    res.clearCookie('refresh_token', clearCookieOptions);

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}
