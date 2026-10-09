'use client';

import type { Film, UpcomingScreening } from '@/app/lib/films';
import {
  cleanDisplayText,
  formatPeopleLine,
  isValidRtRating,
  parseImdbRating,
} from '@/app/lib/displayText';
import { formatGenre } from '@/app/lib/formatGenre';
import { RatedBadge } from '@/components/ui';

type Props = {
  film: Pick<
    Film,
    | 'title'
    | 'year'
    | 'country'
    | 'genre'
    | 'rated'
    | 'imdb_rating'
    | 'imdb_votes'
    | 'rt_rating_pct'
    | 'imdb_url'
    | 'directors'
    | 'poster_url'
  >;
  /** Soonest upcoming screening, if any — only its runtime is pulled into
   * the pill row here. Full details are listed by `FilmShowtimes` below. */
  nextScreening?: UpcomingScreening;
};

const pillClass =
  'inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white';

export default function FilmHeader({ film, nextScreening }: Props) {
  const {
    title,
    year,
    country,
    genre,
    rated,
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

  const countriesText = cleanDisplayText(country);
  const genres = formatGenre(genre);
  const dirLine = formatPeopleLine(directors);
  const imdbRating = parseImdbRating(imdb_rating);

  // All film facts shown as one consistent row of pill chips, instead of
  // splitting them between plain inline text and pill-only genres.
  const pills: string[] = [];
  if (year) pills.push(String(year));
  if (countriesText) pills.push(countriesText);
  if (nextScreening?.runtime_min) pills.push(`${nextScreening.runtime_min} min`);
  pills.push(...genres);
  if (dirLine) pills.push(`Dir. ${dirLine}`);

  return (
    <section className="relative overflow-hidden rounded-card bg-hero-bg text-white">
      {/* Subtle glow behind the poster, matching the depth of the reference
       * design — decorative only, no content. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_55%)]"
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-start md:p-8">
        {/* Poster */}
        <div className="shrink-0">
          <img
            src={poster}
            alt={`${title} poster`}
            className="h-[180px] w-[130px] rounded-card object-cover shadow-lg ring-1 ring-white/10 md:h-[176px] md:w-[128px]"
          />
        </div>

        {/* Content */}
        <div className="min-w-0 grow">
          {/* Title — the film detail page's one <h1> */}
          <h1 className="text-3xl font-bold leading-tight text-white md:text-4xl">
            {title}
          </h1>

          {/* All facts as one consistent row of pills, plus the rating card
           * (a distinct shape/style on purpose — see RatedBadge) */}
          {(pills.length > 0 || rated) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {pills.map((p, i) => (
                <span key={`${p}-${i}`} className={pillClass}>
                  {p}
                </span>
              ))}
              <RatedBadge rated={rated} />
            </div>
          )}

          {/* Ratings */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {imdbRating != null && (
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-gray-300">IMDb</span>
                <span className="text-2xl font-bold text-white">{imdbRating.toFixed(1)}</span>
                {typeof imdb_votes === 'number' && (
                  <span className="text-sm text-gray-300">
                    ({imdb_votes.toLocaleString()})
                  </span>
                )}
              </div>
            )}

            {isValidRtRating(rt_rating_pct) && (
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-gray-300">Rotten Tomatoes</span>
                <span className="text-2xl font-bold text-white">{rt_rating_pct}%</span>
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
                className="inline-flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <span className="rounded-[3px] bg-[#F5C518] px-1.5 py-0.5 text-[11px] font-extrabold leading-none text-black">
                  IMDb
                </span>
                View Profile
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}