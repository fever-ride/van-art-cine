import type { ScreeningsQuery, SortKey, Order } from '@/app/lib/api';

type UI = {
  mode: 'single' | 'range';
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

const numOrEmpty = (s: string) => (s.trim() === '' ? undefined : Number(s));

export function buildParams({ ui, tz, offset }: { ui: UI; tz: string; offset: number }): ScreeningsQuery {
  const params: ScreeningsQuery = {
    q: ui.q,
    cinema_id: numOrEmpty(ui.cinemaId),
    film_id: numOrEmpty(ui.filmId),
    sort: ui.sort,
    order: ui.order,
    limit: ui.limit,
    offset,
    // Currently backend ignores tz; 
    // kept for possible future multi-timezone support.
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