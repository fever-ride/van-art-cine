/** `/films/[id]` — server-rendered. `getFilmDetail` uses `React.cache()` so metadata and body share one fetch per request; `Suspense` enables streaming if loading splits later. */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getFilmDetail } from '@/app/lib/films';
import type { Screening } from '@/app/lib/screenings';
import { ItemListStructuredData, safeJsonLd } from '@/app/lib/structuredData';
import FilmHero from '@/components/films/FilmHero';
import FilmMeta from '@/components/films/FilmMeta';
import FilmShowtimes from '@/components/films/FilmShowtimes';
import PosterCarousel from '@/components/whats-on/PosterCarousel';
import { INTRO_DISMISSED_COOKIE } from '@/app/lib/siteIntro';



/**
 * Generates per-film metadata for SEO and social sharing.
 *
 * Runs before any HTML is sent (Next.js requires metadata to populate <head>),
 * so it blocks the initial response. The `getFilmDetail` result is cached via
 * React.cache() and reused by FilmContent at no extra API cost.
 *
 * A genuinely missing film (backend 404) calls `notFound()` here, before any
 * HTML streams — this is the only point in the request where that still
 * changes the response's HTTP status, since the page body below renders
 * inside a Suspense boundary that commits its 200 status before its own
 * fetch can reject. Any other error (backend down, network failure) falls
 * back to a generic, explicitly noindexed title instead of hard-failing,
 * since that's not evidence the film doesn't exist.
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
        canonical: `https://www.cinephilesvan.com/films/${film.id}`,
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
  } catch (err) {
    if ((err as { status?: number })?.status === 404) {
      notFound();
    }
    return { title: 'Film', robots: { index: false, follow: false } };
  }
}

/**
 * Injects JSON-LD structured data for Google rich results.
 *
 * Movie schema: enables star-rating rich results in Google Search.
 * ScreeningEvent schemas: one per upcoming screening. Uses ScreeningEvent
 *   (schema.org's dedicated subtype for a showing of a work), not the generic
 *   Event, and nests a `workPresented` Movie so each showtime is explicitly
 *   linked back to the film it's screening -- matches how venues (e.g. Rio
 *   Theatre) mark up their own showtime pages, and gives crawlers a
 *   structural link instead of an implicit "same title string" match.
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
    ...(film.cast?.length && {
      actor: film.cast.map((name) => ({ '@type': 'Person', name })),
    }),
    ...(film.genre && { genre: film.genre }),
    ...(film.imdb_url && { sameAs: film.imdb_url }),
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

  // Lean identity block reused inside every ScreeningEvent below. Deliberately
  // NOT the full movieSchema (no aggregateRating/genre) -- this just needs to
  // say which film is being screened, not restate everything about it.
  const workPresented = {
    '@type': 'Movie',
    name: film.title,
    url: filmUrl,
    ...(film.description && { description: film.description }),
    ...(film.poster_url && { image: film.poster_url }),
    ...(film.directors?.length && {
      director: film.directors.map((name) => ({ '@type': 'Person', name })),
    }),
    ...(film.imdb_url && { sameAs: film.imdb_url }),
  };

  const screeningEventSchemas = upcoming.map((s) => ({
    '@context': 'https://schema.org',
    '@type': 'ScreeningEvent',
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
      ...(s.cinema_website && { url: s.cinema_website }),
    },
    ...(s.source_url && { url: s.source_url }),
    ...(film.poster_url && { image: film.poster_url }),
    ...(film.description && { description: film.description }),
    // Cast, not directors: `performer` means who appears in the work being
    // screened, which for a film screening is the actors, not the director.
    ...(film.cast?.length && {
      performer: film.cast.map((name) => ({ '@type': 'Person', name })),
    }),
    // We don't scrape real-time price/availability per showtime (venues like
    // Rio link to a separate ticketing site we don't capture yet -- see
    // BACKLOG.md), so `offers` only carries a URL to where a visitor can find
    // that out, not fabricated price/availability values.
    ...(s.source_url && {
      offers: {
        '@type': 'Offer',
        url: s.source_url,
      },
    }),
    workPresented,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(movieSchema) }}
      />
      {screeningEventSchemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
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
async function FilmContent({ id, showIntro }: { id: number; showIntro: boolean }) {
  const { film, upcoming, related } = await getFilmDetail(id);

  // Soonest upcoming screening, if any — same ordering FilmShowtimes uses,
  // just surfaced as a single callout in the hero above it.
  const nextScreening = [...upcoming].sort(
    (a, b) => new Date(a.start_at_utc).getTime() - new Date(b.start_at_utc).getTime()
  )[0];

  return (
    <>
      <StructuredData film={film} upcoming={upcoming} />
      <ItemListStructuredData films={related} />
      <FilmHero film={film} nextScreening={nextScreening} showIntro={showIntro} />
      {/* Showtimes first (the reason most visitors land here), About beside
          them on wide screens and sticky so it stays in view while a long
          showtime list scrolls; stacked below on phones. */}
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:py-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <FilmShowtimes upcoming={upcoming} filmTitle={film.title ?? 'This Film'} />
          <div className="lg:sticky lg:top-(--scroll-offset)">
            <FilmMeta film={film} />
          </div>
        </div>
        <RelatedFilms films={related} />
      </div>
    </>
  );
}

