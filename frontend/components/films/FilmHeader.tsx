'use client';

import type { Film } from '@/app/lib/films';

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
  > & {
    poster_url?: string | null;
  };
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

  // Poster placeholder
  const poster =
    poster_url && poster_url.trim() !== ''
      ? poster_url
      : 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?q=80&w=600&auto=format&fit=crop';

  // Countries (accept a single string)
  const countriesText =
    typeof country === 'string' && country.trim() ? country : '';

  // Genres: support comma-separated string
  const genres =
    typeof genre === 'string' && genre.trim()
      ? genre.split(',').map((g) => g.trim()).filter(Boolean)
      : [];

  // Directors line (Film['directors'] likely string[])
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

  // Data chip (labels, not buttons)
  const chip = (node: React.ReactNode) => (
    <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-semibold text-gray-900 ring-1 ring-border">
      {node}
    </span>
  );

  return (
    <section className="rounded-3xl border border-border bg-surface">
      <div className="flex flex-col gap-6 p-4 md:flex-row md:items-start md:p-6">
        {/* Poster */}
        <div className="shrink-0">
          <img
            src={poster}
            alt={`${title} poster`}
            className="h-[180px] w-[130px] rounded-2xl object-cover md:h-[176px] md:w-[128px]"
          />
        </div>

        {/* Content */}
        <div className="min-w-0 grow">
          {/* Title */}
          <div className="text-3xl font-bold leading-tight text-primary md:text-3xl">
            {title}
          </div>

          {/* Meta row: Year • Country • Directors | Genres */}
          <div className="mt-2 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-muted">
            {/* Year / country / directors, joined with bullets */}
            {metaBits.length > 0 && (
              <span className="truncate">
                {metaBits.join(' • ')}
              </span>
            )}

            {/* Divider before genre pills */}
            {genres.length > 0 && metaBits.length > 0 && (
              <span
                className="mx-2 h-4 w-px bg-border"
                aria-hidden="true"
              />
            )}

            {/* Genres */}
            {genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ratings */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* IMDb rating */}
            {hasRating
              ? chip(
                  <>
                    IMDb · {ratingNum.toFixed(1)}
                    {typeof imdb_votes === 'number' ? (
                      <span className="pl-1 text-gray-500">
                        ({imdb_votes.toLocaleString()})
                      </span>
                    ) : null}
                  </>
                )
              : chip(
                  <>
                    IMDb · <span className="text-gray-400">—</span>
                  </>
                )}

            {/* Rotten Tomatoes % */}
            {typeof rt_rating_pct === 'number'
              ? chip(<>Rotten Tomatoes · {rt_rating_pct}%</>)
              : chip(
                  <>
                    Rotten Tomatoes · <span className="text-gray-400">—</span>
                  </>
                )}
          </div>

          {/* Links */}
          <div className="mt-4 flex flex-wrap gap-2">
            {imdb_url ? (
              <a
                href={imdb_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full bg-accent px-4 py-1.5 text-xs font-semibold border-border text-surface transition-colors hover:bg-[#5b7c93]"
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