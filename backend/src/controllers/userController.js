import * as svc from '../services/userService.js';

export async function getMyProfile(req, res, next) {
  try {
    const { uid, role } = req.user;
    const user = await svc.findUserByIdAndRole(uid, role);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

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

export async function updateMyPassword(req, res, next) {
  try {
    const { uid } = req.user;
    const { password } = req.body;

    await svc.updateUserPassword(uid, { password });

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

export async function deleteMyAccount(req, res, next) {
  try {
    const { uid } = req.user;

    await svc.deleteUserAccount(uid);

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}