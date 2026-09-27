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
 * state. `setUI` merges the given patch onto the current `ui` and
 * navigates to the resulting URL with `router.push`, rather than calling a
 * state setter.
 *
 * Callers such as `Filters.tsx` are unaffected: they still read `ui` and
 * call `setUI` exactly as before, unaware that a call now results in a
 * real navigation instead of a local state update.
 */

export type { Mode, UIState };

/**
 * State updater function
 * Accepts either a partial state object or an updater function
 */
export type SetUI = (patch: Partial<UIState> | ((s: UIState) => UIState)) => void;

/**
 * Hook for managing screenings page UI state
 *
 * @param defaultValues - Optional fallback values for fields the URL does
 * not specify, in place of the global default. A value the URL actually
 * specifies always wins over this.
 * @returns Object with current state, setter function, and `isPending`,
 * true while a `setUI`-triggered navigation is still in flight, for
 * callers that want to show a loading state during it.
 *
 * @example
 * ```tsx
 * const { ui, setUI } = useScreeningsUI({ mode: 'range' });
 *
 * // Update with object
 * setUI({ q: 'Parasite' });
 *
 * // Update with function
 * setUI(s => ({ ...s, limit: s.limit + 20 }));
 * ```
 */
export function useScreeningsUI(defaultValues?: Partial<UIState>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const ui = parseUIStateFromSearchParams(searchParams, defaultValues);

  const setUI = useCallback<SetUI>(
    (patch) => {
      const next = typeof patch === 'function' ? patch(ui) : { ...ui, ...patch };
      const params = serializeUIStateToSearchParams(next);
      const qs = params.toString();
      // Deliberately does not preserve an existing `page` param: changing
      // any filter starts back at page 1, since whatever page of the old
      // result set the user was on may not correspond to anything in the
      // new one.
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [ui, pathname, router]
  );

  return { ui, setUI, isPending };
}
