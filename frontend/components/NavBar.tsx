'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiLogout, apiMe } from '@/app/lib/auth';
import { Noto_Sans } from 'next/font/google';

const noto = Noto_Sans({ subsets: ['latin'], weight: ['400', '600', '700'] });

export default function NavBar() {
  const [isAuthed, setIsAuthed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiMe();

        if (cancelled) return;

        setIsAuthed(!!data?.user);
      } catch {
        if (cancelled) return;
        setIsAuthed(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleLogout() {
    await apiLogout();
    setIsAuthed(false);
  }

  const isActive = (href: string) => pathname === href;
  const pill =
    'whitespace-nowrap rounded-[10px] px-2 py-1 text-sm font-medium text-[#5e6a6d] hover:bg-highlight';

  return (
    <header
      className={`${noto.className} sticky top-0 z-50 border-b border-[#E5E2D8] bg-surface backdrop-blur supports-[backdrop-filter]:bg-surface/75 shadow-[0_10px_24px_rgba(0,0,0,0.04)]`}
    >
      <div className="mx-auto max-w-7xl">
        {/* Row 1: Brand (left) + Auth (right) */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-1">
          {/* Brand block (logo + wordmark + tagline) */}
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <Image
              src="/logo-no-title.svg"
              alt="The Cinephile’s Van logo"
              width={40}
              height={40}
              className="shrink-0"
              priority
            />
            <div className="min-w-0">
              <div className="text-[20px] font-semibold leading-none tracking-tight text-gray-900">
                The Cinephile’s Van
              </div>
              <div className="mt-1 text-[12px] leading-tight text-[#6b7280]">
                Rolling through Vancouver’s film scene
              </div>
            </div>
          </Link>

          {/* Auth actions */}
          <div className="flex shrink-0 items-center gap-3">
            {!isAuthed ? (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-[12px] border-[1.5px] border-border bg-surface px-3 py-1.5 text-sm font-semibold text-primary hover:bg-[#F4F8FB]"
                >
                  Log in
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-[12px] bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-[#4A7A93]"
                >
                  Register
                </Link>
              </>
            ) : (
              <button
                onClick={handleLogout}
                className="rounded-[12px] border-[1.5px] border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-[#2B2B2B] hover:bg-[#F4F8FB]"
              >
                Logout
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Section menu */}
        <div className="-mx-4 border-t border-[#F0EEE8] px-4">
          <nav className="flex snap-x snap-mandatory items-center gap-2 overflow-x-auto">
            <Link
              href="/watchlist"
              target="_blank"
              rel="noopener noreferrer"
              className={`${pill} ${
                isActive('/watchlist') ? 'bg-highlight text-primary' : ''
              } snap-start`}
            >
              My Watchlist
            </Link>

            {isAuthed && (
              <Link
                href="/profile"
                className={`${pill} ${
                  isActive('/profile') ? 'bg-highlight text-primary' : ''
                } snap-start`}
              >
                My Profile
              </Link>
            )}

            <Link
              href="/about"
              className={`${pill} ${
                isActive('/about') ? 'bg-highlight text-primary' : ''
              } snap-start`}
            >
              About
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}