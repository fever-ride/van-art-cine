'use client';

import { useState, useEffect } from 'react';
import type { UIState, SetUI } from '@/lib/hooks/useScreeningsUI';

type CinemaOption = { id: number; name: string };

type Props = {
  ui: UIState;
  setUI: SetUI;
  onApply: () => void;
  loading?: boolean;
  cinemaOptions?: CinemaOption[];
};

export default function Filters({
  ui,
  setUI,
  onApply,
  loading,
  cinemaOptions = [],
}: Props) {
  const [localUI, setLocalUI] = useState<Omit<UIState, 'q'>>({
    cinemaIds: ui.cinemaIds,
    filmId: ui.filmId,
    date: ui.date,
    from: ui.from,
    to: ui.to,
    sort: ui.sort,
    order: ui.order,
    mode: ui.mode,
    limit: ui.limit,
  });

  useEffect(() => {
    setLocalUI({
      cinemaIds: ui.cinemaIds,
      filmId: ui.filmId,
      date: ui.date,
      from: ui.from,
      to: ui.to,
      sort: ui.sort,
      order: ui.order,
      mode: ui.mode,
      limit: ui.limit,
    });
  }, [ui]);

  const handleApply = () => {
    setUI({ ...localUI, q: ui.q });
    onApply();
  };

  const handleReset = () => {
    const resetState: UIState = {
      q: '',
      cinemaIds: [],
      filmId: '',
      date: '',
      from: '',
      to: '',
      sort: 'time',
      order: 'asc',
      mode: 'single',
      limit: ui.limit,
    };
    setLocalUI({
      cinemaIds: [],
      filmId: '',
      date: '',
      from: '',
      to: '',
      sort: 'time',
      order: 'asc',
      mode: 'single',
      limit: ui.limit,
    });
    setUI(resetState);
    onApply();
  };

  const handleSearchChange = (value: string) => {
    setUI({ ...ui, q: value });
    onApply();
  };

  // === THEMED CLASSES ===
  const container = 'space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)]'

  const control =
    'w-full rounded-[12px] border-[1.5px] border-border px-3 py-2.5 text-sm ' +
    'focus:border-border focus:outline-none focus:ring-1 focus:ring-accent/30';

  const labelCls = 'text-[12px] font-semibold text-accent';

  return (
    <div className={container}>
      {/* Search */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Search</span>
        <input
          type="text"
          inputMode="search"
          placeholder="Enter a film title…"
          className={control}
          value={ui.q}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </label>

      {/* Cinemas */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Cinemas</span>
          {localUI.cinemaIds.length > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-accent hover:underline"
              onClick={() => setLocalUI({ ...localUI, cinemaIds: [] })}
            >
              Clear ({localUI.cinemaIds.length})
            </button>
          )}
        </div>

          <div
            className="
              max-h-[min(50vh,420px)]   /* flexible until 50vh or 420px, whichever is smaller */
              overflow-y-auto overscroll-contain
              rounded-[14px] border-[1.5px] border-border bg-surface
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
                className="flex items-center gap-2 rounded px-1 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded-[4px] border-[0.5px] border-border text-accent focus:ring-1 focus:ring-accent/30"
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
                <span className="text-xs text-[#2B2B2B]">{c.name}</span>
              </label>
            );
          })}
        </div>

        <span className="text-xs text-muted">
          {localUI.cinemaIds.length === 0
            ? 'Showing all cinemas'
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
          <label className="inline-flex items-center gap-2 text-sm text-primary">
            <input
              type="radio"
              name="mode"
              className="h-4 w-4 appearance-none rounded-full border-[1.5px] border-border
                         checked:border-accent checked:shadow-[inset_0_0_0_4px_#5C8EA7] transition"
              checked={localUI.mode === 'single'}
              onChange={() => setLocalUI({ ...localUI, mode: 'single' })}
            />
            Single date
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-primary">
            <input
              type="radio"
              name="mode"
              className="h-4 w-4 appearance-none rounded-full border-[1.5px] border-border
                         checked:border-accent checked:shadow-[inset_0_0_0_4px_#5C8EA7] transition"
              checked={localUI.mode === 'range'}
              onChange={() => setLocalUI({ ...localUI, mode: 'range' })}
            />
            Date range
          </label>
        </div>

        {localUI.mode === 'single' && (
          <input
            type="date"
            className={control}
            value={localUI.date}
            onChange={(e) => setLocalUI({ ...localUI, date: e.target.value })}
          />
        )}

        {localUI.mode === 'range' && (
          <div className="mt-2 flex w-full flex-wrap items-center gap-2">
            <input
              type="date"
              className={control}
              value={localUI.from}
              onChange={(e) => setLocalUI({ ...localUI, from: e.target.value })}
            />
            <span className="text-sm text-muted">to</span>
            <input
              type="date"
              className={control}
              value={localUI.to}
              onChange={(e) => setLocalUI({ ...localUI, to: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="rounded-[14px] border-[1.5px] border-border bg-surface px-4 py-2 text-sm font-semibold
                     text-primary hover:bg-[#F4F8FB]"
          onClick={handleReset}
          disabled={loading}
        >
          Reset
        </button>
        <button
          type="button"
          className="rounded-[14px] bg-[#5C8EA7] px-4 py-2 text-sm font-semibold text-surface
                     hover:bg-[#4A7A93] disabled:opacity-60"
          onClick={handleApply}
          disabled={loading}
        >
          {loading ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  );
}