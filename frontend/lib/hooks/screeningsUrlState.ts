/**
 * Pure translation helpers between the screenings filter URL query string
 * and the `UIState` shape the rest of the app already works with.
 *
 * - `parseUIStateFromSearchParams`: URL -> `UIState`. Fills in `defaultUI`
 *   for anything absent or unrecognized, rather than throwing. An optional
 *   second argument overrides `defaultUI` per field, for callers (such as
 *   `useScreeningsUI`'s own `defaultValues` parameter) that want a
 *   different fallback than the global default when the URL is silent on
 *   a field, without overriding a value the URL actually specifies.
 * - `serializeUIStateToSearchParams`: `UIState` -> `URLSearchParams`. Omits
 *   any field that already equals its default, so the default view keeps a
 *   clean URL with no query string.
 *
 * Kept separate from `useScreeningsUI` so both directions can be unit
 * tested in isolation before being wired into any component or hook. See
 * docs/specs/url-driven-filters.md, task 1.
 *
 * `page` is deliberately not handled here. It already has its own working
 * URL round trip in `frontend/app/page.tsx`, and this module only extends
 * the same pattern to the other filter fields.
 */

import type { SortKey, Order, ScreeningsQuery } from '@/app/lib/screenings';

export type Mode = 'single' | 'range';
export type View = 'table' | 'film';

export type UIState = {
  mode: Mode;
  date: string;
  from: string;
  to: string;
  q: string;
  cinemaIds: string[];
  genreValues: string[];
  languageValues: string[];
  eraValues: string[];
  /** Minimum IMDb/RT rating, as a string (consistent with filmId/date's own
   * "empty string means unset" convention) rather than `number | null` —
   * this is form-control state, converted to a real number only when
   * building the backend query (see `buildScreeningsQuery`). */
  minImdb: string;
  minRt: string;
  filmId: string;
  sort: SortKey;
  order: Order;
  limit: number;
  view: View;
};

// Duplicated from useScreeningsUI.ts for now, so this file has no
// dependency on it yet. Task 3 (the useScreeningsUI rewrite) removes this
// copy and imports defaultUI from here instead.
export const defaultUI: UIState = {
  mode: 'single',
  date: '',
  from: '',
  to: '',
  q: '',
  cinemaIds: [],
  genreValues: [],
  languageValues: [],
  eraValues: [],
  minImdb: '',
  minRt: '',
  filmId: '',
  sort: 'time',
  order: 'asc',
  limit: 20,
  // Table is the existing, proven behavior — Film is opt-in, not a default
  // switch under existing visitors/bookmarks.
  view: 'table',
};

function isView(value: string): value is View {
  return value === 'table' || value === 'film';
}

const SORT_KEYS: readonly SortKey[] = ['time', 'title', 'imdb', 'rt', 'votes', 'year'];
const ORDER_KEYS: readonly Order[] = ['asc', 'desc'];

function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

function isOrder(value: string): value is Order {
  return (ORDER_KEYS as readonly string[]).includes(value);
}

/** Structurally compatible with both URLSearchParams and Next.js's
 * ReadonlyURLSearchParams (the type `useSearchParams()` returns). */
type ReadableSearchParams = { get(key: string): string | null };

export function parseUIStateFromSearchParams(
  searchParams: ReadableSearchParams,
  overrides?: Partial<UIState>
): UIState {
  // Fields fall back to `base` (defaultUI, unless the caller supplies its
  // own override for that field) when the URL doesn't specify them.
  const base: UIState = { ...defaultUI, ...overrides };

  const date = searchParams.get('date') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  // Infer mode from which date fields are present, instead of a separate
  // `mode` parameter that could disagree with them. If a hand edited URL
  // somehow has both `date` and `from`/`to`, prefer single date mode.
  const mode: Mode = date ? 'single' : from || to ? 'range' : base.mode;

  const cinemaIdsParam = searchParams.get('cinema_ids');
  const cinemaIds = cinemaIdsParam
    ? cinemaIdsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : base.cinemaIds;

  const genreParam = searchParams.get('genre');
  const genreValues = genreParam
    ? genreParam.split(',').map((s) => s.trim()).filter(Boolean)
    : base.genreValues;

  const languageParam = searchParams.get('language');
  const languageValues = languageParam
    ? languageParam.split(',').map((s) => s.trim()).filter(Boolean)
    : base.languageValues;

  const eraParam = searchParams.get('era');
  const eraValues = eraParam
    ? eraParam.split(',').map((s) => s.trim()).filter(Boolean)
    : base.eraValues;

  const sortParam = searchParams.get('sort');
  const sort = sortParam && isSortKey(sortParam) ? sortParam : base.sort;

  const orderParam = searchParams.get('order');
  const order = orderParam && isOrder(orderParam) ? orderParam : base.order;

  const viewParam = searchParams.get('view');
  const view = viewParam && isView(viewParam) ? viewParam : base.view;

  return {
    mode,
    date: mode === 'single' ? date : '',
    from: mode === 'range' ? from : '',
    to: mode === 'range' ? to : '',
    q: searchParams.get('q') ?? base.q,
    cinemaIds,
    genreValues,
    languageValues,
    eraValues,
    minImdb: searchParams.get('min_imdb') ?? base.minImdb,
    minRt: searchParams.get('min_rt') ?? base.minRt,
    filmId: searchParams.get('film_id') ?? base.filmId,
    sort,
    order,
    limit: base.limit,
    view,
  };
}

