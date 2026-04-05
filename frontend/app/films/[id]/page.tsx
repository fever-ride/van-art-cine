/** `/films/[id]` — server-rendered. `getFilmDetail` uses `React.cache()` so metadata and body share one fetch per request; `Suspense` enables streaming if loading splits later. */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getFilmDetail } from '@/app/lib/films';
import FilmHeader from '@/components/films/FilmHeader';
import FilmMeta from '@/components/films/FilmMeta';
import FilmShowtimes from '@/components/films/FilmShowtimes';

import { Noto_Sans } from 'next/font/google';

const noto = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
});

/**
 * Generates per-film metadata for SEO and social sharing.
 *
 * Runs before any HTML is sent (Next.js requires metadata to populate <head>),
 * so it blocks the initial response. The `getFilmDetail` result is cached via
 * React.cache() and reused by FilmContent at no extra API cost.
 *
 * Falls back to a generic title if the film cannot be fetched (e.g. invalid id
 * or API error), rather than throwing and triggering the error boundary.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const { film } = await getFilmDetail(Number(id));
    const title = `Upcoming screenings of ${film.title} in Vancouver`;

    // Lead with the Vancouver/screenings angle for SEO; append up to 100 chars
    // of the film's own description when available to enrich the snippet.
    const descriptionBase = `${film.title}${film.year ? ` (${film.year})` : ''} — upcoming screenings at Vancouver's independent cinemas.`;
    const description = film.description
      ? `${descriptionBase} ${film.description.slice(0, 100).trimEnd()}…`
      : descriptionBase;

    return {
      title,
      description,
      alternates: {
        canonical: `https://www.cinephilesvan.com/films/${id}`,
      },
      openGraph: {
        title,
        description,
        ...(film.poster_url ? { images: [{ url: film.poster_url }] } : {}),
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        ...(film.poster_url ? { images: [film.poster_url] } : {}),
      },
    };
  } catch {
    // Non-fatal: render the page without rich metadata rather than hard-failing.
    return { title: 'Film' };
  }
}

/**
 * Injects JSON-LD structured data for Google rich results.
 *
 * Movie schema: enables star-rating rich results in Google Search.
 * Event schemas: one per upcoming screening; enables Google Events rich results
 *   showing dates and venues directly in search.
 *
 * Google accepts JSON-LD anywhere in the document (head or body), so rendering
 * these inside <main> is valid.
 */
function StructuredData({
  film,
  upcoming,
}: {
  film: import('@/app/lib/films').Film;
  upcoming: import('@/app/lib/films').UpcomingScreening[];
}) {
  const filmUrl = `https://www.cinephilesvan.com/films/${film.id}`;
  const ratingNum = film.imdb_rating ? Number(film.imdb_rating) : null;

  const movieSchema = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: film.title,
    url: filmUrl,
    ...(film.year && { dateCreated: String(film.year) }),
    ...(film.description && { description: film.description }),
    ...(film.poster_url && { image: film.poster_url }),
    ...(film.directors?.length && {
      director: film.directors.map((name) => ({ '@type': 'Person', name })),
    }),
    ...(film.genre && { genre: film.genre }),
    ...(ratingNum && !isNaN(ratingNum) && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: ratingNum,
        bestRating: 10,
        worstRating: 0,
        ...(film.imdb_votes && { ratingCount: film.imdb_votes }),
      },
    }),
  };

  const eventSchemas = upcoming.map((s) => ({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: film.title,
    startDate: s.start_at_utc,
    ...(s.end_at_utc && { endDate: s.end_at_utc }),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: s.cinema_name,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Vancouver',
        addressRegion: 'BC',
        addressCountry: 'CA',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: s.cinema_name,
    },
    ...(s.source_url && { url: s.source_url }),
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(movieSchema) }}
      />
      {eventSchemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}

/**
 * Fetches film data and renders the page body.
 *
 * Extracted into its own async component so it can sit inside a <Suspense>
 * boundary. `getFilmDetail` returns from React.cache() on this call since
 * `generateMetadata` already populated it.
 */
async function FilmContent({ id }: { id: number }) {
  const { film, upcoming } = await getFilmDetail(id);

  return (
    <>
      <StructuredData film={film} upcoming={upcoming} />
      <FilmHeader film={film} />
      {/* Two-column layout: film metadata left, showtimes right */}
      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[0.4fr_0.6fr]">
        <div>
          <FilmMeta film={film} />
        </div>
        <div>
          <FilmShowtimes
            upcoming={upcoming}
            filmTitle={film.title ?? 'This Film'}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Pulse skeleton shown while FilmContent resolves.
 * Mirrors the approximate layout of FilmHeader (poster + text) and the
 * two-column Meta / Showtimes grid below it.
 */
function FilmPageSkeleton() {
  return (
    <>
      {/* Header skeleton: poster placeholder + text lines */}
      <div className="flex gap-6 p-4 md:p-6">
        <div className="h-[176px] w-[128px] shrink-0 animate-pulse rounded-card bg-surface-subtle" />
        <div className="flex grow flex-col gap-3 pt-1">
          <div className="h-8 w-2/3 animate-pulse rounded bg-surface-subtle" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface-subtle" />
          <div className="mt-2 flex gap-2">
            <div className="h-6 w-24 animate-pulse rounded-full bg-surface-subtle" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-surface-subtle" />
          </div>
        </div>
      </div>
      {/* Two-column skeleton: meta rows left, showtime cards right */}
      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[0.4fr_0.6fr]">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-surface-subtle" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-surface-subtle" />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Route entry point. Resolves the `id` param and delegates rendering to
 * `FilmContent` behind a Suspense boundary.
 */
export default async function FilmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className={`${noto.className} mx-auto max-w-7xl px-4 py-8`}>
      <Suspense fallback={<FilmPageSkeleton />}>
        <FilmContent id={Number(id)} />
      </Suspense>
    </main>
  );
}
