'use client';

import { useCallback, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  parseUIStateFromSearchParams,
  serializeUIStateToSearchParams,
  type Mode,
  type UIState,
} from './screeningsUrlState';

/**
 * Screenings UI State Management
 *
 * Reads and writes filter, sort, and display state for the screenings page
 * through the URL, so that a given filtered view has its own address: it can
 * be bookmarked, shared, and stepped through with the browser's back and
 * forward buttons. See docs/specs/url-driven-filters.md for the full
 * reasoning; `page` (pagination) already worked this way before this hook
 * did and is unaffected here.
 *
 * `ui` is derived fresh from the current URL on every render, via
 * `parseUIStateFromSearchParams`, rather than owned as local component
 * state. The URL is the one shared source of truth for the results.
 *
 * Writes are split by OWNER, each with its own React transition, so each
 * control gets its own pending flag and can only write its own fields:
 *
 * - `setSearch(q)`  — the search box. Writes only `q`. `router.replace`
 *   (fires as typing pauses; shouldn't add a history entry per keystroke).
 * - `setFilters(p)` — filter sidebar / sheet / film-view facets. Writes
 *   everything except `q` and `view`. `router.push` (Apply is a discrete,
 *   back-button-able action).
 * - `setView(v)`    — the Movies/Showtimes toggle. Writes only `view`.
 *
 * `pending.search` / `pending.filters` / `pending.view` are true only
 * while THAT owner's navigation is in flight; `pending.any` is for page
 * level concerns (e.g. holding layout height during any refetch).
 * Note: React currently entangles transitions that overlap in time, so if
 * two owners navigate at the same moment both may report pending until
 * both settle — that is accurate (both are waiting), not cross-talk.
 *
 * Every write starts back at page 1 (drops `page`) and never scrolls to
 * the top (`scroll: false`).
 */

export type { Mode, UIState };

/** Fields owned by the filter UIs (everything but the search term and view). */
export type FiltersState = Omit<UIState, 'q' | 'view'>;

export type SetFilters = (
  patch: Partial<FiltersState> | ((s: FiltersState) => Partial<FiltersState>)
) => void;
export type SetSearch = (q: string) => void;
export type SetView = (view: UIState['view']) => void;

export type ScreeningsPending = {
  search: boolean;
  filters: boolean;
  view: boolean;
  any: boolean;
};

function filtersOf(ui: UIState): FiltersState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { q, view, ...rest } = ui;
  return rest;
}

/**
 * @param defaultValues - Optional fallback values for fields the URL does
 * not specify, in place of the global default. A value the URL actually
 * specifies always wins over this.
 */
export function useScreeningsUI(defaultValues?: Partial<UIState>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchPending, startSearch] = useTransition();
  const [filtersPending, startFilters] = useTransition();
  const [viewPending, startView] = useTransition();

  const ui = parseUIStateFromSearchParams(searchParams, defaultValues);

  const navigate = useCallback(
    (next: UIState, mode: 'push' | 'replace', start: (cb: () => void) => void) => {
      const qs = serializeUIStateToSearchParams(next).toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      start(() => {
        router[mode](url, { scroll: false });
      });
    },
    [pathname, router]
  );

  const setSearch = useCallback<SetSearch>(
    (q) => navigate({ ...ui, q }, 'replace', startSearch),
    [ui, navigate]
  );

  const setFilters = useCallback<SetFilters>(
    (patch) => {
      const resolved = typeof patch === 'function' ? patch(filtersOf(ui)) : patch;
      // Runtime guard on top of the type: filters can never touch q / view.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { q, view, ...owned } = resolved as Partial<UIState>;
      navigate({ ...ui, ...owned }, 'push', startFilters);
    },
    [ui, navigate]
  );

  const setView = useCallback<SetView>(
    (view) => navigate({ ...ui, view }, 'push', startView),
    [ui, navigate]
  );

  const pending: ScreeningsPending = {
    search: searchPending,
    filters: filtersPending,
    view: viewPending,
    any: searchPending || filtersPending || viewPending,
  };

  return { ui, setSearch, setFilters, setView, pending };
}
