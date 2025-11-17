const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
import { GUEST_KEY, getGuestSet, clearGuestSet } from '@/app/lib/guestWatchlist';

async function mergeGuestAfterAuth() {
  try {
    const set = getGuestSet();
    if (set.size === 0) return;

    const screeningIds = Array.from(set);
    const r = await fetch('/api/watchlist/import', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screeningIds }),
    });

    // Only clear local guest list if server accepted the merge
    if (r.ok) clearGuestSet();
  } catch (e) {
    // Don’t block login/register on merge issues
    console.warn('Guest watchlist merge skipped:', e);
  }
}

export async function apiRegister(body: { email: string; password: string; name?: string }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);

  const data = await res.json(); // { user, message }
  await mergeGuestAfterAuth();
  return data;
}

export async function apiLogin(body: { email: string; password: string }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorCode: string | undefined;
    let backendMessage: string | undefined;

    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') {
        errorCode = data.error;
      }
      if (data && typeof data.message === 'string') {
        backendMessage = data.message;
      }
    } catch {
      // ignore parse errors
    }

    // Default user-facing message
    let friendly = 'Login failed. Let’s try that scene again.';

    // Map known error codes / statuses
    if (errorCode === 'INVALID_CREDENTIALS') {
      friendly = 'Incorrect email or password. Please check and try again.';
    } else if (errorCode === 'VALIDATION_ERROR') {
      friendly = 'Your email or password format is invalid. Please check and try again.';
    } else if (res.status >= 500) {
      friendly = 'We’re experiencing a technical issue. Please try again shortly.';
    }

    // If backend gives a nice message and we don't have a dedicated mapping,
    // we can fall back to that:
    if (!errorCode && backendMessage) {
      friendly = backendMessage;
    }

    throw new Error(friendly);
  }

  const data = await res.json(); // { user, message? }
  await mergeGuestAfterAuth();
  return data;
}

export async function apiLogout() {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
  return res.json(); // { ok: true }
}

export async function apiMe() {
  const res = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Me failed: ${res.status}`);
  return res.json(); // { user }
}