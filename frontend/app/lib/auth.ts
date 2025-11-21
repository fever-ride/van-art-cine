import { getGuestSet, clearGuestSet } from '@/app/lib/guestWatchlist';

/** 
 * Single-flight guard for token refresh.
 * Holds the in-progress refresh promise, or null when idle. 
 */
let refreshInFlight: Promise<void> | null = null;

/**
 * Single-flight refresh.
 * Reuse the in-flight Promise and avoid concurrent refresh storms.
 * Always clears the sentinel when the refresh finishes.
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
 * Wrapper around fetch that:
 * - sends cookies
 * - on 401, attempts a single token refresh (except when calling refresh itself)
 * - retries the original request once after a successful refresh 
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