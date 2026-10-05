/**
 * Shared schema.org JSON-LD builders for pages that list films (the
 * homepage's "Now Playing" list, the "Top Rated" hub page, and any future
 * one). Kept separate from any single page so the same `Movie` shape isn't
 * redefined per caller. See `frontend/app/films/[id]/page.tsx` for the
 * fuller per-film Movie + ScreeningEvent schema this is a lighter version
 * of — a list entry doesn't need everything a film's own page does.
 */
import type { Screening } from './screenings';

const SITE_URL = 'https://www.cinephilesvan.com';

/** A lightweight `Movie` entity for one film, from whatever `Screening` row
 * happens to represent it (any of a film's showtimes carries the same film
 * fields). Not a bare name/url pair — includes director, genre, and rating
 * when present, so a list entry says what film it actually is. */
export function buildMovieEntity(s: Screening) {
  const ratingNum = s.imdb_rating ? Number(s.imdb_rating) : null;
  const directors = s.directors
    ? s.directors.split(',').map((name) => name.trim()).filter(Boolean)
    : [];

  return {
    '@type': 'Movie',
    name: s.title,
    url: `${SITE_URL}/films/${s.film_id}`,
    ...(s.poster_url && { image: s.poster_url }),
    ...(s.year && { dateCreated: String(s.year) }),
    ...(s.description && { description: s.description }),
    ...(directors.length && {
      director: directors.map((name) => ({ '@type': 'Person', name })),
    }),
    ...(s.genre && { genre: s.genre }),
    ...(s.imdb_url && { sameAs: s.imdb_url }),
    ...(ratingNum &&
      !isNaN(ratingNum) && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: ratingNum,
          bestRating: 10,
          worstRating: 0,
          ...(s.imdb_votes && { ratingCount: s.imdb_votes }),
        },
      }),
  };
}

/** `ItemList` wrapping one `buildMovieEntity` per film, in the given order —
 * callers decide ordering/dedup (e.g. by film_id, by rating) before this. */
export function buildItemListSchema(films: Screening[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: films.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: buildMovieEntity(s),
    })),
  };
}

/** Renders a `buildItemListSchema` result as a `<script type="application/ld+json">`
 * tag, or nothing for an empty list (an empty ItemList is not useful structured data). */
export function ItemListStructuredData({ films }: { films: Screening[] }) {
  if (films.length === 0) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(buildItemListSchema(films)) }}
    />
  );
}
