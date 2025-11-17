'use client';

import { useMemo } from 'react';
import { Noto_Sans } from 'next/font/google';

import Filters from '@/components/screenings/Filters';
import ResultsTable from '@/components/screenings/ResultsTable';
import Pagination from '@/components/screenings/Pagination';
import { useScreeningsUI } from '@/lib/hooks/useScreeningsUI';
import { useScreeningsData } from '@/lib/hooks/useScreeningsData';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const noto = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
});

export default function Home() {
  const screeningsUI = useScreeningsUI();
  const watchlist    = useWatchlist();

  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

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

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;

    router.push(url);
  };

  const handleApplyFilters = () => {
    goToPage(1);
    screeningsData.reload(0);
  };

  // derive cinema options from current results
  const cinemaOptions = useMemo(() => {
    const m = new Map<number, string>();
    screeningsData.items.forEach(s => {
      if (typeof s.cinema_id === 'number' && s.cinema_name) {
        m.set(s.cinema_id, s.cinema_name);
      }
    });
    return Array.from(m, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [screeningsData.items]);

  const cinemaCount = cinemaOptions.length;
  
  const disablePrev = page <= 1 || screeningsData.loading;
  const disableNext = !screeningsData.hasMore || screeningsData.loading;


  return (
    <main className={`${noto.className} mx-auto max-w-[1400px] px-4 py-8`}>
      {/* ---------------------- #1 Hero (only title) ---------------------- */}
      <section className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-primary md:text-[28px]">
          Vancouver’s indie screenings, all in one place.
        </h1>
      </section>

      {/* ---------------------- #2 Quick facts strip ---------------------- */}
      <section className="mb-8">
        <div className="flex flex-wrap gap-2">
          {/*<span className="inline-flex items-center rounded-full bg-[#FFF8E7] px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
            Updated daily
          </span>*/}
          <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-medium text-accent ring-1 ring-gray-200">
            {cinemaCount > 0 ? `${cinemaCount} cinemas covered` : 'Multiple cinemas covered'}
          </span>
          <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-medium text-accent ring-1 ring-gray-200">
            Plan your week by starting your own watchlist!
          </span>
          <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-medium text-accent ring-1 ring-gray-200">
            Films outside mainstream releases
          </span>
        </div>
      </section>

      {/* --------- #4 Divider + “Now Playing” title--------- */}
      <div className="h-px w-full bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100" />
      <h2 className="mb-4 text-[18px] font-semibold text-primary">Now Playing</h2>

      {/* ---------------------- Two-column layout ---------------------- */}
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Left sidebar */}
        <aside className="md:w-[275px] md:flex-shrink-0 md:sticky md:top-30 self-start">
          <Filters
            ui={screeningsUI.ui}
            setUI={screeningsUI.setUI}
            onApply={handleApplyFilters}
            loading={screeningsData.loading}
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