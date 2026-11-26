import Link from 'next/link';
import { parseImdbRating } from '@/lib/displayText';

const FALLBACK_POSTER =
  'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?q=80&w=600&auto=format&fit=crop';

/** The fields this card actually needs — satisfied structurally by both
 * `Screening` (a row-per-showtime shape, Table view / Top Rated) and
 * `FilmListItem` (a row-per-film shape, Film view / retrospective pages),
 * so the same card works for either without converting one into the other.
 * Mirrors `MovieEntitySource` in `lib/structuredData.tsx` for the same reason. */
export interface PosterCardFilm {
  film_id: number;
  title: string;
  year?: number | null;
  imdb_rating?: number | string | null;
  poster_url?: string | null;
}

/** A film poster + title + rating, linking to its detail page. Shared by
 * the carousel and the full grid on the Top Rated hub page — same card,
 * just arranged differently by the parent. `showYear` is opt-in: useful on
 * a retrospective spanning decades (so a reader can place each poster in
 * time at a glance), but noise on Top Rated, where every film is current. */
export default function FilmPosterCard({
  screening,
  showYear = false,
}: {
  screening: PosterCardFilm;
  showYear?: boolean;
}) {
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
          className="aspect-[2/3] w-full object-cover transition-transform motion-safe:group-hover:scale-[1.03]"
        />
        {showYear && screening.year != null && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-primary">
            {screening.year}
          </span>
        )}
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
