'use client';

import { useState } from 'react';
import { apiRegister } from '@/app/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isErrorLike } from '@/app/lib/typeGuards';
import { Card, Input, Button } from '@/components/ui';

export default function RegisterPage() {
  const r = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await apiRegister({ email, password, name });
      r.replace('/');
    } catch (err: unknown) {
      if (isErrorLike(err)) {
        setErr(err.message);
      } else if (typeof err === 'string') {
        setErr(err);
      } else {
        setErr('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      {/* Page title */}
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight text-primary">
        Create account
      </h1>

      <Card
        band={
          <>
            <p className="text-[15px] font-semibold text-primary">Join us</p>
            <p className="text-[13px] text-muted">Sign up to save your favorite screenings.</p>
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
              Name (optional)
            </span>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
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
                autoComplete="new-password"
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
              href="/auth/login"
              className="text-sm font-medium text-accent hover:underline"
            >
              Already have an account?
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Register'}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}