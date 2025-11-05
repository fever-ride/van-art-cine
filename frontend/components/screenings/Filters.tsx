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

  const container =
    layout === 'sidebar'
      ? 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4'
      : 'mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3';

  const control = 'rounded-md border px-3 py-2 text-sm w-full';

  return (
    <div className={container}>  {/* 改成 div */}
      {/* Search */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-600">Search</span>
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
          <span className="text-xs font-medium text-gray-600">Cinemas</span>
          {localUI.cinemaIds.length > 0 && (
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setLocalUI({ ...localUI, cinemaIds: [] })}
            >
              Clear ({localUI.cinemaIds.length})
            </button>
          )}
        </div>

        <div className="max-h-48 overflow-y-auto rounded-md border bg-white p-2">
          {cinemaOptions.map((c) => {
            const idStr = String(c.id);
            const checked = localUI.cinemaIds.includes(idStr);
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer rounded"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                <span className="text-sm">{c.name}</span>
              </label>
            );
          })}
        </div>

        <span className="text-xs text-gray-500">
          {localUI.cinemaIds.length === 0
            ? 'Showing all cinemas'
            : `${localUI.cinemaIds.length} cinema${localUI.cinemaIds.length > 1 ? 's' : ''} selected`}
        </span>
      </div>

      {/* Sort & Order */}
      <div className={layout === 'sidebar' ? 'flex gap-2' : 'flex items-end gap-2'}>
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-gray-600">Sort</span>
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
          <span className="mb-1 block text-xs font-medium text-gray-600">Order</span>
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

      {/* date and date range */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={localUI.mode === 'single'}
              onChange={() => setLocalUI({ ...localUI, mode: 'single' })}
            />
            Single date
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
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

        {/* Date range */}
        {localUI.mode === 'range' && (
          <div className="mt-2 flex w-full flex-wrap items-center gap-2">
            <input
              type="date"
              className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
              value={localUI.from}
              onChange={(e) => setLocalUI({ ...localUI, from: e.target.value })}
            />
            <span className="text-sm text-gray-500">to</span>
            <input
              type="date"
              className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
              value={localUI.to}
              onChange={(e) => setLocalUI({ ...localUI, to: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* buttons */}
      <div className={layout === 'sidebar' ? 'flex gap-2 pt-1' : 'ml-auto flex items-center gap-2'}>
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={handleReset}
          disabled={loading}
        >
          Reset
        </button>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
          onClick={handleApply}
          disabled={loading}
        >
          {loading ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </div>
  );
}