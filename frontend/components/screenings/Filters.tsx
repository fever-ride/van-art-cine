'use client';

import * as React from 'react';
import type { UIState, SetUI } from '@/lib/hooks/useScreeningsUI';

type CinemaOption = { id: number; name: string };

type Props = {
  ui: UIState;
  setUI: SetUI;
  onApply: () => void;
  loading?: boolean;
  cinemaOptions?: CinemaOption[];
  layout?: 'inline' | 'sidebar';
};

export default function Filters({
  ui,
  setUI,
  onApply,
  loading,
  cinemaOptions = [],
  layout = 'inline',
}: Props) {
  const [localUI, setLocalUI] = React.useState<Omit<UIState, 'q'>>({
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

  React.useEffect(() => {
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
  const container =
    layout === 'sidebar'
      ? 'space-y-4 rounded-2xl border border-[#E5E2D8] bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]'
      : 'mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-[#E5E2D8] bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)] sm:grid-cols-2 lg:grid-cols-3';

  const control =
    'w-full rounded-[14px] border-[1.5px] border-[#D9D6CD] px-3 py-2.5 text-sm ' +
    'focus:border-[#5C8EA7] focus:outline-none focus:ring-2 focus:ring-[#5C8EA7]/30';

  const labelCls = 'text-[12px] font-semibold text-[#6C7E88]';

  return (
    <div className={container}>
      {/* Search */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Search</span>
        <input
          type="text"
          inputMode="search"
          placeholder="Title, director…"
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
              className="text-xs font-semibold text-[#5C8EA7] hover:underline"
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
              rounded-[18px] border-[1.5px] border-[#D9D6CD] bg-white
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
                className="flex items-center gap-2 rounded px-2.5 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-[6px] border-[1.5px] border-[#CFCBC1] text-[#5C8EA7] focus:ring-2 focus:ring-[#5C8EA7]/30"
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
                <span className="text-sm text-[#2B2B2B]">{c.name}</span>
              </label>
            );
          })}
        </div>

        <span className="text-[12px] text-[#6C7E88]">
          {localUI.cinemaIds.length === 0
            ? 'Showing all cinemas'
            : `${localUI.cinemaIds.length} cinema${
                localUI.cinemaIds.length > 1 ? 's' : ''
              } selected`}
        </span>
      </div>

      {/* Sort & Order */}
      <div className={layout === 'sidebar' ? 'flex gap-2' : 'flex items-end gap-2'}>
        <label className="flex-1">
          <span className={`${labelCls} mb-1 block`}>Sort</span>
          <select
            className={control}
            value={localUI.sort}
            onChange={(e) =>
              setLocalUI({ ...localUI, sort: e.target.value as UIState['sort'] })
            }
          >
            <option value="time">Time</option>
            <option value="title">Title</option>
            <option value="imdb">IMDb</option>
            <option value="rt">RT%</option>
          </select>
        </label>

        <label className="w-28">
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
          <label className="inline-flex items-center gap-2 text-sm text-[#2B2B2B]">
            <input
              type="radio"
              name="mode"
              className="h-4 w-4 appearance-none rounded-full border-[1.5px] border-[#CFCBC1]
                         checked:border-[#5C8EA7] checked:shadow-[inset_0_0_0_4px_#5C8EA7] transition"
              checked={localUI.mode === 'single'}
              onChange={() => setLocalUI({ ...localUI, mode: 'single' })}
            />
            Single date
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[#2B2B2B]">
            <input
              type="radio"
              name="mode"
              className="h-4 w-4 appearance-none rounded-full border-[1.5px] border-[#CFCBC1]
                         checked:border-[#5C8EA7] checked:shadow-[inset_0_0_0_4px_#5C8EA7] transition"
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
            <span className="text-sm text-[#6C7E88]">to</span>
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
      <div className={layout === 'sidebar' ? 'flex gap-2 pt-1' : 'ml-auto flex items-center gap-2'}>
        <button
          type="button"
          className="rounded-[14px] border-[1.5px] border-[#D9D6CD] bg-white px-4 py-2 text-sm font-semibold
                     text-[#2B2B2B] hover:bg-[#F4F8FB]"
          onClick={handleReset}
          disabled={loading}
        >
          Reset
        </button>
        <button
          type="button"
          className="rounded-[14px] bg-[#5C8EA7] px-4 py-2 text-sm font-semibold text-white
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