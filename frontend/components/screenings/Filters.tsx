'use client';

import * as React from 'react';
import type { UIState, SetUI } from '@/lib/hooks/useScreeningsUI';

type CinemaOption = { id: number; name: string };

type Props = {
  ui: UIState;  // Applied state (used for actual queries)
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
  // Local state - what user is currently editing (not applied yet)
  // BUT search (q) always syncs with real state
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

  // Sync local state when external ui changes (except q)
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

  // Apply button: apply local state to real state and trigger query
  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setUI({ ...localUI, q: ui.q });  // Merge local filters with current search
    onApply();
  };

  // Reset button: reset everything and apply immediately
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

  // Real-time search: directly update real state
  const handleSearchChange = (value: string) => {
    setUI({ ...ui, q: value });
    onApply();
  };

  return (
    <form
      className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={handleApply}
    >
      {/* Search - Real-time, always uses ui.q */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-600">Search</span>
        <input
          type="text"
          inputMode="search"
          placeholder="Title, director…"
          className="rounded-md border px-3 py-2 text-sm"
          value={ui.q}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </label>

      {/* Cinema checkboxes - uses localUI */}
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
        
        <div className="max-h-40 overflow-y-auto rounded-md border bg-white p-2">
          {cinemaOptions.map((c) => (
            <label 
              key={c.id} 
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer rounded"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={localUI.cinemaIds.includes(String(c.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setLocalUI({ ...localUI, cinemaIds: [...localUI.cinemaIds, String(c.id)] });
                  } else {
                    setLocalUI({ ...localUI, cinemaIds: localUI.cinemaIds.filter(id => id !== String(c.id)) });
                  }
                }}
              />
              <span className="text-sm">{c.name}</span>
            </label>
          ))}
        </div>
        
        <span className="text-xs text-gray-500">
          {localUI.cinemaIds.length === 0 
            ? 'Showing all cinemas' 
            : `${localUI.cinemaIds.length} cinema${localUI.cinemaIds.length > 1 ? 's' : ''} selected`}
        </span>
      </div>

      {/* Sort - uses localUI */}
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-gray-600">Sort</span>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={localUI.sort}
            onChange={(e) => setLocalUI({ ...localUI, sort: e.target.value as UIState['sort'] })}
          >
            <option value="time">Time</option>
            <option value="title">Title</option>
            <option value="imdb">IMDb</option>
            <option value="rt">RT%</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium text-gray-600">Order</span>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={localUI.order}
            onChange={(e) => setLocalUI({ ...localUI, order: e.target.value as UIState['order'] })}
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </label>
      </div>

      {/* Date mode - uses localUI */}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
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

        {/* Single date */}
        {localUI.mode === 'single' && (
          <input
            type="date"
            className="ml-4 rounded-md border px-3 py-2 text-sm"
            value={localUI.date}
            onChange={(e) => setLocalUI({ ...localUI, date: e.target.value })}
          />
        )}

        {/* Date range */}
        {localUI.mode === 'range' && (
          <div className="ml-4 flex gap-2">
            <input
              type="date"
              className="rounded-md border px-3 py-2 text-sm"
              value={localUI.from}
              onChange={(e) => setLocalUI({ ...localUI, from: e.target.value })}
            />
            <span className="self-center text-sm text-gray-500">to</span>
            <input
              type="date"
              className="rounded-md border px-3 py-2 text-sm"
              value={localUI.to}
              onChange={(e) => setLocalUI({ ...localUI, to: e.target.value })}
            />
          </div>
        )}

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            onClick={handleReset}
            disabled={loading}
          >
            Reset
          </button>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </form>
  );
}