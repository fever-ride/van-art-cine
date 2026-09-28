/**
 * Pure helper for numbered pagination UI: given the current page and total
 * page count, decide which page numbers to render and where to collapse a
 * run of pages into a single ellipsis. Kept free of React so it can be unit
 * tested directly. See docs/specs (BACKLOG.md SEO-12) and
 * frontend/components/screenings/Pagination.tsx, its only caller.
 */

export type PageToken = number | 'ellipsis';

/**
 * @param current Current page, 1-indexed.
 * @param total Total number of pages.
 * @param siblingCount How many page numbers to show on each side of `current`.
 * @returns Always starts with 1 and ends with `total` (when `total > 1`).
 *   Adds an `'ellipsis'` token instead of listing every page in a collapsed
 *   run, never two ellipses in a row, never an ellipsis standing in for a
 *   single skipped page (that page is just shown instead).
 */
export function getPageWindow(
  current: number,
  total: number,
  siblingCount = 1
): PageToken[] {
  if (total <= 1) return total === 1 ? [1] : [];

  // 1, last, current, siblingCount on each side, plus room for both ellipses.
  const totalNumbersShown = siblingCount * 2 + 5;
  if (total <= totalNumbersShown) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 2);
  const rightSibling = Math.min(current + siblingCount, total - 1);

  // Only collapse a run of 2+ pages into an ellipsis. A single skipped page
  // (e.g. window starts at 3, so only page 2 is skipped) is just shown —
  // an ellipsis standing in for one page reads oddly ("1 … 3" instead of
  // "1 2 3") and saves no space.
  const showLeftEllipsis = leftSibling > 3;
  const showRightEllipsis = rightSibling < total - 2;

  const pages: PageToken[] = [1];

  if (showLeftEllipsis) {
    pages.push('ellipsis');
  } else {
    for (let p = 2; p < leftSibling; p++) pages.push(p);
  }

  for (let p = leftSibling; p <= rightSibling; p++) pages.push(p);

  if (showRightEllipsis) {
    pages.push('ellipsis');
  } else {
    for (let p = rightSibling + 1; p < total; p++) pages.push(p);
  }

  pages.push(total);

  return pages;
}
