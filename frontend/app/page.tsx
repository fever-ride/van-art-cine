/** `/` — server-rendered. Fetches the current, filtered screening list on
 * the server so the default and any filtered view are both present in the
 * first HTML response, not only after client side JavaScript runs. See
 * docs/specs/url-driven-filters.md and docs/specs/homepage-ssr.md. */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Noto_Sans } from 'next/font/google';
import { getScreeningsServerSide, buildSearchParams, type Screening } from '@/app/lib/screenings';
import { getCinemasServerSide } from '@/app/lib/cinemas';
import { ItemListStructuredData } from '@/app/lib/structuredData';
import {
  parseUIStateFromSearchParams,
  serializeUIStateToSearchParams,
  buildScreeningsQuery,
  isInvalidDateRange,
  type UIState,
} from '@/lib/hooks/screeningsUrlState';
import ScreeningsPageClient from '@/components/screenings/ScreeningsPageClient';

const SITE_URL = 'https://www.cinephilesvan.com';

const noto = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
});

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Next.js gives searchParams as { key: string | string[] | undefined }.
 * Our parsing helpers only need a URLSearchParams-like `.get`, so adapt
 * one shape to the other instead of requiring two implementations of
 * parseUIStateFromSearchParams. Takes the first value for a repeated key. */
function toReadableSearchParams(searchParams: RawSearchParams) {
  return {
    get(key: string): string | null {
      const value = searchParams[key];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    },
  };
}

