'use client';

import type { ReactNode } from 'react';
import type { Film } from '@/app/lib/films';
import { formatGenre } from '@/app/lib/formatGenre';

type Props = {
  film: Pick<
    Film,
    | 'title'
    | 'year'
    | 'country'
    | 'genre'
    | 'imdb_rating'
    | 'imdb_votes'
    | 'rt_rating_pct'
    | 'imdb_url'
    | 'directors'
    | 'poster_url'
  >;
};

export default function FilmHeader({ film }: Props) {
  const {
    title,
    year,
    country,
    genre,
    imdb_rating,
    imdb_votes,
    rt_rating_pct,
    imdb_url,
    directors,
    poster_url,
  } = film;

  // Poster
  const poster =
    poster_url && poster_url.trim() !== ''
      ? poster_url
      : 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?q=80&w=600&auto=format&fit=crop';

  // Countries (accept a single string)
  const countriesText =
    typeof country === 'string' && country.trim() ? country : '';

  const genres = formatGenre(genre);

  // Directors line
  const dirLine =
    Array.isArray(directors) && directors.length
      ? directors.join(', ')
      : '';

  // Build header meta bits without stray bullets
  const metaBits: string[] = [];
  if (year) metaBits.push(String(year));
  if (countriesText) metaBits.push(countriesText);
  if (dirLine) {
    metaBits.push(
      `Director${Array.isArray(directors) && directors.length > 1 ? 's' : ''}: ${dirLine}`,
    );
  }

  // Normalize IMDb rating: string or number → number
  const ratingStr = imdb_rating?.toString().trim() ?? '';
  const ratingNum = Number(ratingStr);
  const hasRating = ratingStr !== '' && !isNaN(ratingNum);

  // Data chip
  const chip = (node: ReactNode) => (
    <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary ring-1 ring-border">
      {node}
    </span>
  );

  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:p-8">
        {/* Poster */}
        <div className="shrink-0">
          <img
            src={poster}
            alt={`${title} poster`}
            className="h-[180px] w-[130px] rounded-card object-cover md:h-[176px] md:w-[128px]"
          />
        </div>

        {/* Content */}
        <div className="min-w-0 grow">
          {/* Title */}
          <div className="text-3xl font-bold leading-tight text-primary md:text-3xl">
            {title}
          </div>

          {/* Meta row: Year • Country • Directors | Genres */}
          <div className="mt-2 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            {metaBits.length > 0 && (
              <span className="whitespace-normal break-words">
                {metaBits.join(' • ')}
              </span>
            )}

            {genres.length > 0 && metaBits.length > 0 && (
              <span
                className="mx-2 h-4 w-px bg-border"
                aria-hidden="true"
              />
            )}

            {genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center rounded-full bg-pill px-2.5 py-1 text-[12px] font-semibold text-primary"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ratings */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {hasRating && (
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-muted">IMDb</span>
                <span className="text-2xl font-bold text-primary">{ratingNum.toFixed(1)}</span>
                {typeof imdb_votes === 'number' && (
                  <span className="text-sm text-muted">
                    ({imdb_votes.toLocaleString()})
                  </span>
                )}
              </div>
            )}

            {typeof rt_rating_pct === 'number' && (
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-muted">Rotten Tomatoes</span>
                <span className="text-2xl font-bold text-primary">{rt_rating_pct}%</span>
              </div>
            )}
          </div>

          {/* Links */}
          <div className="mt-4 flex flex-wrap gap-2">
            {imdb_url ? (
              <a
                href={imdb_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-btn bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                View film on IMDb
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}