'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { apiLogout } from '@/app/lib/auth';

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
          setIsAuthed(false);            // anonymous
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setIsAuthed(!!data.user);      // authed
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

  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-semibold">VanCine</Link>
          <Link href="/blog" className="text-sm text-gray-600 hover:underline">Blog</Link>
          <Link href="/watchlist" className="text-sm text-gray-600 hover:underline">Watchlist</Link>
          {/* 
          for future use
          <Link href="/films" className="text-sm text-gray-600 hover:underline">Films</Link>
          <Link href="/profile" className="text-sm text-gray-600 hover:underline">My Profile</Link>
          */}
        </div>

        <div className="flex items-center gap-3">
          {!isAuthed ? (
            <>
              <Link href="/auth/login" className="text-sm text-blue-600 hover:underline">Log in</Link>
              <Link href="/auth/register" className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">Register</Link>
            </>
          ) : (
            <button onClick={handleLogout} className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
              Logout
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}