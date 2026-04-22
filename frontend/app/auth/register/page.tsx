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
    <main className="mx-auto max-w-md px-4 py-16">
      {/* Page title */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-primary mb-2">
          Create account
        </h1>
        <p className="text-muted">Join The Cinephile&apos;s Van</p>
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
              Name <span className="text-muted font-normal">(optional)</span>
            </span>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
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
            <p className="mt-1 text-xs text-muted">Use at least 8 characters.</p>
          </label>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>

          <div className="text-center text-sm text-muted">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="font-semibold text-accent hover:text-accent-hover"
            >
              Log in
            </Link>
          </div>
        </form>
      </Card>
    </main>
  );
}