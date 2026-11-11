'use client';

import { useState } from 'react';
import Link from 'next/link';
import { INTRO_DISMISSED_COOKIE } from '@/app/lib/siteIntro';

/**
 * One-line "what is this site" note for visitors who land on a film page from
 * outside (search, social, a shared link). Search visitors often don't know
 * this is a city-wide screening guide; this points them at the homepage
 * without a popup or a separate banner (interstitials hurt UX and Google
 * ranking, and an extra band made the top of the page feel fragmented).
 *
 * Rendered *inside* the dark film hero as a small eyebrow line above the
 * poster/title, so it adds no block of its own. Whether to show it is
 * decided on the server (films/[id]/page.tsx) from the Referer and the
 * dismiss cookie, so it's in the first paint. Copy is the homepage hero
 * headline, unchanged.
 */
export default function SiteIntroBar() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const dismiss = () => {
    // One year; Lax so it's sent on normal navigations.
    document.cookie = `${INTRO_DISMISSED_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax`;
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2 text-meta text-white/75">
      <p className="min-w-0">
        Vancouver&apos;s indie screenings, all in one place.{' '}
        <Link
          href="/"
          className="whitespace-nowrap font-semibold text-accent underline-offset-2 hover:underline"
        >
          See what&apos;s on →
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-control text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <svg aria-hidden="true" viewBox="0 0 14 14" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 1l12 12M13 1 1 13" />
        </svg>
      </button>
    </div>
  );
}
