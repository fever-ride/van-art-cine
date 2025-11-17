'use client';

import { useState } from 'react';
import { apiRegister } from '@/app/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';


function isErrorLike(x: unknown): x is { message: string } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'message' in x &&
    typeof (x as Record<string, unknown>).message === 'string'
  );
}

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
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight text-gray-900">
        Create account
      </h1>

      {/* Card */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md">
        {/* Cream band header */}
        <div className="border-b border-gray-200 bg-[#FFF8E7] px-5 py-3">
          <p className="text-[15px] font-semibold text-gray-800">Join us</p>
          <p className="text-[13px] text-gray-600">Sign up to save your favorite screenings.</p>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {err && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {err}
            </div>
          )}

          {/* Email */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-600">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[15px] leading-6 text-gray-900 outline-none ring-0 transition focus:border-[#5C8EA7]"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          {/* Name */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-600">
              Name (optional)
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[15px] leading-6 text-gray-900 outline-none ring-0 transition focus:border-[#5C8EA7]"
              placeholder="Your name"
            />
          </label>

          {/* Password */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-600">
              Password
            </span>
            <div className="relative">
              <input
                type={reveal ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-24 text-[15px] leading-6 text-gray-900 outline-none ring-0 transition focus:border-[#5C8EA7]"
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute inset-y-0 right-1 my-1 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {/* Actions */}
          <div className="mt-2 flex items-center justify-between">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-[#5C8EA7] hover:underline"
            >
              Already have an account?
            </Link>

            <button
              disabled={loading}
              className={[
                'rounded-xl bg-[#6d8fa6] px-4 py-2 text-sm font-semibold text-white transition',
                'hover:bg-[#5b7c93]',
                loading ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              {loading ? 'Creating…' : 'Register'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}