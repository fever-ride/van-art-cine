import { 
  findSafeById, 
  deleteUserById, 
  updateName, 
  updatePassword, 
  revokeAllRefreshTokens, 
  deleteUserWatchlist 
} from '../models/userModel.js';
import { NotFoundError, AuthError } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';

export async function findUserByIdAndRole(uid, role) {
  const user = await findSafeById(uid);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.role !== role) {
    throw new AuthError('Forbidden', 'FORBIDDEN', 403);
  }

  return user;
}

export async function updateUserName(uid, { name }) {
  // let the validator handle the main validation process
  const trimmed = (name ?? '').trim();
  const user = await updateName(uid, { name: trimmed });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}

export async function updateUserPassword(uid, { password }) {
  const passwordHash = await hashPassword(password);

  const user = await updatePassword(uid, { passwordHash });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  await revokeAllRefreshTokens(uid);
}

export async function deleteUserAccount(uid) {
  const user = await findSafeById(uid);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  await revokeAllRefreshTokens(uid);

  const deleted = await deleteUserById(uid);
  if (!deleted) {
    throw new NotFoundError('User not found');
  }
  // Note: watchlist rows are already removed via FK cascade; 
  // this call is only a safety fallback.
  await deleteUserWatchlist(uid);
}