import type { Screening } from '@/app/lib/screenings';
import FilmPosterCard from './FilmPosterCard';

/**
 * A horizontally scrollable strip of poster cards ("this week's" highlight
 * on the Top Rated hub page). Deliberately not an auto-advancing slideshow:
 * those have real accessibility and usability downsides (content changes
 * before a reader can look at it, motion some readers don't want), and gain
 * nothing here — this list is short (this week's top rated titles), so a
 * plain scroll-snap strip the reader controls themselves is both simpler to
 * build and the safer UX default. CSS-only, no JS: still fully usable and
 * crawlable with JavaScript disabled.
 */
export default function PosterCarousel({ films }: { films: Screening[] }) {
  if (films.length === 0) return null;

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2 [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch]"
      style={{ scrollbarWidth: 'thin' }}
    >
      {films.map((s) => (
        <div key={s.film_id} className="[scroll-snap-align:start]">
          <FilmPosterCard screening={s} />
        </div>
      ))}
    </div>
  );
}
