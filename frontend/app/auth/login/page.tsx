'use client';

import { useState } from 'react';
import { apiLogin } from '@/app/lib/auth';
import { isErrorLike } from '@/app/lib/typeGuards';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Input, Button } from '@/components/ui';

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

      <Card
        band={
          <>
            <p className="text-[15px] font-semibold text-primary">Welcome back</p>
            <p className="text-[13px] text-muted">Sign in to manage your watchlist.</p>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {err && (
            <div
              role="alert"
              className="rounded-input border border-error-border bg-error-bg px-3 py-2 text-sm text-error-text"
            >
              {err}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Email
            </span>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Password
            </span>
            <div className="relative">
              <Input
                type={reveal ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="pr-24"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReveal((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2"
                aria-label={reveal ? 'Hide password' : 'Show password'}
              >
                {reveal ? 'Hide' : 'Show'}
              </Button>
            </div>
          </label>

          <div className="mt-2 flex items-center justify-between">
            <Link
              href="/auth/register"
              className="text-sm font-medium text-accent hover:underline"
            >
              Create an account
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? 'Logging in…' : 'Log in'}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}