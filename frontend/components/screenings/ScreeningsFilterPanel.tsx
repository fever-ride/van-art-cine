'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archivo, Hanken_Grotesk } from 'next/font/google';
import type { UIState, SetUI } from '@/lib/hooks/useScreeningsUI';
import type { ScreeningFacets, ScreeningFacetValue, RatingThresholdValue } from '@/app/lib/screenings';
import { Input } from '@/components/ui';

const archivo = Archivo({ subsets: ['latin'], weight: ['700'], display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

const VISIBLE_COUNT = 5;
const SEARCH_DEBOUNCE_MS = 350;

type Props = {
  ui: UIState;
  setUI: SetUI;
  facets: ScreeningFacets;
  /** True while a setUI-triggered navigation is in flight, so the search
   * box can show it's working — same reasoning as Table view's `Filters`. */
  pending?: boolean;
};

/** Search box + facet filter panel for the Film view, modeled on a
 * festival site's own filter UI (see chat history for the reference) — a
 * Filter toggle revealing checkbox columns, each value's count shown in
 * parens, with a "see more" to reveal the long tail. Table view keeps its
 * own existing `Filters` sidebar untouched; this is additive, not a
 * replacement.
 *
 * Two different toggle behaviors by viewport, both rendered (CSS-only,
 * `sm:`/`hidden` — no JS media query, so there's nothing to get wrong on
 * first render/hydration): on desktop the button expands the five groups
 * inline, same as always. On mobile, five groups stacked in one column
 * measured at over 1000px tall with only ~850px of viewport to scroll
 * through before reaching any results — so the button instead opens
 * `MobileFilterSheet`, a full-screen overlay with its own scroll area and
 * a "Show results" action, the standard mobile pattern (Airbnb, Amazon,
 * etc.) for a filter panel too long to push inline. Both paths render the
 * same `FilterGroupsGrid`, so the two never drift into two different sets
 * of filters.
 *
 * The search box mirrors `Filters.tsx`'s own debounced-search pattern
 * (350ms debounce, `replace: true` so rapid typing doesn't flood browser
 * history) rather than sharing code with it — the two sit in different
 * layouts (a sidebar card vs. a bar above a card grid) and `Filters` ties
 * its debounce to an `onBeforeCommit` scroll-position fix (see
 * TROUBLESHOOTING.md) that Film view's grid doesn't need. */
export default function ScreeningsFilterPanel({ ui, setUI, facets, pending }: Props) {
  const [open, setOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const [localQ, setLocalQ] = useState(ui.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalQ(ui.q);
  }, [ui.q]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = (value: string) => {
    setLocalQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setUI({ q: value }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <div className={`${hanken.className} mb-6`}>
      <div className="relative mb-3 max-w-sm">
        <Input
          type="text"
          inputMode="search"
          placeholder="Enter a film title…"
          value={localQ}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="rounded-btn py-2.5 pr-8"
        />
        {pending && (
          <span
            aria-hidden="true"
            className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2
                       animate-spin rounded-full border-2 border-border border-t-accent"
          />
        )}
      </div>

      {/* Desktop: unchanged inline expand. */}
      <div className="hidden sm:block">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-btn border border-primary bg-surface px-3.5 py-2 text-sm font-semibold text-primary"
        >
          Filter
        </button>

        {open && (
          <div className="grid grid-cols-1 gap-7 rounded-b-card border border-t-0 border-border p-5 sm:grid-cols-3">
            <FilterGroupsGrid ui={ui} setUI={setUI} facets={facets} />
          </div>
        )}
      </div>

      {/* Mobile: opens a full-screen sheet instead of pushing ~1000px of
       * stacked columns between the toggle and the results. */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setMobileSheetOpen(true)}
          className="inline-flex items-center gap-2 rounded-btn border border-primary bg-surface px-3.5 py-2 text-sm font-semibold text-primary"
        >
          Filter
        </button>

        {mobileSheetOpen && (
          <MobileFilterSheet onClose={() => setMobileSheetOpen(false)}>
            <FilterGroupsGrid ui={ui} setUI={setUI} facets={facets} stacked />
          </MobileFilterSheet>
        )}
      </div>
    </div>
  );
}

/** The five filter groups, shared verbatim by the desktop inline panel and
 * the mobile sheet — `stacked` switches the grid from side-by-side columns
 * (desktop) to one column with more breathing room between groups (the
 * sheet already provides its own scroll area, so there's no reason to
 * cram columns side by side at a width that forces label wrapping). */
function FilterGroupsGrid({
  ui,
  setUI,
  facets,
  stacked = false,
}: {
  ui: UIState;
  setUI: SetUI;
  facets: ScreeningFacets;
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? 'grid grid-cols-1 gap-7' : 'contents'}>
      <FacetColumn
        title="Cinemas"
        values={facets.cinemas.map((c) => ({ name: c.name, count: c.count }))}
        selected={ui.cinemaIds}
        onToggle={(name, checked) => {
          const id = facets.cinemas.find((c) => c.name === name)?.id;
          if (id == null) return;
          const idStr = String(id);
          const next = checked
            ? [...ui.cinemaIds, idStr]
            : ui.cinemaIds.filter((v) => v !== idStr);
          setUI({ cinemaIds: next });
        }}
        isSelected={(name) => {
          const id = facets.cinemas.find((c) => c.name === name)?.id;
          return id != null && ui.cinemaIds.includes(String(id));
        }}
      />
      <FacetColumn
        title="Genre"
        values={facets.genres}
        selected={ui.genreValues}
        onToggle={(name, checked) => {
          const next = checked
            ? [...ui.genreValues, name]
            : ui.genreValues.filter((v) => v !== name);
          setUI({ genreValues: next });
        }}
        isSelected={(name) => ui.genreValues.includes(name)}
      />
      <FacetColumn
        title="Language"
        values={facets.languages}
        selected={ui.languageValues}
        onToggle={(name, checked) => {
          const next = checked
            ? [...ui.languageValues, name]
            : ui.languageValues.filter((v) => v !== name);
          setUI({ languageValues: next });
        }}
        isSelected={(name) => ui.languageValues.includes(name)}
      />
      {/* Era behaves exactly like the facets above — a real, discrete,
       * data-driven value, multi-selected with OR — the only
       * difference is the backend derives it from a year range
       * instead of reading a field straight off the film row. Exactly
       * 5 buckets, which is also VISIBLE_COUNT, so "See more" never
       * appears here. */}
      <FacetColumn
        title="Era"
        values={facets.eras.map((e) => ({ name: e.label, count: e.count }))}
        selected={ui.eraValues}
        onToggle={(name, checked) => {
          const key = facets.eras.find((e) => e.label === name)?.key;
          if (key == null) return;
          const next = checked
            ? [...ui.eraValues, key]
            : ui.eraValues.filter((v) => v !== key);
          setUI({ eraValues: next });
        }}
        isSelected={(name) => {
          const key = facets.eras.find((e) => e.label === name)?.key;
          return key != null && ui.eraValues.includes(key);
        }}
      />
      <RatingFilterColumn
        imdbThresholds={facets.ratings.imdb}
        rtThresholds={facets.ratings.rt}
        minImdb={ui.minImdb}
        minRt={ui.minRt}
        onImdbChange={(value) => setUI({ minImdb: value })}
        onRtChange={(value) => setUI({ minRt: value })}
      />
    </div>
  );
}

/** Full-screen mobile filter sheet: portaled to `document.body` (so it
 * isn't clipped by any ancestor's overflow/stacking context, same
 * reasoning as `CreateAccountModal`), locks background scroll while open,
 * and gives the filter groups their own scroll area between a sticky
 * header and a sticky "Show results" footer — this is a view/dismiss
 * affordance, not a deferred-apply one: every tap inside already commits
 * immediately via `setUI` (same as the desktop panel), so "Show results"
 * just closes the sheet to reveal the (already updated) grid behind it. */
function MobileFilterSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filter"
        className={`${hanken.className} fixed inset-x-0 bottom-0 z-[101] flex max-h-[85vh] flex-col rounded-t-card bg-surface animate-slide-up`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className={`${archivo.className} text-sm font-bold uppercase tracking-wide text-primary`}>
            Filter
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-control text-muted hover:bg-surface-subtle hover:text-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        <div className="shrink-0 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-btn bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Show results
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

function FacetColumn({
  title,
  values,
  isSelected,
  onToggle,
}: {
  title: string;
  values: ScreeningFacetValue[];
  selected: string[];
  isSelected: (name: string) => boolean;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? values : values.slice(0, VISIBLE_COUNT);
  const hiddenCount = values.length - VISIBLE_COUNT;

  // Detect whether the expanded list actually overflows its box (a column
  // with only a few extra values past VISIBLE_COUNT may not need to
  // scroll at all), rather than guessing from item count — same approach
  // as Table view's own cinema checklist (Filters.tsx's cinemaListRef).
  // The scroll container itself has no visible scrollbar hint a reader
  // would notice unprompted, so this is the only signal they'd get that
  // there's more to scroll to.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useLayoutEffect(() => {
    if (!expanded) {
      setScrollable(false);
      return;
    }
    const el = listRef.current;
    if (!el) return;

    const checkOverflow = () => {
      setScrollable(el.scrollHeight > el.clientHeight + 1);
    };
    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [expanded, values]);

  const options = visible.map((v) => (
    <label key={v.name} className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-primary">
      <input
        type="checkbox"
        className="accent-accent"
        checked={isSelected(v.name)}
        onChange={(e) => onToggle(v.name, e.target.checked)}
      />
      {v.name} ({v.count})
    </label>
  ));

  return (
    <div>
      <h3 className={`${archivo.className} mb-3 text-[11px] uppercase tracking-wide text-muted`}>
        {title}
      </h3>
      {/* Once expanded, a long tail (language in particular can run past 30
       * values) scrolls in place instead of stretching this column far
       * past its siblings — same fix already used for Table view's own
       * cinema checklist (Filters.tsx's cinemaListRef). */}
      {expanded ? (
        <div ref={listRef} className="max-h-[220px] overflow-y-auto pr-1">
          {options}
        </div>
      ) : (
        options
      )}
      {expanded && scrollable && (
        <span className="mt-1 block text-xs text-muted">Scroll for more</span>
      )}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-semibold text-accent underline"
        >
          See more ({hiddenCount} more)
        </button>
      )}
    </div>
  );
}

/** A minimum-rating picker for one service (IMDb or RT): each threshold is
 * a single-select pill, not a checkbox — picking "7.5+" after "8+" was
 * already selected replaces it rather than adding to it, since "8+ or
 * 7.5+" doesn't mean anything "7.5+" doesn't already cover on its own.
 * Clicking the already-selected pill clears it back to "no minimum,"
 * which a native radio group can't do without a separate "any" option. */
function ThresholdPicker({
  thresholds,
  value,
  onChange,
  formatLabel,
}: {
  thresholds: RatingThresholdValue[];
  value: string;
  onChange: (value: string) => void;
  formatLabel: (threshold: number) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {thresholds.map((t) => {
        const thresholdValue = String(t.threshold);
        const selected = value === thresholdValue;
        return (
          <button
            key={thresholdValue}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? '' : thresholdValue)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              selected
                ? 'border-accent bg-accent text-white'
                : 'border-border text-primary hover:bg-surface-subtle'
            }`}
          >
            {formatLabel(t.threshold)} ({t.count})
          </button>
        );
      })}
    </div>
  );
}

/** Rating filter group: IMDb and RT each get their own independent
 * minimum-rating picker, not one shared control — a reader might only
 * care about one service, and "IMDb 8+" and "RT 90+" are separate bars,
 * not steps of a single combined scale. */
function RatingFilterColumn({
  imdbThresholds,
  rtThresholds,
  minImdb,
  minRt,
  onImdbChange,
  onRtChange,
}: {
  imdbThresholds: RatingThresholdValue[];
  rtThresholds: RatingThresholdValue[];
  minImdb: string;
  minRt: string;
  onImdbChange: (value: string) => void;
  onRtChange: (value: string) => void;
}) {
  return (
    <div>
      <h3 className={`${archivo.className} mb-3 text-[11px] uppercase tracking-wide text-muted`}>
        Rating
      </h3>
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-semibold text-primary">IMDb</p>
        <ThresholdPicker
          thresholds={imdbThresholds}
          value={minImdb}
          onChange={onImdbChange}
          formatLabel={(t) => `${t}+`}
        />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-primary">Rotten Tomatoes</p>
        <ThresholdPicker
          thresholds={rtThresholds}
          value={minRt}
          onChange={onRtChange}
          formatLabel={(t) => `${t}%+`}
        />
      </div>
    </div>
  );
}
