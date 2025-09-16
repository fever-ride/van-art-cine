'use client';

import { useEffect, useMemo, useState } from 'react';
import { getScreenings, type Screening, type SortKey, type Order } from './lib/api';

export default function Home() {
  // --- UI state ---
  const [mode, setMode]       = useState<'single'|'range'>('single'); // NEW
  const [date, setDate]       = useState<string>('');
  const [from, setFrom]       = useState<string>('');                 // NEW
  const [to, setTo]           = useState<string>('');                 // NEW

  const [q, setQ]             = useState<string>('');
  const [cinemaId, setCinemaId] = useState<string>('');
  const [venueId, setVenueId]   = useState<string>('');
  const [filmId, setFilmId]     = useState<string>('');
  const [sort, setSort]       = useState<SortKey>('time');
  const [order, setOrder]     = useState<Order>('asc');
  const [limit]               = useState<number>(20);
  const [offset, setOffset]   = useState<number>(0);

  // --- data state ---
  const [items, setItems]     = useState<Screening[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr]         = useState<string>('');

  const numOrEmpty = (s: string) => (s.trim() === '' ? undefined : Number(s));

  async function load(nextOffset: number = 0) {
    setLoading(true); setErr('');

    // basic validation: range mode requires from<=to
    if (mode === 'range' && from && to && from > to) {
      setLoading(false);
      setErr('“From” date must be before or equal to “To” date.');
      return;
    }

    try {
      // Build params: send either `date` OR (`from`,`to`)
      const params: any = {
        q,
        cinema_id: numOrEmpty(cinemaId),
        venue_id:  numOrEmpty(venueId),
        film_id:   numOrEmpty(filmId),
        sort, order, limit,
        offset: nextOffset,
      };

      if (mode === 'single' && date) {
        params.date = date;
      } else {
        if (from) params.from = from;
        if (to)   params.to   = to;
      }

      const data = await getScreenings(params);
      setItems(data.items ?? []);
      setOffset(nextOffset);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(0); }, []);

  const hasMore = items.length === limit;

  const fmt = useMemo(() => new Intl.DateTimeFormat(undefined, {
    weekday:'short', month:'short', day:'numeric',
    hour:'2-digit', minute:'2-digit', hour12:true
  }), []);

  return (
    <main style={{maxWidth:1100, margin:'32px auto', padding:'0 16px'}}>
      <h1 style={{marginBottom:12}}>Now Playing</h1>

      <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:16}}>
        {/* Mode toggle */}
        <label>
          <input
            type="radio"
            name="mode"
            value="single"
            checked={mode==='single'}
            onChange={() => { setMode('single'); setFrom(''); setTo(''); }}
          /> Single day
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="range"
            checked={mode==='range'}
            onChange={() => { setMode('range'); setDate(''); }}
          /> Range
        </label>

        {/* Date inputs */}
        {mode === 'single' ? (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        ) : (
          <>
            <input
              type="date"
              placeholder="From"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              placeholder="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}

        <input
          placeholder="Search title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {/* Simple ID filters (optional) */}
        <input
          placeholder="Cinema ID"
          value={cinemaId}
          onChange={e => setCinemaId(e.target.value)}
          style={{ width: 100 }}
          inputMode="numeric"
        />
        <input
          placeholder="Venue ID"
          value={venueId}
          onChange={e => setVenueId(e.target.value)}
          style={{ width: 100 }}
          inputMode="numeric"
        />
        <input
          placeholder="Film ID"
          value={filmId}
          onChange={e => setFilmId(e.target.value)}
          style={{ width: 100 }}
          inputMode="numeric"
        />

        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
          <option value="time">Time</option>
          <option value="title">Title</option>
          <option value="imdb">IMDb</option>
          <option value="rt">RottenTomatoes</option>
          <option value="venue">Venue</option>
          <option value="votes">Votes</option>
          <option value="year">Year</option>
        </select>
        <select value={order} onChange={e => setOrder(e.target.value as Order)}>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
        <button onClick={() => void load(0)} disabled={loading}>Apply</button>
      </div>

      {loading && <p>Loading…</p>}
      {err && <p style={{color:'tomato'}}>Error: {err}</p>}
      {!loading && items.length === 0 && <p>No screenings found.</p>}

      {items.length > 0 && (
        <table width="100%" cellPadding={6} style={{borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid #e5e5e5'}}>
              <th align="left">When</th>
              <th align="left">Title</th>
              <th align="left">Venue</th>
              <th align="right">IMDb</th>
              <th align="right">RT%</th>
              <th align="right">Runtime</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} style={{borderBottom:'1px solid #f3f3f3'}}>
                <td>{fmt.format(new Date(s.start_at_utc))}</td>
                <td>
                  <strong>{s.title}</strong> {s.year ? `(${s.year})` : ''}
                  {s.directors && <div style={{color:'#666', fontSize:12}}>{s.directors}</div>}
                </td>
                <td>{s.venue_name}</td>
                <td align="right">{s.imdb_rating ?? '–'}</td>
                <td align="right">{s.rt_rating_pct ?? '–'}</td>
                <td align="right">{s.runtime_min ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{display:'flex', gap:8, marginTop:12}}>
        <button onClick={() => void load(Math.max(0, offset - limit))} disabled={offset === 0 || loading}>Prev</button>
        <button onClick={() => void load(offset + limit)} disabled={!hasMore || loading}>Next</button>
      </div>
    </main>
  );
}