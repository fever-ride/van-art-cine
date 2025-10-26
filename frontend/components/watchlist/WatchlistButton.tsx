'use client';

import { useEffect, useState } from 'react';
import { apiToggleWatchlist } from '@/app/lib/watchlist';

type Props = {
  screeningId: number;
  /** If the parent already knows saved/not-saved, pass it in */
  initialSaved?: boolean;
  /** Bubble the final saved state back to parent*/
  onChange?: (saved: boolean) => void;
  /** Small stylistic knobs (optional) */
  size?: 'sm' | 'md';
  className?: string;
};

/* ---------- Guest-mode helpers (localStorage) ---------- */
const GUEST_KEY = 'guest_watchlist'; // stores JSON array of screeningIds

function getGuestSet(): Set<number> {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveGuestSet(set: Set<number>) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(Array.from(set)));
}

/* ------------------------------------------------------- */

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
    // Optimistic flip
    const optimistic = !saved;
    setSaved(optimistic);
    setPending(true);

    try {
      // Try server first (signed-in flow). This will set/require cookies.
      const resp = await apiToggleWatchlist(screeningId);

      // Server answered `{ saved: boolean }`
      setSaved(resp.saved);
      onChange?.(resp.saved);
    } catch (err: any) {
      // If unauthorized (401), fall back to guest localStorage
      // (Your fetchJSON likely throws with e.status; adjust if needed)
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
        // Other errors: revert optimistic UI and surface a minimal hint
        setSaved(!optimistic);
        console.error('Toggle failed:', err);
        // (Optional) show a toast/snackbar here
      }
    } finally {
      setPending(false);
    }
  }

  const label = saved ? 'Saved — Remove' : 'Add to Watchlist';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={label}
      className={[
        'rounded-md border px-3 py-1 text-sm transition',
        saved ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' : 'hover:bg-gray-50',
        pending ? 'opacity-60 cursor-not-allowed' : '',
        size === 'md' ? 'px-4 py-2 text-base' : '',
        className,
      ].join(' ')}
    >
      {pending ? 'Working…' : label}
    </button>
  );
}