'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type View = 'film' | 'table';

const TABS: readonly (readonly [View, string])[] = [
  ['film', 'Movies'],
  ['table', 'Showtimes'],
];

/**
 * Movies / Showtimes switch as underline tabs: the current view is ink text
 * with an apricot bar under it, the other is muted. No filled block, so it
 * never reads as an action button (Add to Watchlist owns the apricot fill).
 *
 * The bar is one shared element that slides between tabs. It moves on click
 * (optimistic) rather than after the view's navigation commits, so the
 * feedback is immediate; it follows the URL again once that lands.
 * `motion-reduce` turns the slide into a jump.
 */
export default function ViewTabs({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  const [optimistic, setOptimistic] = useState<View | null>(null);
  const current = optimistic ?? view;

  // URL caught up (or changed via back/forward) → drop the optimistic value.
  useEffect(() => {
    setOptimistic(null);
  }, [view]);

  const tabRefs = useRef<Record<View, HTMLButtonElement | null>>({ film: null, table: null });
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = tabRefs.current[current];
    if (!el) return;
    const measure = () => setBar({ left: el.offsetLeft, width: el.offsetWidth });
    measure();
    // Re-measure when the web font swaps in or the layout changes width.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [current]);

  return (
    <div role="group" aria-label="View" className="relative inline-flex gap-6 self-start md:self-auto">
      {TABS.map(([v, label]) => {
        const selected = v === current;
        return (
          <button
            key={v}
            ref={(el) => {
              tabRefs.current[v] = el;
            }}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (v === current) return;
              setOptimistic(v);
              onChange(v);
            }}
            className={`font-display relative min-h-10 text-base font-semibold transition-colors ${
              selected ? 'text-primary' : 'text-muted hover:text-primary'
            }`}
          >
            {label}
            {/* Static bar until measured (first paint / no JS), so the
                selected tab is never unmarked. */}
            {!bar && selected && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" />
            )}
          </button>
        );
      })}
      {bar && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-[3px] bg-accent transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
        />
      )}
    </div>
  );
}
