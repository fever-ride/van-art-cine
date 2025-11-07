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
    poster_url?: string | null; // optional; will fallback to placeholder
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

  // Poster placeholder (until you wire real posters)
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

  // Normalize IMDb rating: string or number → number
  const ratingStr = imdb_rating?.toString().trim() ?? '';
  const ratingNum = Number(ratingStr);
  const hasRating = ratingStr !== '' && !isNaN(ratingNum);

  const chip = (node: React.ReactNode) => (
    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-900 ring-1 ring-gray-200">
      {node}
    </span>
  );

  return (
    <section className="rounded-3xl border border-gray-200 bg-white shadow-md">
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
          <div className="font-serif text-3xl font-semibold leading-tight text-gray-900 md:text-3xl">
            {title}
          </div>

          {/* Meta row: Year • Country • Director | Genres */}
          <div className="mt-2 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-gray-600">
            {/* Year */}
            {(typeof year === 'number' || (typeof year === 'string' && year)) && (
              <span>{year}</span>
            )}

            {/* Country */}
            {countriesText && (
              <>
                <span>•</span>
                <span className="truncate">{countriesText}</span>
              </>
            )}

            {/* Director(s) */}
            {dirLine && (
              <>
                <span>•</span>
                <span className="truncate">
                  Director{Array.isArray(directors) && directors.length > 1 ? 's' : ''}: {dirLine}
                </span>
              </>
            )}

            {/* Divider before genre pills */}
            {genres.length > 0 && (
              <span className="mx-2 h-4 w-px bg-gray-300" aria-hidden="true"></span>
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
            {/* TODO: IMDb rating type problem */}
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

            {/* RT% */}
            {typeof rt_rating_pct === 'number'
              ? chip(<>RT · {rt_rating_pct}%</>)
              : chip(
                  <>
                    RT · <span className="text-gray-400">—</span>
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
                className="inline-flex items-center rounded-[12px] border-[1.5px] border-[#D9D6CD] bg-white px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] transition-colors hover:bg-[#F4F8FB]"
              >
                IMDb
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}