/** `/whats-on/top-rated` — server-rendered hub page: the highest IMDb-rated
 * films with an upcoming screening, split into "this week" (a poster
 * carousel highlight) and "this month" (the full ranked list). See
 * BACKLOG.md's Top Rated hub page item and docs/seo-hub-pages.md for the
 * data investigation behind this (screening.tags turned out to come almost
 * entirely from one venue, so it was dropped in favor of this direction). */

import type { Metadata } from 'next';
import { getScreeningsServerSide, buildSearchParams } from '@/app/lib/screenings';
import { ItemListStructuredData } from '@/app/lib/structuredData';
import { selectTopRated } from '@/lib/topRated';
import PosterCarousel from '@/components/whats-on/PosterCarousel';
import PosterGrid from '@/components/whats-on/PosterGrid';

const SITE_URL = 'https://www.cinephilesvan.com';
const PAGE_URL = `${SITE_URL}/whats-on/top-rated`;
const TITLE = 'Top Rated Screenings in Vancouver';
const DESCRIPTION =
  "The highest IMDb-rated films currently playing at Vancouver's independent cinemas.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

/** The backend caps `limit` at 200 (well under the ~500 total upcoming
 * screenings), so this can't just fetch "everything" and rank client side.
 * Sorting by rating descending server side first means every screening
 * belonging to a TOP_RATED_MIN_RATING-or-above film lands within this cap
 * regardless of catalog size — only the relatively few high-rated films'
 * rows need to fit, not the whole catalog — where sorting by time first
 * and hoping the highest-rated ones happened to fall in the first 200 rows
 * chronologically would not have that guarantee. */
const POOL_LIMIT = 200;

export default async function TopRatedPage() {
  const data = await getScreeningsServerSide(
    buildSearchParams({ limit: POOL_LIMIT, sort: 'imdb', order: 'desc' }).toString()
  );
  const { week, month } = selectTopRated(data.items);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-12">
      <ItemListStructuredData films={month} />

      <h1 className="text-3xl font-bold text-primary md:text-4xl">{TITLE}</h1>
      <p className="mt-2 max-w-2xl text-muted">{DESCRIPTION}</p>

      {week.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold text-primary">This Week</h2>
          <PosterCarousel films={week} />
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-primary">This Month</h2>
        {month.length > 0 ? (
          <PosterGrid films={month} />
        ) : (
          <p className="text-sm text-muted">
            Nothing currently playing meets the rating bar — check back soon.
          </p>
        )}
      </section>
    </main>
  );
}
