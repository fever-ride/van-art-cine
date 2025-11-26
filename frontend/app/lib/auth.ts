import { getGuestSet, clearGuestSet } from '@/app/lib/guestWatchlist';

/** 
 * Single-flight guard for token refresh.
 * Holds the in-progress refresh promise, or null when idle. 
 * If multiple requests hit a 401 at the same time, they all await the same
 * in-flight refresh promise instead of spamming /api/auth/refresh.
 */
let refreshInFlight: Promise<void> | null = null;

/**
 * Refresh the access token using the refresh token (in cookie).
 *
 * - Ensures only ONE real refresh request is in flight at a time.
 * - Other callers reuse the same Promise to avoid a “refresh storm”.
 * - Does NOT run automatically; it is only called from fetchWithAuth
 *   after a 401 response.
 */
async function refreshAccessToken(): Promise<void> {
  if (!refreshInFlight) {
    const doRefresh = async () => {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    };
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  // Return the shared in-flight promise,
  // so all callers await the same refresh
  return refreshInFlight!;
}


/**
 * Wrapper around fetch for authenticated API calls:
 *
 * - Always sends cookie.
 * - If the response is not 401, behaves like a normal fetch.
 * - If the response is 401 (expired/invalid access token):
 *     1) Calls refreshAccessToken() once (unless this *is* the refresh call),
 *     2) Then retries the original request exactly once.
 * - If refresh fails, it returns the original 401 so the caller can treat
 *   the user as logged out.
 *
 * Use this for protected APIs so the user stays “logged in”
 * as long as their refresh token is valid, without hammering /auth/refresh.
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const doFetch = () => fetch(input, { credentials: 'include', ...init });
  const reqUrl = typeof input === 'string' ? input : (input as Request).url;

  let res = await doFetch();
  if (res.status !== 401) return res;

  // Avoid infinite loop: never try to refresh while hitting refresh.
  if (reqUrl.includes('/api/auth/refresh')) return res;

  try {
    await refreshAccessToken();
  } catch {
    // Refresh failed, return the original 401 response to the caller.
    return res;
  }

  // One retry after successful refresh.
  res = await doFetch();
  return res;
}

/* Parse of backend error payload (safe if body isn’t JSON). */
async function readErrorPayload(res: Response): Promise<{ error?: string; message?: string }> {
  try {
    const data = await res.json();
    return {
      error: typeof data?.error === 'string' ? data.error : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
    };
  } catch {
    return {};
  }
}

/*
 * Guest watchlist merge
 * After a successful auth (login/register), attempt to import guest items.
 * This call uses fetchWithAuth so a borderline-expired access token still works.
 * Merge failures are non-fatal and won’t block auth flow.
 */
async function mergeGuestAfterAuth() {
  try {
    const set = getGuestSet();
    if (set.size === 0) return;

    const screeningIds = Array.from(set);
    const r = await fetchWithAuth('/api/watchlist/import', {
      method: 'POST',
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

/*
 * Public APIs
 */

export async function apiRegister(body: { email: string; password: string; name?: string }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const { error, message } = await readErrorPayload(res);

    let friendly = 'Registration failed. Please try again.';
    if (error === 'EMAIL_TAKEN') {
      friendly = 'This email is already registered.';
    } else if (error === 'VALIDATION_ERROR') {
      friendly = 'Your email, password, or name looks invalid. Please check and try again.';
    } else if (res.status >= 500) {
      friendly = 'We’re experiencing a technical issue. Please try again shortly.';
    }
    if (!error && message) friendly = message;

    throw new Error(friendly);
  }

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
    const { error, message } = await readErrorPayload(res);

    // Inline, op-specific friendly mapping (no shared helper)
    let friendly = 'Login failed. Let’s try that scene again.';
    if (error === 'INVALID_CREDENTIALS') {
      friendly = 'Incorrect email or password. Please check and try again.';
    } else if (error === 'VALIDATION_ERROR') {
      friendly = 'Your email or password format is invalid. Please check and try again.';
    } else if (res.status >= 500) {
      friendly = 'We’re experiencing a technical issue. Please try again shortly.';
    }
    if (!error && message) friendly = message;

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
  // Use fetchWithAuth so an expired access token gets refreshed seamlessly.
  const res = await fetchWithAuth('/api/auth/me', { method: 'GET' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Me failed: ${res.status}`);
  return res.json(); // { user }
}