function pageNumberFrom(searchParams: RawSearchParams): number {
  const raw = toReadableSearchParams(searchParams).get('page');
  const page = Number(raw);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** Canonical URL for the given filter/page combination: `serializeUIStateToSearchParams`
 * already omits any field still at its default, so the plain default view (no
 * filters, page 1) canonicalizes to just `SITE_URL`, and equivalent URLs (e.g.
 * an explicit `?sort=time&order=asc`, which are the defaults) collapse to the
 * same canonical as `/`. `page` is added back in separately since that helper
 * deliberately excludes it (see its own docstring). */
function buildCanonicalUrl(ui: UIState, page: number): string {
  const params = serializeUIStateToSearchParams(ui);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `${SITE_URL}${qs ? `/?${qs}` : '/'}`;
}

/** Short natural language fragment describing the active filter, for
 * building a dynamic title/description, e.g. "at Rio Theatre" or
 * `matching "kurosawa"`. `null` when no filter narrows the default view, so
 * the caller can fall through to the root layout's static metadata instead
 * of restating it. Checked in this order because a single named cinema
 * makes the most specific, landing-page-like title; a date range is the
 * least useful to distinguish since it's only ever meaningful "for now". */
async function describeActiveFilter(ui: UIState): Promise<string | null> {
  if (ui.cinemaIds.length === 1) {
    const cinemas = await getCinemasServerSide();
    const cinema = cinemas.find((c) => String(c.id) === ui.cinemaIds[0]);
    if (cinema) return `at ${cinema.name}`;
  }

  if (ui.q) return `matching "${ui.q}"`;

  if (ui.mode === 'single' && ui.date) return `on ${ui.date}`;
  if (ui.mode === 'range' && (ui.from || ui.to)) {
    if (ui.from && ui.to) return `from ${ui.from} to ${ui.to}`;
    return `starting ${ui.from || ui.to}`;
  }

  return null;
}

/**
 * A search term or a date/date-range is not a stable, real-world thing
 * people search for (unlike a named cinema) — `q` can be arbitrary typed
 * text, and a specific day's listing goes stale within 24 hours and would
 * otherwise let a crawler index effectively unlimited near-duplicate URLs.
 * Matches Google's own guidance for internal search-results-style pages:
 * `noindex` the page itself, but still `follow` its links to the real film
 * pages, which are worth indexing. A named-cinema filter is exempt: that is
 * exactly the kind of stable, searched-for page worth letting rank.
 */
function shouldNoindex(ui: UIState): boolean {
  if (ui.q) return true;
  if (ui.mode === 'single' && ui.date) return true;
  if (ui.mode === 'range' && (ui.from || ui.to)) return true;
  return false;
}

/**
 * Homepage metadata: falls through to the root layout's static
 * title/description for the plain default view (page 1, no filters), and
 * builds a dynamic title/description naming the active filter otherwise, so
 * a bookmarked or shared filtered URL doesn't show the exact same title as
 * every other one. The canonical link is handled separately — see
 * `CanonicalLink` below.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const ui = parseUIStateFromSearchParams(toReadableSearchParams(resolvedSearchParams));
  const page = pageNumberFrom(resolvedSearchParams);

  // No `alternates.canonical` here — Next.js's metadata API strips the
  // query string from a resolved canonical URL, which would collapse every
  // filtered/paginated URL down to the bare homepage. `CanonicalLink` below
  // renders the real one directly instead.

  if (isInvalidDateRange(ui)) {
    return { title: 'Invalid date range', robots: { index: false, follow: false } };
  }

  const filterDescriptor = await describeActiveFilter(ui);
  const pageSuffix = page > 1 ? ` — page ${page}` : '';

  if (!filterDescriptor && !pageSuffix) {
    // Plain default view: the root layout's static title/description
    // already describe this page well: nothing to add.
    return {};
  }

  const title = filterDescriptor
    ? `Screenings ${filterDescriptor} in Vancouver${pageSuffix}`
    : `Now Playing${pageSuffix}`;
  const description = filterDescriptor
    ? `Screenings ${filterDescriptor} at Vancouver's independent cinemas.`
    : `More upcoming screenings at Vancouver's independent cinemas${pageSuffix}.`;

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: 'summary_large_image', title, description },
    ...(shouldNoindex(ui) ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Renders the real, query-string-aware canonical `<link>` directly instead
 * of going through `generateMetadata`'s `alternates.canonical` (see the note
 * there). Next.js hoists a `<link>` rendered anywhere in a Server Component
 * tree into `<head>` and dedupes it, the same as one set via the Metadata
 * API — this is a supported pattern, not a hack.
 */
function CanonicalLink({ ui, page }: { ui: UIState; page: number }) {
  return <link rel="canonical" href={buildCanonicalUrl(ui, page)} />;
}

async function ScreeningsPageContent({
  searchParams,
}: {
  searchParams: RawSearchParams;
}) {
  const ui = parseUIStateFromSearchParams(toReadableSearchParams(searchParams));
  const page = pageNumberFrom(searchParams);

  if (isInvalidDateRange(ui)) {
    return (
      <ScreeningsPageClient
        initialItems={[]}
        initialTotal={0}
        initialError='"From" date must be before or equal to "To" date.'
      />
    );
  }

  const offset = (page - 1) * ui.limit;
  const query = buildScreeningsQuery(ui, offset);
  const data = await getScreeningsServerSide(buildSearchParams(query).toString());

  return (
    <>
      {/* Skip structured data on a page generateMetadata already marked
       * noindex (see shouldNoindex) — Google won't process a noindexed
       * page's structured data, so emitting it here is dead weight. */}
      {!shouldNoindex(ui) && <NowPlayingStructuredData items={data.items} />}
      <ScreeningsPageClient
        initialItems={data.items}
        initialTotal={data.total}
        initialError={null}
      />
    </>
  );
}

/**
 * `ItemList` structured data for the current page's screening list, reusing
 * `data.items` from the fetch `ScreeningsPageContent` already made — no
 * separate fetch. Deduped by film: the page shows one row per showtime, but
 * the same film screening twice this page would otherwise produce two
 * entries pointing at the identical `/films/[id]` URL, which is exactly
 * the kind of list-of-films this schema is meant to describe. Schema
 * building itself lives in `frontend/app/lib/structuredData.tsx`, shared
 * with `frontend/app/whats-on/top-rated/page.tsx`.
 */
function NowPlayingStructuredData({ items }: { items: Screening[] }) {
  const seenFilmIds = new Set<number>();
  const uniqueFilms = items.filter((s) => {
    if (seenFilmIds.has(s.film_id)) return false;
    seenFilmIds.add(s.film_id);
    return true;
  });

  return <ItemListStructuredData films={uniqueFilms} />;
}

function ScreeningsPageSkeleton() {
  return <p className="text-sm text-muted">Loading…</p>;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const ui = parseUIStateFromSearchParams(toReadableSearchParams(resolvedSearchParams));
  const page = pageNumberFrom(resolvedSearchParams);

  return (
    <main className={`${noto.className}`}>
      <CanonicalLink ui={ui} page={page} />
      <section className="bg-hero-bg text-white mb-12">
        <div className="mx-auto max-w-[1400px] px-4 py-16 md:py-20">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl lg:text-6xl mb-4">
            Vancouver&apos;s indie
            <br />
            screenings,
            <br />
            all in one place.
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl">
            Discover independent films, art-house cinema, and festival screenings across the city&apos;s best theaters.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] px-4">
        <h2 className="mb-6 text-2xl font-bold text-primary">Now Playing</h2>

        <Suspense fallback={<ScreeningsPageSkeleton />}>
          <ScreeningsPageContent searchParams={resolvedSearchParams} />
        </Suspense>
      </div>
    </main>
  );
}
