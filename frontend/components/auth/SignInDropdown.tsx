'use client';

import { useState } from 'react';
import { apiLogin } from '@/app/lib/auth';
import { isErrorLike } from '@/app/lib/typeGuards';
import { useRouter } from 'next/navigation';
import { Input, Button } from '@/components/ui';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function SignInDropdown({ isOpen, onClose }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await apiLogin({ email, password });
      onClose();
      router.refresh();
    } catch (err: unknown) {
      if (isErrorLike(err)) {
        setErr(err.message);
      } else if (typeof err === 'string') {
        setErr(err);
      } else {
        setErr('Sign in failed');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-primary/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dropdown Form */}
      <div className="fixed top-[140px] left-0 right-0 z-50 animate-slide-down">
        <div className="mx-auto max-w-4xl px-4">
          <div className="relative rounded-card border border-border bg-[#1a1a1a] p-6 shadow-2xl">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <form onSubmit={onSubmit}>
              {err && (
                <div className="mb-4 rounded-input border border-error-border bg-error-bg px-3 py-2 text-sm text-error-text">
                  {err}
                </div>
              )}

              <div className="flex flex-col md:flex-row md:items-end gap-4">
                {/* Email field */}
                <div className="flex-1">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    autoComplete="email"
                    className="bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                  />
                </div>

                {/* Password field */}
                <div className="flex-1">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                  />
                </div>

                {/* Submit button */}
                <div className="md:w-auto">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={loading}
                    className="w-full md:w-auto px-8"
                  >
                    {loading ? 'Signing in...' : 'Sign in'}
                  </Button>
                </div>
              </div>

              {/* TODO: Implement forgot password functionality */}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
