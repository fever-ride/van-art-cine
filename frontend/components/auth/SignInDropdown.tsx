'use client';

import { createPortal } from 'react-dom';
import { useState } from 'react';
import { apiLogin } from '@/app/lib/auth';
import { isErrorLike } from '@/app/lib/typeGuards';
import { useRouter } from 'next/navigation';
import { Input, Button } from '@/components/ui';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function SignInDropdown({ isOpen, onClose, onSuccess }: Props) {
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
      onSuccess?.();
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

  // Portal to <body>: the sticky header uses backdrop-filter, which makes
  // it the containing block for position:fixed descendants, so a fixed
  // overlay rendered inside it would be clipped to the header.
  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[100] bg-primary/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dropdown Form */}
      <div className="pointer-events-none fixed inset-0 z-[101] overflow-y-auto">
        <div className="pointer-events-auto mx-auto mt-16 mb-8 max-w-4xl px-4 animate-slide-down sm:mt-24">
          <div className="relative rounded-card border border-border bg-hero-bg p-6 shadow-2xl">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center text-white/55 hover:text-white transition-colors"
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
                  <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-2">
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
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  />
                </div>

                {/* Password field */}
                <div className="flex-1">
                  <label htmlFor="password" className="block text-sm font-medium text-white/70 mb-2">
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
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
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
    </>,
    document.body
  );
}
