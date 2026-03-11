/**
 * Normalize genre(s) to a string array.
 * Accepts comma-separated string, string[], or null/undefined.
 */
export function formatGenre(genre: string | string[] | null | undefined): string[] {
  if (genre == null) return [];
  if (Array.isArray(genre)) {
    return genre
      .map((g) => (typeof g === 'string' ? g.trim() : ''))
      .filter(Boolean);
  }
  const s = typeof genre === 'string' ? genre.trim() : '';
  if (!s) return [];
  return s.split(',').map((g) => g.trim()).filter(Boolean);
}
