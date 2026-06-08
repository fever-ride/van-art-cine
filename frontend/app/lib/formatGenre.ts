import { isMissingText } from '@/app/lib/typeGuards';

/**
 * Genre string normalization.
 * Handles the inconsistent formats that come back from TMDB/OMDb
 * (comma-separated string, array, or null) and strips placeholder values.
 */
export function formatGenre(genre: string | string[] | null | undefined): string[] {
  if (genre == null) return [];
  const raw = Array.isArray(genre)
    ? genre.map((g) => (typeof g === 'string' ? g.trim() : ''))
    : (typeof genre === 'string' ? genre.trim() : '').split(',').map((g) => g.trim());
  return raw.filter((g) => g.length > 0 && !isMissingText(g));
}
