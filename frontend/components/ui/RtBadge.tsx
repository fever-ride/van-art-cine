import { isValidRtRating } from '@/app/lib/displayText';

/**
 * Rotten Tomatoes's own badge treatment (red chip + percentage) — see
 * `ImdbBadge`'s own note on why this is a shared component instead of a
 * per-caller copy. Renders nothing for a missing/invalid percentage.
 */
export default function RtBadge({ pct }: { pct?: number | null }) {
  if (!isValidRtRating(pct)) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-full bg-[#FA320A] px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-white">
        RT
      </span>
      <span className="text-[11px] font-semibold text-primary">{pct}%</span>
    </span>
  );
}
