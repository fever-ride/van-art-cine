const SKIP = new Set(['n/a', 'na', '']);

/**
 * Normalize genre(s) to a string array.
 * Accepts comma-separated string, string[], or null/undefined.
 * Filters out placeholder values like "N/A".
 */
export function formatGenre(genre: string | string[] | null | undefined): string[] {
  if (genre == null) return [];
  const raw = Array.isArray(genre)
    ? genre.map((g) => (typeof g === 'string' ? g.trim() : ''))
    : (typeof genre === 'string' ? genre.trim() : '').split(',').map((g) => g.trim());
  return raw.filter((g) => g.length > 0 && !SKIP.has(g.toLowerCase()));
}
