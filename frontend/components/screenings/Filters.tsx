'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import type { UIState, SetUI } from '@/lib/hooks/useScreeningsUI';
import { todayYmdInDisplayTimezone } from '@/app/lib/formatDate';
import ScreeningDateInput from '@/components/screenings/ScreeningDateInput';
import { Card, Button } from '@/components/ui';

type CinemaOption = { id: number; name: string };

type Props = {
  ui: UIState;
  setUI: SetUI;
  onBeforeCommit: () => void;
  loading?: boolean;
  /** True while a setUI-triggered navigation (Apply, Reset) is in flight,
   * so the Apply button can show it's working. */
  pending?: boolean;
  cinemaOptions?: CinemaOption[];
  /** Called after Apply or Reset commits (e.g. to close the mobile sheet). */
  onCommitted?: () => void;
  /** Render without the Card chrome (inside the mobile sheet). */
  bare?: boolean;
};

export default function Filters({
  ui,
  setUI,
  onBeforeCommit,
  loading,
  pending,
  cinemaOptions = [],
  onCommitted,
  bare = false,
}: Props) {
  // Draft of the sidebar's filters, committed to the URL only on Apply.
  // It is re-synced from the URL only when the sidebar's own fields change
  // *by value* (Apply, browser back/forward) — not on every render, and not
  // when only the search term `q` changes. `ui` is re-parsed from the URL on
  // every render (new object identity each time), so depending on `[ui]`
  // wiped unapplied edits whenever the parent re-rendered, e.g. after a
  // search commit. See TROUBLESHOOTING.md → "Unapplied filter edits vanish".
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { q: _q, ...uiFilters } = ui;
  const filtersKey = JSON.stringify(uiFilters);
  const [localUI, setLocalUI] = useState<Omit<UIState, 'q'>>(uiFilters);

  useEffect(() => {
    setLocalUI(JSON.parse(filtersKey));
  }, [filtersKey]);


  // Detect whether the cinema checklist actually overflows its box, so we
  // can hint "scroll for more" instead of a hardcoded item-count guess —
  // stays correct no matter how many cinemas exist or how tall each row is.
  const cinemaListRef = useRef<HTMLDivElement>(null);
  const [cinemaListScrollable, setCinemaListScrollable] = useState(false);

  useLayoutEffect(() => {
    const el = cinemaListRef.current;
    if (!el) return;

    const checkOverflow = () => {
      setCinemaListScrollable(el.scrollHeight > el.clientHeight + 1);
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [cinemaOptions]);

  // Search is committed separately (SearchBar); Apply/Reset only touch the
  // sidebar's own fields, so they leave the current search term alone.
  const commitApply = () => {
    setUI({ ...localUI });
    onCommitted?.();
  };

  const commitReset = () => {
    setLocalUI({
      cinemaIds: [],
      genreValues: [],
      languageValues: [],
      eraValues: [],
      minImdb: '',
      minRt: '',
      filmId: '',
      date: '',
      from: '',
      to: '',
      sort: 'time',
      order: 'asc',
      mode: 'single',
      limit: ui.limit,
      view: ui.view,
    });
    setUI({
      cinemaIds: [],
      genreValues: [],
      languageValues: [],
      eraValues: [],
      minImdb: '',
      minRt: '',
      filmId: '',
      date: '',
      from: '',
      to: '',
      sort: 'time',
      order: 'asc',
      mode: 'single',
      limit: ui.limit,
    });
    onCommitted?.();
  };

  const todayMin = todayYmdInDisplayTimezone();
  const rangeEndMin =
    localUI.from && localUI.from > todayMin ? localUI.from : todayMin;

  const labelCls = 'text-xs font-semibold text-primary';
  const control =
    'w-full rounded-btn border border-border px-3 py-2.5 text-sm ' +
    'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20';

  return (
    <Card className={bare ? 'space-y-4 border-0 p-0 shadow-none' : 'space-y-4 p-4'}>
      {/* Cinemas */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Cinemas</span>
          {localUI.cinemaIds.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs font-semibold text-accent-strong hover:underline"
              onClick={() => setLocalUI({ ...localUI, cinemaIds: [] })}
            >
              Clear ({localUI.cinemaIds.length})
            </Button>
          )}
        </div>

          <div
            ref={cinemaListRef}
            className="
              max-h-[min(40vh,280px)] lg:max-h-[min(24vh,165px)]   /* compact so Apply/Reset stay visible without extra scrolling */
              overflow-y-auto overscroll-contain
              rounded-btn border-[1.5px] border-border bg-surface
              p-3 pr-2                   /* give room so scrollbar doesn't cover text */
              scroll-py-2
            "
          >
          {cinemaOptions.map((c) => {
            const idStr = String(c.id);
            const checked = localUI.cinemaIds.includes(idStr);
            return (
              <label
                key={c.id}
                className="flex min-h-11 items-center gap-3 rounded px-1 hover:bg-surface-subtle cursor-pointer transition-colors lg:min-h-9"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 rounded-control border border-border accent-[var(--accent-strong)] focus:ring-1 focus:ring-accent/20"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setLocalUI({
                        ...localUI,
                        cinemaIds: [...localUI.cinemaIds, idStr],
                      });
                    } else {
                      setLocalUI({
                        ...localUI,
                        cinemaIds: localUI.cinemaIds.filter((x) => x !== idStr),
                      });
                    }
                  }}
                />
                <span className="text-xs text-primary">{c.name}</span>
              </label>
            );
          })}
        </div>

        <span className="text-xs text-muted">
          {localUI.cinemaIds.length === 0
            ? cinemaListScrollable
              ? 'Scroll for more'
              : 'Showing all cinemas'
            : `${localUI.cinemaIds.length} cinema${
                localUI.cinemaIds.length > 1 ? 's' : ''
              } selected`}
        </span>
      </div>

      {/* Sort & Order */}
      <div className="flex gap-2">
        <label className="flex-1">
          <span className={`${labelCls} mb-1 block`}>Sort</span>
          <select
            className={control}
            value={localUI.sort}
            onChange={(e) =>
              setLocalUI({ ...localUI, sort: e.target.value as UIState['sort'] })
            }
          >
            <option value="time">Screening Time</option>
            <option value="title">Film Title</option>
            <option value="imdb">IMDb Ratings</option>
            <option value="rt">Rotten Tomatoes %</option>
          </select>
        </label>

        <label className="w-18">
          <span className={`${labelCls} mb-1 block`}>Order</span>
          <select
            className={control}
            value={localUI.order}
            onChange={(e) =>
              setLocalUI({ ...localUI, order: e.target.value as UIState['order'] })
            }
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </label>
      </div>

      {/* Date / Range */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-primary lg:min-h-9">
            <input
              type="radio"
              name="mode"
              className="h-4 w-4 appearance-none rounded-full border-[1.5px] border-border
                         checked:border-accent checked:shadow-[inset_0_0_0_4px_var(--accent)] transition"
              checked={localUI.mode === 'single'}
              onChange={() => setLocalUI({ ...localUI, mode: 'single' })}
            />
            Single date
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-primary lg:min-h-9">
            <input
              type="radio"
              name="mode"
              className="h-4 w-4 appearance-none rounded-full border-[1.5px] border-border
                         checked:border-accent checked:shadow-[inset_0_0_0_4px_var(--accent)] transition"
              checked={localUI.mode === 'range'}
              onChange={() => setLocalUI({ ...localUI, mode: 'range' })}
            />
            Date range
          </label>
        </div>

        {localUI.mode === 'single' && (
          <ScreeningDateInput
            min={todayMin}
            value={localUI.date}
            onChange={(date) => setLocalUI({ ...localUI, date })}
          />
        )}

        {localUI.mode === 'range' && (
          <div className="mt-2 flex w-full flex-wrap items-center gap-2">
            <ScreeningDateInput
              min={todayMin}
              value={localUI.from}
              placeholder="From"
              onChange={(from) => setLocalUI({ ...localUI, from })}
            />
            <span className="text-sm text-muted">to</span>
            <ScreeningDateInput
              min={rangeEndMin}
              value={localUI.to}
              placeholder="To"
              onChange={(to) => setLocalUI({ ...localUI, to })}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={(e) => {
            onBeforeCommit();
            commitReset();
            e.currentTarget.blur();
          }}
          disabled={loading || pending}
        >
          Reset
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={(e) => {
            onBeforeCommit();
            commitApply();
            e.currentTarget.blur();
          }}
          disabled={loading || pending}
        >
          {loading || pending ? 'Applying…' : 'Apply'}
        </Button>
      </div>
    </Card>
  );
}