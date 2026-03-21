'use client';

import { useState, useCallback } from 'react';
import type { SortKey, Order } from '@/app/lib/screenings';

/**
 * Screenings UI State Management
 *
 * Custom hook for managing filter, sort, and display state for the screenings page.
 *
 * Responsibilities:
 * - Owns all UI-related fields:
 *   - `mode`: 'single' vs 'range' date mode
 *   - `date` / `from` / `to`: single date or date range
 *   - `q`: search query
 *   - `cinemaIds`: selected cinema IDs
 *   - `filmId`: specific film filter
 *   - `sort`: sort key (time, title, imdb, rt, votes, year)
 *   - `order`: sort direction
 *   - `limit`: page size
 * - Exposes a single `setUI` helper that accepts either:
 *   - a partial patch object
 *   - a functional updater `(prev: UIState) => UIState`
 *
 * This hook is intentionally UI-only: it does not perform any data fetching
 * and is composed with `useScreeningsData` to actually load screenings.
 */

// ============================================================================
// Types
// ============================================================================

/** Display mode for date selection */
export type Mode = 'single' | 'range';

/** UI state for screenings filters and display options */
export type UIState = {
  mode: Mode;              // Date selection mode
  date: string;            // Single date (YYYY-MM-DD)
  from: string;            // Range start date
  to: string;              // Range end date
  q: string;               // Search query
  cinemaIds: string[];     // Selected cinema IDs
  filmId: string;          // Specific film filter
  sort: SortKey;           // Sort field
  order: Order;            // Sort direction
  limit: number;           // Results per page
};

/** 
 * State updater function
 * Accepts either a partial state object or an updater function
 */
export type SetUI = (patch: Partial<UIState> | ((s: UIState) => UIState)) => void;

// ============================================================================
// Default State
// ============================================================================

const defaultUI: UIState = {
  mode: 'single',
  date: '',
  from: '',
  to: '',
  q: '',
  cinemaIds: [],
  filmId: '',
  sort: 'time',
  order: 'asc',
  limit: 20,
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing screenings page UI state
 * 
 * @param defaultValues - Optional initial state overrides
 * @returns Object with current state and setter function
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
  const [ui, setUiState] = useState<UIState>({ ...defaultUI, ...defaultValues });

  // Memoized setter supports both object and function updates
  const setUI = useCallback(
    (patch: Partial<UIState> | ((s: UIState) => UIState)) =>
      setUiState((s) => (typeof patch === 'function' ? patch(s) : { ...s, ...patch })),
    []
  );

  return { ui, setUI };
}