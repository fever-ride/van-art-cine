'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiLogin, apiLogout, apiMe, apiRegister } from '@/app/lib/auth';

/**
 * The one place the app knows who is signed in.
 *
 * Before this, NavBar, useWatchlist and the watchlist page each asked the
 * server on their own mount and never heard about later changes, so after
 * Sign in / Sign out only the NavBar updated and everything else needed a
 * page refresh. Now sign-in/register/sign-out go through this provider and
 * every consumer re-renders from the same state.
 * See TROUBLESHOOTING.md → "Sign in / sign out needs a page refresh".
 *
 * Auth changes rarely (a couple of times per visit), so a plain Context is
 * fine here: re-rendering all consumers on those few changes costs nothing.
 * Phase 4 may move this onto RTK Query; consumers only use `useAuth()`, so
 * they won't change.
 */

export type AuthUser = { uid: number | string; role?: string };
export type AuthStatus = 'loading' | 'authed' | 'guest';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (body: { email: string; password: string }) => Promise<void>;
  register: (body: { email: string; password: string; name?: string }) => Promise<void>;
  /** Always ends signed out locally, even if the request fails. */
  signOut: () => Promise<void>;
  /** Re-ask the server (e.g. after the account was deleted elsewhere). */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Other tabs listen for this key so signing in/out in one tab updates all.
const AUTH_BROADCAST_KEY = 'auth_changed';

function broadcast() {
  try {
    localStorage.setItem(AUTH_BROADCAST_KEY, String(Date.now()));
  } catch {
    // storage unavailable (private mode) — cross-tab sync is best effort
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  // Several refreshes can overlap (mount, focus, another tab's broadcast,
  // sign-in). Only the most recent one may write state, so a slow older
  // /me answer can't overwrite a newer one (e.g. flip back to "authed"
  // right after sign-out).
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++latestRequest.current;
    let u: AuthUser | null = null;
    try {
      const data = await apiMe();
      u = (data?.user as AuthUser | undefined) ?? null;
    } catch {
      u = null;
    }
    if (id !== latestRequest.current) return;
    setUser(u);
    setStatus(u ? 'authed' : 'guest');
  }, []);

  useEffect(() => {
    refresh();
    // Other tab signed in/out.
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_BROADCAST_KEY) refresh();
    };
    // Coming back to the tab: re-check, so a session that ended meanwhile
    // (expired, revoked, account deleted) shows as signed out. Replaces the
    // old NavBar re-check on every route change.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (body) => {
      await apiLogin(body); // throws a friendly message on failure
      await refresh();
      broadcast();
    },
    [refresh],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (body) => {
      await apiRegister(body);
      await refresh();
      broadcast();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    // Invalidate any /me still in flight so it can't resurrect "authed".
    latestRequest.current++;
    try {
      await apiLogout();
    } catch {
      // Network/server trouble must not leave the user "stuck signed in"
      // in this tab; the server side is idempotent and can be retried.
    }
    setUser(null);
    setStatus('guest');
    broadcast();
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, register, signOut, refresh }),
    [status, user, signIn, register, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
