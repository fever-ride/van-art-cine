/** `/` — server-rendered. Fetches the current, filtered screening list on
 * the server so the default and any filtered view are both present in the
 * first HTML response, not only after client side JavaScript runs. See
 * docs/specs/url-driven-filters.md and docs/specs/homepage-ssr.md. */

import { Suspense } from 'react';
import { Noto_Sans } from 'next/font/google';
import { getScreeningsServerSide, buildSearchParams } from '@/app/lib/screenings';
import {
  parseUIStateFromSearchParams,
  buildScreeningsQuery,
  isInvalidDateRange,
} from '@/lib/hooks/screeningsUrlState';
import ScreeningsPageClient from '@/components/screenings/ScreeningsPageClient';

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
    <ScreeningsPageClient
      initialItems={data.items}
      initialTotal={data.total}
      initialError={null}
    />
  );
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

  return (
    <main className={`${noto.className}`}>
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
