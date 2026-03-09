'use client';

import { useState } from 'react';
import { apiLogin } from '@/app/lib/auth';
import { isErrorLike } from '@/app/lib/typeGuards';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await apiLogin({ email, password });
      r.replace('/');
    } catch (err: unknown) {
      if (isErrorLike(err)) {
        setErr(err.message);
      } else if (typeof err === 'string') {
        setErr(err);
      } else {
        setErr('Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      {/* Page title */}
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight text-primary">
        Log in
      </h1>

      {/* Card */}
      <section className="overflow-hidden rounded-card border border-border bg-surface shadow-md">
        {/* Cream band header */}
        <div className="border-b border-border bg-band px-5 py-3">
          <p className="text-[15px] font-semibold text-primary">Welcome back</p>
          <p className="text-[13px] text-muted">Sign in to manage your watchlist.</p>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {err && (
            <div
              role="alert"
              className="rounded-input border border-error-border bg-error-bg px-3 py-2 text-sm text-error-text"
            >
              {err}
            </div>
          )}

          {/* Email */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-input border border-border bg-surface px-3 py-2 text-[15px] leading-6 text-primary outline-none ring-0 transition focus:border-accent"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          {/* Password with reveal */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Password
            </span>
            <div className="relative">
              <input
                type={reveal ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-input border border-border bg-surface px-3 py-2 pr-24 text-[15px] leading-6 text-primary outline-none ring-0 transition focus:border-accent"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute inset-y-0 right-1 my-1 rounded-control border border-border bg-surface px-2.5 text-xs font-medium text-muted hover:bg-surface-hover"
                aria-label={reveal ? 'Hide password' : 'Show password'}
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {/* Actions */}
          <div className="mt-2 flex items-center justify-between">
            <Link
              href="/auth/register"
              className="text-sm font-medium text-accent hover:underline"
            >
              Create an account
            </Link>

            <button
              disabled={loading}
              className={[
                'rounded-btn bg-accent px-4 py-2 text-sm font-semibold text-white transition',
                'hover:bg-accent-hover',
                loading ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}