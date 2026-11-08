'use client';

import { useEffect, useRef, useState } from 'react';
import type { SetUI } from '@/lib/hooks/useScreeningsUI';
import { Input } from '@/components/ui';

export const SEARCH_DEBOUNCE_MS = 350;

type Props = {
  /** Current committed search term (from the URL). */
  q: string;
  setUI: SetUI;
  /** True while a setUI-triggered navigation is in flight. */
  pending?: boolean;
  /** Called right before the debounced search commits. Showtimes view uses
   * it to capture row height so a shrinking result set doesn't strand the
   * reader's scroll position (TROUBLESHOOTING.md "Homepage scroll jumps"). */
  onBeforeCommit?: () => void;
};

/**
 * The single search box shared by both homepage views (Movies and
 * Showtimes). Search is instant (debounced), unlike the sidebar/sheet
 * filters, which are staged and applied together — so it lives outside
 * them. Keeping one implementation also replaced two copies of this
 * debounce. See TROUBLESHOOTING.md → "Unapplied filter edits vanish".
 */
export default function SearchBar({ q, setUI, pending, onBeforeCommit }: Props) {
  const [localQ, setLocalQ] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow external changes (Reset, back/forward) without clobbering typing:
  // q only changes when a search commits or the URL changes underneath.
  useEffect(() => {
    setLocalQ(q);
  }, [q]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (value: string) => {
    setLocalQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onBeforeCommit?.();
      // replace: true — fires as the user pauses typing, not a discrete
      // action, so it shouldn't add a history entry per keystroke group.
      setUI({ q: value }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <div className="relative w-full md:max-w-md">
      <label htmlFor="screenings-search" className="sr-only">
        Search films
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      >
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="m20 20-3.5-3.5" />
      </svg>
      <Input
        id="screenings-search"
        type="search"
        inputMode="search"
        placeholder="Search film titles…"
        value={localQ}
        onChange={(e) => handleChange(e.target.value)}
        className="min-h-11 rounded-btn py-2.5 pl-9 pr-8"
      />
      {pending && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2
                     animate-spin rounded-full border-2 border-border border-t-accent"
        />
      )}
    </div>
  );
}