export function serializeUIStateToSearchParams(ui: UIState): URLSearchParams {
  const params = new URLSearchParams();

  if (ui.q && ui.q !== defaultUI.q) params.set('q', ui.q);
  if (ui.cinemaIds.length > 0) params.set('cinema_ids', ui.cinemaIds.join(','));
  if (ui.genreValues.length > 0) params.set('genre', ui.genreValues.join(','));
  if (ui.languageValues.length > 0) params.set('language', ui.languageValues.join(','));
  if (ui.eraValues.length > 0) params.set('era', ui.eraValues.join(','));
  if (ui.minImdb && ui.minImdb !== defaultUI.minImdb) params.set('min_imdb', ui.minImdb);
  if (ui.minRt && ui.minRt !== defaultUI.minRt) params.set('min_rt', ui.minRt);
  if (ui.filmId && ui.filmId !== defaultUI.filmId) params.set('film_id', ui.filmId);
  if (ui.view !== defaultUI.view) params.set('view', ui.view);

  if (ui.mode === 'single') {
    if (ui.date) params.set('date', ui.date);
  } else {
    if (ui.from) params.set('from', ui.from);
    if (ui.to) params.set('to', ui.to);
  }

  if (ui.sort !== defaultUI.sort) params.set('sort', ui.sort);
  if (ui.order !== defaultUI.order) params.set('order', ui.order);

  return params;
}

/**
 * True when a range mode UIState has "from" after "to". Checked before
 * fetching, in both the old client side path and the current server side
 * one, so a nonsensical range shows an error instead of quietly returning
 * whatever the backend happens to do with it.
 */
export function isInvalidDateRange(ui: UIState): boolean {
  return ui.mode === 'range' && !!ui.from && !!ui.to && ui.from > ui.to;
}

const numOrUndefined = (s: string): number | undefined =>
  s.trim() !== '' ? Number(s) : undefined;

/**
 * Translates the app's `UIState` into the `ScreeningsQuery` shape the
 * backend's /api/screenings endpoint expects. Shared by the server side
 * fetch in `frontend/app/page.tsx` and, previously, by the client side
 * `useScreeningsData` hook this replaced, so both build the same query the
 * same way.
 *
 * `tz` defaults to America/Vancouver, matching every call site today: the
 * app always requests screening times in the venues' own local timezone,
 * never the visitor's.
 */
export function buildScreeningsQuery(
  ui: UIState,
  offset = 0,
  tz = 'America/Vancouver'
): ScreeningsQuery {
  const query: ScreeningsQuery = {
    q: ui.q,
    cinema_ids: ui.cinemaIds.length > 0 ? ui.cinemaIds.map(Number) : undefined,
    genre: ui.genreValues.length > 0 ? ui.genreValues : undefined,
    language: ui.languageValues.length > 0 ? ui.languageValues : undefined,
    era: ui.eraValues.length > 0 ? ui.eraValues : undefined,
    min_imdb: numOrUndefined(ui.minImdb),
    min_rt: numOrUndefined(ui.minRt),
    film_id: ui.filmId ? numOrUndefined(ui.filmId) : undefined,
    sort: ui.sort,
    order: ui.order,
    limit: ui.limit,
    offset,
    tz,
  };

  if (ui.mode === 'single') {
    if (ui.date) query.date = ui.date;
  } else {
    if (ui.from) query.from = ui.from;
    if (ui.to) query.to = ui.to;
  }

  return query;
}
