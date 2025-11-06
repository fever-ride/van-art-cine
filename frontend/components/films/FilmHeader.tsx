'use client';

import type { Film } from '@/app/lib/films';

type Props = {
  film: Pick<
    Film,
    'title' | 'description' | 'imdb_rating' | 'rt_rating_pct' | 'imdb_votes' | 'imdb_url'
  > & {
    directors?: string[] | null;     // NEW: director names
    source_url?: string | null;      // NEW: cinema/official source link
    poster_url?: string | null;      // optional (will fallback to placeholder)
  };
};

export default function FilmHeader({ film }: Props) {
  const {
    title,
    description,
    imdb_rating,
    rt_rating_pct,
    imdb_votes,
    imdb_url,
    directors,
    source_url,
    poster_url,
  } = film;

  // Placeholder poster (Unsplash, freely usable for mockups)
  const poster = (poster_url && poster_url.trim() !== '')
    ? poster_url
    : 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?q=80&w=600&auto=format&fit=crop';

  const dirLine =
    Array.isArray(directors) && directors.length
      ? directors.join(', ')
      : '';

  // tiny helper (visual only)
  const renderValueChip = (content: React.ReactNode) => (
    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-900 ring-1 ring-gray-200">
      {content}
    </span>
  );

  const dash = <span className="text-gray-400">—</span>;

  // Normalize rating (string or number → number) and validate
  const ratingStr = imdb_rating?.toString().trim() ?? '';
  const ratingNum = Number(ratingStr);
  const hasRating = ratingStr !== '' && !isNaN(ratingNum);

  return (
    <>
      {/* Keep page-level H1 above hero for SEO & consistency */}
      <h1 className="mb-4 font-serif text-[28px] font-semibold tracking-tight text-gray-900">
        {title}
      </h1>

      {/* HERO: poster · title/meta · actions/links */}
      <section className="rounded-3xl border border-gray-200 bg-white shadow-md">
        <div className="flex flex-col gap-6 p-4 md:flex-row md:items-start md:p-6">
          {/* Poster */}
          <div className="shrink-0">
            <img
              src={poster}
              alt={`${title} poster`}
              className="h-[180px] w-[130px] rounded-2xl object-cover md:h-[220px] md:w-[160px]"
            />
          </div>

          {/* Title + meta + chips */}
          <div className="min-w-0 grow">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-serif text-3xl font-semibold leading-tight text-gray-900 md:text-4xl">
                  {title}
                </div>

                {/* Director line (new) */}
                {dirLine && (
                  <div className="mt-2 text-[15px] text-gray-600">
                    Director{directors && directors.length > 1 ? 's' : ''}: {dirLine}
                  </div>
                )}
              </div>
            </div>

            {/* Ratings row */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* IMDb rating */}
              {/* TODO: IMDb rating type problem */}
              {hasRating ? renderValueChip(<>IMDb · {ratingNum.toFixed(1)}{typeof imdb_votes === 'number' ? <span className="pl-1 text-gray-500">({imdb_votes.toLocaleString()})</span> : null}</>) : renderValueChip(<>IMDb · {dash}</>)}

              {/* RT% */}
              {typeof rt_rating_pct === 'number' ? renderValueChip(<>RT · {rt_rating_pct}%</>) : renderValueChip(<>RT · {dash}</>)}
            </div>

            {/* Description (kept) */}
            <p
              className={`mt-4 max-w-prose text-[15px] leading-7 ${
                description ? 'text-gray-800' : 'italic text-gray-400'
              }`}
            >
              {description || 'No description available'}
            </p>

            {/* Links (IMDb + Source) */}
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

              {source_url ? (
                <a
                  href={source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-[12px] border-[1.5px] border-[#D9D6CD] bg-white px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] transition-colors hover:bg-[#F4F8FB]"
                >
                  Official / Source
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}