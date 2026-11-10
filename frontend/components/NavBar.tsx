'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button, getButtonClassName } from '@/components/ui';
import SignInDropdown from '@/components/auth/SignInDropdown';
import CreateAccountModal from '@/components/auth/CreateAccountModal';
import MustSeesMenu from '@/components/MustSeesMenu';


export default function NavBar() {
  const { status, signOut } = useAuth();
  const isAuthed = status === 'authed';
  const [showSignIn, setShowSignIn] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);

  // Publish the header's real height as --header-h so sticky offsets and
  // scroll targets elsewhere (filters sidebar, results jump) never guess it.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  const isActive = (href: string) => pathname === href;
  const pill =
    'inline-flex min-h-10 items-center whitespace-nowrap px-3 text-sm font-medium text-muted hover:bg-primary hover:text-white transition-colors';

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-rule bg-surface backdrop-blur supports-[backdrop-filter]:bg-surface/85"
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Row 1: Brand (left) + Auth (right). Never wraps: on phones the
            tagline hides and "Create account" shortens to "Join". */}
        <div className="flex items-center justify-between gap-3 py-2">
          {/* Brand block (logo + wordmark + tagline) */}
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <Image
              src="/logo-no-title.svg"
              alt="The Cinephile’s Van logo"
              width={40}
              height={40}
              className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
              priority
            />
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold leading-none tracking-tight text-primary sm:text-[20px]">
                The Cinephile’s Van
              </div>
              <div className="mt-1 hidden text-[12px] leading-tight text-muted sm:block">
                Rolling through Vancouver’s film scene
              </div>
            </div>
          </Link>

          {/* Auth actions */}
          {/* Hidden (space kept) until auth is known, so signed-in users
              don't see "Sign in" flash on every page load. */}
          <div
            className={`flex shrink-0 items-center gap-2 sm:gap-3 ${
              status === 'loading' ? 'invisible' : ''
            }`}
          >
            {!isAuthed ? (
              <>
                <button
                  onClick={() => setShowSignIn(true)}
                  className={getButtonClassName({ variant: 'outline', size: 'sm' })}
                >
                  Sign in
                </button>
                <button
                  onClick={() => setShowCreateAccount(true)}
                  className={getButtonClassName({ variant: 'primary', size: 'sm' })}
                >
                  <span className="sm:hidden">Join</span>
                  <span className="hidden sm:inline">Create account</span>
                </button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            )}
          </div>
        </div>

        {/* Sign In Dropdown */}
        <SignInDropdown
          isOpen={showSignIn}
          onClose={() => setShowSignIn(false)}
        />

        {/* Create Account Modal */}
        <CreateAccountModal
          isOpen={showCreateAccount}
          onClose={() => setShowCreateAccount(false)}
        />

        {/* Row 2: Section menu */}
        <div className="border-t border-border-light">
          <nav className="-ml-3 flex snap-x snap-mandatory items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:gap-2">
            <MustSeesMenu />

            <Link
              href="/watchlist"
              target="_blank"
              rel="noopener noreferrer"
              className={`${pill} ${
                isActive('/watchlist') ? 'bg-primary text-white' : ''
              } snap-start`}
            >
              My Watchlist
            </Link>

            {isAuthed && (
              <Link
                href="/profile"
                className={`${pill} ${
                  isActive('/profile') ? 'bg-primary text-white' : ''
                } snap-start`}
              >
                My Profile
              </Link>
            )}

            <Link
              href="/about"
              className={`${pill} ${
                isActive('/about') ? 'bg-primary text-white' : ''
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