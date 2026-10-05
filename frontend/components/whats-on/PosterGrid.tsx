import type { Screening } from '@/app/lib/screenings';
import FilmPosterCard from './FilmPosterCard';

/** A wrapping grid of poster cards ("this month's" full list on the Top
 * Rated hub page) — same card component as the carousel, just laid out to
 * fill the width instead of scrolling. */
export default function PosterGrid({ films }: { films: Screening[] }) {
  if (films.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4">
      {films.map((s) => (
        <FilmPosterCard key={s.film_id} screening={s} />
      ))}
    </div>
  );
}
