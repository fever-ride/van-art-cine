import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Hash a plain text password
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plain text password against a stored hash
 */
export async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return await bcrypt.compare(password, hash);
}