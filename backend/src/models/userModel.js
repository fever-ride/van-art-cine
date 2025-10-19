import { pool } from '../db.js';
import { hashToken } from '../utils/tokenHash.js';  

export function mapUserRow(row) {
  return {
    uid: row.uid,
		name: row.name,
    email: row.email,
    password_hash: row.password_hash,
		role: row.role,
    created_at: row.created_at,
  };
}

export function mapUserSafeRow(row) {
  return {
    uid: row.uid,
    name: row.name,
    email: row.email,
    role: row.role,
    created_at: row.created_at,
  };
}

export async function findByEmail(email = '') {
  const normalized = email.trim().toLowerCase();
  const sql = `
		SELECT uid, name, email, password_hash, role, created_at
		FROM app_user
		WHERE LOWER(email) = ?
		LIMIT 1
    `;
	const [rows] = await pool.query(sql, [normalized]);
	return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function findById(id) {
  if (!id) {
    return null;
  }

  const sql = `
		SELECT uid, name, email, password_hash, role, created_at
		FROM app_user
		WHERE uid = ?
		LIMIT 1
    `;
  const [rows] = await pool.query(sql, [id]);
  return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function createUser({ email, passwordHash, name = null, role = 'user' }){
	const normalizedEmail = email.trim().toLowerCase();
	const ins = `
		INSERT INTO app_user (email, password_hash, name, role, created_at)
		VALUES (?, ?, ?, ?, NOW())
	`;
	const [r] = await pool.query(ins, [normalizedEmail, passwordHash, name, role])

  const sel = `
		SELECT uid, email, name, role, created_at
		FROM app_user
		WHERE uid = ?
    `;	
	const [rows] = await pool.query(sel, [r.insertId]);
	// no password_hash in the returned object
	return rows[0] ? mapUserSafeRow(rows[0]) : null;
}

export async function storeRefreshToken({ userId, token, expiresAt, userAgent = null, ip = null }) {
  const tokenHash = hashToken(token);
  const sql = `
    INSERT INTO refresh_token (user_id, token, expires_at, user_agent, ip, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;
  await pool.query(sql, [userId, tokenHash, expiresAt, userAgent, ip]);
}

export async function revokeRefreshToken(token) {
  const tokenHash = hashToken(token);
  const sql = `UPDATE refresh_token SET revoked_at = NOW() WHERE token = ? AND revoked_at IS NULL`;
  await pool.query(sql, [tokenHash]);
}

export async function findValidRefreshToken(token) {
  const tokenHash = hashToken(token);
  const sql = `
    SELECT user_id, token, expires_at, revoked_at
    FROM refresh_token
    WHERE token = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [tokenHash]);
  const row = rows[0];
  if (!row) return null;
  const expired = new Date(row.expires_at) <= new Date();
  if (row.revoked_at || expired) return null;
  return row;
}

export async function revokeAllRefreshTokens(userId) {
  const sql = `UPDATE refresh_token SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`;
  await pool.query(sql, [userId]);
}