import { isMissingText } from '@/app/lib/typeGuards';

/** Trim and return empty string for placeholders like "N/A". */
export function cleanDisplayText(value?: string | null): string {
  if (isMissingText(value)) return '';
  return value!.trim();
}

/** Split a comma-separated field and drop empty / placeholder tokens. */
export function splitAndClean(value?: string | null): string[] {
  if (isMissingText(value)) return [];
  return value!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !isMissingText(s));
}

/** Directors (or similar people fields) as a display line, or empty string. */
export function formatPeopleLine(value?: string | string[] | null): string {
  const parts = Array.isArray(value)
    ? value.map((s) => s.trim()).filter((s) => s && !isMissingText(s))
    : splitAndClean(value ?? null);
  return parts.join(', ');
}

/** IMDb-style rating: rejects "N/A", NaN, and out-of-range values. */
export function parseImdbRating(value?: string | number | null): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (isMissingText(raw)) return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0 || n > 10) return null;
  return n;
}

/** Rotten Tomatoes %: only real 0–100 numbers. */
export function isValidRtRating(value?: number | null): boolean {
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0 && value <= 100;
}
