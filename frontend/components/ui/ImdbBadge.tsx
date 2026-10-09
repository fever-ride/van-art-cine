import { parseImdbRating } from '@/app/lib/displayText';

/**
 * IMDb's own badge treatment (yellow chip + rating number) — reused
 * wherever an IMDb rating shows up, so it always reads as "the same
 * IMDb badge," not a slightly different pill per component. `votes`
 * is optional: omit it for a compact context (e.g. a card grid),
 * pass it for a fuller one (e.g. a table's expanded detail row).
 *
 * Renders nothing for a missing/invalid rating, so callers can render
 * it unconditionally instead of repeating a `!= null` check.
 */
export default function ImdbBadge({
  rating,
  votes,
}: {
  rating?: string | number | null;
  votes?: number | null;
}) {
  const parsed = parseImdbRating(rating);
  if (parsed == null) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-[3px] bg-[#F5C518] px-1 py-0.5 text-[9px] font-extrabold leading-none text-black">
        IMDb
      </span>
      <span className="text-[11px] font-semibold text-primary">{parsed.toFixed(1)}</span>
      {votes != null && (
        <span className="text-[11px] text-muted">({votes.toLocaleString()})</span>
      )}
    </span>
  );
}
