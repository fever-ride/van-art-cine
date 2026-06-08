# Troubleshooting Notes

## Production film page failed after data load

### Symptom

Film detail pages failed in production with a Server Components render error.

Browser console showed:

```text
An error occurred in the Server Components render.
```

Vercel logs showed:

```text
TypeError: fetch failed
cause: Error: certificate has expired
code: CERT_HAS_EXPIRED
```

### Cause

The SSL certificate for `api.cinephilesvan.com` had expired.

The data load was not the root cause. The API data was valid, but the Next.js server render could not fetch the backend API because Node.js rejected the expired certificate.

### Fix

On the EC2 instance:

```bash
sudo certbot certificates
sudo certbot renew
sudo systemctl reload nginx
```

Verify:

```bash
curl -Iv https://api.cinephilesvan.com/api/films/862
```

### Prevention

Enable the certbot renewal timer:

```bash
sudo systemctl enable --now certbot-renew.timer
```

Test renewal:

```bash
sudo certbot renew --dry-run
```

Recommended follow-up:

- Add SSL expiry monitoring for `https://api.cinephilesvan.com/readyz`.
- Confirm nginx reloads after renewal.
- Check Vercel logs when production Server Components hide the real error.

---

## Homepage scroll jumps (search, Apply, pagination, date picker)

### Symptom timeline

1. **Search debounce** — typing in the left filter search jumped the page to the top every ~350ms.
2. **Pagination** — Prev/Next did not scroll to the screening table (only a small jiggle), or scrolled unreliably.
3. **Apply / date filter** — after selecting a date and clicking Apply, scroll jumped to the **bottom** or **middle** intermittently.
4. **Date picker UX** — native `<input type="date">` showed next-month days in gray (looked disabled) and felt awkward to navigate on desktop; custom picker was clipped by the filter `Card` (`overflow-hidden`).

### Desired behavior

| Action | Scroll |
|--------|--------|
| Search (debounced) | Stay at current scroll position |
| Apply, Reset, date pick | Stay at current scroll position |
| Prev / Next pagination | Scroll to top of screening table (`#screenings-results`) |

### Root causes (stacked)

1. **`router.push()` default scroll** — App Router uses `scroll: true` by default; filter flows called `goToPage(1)` → page jumped to top.
2. **Layout height changes** — refetch changed row count; table wrapper was briefly unmounted; browser adjusted scroll.
3. **Pagination vs route timing** — `scrollIntoView({ smooth })` was cancelled by the re-render from `router.push()`.
4. **Loading UI above table** — “Loading…” line / overlay shifted layout and flashed the table header.
5. **Debounced search called `onApply()`** — unnecessary navigations + conflicting scroll logic.
6. **Apply button focus** — Apply sits at the bottom of the filter card; focus-after-click can scroll it into view.
7. **Post-filter page shrink** — user at mid-page scrollY; fewer results shorten the document; browser clamps or re-anchors scroll (felt like jump to bottom/middle). A generic “restore scrollY after load” fix was **not reliable** for Apply.
8. **Filter `Card` `overflow-hidden`** — absolutely positioned custom calendar was clipped (calendar unusable).
9. **Native date picker** — trailing days from the next month render gray in the current month grid (cosmetic; looks like disabled dates).

### Investigation path (what we tried)

| Attempt | Result |
|---------|--------|
| `router.push(url, { scroll: false })` + skip unchanged URL | Fixed search jumping to top |
| `useEffect` on `page` + `scrollIntoView` on `<section>` | Wrong target / too early |
| Scroll after `loading === false` | Jiggle; layout still shifting |
| Immediate `scrollIntoView` on pagination + loading overlay | Pagination OK; Apply/header flashed |
| Global `scrollSnapshot` on every filter change | Typing “乱跳”; Apply still jumped |
| `overflow-anchor: none` + blur Apply | Helped; Apply jump persisted |
| **Apply-only scroll lock** (current) | Stable |

### Final fix

**Files:**

- `frontend/app/page.tsx`
- `frontend/components/screenings/Filters.tsx`
- `frontend/components/screenings/Pagination.tsx`
- `frontend/components/screenings/ScreeningDateInput.tsx`
- `frontend/app/lib/formatDate.ts` (`todayYmdInDisplayTimezone`)

**Routing / search**

