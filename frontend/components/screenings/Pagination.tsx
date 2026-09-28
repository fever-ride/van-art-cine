'use client';

import Link from 'next/link';
import { getButtonClassName } from '@/components/ui/buttonStyles';
import { getPageWindow } from '@/lib/pagination';

type PaginationProps = {
  readonly className?: string;
  readonly currentPage: number;
  readonly totalPages: number;
  /** Builds the real, crawlable URL for a given page — used as every
   * link's `href`, so page source and JS-disabled requests both work. */
  readonly buildPageHref: (page: number) => string;
  /** Runs the app's own scroll-to-table-top + transition logic. Only
   * called for a plain left click; a modified click (new tab, etc.)
   * is left to the browser and the real `href` above. */
  readonly onNavigate: (page: number) => void;
  /** True while a navigation is already in flight — pauses further clicks
   * without hiding the (still real, crawlable) links themselves. */
  readonly disabled?: boolean;
};

const numberButtonClass = (active: boolean) =>
  getButtonClassName({ variant: active ? 'primary' : 'outline', size: 'icon' });

function isPlainLeftClick(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export default function Pagination({
  className = '',
  currentPage,
  totalPages,
  buildPageHref,
  onNavigate,
  disabled,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, page: number) => {
    if (disabled || !isPlainLeftClick(e)) return;
    e.preventDefault();
    onNavigate(page);
  };

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <nav
      aria-label="Screenings pagination"
      className={`mt-6 flex w-full items-center justify-center gap-2 ${className}`}
    >
      {canPrev ? (
        <Link
          href={buildPageHref(currentPage - 1)}
          scroll={false}
          onClick={(e) => handleClick(e, currentPage - 1)}
          aria-label="Previous page"
          aria-disabled={disabled || undefined}
          className={getButtonClassName({ variant: 'ghost', size: 'icon' })}
        >
          <PrevIcon />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className={getButtonClassName({
            variant: 'ghost',
            size: 'icon',
            className: 'opacity-40 cursor-not-allowed',
          })}
        >
          <PrevIcon />
        </span>
      )}

      {/* Numbered pages: room for a first/last-plus-window layout only
          exists at md+. Below that they'd either overflow past the Prev/
          Next arrows or need squeezing small enough to be unusable, so
          collapse to "Page X of Y" text instead (kept out of the a11y
          tree via `hidden`/`md:hidden`, matching whichever is displayed).
          The links themselves stay in every page's HTML regardless of
          viewport — hiding via CSS doesn't stop a crawler from finding
          them, only visually collapses them on a narrow screen. */}
      <div className="hidden items-center gap-2 md:flex">
        {getPageWindow(currentPage, totalPages, 2).map((token, i) =>
          token === 'ellipsis' ? (
            <span
              key={`ellipsis-${i}`}
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center text-sm text-muted"
            >
              …
            </span>
          ) : token === currentPage ? (
            <span
              key={token}
              aria-current="page"
              className={numberButtonClass(true)}
            >
              {token}
            </span>
          ) : (
            <Link
              key={token}
              href={buildPageHref(token)}
              scroll={false}
              onClick={(e) => handleClick(e, token)}
              aria-label={`Go to page ${token}`}
              aria-disabled={disabled || undefined}
              className={numberButtonClass(false)}
            >
              {token}
            </Link>
          )
        )}
      </div>

      <span className="text-sm text-muted md:hidden">
        Page {currentPage} of {totalPages}
      </span>

      {canNext ? (
        <Link
          href={buildPageHref(currentPage + 1)}
          scroll={false}
          onClick={(e) => handleClick(e, currentPage + 1)}
          aria-label="Next page"
          aria-disabled={disabled || undefined}
          className={getButtonClassName({ variant: 'ghost', size: 'icon' })}
        >
          <NextIcon />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className={getButtonClassName({
            variant: 'ghost',
            size: 'icon',
            className: 'opacity-40 cursor-not-allowed',
          })}
        >
          <NextIcon />
        </span>
      )}
    </nav>
  );
}

function PrevIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <path
        d="M11.5 4.5 7 10l4.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <path
        d="M8.5 4.5 13 10l-4.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
