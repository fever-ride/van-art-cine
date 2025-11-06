'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { apiLogout } from '@/app/lib/auth';
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['700'] });

export default function NavBar() {
  const [isAuthed, setIsAuthed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function fetchAuth() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (cancelled) return;
        if (res.status === 401) {
          setIsAuthed(false);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setIsAuthed(!!data.user);
        } else {
          setIsAuthed(false);
        }
      } catch {
        setIsAuthed(false);
      }
    }
    fetchAuth();
    return () => { cancelled = true; };
  }, [pathname]);

  async function handleLogout() {
    await apiLogout();
    setIsAuthed(false);
  }

  const linkBase =
    'text-sm font-medium text-[#5e6a6d] px-2.5 py-1.5 rounded-[10px] transition-colors';
  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-50 border-b border-[#E5E2D8] bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/75 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        {/* BRAND + ORIGINAL MENU */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Wordmark only (no logo image) */}
          <Link href="/" className="flex items-center">
            <span className={`${playfair.className} text-[20px] leading-none tracking-tight text-gray-900`}>
              The Cinephile’s Van
            </span>
          </Link>

          {/* ORIGINAL LINKS (UNCHANGED ROUTES/EVENTS) */}
          <Link
            href="/watchlist"
            className={`${linkBase} ${isActive('/watchlist') ? 'bg-[#FFF8E7] text-gray-900' : 'hover:bg-[#F4F8FB]'}`}
          >
            My Watchlist
          </Link>
          <Link
            href="/blog"
            className={`${linkBase} ${isActive('/blog') ? 'bg-[#FFF8E7] text-gray-900' : 'hover:bg-[#F4F8FB]'}`}
          >
            Blog
          </Link>
          <Link
            href="/about"
            className={`${linkBase} ${isActive('/about') ? 'bg-[#FFF8E7] text-gray-900' : 'hover:bg-[#F4F8FB]'}`}
          >
            About
          </Link>

          {/* (your future links remain commented out) */}
        </div>

        {/* AUTH — SAME ROUTES & onClick */}
        <div className="flex items-center gap-3">
          {!isAuthed ? (
            <>
              <Link
                href="/auth/login"
                className="rounded-[12px] border-[1.5px] border-[#D9D6CD] bg-white px-3 py-1.5 text-sm font-semibold text-[#2B2B2B] hover:bg-[#F4F8FB]"
              >
                Log in
              </Link>
              <Link
                href="/auth/register"
                className="rounded-[12px] bg-[#5C8EA7] px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-[#4A7A93]"
              >
                Register
              </Link>
            </>
          ) : (
            <button
              onClick={handleLogout}
              className="rounded-[12px] border-[1.5px] border-[#D9D6CD] bg-white px-3.5 py-1.5 text-sm font-semibold text-[#2B2B2B] hover:bg-[#F4F8FB]"
            >
              Logout
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}