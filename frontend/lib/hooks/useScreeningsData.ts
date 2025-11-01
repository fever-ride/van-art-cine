'use client';

import { useState, useEffect, useCallback } from 'react';
import { getScreenings, type Screening, type ScreeningsQuery } from '@/app/lib/screenings';
import type { UIState } from '@/lib/hooks/useScreeningsUI';

const numOrEmpty = (s: string) => (s.trim() === '' ? undefined : Number(s));

function buildParams({ ui, tz, offset }: { ui: UIState; tz: string; offset: number }): ScreeningsQuery {
  const params: ScreeningsQuery = {
    q: ui.q,
    cinema_id: numOrEmpty(ui.cinemaId),
    film_id: numOrEmpty(ui.filmId),
    sort: ui.sort,
    order: ui.order,
    limit: ui.limit,
    offset,
    // Currently backend ignores tz; kept for possible future multi-timezone support.
    tz,
  };

  if (ui.mode === 'single' && ui.date) {
    params.date = ui.date;
  } else {
    if (ui.from) params.from = ui.from;
    if (ui.to) params.to = ui.to;
  }

  return params;
}

export function useScreeningsData(ui: any, offset: number = 0) {
  const [items, setItems] = useState<Screening[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number = 0) => {
      setLoading(true);
      setError(null);

      if (ui.mode === 'range' && ui.from && ui.to && ui.from > ui.to) {
        setLoading(false);
        setError('"From" date must be before or equal to "To" date.');
        return;
      }

        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver';
          const params = buildParams({ ui, tz, offset: nextOffset });
          const data = await getScreenings(params);
          setItems(data.items ?? []);
        } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [ui]
  );

  useEffect(() => {
    void load(offset);
  }, [load, offset]);

  const hasMore = items.length === ui.limit;

  return {
    items,
    loading,
    error,
    hasMore,
    reload: load
  };
}