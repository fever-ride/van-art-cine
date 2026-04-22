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
    <main className="mx-auto max-w-md px-4 py-16">
      {/* Page title */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-primary mb-2">
          Log in
        </h1>
        <p className="text-muted">Welcome back to The Cinephile&apos;s Van</p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="space-y-5 p-8">
          {err && (
            <div
              role="alert"
              className="rounded-input border border-error-border bg-error-bg px-3 py-2 text-sm text-error-text"
            >
              {err}
            </div>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-primary">
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
            <span className="mb-2 block text-sm font-semibold text-primary">
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

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Logging in…' : 'Log in'}
          </Button>

          <div className="text-center text-sm text-muted">
            Don&apos;t have an account?{' '}
            <Link
              href="/auth/register"
              className="font-semibold text-accent hover:text-accent-hover"
            >
              Sign up
            </Link>
          </div>
        </form>
      </Card>
    </main>
  );
}