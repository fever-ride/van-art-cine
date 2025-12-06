'use client';

import { useState, useEffect, Suspense } from 'react';
import { Noto_Sans } from 'next/font/google';

import Filters from '@/components/screenings/Filters';
import ResultsTable from '@/components/screenings/ResultsTable';
import Pagination from '@/components/screenings/Pagination';
import { useScreeningsUI } from '@/lib/hooks/useScreeningsUI';
import { useScreeningsData } from '@/lib/hooks/useScreeningsData';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { apiListCinemas, type Cinema } from '@/app/lib/cinemas';

const noto = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
});

function ScreeningsPageInner() {
  const screeningsUI = useScreeningsUI();
  const watchlist    = useWatchlist();

  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [cinemaOptions, setCinemaOptions] = useState<Cinema[]>([]);
  const [cinemaLoading, setCinemaLoading] = useState(false);

  const rawPage = searchParams.get('page');
  let page = Number(rawPage);
  if (!Number.isFinite(page) || page < 1) page = 1;

  const limit  = screeningsUI.ui.limit;
  const offset = (page - 1) * limit;

  const screeningsData = useScreeningsData(screeningsUI.ui, offset);

  const goToPage = (nextPage: number) => {
    if (nextPage < 1) nextPage = 1;

    const params = new URLSearchParams(searchParams.toString());
    if (nextPage === 1) {
      params.delete('page');
    } else {
      params.set('page', String(nextPage));
    }

    const qs  = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;

    router.push(url);
  };

  const handleApplyFilters = () => {
    goToPage(1);
    screeningsData.reload(0);
  };

  // Fetch all cinemas once, sort alphabetically
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCinemaLoading(true);
      try {
        const items = await apiListCinemas();
        if (cancelled) return;

        const sorted = [...items]
          // Hide the parent "VIFF Centre" location which has no own screenings
          .filter((c) => c.name !== 'VIFF Centre')
          .sort((a, b) => a.name.localeCompare(b.name));

        setCinemaOptions(sorted);
      } catch (e) {
        console.warn('Failed to load cinemas', e);
      } finally {
        if (!cancelled) setCinemaLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const disablePrev = page <= 1 || screeningsData.loading;
  const disableNext = !screeningsData.hasMore || screeningsData.loading;

  return (
    <main className={`${noto.className} mx-auto max-w-[1400px] px-4 py-8`}>
      {/* ---------------------- #1 Hero (only title) ---------------------- */}
      <section className="mb-3">
        <h1 className="text-2xl font-bold text-primary md:text-[24px]">
          Vancouver’s indie screenings, all in one place.
        </h1>
      </section>

      {/* ---------------------- #2 Quick facts ---------------------- */}
      <section className="mb-8">
        <div className="flex flex-col gap-1 border-l-2 border-gray-200 pl-3 text-sm text-muted">
          <span>Plan your week by starting your own watchlist!</span>
          <span>Films outside mainstream releases</span>
        </div>
      </section>

      {/* --------- Divider + “Now Playing” title --------- */}
      <div className="h-px w-full bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100" />
      <h2 className="mb-4 text-[18px] font-semibold text-primary">Now Playing</h2>

      {/* ---------------------- Two-column layout ---------------------- */}
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Left sidebar */}
        <aside className="self-start md:w-[275px] md:flex-shrink-0 md:sticky md:top-30">
          <Filters
            ui={screeningsUI.ui}
            setUI={screeningsUI.setUI}
            onApply={handleApplyFilters}
            loading={screeningsData.loading || cinemaLoading}
            cinemaOptions={cinemaOptions}
          />
        </aside>

        {/* Right content */}
        <section className="flex-1">
          {screeningsData.loading && (
            <p className="mt-3 text-sm text-muted">Loading…</p>
          )}
          {screeningsData.error && (
            <p className="mt-3 text-sm text-muted">Error: {screeningsData.error}</p>
          )}
          {!screeningsData.loading &&
            screeningsData.items.length === 0 &&
            !screeningsData.error && (
              <p className="mt-3 text-sm text-muted">No screenings found.</p>
            )}

          {screeningsData.items.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
              <ResultsTable
                items={screeningsData.items}
                savedIds={watchlist.savedIds}
                onSavedChange={watchlist.handleSavedChange}
              />
            </div>
          )}

          <Pagination
            className="mt-4"
            onPrev={() => {
              if (!disablePrev) goToPage(page - 1);
            }}
            onNext={() => {
              if (!disableNext) goToPage(page + 1);
            }}
            disablePrev={disablePrev}
            disableNext={disableNext}
          />
        </section>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className={`${noto.className} mx-auto max-w-[1400px] px-4 py-8`}>
          <p className="text-sm text-muted">Loading…</p>
        </main>
      }
    >
      <ScreeningsPageInner />
    </Suspense>
  );
}