- `goToPage()` uses `router.push(url, { scroll: false })` and returns early when URL unchanged.
- Debounced search only calls `setUI({ q })` — **not** `onApply()`.
- Separate `useEffect` on `filterKey` resets to page 1 when filters change and `page > 1` (skips initial mount for `?page=2` deep links).

**Pagination**

- `handlePageChange` → `scrollToTableTop()` then `requestAnimationFrame(() => goToPage())`.
- `tableRef` on `#screenings-results`, `scrollIntoView({ behavior: 'auto', block: 'start' })`, `scroll-margin-top: 7rem`.
- Pagination buttons `blur()` on click.

**Apply / Reset scroll lock** (important)

Only explicit Apply/Reset use this — not debounced search.

1. `onApply()` runs **before** `setUI()` so `window.scrollY` is captured first.
2. `applyScrollLockYRef` stores that Y.
3. While `screeningsData.loading`, a `scroll` listener forces Y back if the browser moves.
4. After load, `useLayoutEffect` restores `min(savedY, maxScroll)` before paint, then clears the lock.

**Layout stability**

- Table wrapper always rendered; empty state shown inside.
- No loading overlay on the table (old rows stay until new data arrives).
- `[overflow-anchor: none]` on results layout/table to reduce browser scroll anchoring.

**Date picker**

- Replaced native `<input type="date">` with `ScreeningDateInput` (`react-day-picker`).
- `min` = today in `America/Vancouver` (`todayYmdInDisplayTimezone`).
- Popover rendered via **portal to `document.body`** (`position: fixed`) so filter `Card` `overflow-hidden` does not clip it.
- `showOutsideDays={false}` — no gray “next month filler” days in the grid.

### Key code references (current)

```ts
// Filters.tsx — search: no onApply; Apply: lock scroll before commit
debounceRef.current = setTimeout(() => {
  setUI({ q: value });
}, 350);

// Apply button
onClick={(e) => {
  onApply();        // page.tsx captures window.scrollY
  commitApply();    // setUI(...)
  e.currentTarget.blur();
}}

// page.tsx — Apply scroll lock
const handleApplyFilters = () => {
  applyScrollLockYRef.current = window.scrollY;
  if (page > 1) goToPage(1);
};

// Guard during loading
useEffect(() => {
  if (applyScrollLockYRef.current === null || !screeningsData.loading) return;
  const guard = () => {
    const y = applyScrollLockYRef.current;
    if (y !== null && Math.abs(window.scrollY - y) > 2) {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    }
  };
  guard();
  window.addEventListener('scroll', guard, { passive: false });
  return () => window.removeEventListener('scroll', guard);
}, [screeningsData.loading]);

// Restore after DOM updates
useLayoutEffect(() => {
  const y = applyScrollLockYRef.current;
  if (y === null || screeningsData.loading) return;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo({ top: Math.min(y, maxScroll), left: 0, behavior: 'instant' });
  applyScrollLockYRef.current = null;
}, [screeningsData.loading, screeningsData.items]);

// Pagination
const handlePageChange = (nextPage: number) => {
  scrollToTableTop();
  requestAnimationFrame(() => goToPage(nextPage));
};
```

### Prevention / lessons

- **Do not use one scroll strategy for search, Apply, and pagination.**
- **`router.push` on homepage** → always `{ scroll: false }` unless top navigation is intentional.
- **Apply scroll** needs a **lock during loading**, not only a post-load restore; layout changes mid-fetch and focus scroll can still move the page.
- **Capture scroll before `setUI`**, not after button `blur()`.
- **Portaled popovers** for anything inside `Card` / `overflow-hidden`.
- **Native date inputs** on desktop: confusing month grid + OS-specific UX; custom picker is optional but document portal + `min` rules.
- **Past dates in DB** (`is_active` not auto-cleared) are a separate backend issue; frontend blocks past dates via `min` on the picker (see product discussion in chat; pipeline fix still TBD).

### Quick verify

1. Scroll to Now Playing, type in search → stays put; results update in place.
2. Select a date → Apply (and Reset) → stays put; no jump to bottom/middle.
3. Scroll to bottom, click Next/Prev → lands on screening table top.
4. Date picker opens fully (not clipped); cannot pick dates before today (Vancouver).
5. Open `/?page=2`, refresh → still page 2.
