'use client';

import { useState, useEffect, useLayoutEffect, useRef, useTransition } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { Screening } from '@/app/lib/screenings';
import { useScreeningsUI } from '@/lib/hooks/useScreeningsUI';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { apiListCinemas, type Cinema } from '@/app/lib/cinemas';
import Filters from '@/components/screenings/Filters';
import ResultsTable from '@/components/screenings/ResultsTable';
import Pagination from '@/components/screenings/Pagination';

/** Matches `scroll-mt-28` on #screenings-results */
const TABLE_SCROLL_MARGIN = 112;

type Props = {
  initialItems: Screening[];
  initialTotal: number;
  initialError: string | null;
};

/**
 * Client side interactivity for the homepage screening list: filters,
 * pagination, watchlist toggles, and the scroll position handling around a
 * filter or page change.
 *
 * `initialItems`/`initialError` come from the server rendered fetch in
 * `frontend/app/page.tsx`, for whatever filter and page combination the
 * current URL represents. This component renders them directly. It does
 * not run its own fetch: navigating to a new URL (from `setUI` or
 * `goToPage` below) re-runs the Server Component, which sends this
 * component fresh props for the new URL, the same way any other Next.js
 * App Router navigation works. See docs/specs/url-driven-filters.md.
 */
export default function ScreeningsPageClient({
  initialItems,
  initialTotal,
  initialError,
}: Props) {
  const screeningsUI = useScreeningsUI();
  const watchlist = useWatchlist();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [paginationPending, startPaginationTransition] = useTransition();

  const [cinemaOptions, setCinemaOptions] = useState<Cinema[]>([]);
  const [cinemaLoading, setCinemaLoading] = useState(false);

  const rawPage = searchParams.get('page');
  let page = Number(rawPage);
  if (!Number.isFinite(page) || page < 1) page = 1;

  const items = initialItems;
  const totalPages = Math.max(1, Math.ceil(initialTotal / screeningsUI.ui.limit));
  const isPending = screeningsUI.isPending || paginationPending;

  const tableRef = useRef<HTMLDivElement>(null);
  const contentRowRef = useRef<HTMLDivElement>(null);
  const [rowMinHeight, setRowMinHeight] = useState<number | undefined>();

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

  // Also used as Pagination's buildPageHref, so every page link in the
  // rendered HTML is the real URL a crawler or a JS-disabled request would
  // need — not just an onClick handler. See BACKLOG.md SEO-12.
  const buildPageUrl = (targetPage: number) => {
    const p = Math.max(1, targetPage);
    const params = new URLSearchParams(searchParams.toString());
    if (p === 1) {
      params.delete('page');
    } else {
      params.set('page', String(p));
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const goToPage = (nextPage: number) => {
    const url = buildPageUrl(nextPage);
    const currentQs = searchParams.toString();
    const currentUrl = currentQs ? `${pathname}?${currentQs}` : pathname;

    if (url === currentUrl) return;

    startPaginationTransition(() => {
      router.push(url, { scroll: false });
    });
  };

  const handlePageChange = (nextPage: number) => {
    scrollToTableTop();
    requestAnimationFrame(() => goToPage(nextPage));
  };

  // Passed to Filters as onBeforeCommit: called right before any filter or
  // search commit (Apply, Reset, or a debounced search firing), while the
  // DOM still reflects the old, pre-commit result count. Pagination is
  // deliberately excluded — goToPage/handlePageChange use scrollToTableTop
  // instead and never set rowMinHeight in the first place.
  const handleBeforeFilterCommit = () => {
    captureRowHeight();
  };

  // Runs once new items arrive for a page that had its row height captured
  // by handleBeforeFilterCommit. Must wait for screeningsUI.isPending to
  // clear: setRowMinHeight (normal priority) commits before the setUI
  // navigation it precedes resolves (low priority, inside startTransition),
  // and rowMinHeight is itself a dependency here — without the isPending
  // guard, that first commit re-triggers this effect immediately and
  // resets rowMinHeight/settles scroll against the still-old items, before
  // the new (possibly much shorter) result set has actually arrived.
  useLayoutEffect(() => {
    if (rowMinHeight === undefined) return;
    if (screeningsUI.isPending) return;

    setRowMinHeight(undefined);
    settleScrollAfterRefetch();
  }, [items, page, rowMinHeight, screeningsUI.isPending]);

  // Fetch all cinemas once. Ordering (pinned high-traffic venues first, then
  // alphabetical) and hiding cinemas with no upcoming screenings are both
  // handled server-side in listCinemas() — trust that order as-is instead of
  // re-sorting/filtering here, or we'd just undo it.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCinemaLoading(true);
      try {
        const cinemaItems = await apiListCinemas();
        if (cancelled) return;

        setCinemaOptions(cinemaItems);
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

  return (
    <div
      ref={contentRowRef}
      className="flex flex-col gap-4 md:flex-row [overflow-anchor:none]"
      style={rowMinHeight ? { minHeight: rowMinHeight } : undefined}
    >
      <aside
        className="self-start md:w-[275px] md:flex-shrink-0 md:sticky md:top-30
                   md:max-h-[calc(100vh_-_7.5rem_-_1rem)] md:overflow-y-auto"
      >
        <Filters
          ui={screeningsUI.ui}
          setUI={screeningsUI.setUI}
          onBeforeCommit={handleBeforeFilterCommit}
          loading={cinemaLoading}
          pending={screeningsUI.isPending}
          cinemaOptions={cinemaOptions}
        />
      </aside>

      <section className="flex-1 [overflow-anchor:none]">
        {initialError && (
          <p className="mt-3 text-sm text-muted">Error: {initialError}</p>
        )}
        <div
          ref={tableRef}
          id="screenings-results"
          className="scroll-mt-28 overflow-x-auto rounded-card border border-border bg-surface"
          style={{ scrollMarginTop: '7rem', overflowAnchor: 'none' }}
        >
          {items.length > 0 ? (
            <ResultsTable
              items={items}
              savedIds={watchlist.savedIds}
              onSavedChange={watchlist.handleSavedChange}
            />
          ) : (
            !initialError && (
              <p className="px-4 py-8 text-sm text-muted">No screenings found.</p>
            )
          )}
        </div>

        <Pagination
          className="mt-4"
          currentPage={page}
          totalPages={totalPages}
          buildPageHref={buildPageUrl}
          onNavigate={handlePageChange}
          disabled={isPending}
        />
      </section>
    </div>
  );
}
