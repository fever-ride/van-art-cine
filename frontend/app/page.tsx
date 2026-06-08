'use client';

import { useState, useEffect, useLayoutEffect, useRef, useMemo, Suspense } from 'react';
import type { UIState } from '@/lib/hooks/useScreeningsUI';
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

/** Matches `scroll-mt-28` on #screenings-results */
const TABLE_SCROLL_MARGIN = 112;

function buildFilterKey(ui: UIState) {
  return JSON.stringify({
    q: ui.q,
    cinemaIds: ui.cinemaIds,
    filmId: ui.filmId,
    date: ui.date,
    from: ui.from,
    to: ui.to,
    sort: ui.sort,
    order: ui.order,
    mode: ui.mode,
  });
}

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
  const tableRef = useRef<HTMLDivElement>(null);
  const contentRowRef = useRef<HTMLDivElement>(null);
  const [rowMinHeight, setRowMinHeight] = useState<number | undefined>();
  const filterKey = useMemo(
    () => buildFilterKey(screeningsUI.ui),
    [screeningsUI.ui]
  );
  const prevFilterKeyRef = useRef(filterKey);
  const hasInitializedFiltersRef = useRef(false);

  const captureRowHeight = () => {
    const el = contentRowRef.current;
    if (el && el.offsetHeight > 0) {
      setRowMinHeight(el.offsetHeight);
    }
  };

  const settleScrollAfterRefetch = () => {
    const table = tableRef.current;
    if (!table) return;

    const tableTop = table.getBoundingClientRect().top + window.scrollY;
    const newTableHeight = table.offsetHeight;
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const scrollY = window.scrollY;

    // Scrolled into the old table's lower rows — those rows are gone after refetch.
    if (scrollY > tableTop + newTableHeight) {
      window.scrollTo({
        top: Math.min(Math.max(0, tableTop - TABLE_SCROLL_MARGIN), maxScroll),
        left: 0,
        behavior: 'instant',
      });
      return;
    }

    if (scrollY > maxScroll) {
      window.scrollTo({ top: maxScroll, left: 0, behavior: 'instant' });
    }
  };

  const scrollToTableTop = () => {
    const el = tableRef.current;
    if (!el) return;

    el.scrollIntoView({ behavior: 'auto', block: 'start' });
  };

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
    const currentQs = searchParams.toString();
    const currentUrl = currentQs ? `${pathname}?${currentQs}` : pathname;

    if (url === currentUrl) return;

    router.push(url, { scroll: false });
  };

  const handlePageChange = (nextPage: number) => {
    scrollToTableTop();
    requestAnimationFrame(() => goToPage(nextPage));
  };

  const handleApplyFilters = () => {
    captureRowHeight();
    if (page > 1) goToPage(1);
  };

  useEffect(() => {
    if (!hasInitializedFiltersRef.current) {
      hasInitializedFiltersRef.current = true;
      prevFilterKeyRef.current = filterKey;
      return;
    }

    if (filterKey === prevFilterKeyRef.current) return;

    prevFilterKeyRef.current = filterKey;
    captureRowHeight();

    if (page > 1) goToPage(1);
  }, [filterKey, page]);

  useLayoutEffect(() => {
    if (screeningsData.loading || rowMinHeight === undefined) return;

    setRowMinHeight(undefined);
    settleScrollAfterRefetch();
  }, [screeningsData.loading, screeningsData.items, rowMinHeight]);

  // Fetch all cinemas once, sort alphabetically
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCinemaLoading(true);
      try {
        const items = await apiListCinemas();
        if (cancelled) return;

        const sorted = [...items]
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

        <div
          ref={contentRowRef}
          className="flex flex-col gap-4 md:flex-row [overflow-anchor:none]"
          style={rowMinHeight ? { minHeight: rowMinHeight } : undefined}
        >
        <aside className="self-start md:w-[275px] md:flex-shrink-0 md:sticky md:top-30">
          <Filters
            ui={screeningsUI.ui}
            setUI={screeningsUI.setUI}
            onApply={handleApplyFilters}
            loading={cinemaLoading}
            cinemaOptions={cinemaOptions}
          />
        </aside>

        <section className="flex-1 [overflow-anchor:none]">
          {screeningsData.error && (
            <p className="mt-3 text-sm text-muted">Error: {screeningsData.error}</p>
          )}
          <div
            ref={tableRef}
            id="screenings-results"
            className="scroll-mt-28 overflow-x-auto rounded-card border border-border bg-surface"
            style={{ scrollMarginTop: '7rem', overflowAnchor: 'none' }}
          >
            {screeningsData.items.length > 0 ? (
              <ResultsTable
                items={screeningsData.items}
                savedIds={watchlist.savedIds}
                onSavedChange={watchlist.handleSavedChange}
              />
            ) : (
              !screeningsData.loading &&
              !screeningsData.error && (
                <p className="px-4 py-8 text-sm text-muted">No screenings found.</p>
              )
            )}
          </div>

          <Pagination
            className="mt-4"
            onPrev={() => {
              if (!disablePrev) handlePageChange(page - 1);
            }}
            onNext={() => {
              if (!disableNext) handlePageChange(page + 1);
            }}
            disablePrev={disablePrev}
            disableNext={disableNext}
          />
        </section>
        </div>
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
