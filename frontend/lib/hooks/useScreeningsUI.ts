'use client';

import { useState, useCallback } from 'react';
import type { SortKey, Order } from '@/app/lib/screenings';

// UI types for the screenings page. We import SortKey/Order from the
// canonical `app/lib/screenings.ts` so the UI state aligns with the API types.
export type Mode = 'single' | 'range';

export type UIState = {
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

export type SetUI = (patch: Partial<UIState> | ((s: UIState) => UIState)) => void;

const defaultUI: UIState = {
  mode: 'single',
  date: '',
  from: '',
  to: '',
  q: '',
  cinemaId: '',
  filmId: '',
  sort: 'date',
  order: 'asc',
  limit: 20,
};

export function useScreeningsUI(defaultValues?: Partial<UIState>) {
  const [ui, setUiState] = useState<UIState>({ ...defaultUI, ...defaultValues });

  const setUI = useCallback(
    (patch: Partial<UIState> | ((s: UIState) => UIState)) =>
      setUiState((s) => (typeof patch === 'function' ? patch(s) : { ...s, ...patch })),
    []
  );

  return { ui, setUI };
}