'use client';

import { Archivo, Hanken_Grotesk } from 'next/font/google';
import Link from 'next/link';
import type { FilmListItem } from '@/app/lib/screenings';
import { formatScreeningDate, formatScreeningTime } from '@/app/lib/formatDate';
import { formatGenre } from '@/app/lib/formatGenre';
import { parseImdbRating, isValidRtRating } from '@/app/lib/displayText';

const archivo = Archivo({ subsets: ['latin'], weight: ['500', '700'], display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

const FALLBACK_POSTER =
  'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?q=80&w=600&auto=format&fit=crop';

const NEW_THRESHOLD_YEARS = 1;
const MAX_VISIBLE_SHOWTIMES = 3;

/** Film-first alternative to the screenings table: a compact 2-up card
 * grid, one card per film. Started as a close, row-per-film reproduction
 * of a festival site's own reference markup (full-width title, a big
 * dedicated "Showtimes" panel, large type) — that read as too sparse at
 * this catalog's actual showtime volume (most films here have 1-3
 * showtimes total, not the reference's multi-week festival schedules), so
 * this traded density for faithfulness: two cards per row, tighter type,
 * and showtimes collapsed to a few inline chips with a link to the film
 * page instead of a full dedicated panel. Keeps the reference's type
 * choices that still read well compact (uppercase Archivo titles, two
 * distinct pill shapes) over the fields this project actually has — no
 * fake program/format/accessibility tags, no sold-out-state styling (we
 * don't track ticket availability; see BACKLOG.md SEO-1), no landscape
 * backdrop image (we only have a portrait poster_path; tracked
 * separately, unrelated to SEO). */
export default function FilmListView({ films }: { films: FilmListItem[] }) {
  if (films.length === 0) {
    return <p className="px-1 py-8 text-sm text-muted">No films found.</p>;
  }

  return (
    <div className={`${hanken.className} grid grid-cols-1 gap-6 sm:grid-cols-2`}>
      {films.map((film) => {
        const genres = formatGenre(film.genre);
        const imdbRating = parseImdbRating(film.imdb_rating);
        const isNew =
          typeof film.year === 'number' &&
          film.year >= new Date().getFullYear() - NEW_THRESHOLD_YEARS;

        const metaBits = [
          film.year ? String(film.year) : null,
          film.country || null,
          film.runtime_min ? `${film.runtime_min} min` : null,
          film.language || null,
        ].filter(Boolean);

        const hasRatings = imdbRating != null || isValidRtRating(film.rt_rating_pct);

        const visibleShowtimes = film.showtimes.slice(0, MAX_VISIBLE_SHOWTIMES);
        const hiddenCount = film.showtimes.length - visibleShowtimes.length;

        return (
          <div
            key={film.film_id}
            className="flex gap-4 rounded-card border border-border bg-surface p-4"
          >
            <Link href={`/films/${film.film_id}`} className="shrink-0">
              <img
                src={film.poster_url?.trim() ? film.poster_url : FALLBACK_POSTER}
                alt={`${film.title} poster`}
                className="h-[155px] w-[110px] rounded-md object-cover"
              />
            </Link>

            <div className="min-w-0 flex-1">
              <Link href={`/films/${film.film_id}`} className="hover:underline">
                <h3 className={`${archivo.className} text-[20px] font-bold uppercase leading-[1.1] tracking-tight text-primary`}>
                  {film.title}
                </h3>
              </Link>
              {film.directors && (
                <p className="mt-0.5 text-xs text-muted">{film.directors}</p>
              )}

              <div className="mt-2 flex flex-wrap gap-1">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-[3px] border border-primary px-1.5 py-1 text-[10px] font-medium uppercase leading-none text-primary"
                  >
                    {g}
                  </span>
                ))}
                {isNew && (
                  <span className="rounded-[3px] border border-amber-700 px-1.5 py-1 text-[10px] font-medium uppercase leading-none text-amber-700">
                    New
                  </span>
                )}
              </div>

              {hasRatings && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  {imdbRating != null && (
                    <span className="flex items-center gap-1">
                      <span className="rounded-[3px] bg-[#F5C518] px-1 py-0.5 text-[9px] font-extrabold leading-none text-black">
                        IMDb
                      </span>
                      <span className="text-[11px] font-semibold text-primary">{imdbRating.toFixed(1)}</span>
                    </span>
                  )}
                  {isValidRtRating(film.rt_rating_pct) && (
                    <span className="flex items-center gap-1">
                      <span className="rounded-full bg-[#FA320A] px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-white">
                        RT
                      </span>
                      <span className="text-[11px] font-semibold text-primary">{film.rt_rating_pct}%</span>
                    </span>
                  )}
                </div>
              )}

              {metaBits.length > 0 && (
                <p className="mt-1.5 text-[11px] text-muted">{metaBits.join(' | ')}</p>
              )}

              <div className="mt-2 flex flex-wrap gap-1">
                {visibleShowtimes.map((s) => {
                  const label = `${formatScreeningDate(new Date(s.start_at_utc))}, ${formatScreeningTime(new Date(s.start_at_utc))}`;
                  const pillClass =
                    'rounded-full border border-accent px-2 py-1 text-[11px] font-medium text-primary';
                  return s.source_url ? (
                    <a
                      key={s.screening_id}
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${pillClass} hover:bg-accent hover:text-white`}
                    >
                      {label}
                    </a>
                  ) : (
                    <span key={s.screening_id} className={pillClass}>
                      {label}
                    </span>
                  );
                })}
              </div>
              {hiddenCount > 0 && (
                <Link
                  href={`/films/${film.film_id}`}
                  className="mt-1 inline-block text-[11px] font-semibold text-accent underline"
                >
                  +{hiddenCount} more showtime{hiddenCount > 1 ? 's' : ''} &raquo;
                </Link>
              )}

              {film.description && (
                <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-primary">
                  {film.description}
                </p>
              )}

              <Link
                href={`/films/${film.film_id}`}
                className={`${archivo.className} mt-2 inline-block border-b border-primary text-[12px] font-bold uppercase text-primary`}
              >
                Read more &raquo;
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
