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
};

export default function Filters({
  ui,
  setUI,
  onApply,
  loading,
  cinemaOptions = [], // <-- default to []
}: Props) {
  return (
    <form
      className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      {/* Search */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-600">Search</span>
        <input
          type="text"
          inputMode="search"
          placeholder="Title, director…"
          className="rounded-md border px-3 py-2 text-sm"
          value={ui.q}
          onChange={(e) => setUI({ q: e.target.value })}
        />
      </label>

      {/* Cinema (derived dropdown) */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-600">Cinema</span>
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={ui.cinemaId}
          onChange={(e) => setUI({ cinemaId: e.target.value })}
        >
          <option value="">All cinemas</option>
          {cinemaOptions.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {/* Sort */}
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-gray-600">Sort</span>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={ui.sort}
            onChange={(e) => setUI({ sort: e.target.value as UIState['sort'] })}
          >
            <option value="date">Date</option>
            <option value="title">Title</option>
            <option value="cinema">Cinema</option>
            <option value="imdb">IMDb</option>
            <option value="rt">RT%</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium text-gray-600">Order</span>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={ui.order}
            onChange={(e) => setUI({ order: e.target.value as UIState['order'] })}
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </label>
      </div>

      {/* Date mode */}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={ui.mode === 'single'}
              onChange={() => setUI({ mode: 'single' })}
            />
            Single date
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={ui.mode === 'range'}
              onChange={() => setUI({ mode: 'range' })}
            />
            Date range
          </label>
        </div>

        {/* Single date */}
        {ui.mode === 'single' && (
          <input
            type="date"
            className="ml-4 rounded-md border px-3 py-2 text-sm"
            value={ui.date}
            onChange={(e) => setUI({ date: e.target.value })}
          />
        )}

        {/* Date range */}
        {ui.mode === 'range' && (
          <div className="ml-4 flex gap-2">
            <input
              type="date"
              className="rounded-md border px-3 py-2 text-sm"
              value={ui.from}
              onChange={(e) => setUI({ from: e.target.value })}
            />
            <span className="self-center text-sm text-gray-500">to</span>
            <input
              type="date"
              className="rounded-md border px-3 py-2 text-sm"
              value={ui.to}
              onChange={(e) => setUI({ to: e.target.value })}
            />
          </div>
        )}

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() =>
              setUI((s) => ({
                ...s,
                q: '',
                cinemaId: '',
                filmId: '',
                date: '',
                from: '',
                to: '',
                sort: 'date',
                order: 'asc',
                // keep limit as-is
              }))
            }
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