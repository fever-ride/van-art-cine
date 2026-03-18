/**
 * User service layer.
 *
 * Encapsulates user-related operations that go beyond a single DB call,
 * including:
 *  - checking role-based access before returning user info
 *  - normalizing and updating profile fields
 *  - updating passwords (with hashing) and revoking active sessions
 *  - deleting accounts and associated data safely
 *
 * This keeps controllers thin and centralizes business rules around how
 * user state changes should impact authentication/separate tables.
 */
import {
  findSafeById,
  deleteUserById,
  updateName,
  updatePassword,
  revokeAllRefreshTokens,
  deleteUserWatchlist,
} from '../models/userModel.js';
import { NotFoundError, AuthError } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';

/**
 * Fetch a user by ID and assert they have the expected role.
 *
 * Used for role-gated operations; throws:
 *  - NotFoundError if the user does not exist
 *  - AuthError (FORBIDDEN) if the role does not match
 */
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

/**
 * Update a user's display name.
 *
 * - leading/trailing whitespace is trimmed
 * - assumes validation has already ensured non-empty / length constraints
 */
export async function updateUserName(uid, { name }) {
  // let the validator handle the main validation process
  const trimmed = (name ?? '').trim();
  const user = await updateName(uid, { name: trimmed });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}

/**
 * Update a user's password.
 *
 * - hashes the new password before persisting
 * - revokes all existing refresh tokens so any other sessions are forced
 *   to re-authenticate with the new password
 */
export async function updateUserPassword(uid, { password }) {
  const passwordHash = await hashPassword(password);

  const user = await updatePassword(uid, { passwordHash });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  await revokeAllRefreshTokens(uid);
}

/**
 * Delete a user account and clean up associated state.
 *
 * Steps:
 *  1. Ensure the user exists (throws NotFoundError otherwise).
 *  2. Revoke all active refresh tokens (log out all sessions).
 *  3. Delete the user row.
 *  4. Best-effort cleanup of watchlist rows via deleteUserWatchlist:
 *     watchlist has FK cascade, so this is a safety net rather than the
 *     primary deletion mechanism.
 */
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