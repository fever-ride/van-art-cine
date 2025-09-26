'use client';

import type { SortKey, Order } from '@/app/lib/api';

type Mode = 'single' | 'range';

type UI = {
  mode: Mode;
  date: string;
  from: string;
  to: string;
  q: string;
  cinemaId: string;
  filmId: string;
  sort: SortKey;
  order: Order;
  limit: number;
};

export default function Filters({
  ui,
  setUI,
  onApply,
  loading,
}: {
  readonly ui: UI;
  readonly setUI: (p: Partial<UI> | ((s: UI) => UI)) => void;
  readonly onApply: () => void;
  readonly loading: boolean;
}) {
  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode toggle */}
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">Date Mode</legend>
          <label className="inline-flex items-center gap-1 text-sm">
            <input
              type="radio"
              name="mode"
              value="single"
              checked={ui.mode === 'single'}
              onChange={() =>
                setUI((s) => ({ ...s, mode: 'single', from: '', to: '' }))
              }
              className="h-4 w-4"
            />Single day
          </label>
          <label className="inline-flex items-center gap-1 text-sm">
            <input
              type="radio"
              name="mode"
              value="range"
              checked={ui.mode === 'range'}
              onChange={() => setUI((s) => ({ ...s, mode: 'range', date: '' }))}
              className="h-4 w-4"
            />Range
          </label>
        </fieldset>

        {/* Date inputs */}
        {ui.mode === 'single' ? (
          <input
            type="date"
            value={ui.date}
            onChange={(e) => setUI({ date: e.target.value })}
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={ui.from}
              onChange={(e) => setUI({ from: e.target.value })}
              placeholder="From"
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={ui.to}
              onChange={(e) => setUI({ to: e.target.value })}
              placeholder="To"
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        )}

        <input
          placeholder="Search title…"
          value={ui.q}
          onChange={(e) => setUI({ q: e.target.value })}
          className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-1 text-sm"
        />

        {/* Optional numeric IDs */}
        <input
          placeholder="Cinema ID"
          value={ui.cinemaId}
          onChange={(e) => setUI({ cinemaId: e.target.value })}
          inputMode="numeric"
          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          placeholder="Film ID"
          value={ui.filmId}
          onChange={(e) => setUI({ filmId: e.target.value })}
          inputMode="numeric"
          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm"
        />

        <select
          value={ui.sort}
          onChange={(e) => setUI({ sort: e.target.value as SortKey })}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="time">Time</option>
          <option value="title">Title</option>
          <option value="imdb">IMDb</option>
          <option value="rt">RottenTomatoes</option>
          <option value="votes">Votes</option>
          <option value="year">Year</option>
        </select>

        <select
          value={ui.order}
          onChange={(e) => setUI({ order: e.target.value as any })}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>

        <button
          onClick={onApply}
          disabled={loading}
          className="rounded-lg bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </section>
  );
}