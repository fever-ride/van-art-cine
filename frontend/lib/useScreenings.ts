'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getScreenings, type Screening, type ScreeningsQuery, type SortKey, type Order } from '@/app/lib/api';
import { buildParams } from './buildParams';

type Mode = 'single' | 'range';

type UIState = {
  mode: Mode;
  date: string;
  from: string;
  to: string;
  q: string;
  cinemaId: string;
  venueId: string;
  filmId: string;
  sort: SortKey;
  order: Order;
  limit: number;
};

const defaultUI: UIState = {
  mode: 'single',
  date: '',
  from: '',
  to: '',
  q: '',
  cinemaId: '',
  venueId: '',
  filmId: '',
  sort: 'date',
  order: 'asc',
  limit: 20,
};

export function useScreenings() {
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver',
    []
  );

  // UI state
  const [ui, _setUI] = useState<UIState>(defaultUI);
  const setUI = useCallback(
    (patch: Partial<UIState> | ((s: UIState) => UIState)) =>
      _setUI((s) => (typeof patch === 'function' ? patch(s) : { ...s, ...patch })),
    []
  );

  // Data state
  const [items, setItems] = useState<Screening[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [offset, setOffset] = useState(0);

  const load = useCallback(
    async (nextOffset = 0) => {
      setLoading(true);
      setErr('');

      if (ui.mode === 'range' && ui.from && ui.to && ui.from > ui.to) {
        setLoading(false);
        setErr('“From” date must be before or equal to “To” date.');
        return;
      }

      try {
        const params: ScreeningsQuery = buildParams({ ui, tz, offset: nextOffset });
        const data = await getScreenings(params);
        setItems(data.items ?? []);
        setOffset(nextOffset);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [ui, tz]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const hasMore = items.length === ui.limit;

  const prevPage = useCallback(() => void load(Math.max(0, offset - ui.limit)), [load, offset, ui.limit]);
  const nextPage = useCallback(() => void load(offset + ui.limit), [load, offset, ui.limit]);

  const applyFilters = useCallback(() => void load(0), [load]);

  return {
    ui,  // UI state
    setUI,  // UI state modifier
    data: { items, loading, err, limit: ui.limit, offset, hasMore },  // Data-related state
    actions: { load, prevPage, nextPage, applyFilters },  // User action functions
  };
}