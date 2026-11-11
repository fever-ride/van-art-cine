'use client';

import { useEffect, useState } from 'react';
import { apiToggleWatchlist } from '@/app/lib/watchlist';
import { getGuestSet, saveGuestSet } from '@/app/lib/guestWatchlist';
import { hasNumberStatus, hasResponseStatus } from '@/app/lib/typeGuards';

type Props = {
  readonly screeningId: number;
  /** If the parent already knows saved/not-saved, pass it in */
  readonly initialSaved?: boolean;
  /** Bubble the final saved state back to parent */
  readonly onChange?: (saved: boolean) => void;
  /** Small stylistic knobs (optional) */
  readonly size?: 'sm' | 'md';
  readonly className?: string;

  /** Ask for confirmation before removing (unsaving) */
  confirmBeforeRemove?: boolean;
  /** Custom confirm text (optional) */
  confirmMessage?: string;
};

export default function WatchlistButton({
  screeningId,
  initialSaved,
  onChange,
  size = 'sm',
  className = '',
  confirmBeforeRemove = false,
  confirmMessage = ''
}: Props) {
  const [saved, setSaved] = useState<boolean>(!!initialSaved);
  const [pending, setPending] = useState(false);

  // Keep local state in sync if parent changes initialSaved later
  useEffect(() => {
    if (typeof initialSaved === 'boolean') {
      setSaved(initialSaved);
    }
  }, [initialSaved]);

  async function toggle() {
    if (saved && confirmBeforeRemove) {
      const ok = window.confirm(
      confirmMessage || 'Remove this from your watchlist?'
    );
      if (!ok) return; // abort remove
    }

    const optimistic = !saved;
    setSaved(optimistic);
    setPending(true);

    try {
      const resp = await apiToggleWatchlist(screeningId);
      setSaved(resp.saved);
      onChange?.(resp.saved);
    } catch (err: unknown) {
      const status = hasNumberStatus(err) ? err.status : hasResponseStatus(err) ? err.response.status : undefined;

      if (status === 401) {
        const set = getGuestSet();
        if (set.has(screeningId)) {
          set.delete(screeningId);
          setSaved(false);
          onChange?.(false);
        } else {
          set.add(screeningId);
          setSaved(true);
          onChange?.(true);
        }
        saveGuestSet(set);
      } else {
        setSaved(!optimistic);
        console.error('Toggle failed:', err);
      }
    } finally {
      setPending(false);
    }
  }

  // One look everywhere (homepage list, film page, watchlist page):
  //   not saved → "+ Watchlist", ink outline (a quiet toggle)
  //   saved     → "✓ In watchlist", apricot fill (apricot now means "yours")
  // Words match the nav's "My Watchlist" so users know where it goes.
  // Fixed width + same 32px height as the "Get tickets" link (TicketLink),
  // so the pair lines up and the button never resizes when toggled.
  const sizeClass: Record<NonNullable<Props['size']>, string> = {
    sm: 'h-8 text-meta',
    md: 'h-10 text-sm',
  };

  const label = saved ? 'Remove from watchlist' : 'Add to watchlist';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={[
        'inline-flex w-[7.25rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-btn border px-2.5 font-semibold transition-colors duration-150',
        sizeClass[size],
        pending ? 'cursor-not-allowed opacity-60' : '',
        saved
          ? 'border-accent bg-accent text-accent-ink hover:border-accent-hover hover:bg-accent-hover'
          : 'border-primary bg-surface text-primary hover:bg-surface-hover',
        className,
      ].join(' ')}
    >
      {pending ? (
        'Working…'
      ) : saved ? (
        <>
          <span aria-hidden="true">✓</span> In watchlist
        </>
      ) : (
        <>
          <span aria-hidden="true">+</span> Watchlist
        </>
      )}
    </button>
  );
}