/** Other currently screening films sharing a director, genre, or cinema
 * with this one (see docs/specs/related-films.md). Omitted entirely when
 * there are no matches, rather than showing an empty heading. Styled as
 * the same bordered/banded card as FilmMeta and FilmShowtimes above it,
 * rather than a bare heading, so the page reads as one consistent set of
 * sections instead of two cards plus a floating grid. */
function RelatedFilms({ films }: { films: Screening[] }) {
  if (films.length === 0) return null;

  return (
    <section aria-labelledby="related-heading" className="mt-12">
      <h2 id="related-heading" className="mb-3 font-display text-xl font-bold uppercase text-primary md:text-2xl">
        You may also like
      </h2>
      <div className="border-t-2 border-rule pt-4">
        <PosterCarousel films={films} />
      </div>
    </section>
  );
}

/**
 * Pulse skeleton shown while FilmContent resolves.
 * Mirrors the approximate layout of FilmHero (poster + text) and the
 * two-column Meta / Showtimes grid below it.
 */
function FilmPageSkeleton() {
  return (
    <>
      {/* Hero skeleton: dark band with poster + title placeholders */}
      <div className="bg-hero-bg">
        <div className="mx-auto flex max-w-[1400px] gap-4 px-4 py-12 sm:gap-6 md:py-16">
          <div className="h-[150px] w-[100px] shrink-0 animate-pulse rounded-control bg-white/10 sm:h-[200px] sm:w-[133px]" />
          <div className="flex grow flex-col justify-end gap-3">
            <div className="h-9 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      </div>
      {/* Showtimes + About skeleton */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-4 py-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-surface-subtle" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-surface-subtle" />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Route entry point. Resolves the `id` param and delegates rendering to
 * `FilmContent` behind a Suspense boundary.
 *
 * Checks the film exists here, awaited, before returning any JSX — not just
 * in `generateMetadata`. `notFound()` only still changes the response's
 * HTTP status if it's reached before the page starts streaming; once
 * `FilmContent` resolves inside the `Suspense` boundary below, the 200
 * shell has already committed and a 404 there can't undo it. The fetch
 * itself is `React.cache()`-wrapped, so this doesn't cost a second request
 * — `FilmContent` reuses the same resolved promise.
 */
export default async function FilmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const film_id = Number(id);

  try {
    await getFilmDetail(film_id);
  } catch (err) {
    if ((err as { status?: number })?.status === 404) {
      notFound();
    }
    // Non-404 errors (backend down, network failure) fall through to
    // FilmContent's own fetch below, which surfaces them via error.tsx.
  }

  const showIntro = await shouldShowSiteIntro();

  return (
    <main>
      <Suspense fallback={<FilmPageSkeleton />}>
        <FilmContent id={film_id} showIntro={showIntro} />
      </Suspense>
    </main>
  );
}

/**
 * Show the one-line site intro to visitors arriving from outside this site
 * (search engines, social, shared links, typed URL) until they dismiss it.
 * Decided server-side from the Referer + dismiss cookie so the bar is part of
 * the first paint. This page is already rendered per request (film detail
 * fetch is `no-store`), so reading headers/cookies costs no caching.
 */
async function shouldShowSiteIntro(): Promise<boolean> {
  const cookieStore = await cookies();
  if (cookieStore.get(INTRO_DISMISSED_COOKIE)) return false;

  const h = await headers();
  const referer = h.get('referer');
  if (!referer) return true; // direct visit / shared link / referrer stripped
  try {
    return new URL(referer).host !== h.get('host');
  } catch {
    return true;
  }
}
