'use client';

import { useEffect, useState } from 'react';
import { apiToggleWatchlist } from '@/app/lib/watchlist';
import { getGuestSet, saveGuestSet } from '@/app/lib/guestWatchlist';

type Props = {
  readonly screeningId: number;
  /** If the parent already knows saved/not-saved, pass it in */
  readonly initialSaved?: boolean;
  /** Bubble the final saved state back to parent */
  readonly onChange?: (saved: boolean) => void;
  /** Small stylistic knobs (optional) */
  readonly size?: 'sm' | 'md';
  readonly className?: string;
};

export default function WatchlistButton({
  screeningId,
  initialSaved,
  onChange,
  size = 'sm',
  className = '',
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
    const optimistic = !saved;
    setSaved(optimistic);
    setPending(true);

    try {
      const resp = await apiToggleWatchlist(screeningId);
      setSaved(resp.saved);
      onChange?.(resp.saved);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
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

  const sizeClass: Record<NonNullable<Props['size']>, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };

  const label = saved ? 'Saved — Remove' : 'Add to Watchlist';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={label}
      className={[
        'rounded-xl font-semibold transition-all duration-150 whitespace-nowrap shrink-0',
        sizeClass[size],
        'min-w-[7.5rem]', // ensures stable width (~"Add to Watchlist" width)
        pending ? 'opacity-60 cursor-not-allowed' : '',
        saved
          ? 'border border-dashed border-slate-300 text-slate-500 bg-slate-50 hover:bg-slate-100'
          : 'bg-[#6d8fa6] text-white hover:bg-[#5b7c93]',
        className,
      ].join(' ')}
    >
      {pending ? 'Working…' : saved ? 'Added ✓' : 'Add to Watchlist'}
    </button>
  );
}