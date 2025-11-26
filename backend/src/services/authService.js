import { 
	findByEmail, 
	createUser, 
	storeRefreshToken, 
	findValidRefreshToken, 
	revokeRefreshToken,
	findById } from '../models/userModel.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import jwt from 'jsonwebtoken';
import { AuthError } from '../utils/errors.js';


export async function register({ email, password, name, userAgent, ip }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Check duplicate
  const existing = await findByEmail(normalizedEmail);
  if (existing) {
    throw new AuthError('Email already registered', 'EMAIL_TAKEN', 409);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Fallback name if not provided
  const finalName = name?.trim() || 'User';

  // Create user
  const user = await createUser({
    email: normalizedEmail,
    passwordHash,
    name: finalName,
    role: 'user',
  });

  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);

  // Persist refresh token (with UA/IP like login)
  const decoded = jwt.decode(refreshToken);
  const refreshExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;

  if (refreshExpiresAt) {
    await storeRefreshToken({
      userId: user.uid,
      token: refreshToken,
      expiresAt: refreshExpiresAt,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
    });
  }

  const { password_hash, ...safeUser } = user;

  return { user: safeUser, accessToken, refreshToken, refreshExpiresAt };
}
	
export async function login({ email, password, userAgent, ip }) {
	// lookup user
	const normalizedEmail = email.trim().toLowerCase();
	// check duplicate
	const user = await findByEmail(normalizedEmail);
	if (!user) {
		throw new AuthError('Email does not exist', 'EMAIL_NOT_EXIST', 404);
	}
	
	// verify password
	const ok = await verifyPassword(password, user.password_hash);
	if (!ok) {
		throw new AuthError('Incorrect email or password', 'BAD_CREDENTIALS', 401);
	}
	
	// issue tokens
	const accessToken = signAccess(user);
	const refreshToken = signRefresh(user);
	
	// persist refresh token
	const decoded = jwt.decode(refreshToken);
	const refreshExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;
	if (refreshExpiresAt) {
		await storeRefreshToken({
			userId: user.uid,
			token: refreshToken,
			expiresAt: refreshExpiresAt,
			userAgent: userAgent ?? null,
			ip: ip ?? null,
		});
	}
	const { password_hash, ...safeUser } = user;
	return { user: safeUser, accessToken, refreshToken, refreshExpiresAt }
}

export async function refresh({ refreshToken, userAgent, ip }) {
	// verify the refresh JWT signature/expiry
	let payload;
	try {
		payload = verifyRefresh(refreshToken);
	} catch (e) {
		throw new AuthError('Invalid refresh token', 'BAD_REFRESH_TOKEN', 401);  
	}
	
	// enforce server-side validity (not revoked / not expired)
	const row = await findValidRefreshToken(refreshToken);
	if (!row) {
		throw new AuthError('Refresh token not found or revoked', 'REFRESH_REJECTED', 401);
	}
	
	// ensure the DB row's user_id matches payload.uid
	if (row.user_id !== payload.uid) {
		throw new AuthError('Refresh token/user mismatch', 'REFRESH_MISMATCH', 401);
	}
	
	// load user so we can embed correct claims into access token
	const user = await findById(payload.uid);
	if (!user) {
		throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
	}
	
	// issue a fresh access token
	const accessToken = signAccess(user);
	
	// rotate refresh tokens:
	// - sign a new refresh
	// - revoke old
	// - store new
	const newRefreshToken = signRefresh(user);
	const decoded = jwt.decode(newRefreshToken);
	const refreshExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;
	
  await revokeRefreshToken(refreshToken);
  if (refreshExpiresAt) {
    await storeRefreshToken({
      userId: user.uid,
      token: newRefreshToken,
      expiresAt: refreshExpiresAt,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
    });
  }
	const { password_hash, ...safeUser } = user;
	return { user: safeUser, accessToken, refreshToken: newRefreshToken, refreshExpiresAt };
}

export async function logout({ refreshToken }) {
	await revokeRefreshToken(refreshToken)
	return { ok: true }
}