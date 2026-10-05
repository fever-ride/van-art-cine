// maybe move these to env
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';
const TMDB_IMAGE_SIZE = 'w342'; // medium size

export function buildPosterUrl(posterPath) {
  if (!posterPath) return null;
  return `${TMDB_IMAGE_BASE}${TMDB_IMAGE_SIZE}${posterPath}`;
}
