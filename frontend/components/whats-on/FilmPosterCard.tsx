import Link from 'next/link';
import { parseImdbRating } from '@/app/lib/displayText';
import type { Screening } from '@/app/lib/screenings';

const FALLBACK_POSTER =
  'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?q=80&w=600&auto=format&fit=crop';

/** A film poster + title + rating, linking to its detail page. Shared by
 * the carousel and the full grid on the Top Rated hub page — same card,
 * just arranged differently by the parent. */
export default function FilmPosterCard({ screening }: { screening: Screening }) {
  const rating = parseImdbRating(screening.imdb_rating);
  const poster =
    screening.poster_url && screening.poster_url.trim() !== ''
      ? screening.poster_url
      : FALLBACK_POSTER;
  const isNew =
    typeof screening.year === 'number' &&
    screening.year >= new Date().getFullYear() - 1;

  return (
    <Link
      href={`/films/${screening.film_id}`}
      className="group block w-[140px] shrink-0 sm:w-[160px]"
    >
      <div className="relative overflow-hidden rounded-card border border-border bg-surface">
        <img
          src={poster}
          alt={`${screening.title} poster`}
          loading="lazy"
          className="aspect-[2/3] w-full object-cover transition-transform group-hover:scale-[1.03]"
        />
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {isNew && (
            <span className="rounded-full bg-highlight px-2 py-0.5 text-xs font-semibold text-primary">
              NEW
            </span>
          )}
          {rating != null && (
            <span className="rounded-full bg-black/75 px-2 py-0.5 text-xs font-semibold text-white">
              {rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-semibold text-primary group-hover:underline">
        {screening.title}
      </div>
    </Link>
  );
}
