import { isDisplayableRating } from '@/app/lib/displayText';

/**
 * A film's content rating (PG-13, R, ...), styled after the classic
 * black-bordered rating card from movie trailers/posters — a shape and
 * weight nobody has to learn, unlike IMDb/RT's own badges (which borrow
 * those services' actual brand colors instead, since a rating card has no
 * equivalent "brand" of its own). Solid white fill + black border reads
 * clearly on both this project's light card surfaces and FilmHeader's dark
 * hero background, so this needs no light/dark variant.
 *
 * Renders nothing for a missing or non-informative value (OMDb's "N/A",
 * "Not Rated", "Approved", etc. — see `isDisplayableRating`), so callers
 * can render it unconditionally instead of repeating that check.
 */
export default function RatedBadge({ rated }: { rated?: string | null }) {
  if (!isDisplayableRating(rated)) return null;

  return (
    <span className="inline-flex items-center justify-center rounded-[2px] border-2 border-black bg-white px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-black">
      {rated!.trim()}
    </span>
  );
}
